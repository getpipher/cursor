/**
 * HerdrFocusProvider — focus detection via the herdr socket API.
 *
 * ⚠️ BUILT FROM DOCS (herdr.dev/docs/socket-api), UNVERIFIED without a live herdr
 * session. Two constants below are documented assumptions — confirm them in a
 * real herdr pane with:
 *   1. `env | grep -i herdr`            → our-own-pane-id env var name
 *   2. `herdr api schema --json`        → events.subscribe params + focus-event shape
 * If the real wire shape differs, adjust the three constants and the handle()
 * field reads. The unit tests cover behavior against a mocked socket.
 *
 * Wire facts (confirmed from docs):
 *  - Transport: newline-delimited JSON over a Unix domain socket.
 *  - Socket path: HERDR_SOCKET_PATH → HERDR_SESSION=<name> →
 *    ~/.config/herdr/sessions/<name>/herdr.sock → ~/.config/herdr/herdr.sock.
 *  - Methods: session.snapshot (returns focused_*_pane ids + records),
 *    events.subscribe (long-lived; emits resource events incl. focus changes).
 */
import { connect, type Socket } from "node:net";
import { access } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { FocusProvider } from "./index.ts";

// ⚠️ ASSUMPTION — confirm via `env | grep -i herdr` inside a herdr pane.
const OUR_PANE_ENV = "HERDR_PANE_ID";
// ⚠️ ASSUMPTION — confirm via `herdr api schema --json` (events.subscribe params).
const SUBSCRIBE_EVENTS = ["pane.focus.changed"];
// ⚠️ ASSUMPTION — confirm the focus-event payload field name from the schema.
const FOCUS_EVENT_TYPE = "pane.focus.changed";
const FOCUS_EVENT_PANE_FIELD = "focused_pane_id";
// session.snapshot response field (docs: "focused workspace/tab/pane ids").
const SNAPSHOT_PANE_FIELD = "focused_pane_id";

export interface HerdrSocket {
  send(line: string): void;
  onMessage(cb: (line: string) => void): void;
  close(): Promise<void>;
}
export type SocketFactory = () => Promise<HerdrSocket>;

export function defaultSocketPath(): string {
  if (process.env.HERDR_SOCKET_PATH) return process.env.HERDR_SOCKET_PATH;
  if (process.env.HERDR_SESSION)
    return join(homedir(), ".config", "herdr", "sessions", process.env.HERDR_SESSION, "herdr.sock");
  return join(homedir(), ".config", "herdr", "herdr.sock");
}

export function defaultSocketFactory(path: string): SocketFactory {
  return async () => {
    const sock: Socket = connect(path);
    await new Promise<void>((resolve, reject) => {
      sock.once("connect", () => resolve());
      sock.once("error", reject);
    });
    let cb: (line: string) => void = () => {};
    let buf = "";
    sock.on("data", (d) => {
      buf += d.toString();
      let i: number;
      while ((i = buf.indexOf("\n")) >= 0) {
        cb(buf.slice(0, i));
        buf = buf.slice(i + 1);
      }
    });
    return {
      send: (line) => {
        sock.write(line + "\n");
      },
      onMessage: (c) => {
        cb = c;
      },
      close: async () => {
        sock.destroy();
      },
    };
  };
}

export class HerdrFocusProvider implements FocusProvider {
  readonly name = "herdr" as const;
  private socket: HerdrSocket | undefined;
  private ourPaneId: string | undefined;
  private focused = true;
  private reqId = 0;

  constructor(
    private onChange: (focused: boolean) => void,
    private opts: { socket: SocketFactory; socketPath: string } = {
      socket: defaultSocketFactory(defaultSocketPath()),
      socketPath: defaultSocketPath(),
    },
  ) {}

  static async detect(path: string = defaultSocketPath()): Promise<boolean> {
    try {
      await access(path);
      return true;
    } catch {
      return false;
    }
  }

  async start(): Promise<void> {
    this.ourPaneId = process.env[OUR_PANE_ENV];
    this.socket = await this.opts.socket();
    this.socket.onMessage((line) => this.handle(line));
    this.send("session.snapshot", {});
    this.send("events.subscribe", { events: SUBSCRIBE_EVENTS });
  }

  private send(method: string, params: Record<string, unknown>): void {
    this.socket?.send(JSON.stringify({ id: `r${this.reqId++}`, method, params }));
  }

  private handle(line: string): void {
    let msg: Record<string, any>;
    try {
      msg = JSON.parse(line);
    } catch {
      return;
    }
    // session.snapshot response: adopt our pane id if unknown, then evaluate focus.
    if (msg.result?.[SNAPSHOT_PANE_FIELD] !== undefined) {
      if (this.ourPaneId === undefined) this.ourPaneId = msg.result[SNAPSHOT_PANE_FIELD];
      this.setFocused(msg.result[SNAPSHOT_PANE_FIELD] === this.ourPaneId);
      return;
    }
    // focus-change event.
    if (msg.event?.type === FOCUS_EVENT_TYPE) {
      this.setFocused(msg.event[FOCUS_EVENT_PANE_FIELD] === this.ourPaneId);
    }
  }

  private setFocused(next: boolean): void {
    if (next === this.focused) return;
    this.focused = next;
    this.onChange(next);
  }

  async stop(): Promise<void> {
    await this.socket?.close();
    this.socket = undefined;
  }
}