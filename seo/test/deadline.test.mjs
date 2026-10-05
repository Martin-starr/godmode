import { test } from "node:test";
import assert from "node:assert/strict";
import { deadline } from "../lib/fetch.mjs";

test("deadline() passes a settled value through and clears its timer", async () => {
  assert.equal(await deadline(Promise.resolve(42), 1000, "x"), 42);
  await assert.rejects(deadline(Promise.reject(new Error("boom")), 1000, "x"), /boom/);
});

test("deadline() rejects a promise that never settles, naming what stalled", async () => {
  const never = new Promise(() => {});
  await assert.rejects(deadline(never, 20, "https://example.test/"), /Tidsavbrudd \(0 s\) for https:\/\/example\.test\//);
});

test("STEP_TIMEOUT_MS defaults to 45 minutes and follows SEO_STEP_TIMEOUT_MIN", async () => {
  process.env.DASH_DATABASE_URL ||= "postgres://x:y@localhost:5432/test";
  const { STEP_TIMEOUT_MS } = await import("../lib/runs.mjs");
  assert.equal(STEP_TIMEOUT_MS, 45 * 60 * 1000);
});
