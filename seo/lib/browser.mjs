// Headless Chromium, only where plain HTTP is not enough: the Meta Ad Library
// and Google's Ads Transparency Center render everything client-side, and a
// few shops ship the price in JavaScript. Playwright is imported lazily so a
// runner without the browser installed fails with a sentence instead of a
// stack trace, and the step that needed it reports "hoppet over".
import { deadline } from "./fetch.mjs";

const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36 VerminordSEO/1.0";

// Everything a page does is raced against a hard deadline (lib/fetch.mjs):
// if Chromium dies, Playwright's promises can hang with no live handle left,
// and the process exits mid-step instead of failing the one page.
export async function withBrowser(fn, { deadlineMs = 90000 } = {}) {
  let pw;
  try {
    pw = await import("playwright");
  } catch {
    throw new Error("Playwright er ikke installert (npx playwright install --with-deps chromium).");
  }
  const browser = await pw.chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      locale: "en-US",
      userAgent: UA,
      viewport: { width: 1280, height: 900 },
    });
    const page = await context.newPage();
    return await deadline(fn(page, context), deadlineMs, "nettleseren");
  } finally {
    await deadline(browser.close(), 15000, "lukking av nettleseren").catch(() => {});
  }
}

export async function renderHtml(url, { timeoutMs = 30000, settleMs = 1500 } = {}) {
  return withBrowser(async (page) => {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    await page.waitForTimeout(settleMs);
    return page.content();
  }, { deadlineMs: timeoutMs + settleMs + 30000 });
}
