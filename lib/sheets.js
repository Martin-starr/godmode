import { db } from "./db";

// Hourly Google Sheets -> dash.readings import (source='sheets').
// Config is discovered from the environment so the Vercel project's existing
// variables keep working regardless of their exact names.
export function sheetsConfig() {
  const env = process.env;
  const id =
    env.DASH_SHEETS_ID ||
    env.GOOGLE_SHEETS_ID ||
    env.GOOGLE_SHEET_ID ||
    env.SHEETS_ID ||
    env.SHEET_ID ||
    env.SPREADSHEET_ID ||
    env.GOOGLE_SPREADSHEET_ID ||
    null;
  const key =
    env.DASH_SHEETS_API_KEY ||
    env.GOOGLE_SHEETS_API_KEY ||
    env.GOOGLE_API_KEY ||
    env.SHEETS_API_KEY ||
    Object.values(env).find((v) => typeof v === "string" && /^AIza[0-9A-Za-z_-]{30,}$/.test(v)) ||
    null;
  const range = env.DASH_SHEETS_RANGE || env.GOOGLE_SHEETS_RANGE || env.SHEETS_RANGE || "A:H";
  if (!id || !key) return null;
  return { id, key, range };
}

function norm(s) {
  return String(s || "").toLowerCase().replace(/[^a-zæøå0-9]/g, "");
}

function parseDate(v) {
  const s = String(v || "").trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})/);
  if (m) {
    const y = m[3].length === 2 ? "20" + m[3] : m[3];
    return `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  return null;
}

function parseNum(v) {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

// Imports new rows; skips rows already present (same system+date from sheets)
// and rows that don't validate. Never deletes anything.
export async function syncSheets() {
  const cfg = sheetsConfig();
  if (!cfg) return { imported: 0, skipped: 0, disabled: true };
  const t0 = Date.now();
  const step = (msg) => console.log("[sheets-sync +" + (Date.now() - t0) + "ms] " + msg);
  step("start · sheet-id len " + cfg.id.length + " · range " + cfg.range);
  const url =
    "https://sheets.googleapis.com/v4/spreadsheets/" +
    encodeURIComponent(cfg.id) +
    "/values/" +
    encodeURIComponent(cfg.range) +
    "?key=" +
    encodeURIComponent(cfg.key);
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  step("fetch → " + res.status);
  if (!res.ok) throw new Error("Sheets-API svarte " + res.status);
  const data = await res.json();
  const rows = data.values || [];
  step("rows " + rows.length);
  if (rows.length < 2) return { imported: 0, skipped: 0 };

  const header = rows[0].map(norm);
  const col = (...names) => header.findIndex((h) => names.some((n) => h.includes(n)));
  const iDate = col("dato", "date");
  const iSystem = col("system", "benk");
  const iTemp = col("temp");
  const iPh = col("ph");
  const iFukt = col("fukt", "moist");
  const iFor = col("fôr", "for", "feed");
  const iNotat = col("notat", "note", "kommentar");
  const iWho = col("hvem", "loggetav", "bruker", "who");
  if (iDate < 0 || iSystem < 0 || iTemp < 0) throw new Error("Fant ikke kolonnene i arket.");

  const sql = db();
  const systems = (await sql`select id from dash.systems`).map((r) => r.id);
  const existing = new Set(
    (await sql`select system, date from dash.readings where source = 'sheets'`).map((r) => r.system + "|" + r.date)
  );

  let skipped = 0;
  const batch = [];
  for (const r of rows.slice(1)) {
    const date = parseDate(r[iDate]);
    const system = String(r[iSystem] || "").trim();
    const temp = parseNum(r[iTemp]);
    const ph = iPh >= 0 ? parseNum(r[iPh]) : null;
    const fukt = iFukt >= 0 ? parseNum(r[iFukt]) : null;
    if (!date || !system || temp === null || !systems.includes(system) || existing.has(system + "|" + date)) {
      skipped++;
      continue;
    }
    batch.push({
      system,
      date,
      temp,
      ph: ph ?? 0,
      fukt: fukt ?? 0,
      for_l: (iFor >= 0 ? parseNum(r[iFor]) : 0) ?? 0,
      notat: iNotat >= 0 ? String(r[iNotat] || "") : "",
      avvik: 0,
      logged_by: iWho >= 0 ? String(r[iWho] || "") : "Sheets",
      source: "sheets",
    });
    existing.add(system + "|" + date);
    // One lambda run inserts at most 500 rows; the next hourly run continues.
    if (batch.length >= 500) {
      skipped += rows.length; // approximation only used for the status message
      break;
    }
  }
  step("validated · " + batch.length + " new, " + skipped + " skipped");
  if (batch.length) {
    await sql`insert into dash.readings ${sql(batch)}`;
  }
  await sql`insert into dash.meta (key, value) values ('last_sync', ${new Date().toISOString()})
    on conflict (key) do update set value = excluded.value`;
  step("done");
  return { imported: batch.length, skipped };
}
