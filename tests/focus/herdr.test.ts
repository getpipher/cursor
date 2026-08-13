import { test } from "node:test";
import assert from "node:assert/strict";
import { HerdrFocusProvider, type HerdrSocket, type SocketFactory } from "../../lib/focus/herdr.ts";

// Mock socket: captures sent lines, feeds queued inbound lines to the handler.
function mockSocket() {
  let onLine: (line: string) => void = () => {};
  const sent: string[] = [];
  const socket: HerdrSocket = {
    send: (line: string) => sent.push(line),
    onMessage: (cb) => {
      onLine = cb;
    },
    close: async () => {},
  };
  return {
    factory: async () => socket,
    feed: (line: string) => onLine(line),
    sent,
  };
}

test("start sends session.snapshot and events.subscribe", async () => {
  process.env.HERDR_PANE_ID = "w1:p1";
  const m = mockSocket();
  const p = new HerdrFocusProvider(() => {}, { socket: m.factory, socketPath: "/tmp/x" });
  await p.start();
  assert.ok(m.sent.some((s) => s.includes('"method":"session.snapshot"')), "snapshot sent");
  assert.ok(m.sent.some((s) => s.includes('"method":"events.subscribe"')), "subscribe sent");
  await p.stop();
});

test("snapshot with our pane focused → onChange not fired (already focused)", async () => {
  process.env.HERDR_PANE_ID = "w1:p1";
  const m = mockSocket();
  let last: boolean | undefined;
  const p = new HerdrFocusProvider((f) => { last = f; }, { socket: m.factory, socketPath: "/tmp/x" });
  await p.start();
  m.feed(JSON.stringify({ id: "snap", result: { focused_pane_id: "w1:p1" } }));
  assert.equal(last, undefined); // already focused, no change
  await p.stop();
});

test("focus-out event (focused pane != ours) → onChange(false); then back → onChange(true)", async () => {
  process.env.HERDR_PANE_ID = "w1:p1";
  const m = mockSocket();
  let last: boolean | undefined;
  const p = new HerdrFocusProvider((f) => { last = f; }, { socket: m.factory, socketPath: "/tmp/x" });
  await p.start();
  m.feed(JSON.stringify({ id: "snap", result: { focused_pane_id: "w1:p1" } }));
  // focus moved to another pane
  m.feed(JSON.stringify({ id: "evt", event: { type: "pane.focus.changed", focused_pane_id: "w1:p2" } }));
  assert.equal(last, false);
  // focus back to us
  m.feed(JSON.stringify({ id: "evt2", event: { type: "pane.focus.changed", focused_pane_id: "w1:p1" } }));
  assert.equal(last, true);
  await p.stop();
});

test("detect() = false when socket file missing", async () => {
  delete process.env.HERDR_SOCKET_PATH;
  delete process.env.HERDR_SESSION;
  assert.equal(await HerdrFocusProvider.detect("/tmp/definitely-missing-herdr-sock"), false);
});

test("detect() = false when a stale leftover socket file is present (no listener)", async () => {
  const { staleSocketFile } = await import("./helpers.ts");
  const s = await staleSocketFile("herdr-stale");
  assert.equal(await HerdrFocusProvider.detect(s.path), false);
  await s.close();
});

test("detect() = true when a live socket is listening", async () => {
  const { listeningSocket } = await import("./helpers.ts");
  const s = await listeningSocket("herdr-live");
  assert.equal(await HerdrFocusProvider.detect(s.path), true);
  await s.close();
});

test("start swallows connect failure (stale/explicit dead socket) → no throw, no onChange", async () => {
  // Explicit `/cursor provider herdr` against a dead socket must degrade to
  // always-focused rather than breaking session_start with ECONNREFUSED.
  process.env.HERDR_PANE_ID = "w1:p1";
  const failingSocket: { socket: SocketFactory; socketPath: string } = {
    socket: async () => {
      throw new Error("connect ECONNREFUSED /path/to/herdr.sock");
    },
    socketPath: "/path/to/herdr.sock",
  };
  let last: boolean | undefined;
  const p = new HerdrFocusProvider((f) => {
    last = f;
  }, failingSocket);
  await p.start(); // must not throw
  assert.equal(last, undefined); // stayed focused=true, no onChange
  await p.stop();
});

test("no our-pane-id env → falls back to snapshot focused_pane_id as our pane (assume focused at start)", async () => {
  delete process.env.HERDR_PANE_ID;
  const m = mockSocket();
  let last: boolean | undefined;
  const p = new HerdrFocusProvider((f) => { last = f; }, { socket: m.factory, socketPath: "/tmp/x" });
  await p.start();
  m.feed(JSON.stringify({ id: "snap", result: { focused_pane_id: "w1:p1" } }));
  assert.equal(last, undefined); // we adopted w1:p1 as ours → focused, no change
  m.feed(JSON.stringify({ id: "evt", event: { type: "pane.focus.changed", focused_pane_id: "w1:p2" } }));
  assert.equal(last, false);
  await p.stop();
});