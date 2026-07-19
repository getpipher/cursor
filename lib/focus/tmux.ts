import type { FocusProvider } from "./index.ts";

// Stub — full implementation in Task 6.
export type ExecFn = (args: string[]) => Promise<void>;

export class TmuxFocusProvider implements FocusProvider {
  readonly name = "tmux" as const;
  constructor(private pane: string, private onChange: (f: boolean) => void, private exec: ExecFn = async () => {}) {}
  async start(): Promise<void> {}
  async stop(): Promise<void> {}
}