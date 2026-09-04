// Service-account access tokens for the Google APIs, without a library.
//
// A service account is the right shape for a weekly job: no browser consent,
// no refresh token that expires when nobody logs in for 6 months. The JSON
// key lives in the GOOGLE_SERVICE_ACCOUNT_JSON secret; the account's e-mail
// is added as a user on the Search Console property and the GA4 property
// (SETUP-CHECKLIST.md trinn 1). Access comes from those two lists, not from
// any IAM role — a key alone reads nothing.
//
// The flow is RFC 7523: sign a JWT with the private key, exchange it at the
// token endpoint. node:crypto does RS256; nothing else is needed.
import crypto from "node:crypto";
import { postJson } from "./fetch.mjs";

const cache = new Map(); // scopes -> { token, exp }

function b64url(input) {
  return Buffer.from(input).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

export function googleConfigured() {
  return !!process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
}

export function serviceAccountEmail() {
  try { return JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON || "{}").client_email || null; } catch { return null; }
}

export async function accessToken(scopes) {
  const key = scopes.join(" ");
  const hit = cache.get(key);
  if (hit && hit.exp > Date.now() + 60000) return hit.token;

  let sa;
  try {
    sa = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  } catch {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON er ikke gyldig JSON.");
  }
  if (!sa.client_email || !sa.private_key) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON mangler client_email/private_key.");

  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(JSON.stringify({
    iss: sa.client_email,
    scope: key,
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  }));
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(header + "." + claims);
  const signature = b64url(signer.sign(sa.private_key));
  const assertion = header + "." + claims + "." + signature;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
    signal: AbortSignal.timeout(20000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    throw new Error("Google token-utveksling feilet (" + res.status + "): " + (data.error_description || data.error || "ukjent"));
  }
  cache.set(key, { token: data.access_token, exp: Date.now() + (data.expires_in || 3600) * 1000 });
  return data.access_token;
}

export async function googleJson(url, payload, scopes) {
  const token = await accessToken(scopes);
  return postJson(url, payload, { headers: { authorization: "Bearer " + token }, timeoutMs: 60000, gapMs: 200 });
}

export const SCOPE_GSC = ["https://www.googleapis.com/auth/webmasters.readonly"];
export const SCOPE_GA4 = ["https://www.googleapis.com/auth/analytics.readonly"];
