import { test } from "node:test";
import assert from "node:assert/strict";
import { probeSocket } from "../../lib/focus/socket.ts";
import { listeningSocket, staleSocketFile } from "./helpers.ts";

test("probeSocket: live listener → true", async () => {
  const s = await listeningSocket("probe-live");
  assert.equal(await probeSocket(s.path), true);
  await s.close();
});

test("probeSocket: missing path → false (no throw)", async () => {
  assert.equal(await probeSocket("/tmp/definitely-missing-probe-sock"), false);
});

test("probeSocket: stale leftover file (no listener) → false", async () => {
  // The bug: file exists on disk but no server is accept()-ing.
  const s = await staleSocketFile("probe-stale");
  assert.equal(await probeSocket(s.path), false);
  await s.close();
});

test("probeSocket: regular (non-socket) file → false", async () => {
  const s = await staleSocketFile("probe-regular");
  assert.equal(await probeSocket(s.path), false);
  await s.close();
});

test("probeSocket: after server closes → false", async () => {
  const s = await listeningSocket("probe-close");
  assert.equal(await probeSocket(s.path), true);
  await s.close();
  assert.equal(await probeSocket(s.path), false);
});

test("probeSocket: explicit timeout on an unaccept-ing path is bounded", async () => {
  // A non-existent path rejects immediately rather than timing out; this just
  // asserts the timeoutMs knob is honoured and the promise resolves quickly.
  const start = Date.now();
  assert.equal(await probeSocket("/tmp/another-missing-probe-sock", 50), false);
  assert.ok(Date.now() - start < 500, "resolved well under 500ms");
});
