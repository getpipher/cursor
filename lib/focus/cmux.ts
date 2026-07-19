/**
 * CmuxFocusProvider — focus detection via the cmux v2 socket API.
 *
 * ⚠️ BUILT FROM DOCS (manaflow-ai/cmux: tests_v2/cmux.py + docs/events.md +
 * docs/cli-contract.md + docs/v2-api-migration.md), UNVERIFIED without a live
 * cmux session. The wire envelope, the `debug.terminal.is_focused` method +
 * params + result shape, and the socket-path resolution order are confirmed
 * against the cmux Python client source (not just prose docs). The one
 * doc-level assumption: that `CMUX_SURFACE_ID` is always injected into terminal
 * surfaces — cli-contract.md states it is the "Default surface context inside
 * cmux terminals" (high confidence). Unit tests cover behavior against a
 * mocked RPC; confirm the live wire shape in a real cmux pane with
 * `cmux events` + a manual `debug.terminal.is_focused` call if anything looks
 * off. See this file's header + README for the verification checklist.
 *
 * Mechanism: socket-poll (not event-push). cmux offers a purpose-built RPC,
 * `debug.terminal.is_focused {surface_id}`, that authoritatively answers "is
 * this surface the keyboard-focused one?" — the server resolves the full
 * window→workspace→pane→surface hierarchy, so we never reconstruct it
 * client-side. We snapshot at start, then re-poll every POLL_MS. Event-push via
 * `events.stream` + `surface.focused` is a documented future optimization: it's
 * connection-monopolizing (no further commands on that socket), per-workspace
 * ambiguous (each workspace has its own focused surface; we'd also need
 * `workspace.selected` + `window.keyed`/`window.unkeyed`), and adds
 * seq/heartbeat/resume/slow-consumer bookkeeping — not worth it at v0.1.1.
 *
 * Wire facts (confirmed from tests_v2/cmux.py):
 *  - Transport: newline-delimited JSON over a Unix domain socket.
 *  - Envelope: req {"id","method","params"} → resp {"id","ok":true,"result":{...}}
 *    (error: {"id","ok":false,"error":{"code","message"}}).
 *  - Auth: the local uid-scoped socket relies on filesystem perms — the Python
 *    test client connects with NO password handshake. CMUX_SOCKET_PASSWORD is
 *    for non-local/CLI scenarios; we don't send it (matching the test client).
 *  - is_focused: {"method":"debug.terminal.is_focused","params":{"surface_id":"<uuid>"}}
 *      → {"ok":true,"result":{"focused":bool}}.
 *  - Socket path resolution (priority): CMUX_SOCKET_PATH env →
 *    ~/Library/Application Support/cmux/last-socket-path marker file →
 *    /tmp/cmux-debug.sock → ~/Library/Application Support/cmux/cmux.sock →
 *    /tmp/cmux.sock → (glob fallbacks omitted in v0.1.1) → stable path.
 *    NOTE: debug-build glob discovery (/tmp/cmux-debug-*.sock, cmux*.sock) is
 *    NOT implemented here; add if you run debug cmux builds.
 */
import { connect, type Socket } from "node:net";
import { access, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { FocusProvider } from "./index.ts";

const POLL_MS = 300;
const OUR_SURFACE_ENV = "CMUX_SURFACE_ID";
const SOCKET_PATH_ENV = "CMUX_SOCKET_PATH";
const APP_SUPPORT_DIR = join(homedir(), "Library", "Application Support", "cmux");
const STABLE_SOCKET = join(APP_SUPPORT_DIR, "cmux.sock");
const LEGACY_SOCKET = "/tmp/cmux.sock";
const DEBUG_SOCKET = "/tmp/cmux-debug.sock";
const LAST_SOCKET_MARKER = join(APP_SUPPORT_DIR, "last-socket-path");

export interface CmuxRpc {
  call(method: string, params: Record<string, unknown>): Promise<unknown>;
  close(): Promise<void>;
}
export type RpcFactory = (socketPath: string) => Promise<CmuxRpc>;

async function pathExists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolve the cmux control socket path. Priority matches tests_v2/cmux.py
 * `_default_socket_path` for the common cases (env override → marker file →
 * debug → stable → legacy). Debug-build glob discovery is intentionally
 * omitted (documented in the file header); the stable path is the final
 * fallback so a connect attempt can fail loudly if cmux isn't running.
 */
export async function resolveSocketPath(env: NodeJS.ProcessEnv = process.env): Promise<string> {
  const override = env[SOCKET_PATH_ENV];
  if (override) return override;
  try {
    const last = (await readFile(LAST_SOCKET_MARKER, "utf8")).trim();
    if (last && (await pathExists(last))) return last;
  } catch {
    /* no marker file */
  }
  for (const cand of [DEBUG_SOCKET, STABLE_SOCKET, LEGACY_SOCKET]) {
    if (await pathExists(cand)) return cand;
  }
  return STABLE_SOCKET;
}

/** Default RPC factory: opens a Unix socket, multiplexes request/response by id. */
export async function defaultRpcFactory(socketPath: string): Promise<CmuxRpc> {
  const sock: Socket = connect(socketPath);
  await new Promise<void>((resolve, reject) => {
    sock.once("connect", () => resolve());
    sock.once("error", reject);
  });
  let buf = "";
  const pending = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  sock.on("data", (d) => {
    buf += d.toString();
    let i: number;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i);
      buf = buf.slice(i + 1);
      let msg: Record<string, any>;
      try {
        msg = JSON.parse(line);
      } catch {
        continue; // ignore non-JSON lines (e.g. stray debug output)
      }
      const id = String(msg.id);
      const p = pending.get(id);
      if (!p) continue;
      pending.delete(id);
      if (msg.ok === true) p.resolve(msg.result);
      else p.reject(new Error(`${msg.error?.code ?? "error"}: ${msg.error?.message ?? "unknown"}`));
    }
  });
  sock.on("error", () => {
    for (const p of pending.values()) p.reject(new Error("cmux socket closed"));
    pending.clear();
  });
  let reqId = 0;
  return {
    call(method, params) {
      const id = `c${reqId++}`;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          if (pending.delete(id)) reject(new Error(`cmux rpc timeout: ${method}`));
        }, 2000);
        pending.set(id, {
          resolve: (v) => {
            clearTimeout(timer);
            resolve(v);
          },
          reject: (e) => {
            clearTimeout(timer);
            reject(e);
          },
        });
        sock.write(JSON.stringify({ id, method, params }) + "\n");
      });
    },
    close() {
      sock.destroy();
      return Promise.resolve();
    },
  };
}

export class CmuxFocusProvider implements FocusProvider {
  readonly name = "cmux" as const;
  private rpc: CmuxRpc | undefined;
  private focused = true;
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(
    private onChange: (focused: boolean) => void,
    private opts: {
      surfaceId?: string;
      socketPath?: string;
      rpc?: RpcFactory;
      pollMs?: number;
    } = {},
  ) {}

  /** Detect: CMUX_SURFACE_ID present AND a resolvable socket exists. */
  static async detect(env: NodeJS.ProcessEnv = process.env): Promise<boolean> {
    if (!env[OUR_SURFACE_ENV]) return false;
    return pathExists(await resolveSocketPath(env));
  }

  async start(): Promise<void> {
    const surfaceId = this.opts.surfaceId ?? process.env[OUR_SURFACE_ENV];
    if (!surfaceId) return; // not inside cmux
    const factory = this.opts.rpc ?? defaultRpcFactory;
    const path = this.opts.socketPath ?? (await resolveSocketPath());
    // Defensive: if the socket vanishes between detect() and start() (race),
    // swallow the connect failure and degrade to always-focused (no polling).
    // Better than throwing in session_start and breaking the whole extension.
    try {
      this.rpc = await factory(path);
    } catch {
      this.rpc = undefined;
      return;
    }
    // Authoritative initial snapshot (don't assume focused=true).
    await this.poll(surfaceId);
    const ms = this.opts.pollMs ?? POLL_MS;
    this.timer = setInterval(() => {
      void this.poll(surfaceId);
    }, ms);
    this.timer.unref?.(); // don't keep the event loop alive on shutdown
  }

  /** Test seam + poll body: query is_focused for our surface, emit onChange on flip. */
  async poll(surfaceId: string = this.opts.surfaceId ?? process.env[OUR_SURFACE_ENV] ?? ""): Promise<void> {
    if (!this.rpc || !surfaceId) return;
    let result: any;
    try {
      result = await this.rpc.call("debug.terminal.is_focused", { surface_id: surfaceId });
    } catch {
      return; // transient rpc error / socket hiccup; keep last known state
    }
    const next = result?.focused === true;
    if (next === this.focused) return;
    this.focused = next;
    this.onChange(next);
  }

  async stop(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
    await this.rpc?.close();
    this.rpc = undefined;
  }
}