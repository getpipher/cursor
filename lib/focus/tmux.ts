import { watch, type FSWatcher } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FocusProvider } from "./index.ts";

export type ExecFn = (args: string[]) => Promise<void>;

const HOOK_ID = `${process.pid}`;
const STATE_DIR = join(tmpdir(), "pi-getpipher-cursor");

function shellQuote(v: string): string {
  return `'${v.replace(/'/g, `'\\''`)}'`;
}
function stateFile(pane: string): string {
  return join(STATE_DIR, `pane-${pane.replace(/[^a-zA-Z0-9_.-]/g, "_")}-${HOOK_ID}.state`);
}

export class TmuxFocusProvider implements FocusProvider {
  readonly name = "tmux" as const;
  private watcher: FSWatcher | undefined;
  private hooksInstalled = false;
  private focused = true;

  constructor(
    private pane: string,
    private onChange: (focused: boolean) => void,
    private exec: ExecFn = defaultTmuxExec,
  ) {}

  async start(): Promise<void> {
    if (!this.pane) return; // not in tmux
    const file = stateFile(this.pane);
    await mkdir(STATE_DIR, { recursive: true });
    await writeFile(file, this.focused ? "1" : "0", "utf8");
    await this.exec(["set-hook", "-p", "-t", this.pane, `pane-focus-in[${HOOK_ID}]`, `run-shell -b "printf %s 1 > ${shellQuote(file)}"`]);
    await this.exec(["set-hook", "-p", "-t", this.pane, `pane-focus-out[${HOOK_ID}]`, `run-shell -b "printf %s 0 > ${shellQuote(file)}"`]);
    this.hooksInstalled = true;
    this.watcher = watch(file, { persistent: false }, () => {
      void this.readState(file);
    });
    this.watcher.on("error", () => {
      this.watcher?.close();
      this.watcher = undefined;
    });
  }

  /** Test seam: apply a state value written by a tmux hook. */
  applyStateFromValue(value: string): void {
    const next = value.trim() !== "0";
    if (next === this.focused) return;
    this.focused = next;
    this.onChange(next);
  }

  private async readState(file: string): Promise<void> {
    try {
      this.applyStateFromValue(await readFile(file, "utf8"));
    } catch {
      /* transient read error while tmux is updating the state file */
    }
  }

  async stop(): Promise<void> {
    this.watcher?.close();
    this.watcher = undefined;
    if (this.pane && this.hooksInstalled) {
      await Promise.allSettled([
        this.exec(["set-hook", "-up", "-t", this.pane, `pane-focus-in[${HOOK_ID}]`]),
        this.exec(["set-hook", "-up", "-t", this.pane, `pane-focus-out[${HOOK_ID}]`]),
      ]);
      this.hooksInstalled = false;
    }
    if (this.pane) await rm(stateFile(this.pane), { force: true });
  }
}

async function defaultTmuxExec(args: string[]): Promise<void> {
  const { spawn } = await import("node:child_process");
  await new Promise<void>((resolve) => {
    const p = spawn("tmux", args, { stdio: "ignore", timeout: 2000 });
    p.on("close", () => resolve());
    p.on("error", () => resolve());
  });
}