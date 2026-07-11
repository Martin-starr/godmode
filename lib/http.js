import { NextResponse } from "next/server";
import { currentUser, canEdit } from "./auth";
import { resetDb } from "./db";

export function json(data, status = 200) {
  return NextResponse.json(data, { status });
}

export function err(message, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

const WATCHDOG_MS = 12000;

// Runs work under a hard deadline. If the database stops answering (a wedged
// pooler connection), the caller gets a fast retryable error and the pool is
// dropped so the next request reconnects fresh instead of hanging forever.
export async function withWatchdog(work) {
  let timer;
  try {
    return await Promise.race([
      work(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("__watchdog__")), WATCHDOG_MS);
      }),
    ]);
  } catch (e) {
    if (e.message === "__watchdog__") {
      console.error("watchdog: database stopped answering — resetting pool");
      resetDb();
      const fail = new Error("Databasen svarte ikke — prøv igjen.");
      fail.retryable = true;
      throw fail;
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

// Wraps a handler with session + (optional) edit-permission checks, a
// stuck-query watchdog, and turns thrown errors into fast JSON failures.
// watchdog:false skips the 12s deadline on the handler itself (auth stays
// watchdogged) — for routes doing slow external calls (Claude API) that
// manage their own timeouts; tripping the watchdog would reset the DB pool
// for no reason.
export function guarded(handler, { edit = false, watchdog = true } = {}) {
  return async (req, ctx) => {
    let user;
    try {
      user = await withWatchdog(() => currentUser());
    } catch (e) {
      console.error("auth/db error:", e.message);
      return err("Databasen svarte ikke — prøv igjen.", 503);
    }
    if (!user) return err("Ikke innlogget", 401);
    if (edit && !canEdit(user)) return err("Du har ikke redigeringstilgang.", 403);
    try {
      return watchdog ? await withWatchdog(() => handler(req, ctx, user)) : await handler(req, ctx, user);
    } catch (e) {
      console.error(req.method, req.url, "failed:", e.message);
      return err(e.retryable ? e.message : "Noe gikk galt: " + e.message, e.retryable ? 503 : 500);
    }
  };
}
