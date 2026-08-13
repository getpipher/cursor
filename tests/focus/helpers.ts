/**
 * Test helper: spin up a throwaway LISTENING Unix-domain socket in a temp dir.
 *
 * Used by focus-provider detect() tests, which must exercise the live path —
 * `probeSocket` returns true only when a server is accept()-ing. A stale
 * leftover (a file with no listener) is the bug we harden against, so the
 * "detect = true" tests need a real listener, not a `writeFileSync` stub.
 */
import { createServer, type Server } from "node:net";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface LiveSocket {
  path: string;
  close: () => Promise<void>;
}

/** A real listening socket; `probeSocket(path)` returns true while it's up. */
export async function listeningSocket(prefix = "cursor-focus"): Promise<LiveSocket> {
  const dir = mkdtempSync(join(tmpdir(), `${prefix}-`));
  const path = join(dir, "sock");
  const server: Server = createServer();
  await new Promise<void>((resolve) => server.listen(path, resolve));
  return {
    path,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => {
          rmSync(dir, { recursive: true, force: true });
          resolve();
        });
      }),
  };
}

/**
 * A stale socket lookalike: a filesystem entry at `path` with NO listener.
 * Reproduces the crashed-daemon leftover that `fs.access`-based detect()
 * mistakenly trusted. Uses a regular file (good enough — `connect()` to a
 * non-socket path errors the same way a stale socket would).
 */
export async function staleSocketFile(prefix = "cursor-stale"): Promise<LiveSocket> {
  const dir = mkdtempSync(join(tmpdir(), `${prefix}-`));
  const path = join(dir, "sock");
  writeFileSync(path, "");
  return {
    path,
    close: async () => {
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
