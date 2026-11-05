"use client";

import { useRef, useState } from "react";
import { useApi, apiFetch, postOrQueue, errorMessage } from "./api";
import { useToast } from "./Shell";
import Login from "./Login";
import { fmtNum, fmtTime, fmtIsoDay } from "@/lib/format";
import s from "./LoggView.module.css";

// Gjør: what you log while standing in the hall. The biggest thing on the
// screen is feeding every bed the same amount, because that is what
// happens most. Everything else is one bed at a time.
const PH_HINT = "Kun fra pH-måler med glasselektrode. Pinnemålere gir ikke pH.";
const EMPTY = { ph: "", feed: "", harvest: "", notes: "", avvik: false, photo: null };
const STEP = 0.5;

export default function LoggView() {
  const api = useApi("/api/v2/logg");
  const toast = useToast();
  const [amount, setAmount] = useState(null);
  const [feeding, setFeeding] = useState(false);
  const [system, setSystem] = useState("");
  const [f, setF] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef(null);

  if (api.status === "auth") return <Login onLogin={() => api.reload()} />;
  if (api.status === "loading") return <p className="lead">Laster.</p>;
  if (api.status === "error" && !api.data) {
    return <p className="notice error">{api.error} <button className="link" onClick={() => api.reload()}>Prøv igjen</button></p>;
  }
  const d = api.data;
  const liters = amount ?? d.last_feed ?? 5;
  const known = d.systems.some((x) => x.name === system);
  const sel = known ? system : (d.systems[0] ? d.systems[0].name : "");
  const empty = !f.ph.trim() && !f.feed.trim() && !f.harvest.trim() && !f.notes.trim() && !f.photo && !f.avvik;

  const after = (res, label) => {
    if (res.queued) { toast(label + " · lagret på telefonen, sendes når du har nett"); return true; }
    if (res.status === 401) { api.reload(); return false; }
    return res.ok;
  };

  const feedAll = async () => {
    if (feeding) return;
    setFeeding(true);
    const res = await postOrQueue("/api/v2/logg", { system: "Alle", feed_liters: liters });
    const body = res.queued ? {} : await res.json().catch(() => ({}));
    setFeeding(false);
    if (!after(res, `Fôret alle ${fmtNum(liters, 1)} l`)) { toast(body.error || "Fikk ikke lagret."); return; }
    if (!res.queued) toast(`Fôret ${body.count} bed · ${fmtNum(liters, 1)} l hver · ${fmtTime(body.at)}`);
    api.reload({ quiet: true });
  };

  const set = (key) => (e) => { setF((o) => ({ ...o, [key]: e.target.value })); setError(""); };

  const pickPhoto = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    try {
      const photo = await shrink(file);
      setF((o) => ({ ...o, photo }));
    } catch {
      setError("Fikk ikke lest bildet.");
    }
  };

  const save = async (e) => {
    e.preventDefault();
    if (saving || empty) return;
    setSaving(true);
    setError("");
    const res = await postOrQueue("/api/v2/logg", {
      system: sel, ph: f.ph, feed_liters: f.feed, harvest_liters: f.harvest, notes: f.notes, avvik: f.avvik, photo: f.photo,
    });
    const body = res.queued ? {} : await res.json().catch(() => ({}));
    setSaving(false);
    if (!after(res, "Lagret · " + sel)) { setError(body.error || "Fikk ikke lagret."); return; }
    setF(EMPTY);
    if (!res.queued) toast(`Lagret · ${sel} · ${fmtTime(body.at)}${f.harvest.trim() ? " · batch opprettet" : ""}`);
    api.reload({ quiet: true });
  };

  const remove = async (id) => {
    if (!window.confirm("Slette denne loggføringen?")) return;
    const res = await apiFetch("/api/v2/logg/" + id, { method: "DELETE" });
    if (res.status === 401) { api.reload(); return; }
    toast(res.ok ? "Slettet." : await errorMessage(res, "Fikk ikke slettet."));
    api.reload({ quiet: true });
  };

  const t = d.today;
  const todayLine = t.entries
    ? `I dag: ${t.fed ? t.fed + " fôret" : "ikke fôret"}${t.ph ? " · " + t.ph + " pH" : ""} · ${t.entries} ${t.entries === 1 ? "loggføring" : "loggføringer"}`
    : "Ingenting logget i dag ennå.";

  return (
    <div className={s.layout}>
      <div className={"stack " + s.form}>
        <h1 className="h1"><span className="eyebrow" aria-hidden="true">Drift · Gjør</span>Gjør</h1>
        <p className="lead num">{todayLine}</p>

        <div className="act" role="group" aria-label="Fôr alle">
          <button type="button" className="act-main" onClick={feedAll} disabled={feeding} aria-busy={feeding}>
            <span className="t num">{feeding ? "Lagrer" : `Fôr alle · ${fmtNum(liters, 1)} l`}</span>
            <span className="s">{d.systems.length} bed · samme mengde til hvert{d.last_feed != null ? ` · sist ${fmtNum(d.last_feed, 1)} l` : ""}</span>
          </button>
          <button type="button" className="act-step" onClick={() => setAmount(Math.max(STEP, liters - STEP))} aria-label="Mindre">−</button>
          <button type="button" className="act-step" onClick={() => setAmount(liters + STEP)} aria-label="Mer">+</button>
        </div>

        <form className="stack panel" onSubmit={save} noValidate>
          <h2 className="h2">Ett bed</h2>
          <div className="chips" role="group" aria-label="Bed">
            {d.systems.map((x) => (
              <button key={x.id} type="button" className="chip" aria-pressed={sel === x.name} onClick={() => { setSystem(x.name); setError(""); }}>{x.name}</button>
            ))}
          </div>
          <Field id="logg-ph" label={<span className="unit">pH</span>} value={f.ph} onChange={set("ph")} hint={PH_HINT} />
          <div className="grid2">
            <Field id="logg-foring" label="Fôring, liter" value={f.feed} onChange={set("feed")} />
            <Field id="logg-hosting" label="Høsting, liter" value={f.harvest} onChange={set("harvest")} hint="Oppretter en batch" />
          </div>
          <div className="field">
            <label htmlFor="logg-notat">Notat</label>
            <input id="logg-notat" className="input" type="text" value={f.notes} onChange={set("notes")} maxLength={2000} enterKeyHint="done" autoComplete="off" />
          </div>
          <div className="photo">
            {f.photo ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element -- a local preview */}
                <img src={f.photo} alt="" />
                <button type="button" className="link" onClick={() => setF((o) => ({ ...o, photo: null }))}>Fjern bildet</button>
              </>
            ) : (
              <button type="button" className="btn ghost" onClick={() => fileRef.current && fileRef.current.click()}>Ta bilde</button>
            )}
            <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={pickPhoto} />
          </div>
          <button type="button" className="switch" aria-pressed={f.avvik} onClick={() => setF((o) => ({ ...o, avvik: !o.avvik }))}>
            <span>Avvik</span><span className="box" aria-hidden="true" />
          </button>
          {error ? <p className="notice error" role="alert">{error}</p> : null}
          <button className="btn wide" type="submit" disabled={saving || empty} aria-busy={saving}>{saving ? "Lagrer" : "Lagre · " + sel}</button>
        </form>
      </div>

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

// The phone's camera gives 3–12 MB; the entry needs a picture, not a print.
// Longest side 1280 px, JPEG at 0.8: about 150–300 KB.
function shrink(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, 1280 / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * k);
      c.height = Math.round(img.height * k);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL("image/jpeg", 0.8));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("bilde")); };
    img.src = url;
  });
}

// A decimal field. Text with a decimal keypad, so "7,1" and "7.1" both
// reach the server as typed; it accepts either.
function Field({ id, label, value, onChange, hint }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input id={id} className="input num" type="text" inputMode="decimal" value={value} onChange={onChange} autoComplete="off" enterKeyHint="next" />
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
  if (e.feed_liters != null) parts.push(`fôring ${fmtNum(e.feed_liters, 1)} l`);
  if (e.harvest_liters != null) parts.push(`høsting ${fmtNum(e.harvest_liters, 0)} l`);
  if (e.moisture_handheld != null) parts.push(`fukt ${fmtNum(e.moisture_handheld, 0)} % håndholdt`);
  if (e.temperature != null) parts.push(`temp ${fmtNum(e.temperature, 1)} °C håndholdt`);
  return (
    <li>
      <div className="spread">
        <span className="num">{[when, e.system, who, "manuell"].filter(Boolean).join(" · ")}{e.avvik ? <> <span className="tag">avvik</span></> : null}</span>
        {e.deletable ? <button type="button" className="link" onClick={() => onDelete(e.id)}>Slett</button> : null}
      </div>
      {parts.length ? <div className="small num">{parts.join(" · ")}</div> : null}
      {e.notes ? <div style={{ marginTop: 4 }}>{e.notes}</div> : null}
      {e.photos && e.photos.length ? (
        <div className="row" style={{ marginTop: 8 }}>
          {e.photos.map((id) => (
            <a key={id} href={"/api/v2/photo/" + id} target="_blank" rel="noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element -- stored photo */}
              <img className="thumb" src={"/api/v2/photo/" + id} alt="Bilde fra loggføringen" loading="lazy" />
            </a>
          ))}
        </div>
      ) : null}
    </li>
  );
}
