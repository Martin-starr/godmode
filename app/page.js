"use client";

import { Fragment, useEffect, useRef, useState } from "react";

/* ------------------------------------------------------------------ */
/* Shared helpers                                                      */
/* ------------------------------------------------------------------ */

// fetch with a hard timeout so a dead backend surfaces as an error message
// instead of a button that silently does nothing (the pre-rebuild behaviour
// on mobile was a request hanging for 300 s with no feedback at all).
async function api(path, opts = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15000);
  try {
    return await fetch(path, { ...opts, signal: ctrl.signal });
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

const SYS_COLORS = { CFT1: "#1C3A5C", CFT2: "#B8993A", CFT3: "#5A6270", "Wedge 1": "#1C3A5C", "Breeder Bin": "#B8993A" };
const SYS_DASH = { CFT1: "", CFT2: "", CFT3: "", "Wedge 1": "5 4", "Breeder Bin": "5 4" };
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

function isoDaysAgo(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function fmtDate(iso) {
  const parts = String(iso).split("-");
  return parts.length !== 3 ? iso : parts[2] + "." + parts[1] + "." + parts[0].slice(2);
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
      .filter((r) => r.system === id)
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : String(a.logged_at || "") < String(b.logged_at || "") ? -1 : 1))
      .map((r) => r[key]);
    const style =
      SYS_COLORS[id] !== undefined
        ? { color: SYS_COLORS[id], dash: SYS_DASH[id] || "" }
        : { color: ["#1C3A5C", "#B8993A", "#5A6270"][i % 3], dash: i >= 3 ? "5 4" : "" };
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
    if (r.temp < t.temp.min || r.temp > t.temp.max) temp++;
    if (r.ph < t.ph.min || r.ph > t.ph.max) ph++;
    if (r.fukt < t.fukt.min || r.fukt > t.fukt.max) fukt++;
  }
  return { temp, ph, fukt, obs: readings.length };
}

function latestBySystem(readings, systems) {
  const out = {};
  for (const id of systems) {
    out[id] = readings.find((r) => r.system === id) || { temp: 0, ph: 0, fukt: 0 };
  }
  return out;
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

function BriefView({ data, range, setRange, metric, setMetric, canEdit, goToInbox }) {
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
  const outsideNow = active.filter((id) => {
    const r = latest[id];
    return !!r && !!t.temp && (r.temp < t.temp.min || r.temp > t.temp.max || r.ph < t.ph.min || r.ph > t.ph.max || r.fukt < t.fukt.min || r.fukt > t.fukt.max);
  }).length;

  const kpis = [
    { label: "Avvik i dag", value: String(avvikToday), cls: "", caption: "0 kritiske · siste 24 t" },
    { label: "Aktive systemer", value: String(active.length), cls: "", caption: outsideNow + " utenfor målområde" },
    { label: "Aktive prosjekter", value: String(activeProjects), cls: "", caption: runningProjects + " påbegynt · " + doneProjects + " fullført" },
    { label: "Åpne oppgaver", value: String(openTotal), cls: "gold", caption: openTasks.length + " krever handling" },
  ];

  return (
    <div>
      <span className="eyebrow">Oversikt · Brief</span>
      <div className="hero">
        {avvikToday} i dag.<span className="li"> 0 kritiske.</span>
      </div>
      <div className="herosub">
        Aktive: {active.length} systemer · Forfalt: 0 · Backlog: {openTasks.length} · Loggført i dag: {today.length}
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

  return (
    <div>
      <span className="eyebrow">Logg · Registrering</span>
      <div className="hero">Produksjon</div>
      <div className="herosub">Bekreft at målingen er loggført. Historiske målinger kan legges inn i ettertid.</div>
      <div className="rule" />
      <div className="charthead">
        <span className="eyebrow">Historikk · {RANGE_LABEL[loggRange]}</span>
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
      <Chart series={series} metric={metric} range={loggRange} target={target} />
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
        {toast ? (
          <div className="toast"><span className="dot" />{toast}</div>
        ) : null}
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
                <td className="num"><b>{r.temp}°</b></td>
                <td className="num">{r.ph}</td>
                <td className="num">{r.fukt}%</td>
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
  );
}

/* ------------------------------------------------------------------ */
/* Systemer                                                            */
/* ------------------------------------------------------------------ */

function SystemsView({ data, activeSystem, setActiveSystem }) {
  const active = data.systems.filter((s) => s.status === "I drift").map((s) => s.id);
  const latest = latestBySystem(data.readings, active);
  const current = latest[activeSystem] || { temp: 0, ph: 0, fukt: 0 };
  const tempSeries = buildSeries(data.readings, [activeSystem], "TEMP", "30D");
  const phSeries = buildSeries(data.readings, [activeSystem], "PH", "30D");
  const fuktSeries = buildSeries(data.readings, [activeSystem], "FUKT", "30D");
  const recent = data.readings.filter((r) => r.system === activeSystem).slice(0, 5);

  return (
    <div>
      <span className="eyebrow">Systemer · Per benk</span>
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
                  <div className="mt">{r.temp}° · pH {Number(r.ph).toFixed(1)} · {r.fukt}% fukt</div>
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
              <div className="v">{current.temp}<small>°C</small></div>
            </div>
            <div className="m3">
              <div className="k">pH</div>
              <div className="v">{Number(current.ph).toFixed(1)}</div>
            </div>
            <div className="m3">
              <div className="k">Fuktighet</div>
              <div className="v">{current.fukt}<small>%</small></div>
            </div>
          </div>
          <div className="charthead"><span className="eyebrow">Temperatur (°C) · siste 30 dager</span></div>
          <Chart series={tempSeries} metric="TEMP" range="30D" h={170} target={data.targets.find((t) => t.metric === "temp")} />
          <div className="charthead" style={{ marginTop: 22 }}><span className="eyebrow">pH · siste 30 dager</span></div>
          <Chart series={phSeries} metric="PH" range="30D" h={140} target={data.targets.find((t) => t.metric === "ph")} />
          <div className="charthead" style={{ marginTop: 22 }}><span className="eyebrow">Fuktighet (%) · siste 30 dager</span></div>
          <Chart series={fuktSeries} metric="FUKT" range="30D" h={140} target={data.targets.find((t) => t.metric === "fukt")} />
          <div className="rule tight" />
          <div className="sechead"><span className="eyebrow">Siste registreringer</span></div>
          <table className="dtbl">
            <tbody>
              {(recent.length ? recent : [null]).map((r, i) =>
                r ? (
                  <tr key={r.id}>
                    <td><span className="sy">{fmtDate(r.date)}</span></td>
                    <td className="num"><b>{r.temp}°</b></td>
                    <td className="num">pH {r.ph}</td>
                    <td className="num">{r.fukt}%</td>
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
      <span className="eyebrow">Dokumentasjon</span>
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

function ProjectsView({ data, canEdit, toggleCheck, addProject, updateProject, deleteProject, addCheckItem, renameCheckItem, deleteCheckItem, addPartner, updatePartner, deletePartner }) {
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [partnerId, setPartnerId] = useState(null);
  const [partnerForm, setPartnerForm] = useState(null);
  const [busyCol, setBusyCol] = useState(null);
  const team = data.team.map((t) => t.name);

  const startEdit = (p) => {
    setEditingId(p.id);
    setEditForm({ col: p.col, tag: p.tag, title: p.title, descr: p.descr, who: p.who });
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

  const card = (p) => (
    <div className="pcard" key={p.id}>
      <div className="ptag" style={{ display: "flex", justifyContent: "space-between" }}>
        <span>{p.tag}</span>
        {canEdit ? (
          <button className="lnk" style={{ padding: 0, fontSize: 10.5 }} onClick={() => startEdit(p)}>Endre</button>
        ) : null}
      </div>
      <div className="ptitle">{p.title}</div>
      <div className="pdesc">{p.descr}</div>
      <div className="checks">
        {p.checks.map((c) => (
          <button key={c.id} className={"chk " + (c.done ? "done" : "")} onClick={() => canEdit && toggleCheck(c.id, !c.done)}>
            <span className="chkbox" />{c.text}
          </button>
        ))}
      </div>
      <div className="pfoot">
        <span className="pbar"><i style={{ width: p.pct + "%" }} /></span>
        <span className="pav">{p.who} · {p.done}/{p.checks.length}</span>
      </div>
    </div>
  );

  const editCard = (p) => (
    <div className="pcard" key={p.id}>
      <div className="field" style={{ marginBottom: 12 }}>
        <label>Tag</label>
        <input className="input" value={editForm.tag} onChange={(e) => setEditForm({ ...editForm, tag: e.target.value })} />
      </div>
      <div className="field" style={{ marginBottom: 12 }}>
        <label>Tittel</label>
        <input className="input" value={editForm.title} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} />
      </div>
      <div className="field" style={{ marginBottom: 12 }}>
        <label>Beskrivelse</label>
        <textarea className="ta" style={{ minHeight: 56 }} value={editForm.descr} onChange={(e) => setEditForm({ ...editForm, descr: e.target.value })} />
      </div>
      <div className="f2" style={{ gap: 12, marginBottom: 12 }}>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Kolonne</label>
          <select className="select" value={editForm.col} onChange={(e) => setEditForm({ ...editForm, col: e.target.value })}>
            {PROJECT_COLS.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Ansvarlig</label>
          <select className="select" value={editForm.who} onChange={(e) => setEditForm({ ...editForm, who: e.target.value })}>
            {team.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
            {team.includes(editForm.who) ? null : <option value={editForm.who}>{editForm.who}</option>}
          </select>
        </div>
      </div>
      <div className="field" style={{ marginBottom: 12 }}>
        <label>Sjekkliste</label>
        {p.checks.map((c) => (
          <div key={c.id} style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              className="input"
              style={{ padding: "8px 10px", fontSize: 12.5 }}
              defaultValue={c.text}
              onBlur={(e) => { if (e.target.value !== c.text) renameCheckItem(c.id, e.target.value); }}
            />
            <button className="lnk g" style={{ flex: "none" }} onClick={() => deleteCheckItem(c.id)}>Fjern</button>
          </div>
        ))}
        <button className="lnk" style={{ textAlign: "left", paddingLeft: 0 }} onClick={() => addCheckItem(p.id)}>+ Legg til punkt</button>
      </div>
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
    </div>
  );

  return (
    <div>
      <span className="eyebrow">Arbeid · Langsiktig</span>
      <div className="hero">Prosjekter</div>
      <div className="herosub">Enkel oversikt over prosjekter, store oppgaver og partnere som jobbes over tid. Kryss av stegene på veien.</div>
      <div className="rule" />
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
            {col.cards.map((p) => (editingId === p.id ? editCard(p) : card(p)))}
          </div>
        ))}
      </div>
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
const EMPTY_TASK = { title: "", sub: "", tag: "Ny", who: "Mathias" };

function TasksView({ data, addTask, updateTask, deleteTask, canEdit }) {
  const [form, setForm] = useState(EMPTY_TASK);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(EMPTY_TASK);
  const [busy, setBusy] = useState(false);
  const team = data.team.map((t) => t.name);
  const open = data.tasks.filter((t) => t.open);
  const done = data.tasks.filter((t) => !t.open);

  const submit = async () => {
    if (!form.title.trim() || busy) return;
    setBusy(true);
    const ok = await addTask(form);
    setBusy(false);
    if (ok) setForm(EMPTY_TASK);
  };

  const startEdit = (t) => {
    setEditingId(t.id);
    setEditForm({ title: t.title, sub: t.sub, tag: t.tag, who: t.who });
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
          </div>
          <div className="hs">{t.sub}</div>
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
      <span className="eyebrow">Arbeid · Oppgaver</span>
      <div className="hero">Oppgaver</div>
      <div className="herosub">Alt som krever handling — legg til, kryss av og hold listen kort.</div>
      <div className="rule" />
      {canEdit ? (
        <div className="card" style={{ padding: "22px 24px", marginBottom: 30 }}>
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
          <button className="btn ghost sm" onClick={submit} disabled={busy}>+ Legg til oppgave</button>
        </div>
      ) : null}
      <div className="sechead">
        <span className="eyebrow gold">Krever handling</span>
        <span className="mut">{open.length} åpne</span>
      </div>
      <div className="tscroll">
        <table className="htbl"><tbody>{open.map((t, i) => row(t, i, true))}</tbody></table>
      </div>
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

  const load = () => api("/api/hygiene").then((r) => r.json()).then(setData).catch(() => {});
  useEffect(() => { load(); }, []);

  const upload = async (files) => {
    const file = (files && files[0]) || null;
    if (!file) return;
    setImporting(true);
    setMessage("Leser fil …");
    const form = new FormData();
    form.append("file", file);
    const res = await api("/api/hygiene", { method: "POST", body: form });
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
      ) : data ? (
        <div className="mut" style={{ marginTop: 10 }}>
          Ingen logger importert ennå. Koble Center 374 til PC-en, eksporter siste periode, og last opp filen her.
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Innstillinger                                                       */
/* ------------------------------------------------------------------ */

function SettingsView({ data, targets, setTargets, saveTargets, canEdit, sheetsConfigured, lastSync, addSystem, updateSystem, deleteSystem }) {
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

  const syncNow = async () => {
    setSyncMsg("Synkroniserer …");
    const res = await api("/api/sync", { method: "POST" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setSyncMsg(body.error || "Synk feilet.");
      return;
    }
    setSyncMsg("Importert: " + body.imported + " · hoppet over: " + body.skipped);
  };

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
                  <div className="ss">{r.temp}° · pH {Number(r.ph).toFixed(1)} · {r.fukt}% fukt</div>
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
          <div className="sechead" style={{ marginTop: 36 }}><span className="eyebrow">Team</span></div>
          {data.team.map((t) => (
            <div className="setrow" key={t.id}>
              <div>
                <div className="sl">{t.name}</div>
                <div className="ss">{t.role}</div>
              </div>
              <span className="mut" style={{ fontSize: 11 }}>{t.access}</span>
            </div>
          ))}
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
          <div className="sechead" style={{ marginTop: 36 }}><span className="eyebrow">Datakilde</span></div>
          <div className="setrow">
            <div>
              <div className="sl">Google Sheets</div>
              <div className="ss">
                Produksjonslogger · synkes automatisk hver time
                {lastSync ? (
                  <> · Sist synk {new Date(lastSync).toLocaleString("nb-NO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</>
                ) : null}
              </div>
            </div>
            <span className="trange">
              {sheetsConfigured ? (
                <span className="pill">Tilkoblet</span>
              ) : (
                <span className="pill warn">Ikke tilkoblet</span>
              )}
              {canEdit ? <button className="btn ghost sm" onClick={syncNow}>Synk nå</button> : null}
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
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Innboks                                                             */
/* ------------------------------------------------------------------ */

const INBOX_STATUSES = [["open", "Åpne"], ["done", "Ferdige"], ["all", "Alle"]];
const INBOX_CATS = ["Alle", "Svar kreves", "Til info"];

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
  const [status, setStatus] = useState("open");
  const [category, setCategory] = useState("Alle");
  const [source, setSource] = useState("Alle");
  const [q, setQ] = useState("");
  const [expanded, setExpanded] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [loading, setLoading] = useState(false);
  const [offset, setOffset] = useState(0);
  const searchTimer = useRef(null);

  const fetchInbox = async (params = {}) => {
    const s = params.status ?? status;
    const c = params.category ?? category;
    const src = params.source ?? source;
    const search = params.q ?? q;
    const off = params.offset ?? 0;

    setLoading(true);
    const qs = new URLSearchParams({ status: s, limit: "50", offset: String(off) });
    if (c && c !== "Alle") qs.set("category", c);
    if (src && src !== "Alle") qs.set("source", src);
    if (search) qs.set("q", search);

    const res = await api("/api/inbox?" + qs);
    if (res.ok) {
      const body = await res.json();
      if (off > 0) {
        setItems((prev) => [...prev, ...body.items]);
      } else {
        setItems(body.items);
      }
      setTotal(body.total);
      setOffset(off);
    }
    setLoading(false);
  };

  useEffect(() => { fetchInbox(); }, []);

  const applyFilter = (key, val) => {
    const next = { status, category, source, q, offset: 0, [key]: val };
    if (key === "status") setStatus(val);
    if (key === "category") setCategory(val);
    if (key === "source") setSource(val);
    setSelected(new Set());
    setExpanded(null);
    fetchInbox(next);
  };

  const handleSearch = (val) => {
    setQ(val);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => fetchInbox({ q: val, offset: 0 }), 350);
  };

  const markDone = async (id) => {
    setItems((prev) => prev.filter((m) => m.id !== id));
    setTotal((t) => t - 1);
    await api("/api/inbox", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, status: "done" }) });
  };

  const reopen = async (id) => {
    setItems((prev) => prev.filter((m) => m.id !== id));
    await api("/api/inbox", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, status: "open" }) });
  };

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
    setItems((prev) => prev.filter((m) => !selected.has(m.id)));
    setTotal((t) => t - ids.length);
    setSelected(new Set());
    await api("/api/inbox", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "batch_done", ids }) });
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

  const openCount = data.inboxCounts?.total || 0;
  const urgentCount = data.inboxCounts?.urgent || 0;
  const highPrio = data.inboxCounts?.high_priority || items.filter((m) => m.priority === "høy").length;
  const sources = [...new Set(items.map((m) => m.source || "gmail"))];

  const copyDraft = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      if (showToast) showToast("Utkast kopiert til utklippstavlen");
    } catch {
      if (showToast) showToast("Kunne ikke kopiere — velg og kopier manuelt");
    }
  };

  return (
    <div>
      <span className="eyebrow">Innboks · E-posttriage</span>
      <div className="hero">
        Innboks<span className="li"> e-post</span>
      </div>
      <div className="herosub">
        {openCount} åpne · {urgentCount} krever svar · Triagert av Claude
      </div>
      <div className="rule" />

      <div className="metrics3">
        <div className="m3">
          <div className="k">Åpne</div>
          <div className="v">{openCount}</div>
        </div>
        <div className="m3">
          <div className="k">Høy prioritet</div>
          <div className="v gold">{highPrio}</div>
        </div>
        <div className="m3">
          <div className="k">Svar kreves</div>
          <div className="v">{urgentCount}</div>
        </div>
      </div>
      <div className="rule" />

      <div className="sechead">
        <div className="toggle">
          {INBOX_STATUSES.map(([key, label]) => (
            <button key={key} className={"tbtn " + (status === key ? "on" : "")} onClick={() => applyFilter("status", key)}>{label}</button>
          ))}
        </div>
        <input
          className="input"
          placeholder="Søk i e-post..."
          value={q}
          onChange={(e) => handleSearch(e.target.value)}
          style={{ maxWidth: 220, padding: "9px 14px", fontSize: 13 }}
        />
      </div>

      <div className="chips" style={{ marginBottom: 16 }}>
        {INBOX_CATS.map((c) => (
          <button key={c} className={"chip " + (category === c ? "on" : "")} onClick={() => applyFilter("category", c)}>{c}</button>
        ))}
        {sources.length > 1 && (
          <>
            <span style={{ width: 1, height: 24, background: "var(--line)", margin: "0 4px" }} />
            <button className={"chip " + (source === "Alle" ? "on" : "")} onClick={() => applyFilter("source", "Alle")}>Alle kilder</button>
            {sources.map((s) => (
              <button key={s} className={"chip " + (source === s ? "on" : "")} onClick={() => applyFilter("source", s)}>{s}</button>
            ))}
          </>
        )}
      </div>

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
            {items.map((m, i) => (
              <Fragment key={m.id}>
                <tr style={{ cursor: "pointer" }} onClick={() => setExpanded(expanded === m.id ? null : m.id)}>
                  {canEdit && status === "open" && (
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
                  <td className="hn">{String(i + 1).padStart(2, "0")}</td>
                  <td>
                    <div className="ht">
                      {m.link ? (
                        <a href={m.link} target="_blank" rel="noreferrer" style={{ color: "inherit", textDecoration: "none" }} onClick={(e) => e.stopPropagation()}>
                          {m.subject}
                        </a>
                      ) : (
                        m.subject
                      )}
                    </div>
                    <div className="hs">{m.sender} · {fmtReceived(m.received_at)} — {m.summary}</div>
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
                    <td colSpan={canEdit && status === "open" ? 7 : 6} className="inbox-detail">
                      <div className="inbox-meta">
                        <div><span className="mk">Fra</span><span className="mv">{m.sender}</span></div>
                        <div><span className="mk">Mottatt</span><span className="mv">{fmtReceived(m.received_at)}</span></div>
                        <div><span className="mk">Kilde</span><span className="mv">{m.source || "gmail"}</span></div>
                        {m.priority && (
                          <div>
                            <span className="mk">Prioritet</span>
                            <span className={"mv prio-" + m.priority}>{prioLabel(m.priority)}</span>
                          </div>
                        )}
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
          {status === "open" ? "Ingen åpne e-poster — alt er håndtert." : "Ingen e-poster funnet."}
        </div>
      )}

      {loading && (
        <div style={{ textAlign: "center", padding: "20px 0", color: "var(--muted)", fontSize: 12 }}>Laster...</div>
      )}

      {items.length < total && !loading && (
        <div style={{ textAlign: "center", marginTop: 20 }}>
          <button className="btn sm ghost" onClick={() => fetchInbox({ offset: offset + 50 })}>
            Last flere ({total - items.length} gjenstår)
          </button>
        </div>
      )}

      <div className="inbox-trustbar">
        <div>
          <div className="mk">Triage-rutine</div>
          <div className="mv">Daglig 07:00 · Gmail-connector · martin@verminord.no{sources.includes("post") ? " + post@verminord.no" : ""}</div>
        </div>
        <button className="btn sm ghost" onClick={() => fetchInbox({ offset: 0 })}>
          Oppdater
        </button>
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
  ["hygienisering", "Hygienisering"],
];
const NAV_ARBEID = [
  ["innboks", "Innboks"],
  ["oppgaver", "Oppgaver"],
  ["prosjekter", "Prosjekter"],
  ["sop", "SOP / filer"],
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

const EMPTY_READING = { system: "CFT1", date: isoDaysAgo(0), temp: 22, ph: 7.5, fukt: 65, for_l: 0, notat: "", avvik: false };

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
  const [form, setForm] = useState(EMPTY_READING);

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
      })
      .catch(() => setLoadFailed(true));
  };

  useEffect(() => {
    boot();
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
    const payload = {
      system: form.system,
      date: form.date,
      temp: Number(form.temp),
      ph: Number(form.ph),
      fukt: Number(form.fukt),
      for_l: Number(form.for_l),
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
      setData((d) => ({ ...d, readings: d.readings.map((r) => (r.id === updated.id ? updated : r)) }));
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
    setData((d) => ({ ...d, readings: [created, ...d.readings] }));
    showToast("Måling loggført for " + form.system + " · " + fmtDate(form.date));
  };

  const cancelEditReading = () => {
    setEditingReadingId(null);
    setForm(EMPTY_READING);
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
    const clean = targets.map((t) => ({ metric: t.metric, min: Number(t.min), max: Number(t.max) }));
    setData((d) => ({ ...d, targets: clean }));
    await api("/api/targets", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targets: clean }),
    });
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
            <BriefView data={data} range={briefRange} setRange={setBriefRange} metric={briefMetric} setMetric={setBriefMetric} canEdit={editable} goToInbox={() => setView("innboks")} />
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
                setForm({ system: r.system, date: r.date, temp: r.temp, ph: r.ph, fukt: r.fukt, for_l: r.for_l, notat: r.notat, avvik: !!r.avvik });
                setEditingReadingId(r.rid);
              }}
              cancelEditReading={cancelEditReading}
              deleteReading={deleteReading}
            />
          )}
          {view === "systemer" && <SystemsView data={data} activeSystem={activeSystem} setActiveSystem={setActiveSystem} />}
          {view === "hygienisering" && <HygieneView canEdit={editable} />}
          {view === "sop" && <FilesView data={data} uploadFiles={uploadFiles} removeFile={removeFile} updateFile={updateFile} canEdit={editable} />}
          {view === "oppgaver" && <TasksView data={data} addTask={addTask} updateTask={updateTask} deleteTask={deleteTask} canEdit={editable} />}
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
            />
          )}
          {view === "innstillinger" && (
            <SettingsView
              data={data}
              targets={targets}
              setTargets={setTargets}
              saveTargets={saveTargets}
              canEdit={editable}
              sheetsConfigured={data.sheetsConfigured}
              lastSync={data.lastSync}
              addSystem={addSystem}
              updateSystem={updateSystem}
              deleteSystem={deleteSystem}
            />
          )}
        </div>
      </main>
    </div>
  );
}
