"use client";

import Link from "next/link";
import { useApi } from "./api";
import Login from "./Login";
import { LineChart } from "./Charts";
import { fmtNum, fmtWhen, fmtIsoDay, fmtTime } from "@/lib/format";

export default function SystemView({ keyId }) {
  const api = useApi("/api/v2/system/" + encodeURIComponent(keyId));

  if (api.status === "auth") return <Login onLogin={() => api.reload()} />;
  if (api.status === "loading") return <p className="lead">Laster.</p>;
  if (api.status === "error" && !api.data) {
    return (
      <div className="stack">
        <Link href="/" className="link">Anlegg</Link>
        <p className="notice error">{api.error}</p>
      </div>
    );
  }
  const d = api.data;
  const l = d.latest;

  return (
    <div className="stack-l">
      <header className="stack">
        <Link href="/" className="link">Anlegg</Link>
        <h1 className="h1">{d.title}</h1>
        {d.channel == null ? (
          <p className="lead">Ingen sensor tildelt. Velg kanal under Mer, Kanaler.</p>
        ) : l ? (
          <p className="lead num">
            {`Temp ${fmtNum(l.temp, 1)} °C · EC ${fmtNum(l.ec, 0)} µS/cm · Fukt ${fmtNum(l.moisture, 0)} % · auto · ${fmtWhen(l.ts)}`}
            <span className="small"> · CH{d.channel}</span>
          </p>
        ) : (
          <p className="lead">CH{d.channel} · ingen måling ennå</p>
        )}
      </header>

      {d.series ? (
        <>
          <section className="stack">
            <h2 className="h2">Temperatur °C · siste 6 uker</h2>
            <LineChart points={d.series.temp} decimals={1} title="Temperatur siste 6 uker" />
          </section>
          <section className="stack">
            <h2 className="h2">Ledningsevne µS/cm</h2>
            <LineChart points={d.series.ec} decimals={0} title="Ledningsevne siste 6 uker" />
          </section>
          <section className="stack">
            <h2 className="h2">Fuktighet % (vol.)</h2>
            <p className="small">ukalibrert for kompost · les som utvikling, ikke som vanninnhold</p>
            <LineChart points={d.series.moisture} decimals={0} title="Fuktighet siste 6 uker" />
          </section>
        </>
      ) : null}

      {d.system ? (
        <section className="stack">
          <h2 className="h2">Manuelle loggføringer</h2>
          {d.logs.length ? (
            <ul className="list">
              {d.logs.map((e) => <LogRow key={e.id} e={e} />)}
            </ul>
          ) : (
            <p className="small">Ingen loggføringer ennå.</p>
          )}
        </section>
      ) : null}
    </div>
  );
}

function LogRow({ e }) {
  const parts = [];
  if (e.ph != null) parts.push(`pH ${fmtNum(e.ph, 1)} · manuell`);
  if (e.moisture_handheld != null) parts.push(`fukt ${fmtNum(e.moisture_handheld, 0)} % håndholdt`);
  if (e.temperature != null) parts.push(`temp ${fmtNum(e.temperature, 1)} °C håndholdt`);
  if (e.feed_liters != null) parts.push(`fôring ${fmtNum(e.feed_liters, 0)} l`);
  if (e.harvest_liters != null) parts.push(`høsting ${fmtNum(e.harvest_liters, 0)} l`);
  const when = e.source === "mobil-v2" && e.logged_at ? fmtIsoDay(e.date) + " " + fmtTime(e.logged_at) : fmtIsoDay(e.date);
  const kind = e.source === "historical_handwritten" ? "håndskrevet" : e.created_by;
  return (
    <li>
      <div className="spread">
        <span className="num">{when}</span>
        <span className="small">{kind}</span>
      </div>
      {parts.length ? <div className="small num">{parts.join(" · ")}</div> : null}
      {e.notes ? <div style={{ marginTop: 4 }}>{e.notes}</div> : null}
    </li>
  );
}
