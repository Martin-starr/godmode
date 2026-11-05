"use client";

import { useState } from "react";
import { useApi, postJson } from "./api";
import Login from "./Login";
import ThemeToggle from "./ThemeToggle";
import { fmtWhen } from "@/lib/format";

// Varsler: what the app has told you, newest first, and the switch that
// lets this phone be told. The account bits live at the bottom; there is
// no fourth tab for them.
export default function VarslerView() {
  const api = useApi("/api/v2/alerts");
  const me = useApi("/api/v2/me");
  const [leaving, setLeaving] = useState(false);

  if (api.status === "auth") return <Login onLogin={() => { api.reload(); me.reload(); }} />;
  if (api.status === "loading") return <p className="lead">Laster.</p>;
  if (api.status === "error" && !api.data) {
    return <p className="notice error">{api.error} <button className="link" onClick={() => api.reload()}>Prøv igjen</button></p>;
  }
  const alerts = api.data.alerts;

  const logout = async () => {
    if (leaving) return;
    setLeaving(true);
    await postJson("/api/logout", {});
    window.location.href = "/";
  };

  return (
    <div className="stack-l">
      <h1 className="h1"><span className="eyebrow" aria-hidden="true">Drift · Varsler</span>Varsler</h1>

      <p className="lead">
        Du får beskjed når en sonde har vært stille i to timer, et bed har ligget utenfor 15–25 °C i over en time, en hygieniseringskjøring brøt før 72 timer, ingenting er logget kl 18, og fredag morgen når det er fôringsdag.
      </p>
      <p className="notice">Varsling på telefonen kommer i neste oppdatering. Listen under er det samme som varslene vil si.</p>

      <section className="stack" aria-label="Siste varsler">
        <h2 className="h2">Siste 30 dager</h2>
        {alerts.length ? (
          <div>
            {alerts.map((a) => (
              <div className="alert" key={a.id}>
                <div className="spread">
                  <span>{a.title}</span>
                  <span className="k num">{fmtWhen(a.fired_at)}</span>
                </div>
                {a.body ? <div className="small">{a.body}</div> : null}
              </div>
            ))}
          </div>
        ) : (
          <p className="small">Ingen varsler. Stillhet er det gode tegnet.</p>
        )}
      </section>

      <section className="stack">
        <h2 className="h2">Utseende</h2>
        <ThemeToggle />
      </section>

      <section className="stack">
        <ul className="list">
          <li><a className="link" href="/oversikt">Alt det andre, på PC: Brief, Logg, Hygienisering, Innboks …</a></li>
          <li><a className="link" href="/week/">Ukeplan</a></li>
        </ul>
        {me.data ? <p className="small">Innlogget som {me.data.name}</p> : null}
        <button className="link" type="button" onClick={logout} disabled={leaving}>Logg ut</button>
      </section>
    </div>
  );
}
