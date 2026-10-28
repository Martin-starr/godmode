import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  parseRealtime, parseHistory, discoverGroups, classifyGroup, classifyMetric,
  toCelsius, toUsCm, toHpa, num, chunkRange, osloStamp, osloToUtc, dayStart, dayEnd,
  callApi, EcowittError, DEFAULT_HISTORY_GROUPS,
} from "../lib/ecowitt.js";

const realtime = JSON.parse(readFileSync(new URL("./fixtures/ecowitt-realtime.json", import.meta.url)));
const history = JSON.parse(readFileSync(new URL("./fixtures/ecowitt-history.json", import.meta.url)));

test("num: dash placeholders are missing, never zero", () => {
  assert.equal(num("-"), null);
  assert.equal(num(""), null);
  assert.equal(num(undefined), null);
  assert.equal(num("21,3"), 21.3);
  assert.equal(num("0"), 0);
});

test("units: Fahrenheit, mS/cm and inHg are converted; metric units pass through", () => {
  assert.equal(toCelsius("70", "℉"), 21.11);
  assert.equal(toCelsius("70", "°F"), 21.11);
  assert.equal(toCelsius("21.3", "℃"), 21.3);
  assert.equal(toUsCm("1.24", "mS/cm"), 1240);
  assert.equal(toUsCm("1240", "µS/cm"), 1240);
  assert.equal(toUsCm("1240", "uS/cm"), 1240);
  assert.equal(toHpa("29.77", "inHg"), 1008.1);
  assert.equal(toHpa("1008.2", "hPa"), 1008.2);
});

test("classifyGroup: soil channels in every spelling, indoor, pressure; others null", () => {
  assert.deepEqual(classifyGroup("soil_ch1"), { kind: "soil", channel: 1 });
  assert.deepEqual(classifyGroup("soil_ec_ch7"), { kind: "soil", channel: 7 });
  assert.deepEqual(classifyGroup("SOIL_CH12"), { kind: "soil", channel: 12 });
  assert.deepEqual(classifyGroup("indoor"), { kind: "indoor" });
  assert.deepEqual(classifyGroup("pressure"), { kind: "pressure" });
  assert.equal(classifyGroup("temp_ch1"), null);
  assert.equal(classifyGroup("outdoor"), null);
});

test("classifyMetric: meaning over spelling, diagnostics ignored", () => {
  assert.equal(classifyMetric("soil", "soilmoisture"), "soil_moisture_vol_pct");
  assert.equal(classifyMetric("soil", "soil_ec_hum"), "soil_moisture_vol_pct");
  assert.equal(classifyMetric("soil", "temperature"), "soil_temp_c");
  assert.equal(classifyMetric("soil", "soil_ec_temp"), "soil_temp_c");
  assert.equal(classifyMetric("soil", "ec"), "ec_us_cm");
  assert.equal(classifyMetric("soil", "conductivity"), "ec_us_cm");
  assert.equal(classifyMetric("soil", "soil_ec"), "ec_us_cm");
  assert.equal(classifyMetric("soil", "soilmoisture_ad"), null);
  assert.equal(classifyMetric("soil", "soil_ec_ad"), null);
  assert.equal(classifyMetric("soil", "battery"), null);
  assert.equal(classifyMetric("indoor", "humidity"), "indoor_rh_pct");
  assert.equal(classifyMetric("pressure", "relative"), "pressure_hpa");
});

test("parseRealtime: one row per channel, room on channel 0, empty channel dropped, raw kept", () => {
  const { readings, unknownGroups, groups } = parseRealtime(realtime);
  assert.deepEqual(readings.map((r) => r.channel), [0, 1, 2, 3, 4, 5, 6]);
  assert.deepEqual(unknownGroups, []); // outdoor + battery are known-and-ignored
  assert.ok(groups.includes("soil_ch7"));

  const room = readings[0];
  assert.equal(room.indoor_temp_c, 18.4);
  assert.equal(room.indoor_rh_pct, 71);
  assert.equal(room.pressure_hpa, 1008.2); // relative wins over absolute
  assert.equal(room.soil_temp_c, null);
  assert.equal(room.ts.toISOString(), "2026-10-28T08:30:00.000Z");
  assert.ok(room.raw.indoor && room.raw.pressure);

  const ch1 = readings[1];
  assert.equal(ch1.soil_temp_c, 21.3);
  assert.equal(ch1.soil_moisture_vol_pct, 41);
  assert.equal(ch1.ec_us_cm, 1240);
  assert.equal(ch1.indoor_temp_c, null);
  assert.equal(ch1.ts.toISOString(), "2026-10-28T08:29:00.000Z"); // 1793176140 rounded to the minute
  assert.equal(ch1.raw.soil_ch1.ec.value, "1240");

  const ch3 = readings[3];
  assert.equal(ch3.ts.toISOString(), "2026-10-28T08:28:00.000Z");
});

test("parseRealtime: WH52 under a different group/metric spelling still lands on its channel", () => {
  const payload = { code: 0, time: "1793176200", data: {
    soil_ec_ch3: {
      soil_ec_hum: { time: "1793176200", unit: "%", value: "47" },
      soil_ec_temp: { time: "1793176200", unit: "℉", value: "68" },
      soil_ec: { time: "1793176200", unit: "mS/cm", value: "1.3" },
      soil_ec_ad: { time: "1793176200", unit: "", value: "512" },
      name: "Prekompost Temp & Moisture",
    },
    temp_ch1: { temperature: { time: "1793176200", unit: "℃", value: "12" } },
  } };
  const { readings, unknownGroups, channelNames } = parseRealtime(payload);
  assert.equal(readings.length, 1);
  assert.equal(readings[0].channel, 3);
  assert.equal(readings[0].soil_moisture_vol_pct, 47);
  assert.equal(readings[0].soil_temp_c, 20);
  assert.equal(readings[0].ec_us_cm, 1300);
  assert.deepEqual(unknownGroups, ["temp_ch1"]);
  assert.equal(channelNames[3], "Prekompost Temp & Moisture");
});

test("parseRealtime: a payload without data gives no readings and does not throw", () => {
  assert.deepEqual(parseRealtime({ code: 0, msg: "success" }).readings, []);
  assert.deepEqual(parseRealtime(null).readings, []);
});

test("parseHistory: rows keyed by (ts, channel), dashes skipped, absolute pressure only as fallback", () => {
  const { readings, unknownGroups } = parseHistory(history);
  assert.deepEqual(unknownGroups, []);
  const key = (r) => r.ts.toISOString() + "|" + r.channel;
  const byKey = new Map(readings.map((r) => [key(r), r]));

  assert.equal(readings.length, 3 + 3 + 2); // room ×3, ch1 ×3, ch2 ×2 (middle sample all "-")
  const room0 = byKey.get("2026-10-28T08:00:00.000Z|0");
  assert.equal(room0.indoor_temp_c, 18.1);
  assert.equal(room0.indoor_rh_pct, 72);
  assert.equal(room0.pressure_hpa, 1008.0);
  const room2 = byKey.get("2026-10-28T09:00:00.000Z|0");
  assert.equal(room2.pressure_hpa, 1008.1); // no relative at 09:00 → absolute
  const c1 = byKey.get("2026-10-28T08:30:00.000Z|1");
  assert.equal(c1.soil_temp_c, 21.3);
  assert.equal(c1.ec_us_cm, 1240);
  assert.equal(c1.raw["soil_ch1.ec"].unit, "µS/cm");
  assert.equal(byKey.has("2026-10-28T08:30:00.000Z|2"), false);
  // sorted by time then channel
  const times = readings.map((r) => r.ts.getTime());
  assert.deepEqual(times, [...times].sort((a, b) => a - b));
});

test("discoverGroups: station groups union the defaults, irrelevant groups excluded", () => {
  const groups = discoverGroups(realtime);
  for (const g of DEFAULT_HISTORY_GROUPS) assert.ok(groups.includes(g));
  assert.ok(!groups.includes("outdoor"));
  assert.ok(!groups.includes("battery"));
  assert.ok(discoverGroups({ data: { soil_ec_ch9: {} } }).includes("soil_ec_ch9"));
});

test("time: Oslo stamps and day bounds across DST", () => {
  assert.equal(osloStamp(new Date("2026-10-28T08:30:00Z")), "2026-10-28 09:30:00"); // CET
  assert.equal(osloStamp(new Date("2026-07-01T08:30:00Z")), "2026-07-01 10:30:00"); // CEST
  assert.equal(dayStart("2026-10-28").toISOString(), "2026-10-27T23:00:00.000Z");
  assert.equal(dayEnd("2026-10-28").toISOString(), "2026-10-28T22:59:59.000Z");
  assert.equal(dayStart("2026-07-01").toISOString(), "2026-06-30T22:00:00.000Z");
  assert.equal(osloToUtc(2026, 3, 29, 3, 0, 0).toISOString(), "2026-03-29T01:00:00.000Z"); // first hour after spring-forward
});

test("chunkRange: 30min history is cut into contiguous windows of at most seven days", () => {
  const from = dayStart("2026-09-15"), to = dayEnd("2026-10-28");
  const chunks = chunkRange(from, to, "30min");
  assert.equal(chunks.length, 7);
  assert.equal(chunks[0].start.getTime(), from.getTime());
  assert.equal(chunks.at(-1).end.getTime(), to.getTime());
  for (let i = 0; i < chunks.length; i++) {
    const c = chunks[i];
    assert.ok(c.end.getTime() - c.start.getTime() <= 7 * 86400 * 1000 - 1000);
    if (i) assert.equal(c.start.getTime(), chunks[i - 1].end.getTime() + 1000);
  }
  assert.equal(chunkRange(from, from, "30min").length, 1);
  assert.equal(chunkRange(dayStart("2026-10-01"), dayEnd("2026-10-03"), "5min").length, 3);
});

test("callApi: retries once on 5xx, surfaces API error codes without retrying", async () => {
  let calls = 0;
  const flaky = async () => {
    calls++;
    if (calls === 1) return new Response("boom", { status: 502 });
    return new Response(JSON.stringify({ code: 0, msg: "success", data: {} }), { status: 200 });
  };
  const ok = await callApi("/device/real_time", { mac: "x" }, { fetchImpl: flaky, retryDelayMs: 1 });
  assert.equal(ok.code, 0);
  assert.equal(calls, 2);

  let bad = 0;
  const invalid = async () => { bad++; return new Response(JSON.stringify({ code: 40010, msg: "Illegal Application_Key Parameter" }), { status: 200 }); };
  await assert.rejects(() => callApi("/device/real_time", {}, { fetchImpl: invalid, retryDelayMs: 1 }), (e) => e instanceof EcowittError && e.code === 40010 && !e.retryable);
  assert.equal(bad, 1);

  let seen;
  const capture = async (url) => { seen = url; return new Response(JSON.stringify({ code: 0, data: {} }), { status: 200 }); };
  await callApi("/device/history", { start_date: "2026-10-28 00:00:00", cycle_type: "30min", call_back: "indoor,soil_ch1" }, { fetchImpl: capture });
  assert.equal(seen.searchParams.get("start_date"), "2026-10-28 00:00:00");
  assert.equal(seen.searchParams.get("call_back"), "indoor,soil_ch1");
  assert.ok(seen.href.startsWith("https://api.ecowitt.net/api/v3/device/history?"));
});
