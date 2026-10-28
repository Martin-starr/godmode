import { db } from "@/lib/db";
import { json, err, guarded } from "@/lib/http";
import { listSystems, logOut } from "@/lib/v2";
import { isoDateOslo } from "@/lib/time";

export const runtime = "nodejs";
export const maxDuration = 20;
export const dynamic = "force-dynamic";

const ALL = "Alle";
const RECENT = 10;
const NOTES_MAX = 2000;

// The Logg page in one round trip: the systems to pick from (active, in
// sort order) and the ten newest manual entries from every source. A row
// written here can be undone for ten minutes; the flag is computed on the
// database clock so the page and the delete route always agree.
export const GET = guarded(async () => {
  const sql = db();
  const systems = await listSystems(sql);
  const rows = await sql`select id, system, date, logged_at, created_at, temperature, ph, moisture, moisture_handheld,
      feed_amount_liters, harvest_liters, notes, created_by, source,
      coalesce(source = 'mobil-v2' and logged_at > now() - interval '10 minutes', false) as deletable
    from public.logs
    order by logged_at desc nulls last, created_at desc
    limit ${RECENT}`;
  return json({
    systems: systems.map((s) => ({ id: s.id, name: s.name, category: s.category })),
    recent: rows.map((r) => ({ ...logOut(r), deletable: !!r.deletable })),
    server_time: new Date().toISOString(),
  });
});

// "7,1" | "7.1" | 7.1 → 7.1; blank → null; anything else → NaN.
function num(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : NaN;
  const s = String(v).trim().replace(",", ".");
  if (!s) return null;
  if (!/^-?(\d+\.?\d*|\.\d+)$/.test(s)) return NaN;
  return Number(s);
}

// null passes (nothing typed); otherwise the number must sit in [lo, hi]
// or [lo, hi) when hiOpen.
const inRange = (x, lo, hi, hiOpen = false) =>
  x === null || (Number.isFinite(x) && x >= lo && (hiOpen ? x < hi : x <= hi));

// One entry for one system, or the same feeding for every active system.
export const POST = guarded(async (req, ctx, user) => {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return err("Ugyldig forespørsel.");

  const system = String(body.system || "").trim();
  let ph = num(body.ph);
  const moisture = num(body.moisture_handheld);
  const feed = num(body.feed_liters);
  const harvest = num(body.harvest_liters);
  const notes = body.notes == null ? "" : String(body.notes).trim();

  if (!inRange(ph, 0, 14)) return err("pH må være et tall mellom 0 og 14.");
  if (!inRange(moisture, 0, 100)) return err("Fukt må være et tall mellom 0 og 100.");
  if (!inRange(feed, 0, 10000, true)) return err("Fôring må være et tall mellom 0 og 10 000 liter.");
  if (!inRange(harvest, 0, 10000, true)) return err("Høsting må være et tall mellom 0 og 10 000 liter.");
  if (notes.length > NOTES_MAX) return err(`Notatet kan ha høyst ${NOTES_MAX} tegn.`);
  if (ph === null && moisture === null && feed === null && harvest === null && !notes) {
    return err("Skriv inn minst én verdi eller et notat.");
  }
  if (ph !== null) ph = Math.round(ph * 10) / 10;

  const sql = db();
  const systems = await listSystems(sql);
  let targets;
  if (system === ALL) {
    if (ph !== null || moisture !== null || harvest !== null) return err("Med Alle kan du bare logge fôring og notat.");
    targets = systems;
  } else {
    const hit = systems.find((s) => s.name === system);
    if (!hit) return err("Velg et aktivt system.");
    targets = [hit];
  }
  if (!targets.length) return err("Ingen aktive systemer.");

  const now = new Date();
  const rows = targets.map((s) => ({
    system: s.name,
    date: isoDateOslo(now),
    logged_at: now,
    created_by: user.name,
    source: "mobil-v2",
    temperature: null,
    ph,
    moisture, // the old column, kept in sync so /gammel still shows it
    moisture_handheld: moisture,
    feed_amount_liters: feed,
    harvest_liters: harvest,
    notes: notes || null,
  }));
  // One statement for all rows: an "Alle" feeding lands for every system or for none.
  const inserted = await sql`insert into public.logs ${sql(rows, "system", "date", "logged_at", "created_by", "source",
      "temperature", "ph", "moisture", "moisture_handheld", "feed_amount_liters", "harvest_liters", "notes")}
    returning id, system, date, logged_at, created_at, temperature, ph, moisture, moisture_handheld,
      feed_amount_liters, harvest_liters, notes, created_by, source`;

  return json({ ok: true, rows: inserted.map(logOut), count: inserted.length, at: now.toISOString() });
}, { edit: true });
