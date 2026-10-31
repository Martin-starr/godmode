"use client";

import { useEffect, useState } from "react";
import AnleggView from "./AnleggView";

// The home page. On a computer (≥ 1024 px) the full dashboard with Brief,
// charts and the sidebar is the start page, so the browser goes straight
// there. Phones and tablets get the Anlegg cards. Nothing is drawn until
// the screen size is known, so a computer never flashes the phone page.
// The new Anlegg page stays reachable on a computer at /anlegg.
export const DESKTOP_HOME = "/oversikt";

export default function HomeGate() {
  const [phone, setPhone] = useState(false);
  useEffect(() => {
    const desk = window.matchMedia && window.matchMedia("(min-width: 1024px)").matches;
    if (desk) window.location.replace(DESKTOP_HOME);
    else setPhone(true);
  }, []);
  return phone ? <AnleggView /> : null;
}
