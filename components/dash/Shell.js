"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

const TABS = [
  ["/", "Anlegg", (p) => p === "/" || p.startsWith("/anlegg")],
  ["/logg", "Logg", (p) => p.startsWith("/logg")],
  ["/data", "Data", (p) => p.startsWith("/data")],
  ["/mer", "Mer", (p) => p.startsWith("/mer")],
];

// Applies a stored theme choice before React paints. Without a stored
// choice the CSS follows prefers-color-scheme on its own.
const THEME_SCRIPT = `try{var t=localStorage.getItem("vd-theme");if(t==="light"||t==="dark"){document.documentElement.setAttribute("data-theme",t);var c=t==="dark"?"#101A30":"#ffffff";var m=document.querySelectorAll('meta[name="theme-color"]');for(var i=0;i<m.length;i++){m[i].setAttribute("content",c)}}}catch(e){}`;

const ToastCtx = createContext(() => {});
export const useToast = () => useContext(ToastCtx);

export default function Shell({ children }) {
  const pathname = usePathname() || "/";
  const [toast, setToast] = useState("");
  const timer = useRef(null);

  const show = useCallback((msg) => {
    setToast(msg);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(""), 3500);
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);

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
        <main className="page">{children}</main>
      </div>
      {/* Always mounted: a live region only announces changes inside an
          element that already existed. Empty, it is hidden by CSS. */}
      <div className="toast" role="status" aria-live="polite">{toast}</div>
    </ToastCtx.Provider>
  );
}
