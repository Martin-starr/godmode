import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { statusPayload } from "@/lib/status";
import { validToken, noteVisit } from "@/lib/status-link";
import { osloStamp } from "@/lib/time";
import StatusTools from "../StatusTools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 25;

// ---- formatting ---------------------------------------------------------
const nb = (v, d = 1) => (v == null ? "–" : v.toFixed(d).replace(".", ","));
// Dates arrive as "YYYY-MM-DD" text or as Date objects; both become dd.mm.yy.
const dmy = (v) => {
  if (!v) return "–";
  const s = v instanceof Date ? osloStamp(v) : String(v);
  return s.slice(8, 10) + "." + s.slice(5, 7) + "." + s.slice(2, 4);
};
const hm = (ms) => osloStamp(new Date(ms)).slice(11, 16);
const dm = (ms) => { const s = osloStamp(new Date(ms)); return s.slice(8, 10) + "." + s.slice(5, 7); };
const dmhm = (ms) => dm(ms) + " " + hm(ms);
const when = (iso) => { const s = osloStamp(new Date(iso)); return s.slice(8, 10) + "." + s.slice(5, 7) + " kl " + s.slice(11, 16); };

const COLORS = ["#1C3A5C", "#B8993A", "#6B7544", "#A64B2A", "#5A6270", "#1C3A5C", "#B8993A", "#6B7544"];
const DASH = ["", "", "", "", "5 4", "5 4", "5 4", "5 4"];

// ---- one line chart for both uses --------------------------------------
// series: [{ name, color, dash, points: [[t, v] | [t, null]] }], a gap in a
// line wherever v is null or two points are further apart than gapMs.
function LineChart({ series, from, to, band, line, base, gapMs, h = 300 }) {
  let lo = base ? base[0] : Infinity;
  let hi = base ? base[1] : -Infinity;
  for (const s of series) for (const [, v] of s.points) if (v != null) { if (v < lo) lo = v; if (v > hi) hi = v; }
  if (band) { lo = Math.min(lo, band[0]); hi = Math.max(hi, band[1]); }
  if (line != null) { lo = Math.min(lo, line); hi = Math.max(hi, line); }
  if (!Number.isFinite(lo)) { lo = 0; hi = 1; }
  lo = Math.floor(lo) - 2;
  hi = Math.ceil(hi) + 2;
  const x = (t) => 42 + ((t - from) / Math.max(1, to - from)) * 946;
  const y = (v) => h - 26 - ((v - lo) / (hi - lo)) * (h - 42);
  const grid = [];
  for (let i = 0; i <= 4; i++) {
    const val = lo + ((hi - lo) * i) / 4;
    grid.push(
      <line key={"g" + i} x1={42} x2={988} y1={y(val)} y2={y(val)} stroke="rgba(28,58,92,0.10)" vectorEffect="non-scaling-stroke" />,
      <text key={"t" + i} x={34} y={y(val) + 3} textAnchor="end" fontSize={11} fill="#5A6270">{Math.round(val)}</text>
    );
  }
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
        lines.push(<circle key={i + "-" + k} cx={cx} cy={cy} r={1.8} fill={s.color} />);
      } else {
        lines.push(<polyline key={i + "-" + k} points={seg.join(" ")} fill="none" stroke={s.color} strokeWidth={1.7} strokeDasharray={s.dash || undefined} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />);
      }
    });
    const last = [...s.points].reverse().find((p) => p[1] != null);
    if (last) lines.push(<circle key={"e" + i} cx={x(last[0])} cy={y(last[1])} r={2.6} fill={s.color} />);
  });
  const mid = (from + to) / 2;
  return (
    <svg viewBox={"0 0 1000 " + h} width="100%" style={{ display: "block", height: "auto", overflow: "visible" }} preserveAspectRatio="none" role="img">
      {grid}
      {band ? (
        <>
          <rect x={42} width={946} y={y(band[1])} height={Math.max(0, y(band[0]) - y(band[1]))} fill="rgba(184,153,58,0.08)" />
          <line x1={42} x2={988} y1={y(band[0])} y2={y(band[0])} stroke="#B8993A" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
          <line x1={42} x2={988} y1={y(band[1])} y2={y(band[1])} stroke="#B8993A" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
          <text x={988} y={y(band[1]) - 5} textAnchor="end" fontSize={11} fill="#B8993A">mål {band[0]}–{band[1]}</text>
        </>
      ) : null}
      {line != null ? (
        <>
          <line x1={42} x2={988} y1={y(line)} y2={y(line)} stroke="#B8993A" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
          <text x={988} y={y(line) - 5} textAnchor="end" fontSize={11} fill="#B8993A">{line}°C krav</text>
        </>
      ) : null}
      {lines}
      <text x={42} y={h - 6} fontSize={11} fill="#5A6270">{dmhm(from)}</text>
      <text x={500} y={h - 6} textAnchor="middle" fontSize={11} fill="#5A6270">{dmhm(mid)}</text>
      <text x={988} y={h - 6} textAnchor="end" fontSize={11} fill="#5A6270">{dmhm(to)}</text>
    </svg>
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
  await noteVisit(sql, params.token);
  const d = await statusPayload(sql);
  const tv = searchParams && searchParams.tv === "1";

  const t = d.targets;
  // A bed with no sensor, no pH and no log in the window is not in use; it
  // is named once instead of filling both tables with dashes.
  const inUse = d.beds.filter((b) => b.channel != null || b.ph || b.logg.days > 0);
  const idle = d.beds.filter((b) => !inUse.includes(b));
  const bad = (v, tt) => v != null && tt && (v < tt.min || v > tt.max);
  const live = d.beds.filter((b) => !b.stale && b.temp != null);
  const outside = live.filter((b) => bad(b.temp, t.temp)).length;
  const headline = d.sensors_stale
    ? "Sensorene har ikke rapportert på over to timer."
    : !live.length
      ? "Ingen bed har sensor ennå."
      : outside === 0
        ? `Alle ${live.length} bed med sensor innenfor ${t.temp ? t.temp.min + "–" + t.temp.max : ""} °C.`
        : `${outside} av ${live.length} bed utenfor ${t.temp ? t.temp.min + "–" + t.temp.max : ""} °C.`;

  const curveSeries = d.beds.filter((b) => b.channel != null).map((b, i) => ({ name: b.name, color: COLORS[i % 8], dash: DASH[i % 8], points: b.curve }));
  const hyg = d.hygiene.record;
  const rules = d.hygiene.rules;
  const hygSeries = hyg ? hyg.channels.map((c, i) => ({ name: "Sonde " + c.ch, color: COLORS[i % 8], dash: i >= 3 ? "5 4" : "", points: hyg.series.map((p) => [p.t, p.temps[i]]) })) : [];

  return (
    <div className={"st" + (tv ? " tv" : "")}>
      <header className="st-head">
        <div>
          {/* eslint-disable-next-line @next/next/no-img-element -- static logo */}
          <img src="/logo-dark.png" alt="Verminord" width={130} height={60} />
          <div className="st-eyebrow">Driftsstatus · innsyn for {link.label}</div>
        </div>
        <div className="st-headmeta">
          <div>{dmy(d.generated_at.slice(0, 10)) + " kl " + osloStamp(new Date(d.generated_at)).slice(11, 16)}</div>
          <div className="st-mut">{d.sensors_last_ts ? "Siste sensormåling " + when(d.sensors_last_ts) : "Ingen sensormåling ennå"}</div>
          <StatusTools tv={tv} />
        </div>
      </header>

      <h1 className="st-h1">{headline}</h1>
      <p className="st-sub">
        Tallene under kommer rett fra sensorene i bedene og fra driftsloggen, uten omskriving. Temperatur, fukt og EC logges automatisk; pH måles for hånd.
        {d.room && !d.room.stale ? ` Rom: ${nb(d.room.temp)} °C · ${nb(d.room.rh, 0)} % RH.` : ""}
      </p>

      <section>
        <div className="st-sechead"><span className="st-eyebrow">Nå · per bed</span><span className="st-mut">{t.temp ? `mål ${t.temp.min}–${t.temp.max} °C · pH ${nb(t.ph && t.ph.min)}–${nb(t.ph && t.ph.max)}` : ""}</span></div>
        <table className="st-tbl">
          <thead>
            <tr><th>Bed</th><th className="num">Temp</th><th className="num">Fukt (sensor)</th><th className="num">EC</th><th className="num">pH (manuell)</th><th className="rt">Siste måling</th></tr>
          </thead>
          <tbody>
            {inUse.map((b) => (
              <tr key={b.name} className={b.stale ? "stale" : ""}>
                <td><b>{b.name}</b></td>
                <td className={"num" + (!b.stale && bad(b.temp, t.temp) ? " warn" : "")}>{b.channel == null ? "ingen sensor" : nb(b.temp) + " °C"}</td>
                <td className="num">{b.channel == null ? "–" : nb(b.moisture, 0) + " %"}</td>
                <td className="num">{b.channel == null ? "–" : nb(b.ec, 0) + " µS/cm"}</td>
                <td className={"num" + (b.ph && bad(b.ph.value, t.ph) ? " warn" : "")}>{b.ph ? nb(b.ph.value) + " · " + dmy(b.ph.date) : "ingen måling"}</td>
                <td className="rt">{b.channel == null ? "–" : b.stale ? (b.ts ? "stille siden " + when(b.ts) : "aldri") : when(b.ts)}</td>
              </tr>
            ))}
            {d.hygieneProbes.map((p) => (
              <tr key={"h" + p.channel} className={p.stale ? "stale" : ""}>
                <td><b>{p.name}</b> <span className="st-mut">hygienisering</span></td>
                <td className="num">{p.reading ? nb(p.reading.temp) + " °C" : "–"}</td>
                <td className="num">{p.reading ? nb(p.reading.moisture, 0) + " %" : "–"}</td>
                <td className="num">{p.reading ? nb(p.reading.ec, 0) + " µS/cm" : "–"}</td>
                <td className="num">–</td>
                <td className="rt">{p.reading ? (p.stale ? "stille siden " + when(p.reading.ts) : when(p.reading.ts)) : "aldri"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <div className="st-sechead"><span className="st-eyebrow">Temperatur · siste {d.curve.days} dager · snitt per time</span></div>
        {curveSeries.some((s) => s.points.length) ? (
          <>
            <LineChart series={curveSeries} from={d.curve.from} to={d.curve.to} band={t.temp ? [t.temp.min, t.temp.max] : null} base={[15, 30]} gapMs={2 * 3600e3} />
            <Legend items={curveSeries} />
          </>
        ) : <p className="st-mut">Ingen sensordata i perioden.</p>}
      </section>

      <section>
        <div className="st-sechead">
          <span className="st-eyebrow">Hygienisering §19 · siste loggerkjøring</span>
          <span className="st-mut">krav {rules.minTemp} °C i {rules.minMinutes} min på minst 2 sonder samtidig</span>
        </div>
        {hyg ? (
          <div className="st-card">
            <div className="st-cardhead">
              <div>
                <div className="st-cardtitle">{dm(hyg.from)} – {dm(hyg.to)}.{String(new Date(hyg.to).getFullYear()).slice(2)}</div>
                <div className="st-mut">{hyg.channels.length} sonder · alle samtidig ≥ {rules.minTemp} °C i {hyg.together.minutes} min{hyg.excluded ? ` · ${hyg.excluded} målinger satt til side som sondefeil` : ""}</div>
              </div>
              <span className={"st-tag " + (hyg.pass ? "navy" : "gold")}>{hyg.pass ? "Godkjent §19" : "Ikke godkjent"}</span>
            </div>
            <LineChart series={hygSeries} from={hyg.from} to={hyg.to} line={rules.minTemp} base={[10, 80]} gapMs={Math.max(5, 2 * hyg.bucketMinutes) * 60000} />
            <Legend items={hygSeries} right={"loggfil " + hyg.filename + " · importert " + dmy(hyg.imported_at)} />
          </div>
        ) : <p className="st-mut">Ingen loggerkjøring importert ennå.</p>}
      </section>

      <section>
        <div className="st-sechead"><span className="st-eyebrow">Loggdisiplin · {dmy(d.logg.from)} – {dmy(d.logg.to)}</span><span className="st-mut">{d.logg.working_days} arbeidsdager (man–lør)</span></div>
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
          <li><b>Automatisk</b> er temperatur, fukt og EC fra Ecowitt-sonder i hvert bed, lagret hvert 30. minutt. Ingen av tallene kan redigeres i etterkant.</li>
          <li><b>Manuell</b> er pH, fôring og notater, skrevet inn av den som gjør jobben. Datoen står ved tallet.</li>
          <li><b>Fukt fra sensor</b> er volumetrisk og ukalibrert for kompost: les trenden, ikke tallet. Målområdet {t.fukt ? `${t.fukt.min}–${t.fukt.max} %` : ""} gjelder håndmåler.</li>
          <li><b>Hygienisering</b> vurderes av programmet, ikke av oss: minst to sonder må holde {rules.minTemp} °C i {rules.minMinutes} minutter samtidig. Målinger som ikke kan stemme (sondefeil, sprang, over 85 °C) settes til side og teller ikke. Én sonde alene gir aldri godkjent.</li>
          <li><b>Stille</b> betyr at en sonde ikke har rapportert på over to timer. Da viser vi det, ikke et gammelt tall.</li>
          <li><b>Mangler</b> er arbeidsdager uten loggføring. Hvis noe ikke er logget, har det ikke skjedd.</li>
        </ul>
      </section>

      <footer className="st-foot">
        <span>Verminord AS · Jæren · generert {dmy(d.generated_at.slice(0, 10))} kl {osloStamp(new Date(d.generated_at)).slice(11, 16)}</span>
        <span><a href={`/status/${params.token}/csv`}>Sensordata siste 30 dager (CSV)</a> · <a href={`/status/${params.token}?tv=1`}>Skjermvisning</a></span>
      </footer>
    </div>
  );
}
