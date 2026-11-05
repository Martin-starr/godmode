"use client";

import { useEffect } from "react";

// The two things the page needs a browser for: printing, and reloading
// itself on a wall screen (?tv=1) every five minutes.
export default function StatusTools({ tv }) {
  useEffect(() => {
    if (!tv) return;
    const id = setTimeout(() => window.location.reload(), 5 * 60000);
    return () => clearTimeout(id);
  }, [tv]);
  return (
    <button type="button" className="st-btn" onClick={() => window.print()}>Skriv ut</button>
  );
}
