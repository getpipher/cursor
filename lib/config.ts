import { watch, type FSWatcher } from "node:fs";
import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
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

/**
 * Live-global config: watches `~/.pi/agent/cursor.json` so a change in one pi
 * session propagates to all running sessions. Debounced + self-write-ignored
 * (by mtime + content fingerprint) so the writing session doesn't re-apply its
 * own write. Returns the FSWatcher (call .close() on shutdown).
 */
export function watchConfig(
  dir: string,
  self: { mtimeMs: number; fingerprint: string },
  onExternalChange: (cfg: CursorConfig) => void,
): FSWatcher {
  const path = join(dir, CONFIG_FILENAME);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const watcher = watch(path, { persistent: false }, () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      void (async () => {
        try {
          const st = await stat(path);
          const content = await readFile(path, "utf8");
          // ignore our own write (same mtime + same fingerprint)
          if (st.mtimeMs === self.mtimeMs && fingerprint(content) === self.fingerprint) return;
          const { config } = normalizeConfig(JSON.parse(content));
          onExternalChange(config);
        } catch {
          /* transient: file mid-write or deleted */
        }
      })();
    }, 80);
  });
  return watcher;
}

export function fingerprint(content: string): string {
  // cheap, non-crypto fingerprint for self-write dedup
  let h = 0;
  for (let i = 0; i < content.length; i++) {
    h = (h * 31 + content.charCodeAt(i)) | 0;
  }
  return `${content.length}:${h}`;
}

export async function saveConfigTracked(
  cfg: CursorConfig,
  dir: string,
  self: { mtimeMs: number; fingerprint: string },
): Promise<void> {
  const path = join(dir, CONFIG_FILENAME);
  await mkdir(dir, { recursive: true });
  const content = JSON.stringify(cfg, null, 2) + "\n";
  await writeFile(path, content, "utf8");
  const st = await stat(path);
  self.mtimeMs = st.mtimeMs;
  self.fingerprint = fingerprint(content);
}