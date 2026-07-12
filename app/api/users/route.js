import { db } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { json, err, withWatchdog, guarded } from "@/lib/http";

export const runtime = "nodejs";
export const maxDuration = 15;
export const dynamic = "force-dynamic";

// Public: powers the user dropdown on the login screen.
export async function GET() {
  try {
    const sql = db();
    const rows = await withWatchdog(() => sql`select name from dash.team order by id`);
    return json(rows);
  } catch {
    return json([]);
  }
}

const ACCESS = ["Admin", "Redigering", "Kun lesing"];

const adminOnly = (user) => (user.access === "Admin" ? null : err("Kun administratorer kan endre teamet.", 403));

// Team management (Innstillinger → Team). Admin only.
export const POST = guarded(
  async (req, ctx, user) => {
    const denied = adminOnly(user);
    if (denied) return denied;
    const body = await req.json();
    const name = String(body.name || "").trim();
    const role = String(body.role || "").trim();
    const access = ACCESS.includes(body.access) ? body.access : "Kun lesing";
    const password = String(body.password || "");
    if (!name) return err("Navn må fylles ut.");
    if (password.length < 6) return err("Passord må ha minst 6 tegn.");
    const sql = db();
    const exists = await sql`select 1 from dash.team where lower(name) = lower(${name})`;
    if (exists.length) return err("Det finnes allerede et teammedlem som heter «" + name + "».");
    const rows = await sql`insert into dash.team (name, role, access, pw)
      values (${name}, ${role}, ${access}, ${hashPassword(password)})
      returning id, name, role, access`;
    return json(rows[0]);
  },
  { edit: true }
);

export const PUT = guarded(
  async (req, ctx, user) => {
    const denied = adminOnly(user);
    if (denied) return denied;
    const body = await req.json();
    const id = Number(body.id);
    const sql = db();
    const existing = (await sql`select id, name, access from dash.team where id = ${id}`)[0];
    if (!existing) return err("Fant ikke teammedlemmet.", 404);

    const name = String(body.name || existing.name).trim() || existing.name;
    const role = String(body.role ?? "");
    const access = ACCESS.includes(body.access) ? body.access : existing.access;

    // Never leave the team without an Admin who can manage it.
    if (existing.access === "Admin" && access !== "Admin") {
      const admins = await sql`select count(*)::int as n from dash.team where access = 'Admin'`;
      if (admins[0].n <= 1) return err("Kan ikke fjerne siste administrator.");
    }
    if (name !== existing.name) {
      const clash = await sql`select 1 from dash.team where lower(name) = lower(${name}) and id <> ${id}`;
      if (clash.length) return err("Navnet «" + name + "» er allerede i bruk.");
    }

    const password = String(body.password || "");
    if (password && password.length < 6) return err("Passord må ha minst 6 tegn.");

    const rows = password
      ? await sql`update dash.team set name = ${name}, role = ${role}, access = ${access}, pw = ${hashPassword(password)}
          where id = ${id} returning id, name, role, access`
      : await sql`update dash.team set name = ${name}, role = ${role}, access = ${access}
          where id = ${id} returning id, name, role, access`;
    return json(rows[0]);
  },
  { edit: true }
);

export const DELETE = guarded(
  async (req, ctx, user) => {
    const denied = adminOnly(user);
    if (denied) return denied;
    const body = await req.json().catch(() => ({}));
    const id = Number(body.id);
    const sql = db();
    const existing = (await sql`select id, name, access from dash.team where id = ${id}`)[0];
    if (!existing) return err("Fant ikke teammedlemmet.", 404);
    if (existing.name === user.name) return err("Du kan ikke slette deg selv.");
    if (existing.access === "Admin") {
      const admins = await sql`select count(*)::int as n from dash.team where access = 'Admin'`;
      if (admins[0].n <= 1) return err("Kan ikke slette siste administrator.");
    }
    await sql`delete from dash.team where id = ${id}`;
    return json({ ok: true });
  },
  { edit: true }
);
