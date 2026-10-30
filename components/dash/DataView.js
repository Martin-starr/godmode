"use client";

import { useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { useApi } from "./api";
import Login from "./Login";
import { LineChart } from "./Charts";
import { fmtNum, fmtIsoDay, fmtIsoDayYear, fmtTime, fmtResolution } from "@/lib/format";
import { DATE_ONLY, isoDateOslo, addDaysIso } from "@/lib/time";
import { OM_MALINGENE } from "@/lib/om-malingene";
import { SENSOR_START, FIRST_LOG } from "@/lib/v2";
import s from "./DataView.module.css";

const HANDHELD_NOTE = "Loggene før 15. sep 2026 er tatt med håndholdt måler (pinne) — relative verdier, ikke sporbare.";

const okDate = (v) => (v && DATE_ONLY.test(v) ? v : null);

// Period chips: key, label, from-date. All of them end today.
const presetsFor = (today) => [
  ["7d", <>7 <span className="unit" key="u">d</span></>, addDaysIso(today, -6)],
  ["30d", <>30 <span className="unit" key="u">d</span></>, addDaysIso(today, -29)],
  ["sep", "siden 15. sep", SENSOR_START],
  ["alt", "alt", FIRST_LOG],
];

const hasData = (ser) => [ser.temp, ser.ec, ser.moisture].some((pts) => pts.some((p) => p.v != null));

// Liters: whole numbers plain, otherwise one decimal.
const fmtL = (v) => fmtNum(v, Number.isInteger(v) ? 0 : 1);
const val = (v, d) => (v == null ? "" : fmtNum(v, d ?? (Number.isInteger(v) ? 0 : 1)));

// "13.–19. okt 2026" or, across a month boundary, "29. sep–5. okt 2026".
function weekSpan(w) {
  const sameMonth = w.from.slice(0, 7) === w.to.slice(0, 7);
  return (sameMonth ? Number(w.from.slice(8)) + "." : fmtIsoDay(w.from)) + "–" + fmtIsoDayYear(w.to);
}

export default function DataView() {
  const sp = useSearchParams();
  const today = isoDateOslo();
  const from = okDate(sp.get("from")) || SENSOR_START;
  const to = okDate(sp.get("to")) || today;
  const system = sp.get("system") || "all";
  const rangeOk = from <= to;
  const qs = `from=${from}&to=${to}` + (system !== "all" ? "&system=" + encodeURIComponent(system) : "");
  const api = useApi(rangeOk ? "/api/v2/data?" + qs : "");

  // The range is the URL, so a link carries it. replaceState keeps the
  // router in step without a server round trip per tap.
  const setQuery = useCallback((patch) => {
    const next = { from, to, system, ...patch };
    const p = new URLSearchParams();
    p.set("from", next.from);
    p.set("to", next.to);
    if (next.system !== "all") p.set("system", next.system);
    window.history.replaceState(null, "", "/data?" + p.toString());
  }, [from, to, system]);

  if (api.status === "auth") return <Login onLogin={() => api.reload()} />;

  const d = api.data;
  const presets = presetsFor(today);
  const preset = to === today ? (presets.find((p) => p[2] === from) || [null])[0] : null;
  const stale = rangeOk && d && (d.query.from !== from || d.query.to !== to || d.query.system !== system);
  const csvHref = (kind) => `/api/v2/csv?kind=${kind}&${qs}`;

  return (
    <div className="stack-l">
      <header className="stack">
        <div className="topline">
          <h1 className="h1"><span className="eyebrow" aria-hidden="true">Drift · Data</span>Data</h1>
          {stale || (rangeOk && api.status === "loading") ? <span className="small">Laster.</span> : null}
        </div>
        <hr className="rule desk-only" />
        <div className={s.controls}>
          <div className={s.dates}>
            <div className="field">
              <label htmlFor="data-from">Fra</label>
              <input id="data-from" className="input" type="date" value={from} min={FIRST_LOG} max={today}
                onChange={(e) => okDate(e.target.value) && setQuery({ from: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="data-to">Til</label>
              <input id="data-to" className="input" type="date" value={to} min={FIRST_LOG} max={today}
                onChange={(e) => okDate(e.target.value) && setQuery({ to: e.target.value })} />
            </div>
          </div>
          <div className="chips" role="group" aria-label="Periode">
            {presets.map(([key, label, f]) => (
              <button key={key} type="button" className="chip" aria-pressed={preset === key} onClick={() => setQuery({ from: f, to: today })}>
                {label}
              </button>
            ))}
          </div>
        </div>
        {d ? (
          <div className="chips" role="group" aria-label="System">
            <button type="button" className={"chip " + s.sys} aria-pressed={system === "all"} onClick={() => setQuery({ system: "all" })}>Alle bed</button>
            {d.selector.map((c) => (
              <button key={c.key} type="button" className={"chip " + s.sys} aria-pressed={system === c.key} onClick={() => setQuery({ system: c.key })}>
                {c.name}
              </button>
            ))}
          </div>
        ) : null}
        {!rangeOk ? <p className="notice error" role="alert">Fra-datoen er etter Til-datoen.</p> : null}
        {api.status === "error" ? (
          <p className="notice error" role="alert">{api.error} <button className="link" onClick={() => api.reload()}>Prøv igjen</button></p>
        ) : null}
      </header>

      {!d ? null : (
        <div className="stack-l" aria-busy={stale ? "true" : undefined}>
          <section aria-label="Sensordata">
            {!d.configured && !d.series.some(hasData) ? <p className="notice">{d.message}</p> : null}
            {d.series.length ? d.series.map((ser) => <Series key={ser.key} ser={ser} minutes={d.minutes} />) : (
              d.configured ? <p className="small">Ingen sensordata i perioden.</p> : null
            )}
          </section>

          <hr className="rule" />

          <section className="stack" aria-label="Manuelle loggføringer">
            <h2 className="h2">Manuelle loggføringer</h2>
            {d.has_handheld ? <p className="small">{HANDHELD_NOTE}</p> : null}
            {d.logs.length ? (
              <>
                <div className="tbl-wrap">
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th>Dato</th><th>System</th><th className="r"><span className="unit">pH</span></th><th className="r">Fukt håndholdt</th>
                        <th className="r">Fôring l</th><th className="r">Høsting l</th><th>Notat</th><th>Kilde</th>
                      </tr>
                    </thead>
                    <tbody>{d.logs.map((e) => <LogRow key={e.id} e={e} />)}</tbody>
                  </table>
                </div>
                {d.logs_truncated ? <p className="small">Viser de 2000 nyeste radene. CSV-filen har alle.</p> : null}
              </>
            ) : (
              <p className="small">Ingen loggføringer i perioden.</p>
            )}
          </section>

          <hr className="rule" />

          <section className="stack" aria-label="Fôring">
            <h2 className="h2">Fôring</h2>
            {d.feeding.weeks.length ? (
              <>
                <table className={"tbl " + s.feed}>
                  <thead><tr><th>Uke</th><th>Periode</th><th className="r">Liter</th></tr></thead>
                  <tbody>
                    {d.feeding.weeks.map((w) => (
                      <tr key={w.week}><td>{w.label}</td><td className="num">{weekSpan(w)}</td><td className="r num">{fmtL(w.liters)}</td></tr>
                    ))}
                  </tbody>
                </table>
                <p className="num">Totalt i perioden: {fmtL(d.feeding.total)} l</p>
              </>
            ) : (
              <p className="small">Ingen fôring i perioden.</p>
            )}
          </section>

          <section className="stack" aria-label="Last ned CSV">
            <div className="row">
              <a className="btn ghost" href={csvHref("sensor")} download>Last ned CSV · sensor</a>
              <a className="btn ghost" href={csvHref("logg")} download>Last ned CSV · logg</a>
            </div>
            <p className="small">Semikolon som skilletegn og komma som desimaltegn, klar for norsk Excel. Sensorfilen har alle lagrede målinger (historikk hvert 30. minutt pluss hver oppdatering), loggfilen alle manuelle loggføringer i perioden. Tidspunkt står i norsk tid, med UTC i egen kolonne.</p>
          </section>

          <hr className="rule" />

          <section className="stack" aria-label="Om målingene">
            <h2 className="h2">Om målingene</h2>
            <div className={"notice " + s.om}>
              {OM_MALINGENE.map((p, i) => <p key={i}>{p}</p>)}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function Series({ ser, minutes }) {
  return (
    <section className={s.series} aria-label={ser.name}>
      <div className="topline" style={{ marginBottom: 12 }}>
        <h2 className="h2">{ser.name}</h2>
        <span className="small num">CH{ser.channel} · auto · snitt per {fmtResolution(minutes)}</span>
      </div>
      {hasData(ser) ? (
        <div className={s.charts}>
          <Chart title="Temperatur °C" points={ser.temp} decimals={1} />
          <Chart title="Ledningsevne µS/cm" points={ser.ec} decimals={0} />
          <Chart title="Fuktighet % (vol.)" note="ukalibrert for kompost" points={ser.moisture} decimals={0} />
        </div>
      ) : (
        <p className="small">Ingen sensordata i perioden.</p>
      )}
    </section>
  );
}

function Chart({ title, note, points, decimals }) {
  return (
    <div className={s.cell}>
      <div className={s.ct}>{title}</div>
      {note ? <div className="small">{note}</div> : null}
      <div className={s.plot}>
        <LineChart points={points} decimals={decimals} title={title} height={170} />
      </div>
    </div>
  );
}

function LogRow({ e }) {
  const kilde = e.handheld ? "håndholdt måler (pinne)" : "manuell" + (e.created_by ? " · " + e.created_by : "");
  return (
    <tr>
      <td className="num">
        {fmtIsoDayYear(e.date)}
        {!e.handheld && e.logged_at ? <span className="small"> {fmtTime(e.logged_at)}</span> : null}
      </td>
      <td>{e.system}</td>
      <td className="r num">{val(e.ph, 1)}</td>
      <td className="r num">{val(e.moisture_handheld, 0)}</td>
      <td className="r num">{val(e.feed_liters)}</td>
      <td className="r num">{val(e.harvest_liters)}</td>
      <td className="wrap">{e.notes}</td>
      <td className="small">{kilde}</td>
    </tr>
  );
}
