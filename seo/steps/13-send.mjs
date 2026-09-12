// Step 13 — the Monday e-mail, through Resend like the watchdog.
//
// Same sender as the alerts (ALERT_FROM, defaulting to Resend's onboarding
// address until verminord.no is verified in Resend), different recipient
// variable (SEO_BRIEF_EMAIL) so the brief can go to Martin while alerts keep
// going wherever they go today. HTML is inline-styled and narrow — this is
// read on a phone — and the plain-text part is the markdown itself.
import { sql } from "../lib/db.mjs";
import { pulse } from "../lib/pulse.mjs";
import { weekNumber } from "../lib/dates.mjs";
import { truncate } from "../lib/text.mjs";

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const NAVY = "#1B2B4A", GOLD = "#C9A84C", CREAM = "#FCFAF5", MUTED = "#6B6F62";

export function renderHtml(week, b, dashUrl) {
  const wk = weekNumber(week);
  const h2 = (t) => `<h2 style="font-size:15px;margin:22px 0 8px;color:${NAVY};letter-spacing:.02em">${esc(t)}</h2>`;
  const li = (items, f) => items.length ? `<ul style="padding-left:18px;margin:0">${items.map((x) => `<li style="margin:0 0 6px">${f(x)}</li>`).join("")}</ul>` : `<p style="margin:0;color:${MUTED}">Ingenting denne uka.</p>`;
  const rows = (b.numbers || []).map((n) => `<tr><td style="padding:6px 8px 6px 0;color:${MUTED}">${esc(n.label)}</td><td style="padding:6px 8px;font-variant-numeric:tabular-nums"><b>${esc(n.now)}</b></td><td style="padding:6px 8px;font-variant-numeric:tabular-nums">${esc(n.prev)}</td><td style="padding:6px 0 6px 8px;font-variant-numeric:tabular-nums;color:${MUTED}">${esc(n.base)}</td></tr>`).join("");
  return `<!doctype html><html lang="no"><body style="margin:0;background:${CREAM};font-family:-apple-system,'IBM Plex Sans',Segoe UI,Helvetica,Arial,sans-serif;color:${NAVY};font-size:15px;line-height:1.5">
<div style="max-width:600px;margin:0 auto;padding:24px 18px 40px">
  <div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:${MUTED}">Verminord · SEO-brief · uke ${wk}</div>
  <div style="border-left:4px solid ${GOLD};padding:10px 14px;margin:12px 0 4px;font-size:17px;font-weight:600">${esc(b.headline)}</div>
  ${h2("Tallene")}
  <table style="border-collapse:collapse;width:100%;font-size:14px"><thead><tr><th></th><th style="text-align:left;padding:0 8px;font-weight:500;color:${MUTED};font-size:12px">Denne uka</th><th style="text-align:left;padding:0 8px;font-weight:500;color:${MUTED};font-size:12px">Forrige</th><th style="text-align:left;padding:0 0 0 8px;font-weight:500;color:${MUTED};font-size:12px">4 uker</th></tr></thead><tbody>${rows}</tbody></table>
  ${h2("Bevegelser")}${li(b.movements || [], esc)}
  ${h2("Muligheter")}${li(b.opportunities || [], (o) => `<b>${esc(o.query)}</b> — ${esc(o.page)}: ${esc(o.action)}`)}
  ${h2("Konkurrenter")}${li(b.competitors || [], esc)}
  ${h2("AI-synlighet")}<p style="margin:0">${esc(b.ai_visibility)}</p>
  ${h2("Nyheter og regelverk")}${li(b.news || [], (n) => `<b>${esc(n.title)}</b> — ${esc(n.why)}`)}
  ${h2("Leads")}${li(b.leads || [], (l) => `<b>${esc(l.name)}</b> — ${esc(l.why)}`)}
  ${(b.technical || []).length ? h2("Teknisk") + li(b.technical, esc) : ""}
  ${h2("Tre innholdsgrep")}<ol style="padding-left:18px;margin:0">${(b.content_moves || []).map((m) => `<li style="margin:0 0 10px"><b>${esc(m.title)}</b> <span style="color:${MUTED}">(${esc(m.keyword)})</span><br>${esc(m.angle)}<br><span style="color:${MUTED}">Side: ${esc(m.page)} · Hvorfor nå: ${esc(m.why_now)}</span></li>`).join("")}</ol>
  ${h2("Neste fire uker")}${li(b.next_weeks || [], esc)}
  <div style="margin:28px 0 0"><a href="${esc(dashUrl)}" style="display:inline-block;background:${NAVY};color:${CREAM};text-decoration:none;padding:12px 18px;border-radius:4px;font-weight:600">Åpne i dashbordet</a></div>
  <p style="color:${MUTED};font-size:13px;margin:18px 0 0">Blogg-utkastet «${esc(b.blog_draft?.title || "")}» ligger under SEO → Innhold. Alt dette er generert automatisk mandag natt; tallene kommer fra Search Console, GA4, Serper, Brønnøysund og AI-motorene, teksten fra Claude.</p>
</div></body></html>`;
}

export async function run(ctx) {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.SEO_BRIEF_EMAIL;
  if (!apiKey || !to) return { skipped: "RESEND_API_KEY eller SEO_BRIEF_EMAIL mangler" };
  const db = ctx.dryRun ? null : sql();
  if (!db) return { skipped: "Sending krever database (ikke tilgjengelig i --dry-run)" };

  const [row] = await db`select summary_md, brief, sent_at from seo.briefs where week = ${ctx.week}`;
  if (!row?.summary_md) throw new Error("Ingen brief for uke " + ctx.week + " — kjør steget brief først.");
  if (row.sent_at && !ctx.resend) {
    ctx.log("send", "allerede sendt " + new Date(row.sent_at).toISOString() + " (bruk --resend for å sende igjen)");
    return { already_sent: 1 };
  }
  const b = row.brief?.brief || {};
  const from = process.env.ALERT_FROM || "Verminord <onboarding@resend.dev>";
  const dashUrl = (process.env.DASH_BASE_URL || "https://dash.verminord.app").replace(/\/$/, "") + "/?view=seo";
  const subject = `SEO-brief uke ${weekNumber(ctx.week)} — ${truncate(b.headline || "ukens tall", 80)}`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: "Bearer " + apiKey, "content-type": "application/json" },
    body: JSON.stringify({ from, to: [to], subject, html: renderHtml(ctx.week, b, dashUrl), text: row.summary_md }),
    signal: AbortSignal.timeout(30000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error("Resend svarte " + res.status + ": " + (body.message || JSON.stringify(body)).slice(0, 300));

  await db`update seo.briefs set sent_at = now(), email_id = ${body.id || null} where week = ${ctx.week}`;
  await pulse(ctx, { source: "send", kind: "brief", severity: "info", title: `Ukesbrief sendt til ${to}`, body: subject });
  return { sent: 1, id: body.id || null };
}
