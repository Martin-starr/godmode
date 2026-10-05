// HTTP for the collectors: timeout, retry, a real User-Agent, and a
// politeness delay per host.
//
// Why the delay: the competitor step fetches a handful of pages from each
// shop every week. One request a second from an identified agent is what a
// polite crawler does; a burst is what gets an IP blocked, and a blocked IP
// looks exactly like "the product went away". Being slow is cheaper than
// being wrong.
const UA = "VerminordSEO/1.0 (+https://verminord.no; weekly, low volume)";

// A hard deadline with a timer that keeps the event loop alive.
//
// Why this exists next to AbortSignal.timeout: that signal's timer is unref'd
// by design, so it never keeps the process running. When a socket dies without
// an error the fetch promise simply never settles, nothing else is pending,
// and Node exits with code 13 ("unsettled top-level await") in the middle of
// a step — which is how the W41 run died after 32 minutes in the competitor
// crawl. Racing against a referenced timer turns that silent exit into an
// ordinary rejection the retry loop and the step runner can handle.
export function deadline(promise, ms, what = "operasjonen") {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Tidsavbrudd (${Math.round(ms / 1000)} s) for ${what}`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
const lastHit = new Map();

async function polite(url, minGapMs) {
  let host = "";
  try { host = new URL(url).host; } catch { return; }
  const prev = lastHit.get(host) || 0;
  const wait = prev + minGapMs - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastHit.set(host, Date.now());
}

export async function request(url, { method = "GET", headers = {}, body, timeoutMs = 20000, retries = 2, gapMs = 1200, expect = "text", redirect = "follow" } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    await polite(url, gapMs);
    try {
      // Headers and body each get the caller's timeout, plus a hard ceiling
      // (see deadline()) so a dead socket cannot stall the whole run.
      const res = await deadline(fetch(url, {
        method,
        headers: { "user-agent": UA, accept: expect === "json" ? "application/json" : "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8", ...headers },
        body,
        redirect,
        signal: AbortSignal.timeout(timeoutMs),
      }), timeoutMs + 5000, url);
      if ((res.status === 429 || res.status >= 500) && attempt < retries) {
        const ra = Number(res.headers.get("retry-after"));
        await new Promise((r) => setTimeout(r, Math.min((ra || 2 * (attempt + 1)) * 1000, 15000)));
        continue;
      }
      const text = await deadline(res.text(), timeoutMs + 5000, url);
      return { ok: res.ok, status: res.status, url: res.url, headers: res.headers, text, json: () => JSON.parse(text) };
    } catch (e) {
      lastErr = e;
      if (attempt < retries) await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    }
  }
  throw new Error("Nettverksfeil mot " + url + ": " + (lastErr?.message || "ukjent"));
}

export async function getText(url, opts = {}) {
  const r = await request(url, opts);
  if (!r.ok) throw new Error("HTTP " + r.status + " fra " + url);
  return r.text;
}

export async function getJson(url, opts = {}) {
  const r = await request(url, { ...opts, expect: "json" });
  if (!r.ok) throw new Error("HTTP " + r.status + " fra " + url + ": " + r.text.slice(0, 200));
  return r.json();
}

export async function postJson(url, payload, { headers = {}, timeoutMs = 30000, retries = 2, gapMs = 300 } = {}) {
  const r = await request(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(payload),
    timeoutMs, retries, gapMs, expect: "json",
  });
  if (!r.ok) throw new Error("HTTP " + r.status + " fra " + url + ": " + r.text.slice(0, 300));
  return r.json();
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
