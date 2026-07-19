export type FocusedStyle = "block" | "bar" | "underline";
export type UnfocusedStyle = "dim" | "hollow" | "outline" | "underline" | "hide";
export type FocusProviderName = "auto" | "tmux" | "herdr" | "static";

export const FOCUSED_STYLES: readonly FocusedStyle[] = ["block", "bar", "underline"];
export const UNFOCUSED_STYLES: readonly UnfocusedStyle[] = ["dim", "hollow", "outline", "underline", "hide"];
export const BLINK_RATES: readonly number[] = [400, 500, 600, 800, 1000];
export const FOCUS_PROVIDERS: readonly FocusProviderName[] = ["auto", "tmux", "herdr", "static"];

export interface CursorConfig {
  enabled: boolean;
  focusedStyle: FocusedStyle;
  unfocusedStyle: UnfocusedStyle;
  blink: boolean;
  blinkRate: number;
  focusProvider: FocusProviderName;
}

export const DEFAULT_CONFIG: CursorConfig = {
  enabled: true,
  focusedStyle: "block",
  unfocusedStyle: "hollow",
  blink: false,
  blinkRate: 600,
  focusProvider: "auto",
};