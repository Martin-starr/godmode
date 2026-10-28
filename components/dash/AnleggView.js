"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useApi, apiFetch } from "./api";
import { useToast } from "./Shell";
import Login from "./Login";
import { Sparkline } from "./Charts";
import { fmtNum, fmtWhen, fmtTime, fmtDay } from "@/lib/format";

const TEMP_OK = [15, 25];

export default function AnleggView() {
  const api = useApi("/api/v2/anlegg");
  const { status, data, reload } = api;
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const poked = useRef(false);

  // First paint comes from what is stored. Then the station is asked once
  // (the endpoint caches for five minutes) and the page quietly updates.
  useEffect(() => {
    if (status !== "ok" || !data || poked.current) return;
    poked.current = true;
    if (!data.configured) return;
    apiFetch("/api/ecowitt/realtime").then((r) => (r.ok ? r.json() : null)).then((j) => {
      if (j && j.fetched) reload({ quiet: true });
    }).catch(() => {});
  }, [status, data, reload]);

  const refresh = async () => {
    if (busy) return;
    setBusy(true);
    const res = await apiFetch("/api/ecowitt/realtime?force=1", { timeoutMs: 30000 });
    const j = await res.json().catch(() => ({}));
    await api.reload({ quiet: true });
    setBusy(false);
    if (res.status === 401) return;
    if (!res.ok) toast(j.error || "Fikk ikke oppdatert.");
    else if (j.configured === false) toast(j.message);
    else if (j.error) toast("Fikk ikke kontakt med Ecowitt. Viser siste lagrede verdier.");
    else toast("Oppdatert " + fmtTime(new Date()));
  };

  if (api.status === "auth") return <Login onLogin={() => api.reload()} />;
  if (api.status === "loading") return <p className="lead">Laster.</p>;
  if (api.status === "error" && !api.data) {
    return <p className="notice error">{api.error} <button className="link" onClick={() => api.reload()}>Prøv igjen</button></p>;
  }
  const d = api.data;

  return (
    <div className="stack-l">
      <header className="stack">
        <div className="topline">
          <h1 className="h1">Anlegg</h1>
          <span className="small num">{d.updated_at ? "Oppdatert " + fmtWhen(d.updated_at) : "Ingen måling ennå"}</span>
        </div>
        <p className="lead num">
          {d.room
            ? `Rom ${fmtNum(d.room.temp, 1)} °C · ${fmtNum(d.room.rh, 0)} % RH · ${fmtWhen(d.room.ts)}`
            : "Rom — ingen måling"}
        </p>
        {!d.configured ? <p className="notice">{d.message}</p> : null}
        <div className="row">
          <button className="btn ghost" onClick={refresh} disabled={busy} aria-busy={busy}>
            {busy ? "Oppdaterer" : "Oppdater"}
          </button>
        </div>
      </header>

      <section className="cards" aria-label="Systemer">
        {d.cards.map((c) => <SystemCard key={c.key} card={c} />)}
      </section>
    </div>
  );
}

function SystemCard({ card }) {
  const href = card.kind === "unassigned" ? "/mer/kanaler" : card.kind === "system" ? "/anlegg/" + card.key : "/anlegg/" + card.key;
  const dot = card.kind === "system" && card.temp != null
    ? (card.temp >= TEMP_OK[0] && card.temp <= TEMP_OK[1] ? "ok" : "warn")
    : null;
  const noSensor = card.channel == null;

  return (
    <Link href={href} className="card">
      <div className="card-h">
        <span className="name">{card.name}</span>
        {card.kind === "unassigned" ? <span className="small">Velg bed under Kanaler</span>
          : card.category === "precompost" ? <span className="small">prekompost</span>
          : card.label && card.kind === "hygiene" ? null : null}
      </div>
      {noSensor ? (
        <p className="small">Ingen sensor tildelt.</p>
      ) : (
        <div className="metrics">
          <Metric label="Temp °C" value={fmtNum(card.temp, 1)} when={card.ts} dot={dot} />
          <Metric label="EC µS/cm" value={fmtNum(card.ec, 0)} when={card.ts} />
          <Metric label="Fukt % (vol.)" value={fmtNum(card.moisture, 0)} when={card.ts} note="ukalibrert for kompost" />
        </div>
      )}
      {card.kind === "system" || !noSensor ? (
        <div className="card-f">
          <span className="small num">
            {card.kind === "system"
              ? (card.ph ? `pH ${fmtNum(card.ph.value, 1)} · manuell · ${fmtDay(card.ph.at)}` : "pH — ingen måling")
              : "7 dager"}
          </span>
          <Sparkline points={card.spark} ariaLabel="Temperatur siste 7 dager" />
        </div>
      ) : null}
    </Link>
  );
}

function Metric({ label, value, when, dot, note }) {
  const dotTitle = dot === "warn" ? "Utenfor 15–25 °C" : dot === "ok" ? "Innenfor 15–25 °C" : null;
  return (
    <div className="metric">
      <div className="lbl">{label}</div>
      <div className="big">
        {value}
        {dot ? <span className={"dot " + dot} role="img" aria-label={dotTitle} title={dotTitle} /> : null}
      </div>
      <div className="when num">{when ? "auto · " + fmtWhen(when) : "ingen måling"}</div>
      {note ? <div className="when">{note}</div> : null}
    </div>
  );
}
