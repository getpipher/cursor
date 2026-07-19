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

test("CMUX_SURFACE_ID + socket present → cmux (before herdr)", async () => {
  const { writeFileSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const sock = join(tmpdir(), "fake-cmux-cursor.sock");
  writeFileSync(sock, "");
  process.env.CMUX_SURFACE_ID = "surf-1";
  process.env.CMUX_SOCKET_PATH = sock;
  const p = await autoDetect(() => {});
  assert.equal(p.name, "cmux");
  await p.stop();
  rmSync(sock, { force: true });
});

test("cmux wins over herdr when both detectable", async () => {
  const { writeFileSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const sock = join(tmpdir(), "fake-cmux-over-herdr.sock");
  writeFileSync(sock, "");
  process.env.CMUX_SURFACE_ID = "surf-1";
  process.env.CMUX_SOCKET_PATH = sock;
  process.env.HERDR_SOCKET_PATH = sock; // same fake socket — herdr would also detect
  const p = await autoDetect(() => {});
  assert.equal(p.name, "cmux");
  await p.stop();
  rmSync(sock, { force: true });
});

test("herdr socket env → herdr (when cmux not present)", async () => {
  // herdr's detect() checks socket existence; point it at a real file so detect passes.
  const { writeFileSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const sock = join(tmpdir(), "fake-herdr-cursor.sock");
  writeFileSync(sock, "");
  process.env.HERDR_SOCKET_PATH = sock;
  const p = await autoDetect(() => {});
  assert.equal(p.name, "herdr");
  await p.stop();
  rmSync(sock, { force: true });
});