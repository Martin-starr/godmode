import { test } from "node:test";
import assert from "node:assert/strict";
import { usageCost, DEFAULT_MODEL, activeModel } from "../../lib/ai.js";

const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg}: ${a} vs ${b}`);

test("the default model is Haiku, not an Opus", () => {
  assert.equal(DEFAULT_MODEL, "claude-haiku-4-5");
  const saved = process.env.DASH_AI_MODEL;
  delete process.env.DASH_AI_MODEL;
  assert.equal(activeModel(), "claude-haiku-4-5");
  process.env.DASH_AI_MODEL = "claude-sonnet-5-5";
  assert.equal(activeModel(), "claude-sonnet-5-5");
  if (saved === undefined) delete process.env.DASH_AI_MODEL; else process.env.DASH_AI_MODEL = saved;
});

test("usageCost prices input and output per million tokens", () => {
  near(usageCost("claude-haiku-4-5", { input_tokens: 1e6 }), 1, "haiku in");
  near(usageCost("claude-haiku-4-5", { output_tokens: 1e6 }), 5, "haiku out");
  near(usageCost("claude-opus-4-8", { input_tokens: 1e6, output_tokens: 1e6 }), 30, "opus 4.8 in+out");
  near(usageCost("claude-opus-5-5", { input_tokens: 1e6, output_tokens: 1e6 }), 24, "opus 5.5 in+out");
});

test("one inbox triage call: about 4 cents on Opus 4.8, under 1 cent on Haiku", () => {
  const usage = { input_tokens: 2900, output_tokens: 1100 };
  near(usageCost("claude-opus-4-8", usage), 0.042, "opus triage");
  assert.ok(usageCost("claude-haiku-4-5", usage) < 0.01);
});

test("cache reads cost 10 %, cache writes 125 %, web searches a cent each", () => {
  near(usageCost("claude-haiku-4-5", { cache_read_input_tokens: 1e6 }), 0.1, "cache read");
  near(usageCost("claude-haiku-4-5", { cache_creation_input_tokens: 1e6 }), 1.25, "cache write");
  near(usageCost("claude-haiku-4-5", { server_tool_use: { web_search_requests: 3 } }), 0.03, "searches");
});

test("an unknown model is priced like Opus so the log never under-states a surprise", () => {
  near(usageCost("claude-mystery-9", { input_tokens: 1e6, output_tokens: 1e6 }), 30, "unknown");
  near(usageCost("claude-haiku-4-5"), 0, "no usage object");
});
