import { test } from "node:test";
import assert from "node:assert/strict";

process.env.DASH_DATABASE_URL ||= "postgres://x:y@localhost:5432/test";
const { jsonb } = await import("../lib/db.mjs");

test("jsonb() tags a value as a jsonb parameter so postgres.js encodes it once", () => {
  const p = jsonb({ brief: { headline: "x" } });
  assert.equal(p.type, 3802);
  assert.deepEqual(p.value, { brief: { headline: "x" } });
  const a = jsonb([{ url: "https://verminord.no" }]);
  assert.equal(a.type, 3802);
  assert.deepEqual(a.value, [{ url: "https://verminord.no" }]);
});

test("jsonb() keeps SQL null as null", () => {
  assert.equal(jsonb(null), null);
  assert.equal(jsonb(undefined), null);
});

test("jsonb() serialises through the jsonb serializer exactly once", async () => {
  const postgres = (await import("postgres")).default;
  const { serializers } = postgres({ host: "localhost" }).options;
  assert.equal(serializers[3802](jsonb({ a: 1 }).value), '{"a":1}');
  assert.equal(serializers[3802]('{"a":1}'), '"{\\"a\\":1}"', "a pre-stringified value is what got double-encoded");
});
