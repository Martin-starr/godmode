"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { apiFetch, postJson } from "./api";

// Phones and tablets: the four tabs. Big screens (≥ 1024 px) get the old
// dashboard's look instead: a navy sidebar with the logo, and the date line
// on top of the page (styles in app/(dash)/desktop.css). Both navigations
// are rendered; CSS shows exactly one, so assistive tech only meets one.
const TABS = [
  ["/", "Anlegg", (p) => p === "/" || p.startsWith("/anlegg")],
  ["/logg", "Logg", (p) => p.startsWith("/logg")],
  ["/data", "Data", (p) => p.startsWith("/data")],
  ["/mer", "Mer", (p) => p.startsWith("/mer")],
];

// [section, [[href, label, isActive, external]]]. External links are full
// page loads: the Week app is a static page outside this app.
const SIDE = [
  ["Drift", [
    ["/", "Anlegg", (p) => p === "/" || p.startsWith("/anlegg")],
    ["/logg", "Logg", (p) => p.startsWith("/logg")],
    ["/data", "Data", (p) => p.startsWith("/data")],
  ]],
  ["Annet", [
    ["/mer/kanaler", "Kanaler", (p) => p.startsWith("/mer/kanaler")],
    ["/week/", "Ukeplan", () => false, true],
    ["/mer", "Mer", (p) => p.startsWith("/mer") && !p.startsWith("/mer/kanaler")],
  ]],
];

const DESKTOP = "(min-width: 1024px)";

// "Fredag 30. oktober · 22:15 · Jæren", as on the old dashboard.
const dayFmt = new Intl.DateTimeFormat("nb-NO", { timeZone: "Europe/Oslo", weekday: "long", day: "numeric", month: "long" });
const timeFmt = new Intl.DateTimeFormat("nb-NO", { timeZone: "Europe/Oslo", hour: "2-digit", minute: "2-digit" });
function clockLine(d) {
  const day = dayFmt.format(d);
  return day.charAt(0).toUpperCase() + day.slice(1) + " · " + timeFmt.format(d) + " · Jæren";
}

// Applies a stored theme choice before React paints. Without a stored
// choice the CSS follows prefers-color-scheme on its own.
const THEME_SCRIPT = `try{var t=localStorage.getItem("vd-theme");if(t==="light"||t==="dark"){document.documentElement.setAttribute("data-theme",t);var c=t==="dark"?"#101A30":"#ffffff";var m=document.querySelectorAll('meta[name="theme-color"]');for(var i=0;i<m.length;i++){m[i].setAttribute("content",c)}}}catch(e){}`;

const ToastCtx = createContext(() => {});
export const useToast = () => useContext(ToastCtx);

export default function Shell({ children }) {
  const pathname = usePathname() || "/";
  const [toast, setToast] = useState("");
  const [clock, setClock] = useState("");
  const [me, setMe] = useState(null);
  const timer = useRef(null);

  const show = useCallback((msg) => {
    setToast(msg);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(""), 3500);
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);

  // The date line is only drawn after mount, so server and browser never
  // disagree about the minute.
  useEffect(() => {
    const tick = () => setClock(clockLine(new Date()));
    tick();
    const id = setInterval(tick, 30000);
    return () => clearInterval(id);
  }, []);

  // Who is signed in, for the sidebar footer. Only fetched where the
  // sidebar is visible; refreshed on navigation, right after a login, and
  // when the window grows past 1024 px.
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia(DESKTOP);
    let alive = true;
    const load = () => {
      if (!mq.matches) return;
      apiFetch("/api/v2/me")
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => { if (alive) setMe(j); })
        .catch(() => {});
    };
    load();
    window.addEventListener("vd-login", load);
    if (mq.addEventListener) mq.addEventListener("change", load);
    return () => {
      alive = false;
      window.removeEventListener("vd-login", load);
      if (mq.removeEventListener) mq.removeEventListener("change", load);
    };
  }, [pathname]);

  const logout = async () => {
    await postJson("/api/logout", {});
    window.location.href = "/";
  };

  return (
    <ToastCtx.Provider value={show}>
      <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      <div className="shell">
        <aside className="side">
          <div className="side-brand">
            {/* eslint-disable-next-line @next/next/no-img-element -- static logo, as in the old dashboard */}
            <img src="/logo-white.png" alt="Verminord" width={130} height={59} loading="lazy" />
            <small>Intern · Drift Jæren</small>
          </div>
          <nav className="side-nav" aria-label="Hovedmeny">
            {SIDE.map(([title, items]) => (
              <div key={title}>
                <div className="side-k">{title}</div>
                {items.map(([href, label, isOn, external]) =>
                  external ? (
                    <a key={href} href={href} className="side-item">{label}</a>
                  ) : (
                    <Link key={href} href={href} className="side-item" aria-current={isOn(pathname) ? "page" : undefined}>
                      {label}
                    </Link>
                  )
                )}
              </div>
            ))}
          </nav>
          {me ? (
            <div className="side-foot">
              <b>{me.name} · {me.access}</b>
              {me.sync ? <span className="side-sync"><span className="side-dot" />{me.sync}</span> : null}
              <button type="button" className="side-out" onClick={logout}>Logg ut</button>
            </div>
          ) : null}
        </aside>
        <nav className="tabs" aria-label="Hovedmeny">
          <span className="brand">Verminord</span>
          {TABS.map(([href, label, isOn]) => (
            <Link key={href} href={href} className="tab" aria-current={isOn(pathname) ? "page" : undefined}>
              {label}
            </Link>
          ))}
        </nav>
        <main className="page">
          <div className="topmeta"><span data-clock>{clock}</span><span>{me && me.sync ? me.sync : ""}</span></div>
          {children}
        </main>
      </div>
      {/* Always mounted: a live region only announces changes inside an
          element that already existed. Empty, it is hidden by CSS. */}
      <div className="toast" role="status" aria-live="polite">{toast}</div>
    </ToastCtx.Provider>
  );
}
