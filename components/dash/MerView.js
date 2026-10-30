"use client";

import Link from "next/link";
import { useState } from "react";
import { useApi, postJson } from "./api";
import Login from "./Login";
import ThemeToggle from "./ThemeToggle";
import s from "./MerView.module.css";

// The old dashboard's tabs, reachable at /gammel?view=KEY (full page load:
// the two apps never share a page).
const OLD_TABS = [
  ["brief", "Brief"],
  ["logg", "Logg"],
  ["systemer", "Systemer"],
  ["foring", "Fôring og batcher"],
  ["hygienisering", "Hygienisering"],
  ["innboks", "Innboks"],
  ["oppgaver", "Oppgaver"],
  ["prosjekter", "Prosjekter"],
  ["sop", "SOP og filer"],
  ["seo", "SEO"],
  ["innstillinger", "Innstillinger"],
];

export default function MerView() {
  const api = useApi("/api/v2/me");
  const [leaving, setLeaving] = useState(false);

  if (api.status === "auth") return <Login onLogin={() => api.reload()} />;
  if (api.status === "loading") return <p className="lead">Laster.</p>;

  const logout = async () => {
    if (leaving) return;
    setLeaving(true);
    await postJson("/api/logout", {});
    window.location.href = "/";
  };

  return (
    <div className="stack-l">
      <h1 className="h1"><span className="eyebrow" aria-hidden="true">Annet · Mer</span>Mer</h1>
      <hr className="rule desk-only" />

      <ul className="list">
        <Row href="/week/" external>Ukeplan</Row>
        <Row href="/mer/kanaler" sub="Hvilken sensor står i hvilket bed">Kanaler</Row>
      </ul>

      <section className="stack">
        <h2 className="h2">Gammelt dashbord</h2>
        <ul className="list">
          {OLD_TABS.map(([key, label]) => (
            <Row key={key} href={"/gammel?view=" + key} external>{label}</Row>
          ))}
        </ul>
      </section>

      <section className="stack">
        <h2 className="h2">Utseende</h2>
        <ThemeToggle />
        <p className="small desk-only">På stor skjerm betyr Automatisk lyst, som det gamle dashbordet.</p>
      </section>

      <section className="stack">
        {api.data ? (
          <p>Innlogget som {api.data.name}</p>
        ) : (
          <p className="notice error">
            {api.error} <button className="link" type="button" onClick={() => api.reload()}>Prøv igjen</button>
          </p>
        )}
        <button className="link" type="button" onClick={logout} disabled={leaving}>Logg ut</button>
      </section>
    </div>
  );
}

// One tappable row: the whole row is the link, never just the word.
function Row({ href, external, sub, children }) {
  const body = (
    <>
      <span>{children}</span>
      {sub ? <span className="small">{sub}</span> : null}
    </>
  );
  return (
    <li className={s.item}>
      {external ? <a href={href} className={s.row}>{body}</a> : <Link href={href} className={s.row}>{body}</Link>}
    </li>
  );
}
