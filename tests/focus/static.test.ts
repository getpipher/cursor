import { test } from "node:test";
import assert from "node:assert/strict";
import { StaticFocusProvider } from "../../lib/focus/static.ts";

test("static always focused, start/stop are no-ops", async () => {
  const p = new StaticFocusProvider();
  let calls = 0;
  await p.start(() => calls++);
  assert.equal(p.name, "static");
  assert.equal(calls, 0); // never emits a change (always focused)
  await p.stop();
  assert.equal(calls, 0);
});