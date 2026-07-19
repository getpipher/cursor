import type { SettingItem, Component } from "@earendil-works/pi-tui";
import { CURSOR_MARKER } from "@earendil-works/pi-tui";
import {
  FOCUSED_STYLES,
  UNFOCUSED_STYLES,
  BLINK_RATES,
  FOCUS_PROVIDERS,
  type CursorConfig,
  type FocusedStyle,
  type UnfocusedStyle,
  type FocusProviderName,
} from "./defaults.ts";
import { transformFocused, transformUnfocused } from "./render.ts";

/** Build the SettingsList rows for the `/cursor` panel. Pure data — the entry
 * wires `SettingsList.onChange(id, newValue)` to `applyRowChange`. */
export function panelRows(cfg: CursorConfig, activeProviderLabel: string): SettingItem[] {
  return [
    {
      id: "enabled",
      label: "Enabled",
      currentValue: cfg.enabled ? "on" : "off",
      values: ["on", "off"],
      description: "Master switch. Off → pi native block, no focus-awareness, no blink.",
    },
    {
      id: "focusedStyle",
      label: "Focused style",
      currentValue: cfg.focusedStyle,
      values: [...FOCUSED_STYLES],
      description: "Cursor shape when the pane is active. bar hides the char at the cursor.",
    },
    {
      id: "unfocusedStyle",
      label: "Unfocused style",
      currentValue: cfg.unfocusedStyle,
      values: [...UNFOCUSED_STYLES],
      description: "Cursor shape when the pane is inactive. outline hides the char at the cursor.",
    },
    {
      id: "blink",
      label: "Blink",
      currentValue: cfg.blink ? "on" : "off",
      values: ["on", "off"],
      description: "Opt-in. Pauses when unfocused. Default off (pi is steady).",
    },
    {
      id: "blinkRate",
      label: "Blink rate",
      currentValue: String(cfg.blinkRate),
      values: BLINK_RATES.map(String),
      description: "Blink interval in ms (used when blink is on).",
    },
    {
      id: "focusProvider",
      label: "Focus provider",
      currentValue: cfg.focusProvider,
      values: [...FOCUS_PROVIDERS],
      description: "auto = detect (tmux > herdr > static). Manual override available.",
    },
    {
      id: "activeProvider",
      label: "Active provider",
      currentValue: activeProviderLabel,
      description: "Read-only: which adapter won detection + focus-events state.",
    },
  ];
}

/** Map a `SettingsList.onChange(id, newValue)` event to the next config. Pure. */
export function applyRowChange(cfg: CursorConfig, id: string, newValue: string): CursorConfig {
  switch (id) {
    case "enabled":
      return { ...cfg, enabled: newValue === "on" };
    case "focusedStyle":
      return { ...cfg, focusedStyle: newValue as FocusedStyle };
    case "unfocusedStyle":
      return { ...cfg, unfocusedStyle: newValue as UnfocusedStyle };
    case "blink":
      return { ...cfg, blink: newValue === "on" };
    case "blinkRate":
      return { ...cfg, blinkRate: Number(newValue) };
    case "focusProvider":
      return { ...cfg, focusProvider: newValue as FocusProviderName };
    default:
      return cfg; // activeProvider is read-only
  }
}

/** A live preview line: renders a sample code line with the cursor in the
 * current focused (or unfocused) style. Reads `getCfg()` on each render so it
 * updates instantly as the user cycles a style/blink row. For the focused
 * preview, `getBlinkVisible()` drives the blink phase (so the preview blinks
 * in sync with the real editor cursor when blink is on). Uses the real ANSI
 * transforms — what the terminal shows is what ships. */
export function previewLine(
  getCfg: () => CursorConfig,
  focused: boolean,
  getBlinkVisible?: () => boolean,
): Component {
  const sample = `const result = await fetch(url);${CURSOR_MARKER}\x1b[7m \x1b[0m`;;
  return {
    render(_width: number): string[] {
      const cfg = getCfg();
      if (focused) {
        const blinkVisible = getBlinkVisible ? getBlinkVisible() : true;
        return transformFocused([sample], cfg, blinkVisible);
      }
      return transformUnfocused([sample], cfg);
    },
    invalidate() {},
  };
}
/** Current display value for a row id, given a config (used to updateValue on the list). */
export function rowDisplayValue(id: string, cfg: CursorConfig): string {
  if (id === "enabled") return cfg.enabled ? "on" : "off";
  if (id === "blink") return cfg.blink ? "on" : "off";
  if (id === "blinkRate") return String(cfg.blinkRate);
  if (id === "focusedStyle") return cfg.focusedStyle;
  if (id === "unfocusedStyle") return cfg.unfocusedStyle;
  if (id === "focusProvider") return cfg.focusProvider;
  return cfg[id as keyof CursorConfig]?.toString() ?? "";
}