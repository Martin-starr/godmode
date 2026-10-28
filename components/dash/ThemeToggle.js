"use client";

import { useEffect, useState } from "react";

// Automatisk · Lyst · Mørkt. The choice lives in localStorage ("vd-theme" =
// "light" | "dark"; absent = follow the phone). Shell.js applies it before
// first paint; this only has to flip html[data-theme] when it changes.
const KEY = "vd-theme";
const OPTIONS = [
  ["auto", "Automatisk"],
  ["light", "Lyst"],
  ["dark", "Mørkt"],
];

export default function ThemeToggle() {
  const [theme, setTheme] = useState("auto");

  useEffect(() => {
    try {
      const stored = localStorage.getItem(KEY);
      if (stored === "light" || stored === "dark") setTheme(stored);
    } catch {
      // private mode or blocked storage: stay on automatic
    }
  }, []);

  const choose = (value) => {
    setTheme(value);
    try {
      if (value === "auto") localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, value);
    } catch {
      // the page still switches for this visit
    }
    const root = document.documentElement;
    if (value === "auto") delete root.dataset.theme;
    else root.dataset.theme = value;
    // The browser chrome (address bar) follows the theme-color metas; with a
    // forced theme both metas get that colour, on automatic they go back to
    // one colour per scheme.
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => {
      const dark = value === "dark" || (value === "auto" && (m.getAttribute("media") || "").includes("dark"));
      m.setAttribute("content", dark ? "#101A30" : "#ffffff");
    });
  };

  return (
    <div className="chips" role="group" aria-label="Utseende">
      {OPTIONS.map(([value, label]) => (
        <button key={value} type="button" className="chip" aria-pressed={theme === value} onClick={() => choose(value)}>
          {label}
        </button>
      ))}
    </div>
  );
}
