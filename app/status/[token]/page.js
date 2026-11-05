import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { statusPayload, chartChoice, chartData } from "@/lib/status";
import { RANGES, RANGE_LABEL } from "@/lib/curves";
import { validToken, noteVisit } from "@/lib/status-link";
import { osloStamp } from "@/lib/time";
import StatusTools from "../StatusTools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 25;

// ---- formatting ---------------------------------------------------------
const nb = (v, d = 1) => (v == null ? "–" : v.toFixed(d).replace(".", ","));
// Dates arrive as "YYYY-MM-DD" text or as Date objects / ISO instants; a
// text date is taken as is, an instant becomes its Oslo day. dd.mm.yy.
const dmy = (v) => {
  if (!v) return "–";
  const s = typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : osloStamp(new Date(v));
  return s.slice(8, 10) + "." + s.slice(5, 7) + "." + s.slice(2, 4);
};
const hm = (ms) => osloStamp(new Date(ms)).slice(11, 16);
const dm = (ms) => { const s = osloStamp(new Date(ms)); return s.slice(8, 10) + "." + s.slice(5, 7); };
const dmhm = (ms) => dm(ms) + " " + hm(ms);
const when = (v) => dm(new Date(v).getTime()) + " kl " + hm(new Date(v).getTime());
const stamp = (v) => dmy(v) + " kl " + hm(new Date(v).getTime());

const COLORS = ["#1C3A5C", "#B8993A", "#6B7544", "#A64B2A", "#5A6270", "#1C3A5C", "#B8993A", "#6B7544"];
const DASH = ["", "", "", "", "5 4", "5 4", "5 4", "5 4"];

// ---- one line chart for both uses --------------------------------------
// series: [{ name, color, dash, points: [[t, v] | [t, null]] }], a gap in a
// line wherever v is null or two points are further apart than gapMs. The
// drawing is an SVG stretched to the box; every label is HTML beside it,
// so the text keeps its size on a phone.
function LineChart({ series, from, to, band, line, base, gapMs, decimals = 0 }) {
  const h = 300;
  let lo = base ? base[0] : Infinity;
  let hi = base ? base[1] : -Infinity;
  for (const s of series) for (const [, v] of s.points) if (v != null) { if (v < lo) lo = v; if (v > hi) hi = v; }
  if (band) { lo = Math.min(lo, band[0]); hi = Math.max(hi, band[1]); }
  if (line != null) { lo = Math.min(lo, line); hi = Math.max(hi, line); }
  if (!Number.isFinite(lo)) { lo = 0; hi = 1; }
  // Whole degrees get a two-degree margin; pH keeps its tenths.
  const pad = decimals ? 0.2 : 2;
  lo = (decimals ? Math.floor(lo * 10) / 10 : Math.floor(lo)) - pad;
  hi = (decimals ? Math.ceil(hi * 10) / 10 : Math.ceil(hi)) + pad;
  // A bucket that straddles `from` starts a little before it; keep it inside.
  const x = (t) => Math.min(1000, Math.max(0, ((t - from) / Math.max(1, to - from)) * 1000));
  const y = (v) => h - ((v - lo) / (hi - lo)) * h;
  const ticks = [0, 1, 2, 3, 4].map((i) => lo + ((hi - lo) * i) / 4);
  const lines = [];
  series.forEach((s, i) => {
    const segs = [];
    let cur = null;
    let prev = null;
    for (const [t, v] of s.points) {
      if (v == null || (prev !== null && t - prev > gapMs)) cur = null;
      if (v != null) {
        if (!cur) { cur = []; segs.push(cur); }
        cur.push(x(t) + "," + y(v));
        prev = t;
      }
    }
    segs.forEach((seg, k) => {
      if (seg.length === 1) {
        const [cx, cy] = seg[0].split(",");
        lines.push(<circle key={i + "-" + k} cx={cx} cy={cy} r={2} fill={s.color} />);
      } else {
        lines.push(<polyline key={i + "-" + k} points={seg.join(" ")} fill="none" stroke={s.color} strokeWidth={1.7} strokeDasharray={s.dash || undefined} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />);
      }
    });
    const last = [...s.points].reverse().find((p) => p[1] != null);
    if (last) lines.push(<circle key={"e" + i} cx={x(last[0])} cy={y(last[1])} r={2.8} fill={s.color} />);
  });
  return (
    <div className="st-chart">
      <div className="st-ylab" aria-hidden="true">
        {ticks.map((v) => <span key={v} style={{ top: (y(v) / h) * 100 + "%" }}>{v.toFixed(decimals).replace(".", ",")}</span>)}
      </div>
      <svg viewBox={"0 0 1000 " + h} preserveAspectRatio="none" role="img">
        {ticks.map((v) => <line key={v} x1={0} x2={1000} y1={y(v)} y2={y(v)} stroke="rgba(28,58,92,0.10)" vectorEffect="non-scaling-stroke" />)}
        {band ? (
          <>
            <rect x={0} width={1000} y={y(band[1])} height={Math.max(0, y(band[0]) - y(band[1]))} fill="rgba(184,153,58,0.08)" />
            <line x1={0} x2={1000} y1={y(band[0])} y2={y(band[0])} stroke="#B8993A" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
            <line x1={0} x2={1000} y1={y(band[1])} y2={y(band[1])} stroke="#B8993A" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
          </>
        ) : null}
        {line != null ? <line x1={0} x2={1000} y1={y(line)} y2={y(line)} stroke="#B8993A" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" /> : null}
        {lines}
      </svg>
      <div className="st-xlab" aria-hidden="true"><span>{dmhm(from)}</span><span>{dmhm((from + to) / 2)}</span><span>{dmhm(to)}</span></div>
    </div>
  );
}

const Legend = ({ items, right }) => (
  <div className="st-legend">
    {items.map((it) => (
      <span key={it.name} className="st-lg"><span className="st-sw" style={{ background: it.color, opacity: it.dash ? 0.8 : 1 }} />{it.name}</span>
    ))}
    {right ? <span className="st-lgmeta">{right}</span> : null}
  </div>
);

export default async function StatusPage({ params, searchParams }) {
  const sql = db();
  const link = await validToken(sql, params.token);
  if (!link) notFound();
  const tv = searchParams && searchParams.tv === "1";
  // A visit is the first landing: not a wall screen reloading itself, not
  // a click on the chart's buttons.
  const landing = !(searchParams && (searchParams.range || searchParams.source || searchParams.metric));
  if (!tv && landing) await noteVisit(sql, params.token);
  const d = await statusPayload(sql);
  const choice = chartChoice(searchParams);
  const chart = await chartData(sql, choice, d.beds.map((b) => b.name));

  const t = d.targets;
  const rules = d.hygiene.rules;
  const hyg = d.hygiene.record;
  const bad = (v, tt) => v != null && tt && (v < tt.min || v > tt.max);
  // A bed with no sensor, no pH and no log in the window is not in use; it
  // is named once instead of filling both tables with dashes.
  const inUse = d.beds.filter((b) => b.channel != null || b.ph || b.logg.days > 0);
  const idle = d.beds.filter((b) => !inUse.includes(b));
  const withSensor = d.beds.filter((b) => b.channel != null);
  const live = withSensor.filter((b) => !b.stale && b.temp != null);
  const outside = live.filter((b) => bad(b.temp, t.temp)).length;
  const range = t.temp ? `${t.temp.min}–${t.temp.max} °C` : "";
  const headline = !withSensor.length
    ? "Ingen bed har sensor ennå."
    : !live.length
      ? "Ingen bed-sensor har rapportert på over to timer."
      : outside === 0
        ? `Alle ${live.length} bed med sensor innenfor ${range}.`
        : `${outside} av ${live.length} bed utenfor ${range}.`;

  // The chart's buttons are links: the page has no login and must print,
  // so nothing depends on a script. Each keeps the other two choices.
  const href = (patch) => {
    const q = { range: choice.range, source: choice.source, metric: choice.metric, ...patch };
    if (q.metric === "ph") q.source = "manuell";
    return `/status/${params.token}?range=${q.range}&source=${q.source}&metric=${q.metric}${tv ? "&tv=1" : ""}#graf`;
  };
  const Toggle = ({ items, on, patchKey }) => (
    <span className="st-toggle">
      {items.map(([key, label, off]) => (
        off
          ? <span key={key} className="st-tbtn off" title="pH måles bare manuelt">{label}</span>
          : <a key={key} className={"st-tbtn" + (on === key ? " on" : "")} href={href({ [patchKey]: key })}>{label}</a>
      ))}
    </span>
  );
  const sensor = choice.source === "sensor";
  const order = new Map(d.beds.map((b, i) => [b.name, i]));
  const curveSeries = chart.series
    .slice()
    .sort((a, b) => (order.get(a.name) ?? 99) - (order.get(b.name) ?? 99))
    .map((ser, i) => ({ name: ser.name, color: COLORS[i % 8], dash: DASH[i % 8], points: ser.points }));
  const vals = curveSeries.flatMap((ser) => ser.points.map((p) => p[1]));
  const unit = choice.metric === "temp" ? " °C" : choice.metric === "fukt" ? " %" : "";
  const fmtStat = (v) => (choice.metric === "ph" ? nb(v, 1) : nb(v, 0)) + unit;
  const stats = vals.length ? { min: fmtStat(Math.min(...vals)), max: fmtStat(Math.max(...vals)), avg: fmtStat(vals.reduce((a, b) => a + b, 0) / vals.length) } : null;
  const bucketLabel = chart.bucketMinutes === 60 ? "snitt per time" : chart.bucketMinutes === 360 ? "snitt per 6 timer" : sensor ? "snitt per døgn" : "én verdi per loggført dag";
  const bandFor = choice.metric === "temp" ? t.temp : choice.metric === "ph" ? t.ph : sensor ? null : t.fukt;
  const base = choice.metric === "temp" ? [15, 30] : choice.metric === "ph" ? [6.5, 8.5] : sensor ? null : [55, 90];
  const hygSeries = hyg ? hyg.channels.map((c, i) => ({ name: "Sonde " + c.ch, color: COLORS[i % 8], dash: i >= 3 ? "5 4" : "", points: hyg.series.map((p) => [p.t, p.temps[i]]) })) : [];
  const ruleText = `alle sonder som logger må holde ${rules.minTemp} °C i ${rules.minMinutes} min samtidig, og minst to`;
  const val = (b, v, unit, dec) => (b.channel == null ? "–" : b.stale ? "–" : nb(v, dec) + unit);

  return (
    <div className={"st" + (tv ? " tv" : "")}>
      <header className="st-head">
        <div>
          {/* eslint-disable-next-line @next/next/no-img-element -- static logo */}
          <img src="/logo-dark.png" alt="Verminord" width={130} height={60} />
          <div className="st-eyebrow">Driftsstatus · innsyn for {link.label}</div>
        </div>
        <div className="st-headmeta">
          <div>{stamp(d.generated_at)}</div>
          <div className="st-mut">{d.beds_last_ts ? "Siste måling fra bedene " + when(d.beds_last_ts) : "Ingen måling fra bedene ennå"}</div>
          <StatusTools tv={tv} />
        </div>
      </header>

      <h1 className="st-h1">{headline}</h1>
      <p className="st-sub">
        Tallene under kommer rett fra sensorene i bedene og fra driftsloggen, uten omskriving. Temperatur, fukt og EC leses av automatisk; pH måles for hånd.
        {d.room && !d.room.stale ? ` Rom: ${nb(d.room.temp)} °C · ${nb(d.room.rh, 0)} % RH.` : ""}
      </p>

      <section>
        <div className="st-sechead"><span className="st-eyebrow">Nå · per bed</span><span className="st-mut">{t.temp ? `mål ${range} · pH ${nb(t.ph && t.ph.min)}–${nb(t.ph && t.ph.max)}` : ""}</span></div>
        <table className="st-tbl st-now">
          <thead>
            <tr><th>Bed</th><th className="num">Temp</th><th className="num">Fukt (sensor)</th><th className="num ec">EC</th><th className="num">pH (manuell)</th><th className="rt">Siste måling</th></tr>
          </thead>
          <tbody>
            {inUse.map((b) => (
              <tr key={b.name} className={b.stale ? "stale" : ""}>
                <td><b>{b.name}</b></td>
                <td className={"num" + (!b.stale && bad(b.temp, t.temp) ? " warn" : "")}>{b.channel == null ? "ingen sensor" : val(b, b.temp, " °C", 1)}</td>
                <td className="num">{val(b, b.moisture, " %", 0)}</td>
                <td className="num ec">{val(b, b.ec, " µS/cm", 0)}</td>
                <td className={"num" + (b.ph && bad(b.ph.value, t.ph) ? " warn" : "")}>{b.ph ? nb(b.ph.value) + " · " + dmy(b.ph.date) : "ingen måling i perioden"}</td>
                <td className="rt">{b.channel == null ? "–" : b.stale ? (b.ts ? "stille siden " + when(b.ts) : "aldri") : when(b.ts)}</td>
              </tr>
            ))}
            {d.hygieneProbes.map((p) => (
              <tr key={"h" + p.channel} className={p.stale ? "stale" : ""}>
                <td><b>{p.name}</b> <span className="st-mut">hygienisering</span></td>
                <td className="num">{p.reading && !p.stale ? nb(p.reading.temp) + " °C" : "–"}</td>
                <td className="num">{p.reading && !p.stale ? nb(p.reading.moisture, 0) + " %" : "–"}</td>
                <td className="num ec">{p.reading && !p.stale ? nb(p.reading.ec, 0) + " µS/cm" : "–"}</td>
                <td className="num">–</td>
                <td className="rt">{p.reading ? (p.stale ? "stille siden " + when(p.reading.ts) : when(p.reading.ts)) : "aldri"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section id="graf">
        <div className="st-sechead st-wrap">
          <span className="st-eyebrow">{sensor ? "Sensorer" : "Produksjonslogger"} · {bucketLabel} · {RANGE_LABEL[choice.range]}</span>
          <Toggle items={RANGES.map((r) => [r, r])} on={choice.range} patchKey="range" />
        </div>
        <div className="st-sechead st-wrap">
          <span className="st-mut">
            {sensor && choice.metric === "fukt" ? "Sensorfukt er ukalibrert for kompost · følg trenden, ikke tallet" : bandFor ? `stiplet: mål ${nb(bandFor.min, choice.metric === "ph" ? 1 : 0)}–${nb(bandFor.max, choice.metric === "ph" ? 1 : 0)}${unit}` : ""}
          </span>
          <span className="st-wrap">
            <Toggle items={[["manuell", "Manuell"], ["sensor", "Sensor", choice.metric === "ph"]]} on={choice.source} patchKey="source" />
            <Toggle items={[["temp", "Temp"], ["ph", "pH"], ["fukt", "Fukt"]]} on={choice.metric} patchKey="metric" />
          </span>
        </div>
        {curveSeries.some((ser) => ser.points.length) ? (
          <>
            <LineChart series={curveSeries} from={chart.from} to={chart.to} band={bandFor ? [bandFor.min, bandFor.max] : null} base={base} gapMs={sensor ? Math.max(2 * 3600e3, 2 * chart.bucketMinutes * 60000) : 8 * 86400e3} decimals={choice.metric === "ph" ? 1 : 0} />
            <Legend items={curveSeries} right={stats ? `Min ${stats.min} · Snitt ${stats.avg} · Maks ${stats.max}` : ""} />
          </>
        ) : <p className="st-mut">{sensor ? "Ingen sensordata i perioden. Sensorene startet 15. september 2026." : "Ingen loggførte verdier i perioden."}</p>}
      </section>

      <section>
        <div className="st-sechead">
          <span className="st-eyebrow">Hygienisering §19 · siste loggerkjøring</span>
          <span className="st-mut">krav: {ruleText}</span>
        </div>
        {hyg ? (
          <div className="st-card">
            <div className="st-cardhead">
              <div>
                <div className="st-cardtitle">{dm(hyg.from)} – {dm(hyg.to)}.{String(osloStamp(new Date(hyg.to))).slice(2, 4)}</div>
                <div className="st-mut">{hyg.channels.length} sonder · alle samtidig ≥ {rules.minTemp} °C i {hyg.together.minutes} min{hyg.excluded ? ` · ${hyg.excluded} målinger satt til side` : ""}</div>
              </div>
              <span className={"st-tag " + (hyg.pass ? "navy" : "gold")}>{hyg.pass ? "Godkjent §19" : "Ikke godkjent"}</span>
            </div>
            <LineChart series={hygSeries} from={hyg.from} to={hyg.to} line={rules.minTemp} base={[10, 80]} gapMs={Math.max(5, 2 * hyg.bucketMinutes) * 60000} />
            <Legend items={hygSeries} right={`stiplet: krav ${rules.minTemp} °C · logg #${hyg.id} · ${hyg.row_count} punkter · importert ${dmy(hyg.imported_at)}`} />
          </div>
        ) : <p className="st-mut">Ingen loggerkjøring importert ennå.</p>}
      </section>

      <section>
        <div className="st-sechead"><span className="st-eyebrow">Loggdisiplin · {dmy(d.logg.from)} – {dmy(d.logg.to)}</span><span className="st-mut">{d.logg.working_days} arbeidsdager (man–lør), til og med i går</span></div>
        <table className="st-tbl">
          <thead><tr><th>Bed</th><th className="num">Dager loggført</th><th className="num">Mangler</th><th className="num">Fôret</th><th className="num">Avvik</th><th className="rt">Siste logg</th></tr></thead>
          <tbody>
            {inUse.map((b) => {
              const missing = Math.max(0, d.logg.working_days - b.logg.days);
              return (
                <tr key={b.name}>
                  <td><b>{b.name}</b></td>
                  <td className="num">{b.logg.days}</td>
                  <td className={"num" + (missing ? " warn" : "")}>{missing}</td>
                  <td className="num">{nb(b.logg.liters, 0)} L</td>
                  <td className={"num" + (b.logg.avvik ? " warn" : "")}>{b.logg.avvik}</td>
                  <td className="rt">{b.logg.last ? dmy(b.logg.last) : "ingen"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      {idle.length ? <p className="st-mut" style={{ marginTop: 12 }}>Uten sensor og uten logg i perioden: {idle.map((b) => b.name).join(", ")}.</p> : null}

      <section className="st-how">
        <div className="st-sechead"><span className="st-eyebrow">Slik leser du denne siden</span></div>
        <ul>
          <li><b>Automatisk</b> er temperatur, fukt og EC fra Ecowitt-sonder i hvert bed. Siden henter ferske verdier når den åpnes (høyst fem minutter gamle); historikken lagres hver halvtime. Ingen av tallene kan redigeres i etterkant.</li>
          <li><b>Manuell</b> er pH, fôring og notater, skrevet inn av den som gjør jobben. Datoen står ved tallet. pH er fra håndholdt måler, ikke laboratorie-pH.</li>
          <li><b>Fukt fra sensor</b> er volumetrisk og ukalibrert for kompost: les trenden, ikke tallet. Målområdet {t.fukt ? `${t.fukt.min}–${t.fukt.max} %` : ""} gjelder håndmåler.</li>
          <li><b>Hygienisering</b> vurderes av programmet, ikke av oss: {ruleText}. En sonde som er kald, feiler eller får en måling satt til side (sondefeil, sprang, over 85 °C) bryter perioden. Én sonde alene gir aldri godkjent.</li>
          <li><b>Stille</b> betyr at siste lagrede måling fra sonden er over to timer gammel. Da viser vi en strek og tidspunktet, ikke et gammelt tall.</li>
          <li><b>Mangler</b> er arbeidsdager (mandag–lørdag) uten loggføring, regnet til og med i går. Hvis noe ikke er logget, har det ikke skjedd.</li>
        </ul>
      </section>

      <footer className="st-foot">
        <span>Verminord AS · Jæren · generert {stamp(d.generated_at)}</span>
        <span className="st-footlinks"><a href={`/status/${params.token}/csv`}>Sensordata siste 30 dager (CSV)</a> · <a href={`/status/${params.token}?tv=1`}>Skjermvisning</a></span>
      </footer>
    </div>
  );
}
