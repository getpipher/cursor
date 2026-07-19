import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { CmuxFocusProvider, type CmuxRpc, type RpcFactory } from "../../lib/focus/cmux.ts";

// Mock RPC: records calls, returns a configurable `focused` for is_focused.
function mockRpc(initialFocused = true) {
  const calls: { method: string; params: Record<string, unknown> }[] = [];
  let focused = initialFocused;
  let throwNext = false;
  const rpc: CmuxRpc = {
    call: async (method, params) => {
      calls.push({ method, params });
      if (throwNext) {
        throwNext = false;
        throw new Error("boom");
      }
      if (method === "debug.terminal.is_focused") return { focused };
      if (method === "system.ping") return { pong: true };
      return {};
    },
    close: async () => {},
  };
  return {
    factory: async () => rpc,
    setFocused: (f: boolean) => {
      focused = f;
    },
    throwNext: () => {
      throwNext = true;
    },
    calls,
  };
}

beforeEach(() => {
  delete process.env.CMUX_SURFACE_ID;
  delete process.env.CMUX_SOCKET_PATH;
});

test("start with CMUX_SURFACE_ID snapshots is_focused → onChange(false) when not focused", async () => {
  process.env.CMUX_SURFACE_ID = "surf-1";
  const m = mockRpc(false);
  let last: boolean | undefined;
  const p = new CmuxFocusProvider((f) => {
    last = f;
  }, { rpc: m.factory, pollMs: 1e9 });
  await p.start();
  assert.equal(m.calls.length, 1);
  assert.equal(m.calls[0]?.method, "debug.terminal.is_focused");
  assert.equal(m.calls[0]?.params.surface_id, "surf-1");
  assert.equal(last, false);
  await p.stop();
});

test("start when already focused → no onChange (default true, no flip)", async () => {
  process.env.CMUX_SURFACE_ID = "surf-1";
  const m = mockRpc(true);
  let last: boolean | undefined;
  const p = new CmuxFocusProvider((f) => {
    last = f;
  }, { rpc: m.factory, pollMs: 1e9 });
  await p.start();
  assert.equal(last, undefined);
  await p.stop();
});

test("poll detects focus change → onChange(false) then onChange(true)", async () => {
  process.env.CMUX_SURFACE_ID = "surf-1";
  const m = mockRpc(true);
  let last: boolean | undefined;
  const p = new CmuxFocusProvider((f) => {
    last = f;
  }, { rpc: m.factory, pollMs: 1e9 });
  await p.start();
  assert.equal(last, undefined);
  m.setFocused(false);
  await p.poll();
  assert.equal(last, false);
  m.setFocused(true);
  await p.poll();
  assert.equal(last, true);
  await p.stop();
});

test("poll with unchanged focus → no onChange", async () => {
  process.env.CMUX_SURFACE_ID = "surf-1";
  const m = mockRpc(true);
  let count = 0;
  const p = new CmuxFocusProvider(() => {
    count++;
  }, { rpc: m.factory, pollMs: 1e9 });
  await p.start();
  await p.poll();
  await p.poll();
  assert.equal(count, 0);
  await p.stop();
});

test("no CMUX_SURFACE_ID → start is a no-op (no rpc, no throw)", async () => {
  const m = mockRpc();
  const p = new CmuxFocusProvider(() => {}, { rpc: m.factory, pollMs: 1e9 });
  await p.start();
  assert.equal(m.calls.length, 0);
  await p.stop();
});

test("start swallows connect failure → degrades to always-focused (no throw)", async () => {
  process.env.CMUX_SURFACE_ID = "surf-1";
  let last: boolean | undefined;
  const failingFactory: RpcFactory = async () => {
    throw new Error("connect ECONNREFUSED");
  };
  const p = new CmuxFocusProvider((f) => {
    last = f;
  }, { rpc: failingFactory, pollMs: 1e9 });
  await p.start(); // must not throw
  assert.equal(last, undefined); // stayed focused=true, no onChange
  await p.poll(); // no-op (rpc undefined)
  assert.equal(last, undefined);
  await p.stop();
});

test("rpc error swallowed — keeps last known state, no onChange", async () => {
  process.env.CMUX_SURFACE_ID = "surf-1";
  const m = mockRpc(true);
  let last: boolean | undefined;
  const p = new CmuxFocusProvider((f) => {
    last = f;
  }, { rpc: m.factory, pollMs: 1e9 });
  await p.start();
  assert.equal(last, undefined);
  m.throwNext();
  await p.poll(); // rpc throws internally; should not reject, keeps focused=true
  assert.equal(last, undefined);
  await p.stop();
});

test("explicit surfaceId opt overrides env", async () => {
  process.env.CMUX_SURFACE_ID = "env-surf";
  const m = mockRpc(false);
  const calls = m.calls;
  let last: boolean | undefined;
  const p = new CmuxFocusProvider((f) => {
    last = f;
  }, { surfaceId: "explicit-surf", rpc: m.factory, pollMs: 1e9 });
  await p.start();
  assert.equal(calls[0]?.params.surface_id, "explicit-surf");
  assert.equal(last, false);
  await p.stop();
});

test("detect() = false without CMUX_SURFACE_ID", async () => {
  assert.equal(await CmuxFocusProvider.detect(), false);
});

test("detect() = false when CMUX_SURFACE_ID set but socket missing", async () => {
  process.env.CMUX_SURFACE_ID = "surf-1";
  process.env.CMUX_SOCKET_PATH = "/tmp/definitely-missing-cmux-sock";
  assert.equal(await CmuxFocusProvider.detect(), false);
});

test("detect() = true when CMUX_SURFACE_ID set and socket path exists", async () => {
  const { writeFileSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const sock = join(tmpdir(), "fake-cmux-cursor.sock");
  writeFileSync(sock, "");
  process.env.CMUX_SURFACE_ID = "surf-1";
  process.env.CMUX_SOCKET_PATH = sock;
  assert.equal(await CmuxFocusProvider.detect(), true);
  rmSync(sock, { force: true });
});