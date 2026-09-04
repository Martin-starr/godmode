// Årshjul: plain CRUD. Rows carry a concrete year; recurring rows are
// shifted to the displayed year by the client and by the analysis step.
import { db } from "@/lib/db";
import { json, err, guarded } from "@/lib/http";

export const runtime = "nodejs";
export const maxDuration = 15;
export const dynamic = "force-dynamic";

const KINDS = ["sesong", "kampanje", "frist", "hendelse"];
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ""));

export const GET = guarded(async () => {
  const rows = await db()`select id, title, kind, starts_on, ends_on, note, recurring_yearly, sort from seo.calendar order by sort, starts_on`;
  return json({ items: rows });
});

export const POST = guarded(async (req) => {
  const b = await req.json().catch(() => ({}));
  const title = String(b.title || "").trim();
  if (!title) return err("Skriv inn en tittel.");
  if (!isDate(b.starts_on)) return err("Startdato må være ÅÅÅÅ-MM-DD.");
  if (b.ends_on && !isDate(b.ends_on)) return err("Sluttdato må være ÅÅÅÅ-MM-DD.");
  const kind = KINDS.includes(b.kind) ? b.kind : "hendelse";
  const [row] = await db()`insert into seo.calendar (title, kind, starts_on, ends_on, note, recurring_yearly, sort)
    values (${title}, ${kind}, ${b.starts_on}, ${b.ends_on || null}, ${b.note || null}, ${b.recurring_yearly !== false}, ${Number(b.sort) || 0}) returning *`;
  return json(row);
}, { edit: true });

export const PUT = guarded(async (req) => {
  const b = await req.json().catch(() => ({}));
  const id = Number(b.id);
  if (!id) return err("Mangler id.");
  if (b.starts_on && !isDate(b.starts_on)) return err("Startdato må være ÅÅÅÅ-MM-DD.");
  if (b.ends_on && !isDate(b.ends_on)) return err("Sluttdato må være ÅÅÅÅ-MM-DD.");
  const [orig] = await db()`select * from seo.calendar where id = ${id}`;
  if (!orig) return err("Fant ikke raden.", 404);
  const next = {
    title: b.title !== undefined ? String(b.title).trim() : orig.title,
    kind: KINDS.includes(b.kind) ? b.kind : orig.kind,
    starts_on: b.starts_on || orig.starts_on,
    ends_on: b.ends_on !== undefined ? b.ends_on || null : orig.ends_on,
    note: b.note !== undefined ? b.note || null : orig.note,
    recurring_yearly: typeof b.recurring_yearly === "boolean" ? b.recurring_yearly : orig.recurring_yearly,
    sort: b.sort !== undefined ? Number(b.sort) || 0 : orig.sort,
  };
  const [row] = await db()`update seo.calendar set title = ${next.title}, kind = ${next.kind}, starts_on = ${next.starts_on}, ends_on = ${next.ends_on},
    note = ${next.note}, recurring_yearly = ${next.recurring_yearly}, sort = ${next.sort} where id = ${id} returning *`;
  return json(row);
}, { edit: true });

export const DELETE = guarded(async (req) => {
  const b = await req.json().catch(() => ({}));
  const id = Number(b.id);
  if (!id) return err("Mangler id.");
  await db()`delete from seo.calendar where id = ${id}`;
  return json({ ok: true });
}, { edit: true });
