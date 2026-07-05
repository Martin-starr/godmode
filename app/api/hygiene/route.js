import { db } from "@/lib/db";
import { json, err, guarded } from "@/lib/http";
import { parseLoggerExport, evaluate } from "@/lib/hygiene";

export const runtime = "nodejs";
export const maxDuration = 25;

async function hygieneTargets(sql) {
  const t = (await sql`select min, max from dash.targets where metric = 'hygiene'`)[0];
  return { minTemp: t ? Number(t.min) : 70, minMinutes: t ? Number(t.max) : 60 };
}

async function latestPayload(sql) {
  const imports = await sql`select id, filename, imported_at, imported_by, row_count, note
    from dash.hygiene_imports order by id desc`;
  if (!imports.length) return { latest: null, imports: [] };
  const imp = imports[0];
  const rows = await sql`select extract(epoch from ts) * 1000 as ts, ch, temp
    from dash.hygiene_readings where import_id = ${imp.id} order by ts, ch`;
  const readings = rows.map((r) => ({ ts: Number(r.ts), ch: Number(r.ch), temp: Number(r.temp) }));
  const { minTemp, minMinutes } = await hygieneTargets(sql);
  const { channels, pass } = evaluate(readings, minTemp, minMinutes);

  // Series for the chart: one point per timestamp with temps indexed by channel.
  const chs = channels.map((c) => c.ch);
  const byTs = new Map();
  for (const r of readings) {
    if (!byTs.has(r.ts)) byTs.set(r.ts, {});
    byTs.get(r.ts)[r.ch] = r.temp;
  }
  const series = [...byTs.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([t, temps]) => ({ t, temps: chs.map((c) => (temps[c] !== undefined ? temps[c] : null)) }));

  return {
    latest: {
      id: imp.id,
      filename: imp.filename,
      from: series.length ? series[0].t : null,
      to: series.length ? series[series.length - 1].t : null,
      channels,
      pass,
      minTemp,
      minMinutes,
      series,
    },
    imports,
  };
}

export const GET = guarded(async () => {
  const sql = db();
  return json(await latestPayload(sql));
});

export const POST = guarded(
  async (req, ctx, user) => {
    const form = await req.formData();
    const file = form.get("file");
    if (!file || typeof file !== "object") return err("Ingen fil mottatt.");
    const text = Buffer.from(await file.arrayBuffer()).toString("utf8");
    let points;
    try {
      points = parseLoggerExport(text);
    } catch (e) {
      return err(e.message);
    }
    const sql = db();
    const imp = (await sql`insert into dash.hygiene_imports (filename, imported_by, row_count, note)
      values (${file.name}, ${user.name}, ${points.length}, '')
      returning id`)[0];
    for (const p of points) {
      for (let i = 0; i < p.temps.length; i++) {
        await sql`insert into dash.hygiene_readings (import_id, ts, ch, temp)
          values (${imp.id}, ${new Date(p.ts)}, ${i + 1}, ${p.temps[i]})`;
      }
    }
    return json({ ok: true, rows: points.length });
  },
  { edit: true }
);
