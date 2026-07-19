import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  DEFAULT_CONFIG,
  FOCUSED_STYLES,
  UNFOCUSED_STYLES,
  BLINK_RATES,
  FOCUS_PROVIDERS,
  type CursorConfig,
  type FocusedStyle,
  type UnfocusedStyle,
  type FocusProviderName,
} from "./defaults.ts";

export const CONFIG_FILENAME = "cursor.json";

function isFocusedStyle(v: unknown): v is FocusedStyle {
  return FOCUSED_STYLES.includes(v as FocusedStyle);
}
function isUnfocusedStyle(v: unknown): v is UnfocusedStyle {
  return UNFOCUSED_STYLES.includes(v as UnfocusedStyle);
}
function isProvider(v: unknown): v is FocusProviderName {
  return FOCUS_PROVIDERS.includes(v as FocusProviderName);
}

export function normalizeConfig(raw: Record<string, unknown>): { config: CursorConfig; fixed: boolean } {
  const cfg: CursorConfig = { ...DEFAULT_CONFIG };
  let fixed = false;
  const r = raw ?? {};
  if (r.enabled === true || r.enabled === false) cfg.enabled = r.enabled;
  else fixed = true;
  if (isFocusedStyle(r.focusedStyle)) cfg.focusedStyle = r.focusedStyle;
  else fixed = true;
  if (isUnfocusedStyle(r.unfocusedStyle)) cfg.unfocusedStyle = r.unfocusedStyle;
  else fixed = true;
  if (r.blink === true || r.blink === false) cfg.blink = r.blink;
  else fixed = true;
  if (typeof r.blinkRate === "number" && BLINK_RATES.includes(r.blinkRate)) cfg.blinkRate = r.blinkRate;
  else fixed = true;
  if (isProvider(r.focusProvider)) cfg.focusProvider = r.focusProvider;
  else fixed = true;
  return { config: cfg, fixed };
}

export async function loadConfig(dir: string): Promise<CursorConfig> {
  const path = join(dir, CONFIG_FILENAME);
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(await readFile(path, "utf8"));
  } catch {
    raw = {};
  }
  const { config, fixed } = normalizeConfig(raw);
  if (fixed || Object.keys(raw).length === 0) await saveConfig(config, dir);
  return config;
}

export async function saveConfig(cfg: CursorConfig, dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, CONFIG_FILENAME), JSON.stringify(cfg, null, 2) + "\n", "utf8");
}

type CycleableKey = "focusedStyle" | "unfocusedStyle" | "blinkRate" | "focusProvider";
export function cycleValue(cfg: CursorConfig, key: CycleableKey): CursorConfig {
  if (key === "focusedStyle") {
    const i = FOCUSED_STYLES.indexOf(cfg.focusedStyle);
    return { ...cfg, focusedStyle: FOCUSED_STYLES[(i + 1) % FOCUSED_STYLES.length]! };
  }
  if (key === "unfocusedStyle") {
    const i = UNFOCUSED_STYLES.indexOf(cfg.unfocusedStyle);
    return { ...cfg, unfocusedStyle: UNFOCUSED_STYLES[(i + 1) % UNFOCUSED_STYLES.length]! };
  }
  if (key === "blinkRate") {
    const i = BLINK_RATES.indexOf(cfg.blinkRate);
    return { ...cfg, blinkRate: BLINK_RATES[(i + 1) % BLINK_RATES.length]! };
  }
  const i = FOCUS_PROVIDERS.indexOf(cfg.focusProvider);
  return { ...cfg, focusProvider: FOCUS_PROVIDERS[(i + 1) % FOCUS_PROVIDERS.length]! };
}