"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// fetch with a hard timeout: a dead backend shows an error, never a spinner
// that spins forever. Every call is live operational data — never cached.
export async function apiFetch(path, { timeoutMs = 15000, ...rest } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(path, { ...rest, cache: "no-store", signal: ctrl.signal });
  } catch {
    return { ok: false, status: 0, json: async () => ({ error: "Fikk ikke kontakt med serveren. Prøv igjen." }) };
  } finally {
    clearTimeout(t);
  }
}

export async function postJson(path, body, method = "POST") {
  return apiFetch(path, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

export async function errorMessage(res, fallback) {
  const body = await res.json().catch(() => ({}));
  return body.error || fallback;
}

// status: "loading" | "ok" | "auth" | "error"
//
// Requests are numbered: when the path changes while a request is in flight
// (the Data page builds a new path on every chip tap), the older response
// must not land on top of the newer one. Only the latest request may write.
export function useApi(path, { auto = true } = {}) {
  const [state, setState] = useState({ status: "loading", data: null, error: null });
  const alive = useRef(true);
  const seq = useRef(0);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  const reload = useCallback(async (opts = {}) => {
    const my = ++seq.current;
    const stale = () => !alive.current || my !== seq.current;
    if (!opts.quiet) setState((s) => (s.data ? s : { status: "loading", data: null, error: null }));
    const res = await apiFetch(path);
    if (stale()) return null;
    if (res.status === 401) { setState({ status: "auth", data: null, error: null }); return null; }
    if (!res.ok) {
      const error = await errorMessage(res, "Noe gikk galt.");
      if (stale()) return null;
      setState((s) => ({ status: "error", data: s.data, error }));
      return null;
    }
    const data = await res.json().catch(() => null);
    if (stale()) return null;
    if (data === null) {
      setState((s) => ({ status: "error", data: s.data, error: "Uventet svar fra serveren." }));
      return null;
    }
    setState({ status: "ok", data, error: null });
    return data;
  }, [path]);

  useEffect(() => { if (auto && path) reload(); }, [auto, path, reload]);
  return { ...state, reload };
}
