"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useApi, postJson, errorMessage } from "./api";
import { useToast } from "./Shell";
import Login from "./Login";
import { fmtNum, fmtWhen, fmtTime } from "@/lib/format";
import s from "./KanalerView.module.css";

const NONE = "none";
const HYGIENE = "hygiene";
const ROOM = "Rom (GW1200)";

// sensor_channels row → what the select shows.
function targetOf(c) {
  if (c.role === "bed" && c.system_id) return c.system_id;
  if (c.role === "hygiene") return HYGIENE;
  return NONE;
}

const fromData = (d) => d.channels.map((c) => ({ ...c, target: targetOf(c), label: c.label || "" }));

// "58,0 °C · 46 % · auto · kl 09:30" — enough to tell which sensor this is.
function hintLine(r) {
  const l = r.latest;
  if (!l) return "ingen måling";
  const temp = r.channel === 0 ? l.indoor_temp : l.temp;
  const pct = r.channel === 0 ? l.indoor_rh : l.moisture;
  const parts = [];
  if (temp != null) parts.push(fmtNum(temp, 1) + " °C");
  if (pct != null) parts.push(fmtNum(pct, 0) + " %");
  if (!parts.length && l.ec != null) parts.push("EC " + fmtNum(l.ec, 0) + " µS/cm");
  if (!parts.length) return "ingen måling";
  return [...parts, "auto", fmtWhen(l.ts)].join(" · ");
}

// ["CH2"] → "CH2"; ["CH2", "CH4"] → "CH2 og CH4"; more → "CH2, CH4 og CH5"
function listNo(items) {
  if (items.length <= 1) return items.join("");
  return items.slice(0, -1).join(", ") + " og " + items[items.length - 1];
}

export default function KanalerView() {
  const api = useApi("/api/v2/kanaler");
  const toast = useToast();
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(false);
  const base = useMemo(() => (api.data ? fromData(api.data) : null), [api.data]);

  if (api.status === "auth") return <Login onLogin={() => api.reload()} />;
  if (api.status === "loading") return <p className="lead">Laster.</p>;
  if (api.status === "error" && !api.data) {
    return (
      <div className="stack">
        <Link href="/mer" className="link phone-only">Mer</Link>
        <p className="notice error">{api.error} <button className="link" type="button" onClick={() => api.reload()}>Prøv igjen</button></p>
      </div>
    );
  }

  const systems = api.data.systems;
  const rows = draft || base;
  // Sensors first, the room last.
  const ordered = [...rows.filter((r) => r.channel > 0), ...rows.filter((r) => r.channel === 0)];

  const edit = (channel, patch) =>
    setDraft((cur) => (cur || base).map((r) => (r.channel === channel ? { ...r, ...patch } : r)));

  // The same bed on two channels is allowed, but it must be visible.
  const alsoOn = (row) => {
    if (row.target === NONE || row.target === HYGIENE) return null;
    const others = rows.filter((r) => r.channel > 0 && r.channel !== row.channel && r.target === row.target).map((r) => "CH" + r.channel);
    return others.length ? "Også valgt for " + listNo(others) : null;
  };

  const save = async () => {
    if (busy) return;
    setBusy(true);
    const body = { channels: rows.map((r) => ({ channel: r.channel, target: r.target, label: r.label })) };
    const res = await postJson("/api/v2/kanaler", body, "PUT");
    if (!res.ok) {
      setBusy(false);
      toast(await errorMessage(res, "Fikk ikke lagret."));
      return;
    }
    const d = await res.json();
    setDraft(fromData(d));
    setBusy(false);
    toast("Lagret " + fmtTime(new Date()));
  };

  return (
    <div className="stack-l">
      <header className="stack">
        <Link href="/mer" className="link">Mer</Link>
        <h1 className="h1"><span className="eyebrow" aria-hidden="true">Mer · Kanaler</span>Kanaler</h1>
        <p className="lead">Hvilken sensor står hvor. Lagre når alt stemmer.</p>
        <p className="small">Sensorene rapporterer uansett. Tildelingen bestemmer bare hvilket kort tallene vises på.</p>
        <hr className="rule desk-only" />
      </header>

      <ul className="list">
        {ordered.map((r) => {
          const orphan = r.target !== NONE && r.target !== HYGIENE && !systems.some((sys) => sys.id === r.target);
          const dup = alsoOn(r);
          return (
            <li key={r.channel} className={s.row}>
              <div className={s.head}>
                <div className={s.ch}>CH{r.channel}</div>
                <div className="small num">{hintLine(r)}</div>
                {r.hint ? <div className="small">Ecowitt: {r.hint}</div> : null}
              </div>
              <div>
                {r.channel === 0 ? (
                  <div className={s.fixed}>{ROOM}</div>
                ) : (
                  <div className="field">
                    <label htmlFor={"kanal-" + r.channel + "-bed"}>Bed</label>
                    <select
                      id={"kanal-" + r.channel + "-bed"}
                      className="select"
                      value={r.target}
                      onChange={(e) => edit(r.channel, { target: e.target.value })}
                    >
                      <option value={NONE}>Ikke tildelt</option>
                      {systems.map((sys) => <option key={sys.id} value={sys.id}>{sys.name}</option>)}
                      {orphan ? <option value={r.target}>Inaktivt system</option> : null}
                      <option value={HYGIENE}>Hygienisering (prekompost)</option>
                    </select>
                  </div>
                )}
                {dup ? <div className={s.note}>{dup}</div> : null}
              </div>
              <div className="field">
                <label htmlFor={"kanal-" + r.channel + "-label"}>Merkelapp</label>
                <input
                  id={"kanal-" + r.channel + "-label"}
                  className="input"
                  type="text"
                  placeholder="Valgfritt"
                  maxLength={80}
                  value={r.label}
                  onChange={(e) => edit(r.channel, { label: e.target.value })}
                />
              </div>
            </li>
          );
        })}
      </ul>

      <div className={s.actions}>
        <button className="btn wide" type="button" onClick={save} disabled={busy} aria-busy={busy}>
          {busy ? "Lagrer" : "Lagre"}
        </button>
      </div>
    </div>
  );
}
