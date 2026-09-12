"use client";

import { Fragment, useEffect, useRef, useState } from "react";

/* ------------------------------------------------------------------ */
/* Shared helpers                                                      */
/* ------------------------------------------------------------------ */

// fetch with a hard timeout so a dead backend surfaces as an error message
// instead of a button that silently does nothing (the pre-rebuild behaviour
// on mobile was a request hanging for 300 s with no feedback at all).
// timeoutMs override: Gmail sync and AI routes legitimately run 20-30s.
async function api(path, opts = {}) {
  const { timeoutMs = 15000, ...rest } = opts;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    // Every view here is live operational data — a compliance log, an
    // inbox, a health status. There is no case where a cached response is
    // ever preferable to a fresh one, and mobile Safari in particular will
    // reuse a GET response on a flaky connection unless told not to.
    return await fetch(path, { ...rest, cache: "no-store", signal: ctrl.signal });
  } catch {
    return {
      ok: false,
      status: 0,
      json: async () => ({ error: "Fikk ikke kontakt med serveren — prøv igjen." }),
    };
  } finally {
    clearTimeout(t);
  }
}

async function failMsg(res, fallback) {
  const body = await res.json().catch(() => ({}));
  return body.error || fallback;
}

// Five clearly distinct brand tones (navy/gold/sage/rust/slate) — with the
// old palette CFT1, CFT3 and Wedge 1 were near-identical blues in the
// multi-series charts.
const SYS_COLORS = { CFT1: "#1C3A5C", CFT2: "#B8993A", CFT3: "#6B7544", "Wedge 1": "#A64B2A", "Breeder Bin": "#5A6270" };
const SYS_DASH = { CFT1: "", CFT2: "", CFT3: "", "Wedge 1": "", "Breeder Bin": "5 4" };
const METRIC_KEY = { TEMP: "temp", PH: "ph", FUKT: "fukt" };
const RANGE_LABEL = { "7D": "siste 7 dager", "30D": "siste 30 dager", "60D": "siste 60 dager", YTD: "i år", ALL: "hele historikken" };
const RANGES = ["7D", "30D", "60D", "YTD", "ALL"];
const METRICS = [["TEMP", "Temp"], ["PH", "pH"], ["FUKT", "Fukt"]];

function rangeDays(range) {
  if (range === "7D") return 7;
  if (range === "30D") return 30;
  if (range === "60D") return 60;
  if (range === "YTD") {
    const now = new Date();
    const jan1 = new Date(now.getFullYear(), 0, 1);
    return Math.max(7, Math.round((now - jan1) / 864e5) + 1);
  }
  return 365;
}

// Local (Norwegian) calendar date — toISOString() is UTC and puts 00:00–02:00
// summer-night entries on the wrong day.
function isoDaysAgo(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

function fmtDate(iso) {
  const parts = String(iso).split("-");
  return parts.length !== 3 ? iso : parts[2] + "." + parts[1] + "." + parts[0].slice(2);
}

// Phone logs can miss single measurements (NULL in public.logs) — show a
// dash instead of pretending the value was 0. Old Sheets imports carry raw
// float noise (73.19202) — one decimal is the real measurement precision.
function fmtVal(v, suffix = "") {
  if (v == null) return "—";
  const n = Number(v);
  return (Number.isFinite(n) ? Math.round(n * 10) / 10 : v) + suffix;
}

function fmtPh(v) {
  return v == null ? "—" : Number(v).toFixed(1);
}

function inRange(readings, range) {
  const min = isoDaysAgo(rangeDays(range) - 1);
  return readings.filter((r) => r.date >= min);
}

function buildSeries(readings, systems, metric, range) {
  const rows = inRange(readings, range);
  const key = METRIC_KEY[metric];
  return systems.map((id, i) => {
    const values = rows
      .filter((r) => r.system === id && r[key] != null)
      .sort((a, b) => {
        if (a.date !== b.date) return a.date < b.date ? -1 : 1;
        const la = String(a.logged_at || "");
        const lb = String(b.logged_at || "");
        if (la !== lb) return la < lb ? -1 : 1;
        return Number(a.rid || 0) - Number(b.rid || 0);
      })
      .map((r) => r[key]);
    const style =
      SYS_COLORS[id] !== undefined
        ? { color: SYS_COLORS[id], dash: SYS_DASH[id] || "" }
        : { color: ["#1C3A5C", "#B8993A", "#6B7544", "#A64B2A", "#5A6270"][i % 5], dash: i >= 5 ? "5 4" : "" };
    return { id, color: style.color, dash: style.dash, values };
  });
}

function findTarget(targets, metric) {
  return targets.find((t) => t.metric === metric) || { min: -Infinity, max: Infinity };
}

function countOutside(readings, targets) {
  const t = { temp: findTarget(targets, "temp"), ph: findTarget(targets, "ph"), fukt: findTarget(targets, "fukt") };
  let temp = 0;
  let ph = 0;
  let fukt = 0;
  for (const r of readings) {
    if (r.temp != null && (r.temp < t.temp.min || r.temp > t.temp.max)) temp++;
    if (r.ph != null && (r.ph < t.ph.min || r.ph > t.ph.max)) ph++;
    if (r.fukt != null && (r.fukt < t.fukt.min || r.fukt > t.fukt.max)) fukt++;
  }
  return { temp, ph, fukt, obs: readings.length };
}

function latestBySystem(readings, systems) {
  const out = {};
  for (const id of systems) {
    // No readings yet → undefined values render as "—", not a fabricated 0.
    out[id] = readings.find((r) => r.system === id) || {};
  }
  return out;
}

// Keep client-side reading state in the same order the bootstrap ships it,
// so "latest per system" lookups stay correct after backdated entries.
function sortReadings(rows) {
  return [...rows].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    const la = String(a.logged_at || "");
    const lb = String(b.logged_at || "");
    if (la !== lb) return la < lb ? 1 : -1;
    return Number(b.rid || 0) - Number(a.rid || 0);
  });
}

function PrintButton() {
  return (
    <button className="btn ghost sm no-print" onClick={() => window.print()}>Skriv ut</button>
  );
}

function PrintHeader({ title }) {
  return <div className="print-only">Verminord · {title} · {new Date().toLocaleDateString("nb-NO")}</div>;
}

function Logo({ variant }) {
  const [broken, setBroken] = useState(false);
  if (broken) {
    return (
      <div className="wordmark" style={{ color: variant === "dark" ? "var(--navy)" : "#fff" }}>
        VERMI<span className="wm2">NORD</span>
      </div>
    );
  }
  return (
    <img
      src={variant === "dark" ? "/logo-dark.png" : "/logo-white.png"}
      alt="Verminord"
      style={{ width: 130, display: "block" }}
      onError={() => setBroken(true)}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Login                                                               */
/* ------------------------------------------------------------------ */

function LoginView({ team, onLogin }) {
  const names = team.length ? team.map((t) => t.name) : ["Mathias", "Martin", "Regnskap"];
  const [name, setName] = useState(names[0]);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await api("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, password }),
    });
    setBusy(false);
    if (!res.ok) {
      setError(await failMsg(res, "Innlogging feilet."));
      return;
    }
    onLogin();
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <form className="card" style={{ padding: "34px 32px", width: "100%", maxWidth: 380 }} onSubmit={submit}>
        <div>
          <Logo variant="dark" />
          <span style={{ display: "block", marginTop: 6, fontSize: "9.5px", letterSpacing: ".22em", fontWeight: 400, color: "var(--muted)", textTransform: "uppercase" }}>
            Intern · Drift Jæren
          </span>
        </div>
        <div className="rule tight" />
        <div className="field">
          <label>Bruker</label>
          <select className="select" value={name} onChange={(e) => setName(e.target.value)}>
            {names.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Passord</label>
          <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
        </div>
        <button className="btn" type="submit" disabled={busy}>Logg inn</button>
        {error ? <div style={{ marginTop: 14, fontSize: 12, color: "var(--gold)" }}>{error}</div> : null}
      </form>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Line chart (SVG)                                                    */
/* ------------------------------------------------------------------ */

function Chart({ series, metric, range, h = 300, target }) {
  const base = metric === "TEMP" ? [15, 30] : metric === "PH" ? [6.5, 8.5] : [55, 90];
  let lo = base[0];
  let hi = base[1];
  series.forEach((s) => s.values.forEach((v) => {
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }));
  if (target) {
    if (target.min < lo) lo = target.min;
    if (target.max > hi) hi = target.max;
  }
  lo = Math.floor(lo) - 1;
  hi = Math.ceil(hi) + 1;
  const y = (v) => h - 26 - ((v - lo) / (hi - lo)) * (h - 16 - 26);

  const grid = [];
  for (let i = 0; i <= 4; i++) {
    const val = lo + ((hi - lo) * i) / 4;
    const gy = y(val);
    grid.push(
      <line key={"g" + i} x1={42} x2={988} y1={gy} y2={gy} stroke="rgba(28,58,92,0.10)" strokeWidth={1} vectorEffect="non-scaling-stroke" />,
      <text key={"t" + i} x={34} y={gy + 3} textAnchor="end" fontSize={11} fill="#5A6270">
        {metric === "PH" ? val.toFixed(1) : Math.round(val)}
      </text>
    );
  }

  const lines = series.flatMap((s, i) => {
    if (!s.values.length) return [];
    const x = (idx) => (s.values.length === 1 ? 515 : 42 + (946 * idx) / (s.values.length - 1));
    const out = [];
    if (s.values.length > 1) {
      const pts = s.values.map((v, idx) => x(idx) + "," + y(v)).join(" ");
      out.push(
        <polyline key={"p" + i} points={pts} fill="none" stroke={s.color} strokeWidth={1.7} strokeDasharray={s.dash || undefined} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" opacity={s.dash ? 0.85 : 1} />
      );
    }
    const last = s.values.length - 1;
    out.push(<circle key={"c" + i} cx={x(last)} cy={y(s.values[last])} r={2.6} fill={s.color} />);
    return out;
  });

  const days = rangeDays(range);
  const dateLabel = (daysAgo) => {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    return String(d.getDate()).padStart(2, "0") + "." + String(d.getMonth() + 1).padStart(2, "0") + "." + String(d.getFullYear()).slice(2);
  };

  return (
    <svg viewBox={"0 0 1000 " + h} width="100%" style={{ display: "block", height: "auto", overflow: "visible" }} preserveAspectRatio="none">
      {grid}
      {target ? (
        <>
          <rect x={42} width={946} y={y(target.max)} height={Math.max(0, y(target.min) - y(target.max))} fill="rgba(184,153,58,0.08)" />
          <line x1={42} x2={988} y1={y(target.min)} y2={y(target.min)} stroke="#B8993A" strokeWidth={1} strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
          <line x1={42} x2={988} y1={y(target.max)} y2={y(target.max)} stroke="#B8993A" strokeWidth={1} strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
          <text x={988} y={y(target.max) - 5} textAnchor="end" fontSize={11} fill="#B8993A">mål {target.min}–{target.max}</text>
        </>
      ) : null}
      {lines}
      <text x={42} y={h - 6} fontSize={11} fill="#5A6270">{dateLabel(days - 1)}</text>
      <text x={500} y={h - 6} textAnchor="middle" fontSize={11} fill="#5A6270">{dateLabel(Math.round((days - 1) / 2))}</text>
      <text x={988} y={h - 6} textAnchor="end" fontSize={11} fill="#5A6270">{dateLabel(0)}</text>
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Brief                                                               */
/* ------------------------------------------------------------------ */

function fmtReceived(ts) {
  const d = new Date(ts);
  return String(d.getDate()).padStart(2, "0") + "." + String(d.getMonth() + 1).padStart(2, "0") + " " + String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
}

const hhmm = (m) => String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");
const DAY_KEYS = ["Søndag", "Mandag", "Tirsdag", "Onsdag", "Torsdag", "Fredag", "Lørdag"];

// Connector health, surfaced where it cannot be missed.
//
// The whole point of the health table is that a dead integration announces
// itself. A badge buried in Innstillinger would repeat the original failure —
// Gmail was broken for 15 days behind a panel nobody opened — so this renders
// at the top of the Brief and only when something is actually wrong. Silence
// is the healthy state; a banner means act.
function HelseBanner({ integrations }) {
  const bad = (integrations || []).filter((i) => i.status === "gul" || i.status === "rød");
  if (!bad.length) return null;
  // The palette has one alert colour (gold) and no red, so severity is carried
  // by the per-row status tag rather than by tinting the banner two ways.
  return (
    <div style={{
      border: "1px solid var(--line)", borderLeft: "3px solid var(--gold)",
      background: "#fff", borderRadius: 2, padding: "14px 18px", marginBottom: 20,
    }}>
      <div className="eyebrow" style={{ color: "var(--gold)", marginBottom: 8 }}>
        {bad.length === 1 ? "1 integrasjon svarer ikke" : bad.length + " integrasjoner svarer ikke"}
      </div>
      {bad.map((i) => (
        <div key={i.key} style={{ display: "flex", gap: 12, alignItems: "baseline", flexWrap: "wrap", marginTop: 4 }}>
          <span className="tag" style={{ minWidth: 54, textAlign: "center" }}>{i.status.toUpperCase()}</span>
          <span style={{ fontWeight: 500 }}>{i.label}</span>
          <span className="mut" style={{ fontSize: 12 }}>
            {i.last_ok_at
              ? "sist OK " + fmtReceived(i.last_ok_at)
              : "har aldri svart"}
            {i.last_error ? " · " + i.last_error : ""}
          </span>
        </div>
      ))}
    </div>
  );
}

// The tick box. Renders an inert placeholder (not nothing) for read-only users
// so the grid columns still line up between the two cases.
function RoutineTick({ item, tickable, busy, onToggle }) {
  if (!tickable) return <span />;
  return (
    <button
      className="rtick"
      onClick={onToggle}
      disabled={busy}
      aria-label={(item.done ? "Angre" : "Merk som gjort") + ": " + item.text}
      title={item.done ? "Gjort" + (item.done_by ? " av " + item.done_by : "") : "Merk som gjort"}
      style={{
        border: "1px solid " + (item.done ? "var(--navy)" : "var(--line)"),
        background: item.done ? "var(--navy)" : "#fff",
        color: "#fff",
        cursor: busy ? "wait" : "pointer",
        opacity: busy ? 0.5 : 1,
      }}
    >
      {item.done ? "✓" : ""}
    </button>
  );
}

// UKEPLAN SOLO DRIFT, resolved against the wall clock — and tickable.
//
// The plan used to render straight from the bootstrap payload, which showed
// what to do and recorded nothing about whether it happened. It now loads from
// /api/routines so each item carries its done state for today, and ticking
// writes a dated record. For a plan whose first rule is "Logg hver dag —
// loggen er beviset overfor inspeksjonen", the record is the point.
function DagsRamme({ routineItems, houseRules, canEdit }) {
  const [now, setNow] = useState(() => new Date());
  const [live, setLive] = useState(null);
  const [busy, setBusy] = useState(null);

  const today = new Date().toISOString().slice(0, 10);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api("/api/routines?date=" + today);
        if (!res.ok || cancelled) return;
        setLive(await res.json());
      } catch { /* falls back to the bootstrap copy, just without tick state */ }
    })();
    return () => { cancelled = true; };
  }, [today]);

  const toggle = async (item) => {
    if (!canEdit || busy) return;
    const next = !item.done;
    setBusy(item.id);
    // Optimistic — a checkbox that waits on a round trip feels broken on a
    // phone with one bar of signal out by the beds.
    setLive((s) => s && ({
      ...s,
      items: s.items.map((i) => (i.id === item.id ? { ...i, done: next } : i)),
    }));
    try {
      const res = await api("/api/routines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item_id: item.id, date: today, done: next }),
      });
      if (!res.ok) throw new Error("failed");
    } catch {
      setLive((s) => s && ({
        ...s,
        items: s.items.map((i) => (i.id === item.id ? { ...i, done: !next } : i)),
      }));
    } finally {
      setBusy(null);
    }
  };

  useEffect(() => {
    // Tick on the minute boundary — a page left open overnight would
    // otherwise keep highlighting yesterday's block.
    let iv;
    const to = setTimeout(() => {
      setNow(new Date());
      iv = setInterval(() => setNow(new Date()), 60000);
    }, (60 - new Date().getSeconds()) * 1000);
    return () => { clearTimeout(to); if (iv) clearInterval(iv); };
  }, []);

  // Prefer the live payload (carries done state); fall back to the bootstrap
  // copy so the plan still renders if /api/routines is slow or fails.
  const items = (live && live.items) || routineItems || [];
  const frame = items.filter((i) => i.weekday == null);
  if (!frame.length) return null;

  const dow = now.getDay() === 0 ? 7 : now.getDay();
  const mins = now.getHours() * 60 + now.getMinutes();
  const active = frame.find((b) => mins >= b.start_min && mins < b.end_min) || null;
  const todaysRows = items.filter((i) => i.weekday === dow);
  const byBlock = (b) => todaysRows.filter((i) => i.block === b);
  const cov = live && live.coverage;
  const tickable = canEdit && !!live;
  const rules = (houseRules || []).filter((r) => r.kind === "regel");
  const apenSak = (houseRules || []).find((r) => r.kind === "apen_sak");
  const cuts = frame.filter((b) => b.drop_rank).sort((a, b) => a.drop_rank - b.drop_rank);

  return (
    <>
      <div className="rule" />
      <div className="sechead">
        <span className="eyebrow">Dagens ramme · {DAY_KEYS[now.getDay()]}</span>
        <span className="mut" style={{ fontSize: 11 }}>
          {cov
            ? `${cov.required_done}/${cov.required_total} kuttes-aldri gjort · ${cov.done}/${cov.total} totalt`
            : "UKEPLAN SOLO DRIFT v1 · tider er ankere, ikke lover"}
        </span>
      </div>

      <div style={{ border: "1px solid var(--line)", background: "#fff", padding: "12px 18px", marginBottom: 14 }}>
        <span className="eyebrow" style={{ color: "var(--navy)", marginRight: 14 }}>NÅ</span>
        {active ? (
          <>
            <span style={{ fontVariantNumeric: "tabular-nums", marginRight: 12 }}>{hhmm(active.start_min)}–{hhmm(active.end_min)}</span>
            <strong>{active.block} — {active.text}</strong>
            {active.never_drop ? <span className="tag gold" style={{ marginLeft: 10 }}>Kuttes aldri</span> : null}
          </>
        ) : (
          <span className="mut">{dow >= 6 ? "Helg — ingen fast ramme." : "Utenfor arbeidsrammen (07:30–16:00)."}</span>
        )}
      </div>

      <div style={{ border: "1px solid var(--line)", background: "#fff" }}>
        {frame.map((b, i) => {
          const isNow = active && active.id === b.id;
          const past = !isNow && b.end_min <= mins;
          return (
            <div className="rrow" key={b.id} style={{
              display: "grid", gridTemplateColumns: "28px 220px 1fr", gap: 12, alignItems: "baseline",
              padding: "10px 18px",
              borderTop: i ? "1px solid var(--line)" : "none",
              background: isNow ? "var(--cream)" : "transparent",
              // A ticked block is done, not gone — dim it like a past block so
              // the eye skips it, but never hide it. The full day has to stay
              // readable as a record.
              opacity: past || b.done ? 0.45 : 1,
            }}>
              <span className="rrow-tick">
                <RoutineTick item={b} tickable={tickable} busy={busy === b.id} onToggle={() => toggle(b)} />
              </span>
              <div style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
                <span style={{ fontVariantNumeric: "tabular-nums", fontSize: 12 }}>{hhmm(b.start_min)}–{hhmm(b.end_min)}</span>
                <span className="eyebrow" style={{ fontSize: 10 }}>{b.block}</span>
              </div>
              <div>
                <div style={{
                  fontWeight: isNow ? 600 : 500,
                  textDecoration: b.done ? "line-through" : "none",
                }}>
                  {b.text}
                  {b.drop_rank ? <span className="mut" style={{ fontSize: 10, marginLeft: 10 }}>KUTT {b.drop_rank}</span> : null}
                  {b.never_drop ? <span style={{ fontSize: 10, marginLeft: 10, color: "var(--gold)" }}>ALDRI KUTT</span> : null}
                </div>
                {b.detail ? <div className="mut" style={{ fontSize: 12, marginTop: 2 }}>{b.detail}</div> : null}
                {b.done && b.done_by ? (
                  <div className="mut" style={{ fontSize: 11, marginTop: 2 }}>✓ {b.done_by}</div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      {todaysRows.length ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 0, border: "1px solid var(--line)", borderTop: "none", background: "#fff" }}>
          {["CEO-BLOKK", "FYSISK", "ELLERS"].map((blk) => (
            <div key={blk} style={{ padding: "14px 18px", borderRight: "1px solid var(--line)" }}>
              <div className="eyebrow" style={{ fontSize: 10, marginBottom: 6 }}>{blk}</div>
              {byBlock(blk).length ? byBlock(blk).map((i) => (
                <div key={i.id} style={{ marginBottom: 6 }}>
                  <div style={{ fontWeight: 500 }}>
                    {i.text}
                    {i.never_drop ? <span className="mut" style={{ fontSize: 10, marginLeft: 8, color: "var(--gold)" }}>ALDRI KUTT</span> : null}
                  </div>
                  {i.detail ? <div className="mut" style={{ fontSize: 12 }}>{i.detail}</div> : null}
                </div>
              )) : <span className="mut">—</span>}
            </div>
          ))}
        </div>
      ) : null}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(290px, 1fr))", gap: 16, marginTop: 16 }}>
        <div style={{ border: "1px solid var(--line)", borderLeft: "3px solid var(--gold)", background: "#fff", padding: "14px 18px" }}>
          <div className="eyebrow" style={{ marginBottom: 10 }}>Når dagen ryker · kutt i rekkefølge</div>
          {cuts.map((b, i) => (
            <div key={b.id} style={{ marginBottom: 4 }}>
              <span className="mut" style={{ marginRight: 8 }}>{i + 1}.</span>{b.block}
            </div>
          ))}
          <div className="mut" style={{ fontSize: 12, marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--line)" }}>
            Kuttes aldri: {frame.filter((b) => b.never_drop).map((b) => b.block.toLowerCase()).join(", ")}, samt mating/høsting planlagt i dag.
          </div>
        </div>
        <div style={{ border: "1px solid var(--line)", borderLeft: "3px solid var(--navy)", background: "#fff", padding: "14px 18px" }}>
          <div className="eyebrow" style={{ marginBottom: 10 }}>Faste regler</div>
          {rules.map((r) => (
            <div key={r.text} style={{ marginBottom: 7 }}>
              <div style={{ fontWeight: 500 }}>{r.text}</div>
              {r.detail ? <div className="mut" style={{ fontSize: 12 }}>{r.detail}</div> : null}
            </div>
          ))}
        </div>
      </div>

      {apenSak ? (
        <div style={{ border: "1px solid var(--line)", borderLeft: "3px solid var(--gold)", background: "#fff", padding: "14px 18px", marginTop: 16 }}>
          <div className="eyebrow" style={{ color: "var(--gold)", marginBottom: 6 }}>Åpen sak</div>
          <div style={{ fontWeight: 500 }}>{apenSak.text}</div>
          {apenSak.detail ? <div className="mut" style={{ fontSize: 12, marginTop: 3 }}>{apenSak.detail}</div> : null}
        </div>
      ) : null}
    </>
  );
}

// Live values from the Ecowitt soil probes.
//
// Renders nothing until the first reading arrives, so it stays invisible until
// the hardware is actually paired rather than sitting there as an empty
// promise. Once data exists it cannot be missed — which is the whole point:
// the readings were being written and never read.
function SensorStrip({ sensorLatest }) {
  const rows = sensorLatest || [];
  if (!rows.length) return null;

  const now = Date.now();
  const age = (r) => Math.round((now - new Date(r.measured_at).getTime()) / 60000);
  // The gateway posts continuously (expected_interval_min 30). Past an hour a
  // probe is not "a bit behind", it has stopped — usually a flat battery.
  const stale = rows.filter((r) => age(r) > 60).length;
  const unnamed = rows.filter((r) => /^Kanal \d+$/.test(r.system)).length;

  const fmt = (v, unit) => (v == null ? "–" : Math.round(v * 10) / 10 + unit);
  const ago = (m) => (m < 60 ? m + " min siden" : Math.round(m / 60) + " t siden");

  return (
    <>
      <div className="rule" />
      <div className="sechead">
        <span className="eyebrow">Sensorer · autologger</span>
        <span className="mut" style={{ fontSize: 11 }}>
          {rows.length} {rows.length === 1 ? "kanal" : "kanaler"}
          {stale ? " · " + stale + " svarer ikke" : ""}
          {unnamed ? " · " + unnamed + " uten navn" : ""}
        </span>
      </div>
      {unnamed ? (
        <div className="mut" style={{ fontSize: 12, marginBottom: 10 }}>
          Gi kanalene navn under Innstillinger → Sensorer, ellers er målingene
          vanskelige å tolke i ettertid.
        </div>
      ) : null}
      <div style={{ border: "1px solid var(--line)", borderRadius: 2, background: "#fff" }}>
        {rows.map((r, i) => {
          const m = age(r);
          const dead = m > 60;
          return (
            <div key={r.channel} style={{
              display: "grid", gridTemplateColumns: "auto 1fr auto auto auto auto",
              gap: 14, alignItems: "baseline", padding: "11px 18px",
              borderTop: i ? "1px solid var(--line2)" : "none",
              opacity: dead ? 0.5 : 1,
            }}>
              <span className="mut" style={{ fontVariantNumeric: "tabular-nums", fontSize: 11 }}>
                CH{r.channel}
              </span>
              <span style={{ fontWeight: 500 }}>{r.system}</span>
              <span style={{ fontVariantNumeric: "tabular-nums" }}>{fmt(r.temp, "°C")}</span>
              <span style={{ fontVariantNumeric: "tabular-nums" }} className="mut">
                {fmt(r.moisture, "%")}
              </span>
              <span style={{ fontVariantNumeric: "tabular-nums" }} className="mut">
                {r.ec == null ? "–" : Math.round(r.ec) + " µS"}
              </span>
              <span className="mut" style={{ fontSize: 11, color: dead ? "var(--gold)" : undefined }}>
                {dead ? "stille " + ago(m) : ago(m)}
              </span>
            </div>
          );
        })}
      </div>
    </>
  );
}

function BriefView({ data, range, setRange, metric, setMetric, canEdit, goToInbox, goToSeo }) {
  const inbox = data.inbox || [];
  const inboxCounts = data.inboxCounts || { total: 0, urgent: 0 };
  const active = data.systems.filter((s) => s.status === "I drift").map((s) => s.id);
  const series = buildSeries(data.readings, active, metric, range);

  const stats = (() => {
    const all = series.flatMap((s) => s.values);
    if (!all.length) return { min: "—", max: "—", avg: "—" };
    const lo = Math.min(...all);
    const hi = Math.max(...all);
    const avg = all.reduce((a, b) => a + b, 0) / all.length;
    const unit = metric === "TEMP" ? "°C" : metric === "FUKT" ? "%" : "";
    const f = metric === "PH" ? (v) => v.toFixed(1) : (v) => Math.round(v);
    return { min: f(lo) + unit, max: f(hi) + unit, avg: f(avg) + unit };
  })();

  const outside = countOutside(inRange(data.readings, range), data.targets);
  const score = outside.obs
    ? Math.max(0, Math.min(100, 100 - Math.round(((outside.temp + outside.ph + outside.fukt) / (3 * outside.obs)) * 150)))
    : 100;

  const todayIso = isoDaysAgo(0);
  const today = data.readings.filter((r) => r.date === todayIso);
  const avvikToday = today.filter((r) => r.avvik).length;
  const openTasks = data.tasks.filter((t) => t.open);
  const undoneChecks = data.checklist.filter((c) => !c.done).length;
  const openTotal = openTasks.length + undoneChecks;
  const activeProjects = data.projects.filter((p) => p.col !== "Fullført").length;
  const doneProjects = data.projects.filter((p) => p.col === "Fullført").length;
  const runningProjects = data.projects.filter((p) => p.col === "Pågår").length;

  const latest = {};
  for (const id of active) latest[id] = data.readings.find((r) => r.system === id);
  const t = {
    temp: data.targets.find((x) => x.metric === "temp"),
    ph: data.targets.find((x) => x.metric === "ph"),
    fukt: data.targets.find((x) => x.metric === "fukt"),
  };
  const bad = (v, tt) => v != null && !!tt && (v < tt.min || v > tt.max);
  const outsideNow = active.filter((id) => {
    const r = latest[id];
    return !!r && (bad(r.temp, t.temp) || bad(r.ph, t.ph) || bad(r.fukt, t.fukt));
  }).length;

  const kpis = [
    { label: "Avvik i dag", value: String(avvikToday), cls: avvikToday ? "gold" : "", caption: today.length + " målinger loggført i dag" },
    { label: "Aktive systemer", value: String(active.length), cls: "", caption: outsideNow + " utenfor målområde" },
    { label: "Aktive prosjekter", value: String(activeProjects), cls: "", caption: runningProjects + " påbegynt · " + doneProjects + " fullført" },
    { label: "Åpne oppgaver", value: String(openTotal), cls: "gold", caption: openTasks.length + " krever handling" },
  ];

  return (
    <div>
      <span className="eyebrow">Oversikt · Brief</span>
      <HelseBanner integrations={data.integrations} />
      <div className="hero">
        {avvikToday === 0 ? "Ingen avvik i dag." : avvikToday + (avvikToday === 1 ? " avvik i dag." : " avvik i dag.")}
        <span className="li"> {outsideNow === 0 ? "Alt innenfor mål." : outsideNow + " utenfor mål."}</span>
      </div>
      <div className="herosub">
        Aktive: {active.length} systemer · Backlog: {openTasks.length} · Loggført i dag: {today.length}
      </div>
      <div className="rule" />
      <div className="kpirow">
        {kpis.map((k) => (
          <div className="kpi" key={k.label}>
            <div className="k">{k.label}</div>
            <div className={"v " + k.cls}>{k.value}</div>
            <div className="c">{k.caption}</div>
          </div>
        ))}
      </div>
      <SensorStrip sensorLatest={data.sensorLatest} />
      <DagsRamme routineItems={data.routineItems} houseRules={data.houseRules} canEdit={canEdit} />
      <div className="rule" />
      <div className="sechead">
        <span className="eyebrow">Helsestatus · Drift</span>
        <div className="toggle">
          {RANGES.map((r) => (
            <button key={r} className={"tbtn " + (range === r ? "on" : "")} onClick={() => setRange(r)}>{r}</button>
          ))}
        </div>
      </div>
      <div className="statgrid">
        <div className="score">
          {score}<sup> /100</sup>
        </div>
        <div className="mstat">
          <div className="k">Temp utenfor mål</div>
          <div className={"v " + (outside.temp > 0 ? "warn" : "")}>{outside.temp}</div>
          <div className="c">av {outside.obs} obs</div>
        </div>
        <div className="mstat">
          <div className="k">pH utenfor mål</div>
          <div className={"v " + (outside.ph > 0 ? "warn" : "")}>{outside.ph}</div>
          <div className="c">av {outside.obs} obs</div>
        </div>
        <div className="mstat">
          <div className="k">Fukt utenfor mål</div>
          <div className={"v " + (outside.fukt > 0 ? "warn" : "")}>{outside.fukt}</div>
          <div className="c">av {outside.obs} obs</div>
        </div>
        <div className="rt">
          <div className="toggle">
            {METRICS.map(([key, label]) => (
              <button key={key} className={"tbtn " + (metric === key ? "on" : "")} onClick={() => setMetric(key)}>{label}</button>
            ))}
          </div>
        </div>
      </div>
      <div className="chartwrap">
        <div className="charthead">
          <span className="eyebrow">Produksjonslogger · {RANGE_LABEL[range]}</span>
        </div>
        <Chart series={series} metric={metric} range={range} target={data.targets.find((x) => x.metric === METRIC_KEY[metric])} />
        <div className="legend">
          {series.map((s) => (
            <span className="lg" key={s.id}>
              <span className="sw" style={{ background: s.color, opacity: s.dash ? 0.8 : 1 }} />
              {s.id}
            </span>
          ))}
          <span className="lgmeta">
            <span>Min <b>{stats.min}</b></span>
            <span>Snitt <b>{stats.avg}</b></span>
            <span>Maks <b>{stats.max}</b></span>
          </span>
        </div>
      </div>
      <div className="rule" />
      {inbox.length ? (
        <div>
          <div className="sechead">
            <span className="eyebrow gold">Innboks · Viktig e-post</span>
            <button className="lnk" onClick={() => goToInbox()} style={{ fontSize: 12 }}>
              Se alle ({inboxCounts.total}) →
            </button>
          </div>
          <div className="tscroll">
            <table className="htbl">
              <tbody>
                {(() => {
                  const urgent = inbox.filter((m) => m.category === "Svar kreves" || m.priority === "høy" || m.is_starred);
                  const rows = urgent.length ? urgent.slice(0, 5) : inbox.slice(0, 3);
                  return rows.map((m, i) => (
                    <tr key={m.id}>
                      <td style={{ width: 4, padding: 0, background: prioColor(m.priority) }} />
                      <td className="hn">{String(i + 1).padStart(2, "0")}</td>
                      <td>
                        <div className="ht">
                          {m.link ? (
                            <a href={m.link} target="_blank" rel="noreferrer" style={{ color: "inherit", textDecoration: "none" }}>
                              {m.subject}
                            </a>
                          ) : (
                            m.subject
                          )}
                        </div>
                        <div className="hs">{m.sender} · {fmtReceived(m.received_at)} — {m.summary}</div>
                      </td>
                      <td className="rt"><span className={"tag " + (m.category === "Svar kreves" ? "gold" : "")}>{m.category}</span></td>
                      <td className="assignee">
                        {m.draft_body || m.draft_url ? (
                          <button className="lnk" onClick={() => goToInbox()} style={{ display: "inline-block", color: "var(--gold)", fontWeight: 600 }}>
                            Utkast klart →
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ));
                })()}
              </tbody>
            </table>
          </div>
          <div className="rule" />
        </div>
      ) : null}
      {/* The agent's three latest notices and the 7-day click count, so the
          Monday brief is one tap away without opening the SEO tab. Absent
          entirely when schema seo has nothing yet. */}
      {data.seo ? (
        <div>
          <div className="sechead">
            <span className="eyebrow gold">SEO-agenten · siste 7 dager</span>
            <button className="lnk" onClick={() => goToSeo()} style={{ fontSize: 12 }}>
              Åpne SEO{data.seo.unread ? " (" + data.seo.unread + " uleste)" : ""} →
            </button>
          </div>
          <div className="herosub" style={{ marginBottom: 12 }}>
            {data.seo.clicks7 || data.seo.clicksPrev
              ? "Søk: " + data.seo.clicks7 + " klikk (" + pctDelta(data.seo.clicks7, data.seo.clicksPrev) + " mot uka før)"
              : "Ingen søkedata ennå — se SEO-fanen for oppsett."}
          </div>
          {data.seo.latest.length ? (
            <div className="tscroll">
              <table className="htbl">
                <tbody>
                  {data.seo.latest.map((n, i) => (
                    <tr key={n.id}>
                      <td className="hn">{String(i + 1).padStart(2, "0")}</td>
                      <td>
                        <div className="ht">{n.title}</div>
                        <div className="hs">{n.source} · {fmtReceived(n.at)}</div>
                      </td>
                      <td className="rt"><span className={"tag " + (n.severity === "viktig" ? "gold" : "")}>{n.severity}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          <div className="rule" />
        </div>
      ) : null}
      <div className="sechead">
        <span className="eyebrow gold">Krever handling</span>
        <span className="mut">{openTasks.length} åpne</span>
      </div>
      <div className="tscroll">
        <table className="htbl">
          <tbody>
            {openTasks.map((task, i) => (
              <tr key={task.id}>
                <td className="hn">{String(i + 1).padStart(2, "0")}</td>
                <td>
                  <div className="ht">{task.title}</div>
                  <div className="hs">{task.sub}</div>
                </td>
                <td className="rt"><span className={"tag " + task.tagcls}>{task.tag}</span></td>
                <td className="assignee">{task.who}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Logg                                                                */
/* ------------------------------------------------------------------ */

function LoggView({ data, form, setForm, saveReading, toast, loggRange, setLoggRange, canEdit, editingReadingId, startEditReading, cancelEditReading, deleteReading }) {
  const active = data.systems.filter((s) => s.status === "I drift").map((s) => s.id);
  const [metric, setMetric] = useState("TEMP");
  const series = buildSeries(data.readings, active, metric, loggRange);
  const target = data.targets.find((t) => t.metric === METRIC_KEY[metric]);
  const [busy, setBusy] = useState(false);
  const [histSys, setHistSys] = useState("Alle");
  const [histFrom, setHistFrom] = useState("");
  const [histTo, setHistTo] = useState("");
  const [avvikOnly, setAvvikOnly] = useState(false);
  const [visible, setVisible] = useState(25);
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });
  const save = async () => {
    setBusy(true);
    await saveReading();
    setBusy(false);
  };

  // Every system that has ever been logged — history reaches beyond the
  // currently active ones (BIN 1/2, retired benches).
  const allSystems = [...new Set(data.readings.map((r) => r.system))].sort((a, b) => a.localeCompare(b, "nb"));
  const setFilter = (setter) => (val) => {
    setter(val);
    setVisible(25);
  };
  const filtered = data.readings.filter(
    (r) =>
      (histSys === "Alle" || r.system === histSys) &&
      (!histFrom || r.date >= histFrom) &&
      (!histTo || r.date <= histTo) &&
      (!avvikOnly || r.avvik)
  );
  const shown = filtered.slice(0, visible);

  // Two print modes: the standard button prints the charts + the visible
  // history; "Skriv ut historikk" prints EVERY filtered row (any date range)
  // as a dense spreadsheet — the log proof to hand Mattilsynet.
  const [printHist, setPrintHist] = useState(false);
  const printHistory = () => {
    setPrintHist(true);
    setTimeout(() => {
      let reset = false;
      const done = () => {
        if (reset) return;
        reset = true;
        window.removeEventListener("afterprint", done);
        setPrintHist(false);
      };
      window.addEventListener("afterprint", done);
      window.print();
      // Fallback for browsers that return from print() without firing afterprint.
      setTimeout(done, 1500);
    }, 60);
  };
  const histRangeLabel =
    (histSys === "Alle" ? "Alle systemer" : histSys) +
    " · " + (histFrom ? fmtDate(histFrom) : "start") + " – " + (histTo ? fmtDate(histTo) : "i dag") +
    (avvikOnly ? " · kun avvik" : "") +
    " · " + filtered.length + " målinger";

  return (
    <div className={printHist ? "print-hist" : ""}>
      <PrintHeader title={printHist ? "Produksjonslogg · " + histRangeLabel : "Produksjonslogg"} />
      <div className="sechead" style={{ marginBottom: 0 }}>
        <span className="eyebrow">Logg · Registrering</span>
        <PrintButton />
      </div>
      <div className="std-view">
      <div className="hero">Produksjon</div>
      <div className="herosub">Bekreft at målingen er loggført. Historiske målinger kan legges inn i ettertid.</div>
      <div className="rule" />
      <div className="charthead">
        <span className="eyebrow">Historikk · {metric === "TEMP" ? "Temperatur (°C)" : metric === "PH" ? "pH" : "Fuktighet (%)"} · {RANGE_LABEL[loggRange]}</span>
        <span style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <div className="toggle">
            {METRICS.map(([key, label]) => (
              <button key={key} className={"tbtn " + (metric === key ? "on" : "")} onClick={() => setMetric(key)}>{label}</button>
            ))}
          </div>
          <div className="toggle">
            {RANGES.map((r) => (
              <button key={r} className={"tbtn " + (loggRange === r ? "on" : "")} onClick={() => setLoggRange(r)}>{r}</button>
            ))}
          </div>
        </span>
      </div>
      <Chart series={series} metric={metric} range={loggRange} target={target} h={380} />
      <div className="legend">
        {series.map((s) => (
          <span className="lg" key={s.id}>
            <span className="sw" style={{ background: s.color, opacity: s.dash ? 0.8 : 1 }} />
            {s.id}
          </span>
        ))}
        {target ? (
          <span className="lgmeta">
            <span>Mål <b>{target.min}–{target.max}{metric === "TEMP" ? "°C" : metric === "FUKT" ? "%" : ""}</b></span>
          </span>
        ) : null}
      </div>
      <div className="rule" />
      <div className="card no-print" style={{ padding: "26px 28px", maxWidth: 640 }}>
        <div className="field">
          <label>System</label>
          <select className="select" value={form.system} onChange={set("system")}>
            {active.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Dato</label>
          <input className="input" type="date" value={form.date} onChange={set("date")} />
        </div>
        <div className="f2">
          <div className="field">
            <label>Temperatur (°C)</label>
            <input className="input" type="number" value={form.temp} onChange={set("temp")} />
          </div>
          <div className="field">
            <label>pH</label>
            <input className="input" type="number" step="0.1" value={form.ph} onChange={set("ph")} />
          </div>
        </div>
        <div className="f2">
          <div className="field">
            <label>Fuktighet (%)</label>
            <input className="input" type="number" value={form.fukt} onChange={set("fukt")} />
          </div>
          <div className="field">
            <label>Fôr (liter)</label>
            <input className="input" type="number" value={form.for_l} onChange={set("for_l")} />
          </div>
        </div>
        <div className="field">
          <label>Notater</label>
          <textarea className="ta" placeholder="Valgfritt" value={form.notat} onChange={set("notat")} />
        </div>
        <button className={"chk " + (form.avvik ? "done" : "")} onClick={() => setForm({ ...form, avvik: !form.avvik })} style={{ marginBottom: 20 }}>
          <span className="chkbox" />Flagg som avvik (utenfor målområde)
        </button>
        <button className="btn" onClick={save} disabled={!canEdit || busy} style={canEdit ? undefined : { opacity: 0.5, cursor: "default" }}>
          {editingReadingId ? "Oppdater måling" : "Lagre måling"}
        </button>
        {editingReadingId ? (
          <button className="lnk" style={{ marginTop: 10 }} onClick={cancelEditReading}>Avbryt endring</button>
        ) : null}
        {canEdit ? null : (
          <div className="mut" style={{ marginTop: 12 }}>Kun lesing — du kan ikke registrere målinger.</div>
        )}
      </div>
      <div className="rule" />
      <div className="sechead">
        <span className="eyebrow">Full historikk</span>
        <span className="mut">Viser {shown.length} av {filtered.length}</span>
      </div>
      <div className="chips no-print" style={{ marginBottom: 16, alignItems: "center" }}>
        <select className="select" style={{ width: "auto", padding: "9px 11px", fontSize: 12 }} value={histSys} onChange={(e) => setFilter(setHistSys)(e.target.value)}>
          <option value="Alle">Alle systemer</option>
          {allSystems.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <input className="input" type="date" style={{ width: "auto", padding: "9px 11px", fontSize: 12 }} value={histFrom} onChange={(e) => setFilter(setHistFrom)(e.target.value)} />
        <span className="mut">–</span>
        <input className="input" type="date" style={{ width: "auto", padding: "9px 11px", fontSize: 12 }} value={histTo} onChange={(e) => setFilter(setHistTo)(e.target.value)} />
        <button className={"chip " + (avvikOnly ? "on" : "")} onClick={() => setFilter(setAvvikOnly)(!avvikOnly)}>Kun avvik</button>
        <button className="btn ghost sm" style={{ marginLeft: "auto" }} onClick={printHistory} disabled={!filtered.length}>
          Skriv ut historikk ({filtered.length})
        </button>
      </div>
      <div className="tscroll">
        <table className="dtbl">
          <thead>
            <tr>
              <th>System</th><th>Temp</th><th>pH</th><th>Fukt</th><th>Fôr</th><th className="rt">Loggført</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id}>
                <td>
                  <span className="sy">{r.system}</span>
                  <div className="dt">
                    {fmtDate(r.date)}
                    {r.avvik ? <span style={{ color: "var(--gold)", marginLeft: 6 }}>· avvik</span> : null}
                  </div>
                  {r.notat ? <div className="dt" style={{ marginTop: 2, fontStyle: "italic" }}>{r.notat}</div> : null}
                </td>
                <td className="num"><b>{fmtVal(r.temp, "°")}</b></td>
                <td className="num">{fmtVal(r.ph)}</td>
                <td className="num">{fmtVal(r.fukt, "%")}</td>
                <td className="num">{r.for_l}L</td>
                <td className="num rt">
                  {r.logged_by}
                  {canEdit && r.editable ? (
                    <span style={{ display: "block", marginTop: 4 }}>
                      <button className="lnk" onClick={() => startEditReading(r)}>Endre</button>
                      <button
                        className="lnk g"
                        onClick={() => {
                          if (window.confirm("Slette målingen for " + r.system + " " + fmtDate(r.date) + "?")) deleteReading(r);
                        }}
                      >
                        Slett
                      </button>
                    </span>
                  ) : r.source === "sheets" || r.source === "app" ? (
                    <span className="dt" style={{ display: "block" }}>{r.source === "app" ? "App" : "Sheets"}</span>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {shown.length < filtered.length ? (
        <div className="no-print" style={{ textAlign: "center", marginTop: 20 }}>
          <button className="btn sm ghost" onClick={() => setVisible(visible + 50)}>
            Vis flere ({filtered.length - shown.length} gjenstår)
          </button>
        </div>
      ) : null}
      </div>
      {/* Dense spreadsheet print of the full filtered history — log proof for
          Mattilsynet or any chosen date range. Only rendered while printing. */}
      {printHist ? (
        <div className="hist-print">
          <div className="hp-sub">{histRangeLabel} · skrevet ut {new Date().toLocaleDateString("nb-NO")}</div>
          <table className="xtbl">
            <thead>
              <tr>
                <th>Dato</th><th>System</th><th>Temp (°C)</th><th>pH</th><th>Fukt (%)</th><th>Fôr (L)</th><th>Avvik</th><th>Notat</th><th>Loggført av</th><th>Kilde</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id}>
                  <td>{fmtDate(r.date)}</td>
                  <td>{r.system}</td>
                  <td className="num">{fmtVal(r.temp)}</td>
                  <td className="num">{fmtVal(r.ph)}</td>
                  <td className="num">{fmtVal(r.fukt)}</td>
                  <td className="num">{fmtVal(r.for_l)}</td>
                  <td>{r.avvik ? "Avvik" : ""}</td>
                  <td className="notat">{r.notat}</td>
                  <td>{r.logged_by}</td>
                  <td>{r.source === "app" ? "App" : r.source === "sheets" ? "Sheets" : "Dashbord"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Systemer                                                            */
/* ------------------------------------------------------------------ */

function SystemsView({ data, activeSystem, setActiveSystem }) {
  const active = data.systems.filter((s) => s.status === "I drift").map((s) => s.id);
  const latest = latestBySystem(data.readings, active);
  const current = latest[activeSystem] || {};
  const [sysRange, setSysRange] = useState("30D");
  const tempSeries = buildSeries(data.readings, [activeSystem], "TEMP", sysRange);
  const phSeries = buildSeries(data.readings, [activeSystem], "PH", sysRange);
  const fuktSeries = buildSeries(data.readings, [activeSystem], "FUKT", sysRange);
  const recent = data.readings.filter((r) => r.system === activeSystem).slice(0, 5);

  return (
    <div>
      <PrintHeader title="Systemer" />
      <div className="sechead" style={{ marginBottom: 0 }}>
        <span className="eyebrow">Systemer · Per benk</span>
        <PrintButton />
      </div>
      <div className="hero">Anlegg</div>
      <div className="herosub">{active.length} aktive systemer · Forkompost via autologger</div>
      <div className="rule" />
      <div className="sysgrid">
        <div className="syslist">
          {active.map((id) => {
            const r = latest[id];
            return (
              <button key={id} className={"sysrow " + (activeSystem === id ? "on" : "")} onClick={() => setActiveSystem(id)}>
                <div>
                  <div className="nm">{id}</div>
                  <div className="mt">{fmtVal(r.temp, "°")} · pH {fmtPh(r.ph)} · {fmtVal(r.fukt, "%")} fukt</div>
                </div>
                <span className="pill">I drift</span>
              </button>
            );
          })}
        </div>
        <div>
          <div className="dethead">
            <div>
              <span className="eyebrow">I drift · roterer</span>
              <div className="detname">{activeSystem}</div>
            </div>
            <span className="pill" style={{ fontSize: 11 }}>I drift</span>
          </div>
          <div className="metrics3">
            <div className="m3">
              <div className="k">Temperatur</div>
              <div className="v">{fmtVal(current.temp)}<small>°C</small></div>
            </div>
            <div className="m3">
              <div className="k">pH</div>
              <div className="v">{fmtPh(current.ph)}</div>
            </div>
            <div className="m3">
              <div className="k">Fuktighet</div>
              <div className="v">{fmtVal(current.fukt)}<small>%</small></div>
            </div>
          </div>
          <div className="charthead">
            <span className="eyebrow">Temperatur (°C) · {RANGE_LABEL[sysRange]}</span>
            <div className="toggle">
              {RANGES.map((r) => (
                <button key={r} className={"tbtn " + (sysRange === r ? "on" : "")} onClick={() => setSysRange(r)}>{r}</button>
              ))}
            </div>
          </div>
          <Chart series={tempSeries} metric="TEMP" range={sysRange} h={300} target={data.targets.find((t) => t.metric === "temp")} />
          <div className="charthead" style={{ marginTop: 26 }}><span className="eyebrow">pH · {RANGE_LABEL[sysRange]}</span></div>
          <Chart series={phSeries} metric="PH" range={sysRange} h={240} target={data.targets.find((t) => t.metric === "ph")} />
          <div className="charthead" style={{ marginTop: 26 }}><span className="eyebrow">Fuktighet (%) · {RANGE_LABEL[sysRange]}</span></div>
          <Chart series={fuktSeries} metric="FUKT" range={sysRange} h={240} target={data.targets.find((t) => t.metric === "fukt")} />
          <div className="rule tight" />
          <div className="sechead"><span className="eyebrow">Siste registreringer</span></div>
          <table className="dtbl">
            <thead>
              <tr>
                <th>Dato</th><th>Temp</th><th>pH</th><th>Fukt</th><th className="rt">Loggført</th>
              </tr>
            </thead>
            <tbody>
              {(recent.length ? recent : [null]).map((r, i) =>
                r ? (
                  <tr key={r.id}>
                    <td><span className="sy">{fmtDate(r.date)}</span></td>
                    <td className="num"><b>{fmtVal(r.temp, "°")}</b></td>
                    <td className="num">pH {fmtVal(r.ph)}</td>
                    <td className="num">{fmtVal(r.fukt, "%")}</td>
                    <td className="num rt">{r.logged_by}</td>
                  </tr>
                ) : (
                  <tr key={"empty" + i}>
                    <td><span className="sy">—</span></td>
                    <td className="num"><b>—</b></td>
                    <td className="num">—</td>
                    <td className="num">—</td>
                    <td className="num rt">—</td>
                  </tr>
                )
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* SOP / filer                                                         */
/* ------------------------------------------------------------------ */

const FILE_CATS = ["ALLE", "SOP", "Sertifisering", "Lab-rapport", "HMS", "Produkt", "Selskap"];

function FilesView({ data, uploadFiles, removeFile, updateFile, canEdit }) {
  const [cat, setCat] = useState("ALLE");
  const [auditMode, setAuditMode] = useState(false);
  const [dragHot, setDragHot] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ name: "", cat: "SOP", ver: "" });
  const inputRef = useRef(null);

  let files = cat === "ALLE" ? data.files : data.files.filter((f) => f.cat === cat);
  if (auditMode) files = [...files].sort((a, b) => a.cat.localeCompare(b.cat, "nb"));

  const handleFiles = (list) => {
    const pdfs = Array.from(list || []).filter((f) => f.name.toLowerCase().endsWith(".pdf"));
    if (pdfs.length) {
      uploadFiles(pdfs, cat === "ALLE" ? "SOP" : cat);
      setCat("ALLE");
    }
  };

  const open = (f) => {
    if (f.stored) window.open("/api/files/" + f.id, "_blank");
    else window.alert("Dette er en eksempel-oppføring uten lagret PDF. Last opp en fil for å prøve.");
  };

  return (
    <div>
      <PrintHeader title="SOP og dokumenter" />
      <div className="sechead" style={{ marginBottom: 0 }}>
        <span className="eyebrow">Dokumentasjon</span>
        <PrintButton />
      </div>
      <div className="hero">SOP · Regelverk · Filer</div>
      <div className="herosub">Last opp SOP-er, sertifiseringer, lab-rapporter og HMS. Alt samlet ett sted — klart å vise ved tilsyn.</div>
      <div className="rule" />
      <div className="sechead">
        <span className="eyebrow">{auditMode ? "Tilsynsvisning" : "Dokumentbibliotek"}</span>
        <button className="btn ghost sm" onClick={() => setAuditMode(!auditMode)}>
          {auditMode ? "Avslutt visning" : "Tilsynsvisning"}
        </button>
      </div>
      {auditMode ? (
        <div className="auditbar">
          <div>
            <div className="at">Tilsyns­visning aktiv</div>
            <div className="as">Ren, skrivebeskyttet oversikt · sortert etter kategori · {data.files.length} dokumenter</div>
          </div>
          <span className="tag" style={{ borderColor: "rgba(255,255,255,.4)", color: "#fff" }}>Kun lesing</span>
        </div>
      ) : canEdit ? (
        <div
          className={"drop " + (dragHot ? "hot" : "")}
          onDragOver={(e) => { e.preventDefault(); if (!dragHot) setDragHot(true); }}
          onDragLeave={(e) => { e.preventDefault(); setDragHot(false); }}
          onDrop={(e) => { e.preventDefault(); setDragHot(false); handleFiles(e.dataTransfer && e.dataTransfer.files); }}
          onClick={() => { if (inputRef.current) inputRef.current.click(); }}
        >
          <div className="di">Slipp PDF-er her, eller klikk for å velge</div>
          <div className="ds">SOP · sertifisering · lab-rapport · HMS — maks 25 MB per fil</div>
          <input type="file" accept="application/pdf" multiple style={{ display: "none" }} ref={inputRef} onChange={(e) => { handleFiles(e.target.files); e.target.value = ""; }} />
        </div>
      ) : null}
      <div className="chips">
        {FILE_CATS.map((c) => (
          <button key={c} className={"chip " + (cat === c ? "on" : "")} onClick={() => setCat(c)}>
            {c === "ALLE" ? "Alle" : c}
          </button>
        ))}
      </div>
      <div className="tscroll">
        <table className="ftbl">
          <thead>
            <tr><th>Dokument</th><th>Kategori</th><th>Versjon</th><th>Oppdatert</th><th /></tr>
          </thead>
          <tbody>
            {files.map((f) =>
              editingId === f.id ? (
                <tr key={f.id}>
                  <td>
                    <div className="fcell">
                      <span className="doc" />
                      <input className="input" style={{ padding: "9px 11px", fontSize: 13 }} value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
                    </div>
                  </td>
                  <td>
                    <select className="select" style={{ padding: "9px 11px", fontSize: 12, width: "auto" }} value={editForm.cat} onChange={(e) => setEditForm({ ...editForm, cat: e.target.value })}>
                      {FILE_CATS.filter((c) => c !== "ALLE").map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input className="input" style={{ padding: "9px 11px", fontSize: 12, width: 64 }} value={editForm.ver} onChange={(e) => setEditForm({ ...editForm, ver: e.target.value })} />
                  </td>
                  <td className="mut">{f.date}</td>
                  <td className="rt">
                    <button className="lnk" onClick={async () => { await updateFile(f.id, editForm); setEditingId(null); }}>Lagre</button>
                    <button className="lnk" onClick={() => setEditingId(null)}>Avbryt</button>
                  </td>
                </tr>
              ) : (
                <tr key={f.id}>
                  <td>
                    <div className="fcell">
                      <span className="doc" />
                      <div>
                        <div className="fn">{f.name}</div>
                        <div className="fmeta">{f.size}</div>
                      </div>
                    </div>
                  </td>
                  <td><span className="catbadge">{f.cat}</span></td>
                  <td className="mut">{f.ver}</td>
                  <td className="mut">{f.date}</td>
                  <td className="rt">
                    <button className="lnk" onClick={() => open(f)}>Åpne</button>
                    {auditMode || !canEdit ? null : (
                      <span>
                        <button className="lnk" onClick={() => { setEditingId(f.id); setEditForm({ name: f.name, cat: f.cat, ver: f.ver }); }}>Endre</button>
                        <button className="lnk g" onClick={() => { if (window.confirm("Fjerne «" + f.name + "»?")) removeFile(f.id); }}>Fjern</button>
                      </span>
                    )}
                  </td>
                </tr>
              )
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Prosjekter                                                          */
/* ------------------------------------------------------------------ */

const PROJECT_COLS = ["Planlagt", "Pågår", "Fullført"];
const PARTNER_STATUSES = ["Pågår", "Avklar", "Dialog", "Løpende"];

function ProjectsView({ data, canEdit, toggleCheck, addProject, updateProject, deleteProject, addCheckItem, renameCheckItem, deleteCheckItem, addPartner, updatePartner, deletePartner, showToast, refreshAll }) {
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [partnerId, setPartnerId] = useState(null);
  const [partnerForm, setPartnerForm] = useState(null);
  const [busyCol, setBusyCol] = useState(null);
  const team = data.team.map((t) => t.name);

  const startEdit = (p) => {
    setEditingId(p.id);
    setEditForm({ col: p.col, tag: p.tag, title: p.title, descr: p.descr, who: p.who, due: p.due || "" });
  };

  const move = (p, dir) => {
    const i = PROJECT_COLS.indexOf(p.col) + dir;
    if (i < 0 || i >= PROJECT_COLS.length) return;
    updateProject({ id: p.id, col: PROJECT_COLS[i], tag: p.tag, title: p.title, descr: p.descr, who: p.who, due: p.due || "" });
  };

  const save = async (id) => {
    await updateProject({ id, ...editForm });
    setEditingId(null);
  };

  const createIn = async (col) => {
    setBusyCol(col);
    const created = await addProject(col);
    setBusyCol(null);
    if (created) startEdit(created);
  };

  const cols = PROJECT_COLS.map((title) => ({
    title,
    cards: data.projects
      .filter((p) => p.col === title)
      .map((p) => {
        const checks = data.checklist.filter((c) => c.project_id === p.id);
        const done = checks.filter((c) => c.done).length;
        return { ...p, checks, done, pct: checks.length ? Math.round((done / checks.length) * 100) : 0 };
      }),
  }));

  // The whole card opens the detail view; checkboxes and move-arrows stay
  // directly clickable on the card.
  const card = (p) => (
    <div
      className={"pcard clickable" + (p.col === "Fullført" ? " donecard" : "")}
      key={p.id}
      onClick={() => startEdit(p)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter") startEdit(p); }}
    >
      <div className="ptag" style={{ display: "flex", justifyContent: "space-between" }}>
        <span>{p.tag}</span>
        {dueBadge(p.due, p.col !== "Fullført")}
      </div>
      <div className="ptitle">{p.title}</div>
      <div className="pdesc">{p.descr}</div>
      <div className="checks">
        {p.checks.map((c) => (
          <button key={c.id} className={"chk " + (c.done ? "done" : "")} onClick={(e) => { e.stopPropagation(); if (canEdit) toggleCheck(c.id, !c.done); }}>
            <span className="chkbox" />{c.text}
          </button>
        ))}
      </div>
      <div className="pfoot">
        <span className="pbar"><i style={{ width: p.pct + "%" }} /></span>
        <span className="pav">{p.who} · {p.done}/{p.checks.length}</span>
      </div>
      {canEdit ? (
        <div className="pmove no-print" onClick={(e) => e.stopPropagation()}>
          <button className="lnk" disabled={p.col === PROJECT_COLS[0]} onClick={() => move(p, -1)} title="Flytt til forrige kolonne">←</button>
          <span className="mut" style={{ fontSize: 10.5 }}>{p.col}</span>
          <button className="lnk" disabled={p.col === PROJECT_COLS[PROJECT_COLS.length - 1]} onClick={() => move(p, 1)} title="Flytt til neste kolonne">→</button>
        </div>
      ) : null}
    </div>
  );

  // Enlarged card view — opens when a kanban card is clicked. All fields are
  // optional; read-only users can look but not touch.
  const detailModal = (p) => (
    <div className="modal-backdrop" onClick={() => setEditingId(null)}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="sechead" style={{ marginBottom: 16 }}>
          <span className="eyebrow gold">Prosjekt · {editForm.col}</span>
          <button className="lnk" onClick={() => setEditingId(null)}>Lukk ✕</button>
        </div>
        <div className="field" style={{ marginBottom: 12 }}>
          <label>Tittel</label>
          <input className="input" value={editForm.title} disabled={!canEdit} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} />
        </div>
        <div className="field" style={{ marginBottom: 12 }}>
          <label>Beskrivelse (valgfritt)</label>
          <textarea className="ta" style={{ minHeight: 80 }} value={editForm.descr} disabled={!canEdit} onChange={(e) => setEditForm({ ...editForm, descr: e.target.value })} />
        </div>
        <div className="f2" style={{ gap: 12, marginBottom: 12 }}>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Status</label>
            <select className="select" value={editForm.col} disabled={!canEdit} onChange={(e) => setEditForm({ ...editForm, col: e.target.value })}>
              {PROJECT_COLS.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Ansvarlig</label>
            <select className="select" value={editForm.who} disabled={!canEdit} onChange={(e) => setEditForm({ ...editForm, who: e.target.value })}>
              {team.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
              {team.includes(editForm.who) ? null : <option value={editForm.who}>{editForm.who}</option>}
            </select>
          </div>
        </div>
        <div className="f2" style={{ gap: 12, marginBottom: 12 }}>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Kategori/tag (valgfritt)</label>
            <input className="input" value={editForm.tag} disabled={!canEdit} onChange={(e) => setEditForm({ ...editForm, tag: e.target.value })} />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Frist (valgfritt)</label>
            <input className="input" type="date" value={editForm.due} disabled={!canEdit} onChange={(e) => setEditForm({ ...editForm, due: e.target.value })} />
          </div>
        </div>
        <div className="field" style={{ marginBottom: 12 }}>
          <label>Sjekkliste</label>
          {p.checks.map((c) => (
            <div key={c.id} style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button className={"chk " + (c.done ? "done" : "")} style={{ width: "auto", flex: "none" }} onClick={() => canEdit && toggleCheck(c.id, !c.done)}>
                <span className="chkbox" />
              </button>
              <input
                className="input"
                style={{ padding: "8px 10px", fontSize: 12.5 }}
                defaultValue={c.text}
                disabled={!canEdit}
                onBlur={(e) => { if (e.target.value !== c.text) renameCheckItem(c.id, e.target.value); }}
              />
              {canEdit ? <button className="lnk g" style={{ flex: "none" }} onClick={() => deleteCheckItem(c.id)}>Fjern</button> : null}
            </div>
          ))}
          {canEdit ? (
            <button className="lnk" style={{ textAlign: "left", paddingLeft: 0 }} onClick={() => addCheckItem(p.id)}>+ Legg til punkt</button>
          ) : null}
        </div>
        {canEdit ? (
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <button className="btn sm" onClick={() => save(p.id)}>Lagre</button>
            <button className="lnk" onClick={() => setEditingId(null)}>Avbryt</button>
            <button
              className="lnk g"
              style={{ marginLeft: "auto" }}
              onClick={() => { if (window.confirm("Slette prosjektet «" + p.title + "»?")) { deleteProject(p.id); setEditingId(null); } }}
            >
              Slett
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );

  return (
    <div>
      <PrintHeader title="Prosjekter" />
      <div className="sechead" style={{ marginBottom: 0 }}>
        <span className="eyebrow">Arbeid · Langsiktig</span>
        <PrintButton />
      </div>
      <div className="hero">Prosjekter</div>
      <div className="herosub">Enkel oversikt over prosjekter, store oppgaver og partnere som jobbes over tid. Klikk på et kort for detaljer.</div>
      <div className="rule" />
      {canEdit ? <BraindumpPanel data={data} showToast={showToast} refreshAll={refreshAll} /> : null}
      <div className="kanban">
        {cols.map((col) => (
          <div className="kcol" key={col.title}>
            <div className="kcolhead">
              <span className="kt">{col.title}</span>
              <span className="kc">
                {col.cards.length}
                {canEdit ? (
                  <button className="lnk" style={{ padding: "0 0 0 10px" }} onClick={() => createIn(col.title)} disabled={busyCol === col.title}>
                    + Ny
                  </button>
                ) : null}
              </span>
            </div>
            {col.cards.map((p) => card(p))}
            {col.cards.length === 0 ? (
              <div className="kempty">Ingen prosjekter{canEdit ? " — bruk + Ny" : ""}</div>
            ) : null}
          </div>
        ))}
      </div>
      {(() => {
        if (editingId == null || !editForm) return null;
        const p = cols.flatMap((c) => c.cards).find((x) => x.id === editingId);
        return p ? detailModal(p) : null;
      })()}
      <div className="rule" />
      <div className="sechead">
        <span className="eyebrow gold">Partnere · Pipeline</span>
        <span className="mut">
          {data.partners.length} aktive dialoger
          {canEdit ? (
            <button
              className="lnk"
              style={{ paddingRight: 0 }}
              onClick={async () => {
                const created = await addPartner();
                if (created) {
                  setPartnerId(created.id);
                  setPartnerForm({ name: created.name, type: created.type, status: created.status, next_step: created.next_step, who: created.who });
                }
              }}
            >
              + Ny
            </button>
          ) : null}
        </span>
      </div>
      <div className="tscroll">
        <table className="htbl">
          <tbody>
            {data.partners.map((p, i) =>
              partnerId === p.id ? (
                <tr key={p.id}>
                  <td colSpan={5} style={{ paddingRight: 0 }}>
                    <div className="f2" style={{ marginBottom: 12 }}>
                      <div className="field" style={{ marginBottom: 0 }}>
                        <label>Partner</label>
                        <input className="input" value={partnerForm.name} onChange={(e) => setPartnerForm({ ...partnerForm, name: e.target.value })} />
                      </div>
                      <div className="field" style={{ marginBottom: 0 }}>
                        <label>Neste steg</label>
                        <input className="input" value={partnerForm.next_step} onChange={(e) => setPartnerForm({ ...partnerForm, next_step: e.target.value })} />
                      </div>
                    </div>
                    <div className="f2" style={{ marginBottom: 12 }}>
                      <div className="field" style={{ marginBottom: 0 }}>
                        <label>Type</label>
                        <input className="input" value={partnerForm.type} onChange={(e) => setPartnerForm({ ...partnerForm, type: e.target.value })} />
                      </div>
                      <div className="f2" style={{ gap: 12 }}>
                        <div className="field" style={{ marginBottom: 0 }}>
                          <label>Status</label>
                          <select className="select" value={partnerForm.status} onChange={(e) => setPartnerForm({ ...partnerForm, status: e.target.value })}>
                            {PARTNER_STATUSES.map((s) => (
                              <option key={s} value={s}>{s}</option>
                            ))}
                          </select>
                        </div>
                        <div className="field" style={{ marginBottom: 0 }}>
                          <label>Ansvarlig</label>
                          <select className="select" value={partnerForm.who} onChange={(e) => setPartnerForm({ ...partnerForm, who: e.target.value })}>
                            {data.team.map((t) => (
                              <option key={t.id} value={t.name}>{t.name}</option>
                            ))}
                            {data.team.some((t) => t.name === partnerForm.who) ? null : <option value={partnerForm.who}>{partnerForm.who}</option>}
                          </select>
                        </div>
                      </div>
                    </div>
                    <button className="btn sm" onClick={async () => { await updatePartner({ id: p.id, ...partnerForm }); setPartnerId(null); }}>Lagre</button>
                    <button className="lnk" onClick={() => setPartnerId(null)}>Avbryt</button>
                    <button className="lnk g" onClick={() => { if (window.confirm("Slette partneren «" + p.name + "»?")) { deletePartner(p.id); setPartnerId(null); } }}>Slett</button>
                  </td>
                </tr>
              ) : (
                <tr key={p.id}>
                  <td className="hn">{String(i + 1).padStart(2, "0")}</td>
                  <td>
                    <div className="ht">{p.name}</div>
                    <div className="hs">{p.next_step}</div>
                  </td>
                  <td><span className="catbadge">{p.type}</span></td>
                  <td className="rt"><span className={"tag " + p.tagcls}>{p.status}</span></td>
                  <td className="assignee">
                    {p.who}
                    {canEdit ? (
                      <span style={{ display: "block", marginTop: 6 }}>
                        <button className="lnk" onClick={() => { setPartnerId(p.id); setPartnerForm({ name: p.name, type: p.type, status: p.status, next_step: p.next_step, who: p.who }); }}>Endre</button>
                      </span>
                    ) : null}
                  </td>
                </tr>
              )
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Oppgaver                                                            */
/* ------------------------------------------------------------------ */

const TASK_TAGS = ["Ny", "Rutine", "Avklar"];
const TASK_PRIOS = [["", "Ingen"], ["kritisk", "Kritisk"], ["høy", "Høy"], ["medium", "Medium"], ["lav", "Lav"]];
const PRIO_ORDER = { kritisk: 0, ["høy"]: 1, medium: 2, lav: 3, "": 4 };
const EMPTY_TASK = { title: "", sub: "", descr: "", tag: "Ny", who: "Mathias", prio: "", due: "" };

function prioBadge(p) {
  if (!p) return null;
  const cls = p === "kritisk" || p === "høy" ? "tag gold" : "tag";
  return <span className={cls} style={{ marginLeft: 6 }}>{p}</span>;
}

function dueBadge(due, open) {
  if (!due) return null;
  const overdue = open && due < isoDaysAgo(0);
  return (
    <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 600, color: overdue ? "var(--gold)" : "var(--muted)" }}>
      {overdue ? "Forfalt " : "Frist "}{fmtDate(due)}
    </span>
  );
}

/* Braindump: free text -> proposed task/project operations -> user approves
   -> applied through the existing CRUD endpoints. Works in two modes:
   /api/braindump (server-side Claude) when AI is configured, otherwise a
   copy/paste prompt template + paste-JSON-back flow with the same preview. */

const BRAINDUMP_RULES =
  "Du oversetter en hjernedump til konkrete operasjoner mot oppgave- og prosjektlisten.\n" +
  "Gyldige op-verdier: create_task, update_task, complete_task, reopen_task, delete_task, " +
  "create_project, update_project, delete_project, add_check, toggle_check.\n" +
  "Felter: id (eksisterende oppgave/prosjekt/sjekkpunkt), project_id, title, sub, descr, " +
  "tag (Ny/Rutine/Avklar), who (teammedlem), col (Planlagt/Pågår/Fullført), text (sjekkpunkt), " +
  "done (true/false), checks (liste med sjekkpunkter for nytt prosjekt), note (kort norsk forklaring).\n" +
  "Bruk KUN id-er fra tilstanden. Slett aldri noe som ikke eksplisitt skal slettes.";

function BraindumpPanel({ data, showToast, refreshAll }) {
  const [text, setText] = useState("");
  const [pasted, setPasted] = useState("");
  const [ops, setOps] = useState(null);
  const [checked, setChecked] = useState(new Set());
  const [busy, setBusy] = useState(false);
  const [applying, setApplying] = useState(false);

  // postgres.js delivers bigint ids as strings while AI/pasted ops carry
  // numbers — key everything by Number so both shapes resolve.
  const taskById = new Map(data.tasks.map((t) => [Number(t.id), t]));
  const projectById = new Map(data.projects.map((p) => [Number(p.id), p]));
  const checkById = new Map(data.checklist.map((c) => [Number(c.id), c]));

  const describe = (o) => {
    const t = taskById.get(Number(o.id));
    const p = projectById.get(Number(o.id));
    const c = checkById.get(Number(o.id));
    switch (o.op) {
      case "create_task": return "+ Oppgave: «" + o.title + "»" + (o.who ? " (" + o.who + ")" : "");
      case "update_task": return "✎ Endre oppgave: «" + (t ? t.title : o.id) + "»";
      case "complete_task": return "✓ Fullfør: «" + (t ? t.title : o.id) + "»";
      case "reopen_task": return "↺ Gjenåpne: «" + (t ? t.title : o.id) + "»";
      case "delete_task": return "− Slett oppgave: «" + (t ? t.title : o.id) + "»";
      case "create_project": return "+ Prosjekt: «" + o.title + "»" + (o.checks && o.checks.length ? " (" + o.checks.length + " sjekkpunkter)" : "");
      case "update_project": return "✎ Endre prosjekt: «" + (p ? p.title : o.id) + "»";
      case "delete_project": return "− Slett prosjekt: «" + (p ? p.title : o.id) + "»";
      case "add_check": {
        const proj = projectById.get(Number(o.project_id));
        return "+ Sjekkpunkt i «" + (proj ? proj.title : o.project_id) + "»: " + o.text;
      }
      case "toggle_check": return (o.done === false ? "☐ Fjern kryss: «" : "✓ Kryss av: «") + (c ? c.text : o.id) + "»";
      default: return o.op;
    }
  };

  const showProposal = (list) => {
    setOps(list);
    setChecked(new Set(list.map((_, i) => i)));
  };

  const interpret = async () => {
    setBusy(true);
    const res = await api("/api/braindump", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
      // Must clear the server's own 50s ceiling (see app/api/braindump/route.js)
      // with room to spare, same margin inbox/enrich uses (55s client / 60s
      // Vercel maxDuration).
      timeoutMs: 55000,
    });
    setBusy(false);
    if (!res.ok) {
      showToast(await failMsg(res, "Klarte ikke å tolke teksten — prøv igjen."));
      return;
    }
    const body = await res.json();
    showProposal(body.ops || []);
  };

  const promptTemplate = () => {
    const state = {
      team: data.team.map((t) => t.name),
      tasks: data.tasks.map(({ id, title, sub, tag, who, open: o }) => ({ id, title, sub, tag, who, open: o })),
      projects: data.projects.map(({ id, col, tag, title, who }) => ({ id, col, tag, title, who })),
      checklist: data.checklist,
    };
    return BRAINDUMP_RULES +
      "\n\nNåværende tilstand:\n" + JSON.stringify(state) +
      "\n\nHjernedump:\n" + text +
      '\n\nSvar KUN med gyldig JSON på formen {"ops":[{"op":"...","note":"..."}]} — ingen annen tekst.';
  };

  const copyTemplate = async () => {
    try {
      await navigator.clipboard.writeText(promptTemplate());
      showToast("Prompt-mal kopiert — lim den inn i Claude og lim JSON-svaret inn under");
    } catch {
      showToast("Kunne ikke kopiere automatisk — velg teksten manuelt");
    }
  };

  const readPasted = () => {
    try {
      const cleaned = pasted.trim().replace(/^```(json)?/i, "").replace(/```$/, "").trim();
      const parsed = JSON.parse(cleaned);
      const list = (Array.isArray(parsed) ? parsed : parsed.ops || []).filter((o) => o && o.op);

      // Same id-validation the AI path enforces server-side (see
      // app/api/braindump/route.js). Without it a pasted answer that references
      // a stale or hallucinated id could delete something real — the paste
      // path skips the server, so if the client doesn't filter, nothing does.
      const taskIds = new Set((data.tasks || []).map((t) => Number(t.id)));
      const projectIds = new Set((data.projects || []).map((p) => Number(p.id)));
      const checkIds = new Set((data.checklist || []).map((c) => Number(c.id)));
      const dropped = [];
      const safe = list.filter((o) => {
        const needTask = ["update_task", "complete_task", "reopen_task", "delete_task"].includes(o.op);
        const needProject = ["update_project", "delete_project"].includes(o.op);
        const needCheck = o.op === "toggle_check";
        if (needTask && !taskIds.has(Number(o.id))) { dropped.push(o); return false; }
        if (needProject && !projectIds.has(Number(o.id))) { dropped.push(o); return false; }
        if (needCheck && !checkIds.has(Number(o.id))) { dropped.push(o); return false; }
        if (o.op === "add_check" && !projectIds.has(Number(o.project_id))) { dropped.push(o); return false; }
        return true;
      });
      if (dropped.length) showToast(`${dropped.length} operasjon${dropped.length === 1 ? "" : "er"} droppet — refererer til ting som ikke finnes`);
      showProposal(safe);
    } catch {
      showToast("Ugyldig JSON — lim inn hele svaret fra Claude");
    }
  };

  const post = (path, body) => api(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const put = (path, body) => api(path, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

  const applyOne = async (o) => {
    switch (o.op) {
      case "create_task":
        return post("/api/tasks", { title: o.title, sub: o.sub || "", descr: o.descr || "", tag: o.tag || "Ny", who: o.who || "", prio: o.prio || "", due: o.due || "" });
      case "update_task":
      case "complete_task":
      case "reopen_task": {
        const t = taskById.get(Number(o.id));
        if (!t) return { ok: false };
        const open = o.op === "complete_task" ? 0 : o.op === "reopen_task" ? 1 : t.open;
        return put("/api/tasks", {
          id: o.id,
          title: o.title ?? t.title,
          sub: o.sub ?? t.sub,
          descr: o.descr ?? t.descr ?? "",
          tag: o.tag ?? t.tag,
          who: o.who ?? t.who,
          prio: o.prio ?? t.prio ?? "",
          due: o.due ?? t.due ?? "",
          open,
        });
      }
      case "delete_task":
        return api("/api/tasks/" + o.id, { method: "DELETE" });
      case "create_project": {
        const res = await post("/api/projects", { col: o.col || "Planlagt", who: o.who || "" });
        if (!res.ok) return res;
        const created = await res.json();
        const upd = await put("/api/projects", {
          id: created.id,
          col: o.col || created.col,
          tag: o.tag || "Nytt",
          title: o.title,
          descr: o.descr || "",
          who: o.who || created.who,
        });
        for (const check of o.checks || []) {
          await post("/api/checks", { project_id: created.id, text: check });
        }
        return upd;
      }
      case "update_project": {
        const p = projectById.get(Number(o.id));
        if (!p) return { ok: false };
        return put("/api/projects", {
          id: o.id,
          col: o.col ?? p.col,
          tag: o.tag ?? p.tag,
          title: o.title ?? p.title,
          descr: o.descr ?? p.descr,
          who: o.who ?? p.who,
        });
      }
      case "delete_project":
        return api("/api/projects/" + o.id, { method: "DELETE" });
      case "add_check":
        return post("/api/checks", { project_id: o.project_id, text: o.text });
      case "toggle_check":
        return post("/api/checks", { id: o.id, done: o.done !== false });
      default:
        return { ok: false };
    }
  };

  const applyOps = async () => {
    setApplying(true);
    let ok = 0;
    let failed = 0;
    for (let i = 0; i < ops.length; i++) {
      if (!checked.has(i)) continue;
      const res = await applyOne(ops[i]);
      if (res && res.ok) ok++;
      else failed++;
    }
    setApplying(false);
    showToast(ok + (ok === 1 ? " endring utført" : " endringer utført") + (failed ? " · " + failed + " feilet" : ""));
    setOps(null);
    setText("");
    setPasted("");
    refreshAll();
  };

  const toggleOp = (i) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i); else next.add(i);
      return next;
    });
  };

  return (
    <div className="no-print">
      <div className="card" style={{ padding: "22px 24px", marginBottom: 30, borderLeft: "3px solid var(--gold)" }}>
          <div className="sechead" style={{ marginBottom: 14 }}>
            <span className="eyebrow gold">Hjernedump</span>
            <span className="mut" style={{ fontSize: 11 }}>Skriv alt i én tekst — appen foreslår, du godkjenner</span>
          </div>
          {!ops ? (
            <div>
              <div className="field" style={{ marginBottom: 12 }}>
                <textarea
                  className="ta"
                  style={{ minHeight: 90 }}
                  placeholder={"F.eks.: Bestill mer strø til CFT2, Mathias tar det innen fredag. Mattilsynet-oppgaven er ferdig. Nytt prosjekt: nettbutikk-lansering — steg: produktbilder, priser, frakt."}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                />
              </div>
              {data.aiEnabled ? (
                <button className="btn sm" onClick={interpret} disabled={busy || !text.trim()}>
                  {busy ? "Tolker …" : "Foreslå endringer"}
                </button>
              ) : (
                <div>
                  <button className="btn sm ghost" onClick={copyTemplate} disabled={!text.trim()}>Kopier prompt-mal</button>
                  <div className="mut" style={{ marginTop: 12 }}>
                    AI er ikke koblet til i appen ennå (se Innstillinger → AI-funksjoner) — kopier malen, lim den inn i Claude, og lim JSON-svaret inn under.
                  </div>
                  <div className="field" style={{ marginTop: 16, marginBottom: 0 }}>
                    <label>Lim inn JSON-svar fra Claude</label>
                    <textarea className="ta" style={{ minHeight: 56 }} placeholder='{"ops": [...]}' value={pasted} onChange={(e) => setPasted(e.target.value)} />
                  </div>
                  {pasted.trim() ? (
                    <button className="btn sm ghost" style={{ marginTop: 10 }} onClick={readPasted}>Les inn JSON</button>
                  ) : null}
                </div>
              )}
            </div>
          ) : (
            <div>
              <div className="sechead" style={{ marginBottom: 8 }}>
                <span className="eyebrow gold">Foreslåtte endringer</span>
                <span className="mut">{checked.size} av {ops.length} valgt</span>
              </div>
              {ops.length === 0 ? <div className="mut">Fant ingen konkrete operasjoner i teksten — prøv å være mer spesifikk.</div> : null}
              {ops.map((o, i) => (
                <button key={i} className={"chk " + (checked.has(i) ? "done" : "")} onClick={() => toggleOp(i)}>
                  <span className="chkbox" />
                  <span style={{ textAlign: "left" }}>
                    {describe(o)}
                    {o.note ? <span style={{ display: "block", fontSize: 11, color: "var(--muted)" }}>{o.note}</span> : null}
                  </span>
                </button>
              ))}
              <div style={{ display: "flex", gap: 8, marginTop: 16, alignItems: "center" }}>
                <button className="btn sm" onClick={applyOps} disabled={applying || checked.size === 0}>
                  {applying ? "Utfører …" : "Utfør (" + checked.size + ")"}
                </button>
                <button className="lnk" onClick={() => setOps(null)}>Tilbake</button>
              </div>
            </div>
          )}
      </div>
    </div>
  );
}

function TasksView({ data, addTask, updateTask, deleteTask, canEdit, showToast, refreshAll }) {
  const [form, setForm] = useState(EMPTY_TASK);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(EMPTY_TASK);
  const [busy, setBusy] = useState(false);
  const [filterWho, setFilterWho] = useState("Alle");
  const [filterPrio, setFilterPrio] = useState("Alle");
  const [sortBy, setSortBy] = useState("nyeste");
  const team = data.team.map((t) => t.name);

  const matches = (t) =>
    (filterWho === "Alle" || t.who === filterWho) &&
    (filterPrio === "Alle" || (filterPrio === "hast" ? t.prio === "kritisk" || t.prio === "høy" : (t.prio || "") === filterPrio));
  const order = (a, b) => {
    if (sortBy === "frist") {
      if ((a.due || "") !== (b.due || "")) {
        if (!a.due) return 1;
        if (!b.due) return -1;
        return a.due < b.due ? -1 : 1;
      }
    }
    if (sortBy === "prioritet" || sortBy === "frist") {
      const d = PRIO_ORDER[a.prio || ""] - PRIO_ORDER[b.prio || ""];
      if (d) return d;
    }
    return Number(b.id) - Number(a.id);
  };
  const open = data.tasks.filter((t) => t.open && matches(t)).sort(order);
  const done = data.tasks.filter((t) => !t.open && matches(t)).sort(order);
  const filtering = filterWho !== "Alle" || filterPrio !== "Alle";

  const submit = async () => {
    if (!form.title.trim() || busy) return;
    setBusy(true);
    const ok = await addTask(form);
    setBusy(false);
    if (ok) setForm(EMPTY_TASK);
  };

  const startEdit = (t) => {
    setEditingId(t.id);
    setEditForm({ title: t.title, sub: t.sub, descr: t.descr || "", tag: t.tag, who: t.who, prio: t.prio || "", due: t.due || "" });
  };

  const saveEdit = async (t) => {
    await updateTask({ ...t, ...editForm });
    setEditingId(null);
  };

  const editRow = (t) => (
    <tr key={t.id}>
      <td colSpan={4} style={{ paddingRight: 0 }}>
        <div className="f2" style={{ marginBottom: 12 }}>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Tittel</label>
            <input className="input" value={editForm.title} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Beskrivelse</label>
            <input className="input" value={editForm.sub} onChange={(e) => setEditForm({ ...editForm, sub: e.target.value })} />
          </div>
        </div>
        <div className="field" style={{ marginBottom: 12 }}>
          <label>Notater / detaljer</label>
          <textarea className="ta" style={{ minHeight: 72 }} placeholder="Valgfritt — lenker, kontekst, delsteg" value={editForm.descr} onChange={(e) => setEditForm({ ...editForm, descr: e.target.value })} />
        </div>
        <div className="f2" style={{ marginBottom: 12 }}>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Status</label>
            <select className="select" value={editForm.tag} onChange={(e) => setEditForm({ ...editForm, tag: e.target.value })}>
              {TASK_TAGS.map((tag) => (
                <option key={tag} value={tag}>{tag}</option>
              ))}
            </select>
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Ansvarlig</label>
            <select className="select" value={editForm.who} onChange={(e) => setEditForm({ ...editForm, who: e.target.value })}>
              {team.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="f2" style={{ marginBottom: 12 }}>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Prioritet</label>
            <select className="select" value={editForm.prio} onChange={(e) => setEditForm({ ...editForm, prio: e.target.value })}>
              {TASK_PRIOS.map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Frist (valgfritt)</label>
            <input className="input" type="date" value={editForm.due} onChange={(e) => setEditForm({ ...editForm, due: e.target.value })} />
          </div>
        </div>
        <button className="btn sm" onClick={() => saveEdit(t)}>Lagre</button>
        <button className="lnk" onClick={() => setEditingId(null)}>Avbryt</button>
      </td>
    </tr>
  );

  const row = (t, i, isOpen) =>
    editingId === t.id ? (
      editRow(t)
    ) : (
      <tr key={t.id}>
        <td className="hn">{String(i + 1).padStart(2, "0")}</td>
        <td>
          <div className="ht" style={isOpen ? undefined : { textDecoration: "line-through", textDecorationColor: "var(--line)", color: "var(--muted)" }}>
            {t.title}
            {prioBadge(t.prio)}
            {dueBadge(t.due, isOpen)}
          </div>
          <div className="hs">{t.sub}</div>
          {t.descr ? <div className="hs" style={{ whiteSpace: "pre-wrap", marginTop: 4, opacity: 0.85 }}>{t.descr}</div> : null}
        </td>
        <td className="rt"><span className={"tag " + t.tagcls}>{t.tag}</span></td>
        <td className="assignee">
          {t.who}
          {canEdit ? (
            <span style={{ display: "block", marginTop: 6 }}>
              <button className="lnk" onClick={() => startEdit(t)}>Endre</button>
              <button className="lnk" onClick={() => updateTask({ ...t, open: isOpen ? 0 : 1 })}>{isOpen ? "Fullfør" : "Gjenåpne"}</button>
              <button className="lnk g" onClick={() => { if (window.confirm("Slette oppgaven «" + t.title + "»?")) deleteTask(t.id); }}>Slett</button>
            </span>
          ) : null}
        </td>
      </tr>
    );

  return (
    <div>
      <PrintHeader title="Oppgaver" />
      <div className="sechead" style={{ marginBottom: 0 }}>
        <span className="eyebrow">Arbeid · Oppgaver</span>
        <PrintButton />
      </div>
      <div className="hero">Oppgaver</div>
      <div className="herosub">Alt som krever handling — legg til, kryss av og hold listen kort.</div>
      <div className="rule" />
      {canEdit ? <BraindumpPanel data={data} showToast={showToast} refreshAll={refreshAll} /> : null}
      {canEdit ? (
        <div className="card no-print" style={{ padding: "22px 24px", marginBottom: 30 }}>
          <div className="f2">
            <div className="field">
              <label>Tittel</label>
              <input className="input" placeholder="Hva må gjøres" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>
            <div className="field">
              <label>Beskrivelse</label>
              <input className="input" placeholder="Valgfritt" value={form.sub} onChange={(e) => setForm({ ...form, sub: e.target.value })} />
            </div>
          </div>
          <div className="field">
            <label>Notater / detaljer</label>
            <textarea className="ta" style={{ minHeight: 60 }} placeholder="Valgfritt — lenker, kontekst, delsteg" value={form.descr} onChange={(e) => setForm({ ...form, descr: e.target.value })} />
          </div>
          <div className="f2">
            <div className="field">
              <label>Status</label>
              <select className="select" value={form.tag} onChange={(e) => setForm({ ...form, tag: e.target.value })}>
                {TASK_TAGS.map((tag) => (
                  <option key={tag} value={tag}>{tag}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Ansvarlig</label>
              <select className="select" value={form.who} onChange={(e) => setForm({ ...form, who: e.target.value })}>
                {team.map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="f2">
            <div className="field">
              <label>Prioritet</label>
              <select className="select" value={form.prio} onChange={(e) => setForm({ ...form, prio: e.target.value })}>
                {TASK_PRIOS.map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Frist (valgfritt)</label>
              <input className="input" type="date" value={form.due} onChange={(e) => setForm({ ...form, due: e.target.value })} />
            </div>
          </div>
          <button className="btn ghost sm" onClick={submit} disabled={busy || !form.title.trim()}>
            {busy ? "Lagrer …" : "+ Legg til oppgave"}
          </button>
        </div>
      ) : null}
      <div className="chips no-print" style={{ marginBottom: 18, alignItems: "center" }}>
        <select className="select" style={{ width: "auto", padding: "9px 11px", fontSize: 12 }} value={filterWho} onChange={(e) => setFilterWho(e.target.value)}>
          <option value="Alle">Alle ansvarlige</option>
          {team.map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
        <button className={"chip " + (filterPrio === "Alle" ? "on" : "")} onClick={() => setFilterPrio("Alle")}>Alle</button>
        <button className={"chip " + (filterPrio === "hast" ? "on" : "")} onClick={() => setFilterPrio("hast")}>Haster</button>
        {TASK_PRIOS.filter(([v]) => v).map(([v, l]) => (
          <button key={v} className={"chip " + (filterPrio === v ? "on" : "")} onClick={() => setFilterPrio(v)}>{l}</button>
        ))}
        <select className="select" style={{ width: "auto", padding: "9px 11px", fontSize: 12, marginLeft: "auto" }} value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
          <option value="nyeste">Nyeste først</option>
          <option value="frist">Frist først</option>
          <option value="prioritet">Prioritet først</option>
        </select>
      </div>
      <div className="sechead">
        <span className="eyebrow gold">Krever handling</span>
        <span className="mut">{open.length} åpne{filtering ? " (filtrert)" : ""}</span>
      </div>
      <div className="tscroll">
        <table className="htbl"><tbody>{open.map((t, i) => row(t, i, true))}</tbody></table>
      </div>
      {open.length === 0 ? (
        <div className="mut" style={{ padding: "18px 0" }}>
          {filtering ? "Ingen oppgaver matcher filteret." : "Ingen åpne oppgaver — bra jobba."}
        </div>
      ) : null}
      {done.length ? (
        <div>
          <div className="rule" />
          <div className="sechead">
            <span className="eyebrow">Fullført</span>
            <span className="mut">{done.length}</span>
          </div>
          <div className="tscroll">
            <table className="htbl"><tbody>{done.map((t, i) => row(t, i, false))}</tbody></table>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Hygienisering                                                       */
/* ------------------------------------------------------------------ */

const HYG_STYLES = [
  { color: "#1C3A5C", dash: "" },
  { color: "#B8993A", dash: "" },
  { color: "#5A6270", dash: "" },
  { color: "#1C3A5C", dash: "5 4" },
];

function fmtDT(ms) {
  const d = new Date(ms);
  return String(d.getDate()).padStart(2, "0") + "." + String(d.getMonth() + 1).padStart(2, "0") + " " + String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
}

function HygieneChart({ series, minTemp }) {
  const chCount = series.reduce((m, s) => Math.max(m, s.temps.length), 0);
  let lo = 10;
  let hi = 80;
  series.forEach((s) => s.temps.forEach((t) => {
    if (t != null) {
      if (t < lo) lo = t;
      if (t > hi) hi = t;
    }
  }));
  lo = Math.floor(lo) - 2;
  hi = Math.ceil(hi) + 2;
  const t0 = series.length ? series[0].t : 0;
  const t1 = series.length ? series[series.length - 1].t : 1;
  const x = (t) => 42 + ((t - t0) / Math.max(1, t1 - t0)) * 946;
  const y = (v) => 274 - ((v - lo) / (hi - lo)) * 258;

  const grid = [];
  for (let i = 0; i <= 4; i++) {
    const val = lo + ((hi - lo) * i) / 4;
    grid.push(
      <line key={"g" + i} x1={42} x2={988} y1={y(val)} y2={y(val)} stroke="rgba(28,58,92,0.10)" strokeWidth={1} vectorEffect="non-scaling-stroke" />,
      <text key={"t" + i} x={34} y={y(val) + 3} textAnchor="end" fontSize={11} fill="#5A6270">{Math.round(val)}</text>
    );
  }

  const lines = [];
  for (let ch = 0; ch < chCount; ch++) {
    const pts = series
      .filter((s) => s.temps[ch] !== undefined && s.temps[ch] !== null)
      .map((s) => x(s.t) + "," + y(s.temps[ch]))
      .join(" ");
    if (!pts) continue;
    const style = HYG_STYLES[ch % 4];
    lines.push(
      <polyline key={"p" + ch} points={pts} fill="none" stroke={style.color} strokeWidth={1.7} strokeDasharray={style.dash || undefined} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" opacity={style.dash ? 0.85 : 1} />
    );
  }

  return (
    <svg viewBox="0 0 1000 300" width="100%" style={{ display: "block", height: "auto", overflow: "visible" }} preserveAspectRatio="none">
      {grid}
      <line x1={42} x2={988} y1={y(minTemp)} y2={y(minTemp)} stroke="#B8993A" strokeWidth={1} strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
      <text x={988} y={y(minTemp) - 5} textAnchor="end" fontSize={11} fill="#B8993A">{minTemp}°C krav</text>
      {lines}
      {series.length ? <text x={42} y={294} fontSize={11} fill="#5A6270">{fmtDT(t0)}</text> : null}
      {series.length ? <text x={500} y={294} textAnchor="middle" fontSize={11} fill="#5A6270">{fmtDT((t0 + t1) / 2)}</text> : null}
      {series.length ? <text x={988} y={294} textAnchor="end" fontSize={11} fill="#5A6270">{fmtDT(t1)}</text> : null}
    </svg>
  );
}

function HygieneView({ canEdit }) {
  const [data, setData] = useState(null);
  const [dragHot, setDragHot] = useState(false);
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState("");
  const inputRef = useRef(null);

  const [loadError, setLoadError] = useState(false);
  // A DB hiccup must show as an error with retry — not as the misleading
  // "Ingen logger importert ennå" empty state.
  const load = async () => {
    setLoadError(false);
    const r = await api("/api/hygiene");
    if (!r.ok) {
      setLoadError(true);
      return;
    }
    const body = await r.json().catch(() => null);
    if (body && !body.error) setData(body);
    else setLoadError(true);
  };
  useEffect(() => { load(); }, []);

  const upload = async (files) => {
    const file = (files && files[0]) || null;
    if (!file) return;
    setImporting(true);
    setMessage("Leser fil …");
    const form = new FormData();
    form.append("file", file);
    // Large logger exports legitimately take a while — don't abort at 15s.
    const res = await api("/api/hygiene", { method: "POST", body: form, timeoutMs: 30000 });
    const body = await res.json().catch(() => ({}));
    setImporting(false);
    if (!res.ok) {
      setMessage(body.error || "Import feilet.");
      return;
    }
    setMessage("Importert " + body.rows + " målepunkter.");
    load();
  };

  const remove = async (id) => {
    await api("/api/hygiene/" + id, { method: "DELETE" });
    load();
  };

  const latest = data && data.latest;

  return (
    <div>
      <span className="eyebrow">Drift · Dokumentasjon</span>
      <div className="hero">Hygienisering</div>
      <div className="herosub">§19-dokumentasjon fra Center 374-loggeren. Eksporter fra PC-programmet som CSV eller tekst og last opp her.</div>
      <div className="rule" />
      {canEdit ? (
        <div
          className={"drop " + (dragHot ? "hot" : "")}
          onDragOver={(e) => { e.preventDefault(); if (!dragHot) setDragHot(true); }}
          onDragLeave={(e) => { e.preventDefault(); setDragHot(false); }}
          onDrop={(e) => { e.preventDefault(); setDragHot(false); upload(e.dataTransfer && e.dataTransfer.files); }}
          onClick={() => { if (inputRef.current) inputRef.current.click(); }}
        >
          <div className="di">{importing ? "Importerer …" : "Slipp logger-eksport her, eller klikk for å velge"}</div>
          <div className="ds">CSV eller tekstfil fra Center 374-programmet — 4 kanaler leses automatisk</div>
          <input type="file" accept=".csv,.txt,.tsv,text/plain,text/csv" style={{ display: "none" }} ref={inputRef} onChange={(e) => { upload(e.target.files); e.target.value = ""; }} />
        </div>
      ) : null}
      {message ? <div className="mut" style={{ marginBottom: 18 }}>{message}</div> : null}
      {latest ? (
        <div>
          <div className="sechead" style={{ marginTop: 10 }}>
            <span className="eyebrow">Siste logg · {latest.filename}</span>
            <span className={"tag " + (latest.pass ? "navy" : "gold")}>{latest.pass ? "Godkjent §19" : "Ikke godkjent"}</span>
          </div>
          <div className="kpirow" style={{ marginBottom: 26 }}>
            {latest.channels.map((c) => (
              <div className="kpi" key={c.ch}>
                <div className="k">Kanal {c.ch}</div>
                <div className={"v " + (c.pass ? "" : "gold")}>
                  {c.maxMinutes}
                  <span style={{ fontSize: 14, color: "var(--muted)", fontWeight: 500 }}> min</span>
                </div>
                <div className="c">lengste sammenhengende ≥ {latest.minTemp}°C · krav {latest.minMinutes} min</div>
              </div>
            ))}
          </div>
          <div className="charthead">
            <span className="eyebrow">Temperatur · {fmtDT(latest.from)} – {fmtDT(latest.to)}</span>
          </div>
          <HygieneChart series={latest.series} minTemp={latest.minTemp} />
          <div className="legend">
            {latest.channels.map((c, i) => (
              <span className="lg" key={c.ch}>
                <span className="sw" style={{ background: HYG_STYLES[i % 4].color, opacity: HYG_STYLES[i % 4].dash ? 0.8 : 1 }} />
                Kanal {c.ch}
              </span>
            ))}
          </div>
          <div className="rule" />
          <div className="sechead">
            <span className="eyebrow">Importhistorikk</span>
            <span className="mut">{data.imports.length}</span>
          </div>
          <table className="dtbl">
            <tbody>
              {data.imports.map((imp) => (
                <tr key={imp.id}>
                  <td>
                    <span className="sy">{imp.filename}</span>
                    <div className="dt">
                      {(() => {
                        const d = new Date(imp.imported_at);
                        return String(d.getDate()).padStart(2, "0") + "." + String(d.getMonth() + 1).padStart(2, "0") + "." + d.getFullYear();
                      })()} · {imp.imported_by}
                    </div>
                  </td>
                  <td className="num">{imp.row_count} punkter</td>
                  <td className="num rt">
                    {canEdit ? (
                      <button className="lnk g" onClick={() => { if (window.confirm("Slette importen «" + imp.filename + "»?")) remove(imp.id); }}>Slett</button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : loadError ? (
        <div className="mut" style={{ marginTop: 10 }}>
          Fikk ikke lastet hygieniseringsdataene.{" "}
          <button className="lnk" style={{ padding: 0 }} onClick={load}>Prøv igjen</button>
        </div>
      ) : data ? (
        <div className="mut" style={{ marginTop: 10 }}>
          Ingen logger importert ennå. Koble Center 374 til PC-en, eksporter siste periode, og last opp filen her.
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Fôring & batcher                                                    */
/* ------------------------------------------------------------------ */

const FEED_RANGES = [["30", "30D"], ["90", "90D"], ["365", "1 år"]];
const EMPTY_BATCH = { batch_code: "", system: "", started_at: "", harvested_at: "", volume_l: "", weight_kg: "", moisture_pct: "", notes: "" };
const BATCH_STATUSES = ["aktiv", "høstet", "arkivert"];

// Fôring is a REPORT, not a form — feed volume is already captured on the
// same log entry as pH/temp/moisture (dash.readings_all.for_l), by design,
// so there is deliberately no separate input here to keep in sync with that.
// Batcher IS a form: harvest logging doesn't exist anywhere yet, on paper or
// otherwise, so this is built ahead of the first real batch rather than
// reverse-engineered from data that isn't there.
function FeedingBatchesView({ data, canEdit, showToast }) {
  const [tab, setTab] = useState("foring");
  const [feed, setFeed] = useState(null);
  const [feedDays, setFeedDays] = useState("30");
  const [feedLoading, setFeedLoading] = useState(true);

  const [batches, setBatches] = useState(null);
  const [form, setForm] = useState(EMPTY_BATCH);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(EMPTY_BATCH);
  const [busy, setBusy] = useState(false);

  const loadFeed = async (days) => {
    setFeedLoading(true);
    const res = await api("/api/feeding?days=" + days);
    if (res.ok) setFeed(await res.json());
    setFeedLoading(false);
  };
  const loadBatches = async () => {
    const res = await api("/api/batches");
    if (res.ok) setBatches((await res.json()).batches);
  };

  useEffect(() => { loadFeed(feedDays); }, [feedDays]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (tab === "batcher" && batches === null) loadBatches(); }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  const systems = data.systems.map((s) => s.id);

  const submitBatch = async () => {
    if (!form.system || busy) return;
    setBusy(true);
    const res = await api("/api/batches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setBusy(false);
    if (!res.ok) { if (showToast) showToast(await failMsg(res, "Kunne ikke lagre batchen.")); return; }
    const created = await res.json();
    setBatches((b) => [created, ...(b || [])]);
    setForm(EMPTY_BATCH);
    setAdding(false);
  };

  const startEdit = (b) => {
    setEditingId(b.id);
    setEditForm({
      batch_code: b.batch_code || "", system: b.system,
      started_at: b.started_at || "", harvested_at: b.harvested_at || "",
      volume_l: b.volume_l ?? "", weight_kg: b.weight_kg ?? "", moisture_pct: b.moisture_pct ?? "",
      notes: b.notes || "", status: b.status,
    });
  };

  const saveEdit = async (id) => {
    const res = await api("/api/batches", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...editForm }),
    });
    if (!res.ok) { if (showToast) showToast(await failMsg(res, "Kunne ikke lagre.")); return; }
    const updated = await res.json();
    setBatches((b) => b.map((x) => (x.id === id ? updated : x)));
    setEditingId(null);
  };

  const removeBatch = async (id) => {
    if (!window.confirm("Slette denne batchen?")) return;
    setBatches((b) => b.filter((x) => x.id !== id));
    const res = await api("/api/batches?id=" + id, { method: "DELETE" });
    if (!res.ok && showToast) showToast("Kunne ikke slette — last siden på nytt.");
  };

  return (
    <div>
      <span className="eyebrow">Drift</span>
      <div className="hero">Fôring &amp; batcher</div>
      <div className="herosub">Input og output — hva som mates inn, hva som høstes ut.</div>
      <div className="rule" />

      <div className="sechead">
        <div className="toggle">
          <button className={"tbtn " + (tab === "foring" ? "on" : "")} onClick={() => setTab("foring")}>Fôring</button>
          <button className={"tbtn " + (tab === "batcher" ? "on" : "")} onClick={() => setTab("batcher")}>Batcher</button>
        </div>
      </div>

      {tab === "foring" ? (
        <>
          <div className="sechead">
            <span className="eyebrow">Fôringshistorikk</span>
            <div className="toggle">
              {FEED_RANGES.map(([v, label]) => (
                <button key={v} className={"tbtn " + (feedDays === v ? "on" : "")} onClick={() => setFeedDays(v)}>{label}</button>
              ))}
            </div>
          </div>

          {feedLoading ? (
            <p className="mut">Laster …</p>
          ) : !feed || !feed.totals.total_entries ? (
            <div style={{ padding: "32px 0", textAlign: "center" }}>
              <span className="mut">Ingen fôring loggført i denne perioden.</span>
            </div>
          ) : (
            <>
              <div className="kpirow" style={{ marginBottom: 24 }}>
                <div className="kpi">
                  <div className="k">Totalt fôret</div>
                  <div className="v">{Math.round(feed.totals.total_liters)} L</div>
                  <div className="c">{feed.totals.total_entries} loggføringer</div>
                </div>
                <div className="kpi">
                  <div className="k">Siste fôring</div>
                  <div className="v" style={{ fontSize: 20 }}>{feed.totals.siste_foring ? fmtDate(feed.totals.siste_foring) : "—"}</div>
                </div>
                {feed.bySystem.slice(0, 2).map((s) => (
                  <div className="kpi" key={s.system}>
                    <div className="k">{s.system}</div>
                    <div className="v">{Math.round(s.liters)} L</div>
                    <div className="c">siste: {fmtDate(s.siste)}</div>
                  </div>
                ))}
              </div>

              {feed.bySystem.length > 2 ? (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 16, marginBottom: 24 }}>
                  {feed.bySystem.map((s) => (
                    <div className="setrow" key={s.system} style={{ padding: "8px 0" }}>
                      <div className="sl">{s.system}</div>
                      <span className="trange"><span className="pill">{Math.round(s.liters)} L</span></span>
                    </div>
                  ))}
                </div>
              ) : null}

              <div className="tscroll">
                <table>
                  <thead><tr><th>Dato</th><th>System</th><th>Liter</th><th>Loggføringer</th></tr></thead>
                  <tbody>
                    {feed.rows.map((r, i) => (
                      <tr key={r.date + r.system + i}>
                        <td>{fmtDate(r.date)}</td>
                        <td>{r.system}</td>
                        <td>{Math.round(r.liters * 10) / 10} L</td>
                        <td className="mut">{r.entries}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      ) : (
        <>
          <div className="sechead">
            <span className="eyebrow">Batcher</span>
            {canEdit ? (
              <button className="btn ghost sm" onClick={() => setAdding(!adding)}>{adding ? "Avbryt" : "+ Ny batch"}</button>
            ) : null}
          </div>

          {adding ? (
            <div style={{ border: "1px solid var(--line)", padding: 18, marginBottom: 20, background: "#fff" }}>
              <div className="f2" style={{ marginBottom: 12 }}>
                <div className="field" style={{ marginBottom: 0 }}>
                  <label>System</label>
                  <select className="select" value={form.system} onChange={(e) => setForm({ ...form, system: e.target.value })}>
                    <option value="">— velg —</option>
                    {systems.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div className="field" style={{ marginBottom: 0 }}>
                  <label>Batch-kode</label>
                  <input className="input" placeholder="Valgfritt, f.eks. B-2026-01" value={form.batch_code} onChange={(e) => setForm({ ...form, batch_code: e.target.value })} />
                </div>
              </div>
              <div className="f2" style={{ marginBottom: 12 }}>
                <div className="field" style={{ marginBottom: 0 }}>
                  <label>Startet</label>
                  <input className="input" type="date" value={form.started_at} onChange={(e) => setForm({ ...form, started_at: e.target.value })} />
                </div>
                <div className="field" style={{ marginBottom: 0 }}>
                  <label>Høstet (valgfritt)</label>
                  <input className="input" type="date" value={form.harvested_at} onChange={(e) => setForm({ ...form, harvested_at: e.target.value })} />
                </div>
              </div>
              <div className="f2" style={{ marginBottom: 12 }}>
                <div className="field" style={{ marginBottom: 0 }}>
                  <label>Volum (L)</label>
                  <input className="input" type="number" value={form.volume_l} onChange={(e) => setForm({ ...form, volume_l: e.target.value })} />
                </div>
                <div className="field" style={{ marginBottom: 0 }}>
                  <label>Vekt (kg)</label>
                  <input className="input" type="number" value={form.weight_kg} onChange={(e) => setForm({ ...form, weight_kg: e.target.value })} />
                </div>
              </div>
              <div className="field" style={{ marginBottom: 12 }}>
                <label>Notater</label>
                <textarea className="ta" style={{ minHeight: 60 }} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>
              <button className="btn sm" disabled={!form.system || busy} onClick={submitBatch}>Lagre batch</button>
            </div>
          ) : null}

          {batches === null ? (
            <p className="mut">Laster …</p>
          ) : batches.length === 0 ? (
            <div style={{ padding: "32px 0", textAlign: "center" }}>
              <span className="mut">Ingen batcher registrert ennå. Loggingen starter når høstesystemet er klart.</span>
            </div>
          ) : (
            <div className="tscroll">
              <table>
                <thead><tr><th>Batch</th><th>System</th><th>Startet</th><th>Høstet</th><th>Volum / vekt</th><th>Status</th><th /></tr></thead>
                <tbody>
                  {batches.map((b) => editingId === b.id ? (
                    <tr key={b.id}>
                      <td colSpan={7} style={{ paddingRight: 0 }}>
                        <div className="f2" style={{ marginBottom: 12 }}>
                          <div className="field" style={{ marginBottom: 0 }}>
                            <label>Batch-kode</label>
                            <input className="input" value={editForm.batch_code} onChange={(e) => setEditForm({ ...editForm, batch_code: e.target.value })} />
                          </div>
                          <div className="field" style={{ marginBottom: 0 }}>
                            <label>System</label>
                            <select className="select" value={editForm.system} onChange={(e) => setEditForm({ ...editForm, system: e.target.value })}>
                              {systems.map((s) => <option key={s} value={s}>{s}</option>)}
                            </select>
                          </div>
                        </div>
                        <div className="f2" style={{ marginBottom: 12 }}>
                          <div className="field" style={{ marginBottom: 0 }}>
                            <label>Startet</label>
                            <input className="input" type="date" value={editForm.started_at} onChange={(e) => setEditForm({ ...editForm, started_at: e.target.value })} />
                          </div>
                          <div className="field" style={{ marginBottom: 0 }}>
                            <label>Høstet</label>
                            <input className="input" type="date" value={editForm.harvested_at} onChange={(e) => setEditForm({ ...editForm, harvested_at: e.target.value })} />
                          </div>
                        </div>
                        <div className="f2" style={{ marginBottom: 12 }}>
                          <div className="field" style={{ marginBottom: 0 }}>
                            <label>Volum (L)</label>
                            <input className="input" type="number" value={editForm.volume_l} onChange={(e) => setEditForm({ ...editForm, volume_l: e.target.value })} />
                          </div>
                          <div className="field" style={{ marginBottom: 0 }}>
                            <label>Vekt (kg)</label>
                            <input className="input" type="number" value={editForm.weight_kg} onChange={(e) => setEditForm({ ...editForm, weight_kg: e.target.value })} />
                          </div>
                          <div className="field" style={{ marginBottom: 0 }}>
                            <label>Status</label>
                            <select className="select" value={editForm.status} onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}>
                              {BATCH_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                            </select>
                          </div>
                        </div>
                        <button className="btn sm" onClick={() => saveEdit(b.id)}>Lagre</button>{" "}
                        <button className="lnk" onClick={() => setEditingId(null)}>Avbryt</button>
                      </td>
                    </tr>
                  ) : (
                    <tr key={b.id}>
                      <td>{b.batch_code || <span className="mut">—</span>}</td>
                      <td>{b.system}</td>
                      <td>{b.started_at ? fmtDate(b.started_at) : "—"}</td>
                      <td>{b.harvested_at ? fmtDate(b.harvested_at) : "—"}</td>
                      <td className="mut">{[b.volume_l ? Math.round(b.volume_l) + " L" : null, b.weight_kg ? Math.round(b.weight_kg) + " kg" : null].filter(Boolean).join(" · ") || "—"}</td>
                      <td><span className={"tag " + (b.status === "høstet" ? "navy" : "")}>{b.status}</span></td>
                      <td className="rt">
                        {canEdit ? (
                          <>
                            <button className="lnk" onClick={() => startEdit(b)}>Endre</button>{" "}
                            <button className="lnk g" onClick={() => removeBatch(b.id)}>Slett</button>
                          </>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Innstillinger                                                       */
/* ------------------------------------------------------------------ */

function SettingsView({ data, targets, setTargets, saveTargets, canEdit, addSystem, updateSystem, deleteSystem, addMember, updateMember, deleteMember, saveSensorMap }) {
  const isAdmin = data.user?.access === "Admin";
  const [memberAdding, setMemberAdding] = useState(false);
  const EMPTY_MEMBER = { name: "", role: "", access: "Redigering", password: "" };
  const [memberForm, setMemberForm] = useState(EMPTY_MEMBER);
  const [memberEditId, setMemberEditId] = useState(null);
  const [memberBusy, setMemberBusy] = useState(false);
  const [aiTest, setAiTest] = useState("");
  const systems = data.systems.map((s) => s.id);
  const latest = latestBySystem(data.readings, systems);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ name: "", status: "I drift" });
  const [oldPw, setOldPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [pwMsg, setPwMsg] = useState("");
  const [syncMsg, setSyncMsg] = useState("");

  const target = (metric) => targets.find((t) => t.metric === metric) || { min: "", max: "" };
  const setTarget = (metric, field) => (e) => {
    setTargets(targets.map((t) => (t.metric === metric ? { ...t, [field]: e.target.value } : t)));
  };

  const changePassword = async () => {
    setPwMsg("");
    const res = await api("/api/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ old: oldPw, next: newPw }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setPwMsg(body.error || "Noe gikk galt.");
      return;
    }
    setOldPw("");
    setNewPw("");
    setPwMsg("Passord oppdatert.");
  };

  const [inboxLastSync, setInboxLastSync] = useState(data.inboxLastSync || null);

  const syncInboxNow = async () => {
    setSyncMsg("Synkroniserer — kan ta opptil et halvt minutt …");
    const res = await api("/api/inbox/sync", { method: "POST", timeoutMs: 35000 });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setSyncMsg(body.error || "Synk feilet — prøv igjen.");
      return;
    }
    setInboxLastSync(body.last_sync);
    setSyncMsg(
      "Hentet " + (body.hentet === 1 ? "1 tråd" : body.hentet + " tråder") +
      " · " + (body.nye === 1 ? "1 ny" : body.nye + " nye") +
      " · " + body.oppdatert + " oppdatert"
    );
  };

  // Live app data flows in via dash.readings_all — freshness = newest phone log.
  const newestApp = data.readings.find((r) => r.source === "app");
  const appFresh = !!newestApp && newestApp.date >= isoDaysAgo(3);
  const inboxFresh = !!inboxLastSync && Date.now() - Date.parse(inboxLastSync) < 26 * 60 * 60 * 1000;

  const targetInput = (metric, field, style) => (
    <input
      className="tin"
      value={target(metric)[field]}
      onChange={setTarget(metric, field)}
      onBlur={saveTargets}
      readOnly={!canEdit}
      style={canEdit ? style : { ...style, background: "rgba(28,58,92,.03)" }}
    />
  );

  // A channel is listed if it has been mapped OR has ever reported a reading.
  // Driving it off actual traffic means a newly paired sensor appears here on
  // its own, rather than waiting for someone to know it exists and add it.
  const sensorChannels = (() => {
    const byCh = new Map();
    for (const m of data.sensorMap || []) byCh.set(m.channel, { channel: m.channel, system: m.system });
    for (const r of data.sensorLatest || []) {
      const e = byCh.get(r.channel) || { channel: r.channel, system: "" };
      byCh.set(r.channel, { ...e, reading: r });
    }
    return [...byCh.values()].sort((a, b) => a.channel - b.channel);
  })();

  return (
    <div>
      <span className="eyebrow">Konto</span>
      <div className="hero">Innstillinger</div>
      <div className="herosub">Systemer, målområder og team. Enkelt å holde vedlike.</div>
      <div className="rule" />
      <div className="setgrid">
        <div>
          <div className="sechead">
            <span className="eyebrow">Systemer</span>
            {canEdit ? (
              <button className="btn ghost sm" onClick={() => setAdding(!adding)}>+ Nytt system</button>
            ) : null}
          </div>
          {adding ? (
            <div className="setrow" style={{ gap: 10 }}>
              <input className="input" placeholder="Navn, f.eks. CFT4" value={newName} onChange={(e) => setNewName(e.target.value)} />
              <span className="trange">
                <button className="btn sm" onClick={async () => { if (newName.trim()) { await addSystem(newName.trim()); setNewName(""); setAdding(false); } }}>
                  Legg til
                </button>
                <button className="lnk" onClick={() => setAdding(false)}>Avbryt</button>
              </span>
            </div>
          ) : null}
          {data.systems.map((s) => {
            const r = latest[s.id];
            return editingId === s.id ? (
              <div className="setrow" style={{ gap: 10 }} key={s.id}>
                <input className="input" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
                <span className="trange">
                  <select className="select" style={{ width: "auto", padding: "9px 11px", fontSize: 12 }} value={editForm.status} onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}>
                    <option value="I drift">I drift</option>
                    <option value="Tatt ut">Tatt ut</option>
                  </select>
                  <button className="btn sm" onClick={async () => { await updateSystem(s.id, editForm.name.trim() || s.id, editForm.status); setEditingId(null); }}>Lagre</button>
                  <button className="lnk" onClick={() => setEditingId(null)}>Avbryt</button>
                  <button className="lnk g" onClick={() => { if (window.confirm("Slette systemet «" + s.id + "»?")) { deleteSystem(s.id); setEditingId(null); } }}>Slett</button>
                </span>
              </div>
            ) : (
              <div className="setrow" key={s.id}>
                <div>
                  <div className={"sl" + (s.status === "I drift" ? "" : " mut")}>{s.id}</div>
                  <div className="ss">{fmtVal(r.temp, "°")} · pH {fmtPh(r.ph)} · {fmtVal(r.fukt, "%")} fukt</div>
                </div>
                <span className="trange">
                  <span className={"pill" + (s.status === "I drift" ? "" : " warn")}>{s.status}</span>
                  {canEdit ? (
                    <button className="lnk" onClick={() => { setEditingId(s.id); setEditForm({ name: s.id, status: s.status }); }}>Endre</button>
                  ) : null}
                </span>
              </div>
            );
          })}
          <div className="sechead" style={{ marginTop: 36 }}>
            <span className="eyebrow">Sensorer</span>
            <span className="mut" style={{ fontSize: 11 }}>Ecowitt · kanal → system</span>
          </div>
          {sensorChannels.length === 0 ? (
            <div className="mut" style={{ fontSize: 12, padding: "12px 0" }}>
              Ingen sensorer har meldt seg ennå. Kanaler dukker opp her av seg selv
              så snart gatewayen sender sin første måling.
            </div>
          ) : (
            sensorChannels.map((ch) => {
              const r = ch.reading;
              const mins = r ? Math.round((Date.now() - new Date(r.measured_at).getTime()) / 60000) : null;
              return (
                <div className="setrow" key={ch.channel}>
                  <div>
                    <div className={"sl" + (ch.system ? "" : " mut")}>Kanal {ch.channel}</div>
                    <div className="ss">
                      {r
                        ? fmtVal(r.temp, "°") + " · " + fmtVal(r.moisture, "%") + " fukt · " +
                          (mins < 60 ? mins + " min siden" : Math.round(mins / 60) + " t siden")
                        : "ingen målinger ennå"}
                    </div>
                  </div>
                  <span className="trange">
                    <select
                      className="select"
                      style={{ width: "auto", padding: "9px 11px", fontSize: 12 }}
                      value={ch.system || ""}
                      disabled={!canEdit}
                      onChange={(e) => e.target.value && saveSensorMap(ch.channel, e.target.value)}
                    >
                      <option value="">— velg system —</option>
                      {data.systems.map((s) => (
                        <option key={s.id} value={s.id}>{s.id}</option>
                      ))}
                    </select>
                  </span>
                </div>
              );
            })
          )}
          <div className="sechead" style={{ marginTop: 36 }}>
            <span className="eyebrow">Team</span>
            {isAdmin ? (
              <button className="btn ghost sm" onClick={() => { setMemberAdding(!memberAdding); setMemberEditId(null); setMemberForm(EMPTY_MEMBER); }}>
                {memberAdding ? "Avbryt" : "+ Nytt medlem"}
              </button>
            ) : null}
          </div>
          {memberAdding ? (
            <div className="card" style={{ padding: "18px 20px", marginBottom: 16 }}>
              <div className="f2" style={{ gap: 12, marginBottom: 12 }}>
                <div className="field" style={{ marginBottom: 0 }}>
                  <label>Navn</label>
                  <input className="input" value={memberForm.name} onChange={(e) => setMemberForm({ ...memberForm, name: e.target.value })} />
                </div>
                <div className="field" style={{ marginBottom: 0 }}>
                  <label>Rolle (fritekst)</label>
                  <input className="input" placeholder="F.eks. Drift · helg" value={memberForm.role} onChange={(e) => setMemberForm({ ...memberForm, role: e.target.value })} />
                </div>
              </div>
              <div className="f2" style={{ gap: 12, marginBottom: 12 }}>
                <div className="field" style={{ marginBottom: 0 }}>
                  <label>Tilgang</label>
                  <select className="select" value={memberForm.access} onChange={(e) => setMemberForm({ ...memberForm, access: e.target.value })}>
                    <option>Admin</option>
                    <option>Redigering</option>
                    <option>Kun lesing</option>
                  </select>
                </div>
                <div className="field" style={{ marginBottom: 0 }}>
                  <label>Passord (minst 6 tegn)</label>
                  <input className="input" type="password" value={memberForm.password} onChange={(e) => setMemberForm({ ...memberForm, password: e.target.value })} />
                </div>
              </div>
              <button
                className="btn sm"
                disabled={memberBusy || !memberForm.name.trim() || memberForm.password.length < 6}
                onClick={async () => {
                  setMemberBusy(true);
                  const ok = await addMember(memberForm);
                  setMemberBusy(false);
                  if (ok) { setMemberAdding(false); setMemberForm(EMPTY_MEMBER); }
                }}
              >
                {memberBusy ? "Lagrer …" : "Legg til medlem"}
              </button>
            </div>
          ) : null}
          {data.team.map((t) =>
            memberEditId === t.id ? (
              <div className="card" style={{ padding: "18px 20px", marginBottom: 12 }} key={t.id}>
                <div className="f2" style={{ gap: 12, marginBottom: 12 }}>
                  <div className="field" style={{ marginBottom: 0 }}>
                    <label>Navn</label>
                    <input className="input" value={memberForm.name} onChange={(e) => setMemberForm({ ...memberForm, name: e.target.value })} />
                    {memberForm.name.trim() && memberForm.name.trim() !== t.name ? (
                      <span className="mut" style={{ fontSize: 11 }}>Nytt navn: {t.name === data.user?.name ? "du forblir innlogget" : t.name + " må logge inn på nytt"}.</span>
                    ) : null}
                  </div>
                  <div className="field" style={{ marginBottom: 0 }}>
                    <label>Rolle</label>
                    <input className="input" value={memberForm.role} onChange={(e) => setMemberForm({ ...memberForm, role: e.target.value })} />
                  </div>
                </div>
                <div className="f2" style={{ gap: 12, marginBottom: 12 }}>
                  <div className="field" style={{ marginBottom: 0 }}>
                    <label>Tilgang</label>
                    <select className="select" value={memberForm.access} onChange={(e) => setMemberForm({ ...memberForm, access: e.target.value })}>
                      <option>Admin</option>
                      <option>Redigering</option>
                      <option>Kun lesing</option>
                    </select>
                  </div>
                  <div className="field" style={{ marginBottom: 0 }}>
                    <label>Nytt passord (valgfritt)</label>
                    <input className="input" type="password" placeholder="La stå tomt for å beholde" value={memberForm.password} onChange={(e) => setMemberForm({ ...memberForm, password: e.target.value })} />
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <button
                    className="btn sm"
                    disabled={memberBusy}
                    onClick={async () => {
                      setMemberBusy(true);
                      const ok = await updateMember({ id: t.id, ...memberForm });
                      setMemberBusy(false);
                      if (ok) setMemberEditId(null);
                    }}
                  >
                    Lagre
                  </button>
                  <button className="lnk" onClick={() => setMemberEditId(null)}>Avbryt</button>
                  <button
                    className="lnk g"
                    style={{ marginLeft: "auto" }}
                    onClick={() => {
                      if (window.confirm("Slette «" + t.name + "» fra teamet? Vedkommende mister tilgang til dashbordet.")) {
                        deleteMember(t.id);
                        setMemberEditId(null);
                      }
                    }}
                  >
                    Slett
                  </button>
                </div>
              </div>
            ) : (
              <div className="setrow" key={t.id}>
                <div>
                  <div className="sl">{t.name}</div>
                  <div className="ss">{t.role}</div>
                </div>
                <span className="trange">
                  <span className="mut" style={{ fontSize: 11 }}>{t.access}</span>
                  {isAdmin ? (
                    <button className="lnk" onClick={() => { setMemberEditId(t.id); setMemberAdding(false); setMemberForm({ name: t.name, role: t.role, access: t.access, password: "" }); }}>
                      Endre
                    </button>
                  ) : null}
                </span>
              </div>
            )
          )}
          <div className="sechead" style={{ marginTop: 36 }}><span className="eyebrow">Bytt passord</span></div>
          <div className="field">
            <label>Nåværende passord</label>
            <input className="input" type="password" value={oldPw} onChange={(e) => setOldPw(e.target.value)} />
          </div>
          <div className="field">
            <label>Nytt passord (minst 6 tegn)</label>
            <input className="input" type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} />
          </div>
          <button className="btn ghost sm" onClick={changePassword}>Oppdater passord</button>
          {pwMsg ? <div className="mut" style={{ marginTop: 10 }}>{pwMsg}</div> : null}
        </div>
        <div>
          <div className="sechead"><span className="eyebrow">Målområder</span></div>
          <div className="setrow">
            <div>
              <div className="sl">Temperatur drift</div>
              <div className="ss">Normal driftstemperatur per benk</div>
            </div>
            <span className="trange">
              {targetInput("temp", "min")}<span className="mut">–</span>{targetInput("temp", "max")}<span className="mut">°C</span>
            </span>
          </div>
          <div className="setrow">
            <div>
              <div className="sl">pH</div>
              <div className="ss">Målområde for kompost</div>
            </div>
            <span className="trange">
              {targetInput("ph", "min")}<span className="mut">–</span>{targetInput("ph", "max")}
            </span>
          </div>
          <div className="setrow">
            <div>
              <div className="sl">Fuktighet</div>
              <div className="ss">Prosent fukt</div>
            </div>
            <span className="trange">
              {targetInput("fukt", "min")}<span className="mut">–</span>{targetInput("fukt", "max")}<span className="mut">%</span>
            </span>
          </div>
          <div className="setrow">
            <div>
              <div className="sl">Hygienisering §19</div>
              <div className="ss">Termofil fase — logges med egen logger</div>
            </div>
            <span className="trange">
              {targetInput("hygiene", "min")}<span className="mut">°C ·</span>{targetInput("hygiene", "max")}<span className="mut">min</span>
            </span>
          </div>
          <div className="sechead" style={{ marginTop: 36 }}><span className="eyebrow">Datakilder</span></div>
          <div className="setrow">
            <div>
              <div className="sl">Produksjonslogg · Verminord-appen</div>
              <div className="ss">
                Leses direkte fra app-databasen (log.verminord.app)
                {newestApp ? <> · Siste logg {fmtDate(newestApp.date)}</> : null}
              </div>
            </div>
            <span className={"pill" + (appFresh ? "" : " warn")}>{appFresh ? "Tilkoblet" : newestApp ? "Ingen logg siste 3 dager" : "Ingen data"}</span>
          </div>
          <div className="setrow">
            <div>
              <div className="sl">Innboks · Gmail</div>
              <div className="ss">
                Apps Script-bro · triage ved hver synk
                {inboxLastSync ? (
                  <> · Sist synk {new Date(inboxLastSync).toLocaleString("nb-NO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</>
                ) : (
                  <> · aldri synkronisert</>
                )}
              </div>
            </div>
            <span className="trange">
              <span className={"pill" + (inboxFresh ? "" : " warn")}>{inboxFresh ? "Tilkoblet" : "Trenger synk"}</span>
              {canEdit ? <button className="btn ghost sm" onClick={syncInboxNow}>Synk nå</button> : null}
            </span>
          </div>
          {syncMsg ? <div className="mut" style={{ marginTop: 8 }}>{syncMsg}</div> : null}
          <div className="setrow">
            <div>
              <div className="sl">Autologger · Forkompost</div>
              <div className="ss">Center 374 · manuell import på Hygienisering-siden</div>
            </div>
            <span className="pill">Manuell import</span>
          </div>
          <div className="setrow" style={{ alignItems: "flex-start" }}>
            <div style={{ flex: 1 }}>
              <div className="sl">AI-funksjoner</div>
              <div className="ss">
                Hjernedump-tolking · AI-triage av innboksen · svar-utkast
                {data.aiEnabled ? <> · modell {data.aiModel}</> : null}
              </div>
              {data.aiEnabled ? null : (
                <div className="ss" style={{ marginTop: 10, lineHeight: 1.7 }}>
                  <b>Slik aktiverer du (5 min, én gang):</b><br />
                  1. Lag en API-nøkkel på <b>console.anthropic.com</b> → API keys (sett gjerne en månedlig kostnadsgrense).<br />
                  2. Åpne <b>vercel.com</b> → prosjektet <b>verminord-dash</b> → Settings → Environment Variables.<br />
                  3. Legg til <b>ANTHROPIC_API_KEY</b> = nøkkelen (Production) og trykk Save.<br />
                  4. Gå til Deployments → «…» på øverste deploy → <b>Redeploy</b>. Ferdig — denne raden viser «Aktivert».
                </div>
              )}
              {aiTest ? <div className="ss" style={{ marginTop: 8, color: "var(--navy)" }}>{aiTest}</div> : null}
            </div>
            <span className="trange">
              <span className={"pill" + (data.aiEnabled ? "" : " warn")}>{data.aiEnabled ? "Aktivert" : "Ikke konfigurert"}</span>
              {data.aiEnabled && canEdit ? (
                <button
                  className="btn ghost sm"
                  onClick={async () => {
                    setAiTest("Tester …");
                    const res = await api("/api/ai/test", { method: "POST", timeoutMs: 35000 });
                    const body = await res.json().catch(() => ({}));
                    setAiTest(res.ok ? "✓ " + body.svar : body.error || "Testen feilet.");
                  }}
                >
                  Test AI
                </button>
              ) : null}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Innboks                                                             */
/* ------------------------------------------------------------------ */

// One flat tab row — the old status-toggle + category-chips + draft-chip
// combination made three controls out of one decision.
const INBOX_TABS = [
  ["apne", "Åpne", { status: "open", category: "", draft: false }],
  ["svar", "Svar kreves", { status: "open", category: "Svar kreves", draft: false }],
  ["utkast", "Utkast klare", { status: "open", category: "", draft: true }],
  ["ferdige", "Ferdige", { status: "done", category: "", draft: false }],
  ["alle", "Alle", { status: "all", category: "", draft: false }],
];

function prioColor(p) {
  if (p === "høy") return "var(--gold)";
  if (p === "lav") return "transparent";
  return "rgba(28, 58, 92, 0.3)";
}
function prioLabel(p) {
  if (p === "høy") return "Høy";
  if (p === "lav") return "Lav";
  return "Medium";
}

function InboxView({ data, canEdit, addTask, setView, showToast }) {
  const [items, setItems] = useState(data.inbox || []);
  const [total, setTotal] = useState(data.inboxCounts?.total || 0);
  const [counts, setCounts] = useState({
    open: data.inboxCounts?.total || 0,
    urgent: data.inboxCounts?.urgent || 0,
    high_priority: data.inboxCounts?.high_priority || 0,
    drafts: 0,
  });
  const [tab, setTab] = useState("apne");
  const [source, setSource] = useState("Alle");
  const [q, setQ] = useState("");
  const [expanded, setExpanded] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [loading, setLoading] = useState(false);
  const [offset, setOffset] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [lastSync, setLastSync] = useState(data.inboxLastSync || null);
  const [drafting, setDrafting] = useState(null);
  const searchTimer = useRef(null);
  // Guards against out-of-order responses: the mount fetch (default tab) and
  // a fast tab tap right after it race, and without this the SLOWER response
  // can land after the faster one and silently overwrite it with the wrong
  // tab's data — the count badge (driven by the same query) stays right while
  // the list underneath goes empty or shows something else. Every call gets a
  // ticket; a response is applied only if it is still the newest ticket
  // issued by the time it resolves.
  const requestSeq = useRef(0);

  const tabDef = (key) => INBOX_TABS.find(([k]) => k === key)[2];

  const fetchInbox = async (params = {}) => {
    const t = tabDef(params.tab ?? tab);
    const src = params.source ?? source;
    const search = params.q ?? q;
    const off = params.offset ?? 0;
    const myTicket = ++requestSeq.current;

    setLoading(true);
    const qs = new URLSearchParams({ status: t.status, limit: "50", offset: String(off) });
    if (t.category) qs.set("category", t.category);
    if (t.draft) qs.set("draft", "1");
    if (src && src !== "Alle") qs.set("source", src);
    if (search) qs.set("q", search);

    const res = await api("/api/inbox?" + qs);
    // A newer request has been issued since this one went out — its result
    // is already applied or on the way, and applying this stale one now
    // would overwrite it. Drop it silently.
    if (myTicket !== requestSeq.current) return;
    if (res.ok) {
      const body = await res.json();
      if (myTicket !== requestSeq.current) return;
      if (off > 0) {
        setItems((prev) => {
          const seen = new Set(prev.map((m) => m.id));
          return [...prev, ...body.items.filter((m) => !seen.has(m.id))];
        });
      } else {
        setItems(body.items);
      }
      setTotal(body.total);
      if (body.counts) setCounts(body.counts);
      setOffset(off);
    }
    setLoading(false);
  };

  useEffect(() => { fetchInbox(); }, []);

  const applyTab = (key) => {
    setTab(key);
    setSelected(new Set());
    setExpanded(null);
    fetchInbox({ tab: key, offset: 0 });
  };

  const applySource = (val) => {
    setSource(val);
    setSelected(new Set());
    fetchInbox({ source: val, offset: 0 });
  };

  const handleSearch = (val) => {
    setQ(val);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => fetchInbox({ q: val, offset: 0 }), 350);
  };

  // Optimistic count adjustment covering every header/tab badge, not just
  // "open" — the server recomputes authoritatively on the next fetch.
  const countDelta = (m, dir) => (c) => ({
    open: Math.max(0, c.open + dir),
    urgent: Math.max(0, c.urgent + (m.category === "Svar kreves" ? dir : 0)),
    high_priority: Math.max(0, c.high_priority + (m.priority === "høy" ? dir : 0)),
    drafts: Math.max(0, c.drafts + (m.draft_body ? dir : 0)),
  });

  // Status changes update the row in place; the row leaves the list only if
  // it no longer belongs under the current tab ("Alle" keeps it visible).
  const setItemStatus = async (id, status) => {
    const item = items.find((m) => m.id === id);
    const keeps = tabDef(tab).status === "all";
    setItems((prev) =>
      keeps ? prev.map((m) => (m.id === id ? { ...m, status } : m)) : prev.filter((m) => m.id !== id)
    );
    if (!keeps) setTotal((t) => Math.max(0, t - 1));
    if (item) setCounts(countDelta(item, status === "done" ? -1 : 1));
    const res = await api("/api/inbox", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, status }) });
    if (!res.ok && showToast) showToast(await failMsg(res, "Kunne ikke oppdatere e-posten — last siden på nytt."));
  };

  const markDone = (id) => setItemStatus(id, "done");
  const reopen = (id) => setItemStatus(id, "open");

  const toggleStar = async (id) => {
    const item = items.find((m) => m.id === id);
    if (!item) return;
    const next = !item.is_starred;
    setItems((prev) => prev.map((m) => m.id === id ? { ...m, is_starred: next } : m));
    await api("/api/inbox", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "star", id, is_starred: next }) });
  };

  const deleteItem = async (id) => {
    setItems((prev) => prev.filter((m) => m.id !== id));
    setTotal((t) => t - 1);
    await api("/api/inbox/" + id, { method: "DELETE" });
  };

  const batchDone = async () => {
    const ids = [...selected];
    const affected = items.filter((m) => selected.has(m.id));
    setItems((prev) => prev.filter((m) => !selected.has(m.id)));
    setTotal((t) => Math.max(0, t - ids.length));
    setCounts((c) => affected.reduce((acc, m) => countDelta(m, -1)(acc), c));
    setSelected(new Set());
    const res = await api("/api/inbox", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "batch_done", ids }) });
    if (!res.ok && showToast) showToast(await failMsg(res, "Kunne ikke merke alle som ferdige — last siden på nytt."));
  };

  const createTask = async (m) => {
    const ok = await addTask({ title: m.subject, sub: m.summary, tag: "Ny", who: "" });
    if (ok && showToast) showToast("Oppgave opprettet fra e-post");
  };

  const toggleSelect = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const sources = [...new Set(items.map((m) => m.source || "gmail"))];
  const selectable = canEdit && tabDef(tab).status === "open";

  const enrichNow = async () => {
    if (enriching) return;
    setEnriching(true);
    const res = await api("/api/inbox/enrich", { method: "POST", timeoutMs: 55000 });
    setEnriching(false);
    if (!res.ok) {
      if (showToast) showToast(await failMsg(res, "AI-triage feilet — prøv igjen."));
      return;
    }
    const body = await res.json();
    if (showToast) {
      showToast(
        "AI-triage ferdig: " + body.oppdatert + " e-poster vurdert på nytt" +
        (body.utkast ? " · 1 utkast laget" : "")
      );
    }
    fetchInbox({ offset: 0 });
  };

  const copyDraft = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      if (showToast) showToast("Utkast kopiert til utklippstavlen");
    } catch {
      if (showToast) showToast("Kunne ikke kopiere — velg og kopier manuelt");
    }
  };

  const syncNow = async () => {
    if (syncing) return;
    setSyncing(true);
    const res = await api("/api/inbox/sync", { method: "POST", timeoutMs: 35000 });
    setSyncing(false);
    if (!res.ok) {
      if (showToast) showToast(await failMsg(res, "Synk feilet — prøv igjen."));
      return;
    }
    const body = await res.json();
    setLastSync(body.last_sync);
    if (showToast) showToast("Synkronisert: " + (body.nye === 1 ? "1 ny" : body.nye + " nye") + " · " + body.oppdatert + " oppdatert");
    fetchInbox({ offset: 0 });
  };

  const generateDraft = async (id) => {
    if (drafting) return;
    setDrafting(id);
    const res = await api("/api/inbox/draft", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
      timeoutMs: 35000,
    });
    setDrafting(null);
    if (!res.ok) {
      if (showToast) showToast(await failMsg(res, "Kunne ikke lage utkast."));
      return;
    }
    const updated = await res.json();
    setItems((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
    if (showToast) showToast("Utkast klart — trykk Kopier for å bruke det");
  };

  const editItem = async (id, fields) => {
    setItems((prev) => prev.map((m) => (m.id === id ? { ...m, ...fields } : m)));
    const res = await api("/api/inbox", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "edit", id, ...fields }),
    });
    if (!res.ok && showToast) showToast(await failMsg(res, "Kunne ikke lagre endringen."));
  };

  return (
    <div>
      <span className="eyebrow">Innboks · E-posttriage</span>
      <div className="hero">
        Innboks<span className="li"> e-post</span>
      </div>
      <div className="herosub">
        {counts.open} åpne · {counts.urgent} krever svar · {counts.drafts} utkast klare
      </div>
      <div className="rule" />

      <div className="metrics3">
        <div className="m3">
          <div className="k">Åpne</div>
          <div className="v">{counts.open}</div>
        </div>
        <div className="m3">
          <div className="k">Høy prioritet</div>
          <div className="v gold">{counts.high_priority}</div>
        </div>
        <div className="m3">
          <div className="k">Svar kreves</div>
          <div className="v">{counts.urgent}</div>
        </div>
      </div>
      <div className="rule" />

      <div className="sechead" style={{ flexWrap: "wrap", gap: 10 }}>
        <div className="toggle">
          {INBOX_TABS.map(([key, label]) => (
            <button key={key} className={"tbtn " + (tab === key ? "on" : "")} onClick={() => applyTab(key)}>
              {label}
              {key === "svar" && counts.urgent ? " (" + counts.urgent + ")" : ""}
              {key === "utkast" && counts.drafts ? " (" + counts.drafts + ")" : ""}
            </button>
          ))}
        </div>
        <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {canEdit && data.aiEnabled ? (
            <button className="btn sm ghost" onClick={enrichNow} disabled={enriching} title="Claude leser de åpne e-postene på nytt: bedre sammendrag, riktig prioritet, støy arkiveres.">
              {enriching ? "Vurderer …" : "AI-triage"}
            </button>
          ) : null}
          <input
            className="input"
            placeholder="Søk i e-post..."
            value={q}
            onChange={(e) => handleSearch(e.target.value)}
            style={{ maxWidth: 220, padding: "9px 14px", fontSize: 13 }}
          />
        </span>
      </div>

      {sources.length > 1 && (
        <div className="chips" style={{ marginBottom: 16 }}>
          <button className={"chip " + (source === "Alle" ? "on" : "")} onClick={() => applySource("Alle")}>Alle kilder</button>
          {sources.map((s) => (
            <button key={s} className={"chip " + (source === s ? "on" : "")} onClick={() => applySource(s)}>{s}</button>
          ))}
        </div>
      )}

      {selected.size > 0 && canEdit && (
        <div className="inbox-batch">
          <span className="mut">{selected.size} valgt</span>
          <button className="btn sm" onClick={batchDone}>Merk ferdig</button>
          <button className="lnk" onClick={() => setSelected(new Set())}>Avbryt</button>
        </div>
      )}

      <div className="tscroll">
        <table className="htbl">
          <tbody>
            {items.map((m) => (
              <Fragment key={m.id}>
                <tr style={{ cursor: "pointer" }} onClick={() => setExpanded(expanded === m.id ? null : m.id)}>
                  {selectable && (
                    <td style={{ width: 28, paddingRight: 0 }} onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selected.has(m.id)}
                        onChange={() => toggleSelect(m.id)}
                        style={{ accentColor: "var(--navy)" }}
                      />
                    </td>
                  )}
                  <td style={{ width: 28, paddingRight: 0 }} onClick={(e) => { e.stopPropagation(); toggleStar(m.id); }}>
                    <button className="star-btn" style={{ color: m.is_starred ? "var(--gold)" : "var(--line)" }}>
                      {m.is_starred ? "★" : "☆"}
                    </button>
                  </td>
                  <td style={{ width: 4, padding: 0, background: prioColor(m.priority) }} />
                  <td style={{ paddingLeft: 14 }}>
                    <div className="hs" style={{ marginTop: 0, marginBottom: 3 }}>{m.sender} · {fmtReceived(m.received_at)}</div>
                    <div className="ht">
                      {m.link ? (
                        <a href={m.link} target="_blank" rel="noreferrer" style={{ color: "inherit", textDecoration: "none" }} onClick={(e) => e.stopPropagation()}>
                          {m.subject}
                        </a>
                      ) : (
                        m.subject
                      )}
                    </div>
                    {m.summary ? <div className="inbox-summary">{m.summary}</div> : null}
                  </td>
                  <td className="rt">
                    {m.source && m.source !== "gmail" && <span className="tag" style={{ marginRight: 6, fontSize: 8, padding: "3px 6px" }}>{m.source}</span>}
                    {m.severity && m.severity !== "normal" && (
                      <span className={"tag " + (m.severity === "kritisk" ? "gold" : "")} style={{ marginRight: 6 }}>{m.severity}</span>
                    )}
                    <span className={"tag " + (m.category === "Svar kreves" ? "gold" : "")}>{m.category}</span>
                  </td>
                  <td className="assignee">
                    {m.draft_body ? (
                      <span className="mut" style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--gold)", fontWeight: 600 }}>Utkast klart</span>
                    ) : m.draft_url ? (
                      <a className="lnk" href={m.draft_url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>Åpne utkast</a>
                    ) : null}
                  </td>
                </tr>
                {expanded === m.id && (
                  <tr>
                    <td colSpan={selectable ? 6 : 5} className="inbox-detail">
                      <div className="inbox-meta">
                        <div><span className="mk">Fra</span><span className="mv">{m.sender}</span></div>
                        <div><span className="mk">Mottatt</span><span className="mv">{fmtReceived(m.received_at)}</span></div>
                        <div><span className="mk">Kilde</span><span className="mv">{m.source || "gmail"}</span></div>
                        <div>
                          <span className="mk">Prioritet</span>
                          {canEdit ? (
                            <select
                              className="select"
                              style={{ width: "auto", padding: "5px 8px", fontSize: 12 }}
                              value={m.priority || "medium"}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) => editItem(m.id, { priority: e.target.value })}
                            >
                              <option value="høy">Høy</option>
                              <option value="medium">Medium</option>
                              <option value="lav">Lav</option>
                            </select>
                          ) : (
                            <span className={"mv prio-" + m.priority}>{prioLabel(m.priority)}</span>
                          )}
                        </div>
                        <div>
                          <span className="mk">Kategori</span>
                          {canEdit ? (
                            <select
                              className="select"
                              style={{ width: "auto", padding: "5px 8px", fontSize: 12 }}
                              value={m.category}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) => editItem(m.id, { category: e.target.value })}
                            >
                              <option value="Svar kreves">Svar kreves</option>
                              <option value="Til info">Til info</option>
                            </select>
                          ) : (
                            <span className="mv">{m.category}</span>
                          )}
                        </div>
                        {m.severity && m.severity !== "normal" && (
                          <div>
                            <span className="mk">Alvorlighet</span>
                            <span className={"mv sev-" + m.severity}>{m.severity}</span>
                          </div>
                        )}
                      </div>
                      {m.snippet && (
                        <div className="inbox-snippet">
                          <div className="mk" style={{ marginBottom: 8 }}>Sammendrag</div>
                          <div style={{ lineHeight: 1.6, fontSize: 13 }}>{m.snippet}</div>
                        </div>
                      )}
                      {m.draft_body && (
                        <div className="inbox-draft">
                          <div className="draft-head">
                            <span className="mk">Foreslått svar</span>
                            <button className="lnk" onClick={(e) => { e.stopPropagation(); copyDraft(m.draft_body); }}>Kopier</button>
                          </div>
                          <pre className="draft-body">{m.draft_body}</pre>
                        </div>
                      )}
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 16 }}>
                        {m.link && <a className="btn sm ghost" href={m.link} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>Åpne i Gmail</a>}
                        {m.draft_url && <a className="btn sm ghost" href={m.draft_url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>Åpne utkast i Gmail</a>}
                        {canEdit && !m.draft_body && data.aiEnabled && (
                          <button
                            className="btn sm ghost"
                            disabled={drafting === m.id}
                            onClick={(e) => { e.stopPropagation(); generateDraft(m.id); }}
                          >
                            {drafting === m.id ? "Skriver utkast …" : "Lag svar-utkast"}
                          </button>
                        )}
                        {canEdit && (
                          <>
                            <button className="btn sm ghost" onClick={(e) => { e.stopPropagation(); createTask(m); }}>Lag oppgave</button>
                            {m.status === "open" ? (
                              <button className="btn sm" onClick={(e) => { e.stopPropagation(); markDone(m.id); }}>Ferdig</button>
                            ) : (
                              <button className="btn sm ghost" onClick={(e) => { e.stopPropagation(); reopen(m.id); }}>Gjenåpne</button>
                            )}
                            <button className="lnk g" onClick={(e) => { e.stopPropagation(); if (window.confirm("Slette «" + m.subject + "»?")) deleteItem(m.id); }}>Slett</button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {items.length === 0 && !loading && (
        <div style={{ textAlign: "center", padding: "40px 0", color: "var(--muted)", fontSize: 13 }}>
          {tab === "apne" ? "Ingen åpne e-poster — alt er håndtert." :
           tab === "svar" ? "Ingen e-poster venter på svar." :
           tab === "utkast" ? "Ingen ferdige utkast — åpne en e-post og trykk «Lag svar-utkast»." :
           "Ingen e-poster funnet."}
        </div>
      )}

      {loading && (
        <div style={{ textAlign: "center", padding: "20px 0", color: "var(--muted)", fontSize: 12 }}>Laster...</div>
      )}

      {items.length < total && !loading && (
        <div style={{ textAlign: "center", marginTop: 20 }}>
          {/* items.length (not offset+50) — locally removed rows shift the
              server list up; this offset never skips the shifted rows. */}
          <button className="btn sm ghost" onClick={() => fetchInbox({ offset: items.length })}>
            Last flere ({total - items.length} gjenstår)
          </button>
        </div>
      )}

      <div className="inbox-trustbar">
        <div>
          <div className="mk">Gmail-synk</div>
          <div className="mv">
            Sist oppdatert {lastSync ? fmtReceived(lastSync) : "aldri"} · henter siste 7 dager via Gmail-broen
            {canEdit ? "" : " · kun lesing"}
          </div>
        </div>
        {canEdit ? (
          <button className="btn sm ghost" onClick={syncNow} disabled={syncing}>
            {syncing ? "Synkroniserer …" : "Oppdater"}
          </button>
        ) : (
          <button className="btn sm ghost" onClick={() => fetchInbox({ offset: 0 })}>Last på nytt</button>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* SEO — the weekly agent's tab.                                       */
/*                                                                     */
/* Everything here reads from /api/seo/*; the collection itself runs   */
/* in GitHub Actions (seo/run.mjs) and writes to schema `seo`. The tab */
/* is read mostly on a phone on Monday morning, so every table scrolls */
/* inside its own container and the brief comes first.                 */
/* ------------------------------------------------------------------ */

const SEO_TABS = [
  ["brief", "Ukesbrief"], ["pulse", "Pulse"], ["sok", "Søk"], ["konkurrenter", "Konkurrenter"],
  ["ai", "AI-synlighet"], ["leads", "Leads"], ["arshjul", "Årshjul"], ["innhold", "Innhold"],
];
const SEO_ENGINE = { anthropic: "Claude", openai: "ChatGPT", gemini: "Gemini", perplexity: "Perplexity" };
const SEO_MONTHS = ["Januar", "Februar", "Mars", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Desember"];
const fmtInt = (n) => (n == null ? "—" : Number(n).toLocaleString("nb-NO"));
const fmtDay = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return String(d.getDate()).padStart(2, "0") + "." + String(d.getMonth() + 1).padStart(2, "0");
};
const pctDelta = (now, prev) => {
  if (prev == null || !prev) return now ? "ny" : "—";
  const p = Math.round(((now - prev) / prev) * 100);
  return (p > 0 ? "+" : "") + p + " %";
};
const weekLabel = (w) => (w ? "uke " + Number(String(w).slice(-2)) : "—");
const pathOf = (url) => (url ? String(url).replace(/^https?:\/\/[^/]+/, "") || "/" : "");

// One loader for every sub-tab: error with retry, never a misleading empty
// state (the same rule HygieneView documents).
function useSeoLoad(path) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const load = async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    const r = await api(path);
    const body = await r.json().catch(() => null);
    if (!r.ok || !body || body.error) setState({ data: null, error: (body && body.error) || "Kunne ikke hente data.", loading: false });
    else setState({ data: body, error: null, loading: false });
  };
  useEffect(() => { load(); }, [path]); // eslint-disable-line react-hooks/exhaustive-deps
  return { ...state, reload: load };
}

function SeoState({ loading, error, reload, empty, children }) {
  if (error) return <div className="mut" style={{ padding: "18px 0" }}>{error} <button className="lnk" onClick={reload}>Prøv igjen</button></div>;
  if (loading) return <div className="mut" style={{ padding: "18px 0" }}>Henter …</div>;
  if (empty) return <div className="kempty">{empty}</div>;
  return children;
}

async function seoWrite(path, method, body, showToast, fallback) {
  const r = await api(path, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) {
    if (showToast) showToast(await failMsg(r, fallback));
    return null;
  }
  return r.json().catch(() => ({}));
}

// Just enough markdown for the brief and the blog drafts: headings, bold,
// lists, tables, rules. Nothing else is emitted by seo/steps/12-brief.mjs.
function mdInline(s) {
  return String(s).split(/(\*\*[^*]+\*\*)/g).map((p, i) => (p.startsWith("**") && p.endsWith("**") ? <b key={i}>{p.slice(2, -2)}</b> : p));
}
function MdLite({ text }) {
  const lines = String(text || "").split("\n");
  const out = [];
  let i = 0;
  let key = 0;
  const isBlock = (l) => /^(#|\||\s*[-*] |\s*\d+\. |---)/.test(l);
  while (i < lines.length) {
    const l = lines[i];
    if (/^\s*$/.test(l)) { i++; continue; }
    if (l.startsWith("# ")) { out.push(<div key={key++} className="ht" style={{ fontSize: 20, margin: "4px 0 10px" }}>{mdInline(l.slice(2))}</div>); i++; continue; }
    if (l.startsWith("## ")) { out.push(<div key={key++} className="eyebrow" style={{ margin: "22px 0 8px" }}>{l.slice(3)}</div>); i++; continue; }
    if (l.startsWith("### ")) { out.push(<div key={key++} className="ht" style={{ margin: "14px 0 6px" }}>{mdInline(l.slice(4))}</div>); i++; continue; }
    if (l.startsWith("---")) { out.push(<div key={key++} className="rule tight" />); i++; continue; }
    if (l.startsWith("|")) {
      const rows = [];
      while (i < lines.length && lines[i].startsWith("|")) { rows.push(lines[i]); i++; }
      const cells = rows.filter((r) => !/^\|\s*-/.test(r)).map((r) => r.split("|").slice(1, -1).map((c) => c.trim()));
      if (!cells.length) continue;
      out.push(
        <div key={key++} className="tscroll" style={{ marginBottom: 8 }}>
          <table className="dtbl" style={{ minWidth: 0 }}>
            <thead><tr>{cells[0].map((c, j) => <th key={j}>{c}</th>)}</tr></thead>
            <tbody>{cells.slice(1).map((r, ri) => <tr key={ri}>{r.map((c, j) => <td key={j} className={j ? "num" : "sy"}>{mdInline(c)}</td>)}</tr>)}</tbody>
          </table>
        </div>
      );
      continue;
    }
    if (/^\s*[-*] /.test(l) || /^\s*\d+\. /.test(l)) {
      const ordered = /^\s*\d+\. /.test(l);
      const re = ordered ? /^\s*\d+\. / : /^\s*[-*] /;
      const items = [];
      while (i < lines.length && re.test(lines[i])) { items.push(lines[i].replace(re, "")); i++; }
      const Tag = ordered ? "ol" : "ul";
      out.push(<Tag key={key++} style={{ margin: "4px 0 10px", paddingLeft: 20, fontSize: 13.5, lineHeight: 1.6 }}>{items.map((it, j) => <li key={j} style={{ marginBottom: 4 }}>{mdInline(it)}</li>)}</Tag>);
      continue;
    }
    const para = [];
    while (i < lines.length && !/^\s*$/.test(lines[i]) && !isBlock(lines[i])) { para.push(lines[i]); i++; }
    out.push(<p key={key++} style={{ margin: "0 0 10px", fontSize: 13.5, lineHeight: 1.6 }}>{mdInline(para.join(" "))}</p>);
  }
  return <div>{out}</div>;
}

// Clicks per day. Same drawing conventions as Chart (grid, navy line, end
// dot), one series, zero-based scale — a click count has a true zero.
function SeoChart({ points, h = 220 }) {
  if (!points || points.length < 2) return <div className="kempty">Ingen daglige tall ennå.</div>;
  const vals = points.map((p) => p.clicks);
  const hi = Math.max(5, ...vals);
  const y = (v) => h - 26 - (v / hi) * (h - 16 - 26);
  const x = (i) => 42 + (946 * i) / (points.length - 1);
  const grid = [];
  for (let i = 0; i <= 4; i++) {
    const val = (hi * i) / 4;
    grid.push(
      <line key={"g" + i} x1={42} x2={988} y1={y(val)} y2={y(val)} stroke="rgba(28,58,92,0.10)" strokeWidth={1} vectorEffect="non-scaling-stroke" />,
      <text key={"t" + i} x={34} y={y(val) + 3} textAnchor="end" fontSize={11} fill="#5A6270">{Math.round(val)}</text>
    );
  }
  const pts = points.map((p, i) => x(i) + "," + y(p.clicks)).join(" ");
  const mid = Math.floor((points.length - 1) / 2);
  return (
    <svg viewBox={"0 0 1000 " + h} width="100%" style={{ display: "block", height: "auto", overflow: "visible" }} preserveAspectRatio="none">
      {grid}
      <polyline points={pts} fill="none" stroke="#1c3a5c" strokeWidth={1.7} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(points.length - 1)} cy={y(vals[vals.length - 1])} r={2.6} fill="#1c3a5c" />
      <text x={42} y={h - 6} fontSize={11} fill="#5A6270">{fmtDay(points[0].date)}</text>
      <text x={500} y={h - 6} textAnchor="middle" fontSize={11} fill="#5A6270">{fmtDay(points[mid].date)}</text>
      <text x={988} y={h - 6} textAnchor="end" fontSize={11} fill="#5A6270">{fmtDay(points[points.length - 1].date)}</text>
    </svg>
  );
}

function SeoBrief({ overview }) {
  const [week, setWeek] = useState(null);
  const [row, setRow] = useState(null);
  const [err, setErr] = useState(null);
  const current = overview?.brief || null;
  useEffect(() => {
    if (!week) { setRow(null); setErr(null); return; }
    let alive = true;
    api("/api/seo/briefs?week=" + encodeURIComponent(week)).then(async (r) => {
      const b = await r.json().catch(() => null);
      if (!alive) return;
      if (r.ok && b && !b.error) setRow(b); else setErr((b && b.error) || "Kunne ikke hente brevet.");
    });
    return () => { alive = false; };
  }, [week]);
  if (!current) {
    return <div className="kempty">Ingen ukesbrief ennå. Første brev kommer etter første kjøring av «SEO ukesjobb» (GitHub → Actions → Run workflow → all). Se docs/seo-agent/SETUP-CHECKLIST.md for nøklene.</div>;
  }
  const shown = week ? row : current;
  return (
    <div>
      <div className="sechead">
        <span className="eyebrow">Ukesbrief · {weekLabel(shown?.week || current.week)}</span>
        <select className="select" style={{ width: "auto", padding: "8px 12px" }} value={week || current.week} onChange={(e) => setWeek(e.target.value === current.week ? null : e.target.value)}>
          {(overview.weeks || []).map((w) => <option key={w.week} value={w.week}>{weekLabel(w.week)} · {w.sent_at ? "sendt" : "ikke sendt"}</option>)}
        </select>
      </div>
      {err ? <div className="mut">{err}</div> : null}
      {shown ? (
        <div>
          <div className="card" style={{ padding: "22px 26px" }}><MdLite text={shown.summary_md} /></div>
          <div className="mut" style={{ marginTop: 10 }}>
            Generert {fmtReceived(shown.generated_at)}{shown.model ? " · " + shown.model : ""}{shown.sent_at ? " · sendt " + fmtReceived(shown.sent_at) : " · ikke sendt på e-post"}
          </div>
        </div>
      ) : <div className="mut">Henter …</div>}
    </div>
  );
}

function SeoPulse({ canEdit, showToast, onRead }) {
  const [sev, setSev] = useState("");
  const [source, setSource] = useState("");
  const path = "/api/seo/pulse?limit=150" + (sev ? "&severity=" + sev : "") + (source ? "&source=" + encodeURIComponent(source) : "");
  const { data, error, loading, reload } = useSeoLoad(path);
  const markAll = async () => {
    if (await seoWrite("/api/seo/pulse", "PUT", { all: true }, showToast, "Kunne ikke markere som lest.")) { reload(); if (onRead) onRead(); }
  };
  const rows = data?.rows || [];
  return (
    <div>
      <div className="sechead">
        <div className="chips" style={{ marginBottom: 0 }}>
          {[["", "Alle"], ["viktig", "Viktig"], ["notis", "Notis"], ["info", "Info"]].map(([k, l]) => (
            <button key={k} className={"chip " + (sev === k ? "on" : "")} onClick={() => setSev(k)}>{l}</button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <select className="select" style={{ width: "auto", padding: "8px 12px" }} value={source} onChange={(e) => setSource(e.target.value)}>
            <option value="">Alle kilder</option>
            {(data?.sources || []).map((s) => <option key={s.source} value={s.source}>{s.source} ({s.n})</option>)}
          </select>
          {canEdit ? <button className="btn ghost sm" onClick={markAll}>Marker alt som lest</button> : null}
        </div>
      </div>
      <SeoState loading={loading && !data} error={error} reload={reload} empty={!loading && !rows.length ? "Ingen notiser ennå. Pulse fylles når ukesjobben har kjørt." : null}>
        <div>
          {rows.map((r) => (
            <div key={r.id} style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 14, padding: "14px 0", borderBottom: "1px solid var(--line2)" }}>
              <span className={"tag " + (r.severity === "viktig" ? "gold" : "")} style={{ alignSelf: "start", minWidth: 58, textAlign: "center", opacity: r.severity === "info" ? 0.6 : 1 }}>{r.severity}</span>
              <div style={{ minWidth: 0 }}>
                <div className="ht" style={{ fontWeight: r.read ? 500 : 600, wordBreak: "break-word" }}>{r.title}</div>
                {r.body ? (
                  <div className="hs" style={{ maxWidth: "none", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                    {/^https?:\/\/\S+$/.test(r.body) ? <a href={r.body} target="_blank" rel="noreferrer" style={{ color: "var(--navy)" }}>{r.body}</a> : r.body}
                  </div>
                ) : null}
                <div className="mut" style={{ marginTop: 4, fontSize: 11 }}>{r.source} · {r.kind} · {weekLabel(r.week)} · {fmtReceived(r.at)}</div>
              </div>
            </div>
          ))}
        </div>
      </SeoState>
    </div>
  );
}

function SeoSearch({ canEdit, showToast }) {
  const [range, setRange] = useState("28D");
  const { data, error, loading, reload } = useSeoLoad("/api/seo/search?range=" + range);
  const [kw, setKw] = useState("");
  const [cluster, setCluster] = useState("produkt");
  const addKw = async () => {
    if (await seoWrite("/api/seo/keywords", "POST", { keyword: kw.trim(), cluster }, showToast, "Kunne ikke legge til søkeordet.")) { setKw(""); reload(); }
  };
  const toggleKw = async (k) => {
    if (await seoWrite("/api/seo/keywords", "PUT", { keyword: k.keyword, active: !k.active }, showToast, "Kunne ikke endre søkeordet.")) reload();
  };
  const daily = data?.daily || [];
  const totals = daily.reduce((a, p) => ({ clicks: a.clicks + p.clicks, impressions: a.impressions + p.impressions }), { clicks: 0, impressions: 0 });
  const weeks = (data?.weeks || []).slice(-8);
  return (
    <div>
      <div className="sechead">
        <span className="eyebrow">Search Console · klikk per dag</span>
        <div className="toggle">
          {["7D", "28D", "90D", "ALL"].map((r) => <button key={r} className={"tbtn " + (range === r ? "on" : "")} onClick={() => setRange(r)}>{r}</button>)}
        </div>
      </div>
      <SeoState loading={loading && !data} error={error} reload={reload}>
        {data ? (
          <div>
            <SeoChart points={daily} />
            <div className="legend">
              <span className="lgmeta">
                <span>Klikk <b>{fmtInt(totals.clicks)}</b></span>
                <span>Visninger <b>{fmtInt(totals.impressions)}</b></span>
                <span>CTR <b>{totals.impressions ? ((100 * totals.clicks) / totals.impressions).toFixed(1) + " %" : "—"}</b></span>
              </span>
            </div>
            <div className="rule" />
            <div className="sechead">
              <span className="eyebrow gold">Muligheter · like utenfor topp 10</span>
              <span className="mut">{data.analysisWeek ? "fra analysen " + weekLabel(data.analysisWeek) : ""}</span>
            </div>
            {data.opportunities.length ? (
              <div className="tscroll">
                <table className="dtbl">
                  <thead><tr><th>Søkeord</th><th>Posisjon</th><th>Visninger 28 d</th><th>Side</th><th>Score</th></tr></thead>
                  <tbody>
                    {data.opportunities.map((o) => (
                      <tr key={o.query}>
                        <td className="sy">{o.query}</td>
                        <td className="num"><b>{o.position}</b></td>
                        <td className="num">{fmtInt(o.impressions28)}</td>
                        <td style={{ fontSize: 12 }}>{o.page ? pathOf(o.page) : <span className="mut">ny side</span>}</td>
                        <td className="num">{o.score}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <div className="kempty">Ingen søkeord i posisjon 8–20 med nok visninger ennå.</div>}
            <div className="rule" />
            <div className="sechead"><span className="eyebrow gold">Innholdsforfall</span><span className="mut">sider under 70 % av 8-ukers snitt</span></div>
            {data.decay.length ? (
              <div className="tscroll">
                <table className="dtbl">
                  <thead><tr><th>Side</th><th>Klikk denne uka</th><th>Snitt 8 uker</th><th>Fall</th></tr></thead>
                  <tbody>{data.decay.map((d) => <tr key={d.page}><td className="sy" style={{ fontSize: 12 }}>{pathOf(d.page)}</td><td className="num"><b>{d.clicks}</b></td><td className="num">{d.avg8}</td><td className="num" style={{ color: "var(--gold)" }}>−{d.drop_pct} %</td></tr>)}</tbody>
                </table>
              </div>
            ) : <div className="kempty">Ingen sider forfaller.</div>}
            <div className="rule" />
            <div className="sechead">
              <span className="eyebrow">Sporede søkeord</span>
              <span className="mut">{data.keywords.length} ord · posisjon per uke i Google Norge</span>
            </div>
            <div className="tscroll">
              <table className="dtbl">
                <thead>
                  <tr><th>Søkeord</th><th>Klynge</th>{weeks.map((w) => <th key={w}>u{Number(w.slice(-2))}</th>)}<th>GSC 31 d</th>{canEdit ? <th></th> : null}</tr>
                </thead>
                <tbody>
                  {data.keywords.map((k) => (
                    <tr key={k.keyword} style={{ opacity: k.active ? 1 : 0.45 }}>
                      <td className="sy">{k.keyword}</td>
                      <td><span className="tag">{k.cluster}</span></td>
                      {k.ranks.slice(-8).map((r, i) => <td key={i} className="num">{r == null ? "–" : <b>{r}</b>}</td>)}
                      <td className="num">{k.gsc ? <span>{fmtInt(k.gsc.clicks)} klikk · pos {k.gsc.position}</span> : "–"}</td>
                      {canEdit ? <td className="rt"><button className="lnk" onClick={() => toggleKw(k)}>{k.active ? "Skjul" : "Aktiver"}</button></td> : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {canEdit ? (
              <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
                <input className="input" style={{ maxWidth: 280 }} placeholder="Nytt søkeord" value={kw} onChange={(e) => setKw(e.target.value)} />
                <select className="select" style={{ width: "auto" }} value={cluster} onChange={(e) => setCluster(e.target.value)}>
                  {["merke", "produkt", "bruk", "kunnskap", "lokal"].map((c) => <option key={c}>{c}</option>)}
                </select>
                <button className="btn sm" onClick={addKw} disabled={!kw.trim()}>Legg til</button>
              </div>
            ) : null}
            <div className="rule" />
            <div className="sechead"><span className="eyebrow">Toppsider · {range}</span></div>
            {data.topPages.length ? (
              <div className="tscroll">
                <table className="dtbl">
                  <thead><tr><th>Side</th><th>Klikk</th><th>Visninger</th></tr></thead>
                  <tbody>{data.topPages.map((p) => <tr key={p.page}><td className="sy" style={{ fontSize: 12 }}>{pathOf(p.page)}</td><td className="num"><b>{fmtInt(p.clicks)}</b></td><td className="num">{fmtInt(p.impressions)}</td></tr>)}</tbody>
                </table>
              </div>
            ) : <div className="kempty">Ingen sidedata ennå.</div>}
          </div>
        ) : null}
      </SeoState>
    </div>
  );
}

const EMPTY_COMP = { name: "", domain: "", kind: "forhandler", product_urls: "", blog_urls: "", sitemap_url: "", org_nr: "", meta_page_id: "", notes: "" };

function SeoCompetitors({ canEdit, showToast }) {
  const { data, error, loading, reload } = useSeoLoad("/api/seo/competitors");
  const [open, setOpen] = useState(null);
  const [edit, setEdit] = useState(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(EMPTY_COMP);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    const ok = edit && edit.id
      ? await seoWrite("/api/seo/competitors", "PUT", edit, showToast, "Kunne ikke lagre.")
      : await seoWrite("/api/seo/competitors", "POST", form, showToast, "Kunne ikke legge til.");
    setBusy(false);
    if (ok) { setEdit(null); setAdding(false); setForm(EMPTY_COMP); reload(); }
  };
  const deactivate = async (c) => {
    if (await seoWrite("/api/seo/competitors", "DELETE", { id: c.id }, showToast, "Kunne ikke deaktivere.")) reload();
  };
  const startEdit = (c) => setEdit({
    id: c.id, name: c.name, kind: c.kind, product_urls: (c.product_urls || []).join("\n"), blog_urls: (c.blog_urls || []).join("\n"),
    sitemap_url: c.sitemap_url || "", org_nr: c.org_nr || "", meta_page_id: c.meta_page_id || "", notes: c.notes || "",
  });

  const fields = (v, set) => (
    <div className="card" style={{ padding: 18, marginTop: 12 }}>
      <div className="f2">
        <div className="field"><label>Navn</label><input className="input" value={v.name} onChange={(e) => set({ ...v, name: e.target.value })} /></div>
        {v.id ? null : <div className="field"><label>Domene</label><input className="input" placeholder="eksempel.no" value={v.domain} onChange={(e) => set({ ...v, domain: e.target.value })} /></div>}
        <div className="field"><label>Type</label>
          <select className="select" value={v.kind} onChange={(e) => set({ ...v, kind: e.target.value })}>
            {["produsent", "merke", "forhandler", "serp", "kunnskap"].map((k) => <option key={k}>{k}</option>)}
          </select>
        </div>
        <div className="field"><label>Org.nr</label><input className="input" value={v.org_nr} onChange={(e) => set({ ...v, org_nr: e.target.value })} /></div>
      </div>
      <div className="field"><label>Produktsider (én URL per linje)</label><textarea className="ta" value={v.product_urls} onChange={(e) => set({ ...v, product_urls: e.target.value })} /></div>
      <div className="f2">
        <div className="field"><label>Blogg / nyheter (URL-er)</label><textarea className="ta" style={{ minHeight: 56 }} value={v.blog_urls} onChange={(e) => set({ ...v, blog_urls: e.target.value })} /></div>
        <div className="field"><label>Sitemap</label><input className="input" value={v.sitemap_url} onChange={(e) => set({ ...v, sitemap_url: e.target.value })} /></div>
        <div className="field"><label>Meta-side-id (Ad Library)</label><input className="input" value={v.meta_page_id} onChange={(e) => set({ ...v, meta_page_id: e.target.value })} /></div>
        <div className="field"><label>Notat</label><input className="input" value={v.notes} onChange={(e) => set({ ...v, notes: e.target.value })} /></div>
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button className="btn sm" onClick={save} disabled={busy}>{busy ? "Lagrer …" : "Lagre"}</button>
        <button className="btn ghost sm" onClick={() => { setEdit(null); setAdding(false); }}>Avbryt</button>
      </div>
    </div>
  );

  const serp = data?.serp;
  const serpDomains = (() => {
    if (!serp?.rows?.length) return [];
    const count = {};
    for (const r of serp.rows) for (const d of Object.keys(r.others || {})) count[d] = (count[d] || 0) + 1;
    return Object.entries(count).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([d]) => d);
  })();
  const nameOf = (d) => { for (const r of serp?.rows || []) if (r.others?.[d]) return r.others[d].name; return d; };

  return (
    <div>
      <div className="sechead">
        <span className="eyebrow">SERP side om side · Google Norge</span>
        <span className="mut">{data?.serpWeek ? weekLabel(data.serpWeek) + " (forrige uke i parentes)" : ""}</span>
      </div>
      <SeoState loading={loading && !data} error={error} reload={reload}>
        {data ? (
          <div>
            {serp?.rows?.length ? (
              <div className="tscroll">
                <table className="dtbl">
                  <thead><tr><th>Søkeord</th><th>Verminord</th>{serpDomains.map((d) => <th key={d}>{nameOf(d)}</th>)}</tr></thead>
                  <tbody>
                    {serp.rows.map((r) => (
                      <tr key={r.keyword}>
                        <td className="sy">{r.keyword}</td>
                        <td className="num" style={{ color: r.own.now ? "var(--navy)" : "var(--gold)" }}><b>{r.own.now ?? "–"}</b>{r.own.prev != null ? <span className="mut"> ({r.own.prev})</span> : null}</td>
                        {serpDomains.map((d) => {
                          const o = r.others?.[d];
                          return <td key={d} className="num">{o ? <span><b>{o.now}</b>{o.prev != null ? <span className="mut"> ({o.prev})</span> : null}</span> : "–"}</td>;
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <div className="kempty">Ingen SERP-data ennå (krever SERPER_API_KEY og en kjøring).</div>}
            {serp?.beaten_by?.length ? (
              <div className="mut" style={{ marginTop: 10 }}>Foran Verminord på flest kjerneord: {serp.beaten_by.slice(0, 4).map((b) => b.name + " (" + b.keywords_ahead + ")").join(" · ")}</div>
            ) : null}
            <div className="rule" />
            <div className="sechead">
              <span className="eyebrow">Konkurrenter</span>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <span className="mut">{data.competitors.filter((c) => c.active).length} aktive</span>
                {canEdit && !adding ? <button className="btn ghost sm" onClick={() => { setAdding(true); setEdit(null); }}>Legg til</button> : null}
              </div>
            </div>
            {adding ? fields(form, setForm) : null}
            <div className="syslist">
              {data.competitors.map((c) => {
                const isOpen = open === c.id;
                const snaps = c.snapshots || [];
                const stock = snaps.filter((s) => s.in_stock === false).length;
                const activeAds = (c.ads || []).filter((a) => a.active).length;
                return (
                  <div key={c.id} style={{ opacity: c.active ? 1 : 0.5 }}>
                    <button className={"sysrow " + (isOpen ? "on" : "")} onClick={() => setOpen(isOpen ? null : c.id)}>
                      <div>
                        <div className="nm" style={{ fontSize: 14 }}>{c.name} <span className="tag" style={{ marginLeft: 8, verticalAlign: "middle" }}>{c.kind}</span></div>
                        <div className="mt">
                          {c.domain}
                          {snaps.length ? " · " + snaps.length + " produktside" + (snaps.length > 1 ? "r" : "") + (stock ? " · " + stock + " utsolgt" : "") : ""}
                          {c.tech?.platform && c.tech.platform !== "ukjent" ? " · " + c.tech.platform : ""}
                          {c.facts?.revenue_nok ? " · " + Math.round(Number(c.facts.revenue_nok) / 1e6) + " MNOK" + (c.facts.fiscal_year ? " (" + c.facts.fiscal_year + ")" : "") : ""}
                          {activeAds ? " · " + activeAds + " annonser" : ""}
                        </div>
                      </div>
                      <span className="mut">{isOpen ? "–" : "+"}</span>
                    </button>
                    {isOpen ? (
                      <div style={{ padding: "12px 4px 20px" }}>
                        {c.notes ? <div className="hs" style={{ maxWidth: "none", marginBottom: 12 }}>{c.notes}</div> : null}
                        {snaps.length ? (
                          <div className="tscroll">
                            <table className="dtbl">
                              <thead><tr><th>Produkt</th><th>Pris</th><th>Lager</th><th>Sist lest</th></tr></thead>
                              <tbody>
                                {snaps.map((s) => (
                                  <tr key={s.url}>
                                    <td className="sy" style={{ fontSize: 12.5 }}><a href={s.url} target="_blank" rel="noreferrer" style={{ color: "inherit" }}>{s.title || pathOf(s.url)}</a></td>
                                    <td className="num"><b>{s.price_nok != null ? fmtInt(Math.round(Number(s.price_nok))) + " kr" : "–"}</b></td>
                                    <td><span className={"pill " + (s.in_stock === false ? "warn" : "")}>{s.in_stock == null ? "ukjent" : s.in_stock ? "på lager" : "utsolgt"}</span></td>
                                    <td className="num">{weekLabel(s.week)}{s.changed ? <span className="tag gold" style={{ marginLeft: 8 }}>endret</span> : null}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ) : <div className="mut">Ingen produktsider registrert{canEdit ? " — legg inn URL-er under Rediger." : "."}</div>}
                        {c.posts?.length ? (
                          <div style={{ marginTop: 14 }}>
                            <div className="eyebrow" style={{ marginBottom: 6 }}>Siste innlegg</div>
                            {c.posts.map((p) => <div key={p.url} style={{ fontSize: 12.5, padding: "4px 0" }}><a href={p.url} target="_blank" rel="noreferrer" style={{ color: "var(--navy)" }}>{p.title || pathOf(p.url)}</a> <span className="mut">{p.published_at ? fmtDay(p.published_at) : "sett " + fmtDay(p.first_seen)}</span></div>)}
                          </div>
                        ) : null}
                        {c.ads?.filter((a) => a.active).length ? (
                          <div style={{ marginTop: 14 }}>
                            <div className="eyebrow" style={{ marginBottom: 6 }}>Aktive annonser</div>
                            {c.ads.filter((a) => a.active).slice(0, 6).map((a) => <div key={a.platform + a.ad_key} style={{ fontSize: 12.5, padding: "4px 0" }}><span className="tag" style={{ marginRight: 8 }}>{a.platform}</span>{a.headline || "(uten tekst)"} <span className="mut">siden {fmtDay(a.first_seen)}</span></div>)}
                          </div>
                        ) : null}
                        {c.facts ? (
                          <div className="mut" style={{ marginTop: 14 }}>
                            Brønnøysund: {c.facts.name} · {c.facts.nace_code} {c.facts.nace_text} · {c.facts.employees ?? "?"} ansatte
                            {c.facts.revenue_nok ? " · omsetning " + fmtInt(Math.round(Number(c.facts.revenue_nok) / 1e6 * 10) / 10) + " MNOK" : ""}
                            {c.facts.result_nok != null ? " · resultat " + fmtInt(Math.round(Number(c.facts.result_nok) / 1e6 * 10) / 10) + " MNOK" : ""}
                            {c.facts.founded ? " · stiftet " + String(c.facts.founded).slice(0, 4) : ""}
                          </div>
                        ) : null}
                        {c.tech ? <div className="mut" style={{ marginTop: 6 }}>Plattform: {c.tech.platform} · {Object.entries(c.tech.signals || {}).filter(([, v]) => v).map(([k]) => k).join(", ") || "ingen sporing funnet"}</div> : null}
                        {canEdit ? (
                          <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
                            <button className="btn ghost sm" onClick={() => { setEdit(edit?.id === c.id ? null : null); startEdit(c); setAdding(false); }}>Rediger</button>
                            {c.active ? <button className="lnk" onClick={() => deactivate(c)}>Deaktiver</button> : null}
                          </div>
                        ) : null}
                        {edit?.id === c.id ? fields(edit, setEdit) : null}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}
      </SeoState>
    </div>
  );
}

function SeoAi({ canEdit, showToast }) {
  const { data, error, loading, reload } = useSeoLoad("/api/seo/ai?weeks=12");
  const [openPrompt, setOpenPrompt] = useState(null);
  const [newPrompt, setNewPrompt] = useState("");
  const addPrompt = async () => {
    if (await seoWrite("/api/seo/ai", "POST", { prompt: newPrompt.trim() }, showToast, "Kunne ikke legge til spørsmålet.")) { setNewPrompt(""); reload(); }
  };
  const togglePrompt = async (p) => {
    if (await seoWrite("/api/seo/ai", "PUT", { id: p.id, active: !p.active }, showToast, "Kunne ikke endre spørsmålet.")) reload();
  };
  const rates = data?.rates || [];
  const engines = [...new Set(rates.map((r) => r.engine))];
  const weeks = [...new Set(rates.map((r) => r.week))].sort().slice(-8);
  const cell = (e, w) => rates.find((r) => r.engine === e && r.week === w);
  const answers = data?.answers || [];
  const byPrompt = {};
  for (const a of answers) (byPrompt[a.prompt_id] ||= { prompt: a.prompt, rows: [] }).rows.push(a);
  return (
    <div>
      <div className="sechead">
        <span className="eyebrow">AI-synlighet · andel svar som nevner Verminord</span>
        <span className="mut">{data?.latestWeek ? "sist målt " + weekLabel(data.latestWeek) : ""}</span>
      </div>
      <SeoState loading={loading && !data} error={error} reload={reload}>
        {data ? (
          <div>
            {engines.length ? (
              <div className="tscroll">
                <table className="dtbl">
                  <thead><tr><th>Motor</th>{weeks.map((w) => <th key={w}>u{Number(w.slice(-2))}</th>)}</tr></thead>
                  <tbody>
                    {engines.map((e) => (
                      <tr key={e}>
                        <td className="sy">{SEO_ENGINE[e] || e}</td>
                        {weeks.map((w) => { const c = cell(e, w); return <td key={w} className="num">{c ? <span><b>{Math.round((100 * c.mentioned) / Math.max(1, c.asked))} %</b> <span className="mut">{c.mentioned}/{c.asked}</span></span> : "–"}</td>; })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <div className="kempty">Ingen målinger ennå. Krever minst én AI-nøkkel og en kjøring.</div>}
            {data.cited?.length ? <div className="mut" style={{ marginTop: 10 }}>Mest siterte kilder sist uke: {data.cited.slice(0, 6).map((c) => c.domain + " (" + c.n + ")").join(" · ")}</div> : null}
            <div className="rule" />
            <div className="sechead"><span className="eyebrow">Spørsmålene · siste svar</span><span className="mut">{data.prompts.filter((p) => p.active).length} aktive</span></div>
            <div className="syslist">
              {data.prompts.map((p) => {
                const g = byPrompt[p.id];
                const isOpen = openPrompt === p.id;
                return (
                  <div key={p.id} style={{ opacity: p.active ? 1 : 0.45 }}>
                    <button className={"sysrow " + (isOpen ? "on" : "")} onClick={() => setOpenPrompt(isOpen ? null : p.id)}>
                      <div>
                        <div className="nm" style={{ fontSize: 14 }}>{p.prompt}</div>
                        <div className="mt">
                          {g ? g.rows.map((r) => <span key={r.engine} style={{ marginRight: 12 }}>{SEO_ENGINE[r.engine] || r.engine}: <b style={{ color: r.mentioned ? "#4e7a52" : "var(--gold)" }}>{r.mentioned ? "nevnt #" + r.mention_rank : "ikke nevnt"}</b></span>) : "ikke spurt ennå"}
                        </div>
                      </div>
                      <span className="mut">{isOpen ? "–" : "+"}</span>
                    </button>
                    {isOpen ? (
                      <div style={{ padding: "10px 4px 18px" }}>
                        {g ? g.rows.map((r) => (
                          <div key={r.engine} style={{ marginBottom: 14 }}>
                            <div className="eyebrow" style={{ marginBottom: 6 }}>{SEO_ENGINE[r.engine] || r.engine} · {r.model} · {fmtReceived(r.asked_at)}</div>
                            <div style={{ fontSize: 13, lineHeight: 1.55, whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 320, overflowY: "auto", padding: "10px 14px", background: "#fff", border: "1px solid var(--line)", borderRadius: 2 }}>{r.answer}</div>
                            {r.competitors_mentioned?.length ? <div className="mut" style={{ marginTop: 6 }}>Nevnt: {r.competitors_mentioned.join(", ")}</div> : null}
                            {r.citations?.length ? <div className="mut" style={{ marginTop: 4 }}>Kilder: {r.citations.slice(0, 6).map((c, i) => <a key={i} href={c.url} target="_blank" rel="noreferrer" style={{ color: "var(--navy)", marginRight: 8 }}>{String(c.url).replace(/^https?:\/\/(www\.)?/, "").slice(0, 40)}</a>)}</div> : null}
                          </div>
                        )) : <div className="mut">Ingen svar lagret for dette spørsmålet ennå.</div>}
                        {canEdit ? <button className="lnk" onClick={() => togglePrompt(p)}>{p.active ? "Deaktiver spørsmålet" : "Aktiver spørsmålet"}</button> : null}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
            {canEdit ? (
              <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
                <input className="input" style={{ maxWidth: 420 }} placeholder="Nytt spørsmål, slik en kunde ville stilt det" value={newPrompt} onChange={(e) => setNewPrompt(e.target.value)} />
                <button className="btn sm" onClick={addPrompt} disabled={!newPrompt.trim()}>Legg til</button>
              </div>
            ) : null}
          </div>
        ) : null}
      </SeoState>
    </div>
  );
}

function SeoLeads({ canEdit, showToast }) {
  const [status, setStatus] = useState("ny");
  const { data, error, loading, reload } = useSeoLoad("/api/seo/leads" + (status ? "?status=" + encodeURIComponent(status) : ""));
  const setLeadStatus = async (l, s) => {
    if (await seoWrite("/api/seo/leads", "PUT", { id: l.id, status: s }, showToast, "Kunne ikke oppdatere leadet.")) reload();
  };
  const counts = data?.counts || {};
  return (
    <div>
      <div className="sechead">
        <div className="chips" style={{ marginBottom: 0 }}>
          {[["ny", "Nye"], ["kontaktet", "Kontaktet"], ["kunde", "Kunder"], ["ikke aktuell", "Ikke aktuell"], ["", "Alle"]].map(([k, l]) => (
            <button key={k} className={"chip " + (status === k ? "on" : "")} onClick={() => setStatus(k)}>{l}{k && counts[k] ? " · " + counts[k] : ""}</button>
          ))}
        </div>
      </div>
      <SeoState loading={loading && !data} error={error} reload={reload} empty={data && !data.leads.length ? "Ingen leads her. Scout finner nye hver mandag fra Brønnøysund og Google." : null}>
        {data ? (
          <div className="tscroll">
            <table className="dtbl">
              <thead><tr><th>Score</th><th>Navn</th><th>Type · region</th><th>Hvorfor</th>{canEdit ? <th>Status</th> : null}</tr></thead>
              <tbody>
                {data.leads.map((l) => (
                  <tr key={l.id}>
                    <td className="num"><b style={{ color: (l.icp_score ?? 0) >= 70 ? "var(--navy)" : "var(--muted)" }}>{l.icp_score ?? "–"}</b></td>
                    <td className="sy">
                      {l.url ? <a href={l.url} target="_blank" rel="noreferrer" style={{ color: "inherit" }}>{l.name}</a> : l.name}
                      <div className="dt">{l.org_nr ? "org " + l.org_nr + " · " : ""}{l.source} · {fmtDay(l.first_seen)}</div>
                    </td>
                    <td style={{ fontSize: 12.5 }}>{[l.kind, l.region].filter(Boolean).join(" · ") || "–"}</td>
                    <td style={{ fontSize: 12.5, maxWidth: 360 }}>{l.reason}</td>
                    {canEdit ? (
                      <td>
                        <select className="select" style={{ width: "auto", padding: "6px 10px", fontSize: 13 }} value={l.status} onChange={(e) => setLeadStatus(l, e.target.value)}>
                          {["ny", "kontaktet", "kunde", "ikke aktuell"].map((s) => <option key={s}>{s}</option>)}
                        </select>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </SeoState>
    </div>
  );
}

const EMPTY_CAL = { title: "", kind: "sesong", starts_on: "", ends_on: "", note: "", recurring_yearly: true };

// Rows are stored with one concrete year; recurring rows are shown in every
// year the view asks for, same rule as seo/steps/11-analyze.mjs.
function calShift(item, year) {
  const s = new Date(item.starts_on);
  const e = item.ends_on ? new Date(item.ends_on) : new Date(item.starts_on);
  if (!item.recurring_yearly) return { s, e };
  const offset = year - s.getFullYear();
  const ss = new Date(s); ss.setFullYear(s.getFullYear() + offset);
  const ee = new Date(e); ee.setFullYear(e.getFullYear() + offset);
  return { s: ss, e: ee };
}
function calInMonth(items, year, month) {
  const mStart = new Date(year, month, 1);
  const mEnd = new Date(year, month + 1, 0, 23, 59, 59);
  return items.filter((it) => { const { s, e } = calShift(it, year); return e >= mStart && s <= mEnd; })
    .map((it) => ({ ...it, ...calShift(it, year) }))
    .sort((a, b) => a.s - b.s);
}

function SeoCalendar({ canEdit, showToast }) {
  const { data, error, loading, reload } = useSeoLoad("/api/seo/calendar");
  const now = new Date();
  const [mode, setMode] = useState("ar");
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const items = data?.items || [];

  const save = async () => {
    setBusy(true);
    const ok = form.id
      ? await seoWrite("/api/seo/calendar", "PUT", form, showToast, "Kunne ikke lagre.")
      : await seoWrite("/api/seo/calendar", "POST", form, showToast, "Kunne ikke legge til.");
    setBusy(false);
    if (ok) { setForm(null); reload(); }
  };
  const remove = async () => {
    if (await seoWrite("/api/seo/calendar", "DELETE", { id: form.id }, showToast, "Kunne ikke slette.")) { setForm(null); reload(); }
  };
  const openItem = (it) => canEdit && setForm({ id: it.id, title: it.title, kind: it.kind, starts_on: String(it.starts_on).slice(0, 10), ends_on: it.ends_on ? String(it.ends_on).slice(0, 10) : "", note: it.note || "", recurring_yearly: it.recurring_yearly });
  const kindCls = (k) => (k === "kampanje" ? "tag gold" : k === "sesong" ? "tag navy" : "tag");
  const range = (it) => fmtDay(it.s) + (it.e && it.e.getTime() !== it.s.getTime() ? "–" + fmtDay(it.e) : "");

  const monthBlock = (m, dense) => {
    const list = calInMonth(items, year, m);
    return (
      <div key={m} style={{ display: "grid", gridTemplateColumns: dense ? "1fr" : "110px 1fr", gap: dense ? 6 : 12, padding: "12px 0", borderBottom: "1px solid var(--line2)", alignItems: "start" }}>
        <div className="ht" style={{ fontSize: 13, color: m === now.getMonth() && year === now.getFullYear() ? "var(--gold)" : "var(--navy)" }}>{SEO_MONTHS[m]}</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {list.length ? list.map((it) => (
            <button key={it.id + "-" + m} className={kindCls(it.kind)} onClick={() => openItem(it)} style={{ cursor: canEdit ? "pointer" : "default", background: it.kind === "sesong" ? "var(--navy)" : "#fff", textTransform: "none", letterSpacing: 0, fontSize: 11.5, padding: "5px 9px" }}>
              {it.kind === "frist" ? "Frist: " : ""}{it.title} <span style={{ opacity: 0.7 }}>{range(it)}</span>
            </button>
          )) : <span className="mut">—</span>}
        </div>
      </div>
    );
  };

  return (
    <div>
      <div className="sechead">
        <span className="eyebrow">Årshjul · {mode === "mnd" ? SEO_MONTHS[month] + " " + year : mode === "kv" ? "Q" + (Math.floor(month / 3) + 1) + " " + year : year}</span>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <div className="toggle">
            {[["ar", "År"], ["kv", "Kvartal"], ["mnd", "Måned"]].map(([k, l]) => <button key={k} className={"tbtn " + (mode === k ? "on" : "")} onClick={() => setMode(k)}>{l}</button>)}
          </div>
          <div className="toggle">
            <button className="tbtn" onClick={() => { if (mode === "ar") setYear(year - 1); else if (mode === "kv") { const m = month - 3; if (m < 0) { setYear(year - 1); setMonth(m + 12); } else setMonth(m); } else { if (month === 0) { setYear(year - 1); setMonth(11); } else setMonth(month - 1); } }}>‹</button>
            <button className="tbtn" onClick={() => { setYear(now.getFullYear()); setMonth(now.getMonth()); }}>I dag</button>
            <button className="tbtn" onClick={() => { if (mode === "ar") setYear(year + 1); else if (mode === "kv") { const m = month + 3; if (m > 11) { setYear(year + 1); setMonth(m - 12); } else setMonth(m); } else { if (month === 11) { setYear(year + 1); setMonth(0); } else setMonth(month + 1); } }}>›</button>
          </div>
          {canEdit && !form ? <button className="btn ghost sm" onClick={() => setForm({ ...EMPTY_CAL, starts_on: year + "-" + String(month + 1).padStart(2, "0") + "-01" })}>Legg til</button> : null}
        </div>
      </div>
      {form ? (
        <div className="card" style={{ padding: 18, marginBottom: 16 }}>
          <div className="f2">
            <div className="field"><label>Tittel</label><input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
            <div className="field"><label>Type</label>
              <select className="select" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
                {["sesong", "kampanje", "frist", "hendelse"].map((k) => <option key={k}>{k}</option>)}
              </select>
            </div>
            <div className="field"><label>Fra (ÅÅÅÅ-MM-DD)</label><input className="input" value={form.starts_on} onChange={(e) => setForm({ ...form, starts_on: e.target.value })} /></div>
            <div className="field"><label>Til (valgfritt)</label><input className="input" value={form.ends_on} onChange={(e) => setForm({ ...form, ends_on: e.target.value })} /></div>
          </div>
          <div className="field"><label>Notat</label><input className="input" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></div>
          <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, marginBottom: 14 }}>
            <input type="checkbox" checked={!!form.recurring_yearly} onChange={(e) => setForm({ ...form, recurring_yearly: e.target.checked })} /> Gjentas hvert år
          </label>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button className="btn sm" onClick={save} disabled={busy || !form.title.trim()}>{busy ? "Lagrer …" : "Lagre"}</button>
            <button className="btn ghost sm" onClick={() => setForm(null)}>Avbryt</button>
            {form.id ? <button className="lnk" onClick={remove}>Slett</button> : null}
          </div>
        </div>
      ) : null}
      <SeoState loading={loading && !data} error={error} reload={reload}>
        {data ? (
          <div>
            {mode === "ar" ? Array.from({ length: 12 }, (_, m) => monthBlock(m, false)) : null}
            {mode === "kv" ? Array.from({ length: 3 }, (_, i) => monthBlock(Math.floor(month / 3) * 3 + i, false)) : null}
            {mode === "mnd" ? (
              <div>
                {calInMonth(items, year, month).map((it) => (
                  <div key={it.id} style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 12, padding: "12px 0", borderBottom: "1px solid var(--line2)", alignItems: "start" }}>
                    <span className={kindCls(it.kind)} style={{ minWidth: 76, textAlign: "center" }}>{it.kind}</span>
                    <div>
                      <div className="ht" style={{ fontSize: 14 }}>{it.title} <span className="mut" style={{ fontWeight: 400 }}>{range(it)}</span></div>
                      {it.note ? <div className="hs" style={{ maxWidth: "none" }}>{it.note}</div> : null}
                      {canEdit ? <button className="lnk" style={{ paddingLeft: 0 }} onClick={() => openItem(it)}>Rediger</button> : null}
                    </div>
                  </div>
                ))}
                {!calInMonth(items, year, month).length ? <div className="kempty">Ingenting i {SEO_MONTHS[month]}.</div> : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </SeoState>
    </div>
  );
}

function SeoContent({ canEdit, showToast }) {
  const { data, error, loading, reload } = useSeoLoad("/api/seo/content");
  const [open, setOpen] = useState(null);
  const [text, setText] = useState("");
  const [title, setTitle] = useState("");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const drafts = data?.drafts || [];
  const update = async (d, patch) => {
    setBusy(true);
    const ok = await seoWrite("/api/seo/content", "PUT", { id: d.id, ...patch }, showToast, "Kunne ikke lagre.");
    setBusy(false);
    if (ok) { setEditing(false); reload(); if (showToast && patch.status) showToast("Status: " + patch.status + "."); }
  };
  const copy = async (d) => {
    try { await navigator.clipboard.writeText("# " + d.title + "\n\n" + d.body_md); if (showToast) showToast("Kopiert som markdown."); }
    catch { if (showToast) showToast("Kunne ikke kopiere — marker teksten manuelt."); }
  };
  return (
    <div>
      <div className="sechead">
        <span className="eyebrow">Innhold · utkast fra agenten</span>
        <span className="mut">Godkjent tekst limes inn i Wix. Ingenting publiseres herfra.</span>
      </div>
      <SeoState loading={loading && !data} error={error} reload={reload} empty={data && !drafts.length ? "Ingen utkast ennå. Hver mandag legger agenten ett blogg-utkast her." : null}>
        <div className="syslist">
          {drafts.map((d) => {
            const isOpen = open === d.id;
            return (
              <div key={d.id}>
                <button className={"sysrow " + (isOpen ? "on" : "")} onClick={() => { setOpen(isOpen ? null : d.id); setEditing(false); setText(d.body_md); setTitle(d.title); }}>
                  <div>
                    <div className="nm" style={{ fontSize: 14 }}>{d.title}</div>
                    <div className="mt"><span className={"tag " + (d.status === "godkjent" ? "gold" : d.status === "publisert" ? "navy" : "")} style={{ marginRight: 8 }}>{d.status}</span>{d.kind} · {d.keyword || "uten søkeord"} · {weekLabel(d.week)} · {Math.round(String(d.body_md).split(/\s+/).length)} ord</div>
                  </div>
                  <span className="mut">{isOpen ? "–" : "+"}</span>
                </button>
                {isOpen ? (
                  <div style={{ padding: "12px 4px 22px" }}>
                    {editing ? (
                      <div>
                        <div className="field"><label>Tittel</label><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} /></div>
                        <div className="field"><label>Tekst (markdown)</label><textarea className="ta" style={{ minHeight: 320 }} value={text} onChange={(e) => setText(e.target.value)} /></div>
                      </div>
                    ) : (
                      <div className="card" style={{ padding: "18px 22px" }}><MdLite text={d.body_md} /></div>
                    )}
                    <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
                      <button className="btn ghost sm" onClick={() => copy(d)}>Kopier markdown</button>
                      {canEdit ? (editing
                        ? <button className="btn sm" disabled={busy} onClick={() => update(d, { title, body_md: text })}>Lagre tekst</button>
                        : <button className="btn ghost sm" onClick={() => setEditing(true)}>Rediger</button>) : null}
                      {canEdit && d.status !== "godkjent" ? <button className="btn sm" disabled={busy} onClick={() => update(d, { status: "godkjent" })}>Godkjenn</button> : null}
                      {canEdit && d.status === "godkjent" ? <button className="btn sm" disabled={busy} onClick={() => update(d, { status: "publisert" })}>Merk som publisert</button> : null}
                      {canEdit && d.status !== "forkastet" ? <button className="lnk" disabled={busy} onClick={() => update(d, { status: "forkastet" })}>Forkast</button> : null}
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </SeoState>
    </div>
  );
}

function SeoView({ canEdit, showToast }) {
  const [tab, setTab] = useState("brief");
  const overview = useSeoLoad("/api/seo/overview");
  const o = overview.data;
  const a = o?.analysis || null;
  const t = a?.totals || null;
  const asked = a?.ai?.engines ? a.ai.engines.reduce((s, e) => s + e.asked, 0) : 0;
  const aiRate = asked ? Math.round((100 * a.ai.engines.reduce((s, e) => s + e.mentioned, 0)) / asked) : null;
  const kpis = [
    { label: "Klikk · 7 dager", value: t ? fmtInt(t.this.clicks) : "—", cls: "", caption: t ? pctDelta(t.this.clicks, t.prev.clicks) + " mot uka før" : "ingen søkedata ennå" },
    { label: "Visninger", value: t ? fmtInt(t.this.impressions) : "—", cls: "", caption: t && t.this.position != null ? "snittposisjon " + t.this.position : "—" },
    { label: "AI nevner Verminord", value: aiRate != null ? aiRate + " %" : "—", cls: aiRate != null && aiRate < 30 ? "gold" : "", caption: asked ? "av " + asked + " svar denne uka" : "ikke målt ennå" },
    { label: "Uleste notiser", value: o ? String(o.unread) : "—", cls: o?.unread ? "gold" : "", caption: o?.counts ? o.counts.leads_new + " nye leads · " + o.counts.drafts + " utkast" : "" },
  ];
  const latestRuns = (o?.runs || []).filter((r) => r.week === (o?.runs || []).reduce((m, r) => (r.week > m ? r.week : m), ""));
  return (
    <div>
      <span className="eyebrow">Arbeid · SEO-agent</span>
      {o ? <HelseBanner integrations={o.integrations} /> : null}
      <div className="hero" style={{ fontSize: 28, lineHeight: 1.2 }}>
        {o?.brief?.content?.headline || (overview.loading ? "Henter …" : "Ingen ukesbrief ennå.")}
      </div>
      <div className="herosub">
        {o?.brief
          ? "Ukesbrief " + weekLabel(o.brief.week) + " · generert " + fmtReceived(o.brief.generated_at) + (o.brief.sent_at ? " · sendt " + fmtReceived(o.brief.sent_at) : " · ikke sendt på e-post")
          : "Første brev kommer etter første kjøring av «SEO ukesjobb» (GitHub → Actions)."}
      </div>
      <div className="rule" />
      <div className="kpirow">
        {kpis.map((k) => (
          <div className="kpi" key={k.label}>
            <div className="k">{k.label}</div>
            <div className={"v " + k.cls}>{k.value}</div>
            <div className="c">{k.caption}</div>
          </div>
        ))}
      </div>
      <div className="chips" style={{ marginTop: 22 }}>
        {SEO_TABS.map(([k, l]) => (
          <button key={k} className={"chip " + (tab === k ? "on" : "")} onClick={() => setTab(k)}>{l}{k === "pulse" && o?.unread ? " · " + o.unread : ""}</button>
        ))}
      </div>
      {overview.error && !o ? <div className="mut" style={{ marginBottom: 12 }}>{overview.error} <button className="lnk" onClick={overview.reload}>Prøv igjen</button></div> : null}
      {tab === "brief" ? <SeoBrief overview={o} /> : null}
      {tab === "pulse" ? <SeoPulse canEdit={canEdit} showToast={showToast} onRead={overview.reload} /> : null}
      {tab === "sok" ? <SeoSearch canEdit={canEdit} showToast={showToast} /> : null}
      {tab === "konkurrenter" ? <SeoCompetitors canEdit={canEdit} showToast={showToast} /> : null}
      {tab === "ai" ? <SeoAi canEdit={canEdit} showToast={showToast} /> : null}
      {tab === "leads" ? <SeoLeads canEdit={canEdit} showToast={showToast} /> : null}
      {tab === "arshjul" ? <SeoCalendar canEdit={canEdit} showToast={showToast} /> : null}
      {tab === "innhold" ? <SeoContent canEdit={canEdit} showToast={showToast} /> : null}
      <div className="rule" />
      <div className="mut" style={{ lineHeight: 1.7 }}>
        Kjøres av «SEO ukesjobb» i GitHub Actions hver mandag 03:30 UTC, manuelt via Actions → Run workflow.
        {latestRuns.length ? " Siste kjøring " + weekLabel(latestRuns[0].week) + ": " + latestRuns.map((r) => r.step + " " + r.status).join(" · ") + "." : " Ingen kjøringer ennå."}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* App shell                                                           */
/* ------------------------------------------------------------------ */

const NAV_DRIFT = [
  ["brief", "Brief"],
  ["logg", "Logg"],
  ["systemer", "Systemer"],
  ["foring", "Fôring & batcher"],
  ["hygienisering", "Hygienisering"],
];
const NAV_ARBEID = [
  ["innboks", "Innboks"],
  ["oppgaver", "Oppgaver"],
  ["prosjekter", "Prosjekter"],
  ["sop", "SOP / filer"],
  ["seo", "SEO"],
  ["innstillinger", "Innstillinger"],
];

function todayLine() {
  const now = new Date();
  const weekday = now.toLocaleDateString("nb-NO", { weekday: "long" });
  return (
    weekday.charAt(0).toUpperCase() + weekday.slice(1) + " " +
    now.toLocaleDateString("nb-NO", { day: "numeric", month: "long" }) + " · " +
    now.toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit" }) + " · Jæren"
  );
}

// Computed per call: a module-level constant froze "today" at page load, so a
// tab left open overnight silently logged readings on yesterday's date.
const emptyReading = (system = "CFT1") => ({ system, date: isoDaysAgo(0), temp: 22, ph: 7.5, fukt: 65, for_l: 0, notat: "", avvik: false });

export default function App() {
  const [data, setData] = useState(null);
  const [needsLogin, setNeedsLogin] = useState(false);
  const [loginTeam, setLoginTeam] = useState([]);
  const [view, setView] = useState("brief");
  const [briefRange, setBriefRange] = useState("30D");
  const [briefMetric, setBriefMetric] = useState("TEMP");
  const [loggRange, setLoggRange] = useState("60D");
  const [activeSystem, setActiveSystem] = useState("CFT1");
  const [toast, setToast] = useState("");
  const [editingReadingId, setEditingReadingId] = useState(null);
  const [targets, setTargets] = useState([]);
  const [clock, setClock] = useState("");
  const [loadFailed, setLoadFailed] = useState(false);
  const toastTimer = useRef(null);
  const [form, setForm] = useState(emptyReading());

  const boot = () => {
    setLoadFailed(false);
    api("/api/bootstrap")
      .then(async (res) => {
        if (res.status === 401) {
          setLoginTeam(await api("/api/users").then((r) => r.json()).catch(() => []));
          setNeedsLogin(true);
          setData(null);
          return;
        }
        if (!res.ok) {
          setLoadFailed(true);
          return;
        }
        const payload = await res.json();
        setNeedsLogin(false);
        setData(payload);
        setTargets(payload.targets);
        // The Logg form must never point at a retired/renamed system.
        const active = payload.systems.filter((s) => s.status === "I drift").map((s) => s.id);
        setForm((f) => (active.length && !active.includes(f.system) ? { ...f, system: active[0] } : f));
      })
      .catch(() => setLoadFailed(true));
  };

  useEffect(() => {
    boot();
    // The Monday e-mail links straight to /?view=seo.
    try {
      const wanted = new URLSearchParams(window.location.search).get("view");
      if (wanted && [...NAV_DRIFT, ...NAV_ARBEID].some(([k]) => k === wanted)) setView(wanted);
    } catch {}
    setClock(todayLine());
    const timer = setInterval(() => setClock(todayLine()), 30000);
    return () => clearInterval(timer);
  }, []);

  if (needsLogin) return <LoginView team={loginTeam} onLogin={boot} />;

  if (loadFailed) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
        <div className="card" style={{ padding: "34px 32px", maxWidth: 380, textAlign: "center" }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}><Logo variant="dark" /></div>
          <div className="mut" style={{ marginBottom: 18 }}>Fikk ikke lastet data. Det kan være et øyeblikks nettverkstrøbbel.</div>
          <button className="btn" onClick={boot}>Prøv igjen</button>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="app">
        <aside className="side" />
        <main className="main" />
      </div>
    );
  }

  const user = data.user || { name: "", access: "Kun lesing" };
  const editable = user.access === "Admin" || user.access === "Redigering";

  const logout = async () => {
    await api("/api/logout", { method: "POST" });
    boot();
  };

  const showToast = (msg) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 3200);
  };

  const reportError = async (res, fallback) => {
    window.alert(await failMsg(res, fallback));
  };

  const saveReading = async () => {
    // Blank fields go through as-is — the API stores them as NULL ("not
    // measured"), never as a fabricated 0.
    const payload = {
      system: form.system,
      date: form.date,
      temp: form.temp,
      ph: form.ph,
      fukt: form.fukt,
      for_l: form.for_l,
      notat: form.notat,
      avvik: form.avvik,
    };
    if (editingReadingId) {
      const res = await api("/api/readings/" + editingReadingId, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) return reportError(res, "Kunne ikke oppdatere målingen.");
      const updated = await res.json();
      setData((d) => ({ ...d, readings: sortReadings(d.readings.map((r) => (r.id === updated.id ? updated : r))) }));
      setEditingReadingId(null);
      showToast("Måling oppdatert for " + form.system + " · " + fmtDate(form.date));
      return;
    }
    const res = await api("/api/readings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) return reportError(res, "Kunne ikke lagre målingen.");
    const created = await res.json();
    // Insert in sort order — a backdated entry prepended at index 0 would be
    // mistaken for the newest value in every "latest per system" panel.
    setData((d) => ({ ...d, readings: sortReadings([created, ...d.readings]) }));
    showToast("Måling loggført for " + form.system + " · " + fmtDate(form.date));
  };

  const cancelEditReading = () => {
    setEditingReadingId(null);
    const firstActive = data?.systems?.find((s) => s.status === "I drift")?.id || "CFT1";
    setForm(emptyReading(firstActive));
  };

  const deleteReading = async (r) => {
    const res = await api("/api/readings/" + r.rid, { method: "DELETE" });
    if (!res.ok) return reportError(res, "Sletting feilet.");
    if (editingReadingId === r.rid) cancelEditReading();
    setData((d) => ({ ...d, readings: d.readings.filter((x) => x.id !== r.id) }));
  };

  const addTask = async (task) => {
    const res = await api("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(task),
    });
    if (!res.ok) {
      await reportError(res, "Kunne ikke legge til oppgaven.");
      return false;
    }
    const created = await res.json();
    setData((d) => ({ ...d, tasks: [...d.tasks, created] }));
    showToast("Oppgave lagt til: «" + created.title + "»");
    return true;
  };

  const updateTask = async (task) => {
    const res = await api("/api/tasks", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(task),
    });
    if (!res.ok) return reportError(res, "Kunne ikke oppdatere oppgaven.");
    const updated = await res.json();
    setData((d) => ({ ...d, tasks: d.tasks.map((t) => (t.id === updated.id ? updated : t)) }));
  };

  const deleteTask = async (id) => {
    setData((d) => ({ ...d, tasks: d.tasks.filter((t) => t.id !== id) }));
    await api("/api/tasks/" + id, { method: "DELETE" });
  };

  const addProject = async (col) => {
    const res = await api("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ col, who: user.name }),
    });
    if (!res.ok) {
      await reportError(res, "Kunne ikke opprette prosjektet.");
      return null;
    }
    const created = await res.json();
    setData((d) => ({ ...d, projects: [...d.projects, created] }));
    return created;
  };

  const updateProject = async (project) => {
    const res = await api("/api/projects", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(project),
    });
    if (!res.ok) return reportError(res, "Kunne ikke lagre prosjektet.");
    const updated = await res.json();
    setData((d) => ({ ...d, projects: d.projects.map((p) => (p.id === updated.id ? updated : p)) }));
    showToast("Prosjekt lagret: «" + updated.title + "» · " + updated.col);
  };

  const deleteProject = async (id) => {
    setData((d) => ({
      ...d,
      projects: d.projects.filter((p) => p.id !== id),
      checklist: d.checklist.filter((c) => c.project_id !== id),
    }));
    await api("/api/projects/" + id, { method: "DELETE" });
  };

  const addCheckItem = async (projectId) => {
    const res = await api("/api/checks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project_id: projectId, text: "Nytt punkt" }),
    });
    if (!res.ok) return reportError(res, "Kunne ikke legge til punktet.");
    const created = await res.json();
    setData((d) => ({ ...d, checklist: [...d.checklist, created] }));
  };

  const renameCheckItem = async (id, text) => {
    setData((d) => ({ ...d, checklist: d.checklist.map((c) => (c.id === id ? { ...c, text } : c)) }));
    await api("/api/checks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, text }),
    });
  };

  const deleteCheckItem = async (id) => {
    setData((d) => ({ ...d, checklist: d.checklist.filter((c) => c.id !== id) }));
    await api("/api/checks/" + id, { method: "DELETE" });
  };

  const toggleCheck = async (id, done) => {
    setData((d) => ({ ...d, checklist: d.checklist.map((c) => (c.id === id ? { ...c, done: done ? 1 : 0 } : c)) }));
    await api("/api/checks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, done }),
    });
  };

  const addPartner = async () => {
    const res = await api("/api/partners", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ who: user.name }),
    });
    if (!res.ok) {
      await reportError(res, "Kunne ikke opprette partneren.");
      return null;
    }
    const created = await res.json();
    setData((d) => ({ ...d, partners: [...d.partners, created] }));
    return created;
  };

  const updatePartner = async (partner) => {
    const res = await api("/api/partners", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(partner),
    });
    if (!res.ok) return reportError(res, "Kunne ikke lagre partneren.");
    const updated = await res.json();
    setData((d) => ({ ...d, partners: d.partners.map((p) => (p.id === updated.id ? updated : p)) }));
  };

  const deletePartner = async (id) => {
    setData((d) => ({ ...d, partners: d.partners.filter((p) => p.id !== id) }));
    await api("/api/partners/" + id, { method: "DELETE" });
  };

  // Names a sensor channel. The server also re-labels readings already stored
  // under the "Kanal N" placeholder, so naming a channel late doesn't split its
  // history into two apparent systems.
  const saveSensorMap = async (channel, system) => {
    const res = await api("/api/sensors", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channel, system }),
    });
    if (!res.ok) return reportError(res, "Kunne ikke lagre kanalen.");
    setData((d) => ({
      ...d,
      sensorMap: [
        ...(d.sensorMap || []).filter((m) => m.channel !== channel),
        { channel, system, label: "", active: 1 },
      ].sort((a, b) => a.channel - b.channel),
      sensorLatest: (d.sensorLatest || []).map((r) =>
        r.channel === channel ? { ...r, system } : r
      ),
    }));
  };

  const addSystem = async (id) => {
    const res = await api("/api/systems", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (!res.ok) return reportError(res, "Kunne ikke legge til system.");
    const created = await res.json();
    setData((d) => ({ ...d, systems: [...d.systems, created] }));
  };

  const updateSystem = async (id, newId, status) => {
    const res = await api("/api/systems", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, newId, status }),
    });
    if (!res.ok) return reportError(res, "Kunne ikke oppdatere system.");
    const updated = await res.json();
    setData((d) => ({
      ...d,
      systems: d.systems.map((s) => (s.id === id ? { id: updated.id, status: updated.status } : s)),
      readings: newId !== id ? d.readings.map((r) => (r.system === id ? { ...r, system: updated.id } : r)) : d.readings,
    }));
    if (activeSystem === id) setActiveSystem(updated.id);
    if (form.system === id) setForm((f) => ({ ...f, system: updated.id }));
  };

  const deleteSystem = async (id) => {
    const res = await api("/api/systems/" + encodeURIComponent(id), { method: "DELETE" });
    if (!res.ok) return reportError(res, "Kunne ikke slette system.");
    setData((d) => ({ ...d, systems: d.systems.filter((s) => s.id !== id) }));
  };

  const updateFile = async (id, fields) => {
    const res = await api("/api/files/" + id, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fields),
    });
    if (!res.ok) return reportError(res, "Kunne ikke lagre endringene.");
    const updated = await res.json();
    setData((d) => ({ ...d, files: d.files.map((f) => (f.id === updated.id ? updated : f)) }));
  };

  const uploadFiles = async (files, cat) => {
    const formData = new FormData();
    formData.append("cat", cat);
    for (const f of files) formData.append("files", f);
    const res = await api("/api/files", { method: "POST", body: formData });
    if (!res.ok) return reportError(res, "Opplasting feilet.");
    const created = await res.json();
    setData((d) => ({ ...d, files: [...created.reverse(), ...d.files] }));
  };

  const removeFile = async (id) => {
    setData((d) => ({ ...d, files: d.files.filter((f) => f.id !== id) }));
    await api("/api/files/" + id, { method: "DELETE" });
  };

  const saveTargets = async () => {
    // Half-typed rows (a blank min/max mid-edit) are skipped by the server;
    // it returns the authoritative set so the UI never shows a 0-target.
    const res = await api("/api/targets", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targets }),
    });
    if (!res.ok) return reportError(res, "Kunne ikke lagre målområdene.");
    const body = await res.json();
    if (Array.isArray(body.targets)) {
      setData((d) => ({ ...d, targets: body.targets }));
      // Sync the edit state too — otherwise a skipped half-typed row keeps
      // showing a value that was never saved.
      setTargets(body.targets);
    }
  };


  const addMember = async (member) => {
    const res = await api("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(member),
    });
    if (!res.ok) {
      await reportError(res, "Kunne ikke legge til teammedlemmet.");
      return false;
    }
    const created = await res.json();
    setData((d) => ({ ...d, team: [...d.team, created] }));
    showToast(created.name + " er lagt til i teamet");
    return true;
  };

  const updateMember = async (member) => {
    const res = await api("/api/users", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(member),
    });
    if (!res.ok) {
      await reportError(res, "Kunne ikke lagre teammedlemmet.");
      return false;
    }
    const updated = await res.json();
    setData((d) => ({ ...d, team: d.team.map((t) => (t.id === updated.id ? updated : t)) }));
    showToast("Team oppdatert");
    return true;
  };

  const deleteMember = async (id) => {
    const res = await api("/api/users", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (!res.ok) return reportError(res, "Kunne ikke slette teammedlemmet.");
    setData((d) => ({ ...d, team: d.team.filter((t) => t.id !== id) }));
    showToast("Teammedlem fjernet");
  };

  const newestApp = data.readings.find((r) => r.source === "app");
  const syncLine = newestApp ? "App-logg " + fmtDate(newestApp.date) : "Skylagring aktiv";
  const outside = countOutside(data.readings, data.targets);
  const metaRight = view === "sop"
    ? outside.obs + " obs · " + data.readings.filter((r) => r.avvik).length + " avvik"
    : syncLine;

  const navButton = ([key, label]) => (
    <button key={key} className={"navItem " + (view === key ? "on" : "")} onClick={() => setView(key)}>
      {label}
    </button>
  );

  return (
    <div className="app">
      <aside className="side">
        <div className="brand">
          <Logo variant="white" />
          <small>Intern · Drift Jæren</small>
        </div>
        <nav className="nav">
          <div className="navk">Drift</div>
          {NAV_DRIFT.map(navButton)}
          <div className="navk">Arbeid</div>
          {NAV_ARBEID.map(navButton)}
        </nav>
        <div className="sidefoot">
          <b>{user.name} · {user.access}</b>
          <span className="sidedot" />
          {syncLine}
          <button
            onClick={logout}
            style={{ background: "none", border: 0, color: "rgba(255,255,255,.55)", fontSize: 11, padding: 0, marginLeft: 10, textDecoration: "underline" }}
          >
            Logg ut
          </button>
        </div>
      </aside>
      <main className="main">
        <div className="wrap">
          <div className="topmeta">
            <span>{clock}</span>
            <span>
              {metaRight}
              <button className="mlogout" style={{ marginLeft: 14 }} onClick={logout}>Logg ut</button>
            </span>
          </div>
          {view === "brief" && (
            <BriefView data={data} range={briefRange} setRange={setBriefRange} metric={briefMetric} setMetric={setBriefMetric} canEdit={editable} goToInbox={() => setView("innboks")} goToSeo={() => setView("seo")} />
          )}
          {view === "innboks" && (
            <InboxView data={data} canEdit={editable} addTask={addTask} setView={setView} showToast={showToast} />
          )}
          {view === "logg" && (
            <LoggView
              data={data}
              form={form}
              setForm={setForm}
              saveReading={saveReading}
              toast={toast}
              loggRange={loggRange}
              setLoggRange={setLoggRange}
              canEdit={editable}
              editingReadingId={editingReadingId}
              startEditReading={(r) => {
                setForm({ system: r.system, date: r.date, temp: r.temp ?? "", ph: r.ph ?? "", fukt: r.fukt ?? "", for_l: r.for_l ?? 0, notat: r.notat, avvik: !!r.avvik });
                setEditingReadingId(r.rid);
              }}
              cancelEditReading={cancelEditReading}
              deleteReading={deleteReading}
            />
          )}
          {view === "systemer" && <SystemsView data={data} activeSystem={activeSystem} setActiveSystem={setActiveSystem} />}
          {view === "foring" && <FeedingBatchesView data={data} canEdit={editable} showToast={showToast} />}
          {view === "hygienisering" && <HygieneView canEdit={editable} />}
          {view === "seo" && <SeoView canEdit={editable} showToast={showToast} />}
          {view === "sop" && <FilesView data={data} uploadFiles={uploadFiles} removeFile={removeFile} updateFile={updateFile} canEdit={editable} />}
          {view === "oppgaver" && <TasksView data={data} addTask={addTask} updateTask={updateTask} deleteTask={deleteTask} canEdit={editable} showToast={showToast} refreshAll={boot} />}
          {view === "prosjekter" && (
            <ProjectsView
              data={data}
              canEdit={editable}
              toggleCheck={editable ? toggleCheck : () => {}}
              addProject={addProject}
              updateProject={updateProject}
              deleteProject={deleteProject}
              addCheckItem={addCheckItem}
              renameCheckItem={renameCheckItem}
              deleteCheckItem={deleteCheckItem}
              addPartner={addPartner}
              updatePartner={updatePartner}
              deletePartner={deletePartner}
              showToast={showToast}
              refreshAll={boot}
            />
          )}
          {view === "innstillinger" && (
            <SettingsView
              data={data}
              targets={targets}
              setTargets={setTargets}
              saveTargets={saveTargets}
              canEdit={editable}
              addSystem={addSystem}
              saveSensorMap={saveSensorMap}
              updateSystem={updateSystem}
              deleteSystem={deleteSystem}
              addMember={addMember}
              updateMember={updateMember}
              deleteMember={deleteMember}
              refreshAll={boot}
            />
          )}
        </div>
      </main>
      {/* Global toast — success/error feedback must be visible on every view,
          not only inside the Logg card. */}
      {toast ? (
        <div className="toast global no-print"><span className="dot" />{toast}</div>
      ) : null}
    </div>
  );
}
