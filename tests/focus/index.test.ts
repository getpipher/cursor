import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { autoDetect } from "../../lib/focus/index.ts";

beforeEach(() => {
  delete process.env.TMUX_PANE;
  delete process.env.CMUX_SURFACE_ID;
  delete process.env.CMUX_SOCKET_PATH;
  delete process.env.HERDR_SOCKET_PATH;
  delete process.env.HERDR_SESSION;
});

test("no env → static", async () => {
  const p = await autoDetect(() => {});
  assert.equal(p.name, "static");
  await p.stop();
});

test("TMUX_PANE set → tmux (highest precedence)", async () => {
  process.env.TMUX_PANE = "%5";
  const p = await autoDetect(() => {});
  assert.equal(p.name, "tmux");
  await p.stop();
});

test("tmux wins over cmux when both envs set", async () => {
  process.env.TMUX_PANE = "%5";
  process.env.CMUX_SURFACE_ID = "surf-1";
  const p = await autoDetect(() => {});
  assert.equal(p.name, "tmux");
  await p.stop();
});

test("CMUX_SURFACE_ID + LIVE socket → cmux (before herdr)", async () => {
  const { listeningSocket } = await import("./helpers.ts");
  const s = await listeningSocket("idx-cmux");
  process.env.CMUX_SURFACE_ID = "surf-1";
  process.env.CMUX_SOCKET_PATH = s.path;
  const p = await autoDetect(() => {});
  assert.equal(p.name, "cmux");
  await p.stop();
  await s.close();
});

test("cmux wins over herdr when both detectable (live)", async () => {
  const { listeningSocket } = await import("./helpers.ts");
  const s = await listeningSocket("idx-cmux-over-herdr");
  process.env.CMUX_SURFACE_ID = "surf-1";
  process.env.CMUX_SOCKET_PATH = s.path;
  process.env.HERDR_SOCKET_PATH = s.path; // same live socket — herdr would also detect
  const p = await autoDetect(() => {});
  assert.equal(p.name, "cmux");
  await p.stop();
  await s.close();
});

test("herdr LIVE socket → herdr (when cmux not present)", async () => {
  const { listeningSocket } = await import("./helpers.ts");
  const s = await listeningSocket("idx-herdr");
  process.env.HERDR_SOCKET_PATH = s.path;
  const p = await autoDetect(() => {});
  assert.equal(p.name, "herdr");
  await p.stop();
  await s.close();
});

test("stale herdr socket file (no listener) → falls through to static", async () => {
  // Regression guard for the reported bug: a crashed herdr leaves its socket
  // file on disk; detect() must NOT mistake the leftover for a live server.
  const { staleSocketFile } = await import("./helpers.ts");
  const s = await staleSocketFile("idx-herdr-stale");
  process.env.HERDR_SOCKET_PATH = s.path;
  const p = await autoDetect(() => {});
  assert.equal(p.name, "static");
  await p.stop();
  await s.close();
});