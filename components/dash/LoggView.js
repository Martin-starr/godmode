"use client";

import { useState } from "react";
import { useApi, apiFetch, postJson, errorMessage } from "./api";
import { useToast } from "./Shell";
import Login from "./Login";
import { fmtNum, fmtTime, fmtIsoDay } from "@/lib/format";
import s from "./LoggView.module.css";

const ALL = "Alle";
const PH_HINT = "Kun fra pH-måler med glasselektrode. Pinnemålere gir ikke pH — la feltet stå tomt.";
const EMPTY = { ph: "", moist: "", feed: "", harvest: "", notes: "" };

export default function LoggView() {
  const api = useApi("/api/v2/logg");
  const toast = useToast();
  const [system, setSystem] = useState("");
  const [f, setF] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  if (api.status === "auth") return <Login onLogin={() => api.reload()} />;
  if (api.status === "loading") return <p className="lead">Laster.</p>;
  if (api.status === "error" && !api.data) {
    return <p className="notice error">{api.error} <button className="link" onClick={() => api.reload()}>Prøv igjen</button></p>;
  }
  const d = api.data;

  // The chip stays selected across saves; the first system is the default.
  const known = system === ALL || d.systems.some((x) => x.name === system);
  const sel = known ? system : (d.systems[0] ? d.systems[0].name : "");
  const isAll = sel === ALL;
  const empty = !f.ph.trim() && !f.moist.trim() && !f.feed.trim() && !f.harvest.trim() && !f.notes.trim();

  const set = (key) => (e) => { setF((o) => ({ ...o, [key]: e.target.value })); setError(""); };
  const pick = (name) => {
    setSystem(name);
    setError("");
    if (name === ALL) setF((o) => ({ ...o, ph: "", moist: "", harvest: "" }));
  };

  const save = async (e) => {
    e.preventDefault();
    if (saving || empty) return;
    setSaving(true);
    setError("");
    const res = await postJson("/api/v2/logg", {
      system: sel, ph: f.ph, moisture_handheld: f.moist, feed_liters: f.feed, harvest_liters: f.harvest, notes: f.notes,
    });
    const body = await res.json().catch(() => ({}));
    setSaving(false);
    if (res.status === 401) { api.reload(); return; }
    if (!res.ok) { setError(body.error || "Fikk ikke lagret."); return; }
    setF(EMPTY);
    toast(`Lagret · ${isAll ? body.count + " systemer" : sel} · ${fmtTime(body.at)}`);
    api.reload({ quiet: true });
  };

  const remove = async (id) => {
    if (!window.confirm("Slette denne loggføringen?")) return;
    const res = await apiFetch("/api/v2/logg/" + id, { method: "DELETE" });
    if (res.status === 401) { api.reload(); return; }
    toast(res.ok ? "Slettet." : await errorMessage(res, "Fikk ikke slettet."));
    api.reload({ quiet: true });
  };

  return (
    <div className={s.layout}>
      <form className={"stack " + s.form} onSubmit={save} noValidate>
        <h1 className="h1">Logg</h1>

        <div className="chips" role="group" aria-label="System">
          {d.systems.map((x) => (
            <button key={x.id} type="button" className="chip" aria-pressed={sel === x.name} onClick={() => pick(x.name)}>{x.name}</button>
          ))}
          <button type="button" className="chip" aria-pressed={isAll} onClick={() => pick(ALL)}>{ALL}</button>
        </div>

        <Field id="logg-ph" label="pH" value={f.ph} onChange={set("ph")} disabled={isAll} hint={PH_HINT} />
        <Field id="logg-fukt" label="Fukt, håndholdt %" value={f.moist} onChange={set("moist")} disabled={isAll} />
        <div className="grid2">
          <Field id="logg-foring" label="Fôring, liter" value={f.feed} onChange={set("feed")} hint={isAll ? "Samme mengde til hvert system." : null} />
          <Field id="logg-hosting" label="Høsting, liter" value={f.harvest} onChange={set("harvest")} disabled={isAll} />
        </div>
        <div className="field">
          <label htmlFor="logg-notat">Notat</label>
          <input id="logg-notat" className="input" type="text" value={f.notes} onChange={set("notes")} maxLength={2000} enterKeyHint="done" autoComplete="off" />
        </div>

        {error ? <p className="notice error" role="alert">{error}</p> : null}
        <button className="btn wide" type="submit" disabled={saving || empty} aria-busy={saving}>{saving ? "Lagrer" : "Lagre"}</button>
      </form>

      <section className="stack" aria-label="Siste loggføringer">
        <h2 className="h2">Siste 10</h2>
        {d.recent.length ? (
          <ul className="list">
            {d.recent.map((e) => <Row key={e.id} e={e} onDelete={remove} />)}
          </ul>
        ) : (
          <p className="small">Ingen loggføringer ennå.</p>
        )}
      </section>
    </div>
  );
}

// A decimal field. Text with a decimal keypad, so "7,1" and "7.1" both
// reach the server as typed; it accepts either.
function Field({ id, label, value, onChange, disabled, hint }) {
  return (
    <div className={"field" + (disabled ? " " + s.off : "")}>
      <label htmlFor={id}>{label}</label>
      <input id={id} className="input num" type="text" inputMode="decimal" value={value} onChange={onChange} disabled={disabled} autoComplete="off" enterKeyHint="next" />
      {hint ? <p className="hint">{hint}</p> : null}
    </div>
  );
}

function Row({ e, onDelete }) {
  const fresh = e.source === "mobil-v2";
  const when = fresh && e.logged_at ? fmtIsoDay(e.date) + " " + fmtTime(e.logged_at) : fmtIsoDay(e.date);
  const who = e.source === "historical_handwritten" ? "håndskrevet" : e.created_by;
  const parts = [];
  if (e.ph != null) parts.push(`pH ${fmtNum(e.ph, 1)}`);
  if (e.moisture_handheld != null) parts.push(`fukt ${fmtNum(e.moisture_handheld, 0)} % håndholdt`);
  if (e.temperature != null) parts.push(`temp ${fmtNum(e.temperature, 1)} °C håndholdt`);
  if (e.feed_liters != null) parts.push(`fôring ${fmtNum(e.feed_liters, 0)} l`);
  if (e.harvest_liters != null) parts.push(`høsting ${fmtNum(e.harvest_liters, 0)} l`);
  const handheld = !fresh && (e.ph != null || e.moisture_handheld != null || e.temperature != null);
  return (
    <li>
      <div className="spread">
        <span className="num">{[when, e.system, who, "manuell"].filter(Boolean).join(" · ")}</span>
        {e.deletable ? <button type="button" className="link" onClick={() => onDelete(e.id)}>Slett</button>
          : handheld ? <span className="small">håndholdt måler</span> : null}
      </div>
      {parts.length ? <div className="small num">{parts.join(" · ")}</div> : null}
      {e.notes ? <div style={{ marginTop: 4 }}>{e.notes}</div> : null}
    </li>
  );
}
