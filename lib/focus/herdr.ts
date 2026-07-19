import { access } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { FocusProvider } from "./index.ts";

// Stub — full implementation in Task 7 (herdr, build-from-docs; unverified without a live herdr session).
export class HerdrFocusProvider implements FocusProvider {
  readonly name = "herdr" as const;
  constructor(private onChange: (f: boolean) => void) {}
  static async detect(path: string = defaultSocketPath()): Promise<boolean> {
    try {
      await access(path);
      return true;
    } catch {
      return false;
    }
  }
  async start(): Promise<void> {}
  async stop(): Promise<void> {}
}

export function defaultSocketPath(): string {
  if (process.env.HERDR_SOCKET_PATH) return process.env.HERDR_SOCKET_PATH;
  if (process.env.HERDR_SESSION) return join(homedir(), ".config", "herdr", "sessions", process.env.HERDR_SESSION, "herdr.sock");
  return join(homedir(), ".config", "herdr", "herdr.sock");
}