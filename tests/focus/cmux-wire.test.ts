import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Socket } from "node:net";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defaultRpcFactory, resolveSocketPath } from "../../lib/focus/cmux.ts";

// Integration test: spin up a local Unix-socket server speaking the cmux v2
// JSON-line protocol, then verify defaultRpcFactory sends the right envelope
// and parses the result/error shapes. This is the one place a real-wire test
// materially de-risks the "built-from-docs" adapter.
async function withCmuxServer(
  handler: (req: any) => any,
  fn: (path: string) => Promise<void>,
  opts: { preamble?: string[] } = {},
): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), "cmux-wire-"));
  const sockPath = join(dir, "cmux.sock");
  const server = createServer((s: Socket) => {
    if (opts.preamble) {
      for (const line of opts.preamble) s.write(line + "\n");
    }
    let buf = "";
    s.on("data", (d) => {
      buf += d.toString();
      let i: number;
      while ((i = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 1);
        let req: Record<string, any>;
        try {
          req = JSON.parse(line);
        } catch {
          continue;
        }
        const result = handler(req);
        const resp = result instanceof Error
          ? { id: req.id, ok: false, error: { code: "error", message: result.message } }
          : { id: req.id, ok: true, result };
        s.write(JSON.stringify(resp) + "\n");
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(sockPath, resolve));
  try {
    await fn(sockPath);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    rmSync(dir, { recursive: true, force: true });
  }
}

test("defaultRpcFactory: is_focused round-trip (ok response)", async () => {
  let lastReq: any;
  await withCmuxServer(
    (req) => {
      lastReq = req;
      if (req.method === "debug.terminal.is_focused") return { focused: true };
      return {};
    },
    async (path) => {
      const rpc = await defaultRpcFactory(path);
      const result = await rpc.call("debug.terminal.is_focused", { surface_id: "surf-1" });
      assert.equal((result as any).focused, true);
      assert.equal(lastReq.method, "debug.terminal.is_focused");
      assert.equal(lastReq.params.surface_id, "surf-1");
      assert.ok(typeof lastReq.id === "string" && lastReq.id.length > 0, "id is a string");
      await rpc.close();
    },
  );
});

test("defaultRpcFactory: error response rejects with code:message", async () => {
  await withCmuxServer(
    () => new Error("no such surface"),
    async (path) => {
      const rpc = await defaultRpcFactory(path);
      await assert.rejects(
        () => rpc.call("debug.terminal.is_focused", { surface_id: "ghost" }),
        /no such surface/,
      );
      await rpc.close();
    },
  );
});

test("defaultRpcFactory: ignores non-JSON preamble lines, parses the real response", async () => {
  await withCmuxServer(
    (req) => {
      if (req.method === "debug.terminal.is_focused") return { focused: false };
      return {};
    },
    async (path) => {
      const rpc = await defaultRpcFactory(path);
      const result = await rpc.call("debug.terminal.is_focused", { surface_id: "s" });
      assert.equal((result as any).focused, false);
      await rpc.close();
    },
    { preamble: ["not-json-garbage", "{ also not closed", ""] },
  );
});

test("resolveSocketPath: env override wins (even when path doesn't exist)", async () => {
  const env = { CMUX_SOCKET_PATH: "/custom/nonexistent/path" } as NodeJS.ProcessEnv;
  assert.equal(await resolveSocketPath(env), "/custom/nonexistent/path");
});