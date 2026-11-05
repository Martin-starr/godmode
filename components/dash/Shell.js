"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

// The phone app: four tabs. There is one dashboard on a computer, the full
// one at /oversikt, so a big screen (≥ 1024 px) is sent there, to the view
// that matches the page it asked for. Nothing is drawn until the screen
// size is known, so a computer never flashes the phone page.
const TABS = [
  ["/", "Anlegg", (p) => p === "/" || p.startsWith("/anlegg")],
  ["/logg", "Logg", (p) => p.startsWith("/logg")],
  ["/data", "Data", (p) => p.startsWith("/data")],
  ["/mer", "Mer", (p) => p.startsWith("/mer")],
];

const DESKTOP = "(min-width: 1024px)";
const DESKTOP_HOME = "/oversikt";
const desktopView = (p) => (p.startsWith("/logg") ? "logg" : p.startsWith("/mer/kanaler") ? "innstillinger" : "brief");

// Applies a stored theme choice before React paints. Without a stored
// choice the CSS follows prefers-color-scheme on its own.
const THEME_SCRIPT = `try{var t=localStorage.getItem("vd-theme");if(t==="light"||t==="dark"){document.documentElement.setAttribute("data-theme",t);var c=t==="dark"?"#101A30":"#ffffff";var m=document.querySelectorAll('meta[name="theme-color"]');for(var i=0;i<m.length;i++){m[i].setAttribute("content",c)}}}catch(e){}`;

const ToastCtx = createContext(() => {});
export const useToast = () => useContext(ToastCtx);

export default function Shell({ children }) {
  const pathname = usePathname() || "/";
  const [toast, setToast] = useState("");
  const [phone, setPhone] = useState(false);
  const timer = useRef(null);

  const show = useCallback((msg) => {
    setToast(msg);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(""), 3500);
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);

  useEffect(() => {
    const desk = window.matchMedia && window.matchMedia(DESKTOP).matches;
    if (desk) window.location.replace(DESKTOP_HOME + "?view=" + desktopView(pathname));
    else setPhone(true);
  }, [pathname]);

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
        <main className="page">{phone ? children : null}</main>
      </div>
      {/* Always mounted: a live region only announces changes inside an
          element that already existed. Empty, it is hidden by CSS. */}
      <div className="toast" role="status" aria-live="polite">{toast}</div>
    </ToastCtx.Provider>
  );
}
