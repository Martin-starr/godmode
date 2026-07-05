// Parser for temperature-logger exports (Center 374, 4 channels) plus the
// §19 evaluation used by the Hygienisering page.

// Accepts CSV/TSV/semicolon text. Finds a timestamp column and up to four
// numeric temperature columns, tolerant of varying headers and locales.
export function parseLoggerExport(text) {
  const lines = String(text).replace(/\r/g, "").split("\n").filter((l) => l.trim());
  if (lines.length < 2) throw new Error("Fant ingen datalinjer i filen.");

  const delims = ["\t", ";", ","];
  const delim = delims.map((d) => [d, (lines[0].match(new RegExp("\\" + d, "g")) || []).length])
    .sort((a, b) => b[1] - a[1])[0][0];

  const rows = lines.map((l) => l.split(delim).map((c) => c.trim().replace(/^"|"$/g, "")));

  const parseTs = (cells) => {
    // "dd.mm.yyyy hh:mm[:ss]" or "yyyy-mm-dd hh:mm[:ss]" — date and time may
    // live in one cell or in two adjacent cells.
    for (let i = 0; i < cells.length; i++) {
      const joined = [cells[i], cells[i] + " " + (cells[i + 1] || "")];
      for (const s of joined) {
        let m = s.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
        if (m) return Date.UTC(+m[3], +m[2] - 1, +m[1], +m[4], +m[5], +(m[6] || 0));
        m = s.match(/(\d{4})-(\d{2})-(\d{2})[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
        if (m) return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));
      }
    }
    return null;
  };

  const num = (s) => {
    const n = Number(String(s).replace(",", ".").replace(/[^0-9.\-]/g, ""));
    return Number.isFinite(n) && n > -50 && n < 150 && String(s).match(/\d/) ? n : null;
  };

  const points = [];
  for (const cells of rows) {
    const ts = parseTs(cells);
    if (!ts) continue;
    // Temperature candidates: numeric cells that are not part of the timestamp.
    const temps = [];
    for (const c of cells) {
      if (/[.:]\d{2}/.test(c) && /(\d{1,2}[.:]\d{2})/.test(c) && (c.includes(":") || /\d{1,2}\.\d{1,2}\.\d{4}/.test(c))) continue;
      const n = num(c);
      if (n !== null) temps.push(n);
    }
    if (!temps.length) continue;
    points.push({ ts, temps: temps.slice(0, 4) });
  }
  if (!points.length) throw new Error("Klarte ikke å tolke filen — eksporter som CSV fra Center 374-programmet.");
  points.sort((a, b) => a.ts - b.ts);
  return points;
}

// Longest contiguous run (minutes) at or above minTemp, per channel.
export function evaluate(readings, minTemp, minMinutes) {
  const byCh = new Map();
  for (const r of readings) {
    if (!byCh.has(r.ch)) byCh.set(r.ch, []);
    byCh.get(r.ch).push(r);
  }
  const channels = [];
  for (const [ch, rows] of [...byCh.entries()].sort((a, b) => a[0] - b[0])) {
    rows.sort((a, b) => a.ts - b.ts);
    let best = 0;
    let runStart = null;
    let prev = null;
    for (const r of rows) {
      if (r.temp >= minTemp) {
        if (runStart === null) runStart = r.ts;
        best = Math.max(best, (r.ts - runStart) / 60000);
      } else {
        runStart = null;
      }
      prev = r;
    }
    const maxMinutes = Math.round(best);
    channels.push({ ch, maxMinutes, pass: maxMinutes >= minMinutes });
  }
  return { channels, pass: channels.length > 0 && channels.every((c) => c.pass) };
}
