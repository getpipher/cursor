/**
 * Unix-domain socket liveness probe, shared by the focus providers.
 *
 * Why this exists: `fs.access` / `stat` only prove a socket FILE exists on
 * disk. When a multiplexer server dies hard (crash, `kill -9`, reboot) it
 * leaves its socket file behind — the entry remains but nothing is
 * `accept`-ing, so `connect()` fails with ECONNREFUSED. A detect() based on
 * file-existence therefore mistakes a stale leftover for a running server and
 * the provider's `start()` then throws the ECONNREFUSED the user sees.
 *
 * This opens a real connection and closes it immediately. `connect` resolves
 * only when a listener accepts; a stale/missing/non-socket path rejects at
 * once. Never throws — returns true on connect, false on any error/timeout —
 * so it is safe to drop into detect() probes.
 *
 * Separation of concerns: path RESOLUTION (env → marker → candidates) stays
 * existence-based and lives in each provider; LIVENESS lives here. Resolution
 * answers "where should I look?", a probe answers "is anyone home?".
 */
import { connect } from "node:net";

export function probeSocket(path: string, timeoutMs = 300): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = connect(path);
    let settled = false;
    const finish = (ok: boolean): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      sock.destroy();
      resolve(ok);
    };
    const timer = setTimeout(() => finish(false), timeoutMs);
    sock.once("connect", () => finish(true));
    sock.once("error", () => finish(false));
  });
}
