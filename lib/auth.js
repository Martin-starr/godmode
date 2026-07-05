import crypto from "crypto";
import { cookies } from "next/headers";
import { db } from "./db";

const COOKIE = "dash_session";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

function secret() {
  const named = process.env.DASH_SESSION_SECRET || process.env.SESSION_SECRET || process.env.AUTH_SECRET;
  if (named) return named;
  // Deterministic fallback derived from secret material that is already in the
  // environment, so sessions survive redeploys without extra configuration.
  const seed = Object.values(process.env).find((v) => typeof v === "string" && /^postgres(ql)?:\/\//.test(v)) || "verminord-dash";
  return crypto.createHash("sha256").update("dash-session:" + seed).digest("hex");
}

function signPayload(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const mac = crypto.createHmac("sha256", secret()).update(body).digest("base64url");
  return body + "." + mac;
}

function verifyToken(token) {
  if (!token || !token.includes(".")) return null;
  const [body, mac] = token.split(".");
  const expected = crypto.createHmac("sha256", secret()).update(body).digest("base64url");
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString());
    if (!payload.name || !payload.exp || payload.exp < Date.now() / 1000) return null;
    return payload;
  } catch {
    return null;
  }
}

export function setSession(name) {
  const token = signPayload({ name, exp: Math.floor(Date.now() / 1000) + MAX_AGE });
  cookies().set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export function clearSession() {
  cookies().set(COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
}

// Returns { name, role, access } or null.
export async function currentUser() {
  const payload = verifyToken(cookies().get(COOKIE)?.value);
  if (!payload) return null;
  const sql = db();
  const rows = await sql`select name, role, access from dash.team where name = ${payload.name}`;
  return rows[0] || null;
}

export function canEdit(user) {
  return !!user && (user.access === "Admin" || user.access === "Redigering");
}

// --- Passwords -------------------------------------------------------------
// Stored format in dash.team.pw: "<salt-hex>:<hash-hex>" (32 + 1 + 64 chars).
// The original backend's exact KDF is not recoverable from the deployed
// artifacts, so verification tries every KDF that format can plausibly be,
// in order of likelihood. New hashes are always written as scrypt.
export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 32).toString("hex");
  return salt + ":" + hash;
}

export function verifyPassword(password, stored) {
  if (!stored || !stored.includes(":")) return false;
  const [salt, hash] = stored.split(":");
  const target = Buffer.from(hash, "hex");
  const candidates = [
    () => crypto.scryptSync(password, salt, 32),
    () => crypto.scryptSync(password, Buffer.from(salt, "hex"), 32),
    () => crypto.pbkdf2Sync(password, salt, 100000, 32, "sha256"),
    () => crypto.pbkdf2Sync(password, salt, 310000, 32, "sha256"),
    () => crypto.pbkdf2Sync(password, salt, 100000, 32, "sha512"),
    () => crypto.pbkdf2Sync(password, salt, 10000, 32, "sha256"),
    () => crypto.createHash("sha256").update(salt + password).digest(),
    () => crypto.createHash("sha256").update(password + salt).digest(),
    () => crypto.createHmac("sha256", salt).update(password).digest(),
  ];
  for (const make of candidates) {
    try {
      const candidate = make();
      if (candidate.length === target.length && crypto.timingSafeEqual(candidate, target)) return true;
    } catch {
      // ignore and try the next KDF
    }
  }
  return false;
}
