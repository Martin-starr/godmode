import { db } from "@/lib/db";
import { json, err, guarded } from "@/lib/http";

export const runtime = "nodejs";
export const maxDuration = 15;
export const dynamic = "force-dynamic";

const CLUSTERS = ["merke", "produkt", "bruk", "kunnskap", "lokal"];

export const POST = guarded(async (req) => {
  const b = await req.json().catch(() => ({}));
  const keyword = String(b.keyword || "").trim();
  if (!keyword) return err("Skriv inn et søkeord.");
  const cluster = CLUSTERS.includes(b.cluster) ? b.cluster : "produkt";
  const priority = [1, 2, 3].includes(Number(b.priority)) ? Number(b.priority) : 2;
  const [row] = await db()`insert into seo.keywords (keyword, cluster, priority) values (${keyword}, ${cluster}, ${priority})
    on conflict (keyword) do update set cluster = excluded.cluster, priority = excluded.priority, active = true
    returning keyword, cluster, priority, active`;
  return json(row);
}, { edit: true });

export const PUT = guarded(async (req) => {
  const b = await req.json().catch(() => ({}));
  if (!b.keyword) return err("Mangler søkeord.");
  const [row] = await db()`update seo.keywords set active = ${!!b.active} where keyword = ${b.keyword} returning keyword, cluster, priority, active`;
  if (!row) return err("Fant ikke søkeordet.", 404);
  return json(row);
}, { edit: true });

export const DELETE = guarded(async (req) => {
  const b = await req.json().catch(() => ({}));
  if (!b.keyword) return err("Mangler søkeord.");
  await db()`delete from seo.keywords where keyword = ${b.keyword}`;
  return json({ ok: true });
}, { edit: true });
