#!/usr/bin/env node
// Drives /api/ecowitt/backfill on the deployed site, one ≤7-day chunk per
// call, pausing between calls so the Ecowitt API never sees more than about
// one request every ten seconds.
//
//   CRON_SECRET=… npm run ecowitt:backfill -- --from 2026-09-15 [--to 2026-10-28] [--base https://dash.verminord.app]
//
// Idempotent: the route inserts only rows that are missing, so running it
// twice over the same window changes nothing.

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => {
    if (a.startsWith("--")) acc.push([a.slice(2), all[i + 1] && !all[i + 1].startsWith("--") ? all[i + 1] : "1"]);
    return acc;
  }, [])
);

const base = (args.base || process.env.DASH_BASE_URL || "https://dash.verminord.app").replace(/\/$/, "");
const secret = args.secret || process.env.CRON_SECRET;
const pauseMs = Number(args.pause || 10000);
const DATE = /^\d{4}-\d{2}-\d{2}$/;

if (!secret) {
  console.error("CRON_SECRET mangler (sett env-variabelen eller --secret).");
  process.exit(2);
}
if (!args.from || !DATE.test(args.from)) {
  console.error("Bruk: npm run ecowitt:backfill -- --from YYYY-MM-DD [--to YYYY-MM-DD]");
  process.exit(2);
}
if (args.to && !DATE.test(args.to)) {
  console.error("--to må være YYYY-MM-DD");
  process.exit(2);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// The route takes dates; a next_from instant is turned back into its Oslo date.
const osloDate = (iso) =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Oslo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));

let from = args.from;
const to = args.to || null;
let total = 0;
let calls = 0;

for (;;) {
  const url = new URL(base + "/api/ecowitt/backfill");
  url.searchParams.set("from", from);
  if (to) url.searchParams.set("to", to);
  calls++;
  const res = await fetch(url, { headers: { authorization: "Bearer " + secret } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.ok) {
    console.error(`Feil (${res.status}) på ${from}:`, body.error || body.message || JSON.stringify(body));
    if (res.status === 503 && calls < 20) {
      console.error("Prøver igjen om 20 s …");
      await sleep(20000);
      continue;
    }
    process.exit(1);
  }
  total += body.inserted;
  console.log(`${body.chunk.from.slice(0, 10)} → ${body.chunk.to.slice(0, 10)}: ${body.parsed} rader lest, ${body.inserted} nye (${body.ms} ms)`);
  if (body.done) break;
  from = osloDate(body.next_from);
  await sleep(pauseMs);
}
console.log(`Ferdig. ${total} nye rader i ${calls} kall.`);
