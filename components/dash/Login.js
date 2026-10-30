"use client";

import { useEffect, useState } from "react";
import { apiFetch, postJson, errorMessage } from "./api";

export default function Login({ onLogin }) {
  const [team, setTeam] = useState([]);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    apiFetch("/api/users").then((r) => r.json()).then((rows) => {
      if (Array.isArray(rows) && rows.length) { setTeam(rows); setName((n) => n || rows[0].name); }
    }).catch(() => {});
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setError("");
    const res = await postJson("/api/login", { name, password });
    setBusy(false);
    if (!res.ok) { setError(await errorMessage(res, "Innlogging feilet.")); return; }
    window.dispatchEvent(new Event("vd-login"));
    onLogin && onLogin();
  };

  return (
    <form className="login stack" onSubmit={submit}>
      {/* eslint-disable-next-line @next/next/no-img-element -- static logo, as in the old dashboard */}
      <img className="desk-only login-logo" src="/logo-dark.png" alt="" width={130} height={60} loading="lazy" />
      <h1 className="h1"><span className="eyebrow" aria-hidden="true">Verminord · Intern</span>Logg inn</h1>
      <div className="field">
        <label htmlFor="login-name">Bruker</label>
        {team.length ? (
          <select id="login-name" className="select" value={name} onChange={(e) => setName(e.target.value)}>
            {team.map((t) => <option key={t.name} value={t.name}>{t.name}</option>)}
          </select>
        ) : (
          <input id="login-name" className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="username" />
        )}
      </div>
      <div className="field">
        <label htmlFor="login-pw">Passord</label>
        <input id="login-pw" className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
      </div>
      {error ? <p className="notice error" role="alert">{error}</p> : null}
      <button className="btn wide" type="submit" disabled={busy || !name || !password}>Logg inn</button>
    </form>
  );
}
