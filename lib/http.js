import { NextResponse } from "next/server";
import { currentUser, canEdit } from "./auth";

export function json(data, status = 200) {
  return NextResponse.json(data, { status });
}

export function err(message, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

// Wraps a handler with session + (optional) edit-permission checks and turns
// thrown errors into fast JSON failures instead of hanging the function.
export function guarded(handler, { edit = false } = {}) {
  return async (req, ctx) => {
    let user;
    try {
      user = await currentUser();
    } catch (e) {
      console.error("auth/db error:", e.message);
      return err("Databasen svarte ikke — prøv igjen.", 503);
    }
    if (!user) return err("Ikke innlogget", 401);
    if (edit && !canEdit(user)) return err("Du har ikke redigeringstilgang.", 403);
    try {
      return await handler(req, ctx, user);
    } catch (e) {
      console.error(req.method, req.url, "failed:", e.message);
      return err("Noe gikk galt: " + e.message, 500);
    }
  };
}
