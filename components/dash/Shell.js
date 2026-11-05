"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { flushQueue, queuedCount, onQueue } from "./api";

// The phone app: three tabs. Nå is the state of the hall, Gjør is what you
// log while standing in it, Varsler is what the app told you. There is one
// dashboard on a computer, the full one at /oversikt, so a big screen
// (≥ 1024 px) is sent there, to the view that matches the page it asked
// for. Nothing is drawn until the screen size is known, so a computer
// never flashes the phone page.
const TABS = [
  ["/", "Nå", (p) => p === "/" || p.startsWith("/anlegg")],
  ["/logg", "Gjør", (p) => p.startsWith("/logg")],
  ["/varsler", "Varsler", (p) => p.startsWith("/varsler")],
];

const DESKTOP = "(min-width: 1024px)";
const DESKTOP_HOME = "/oversikt";
const desktopView = (p) => (p.startsWith("/logg") ? "logg" : "brief");

// Applies a stored theme choice before React paints. Without a stored
// choice the app is dark in the evening (18–07, when the hall is dim and
// the phone is bright) and follows the phone by day.
const THEME_SCRIPT = `try{var t=localStorage.getItem("vd-theme");if(t!=="light"&&t!=="dark"){var h=new Date().getHours();if(h>=18||h<7)t="dark"}if(t==="light"||t==="dark"){document.documentElement.setAttribute("data-theme",t);var c=t==="dark"?"#101A30":"#ffffff";var m=document.querySelectorAll('meta[name="theme-color"]');for(var i=0;i<m.length;i++){m[i].setAttribute("content",c)}}}catch(e){}`;

const ToastCtx = createContext(() => {});
export const useToast = () => useContext(ToastCtx);

export default function Shell({ children }) {
  const pathname = usePathname() || "/";
  const [toast, setToast] = useState("");
  const [phone, setPhone] = useState(false);
  const [pending, setPending] = useState(0);
  const timer = useRef(null);

  const show = useCallback((msg) => {
    setToast(msg);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(""), 3500);
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);

  useEffect(() => {
    const desk = window.matchMedia && window.matchMedia(DESKTOP).matches;
    // A deep link into the full dashboard (the Monday mail uses /?view=seo)
    // keeps its view.
    const asked = new URLSearchParams(window.location.search).get("view");
    if (desk) window.location.replace(DESKTOP_HOME + "?view=" + (asked && /^[a-z]+$/.test(asked) ? asked : desktopView(pathname)));
    else setPhone(true);
  }, [pathname]);

  // Entries saved without coverage wait in the phone and go when it is
  // back; the tab bar says how many are waiting.
  useEffect(() => {
    if (!phone) return;
    setPending(queuedCount());
    const off = onQueue((n, sent) => {
      setPending(n);
      if (sent) show(sent === 1 ? "Sendt: 1 loggføring som ventet på nett." : `Sendt: ${sent} loggføringer som ventet på nett.`);
    });
    const go = () => flushQueue();
    go();
    window.addEventListener("online", go);
    document.addEventListener("visibilitychange", go);
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
    return () => {
      off();
      window.removeEventListener("online", go);
      document.removeEventListener("visibilitychange", go);
    };
  }, [phone, show]);

  return (
    <ToastCtx.Provider value={show}>
      <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      <div className="shell">
        <nav className="tabs" aria-label="Hovedmeny">
          <span className="brand">Verminord</span>
          {TABS.map(([href, label, isOn]) => (
            <Link key={href} href={href} className="tab" aria-current={isOn(pathname) ? "page" : undefined}>
              {label}
            </Link>
          ))}
        </nav>
        {pending ? <div className="pending num">{pending} {pending === 1 ? "loggføring venter" : "loggføringer venter"} på nett</div> : null}
        <main className="page">{phone ? children : null}</main>
      </div>
      {/* Always mounted: a live region only announces changes inside an
          element that already existed. Empty, it is hidden by CSS. */}
      <div className="toast" role="status" aria-live="polite">{toast}</div>
    </ToastCtx.Provider>
  );
}
