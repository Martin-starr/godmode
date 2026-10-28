// Ecowitt cloud API v3 — client and parser for the GW1200 gateway with
// 7 × WH52 soil sensors (CH1–CH7) plus the gateway's own indoor climate.
//
// Docs: https://doc.ecowitt.net/web/#/apiv3en
//   GET /api/v3/device/real_time   latest value per metric
//   GET /api/v3/device/history     time series, keyed by unix seconds
//
// Response shape (documented for WH51; the WH52 adds temperature and EC):
//   { code: 0, msg: "success", time: "1760000000",
//     data: { indoor:   { temperature: {time, unit:"℃", value:"18.4"}, humidity: {…} },
//             pressure: { relative: {…unit:"hPa"…}, absolute: {…} },
//             soil_ch1: { soilmoisture: {…unit:"%"…}, temperature: {…}, ec: {…} }, … } }
// History replaces {time, value} with {unit, list: {"1760000000": "18.4", …}}.
//
// The WH52 is newer than the public docs, so the exact sub-field names are
// not guaranteed. Everything below classifies by *meaning* (a key containing
// "moist"/"hum" is moisture, "temp" is temperature, "ec"/"conduct" is EC),
// stores the group's raw object on every row, and reports groups it could
// not place so the parser can be adapted from one logged response.

export const API_BASE = "https://api.ecowitt.net/api/v3";

// History resolution → maximum window the API accepts per call (days).
export const HISTORY_CHUNK_DAYS = { "5min": 1, "30min": 7, "4hour": 30, "1day": 365 };

// Groups asked for in history calls when discovery is not possible. The API
// simply omits groups the station does not have.
export const DEFAULT_HISTORY_GROUPS = [
  "indoor", "pressure",
  "soil_ch1", "soil_ch2", "soil_ch3", "soil_ch4", "soil_ch5", "soil_ch6", "soil_ch7", "soil_ch8",
];

// Groups the station reports that are not ours and are expected: silence them
// in the "unknown group" report.
const IGNORED_GROUPS = new Set([
  "outdoor", "wind", "rainfall", "rainfall_piezo", "solar_and_uvi", "lightning",
  "battery", "indoor_co2", "co2_aqi_combo", "pm25_aqi_combo", "pm10_aqi_combo",
  "t_rh_aqi_combo", "water_leak", "pm25_ch1", "pm25_ch2", "pm25_ch3", "pm25_ch4",
  "camera", "sub_device_list",
]);

export function config(env = process.env) {
  const applicationKey = String(env.ECOWITT_APPLICATION_KEY || "").trim();
  const apiKey = String(env.ECOWITT_API_KEY || "").trim();
  const mac = String(env.ECOWITT_MAC || "").trim().toUpperCase();
  return { applicationKey, apiKey, mac, configured: !!(applicationKey && apiKey && mac) };
}

export const NOT_CONFIGURED = "Ingen sensordata ennå — legg inn Ecowitt-nøkler i Vercel";

/* ------------------------------------------------------------------ */
/* Units                                                                */
/* ------------------------------------------------------------------ */

// "-" is the API's placeholder for a missing sample. Never a 0.
export function num(v) {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  if (s === "" || s === "-" || s === "--") return null;
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

const round = (n, d) => (n == null ? null : Math.round(n * 10 ** d) / 10 ** d);

// "℃" / "℉" are single code points; NFKD turns them into "°C" / "°F".
const unitText = (u) => String(u || "").normalize("NFKD").toLowerCase();

export function toCelsius(value, unit) {
  const n = num(value);
  if (n == null) return null;
  return round(/f/.test(unitText(unit)) ? ((n - 32) * 5) / 9 : n, 2);
}

export function toHpa(value, unit) {
  const n = num(value);
  if (n == null) return null;
  const u = unitText(unit);
  if (/inhg/.test(u)) return round(n * 33.8639, 1);
  if (/mmhg/.test(u)) return round(n * 1.33322, 1);
  return round(n, 1);
}

export function toUsCm(value, unit) {
  const n = num(value);
  if (n == null) return null;
  const u = unitText(unit);
  if (/ms\s*\/\s*cm/.test(u)) return round(n * 1000, 0);
  return round(n, 1);
}

export function toPct(value) {
  const n = num(value);
  return n == null ? null : round(n, 1);
}

/* ------------------------------------------------------------------ */
/* Classification                                                       */
/* ------------------------------------------------------------------ */

// soil_ch3, soil_ec_ch3, soilch3, soil_ch03 → { kind: "soil", channel: 3 }
const SOIL_GROUP = /^soil(?:_?ec)?_?ch_?(\d{1,2})$/i;

export function classifyGroup(key) {
  const k = String(key).toLowerCase();
  const m = k.match(SOIL_GROUP);
  if (m) return { kind: "soil", channel: Number(m[1]) };
  if (k === "indoor") return { kind: "indoor" };
  if (k === "pressure") return { kind: "pressure" };
  return null;
}

// Metric names inside a soil group. Diagnostics (AD raw counts, battery,
// signal) are deliberately not stored as measurements.
export function classifyMetric(kind, name) {
  const n = String(name).toLowerCase();
  if (/(^|_)ad$|batt|rssi|signal|voltage/.test(n)) return null;
  if (kind === "soil") {
    if (/temp/.test(n)) return "soil_temp_c";
    if (/moist|hum/.test(n)) return "soil_moisture_vol_pct";
    if (/^ec$|conduct|(^|_)ec(_|$)/.test(n)) return "ec_us_cm";
    return null;
  }
  if (kind === "indoor") {
    if (/temp/.test(n)) return "indoor_temp_c";
    if (/hum/.test(n)) return "indoor_rh_pct";
    return null;
  }
  if (kind === "pressure") {
    if (/rel/.test(n)) return "pressure_hpa";
    if (/abs/.test(n)) return "pressure_hpa:absolute"; // used only when no relative
    return null;
  }
  return null;
}

function convert(field, value, unit) {
  switch (field) {
    case "soil_temp_c":
    case "indoor_temp_c":
      return toCelsius(value, unit);
    case "soil_moisture_vol_pct":
    case "indoor_rh_pct":
      return toPct(value);
    case "ec_us_cm":
      return toUsCm(value, unit);
    case "pressure_hpa":
    case "pressure_hpa:absolute":
      return toHpa(value, unit);
    default:
      return null;
  }
}

const MEASUREMENTS = ["soil_temp_c", "soil_moisture_vol_pct", "ec_us_cm", "indoor_temp_c", "indoor_rh_pct", "pressure_hpa"];

export function emptyRow(ts, channel) {
  return {
    ts, channel,
    soil_temp_c: null, soil_moisture_vol_pct: null, ec_us_cm: null,
    indoor_temp_c: null, indoor_rh_pct: null, pressure_hpa: null,
    raw: null,
  };
}

export const hasMeasurement = (row) => MEASUREMENTS.some((f) => row[f] != null);

// Epoch seconds (string or number) → Date, rounded to the minute.
export function epochToMinute(sec) {
  const n = num(sec);
  if (n == null) return null;
  return new Date(Math.round(n / 60) * 60 * 1000);
}

/* ------------------------------------------------------------------ */
/* Parsers                                                              */
/* ------------------------------------------------------------------ */

// real_time → one row per channel (0 = GW1200 indoor + pressure), with the
// group's raw object kept on the row. Unknown groups are listed, not dropped.
export function parseRealtime(payload) {
  const data = (payload && payload.data) || {};
  const fallbackTs = epochToMinute(payload && payload.time) || epochToMinute(Date.now() / 1000);
  const rows = new Map();
  const unknownGroups = [];
  const channelNames = {};

  const rowFor = (channel) => {
    if (!rows.has(channel)) rows.set(channel, emptyRow(null, channel));
    return rows.get(channel);
  };

  for (const [groupKey, group] of Object.entries(data)) {
    const cls = classifyGroup(groupKey);
    if (!cls) {
      if (!IGNORED_GROUPS.has(groupKey.toLowerCase())) unknownGroups.push(groupKey);
      continue;
    }
    if (!group || typeof group !== "object") continue;
    const channel = cls.kind === "soil" ? cls.channel : 0;
    const row = rowFor(channel);
    row.raw = { ...(row.raw || {}), [groupKey]: group };
    if (cls.kind === "soil" && typeof group.name === "string" && group.name.trim()) {
      channelNames[channel] = group.name.trim();
    }
    let newest = null;
    let absolute = null;
    for (const [metricKey, metric] of Object.entries(group)) {
      if (!metric || typeof metric !== "object") continue;
      const field = classifyMetric(cls.kind, metricKey);
      if (!field) continue;
      const value = convert(field, metric.value, metric.unit);
      if (field === "pressure_hpa:absolute") { absolute = value; continue; }
      if (value == null) continue;
      row[field] = value;
      const t = epochToMinute(metric.time);
      if (t && (!newest || t > newest)) newest = t;
    }
    if (row.pressure_hpa == null && absolute != null) row.pressure_hpa = absolute;
    if (newest && (!row.ts || newest > row.ts)) row.ts = newest;
  }

  const readings = [...rows.values()]
    .filter(hasMeasurement)
    .map((r) => ({ ...r, ts: r.ts || fallbackTs }))
    .sort((a, b) => a.channel - b.channel);

  return { readings, unknownGroups, channelNames, groups: Object.keys(data) };
}

// history → rows keyed by (ts, channel). Each row's raw holds the per-metric
// {unit, value} it was built from, so a unit or naming surprise can be
// re-derived later without re-fetching.
export function parseHistory(payload) {
  const data = (payload && payload.data) || {};
  const rows = new Map();
  const unknownGroups = [];
  const absolutes = new Map(); // ts → absolute pressure, used only as fallback

  const rowFor = (ts, channel) => {
    const key = ts.getTime() + "|" + channel;
    if (!rows.has(key)) rows.set(key, emptyRow(ts, channel));
    return rows.get(key);
  };

  for (const [groupKey, group] of Object.entries(data)) {
    const cls = classifyGroup(groupKey);
    if (!cls) {
      if (!IGNORED_GROUPS.has(groupKey.toLowerCase())) unknownGroups.push(groupKey);
      continue;
    }
    if (!group || typeof group !== "object") continue;
    const channel = cls.kind === "soil" ? cls.channel : 0;
    for (const [metricKey, metric] of Object.entries(group)) {
      if (!metric || typeof metric !== "object" || !metric.list || typeof metric.list !== "object") continue;
      const field = classifyMetric(cls.kind, metricKey);
      if (!field) continue;
      for (const [sec, value] of Object.entries(metric.list)) {
        const ts = epochToMinute(sec);
        if (!ts) continue;
        const v = convert(field, value, metric.unit);
        if (v == null) continue;
        if (field === "pressure_hpa:absolute") { absolutes.set(ts.getTime(), v); continue; }
        const row = rowFor(ts, channel);
        row[field] = v;
        row.raw = { ...(row.raw || {}), [groupKey + "." + metricKey]: { unit: metric.unit ?? null, value } };
      }
    }
  }
  for (const [t, v] of absolutes) {
    const row = rows.get(t + "|0");
    if (row && row.pressure_hpa == null) {
      row.pressure_hpa = v;
      row.raw = { ...(row.raw || {}), "pressure.absolute": { value: v } };
    }
  }

  const readings = [...rows.values()].filter(hasMeasurement).sort((a, b) => a.ts - b.ts || a.channel - b.channel);
  return { readings, unknownGroups, groups: Object.keys(data) };
}

// Which groups to request in history, learned from one real_time response.
export function discoverGroups(payload, fallback = DEFAULT_HISTORY_GROUPS) {
  const data = (payload && payload.data) || {};
  const found = Object.keys(data).filter((k) => classifyGroup(k));
  return [...new Set([...fallback, ...found])];
}

/* ------------------------------------------------------------------ */
/* Time: the API speaks device-local time (the station is on Jæren)     */
/* ------------------------------------------------------------------ */

import { OSLO, osloStamp, osloToUtc, dayStart, dayEnd, todayOslo, DATE_ONLY } from "./time.js";
export { OSLO, osloStamp, osloToUtc, dayStart, dayEnd, todayOslo, DATE_ONLY };

// Split [from, to] into windows the chosen resolution accepts.
export function chunkRange(from, to, cycleType = "30min") {
  const days = HISTORY_CHUNK_DAYS[cycleType] || 7;
  const step = days * 86400 * 1000;
  const out = [];
  let start = from.getTime();
  const end = to.getTime();
  while (start <= end) {
    const stop = Math.min(start + step - 1000, end);
    out.push({ start: new Date(start), end: new Date(stop) });
    start = stop + 1000;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* HTTP                                                                 */
/* ------------------------------------------------------------------ */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class EcowittError extends Error {
  constructor(message, { code = null, status = null, retryable = false } = {}) {
    super(message);
    this.name = "EcowittError";
    this.code = code;
    this.status = status;
    this.retryable = retryable;
  }
}

// One GET with a hard timeout; one retry on 429/5xx/network. The API is
// modest — callers space their calls out, this only absorbs a blip.
export async function callApi(path, params, { fetchImpl = globalThis.fetch, timeoutMs = 25000, retryDelayMs = 3000 } = {}) {
  const url = new URL(API_BASE + path);
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));

  let lastError;
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt) await sleep(retryDelayMs);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetchImpl(url, { signal: ctrl.signal, headers: { accept: "application/json" } });
      const text = await res.text();
      if (res.status === 429 || res.status >= 500) {
        lastError = new EcowittError("Ecowitt svarte " + res.status, { status: res.status, retryable: true });
        continue;
      }
      let body;
      try { body = JSON.parse(text); } catch { throw new EcowittError("Ecowitt svarte ikke med JSON (" + res.status + ")", { status: res.status }); }
      if (!res.ok) throw new EcowittError("Ecowitt svarte " + res.status + ": " + (body.msg || text.slice(0, 200)), { status: res.status, code: body.code });
      if (Number(body.code) !== 0) {
        throw new EcowittError("Ecowitt-feil " + body.code + ": " + (body.msg || "ukjent"), { code: Number(body.code), status: res.status });
      }
      return body;
    } catch (e) {
      if (e instanceof EcowittError && !e.retryable) throw e;
      lastError = e.name === "AbortError" ? new EcowittError("Ecowitt svarte ikke innen " + timeoutMs / 1000 + " s", { retryable: true }) : e;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError;
}

function baseParams(cfg) {
  return {
    application_key: cfg.applicationKey,
    api_key: cfg.apiKey,
    mac: cfg.mac,
    temp_unitid: 1,      // °C
    pressure_unitid: 3,  // hPa
  };
}

export async function fetchRealtime(cfg, opts = {}) {
  return callApi("/device/real_time", { ...baseParams(cfg), call_back: opts.callBack || "all" }, opts);
}

export async function fetchHistory(cfg, { start, end, cycleType = "30min", groups = DEFAULT_HISTORY_GROUPS }, opts = {}) {
  return callApi("/device/history", {
    ...baseParams(cfg),
    start_date: osloStamp(start),
    end_date: osloStamp(end),
    cycle_type: cycleType,
    call_back: groups.join(","),
  }, opts);
}

/* ------------------------------------------------------------------ */
/* Storage                                                              */
/* ------------------------------------------------------------------ */

const COLS = ["ts", "channel", "soil_temp_c", "soil_moisture_vol_pct", "ec_us_cm", "indoor_temp_c", "indoor_rh_pct", "pressure_hpa", "raw", "source"];

// mode "ignore": on conflict do nothing (backfill, idempotent)
// mode "update": on conflict overwrite (realtime: the newest raw wins)
export async function storeReadings(sql, readings, { source = "ecowitt", mode = "ignore", batch = 500 } = {}) {
  let count = 0;
  for (let i = 0; i < readings.length; i += batch) {
    const rows = readings.slice(i, i + batch).map((r) => ({
      ts: r.ts, channel: r.channel,
      soil_temp_c: r.soil_temp_c, soil_moisture_vol_pct: r.soil_moisture_vol_pct, ec_us_cm: r.ec_us_cm,
      indoor_temp_c: r.indoor_temp_c, indoor_rh_pct: r.indoor_rh_pct, pressure_hpa: r.pressure_hpa,
      // postgres.js serialises plain objects as JSON; a pre-stringified value
      // would land as a JSON *string* inside the jsonb column.
      raw: r.raw == null ? null : r.raw,
      source,
    }));
    if (!rows.length) continue;
    const res = mode === "update"
      ? await sql`insert into public.sensor_readings ${sql(rows, ...COLS)}
          on conflict (ts, channel) do update set
            soil_temp_c = excluded.soil_temp_c, soil_moisture_vol_pct = excluded.soil_moisture_vol_pct,
            ec_us_cm = excluded.ec_us_cm, indoor_temp_c = excluded.indoor_temp_c,
            indoor_rh_pct = excluded.indoor_rh_pct, pressure_hpa = excluded.pressure_hpa,
            raw = excluded.raw, source = excluded.source`
      : await sql`insert into public.sensor_readings ${sql(rows, ...COLS)}
          on conflict (ts, channel) do nothing`;
    count += res.count || 0;
  }
  return count;
}

// Newest row per channel plus the channel map — what Anlegg paints.
export async function latestPerChannel(sql) {
  return sql`select distinct on (channel)
      channel, ts, soil_temp_c, soil_moisture_vol_pct, ec_us_cm,
      indoor_temp_c, indoor_rh_pct, pressure_hpa, source
    from public.sensor_readings
    order by channel, ts desc`;
}
