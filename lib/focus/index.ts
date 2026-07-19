import type { FocusProviderName } from "../defaults.ts";
import { StaticFocusProvider } from "./static.ts";
import { TmuxFocusProvider } from "./tmux.ts";
import { CmuxFocusProvider } from "./cmux.ts";
import { HerdrFocusProvider } from "./herdr.ts";

export interface FocusProvider {
  readonly name: "tmux" | "cmux" | "herdr" | "static";
  start(onChange: (focused: boolean) => void): Promise<void>;
  stop(): Promise<void>;
}

export async function autoDetect(onChange: (focused: boolean) => void): Promise<FocusProvider> {
  // 1. tmux (TMUX_PANE is deterministic + tmux is the most common mux)
  if (process.env.TMUX_PANE) return new TmuxFocusProvider(process.env.TMUX_PANE, onChange);
  // 2. cmux (CMUX_SURFACE_ID is deterministic + socket present)
  if (await CmuxFocusProvider.detect()) return new CmuxFocusProvider(onChange);
  // 3. herdr (socket path env or default session socket existence)
  if (await HerdrFocusProvider.detect()) return new HerdrFocusProvider(onChange);
  // 4. static fallback
  return new StaticFocusProvider();
}

export async function createProvider(
  name: FocusProviderName,
  onChange: (focused: boolean) => void,
): Promise<FocusProvider> {
  switch (name) {
    case "tmux":
      return new TmuxFocusProvider(process.env.TMUX_PANE ?? "", onChange);
    case "cmux":
      return new CmuxFocusProvider(onChange);
    case "herdr":
      return new HerdrFocusProvider(onChange);
    case "static":
      return new StaticFocusProvider();
    case "auto":
      return autoDetect(onChange);
  }
}