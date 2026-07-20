export type FocusedStyle = "block" | "bar" | "underline";
export type UnfocusedStyle = "dim" | "hollow" | "outline" | "underline" | "hide" | "highlight";
export type FocusProviderName = "auto" | "tmux" | "cmux" | "herdr" | "static";
export type CursorMode = "fake" | "hardware";

export const FOCUSED_STYLES: readonly FocusedStyle[] = ["block", "bar", "underline"];
export const UNFOCUSED_STYLES: readonly UnfocusedStyle[] = ["dim", "hollow", "outline", "underline", "hide", "highlight"];
export const BLINK_RATES: readonly number[] = [400, 500, 600, 800, 1000];
export const FOCUS_PROVIDERS: readonly FocusProviderName[] = ["auto", "tmux", "cmux", "herdr", "static"];
export const CURSOR_MODES: readonly CursorMode[] = ["fake", "hardware"];

export interface CursorConfig {
  enabled: boolean;
  focusedStyle: FocusedStyle;
  unfocusedStyle: UnfocusedStyle;
  blink: boolean;
  blinkRate: number;
  focusProvider: FocusProviderName;
  cursorColor: string;        // "accent" | "#RRGGBB"
  cursorMode: CursorMode;
}

export const DEFAULT_CONFIG: CursorConfig = {
  enabled: true,
  focusedStyle: "block",
  unfocusedStyle: "hollow",
  blink: false,
  blinkRate: 600,
  focusProvider: "auto",
  cursorColor: "accent",
  cursorMode: "fake",
};