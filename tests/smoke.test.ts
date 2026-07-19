import { test } from "node:test";
import assert from "node:assert/strict";

// Smoke test — ensures `pnpm test:run` has something to run before Task 2.
test("smoke: package loads", () => {
  assert.equal(1 + 1, 2);
});