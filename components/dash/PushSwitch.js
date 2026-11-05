"use client";

import { useEffect, useState } from "react";
import { apiFetch, postJson } from "./api";
import { useToast } from "./Shell";

// "Varsler på denne telefonen": on, off, or why not. On an iPhone, web
// push only works once the app is on the home screen, so that is said
// before the button is offered.
const b64ToBytes = (s) => {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const raw = atob((s + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

export default function PushSwitch() {
  const toast = useToast();
  const [state, setState] = useState({ kind: "loading" });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const supported = typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
      const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
      const standalone = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
      if (!supported) return setState({ kind: ios && !standalone ? "ios-install" : "unsupported" });
      const cfg = await apiFetch("/api/v2/push").then((r) => (r.ok ? r.json() : null)).catch(() => null);
      if (!cfg || !cfg.configured) return setState({ kind: "server-off" });
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      setState({ kind: sub ? "on" : "off", publicKey: cfg.publicKey, sub, ios: ios && !standalone });
    })().catch(() => setState({ kind: "unsupported" }));
  }, []);

  const enable = async () => {
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") { toast("Telefonen sa nei til varsler. Du kan endre det i innstillingene for nettleseren."); return; }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(state.publicKey) });
      const res = await postJson("/api/v2/push", { subscription: sub.toJSON() });
      if (!res.ok) { toast("Fikk ikke lagret påmeldingen."); return; }
      setState((s) => ({ ...s, kind: "on", sub }));
      const t = await postJson("/api/v2/push/test", { endpoint: sub.endpoint });
      toast(t.ok ? "Varsler er på. Et testvarsel er på vei." : "Varsler er på.");
    } catch {
      toast("Fikk ikke slått på varsler på denne telefonen.");
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    try {
      const sub = state.sub;
      if (sub) { await apiFetch("/api/v2/push?endpoint=" + encodeURIComponent(sub.endpoint), { method: "DELETE" }); await sub.unsubscribe(); }
      setState((s) => ({ ...s, kind: "off", sub: null }));
      toast("Varsler er av på denne telefonen.");
    } finally {
      setBusy(false);
    }
  };

  if (state.kind === "loading") return <p className="small">Sjekker …</p>;
  if (state.kind === "ios-install") {
    return <p className="notice">På iPhone må appen ligge på Hjem-skjermen først: trykk Del, så «Legg til på Hjem-skjerm», og åpne den derfra.</p>;
  }
  if (state.kind === "unsupported") return <p className="notice">Denne nettleseren støtter ikke varsler. Prøv Chrome eller Safari på telefonen.</p>;
  if (state.kind === "server-off") return <p className="notice">Varsling er ikke satt opp på serveren ennå.</p>;
  return (
    <div className="stack">
      <p className="small">{state.kind === "on" ? "På for denne telefonen." : "Av for denne telefonen."}</p>
      {state.kind === "on"
        ? <button type="button" className="btn ghost" onClick={disable} disabled={busy}>Slå av</button>
        : <button type="button" className="btn" onClick={enable} disabled={busy}>Slå på varsler</button>}
    </div>
  );
}
