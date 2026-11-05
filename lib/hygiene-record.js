// One logger record evaluated for the §19 pages: the Hygienisering page,
// the Brief and the public status page all show the same card from this.
import { evaluate, MAX_GAP_MIN } from "./hygiene.js";

// Chart resolution: about this many points per channel, whatever the span.
const TARGET_POINTS = 600;

export async function hygieneTargets(sql) {
  const t = (await sql`select min, max from dash.targets where metric = 'hygiene'`)[0];
  return { minTemp: t ? Number(t.min) : 70, minMinutes: t ? Number(t.max) : 60 };
}

export async function evaluateImport(sql, imp, minTemp, minMinutes) {
  const rows = await sql`select extract(epoch from ts) * 1000 as ts, ch, temp, excluded
    from dash.hygiene_readings where import_id = ${imp.id} order by ts, ch`;
  const readings = rows.map((r) => ({ ts: Number(r.ts), ch: Number(r.ch), temp: r.temp == null ? null : Number(r.temp), excluded: r.excluded || null }));
  const { channels, pass, together, excluded, spans, screened } = evaluate(readings, minTemp, minMinutes);

  // Series for the chart, bucketed so a week of minute data is a few
  // hundred points per channel. A bucket shows the LOWEST valid reading in
  // it, because the question the chart answers is "did it hold": a dip the
  // verdict counted as a break must not be averaged away. A bucket where a
  // channel has nothing valid, or a hole longer than MAX_GAP_MIN, is null,
  // a gap in the line.
  const chs = channels.map((c) => c.ch);
  let t0 = Infinity;
  let t1 = -Infinity;
  for (const r of screened) { if (r.ts < t0) t0 = r.ts; if (r.ts > t1) t1 = r.ts; }
  const bucketMinutes = screened.length ? Math.max(1, Math.ceil((t1 - t0) / 60000 / TARGET_POINTS)) : 1;
  const bucketMs = bucketMinutes * 60000;
  const buckets = new Map();
  const prevTs = {};
  for (const r of [...screened].sort((a, b) => a.ts - b.ts)) {
    const k = Math.floor(r.ts / bucketMs) * bucketMs;
    if (!buckets.has(k)) buckets.set(k, { min: {}, broken: {} });
    const b = buckets.get(k);
    if (!(r.ch in b.min)) b.min[r.ch] = null;
    if (r.reason || !Number.isFinite(r.temp)) continue;
    if (prevTs[r.ch] !== undefined && r.ts - prevTs[r.ch] > MAX_GAP_MIN * 60000) b.broken[r.ch] = true;
    prevTs[r.ch] = r.ts;
    b.min[r.ch] = b.min[r.ch] === null ? r.temp : Math.min(b.min[r.ch], r.temp);
  }
  const series = [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([t, b]) => ({ t, temps: chs.map((c) => (b.broken[c] || b.min[c] == null ? null : Math.round(b.min[c] * 10) / 10)) }));

  return {
    ...imp,
    analysed: true,
    from: screened.length ? t0 : null,
    to: screened.length ? t1 : null,
    channels,
    pass,
    together,
    excluded,
    spans: spans.map((s) => ({ ch: s.ch, from: s.from, to: s.to, count: s.count, min: s.min, max: s.max, reasons: s.reasons })),
    bucketMinutes,
    series,
  };
}

// The newest record, evaluated, or null.
export async function newestRecord(sql) {
  const imports = await sql`select id, filename, imported_at, imported_by, row_count, note
    from dash.hygiene_imports order by id desc limit 1`;
  const rules = await hygieneTargets(sql);
  if (!imports.length) return { rules, record: null };
  return { rules, record: await evaluateImport(sql, imports[0], rules.minTemp, rules.minMinutes) };
}
