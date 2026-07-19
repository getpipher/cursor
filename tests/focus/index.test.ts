import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { autoDetect } from "../../lib/focus/index.ts";

beforeEach(() => {
  delete process.env.TMUX_PANE;
  delete process.env.HERDR_SOCKET_PATH;
  delete process.env.HERDR_SESSION;
});

test("no env → static", async () => {
  const p = await autoDetect(() => {});
  assert.equal(p.name, "static");
  await p.stop();
});

test("TMUX_PANE set → tmux", async () => {
  process.env.TMUX_PANE = "%5";
  const p = await autoDetect(() => {});
  assert.equal(p.name, "tmux");
  await p.stop();
});

test("herdr socket env → herdr (when detect() true)", async () => {
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