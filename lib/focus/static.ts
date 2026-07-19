import type { FocusProvider } from "./index.ts";

export class StaticFocusProvider implements FocusProvider {
  readonly name = "static" as const;
  async start(_onChange: (focused: boolean) => void): Promise<void> {}
  async stop(): Promise<void> {}
}