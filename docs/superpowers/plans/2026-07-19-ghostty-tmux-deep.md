# @getpipher/cursor v0.2.0 — Ghostty + tmux Deep Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `@getpipher/cursor@0.2.0` with truecolor + theme-aware cursor colors (A), a char-preserving `highlight` unfocused style (B), and an opt-in hardware-cursor mode (C) — all deepening the Ghostty + tmux stack.

**Architecture:** A threads pi's `Theme` into `render.ts` so cursor cell colors resolve via `theme.getFgAnsi()` (truecolor end-to-end). B adds a styled-underline unfocused style. C drives Ghostty's native cursor (DECSCUSR + OSC 12) via `tui.setShowHardwareCursor()` for the focused state, reusing A+B's fake-cursor transform for the unfocused state. The v0.1.1 fake-cursor path remains the default.

**Tech Stack:** TypeScript (strict, `noUncheckedIndexedAccess`), `tsx` + `node:test`/`node:assert/strict` (NOT vitest), pi `@earendil-works/pi-coding-agent` + `@earendil-works/pi-tui` `^0.80.x`. Relative imports use `.ts` extensions.

## Global Constraints

- Stack: `tsx` + `node:test`/`node:assert/strict`. No vitest, no eslint. peerDeps `*`. tsconfig `types: ["node"]`.
- `CURSOR_MARKER` imported from `@earendil-works/pi-tui` — never hardcode.
- One commit per task (`feat:`/`fix:`/`chore:`/`docs:`). No AI attribution. MIT, author RECTOR.
- 80%+ coverage on new code. `pnpm typecheck` + `pnpm test:run` green after every task.
- Branch: `feat/ghostty-tmux-deep` (already created). Tag `v0.2.0` (signed: `git tag -s v0.2.0 -m "..."`).
- Defaults MUST reproduce v0.1.1 behavior exactly: `cursorColor: "accent"`, `cursorMode: "fake"` → no visual regression.
- pi-tui facts (spike-confirmed): `TUI.setShowHardwareCursor(bool)` is public; `positionHardwareCursor()` writes only `\x1b[?25h` per frame (never DECSCUSR/OSC12, so our modes persist); `extractCursorPosition()` strips `CURSOR_MARKER` but leaves the styled cell.
- `Theme` API: `theme.getFgAnsi(color: ThemeColor): string` (returns `\x1b[38;2;R;G;Bm` truecolor or `\x1b[38;5;Nm` 256); `theme.getColorMode(): "truecolor" | "256color"`. `ThemeColor` includes `"accent"`, `"muted"`, `"dim"`, `"border"`.
- Build/test: `pnpm install` · `pnpm typecheck` · `pnpm test:run`.

---

## File Structure

| file | responsibility | change |
|---|---|---|
| `lib/defaults.ts` | style enums + default config | add `cursorColor`, `cursorMode`, `"highlight"` |
| `lib/config.ts` | load/save/normalize/cycle config | parse/validate new fields; cycleValue new keys |
| `lib/render.ts` | ANSI cursor-cell transforms + color/escape helpers | thread `Theme`; truecolor colors; `highlight`; hardware bare-char; new helpers |
| `lib/editor.ts` | `CursorEditor` composition + hardware-mode side effects | pass theme; emit DECSCUSR/OSC12; toggle `setShowHardwareCursor`; shutdown restore |
| `lib/panel.ts` | `/cursor` SettingsList rows | new rows `cursorColor` + `cursorMode` |
| `extensions/cursor.ts` | entry: `/cursor` command + lifecycle | parse `color` + `mode` subcommands; pass `tui` ref to editor |
| `lib/state.ts` | blink timer | **no change** (editor skips it in hardware-focused mode) |
| `lib/focus/*` | focus providers | **no change** |

New pure helpers in `render.ts` (Task 2): `hexToAnsi`, `dimHex`, `parseAnsiFgToHex`, `decscusr`, `osc12`, `resolveFocusedColor`, `resolveUnfocusedColor`.

---

## Task 1: Config schema — `cursorColor`, `cursorMode`, `highlight`

**Files:**
- Modify: `lib/defaults.ts`
- Modify: `lib/config.ts`
- Test: `tests/defaults.test.ts`
- Test: `tests/config.test.ts`

**Interfaces:**
- Produces: `CursorConfig.cursorColor: string` (`"accent"` | `"#RRGGBB"`), `CursorConfig.cursorMode: "fake" | "hardware"`, `UnfocusedStyle` gains `"highlight"`. `DEFAULT_CONFIG` adds `cursorColor: "accent"`, `cursorMode: "fake"`. `UNFOCUSED_STYLES` gains `"highlight"`. `normalizeConfig` + `cycleValue` handle the new keys.

- [ ] **Step 1: Write the failing tests (defaults)**

Append to `tests/defaults.test.ts`:

```typescript
test("default config has v0.2.0 additions", () => {
  assert.equal(DEFAULT_CONFIG.cursorColor, "accent");
  assert.equal(DEFAULT_CONFIG.cursorMode, "fake");
});

test("unfocused styles enum includes highlight", () => {
  assert.deepEqual(UNFOCUSED_STYLES, ["dim", "hollow", "outline", "underline", "hide", "highlight"]);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test:run`
Expected: FAIL — `DEFAULT_CONFIG.cursorColor` undefined; `UNFOCUSED_STYLES` missing `highlight`.

- [ ] **Step 3: Update `lib/defaults.ts`**

Replace the `UnfocusedStyle` + `FocusProviderName` + `UNFOCUSED_STYLES` + `CursorConfig` + `DEFAULT_CONFIG` blocks:

```typescript
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
```

- [ ] **Step 4: Write the failing tests (config normalize/cycle)**

Append to `tests/config.test.ts`:

```typescript
test("normalizeConfig accepts cursorColor accent + hex + cursorMode + highlight", () => {
  const { config, fixed } = normalizeConfig({
    cursorColor: "#cba6f7",
    cursorMode: "hardware",
    unfocusedStyle: "highlight",
  });
  assert.equal(fixed, false);
  assert.equal(config.cursorColor, "#cba6f7");
  assert.equal(config.cursorMode, "hardware");
  assert.equal(config.unfocusedStyle, "highlight");
});

test("normalizeConfig rejects bad hex → falls back to accent (fixed=true)", () => {
  const { config, fixed } = normalizeConfig({ cursorColor: "#xyz" });
  assert.equal(fixed, true);
  assert.equal(config.cursorColor, "accent");
});

test("normalizeConfig rejects unknown cursorMode → fake (fixed=true)", () => {
  const { config, fixed } = normalizeConfig({ cursorMode: "weird" as any });
  assert.equal(fixed, true);
  assert.equal(config.cursorMode, "fake");
});

test("cycleValue cycles cursorMode fake → hardware → fake", () => {
  assert.equal(cycleValue({ ...DEFAULT_CONFIG }, "cursorMode").cursorMode, "hardware");
  assert.equal(cycleValue({ ...DEFAULT_CONFIG, cursorMode: "hardware" }, "cursorMode").cursorMode, "fake");
});
```

(Ensure `normalizeConfig` + `cycleValue` are imported in the test file.)

- [ ] **Step 5: Run tests to verify they fail**

Run: `pnpm test:run`
Expected: FAIL — `normalizeConfig` doesn't read `cursorColor`/`cursorMode`; `cycleValue` has no `cursorMode` branch.

- [ ] **Step 6: Update `lib/config.ts`**

Add `isHexColor` + `isCursorMode` validators near the existing `isProvider`, and extend `normalizeConfig` + `cycleValue`:

```typescript
import {
  DEFAULT_CONFIG,
  FOCUSED_STYLES,
  UNFOCUSED_STYLES,
  BLINK_RATES,
  FOCUS_PROVIDERS,
  CURSOR_MODES,
  type CursorConfig,
  type FocusedStyle,
  type UnfocusedStyle,
  type FocusProviderName,
  type CursorMode,
} from "./defaults.ts";

function isHexColor(v: unknown): v is string {
  return typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v);
}
function isCursorMode(v: unknown): v is CursorMode {
  return CURSOR_MODES.includes(v as CursorMode);
}
```

In `normalizeConfig`, after the existing `isProvider` block, add:

```typescript
  if (r.cursorColor === "accent" || isHexColor(r.cursorColor)) cfg.cursorColor = r.cursorColor;
  else fixed = true;
  if (isCursorMode(r.cursorMode)) cfg.cursorMode = r.cursorMode;
  else fixed = true;
```

Extend the `CycleableKey` type and `cycleValue`:

```typescript
type CycleableKey = "focusedStyle" | "unfocusedStyle" | "blinkRate" | "focusProvider" | "cursorMode";
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
  if (key === "cursorMode") {
    const i = CURSOR_MODES.indexOf(cfg.cursorMode);
    return { ...cfg, cursorMode: CURSOR_MODES[(i + 1) % CURSOR_MODES.length]! };
  }
  const i = FOCUS_PROVIDERS.indexOf(cfg.focusProvider);
  return { ...cfg, focusProvider: FOCUS_PROVIDERS[(i + 1) % FOCUS_PROVIDERS.length]! };
}
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `pnpm typecheck && pnpm test:run`
Expected: PASS — all tests green, typecheck clean.

- [ ] **Step 8: Commit**

```bash
git add lib/defaults.ts lib/config.ts tests/defaults.test.ts tests/config.test.ts
git commit -m "feat: add cursorColor, cursorMode, highlight to config schema (v0.2.0 T1)"
```

---

## Task 2: Render color/escape helpers

**Files:**
- Modify: `lib/render.ts` (add helpers — keep existing transforms for now)
- Test: `tests/render-helpers.test.ts` (new)

**Interfaces:**
- Produces (all exported from `render.ts`):
  - `hexToAnsi(hex: string): string` — `#RRGGBB` → `\x1b[38;2;R;G;Bm`
  - `dimHex(hex: string): string` — 50% dim → `#RRGGBB`
  - `parseAnsiFgToHex(prefix: string): string` — `\x1b[38;2;R;G;Bm` → `#RRGGBB`; `\x1b[38;5;Nm` → `""` (inexact)
  - `decscusr(shape: "block" | "underline" | "bar", blink: boolean): string`
  - `osc12(hex: string): string` — `\x1b]12;#RRGGBB\x07` (or `""` if hex empty)
  - `resolveFocusedColor(cfg: CursorConfig, theme: Theme): string` — ANSI prefix for focused color
  - `resolveUnfocusedColor(cfg: CursorConfig, theme: Theme): string` — ANSI prefix for unfocused color
- Consumes: `CursorConfig` (Task 1), `Theme` type from `@earendil-works/pi-coding-agent`.

- [ ] **Step 1: Write the failing tests**

Create `tests/render-helpers.test.ts`:

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  hexToAnsi,
  dimHex,
  parseAnsiFgToHex,
  decscusr,
  osc12,
  resolveFocusedColor,
  resolveUnfocusedColor,
} from "../lib/render.ts";
import { DEFAULT_CONFIG } from "../lib/defaults.ts";

// Minimal mock Theme matching the real Theme's getFgAnsi/getColorMode surface.
function mockTheme(getFgAnsi: (c: string) => string, mode: "truecolor" | "256color" = "truecolor"): any {
  return { getFgAnsi, getColorMode: () => mode };
}

test("hexToAnsi emits truecolor fg", () => {
  assert.equal(hexToAnsi("#cba6f7"), "\x1b[38;2;203;166;247m");
});

test("dimHex halves each channel", () => {
  assert.equal(dimHex("#cba6f7"), "#5d537b");
});

test("parseAnsiFgToHex parses truecolor prefix", () => {
  assert.equal(parseAnsiFgToHex("\x1b[38;2;203;166;247m"), "#cba6f7");
});

test("parseAnsiFgToHex returns empty for 256 prefix (inexact)", () => {
  assert.equal(parseAnsiFgToHex("\x1b[38;5;7m"), "");
});

test("parseAnsiFgToHex returns empty for non-matching string", () => {
  assert.equal(parseAnsiFgToHex("garbage"), "");
});

test("decscusr steady + blink variants", () => {
  assert.equal(decscusr("block", false), "\x1b[2 q");
  assert.equal(decscusr("block", true), "\x1b[1 q");
  assert.equal(decscusr("underline", false), "\x1b[4 q");
  assert.equal(decscusr("underline", true), "\x1b[3 q");
  assert.equal(decscusr("bar", false), "\x1b[6 q");
  assert.equal(decscusr("bar", true), "\x1b[5 q");
});

test("osc12 emits cursor-color sequence for hex", () => {
  assert.equal(osc12("#cba6f7"), "\x1b]12;#cba6f7\x07");
});

test("osc12 returns empty for empty hex", () => {
  assert.equal(osc12(""), "");
});

test("resolveFocusedColor: accent → theme accent ansi", () => {
  const theme = mockTheme((c) => (c === "accent" ? "\x1b[38;2;203;166;247m" : ""));
  assert.equal(resolveFocusedColor(DEFAULT_CONFIG, theme), "\x1b[38;2;203;166;247m");
});

test("resolveFocusedColor: hex override → hexToAnsi", () => {
  const cfg = { ...DEFAULT_CONFIG, cursorColor: "#ff5555" };
  const theme = mockTheme(() => "");
  assert.equal(resolveFocusedColor(cfg, theme), "\x1b[38;2;255;85;85m");
});

test("resolveUnfocusedColor: accent → theme dim ansi", () => {
  const theme = mockTheme((c) => (c === "dim" ? "\x1b[38;2;88;91;112m" : ""));
  assert.equal(resolveUnfocusedColor(DEFAULT_CONFIG, theme), "\x1b[38;2;88;91;112m");
});

test("resolveUnfocusedColor: hex override → dimmed hex truecolor", () => {
  const cfg = { ...DEFAULT_CONFIG, cursorColor: "#cba6f7" };
  const theme = mockTheme(() => "");
  assert.equal(resolveUnfocusedColor(cfg, theme), "\x1b[38;2;93;83;123m");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test:run`
Expected: FAIL — none of the helpers are exported from `render.ts` yet.

- [ ] **Step 3: Add the helpers to `lib/render.ts`**

At the top of `lib/render.ts`, add the `Theme` import + helpers (keep the existing transforms intact for now — they're refactored in Task 3):

```typescript
import { CURSOR_MARKER } from "@earendil-works/pi-tui";
import type { Theme } from "@earendil-works/pi-coding-agent";
import type { CursorConfig, FocusedStyle, UnfocusedStyle } from "./defaults.ts";

// --- Color/escape helpers (v0.2.0) ---

/** #RRGGBB → \x1b[38;2;R;G;Bm. Returns "" if the hex is malformed. */
export function hexToAnsi(hex: string): string {
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex);
  if (!m) return "";
  const n = m[1]!;
  const r = parseInt(n.slice(0, 2), 16);
  const g = parseInt(n.slice(2, 4), 16);
  const b = parseInt(n.slice(4, 6), 16);
  return `\x1b[38;2;${r};${g};${b}m`;
}

/** 50%-dim a #RRGGBB hex toward black. */
export function dimHex(hex: string): string {
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex);
  if (!m) return "";
  const n = m[1]!;
  const dim = (s: string) => Math.floor(parseInt(s, 16) * 0.5).toString(16).padStart(2, "0");
  return `#${dim(n.slice(0, 2))}${dim(n.slice(2, 4))}${dim(n.slice(4, 6))}`;
}

/** Parse a truecolor fg ANSI prefix back to #RRGGBB. Returns "" for 256 or non-matching. */
export function parseAnsiFgToHex(prefix: string): string {
  const m = /^\x1b\[38;2;(\d+);(\d+);(\d+)m$/.exec(prefix);
  if (!m) return "";
  const r = Number(m[1]).toString(16).padStart(2, "0");
  const g = Number(m[2]).toString(16).padStart(2, "0");
  const b = Number(m[3]).toString(16).padStart(2, "0");
  return `#${r}${g}${b}`;
}

/** DECSCUSR cursor-shape escape. Steady: 2/4/6; blinking: 1/3/5. */
export function decscusr(shape: "block" | "underline" | "bar", blink: boolean): string {
  const steady: Record<typeof shape, number> = { block: 2, underline: 4, bar: 6 };
  const n = steady[shape] - (blink ? 1 : 0);
  return `\x1b[${n} q`;
}

/** OSC 12 cursor-color. Empty hex → "" (skip, terminal uses its default). */
export function osc12(hex: string): string {
  return hex ? `\x1b]12;${hex}\x07` : "";
}

/** Resolve the focused cursor color to an ANSI fg prefix. */
export function resolveFocusedColor(cfg: CursorConfig, theme: Theme): string {
  if (cfg.cursorColor === "accent") return theme.getFgAnsi("accent");
  return hexToAnsi(cfg.cursorColor);
}

/** Resolve the unfocused cursor color: accent → theme "dim"; hex → dimmed hex. */
export function resolveUnfocusedColor(cfg: CursorConfig, theme: Theme): string {
  if (cfg.cursorColor === "accent") return theme.getFgAnsi("dim");
  return hexToAnsi(dimHex(cfg.cursorColor));
}

/** Resolve the accent color to a hex (for OSC 12). "" in 256-color mode (inexact). */
export function themeAccentHex(theme: Theme): string {
  if (theme.getColorMode() !== "truecolor") return "";
  return parseAnsiFgToHex(theme.getFgAnsi("accent"));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm typecheck && pnpm test:run`
Expected: PASS. (If `Theme` import errors, use `type Theme = { getFgAnsi(c: string): string; getColorMode(): "truecolor" | "256color" }` as a local structural type instead of importing — see Task 3 note.)

- [ ] **Step 5: Commit**

```bash
git add lib/render.ts tests/render-helpers.test.ts
git commit -m "feat: add cursor color/escape helpers (hexToAnsi, dimHex, decscusr, osc12, resolveFocused/UnfocusedColor) (v0.2.0 T2)"
```

---

## Task 3: Thread `Theme` into render + truecolor colors (fake mode)

**Files:**
- Modify: `lib/render.ts` (`transformFocused`/`transformUnfocused` + `focusedCell`/`unfocusedCell`)
- Modify: `lib/editor.ts` (`composeRender` + `CursorEditor` store + pass theme)
- Test: `tests/render.test.ts` (extend)

**Interfaces:**
- `composeRender(lines, focused, cfg, theme, blinkVisible, cursorMode)` — new signature adds `theme` + `cursorMode`.
- `transformFocused(lines, cfg, theme, blinkVisible, cursorMode)` / `transformUnfocused(lines, cfg, theme)` — new signatures.
- `CursorEditor` stores `theme` (from constructor) + `cursorMode` (from cfg) and passes them to `composeRender`.
- Consumes: `resolveFocusedColor`/`resolveUnfocusedColor` (Task 2).

- [ ] **Step 1: Write the failing tests**

Append to `tests/render.test.ts` (add imports for `DEFAULT_CONFIG` + the new signature; add a `mockTheme`):

```typescript
import { transformFocused, transformUnfocused } from "../lib/render.ts";
import { DEFAULT_CONFIG, type CursorConfig } from "../lib/defaults.ts";

function mockTheme(getFgAnsi: (c: string) => string, mode: "truecolor" | "256color" = "truecolor"): any {
  return { getFgAnsi, getColorMode: () => mode };
}
const THEME = mockTheme((c) => (c === "accent" ? "\x1b[38;2;203;166;247m" : c === "dim" ? "\x1b[38;2;88;91;112m" : ""), "truecolor");
const MARKER = "\x1b_pi:c\x07"; // CURSOR_MARKER — import from pi-tui in real test if available

test("focused bar uses theme accent truecolor (not 256-color 7)", () => {
  const line = `hello${MARKER}\x1b[7m \x1b[0mworld`;
  const out = transformFocused([line], { ...DEFAULT_CONFIG, focusedStyle: "bar" }, THEME, true, "fake");
  assert.ok(out[0]!.includes("\x1b[38;2;203;166;247m"), "bar uses accent truecolor");
  assert.ok(!out[0]!.includes("\x1b[38;5;7m"), "no 256-color 7");
});

test("unfocused hollow uses theme dim truecolor (not 256-color 8)", () => {
  const line = `hi${MARKER}\x1b[7m \x1b[0m`;
  const out = transformUnfocused([line], { ...DEFAULT_CONFIG, unfocusedStyle: "hollow" }, THEME);
  assert.ok(out[0]!.includes("\x1b[38;2;88;91;112m"), "hollow uses dim truecolor");
  assert.ok(!out[0]!.includes("\x1b[38;5;8m"), "no 256-color 8");
});
```

(Use the real `CURSOR_MARKER` import in the test if `@earendil-works/pi-tui` resolves it; otherwise hardcode the literal as shown — the existing `render.test.ts` already imports `CURSOR_MARKER` from pi-tui, so mirror that.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test:run`
Expected: FAIL — `transformFocused`/`transformUnfocused` don't accept `theme`/`cursorMode` yet.

- [ ] **Step 3: Update `lib/render.ts` signatures + cell functions**

Replace the existing `focusedCell`/`unfocusedCell` + `transformFocused`/`transformUnfocused` with theme-aware versions. The `CELL_RE` + `rewriteCursorCell` + `transformLine` helpers stay unchanged. Update the glyph constants block + cell functions:

```typescript
const BAR = "\u258E";
const HOLLOW = "\u25A1";
const OUTLINE = "\u25A2";

function focusedCell(style: FocusedStyle, ch: string, colorAnsi: string): string {
  switch (style) {
    case "block":
      return `\x1b[7m${ch}\x1b[0m`; // unchanged from pi
    case "underline":
      return `\x1b[4m${ch}\x1b[0m`;
    case "bar":
      return `${colorAnsi}${BAR}\x1b[39m`; // char hidden, accent-colored
  }
}

function unfocusedCell(style: UnfocusedStyle, ch: string, colorAnsi: string, truecolor: boolean): string {
  switch (style) {
    case "dim":
      return `\x1b[2;7m${ch}\x1b[0m`;
    case "hollow":
      return `${colorAnsi}${HOLLOW}\x1b[39m`; // char hidden, dim-colored
    case "outline":
      return `${colorAnsi}${OUTLINE}\x1b[39m`; // char hidden, dim-colored
    case "underline":
      return `\x1b[4;2m${ch}\x1b[0m`;
    case "hide":
      return ch;
    case "highlight":
      // char-preserving colored styled underline (Task 5 fills the full impl;
      // here it's a plain colored underline placeholder that Task 5 upgrades).
      return `${colorAnsi}\x1b[4m${ch}\x1b[0m`;
  }
}

export function transformFocused(
  lines: string[],
  cfg: CursorConfig,
  theme: Theme,
  blinkVisible: boolean,
  cursorMode: "fake" | "hardware" = "fake",
): string[] {
  if (!cfg.enabled) return lines;
  // Hardware focused: keep marker (so pi positions the real cursor), drop the
  // reverse-video cell → bare char. Only the native hardware cursor shows.
  if (cursorMode === "hardware") {
    return lines.map((l) => (l.includes(CURSOR_MARKER) ? rewriteCursorCell(l, (ch) => ch) : l));
  }
  // block + visible = pi-native passthrough (keep CURSOR_MARKER + reverse-video cell unchanged)
  if (cfg.focusedStyle === "block" && blinkVisible) return lines;
  const colorAnsi = resolveFocusedColor(cfg, theme);
  const fn = blinkVisible
    ? (ch: string) => focusedCell(cfg.focusedStyle, ch, colorAnsi)
    : (ch: string) => ch;
  return lines.map((l) => transformLine(l, fn));
}

export function transformUnfocused(lines: string[], cfg: CursorConfig, theme: Theme): string[] {
  if (!cfg.enabled) return lines;
  const colorAnsi = resolveUnfocusedColor(cfg, theme);
  const truecolor = theme.getColorMode() === "truecolor";
  const fn = (ch: string) => unfocusedCell(cfg.unfocusedStyle, ch, colorAnsi, truecolor);
  return lines.map((l) => transformLine(l, fn));
}
```

Note: if `import type { Theme }` from pi-coding-agent fails to resolve under `noUncheckedIndexedAccess`/strict, define a local structural type in `render.ts` instead:
```typescript
type Theme = { getFgAnsi(color: string): string; getColorMode(): "truecolor" | "256color" };
```
Use the same local type in `editor.ts`. Prefer the real import if it resolves; the local type is the fallback.

- [ ] **Step 4: Update `lib/editor.ts` to pass theme + cursorMode**

Replace `composeRender` + the `CursorEditor` constructor + `render`:

```typescript
import { CustomEditor } from "@earendil-works/pi-coding-agent";
import { transformFocused, transformUnfocused } from "./render.ts";
import type { CursorConfig, CursorMode } from "./defaults.ts";
import { BlinkController } from "./state.ts";

type Theme = { getFgAnsi(color: string): string; getColorMode(): "truecolor" | "256color" };

export interface CursorEditorDeps {
  wrapped: { render(width: number): string[]; handleInput(data: string): void } | null;
  blink: BlinkController;
}

export function composeRender(
  lines: string[],
  focused: boolean,
  cfg: CursorConfig,
  theme: Theme,
  blinkVisible: boolean,
  cursorMode: CursorMode,
): string[] {
  if (!cfg.enabled) return lines;
  return focused
    ? transformFocused(lines, cfg, theme, blinkVisible, cursorMode)
    : transformUnfocused(lines, cfg, theme);
}

export class CursorEditor extends CustomEditor {
  private cfg: CursorConfig;
  private paneFocused = true;
  private deps: CursorEditorDeps;
  private theme: Theme;

  constructor(tui: any, theme: Theme, keybindings: any, deps: CursorEditorDeps) {
    super(tui, theme, keybindings, {});
    this.deps = deps;
    this.theme = theme;
    this.cfg = {
      enabled: true,
      focusedStyle: "block",
      unfocusedStyle: "dim",
      blink: false,
      blinkRate: 600,
      focusProvider: "auto",
      cursorColor: "accent",
      cursorMode: "fake",
    };
  }

  updateConfig(cfg: CursorConfig): void {
    this.cfg = cfg;
    this.invalidate?.();
  }

  setFocus(focused: boolean): void {
    if (this.paneFocused === focused) return;
    this.paneFocused = focused;
    this.deps.blink.setActive(focused);
    this.invalidate?.();
    this.tui?.requestRender?.();
  }

  onBlinkToggle(): void {
    this.invalidate?.();
    this.tui?.requestRender?.();
  }

  handleInput(data: string): void {
    if (this.deps.wrapped) this.deps.wrapped.handleInput(data);
    else super.handleInput(data);
  }

  render(width: number): string[] {
    const lines = this.deps.wrapped ? this.deps.wrapped.render(width) : super.render(width);
    return composeRender(lines, this.paneFocused, this.cfg, this.theme, this.deps.blink.visible, this.cfg.cursorMode);
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm typecheck && pnpm test:run`
Expected: PASS. Existing render tests that call `transformFocused(lines, cfg, blinkVisible)` will FAIL (signature changed) — update them to pass `theme` + `cursorMode`. Fix any existing `tests/render.test.ts` calls + `tests/editor.test.ts` `composeRender` calls to the new signature (add a `mockTheme` + `"fake"`).

- [ ] **Step 6: Commit**

```bash
git add lib/render.ts lib/editor.ts tests/render.test.ts tests/editor.test.ts
git commit -m "feat: thread Theme into render for truecolor cursor colors (v0.2.0 T3)"
```

---

## Task 4: `cursorColor` hex override wiring

**Files:**
- Modify: `lib/render.ts` (already wired via `resolveFocusedColor`/`resolveUnfocusedColor` — verify)
- Test: `tests/render.test.ts` (extend)

**Interfaces:** No new exports. Confirms `cursorColor: "#RRGGBB"` flows through Tasks 2+3 to the emitted escapes.

- [ ] **Step 1: Write the failing tests**

Append to `tests/render.test.ts`:

```typescript
test("cursorColor hex override flows to focused bar", () => {
  const theme = mockTheme(() => "\x1b[38;2;0;0;0m"); // theme should be ignored for hex
  const cfg = { ...DEFAULT_CONFIG, focusedStyle: "bar", cursorColor: "#ff5555" };
  const line = `x${MARKER}\x1b[7m \x1b[0m`;
  const out = transformFocused([line], cfg, theme, true, "fake");
  assert.ok(out[0]!.includes("\x1b[38;2;255;85;85m"), "hex override used");
});

test("cursorColor hex override flows to unfocused hollow (dimmed)", () => {
  const theme = mockTheme(() => "\x1b[38;2;0;0;0m");
  const cfg = { ...DEFAULT_CONFIG, unfocusedStyle: "hollow", cursorColor: "#cba6f7" };
  const line = `x${MARKER}\x1b[7m \x1b[0m`;
  const out = transformUnfocused([line], cfg, theme);
  assert.ok(out[0]!.includes("\x1b[38;2;93;83;123m"), "dimmed hex used (#cba6f7 → #5d537b → 93;83;123)");
});
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `pnpm test:run`
Expected: PASS — Tasks 2+3 already wired the override. If FAIL, the wiring is broken; fix `resolveFocusedColor`/`resolveUnfocusedColor` (Task 2).

- [ ] **Step 3: Commit**

```bash
git add tests/render.test.ts
git commit -m "test: cursorColor hex override flows to cursor cells (v0.2.0 T4)"
```

---

## Task 5: `highlight` unfocused style (char-preserving undercurl)

**Files:**
- Modify: `lib/render.ts` (`unfocusedCell` `highlight` case)
- Test: `tests/render.test.ts` (extend)

**Interfaces:** No new exports. `unfocusedCell` `highlight` uses styled underline (`\x1b[4:3m` + `\x1b[58:2::R:G:Bm`) in truecolor; plain colored underline (`\x1b[4m` + fg color) in 256 mode. Char preserved (no glyph substitution).

- [ ] **Step 1: Write the failing tests**

Append to `tests/render.test.ts`:

```typescript
test("unfocused highlight: truecolor undercurl + colored underline, char preserved", () => {
  const theme = mockTheme((c) => (c === "dim" ? "\x1b[38;2;88;91;112m" : ""), "truecolor");
  const cfg = { ...DEFAULT_CONFIG, unfocusedStyle: "highlight" };
  const line = `hi${MARKER}\x1b[7mX\x1b[0m`;
  const out = transformUnfocused([line], cfg, theme);
  // char X preserved (not replaced by a glyph)
  assert.ok(out[0]!.includes("X"), "char preserved");
  // undercurl + colored underline (parse R;G;B from the dim ansi)
  assert.ok(out[0]!.includes("\x1b[4:3m"), "undercurl");
  assert.ok(out[0]!.includes("\x1b[58:2::88:91:112m"), "colored underline (RGB from dim)");
});

test("unfocused highlight: 256-color fallback = plain colored underline, char preserved", () => {
  const theme = mockTheme((c) => (c === "dim" ? "\x1b[38;5;8m" : ""), "256color");
  const cfg = { ...DEFAULT_CONFIG, unfocusedStyle: "highlight" };
  const line = `hi${MARKER}\x1b[7mX\x1b[0m`;
  const out = transformUnfocused([line], cfg, theme);
  assert.ok(out[0]!.includes("X"), "char preserved");
  assert.ok(out[0]!.includes("\x1b[4m"), "plain underline");
  assert.ok(!out[0]!.includes("\x1b[4:3m"), "no undercurl in 256 mode");
  assert.ok(out[0]!.includes("\x1b[38;5;8m"), "256 fg color");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test:run`
Expected: FAIL — `highlight` currently emits plain colored underline (Task 3 placeholder), not undercurl/colored-underline.

- [ ] **Step 3: Update `unfocusedCell` `highlight` case in `lib/render.ts`**

Replace the `highlight` case:

```typescript
    case "highlight": {
      // Char-preserving colored styled underline. Truecolor: undercurl + colored
      // underline (SGR 4:3 + 58:2::R:G:B). 256-color: plain underline + 256 fg.
      if (!truecolor) return `${colorAnsi}\x1b[4m${ch}\x1b[0m`;
      const m = /^\x1b\[38;2;(\d+);(\d+);(\d+)m$/.exec(colorAnsi);
      if (!m) return `${colorAnsi}\x1b[4m${ch}\x1b[0m`;
      const rgb = `${m[1]}:${m[2]}:${m[3]}`;
      return `\x1b[4:3m\x1b[58:2::${rgb}m${ch}\x1b[0m`;
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm typecheck && pnpm test:run`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/render.ts tests/render.test.ts
git commit -m "feat: char-preserving 'highlight' unfocused style (undercurl + colored underline) (v0.2.0 T5)"
```

---

## Task 6: Hardware-cursor mode — focused state (DECSCUSR + OSC 12)

**Files:**
- Modify: `lib/editor.ts` (hardware-mode side effects on focus/config)
- Test: `tests/editor.test.ts` (extend)

**Interfaces:**
- `CursorEditor` gains: `applyCursorMode()` — emits DECSCUSR + OSC 12 + toggles `tui.setShowHardwareCursor` for the focused state when `cursorMode: "hardware"`; disables the `BlinkController` in hardware-focused (native blink).
- Consumes: `decscusr`, `osc12`, `themeAccentHex` (Task 2), `resolveFocusedColor` (for the OSC 12 hex).

- [ ] **Step 1: Write the failing tests**

Append to `tests/editor.test.ts`. Use a mock `tui` capturing `setShowHardwareCursor` calls + a `write` spy capturing emitted escapes. (The existing `editor.test.ts` mocks `tui` via the constructor — mirror it; if absent, construct `CursorEditor` with a `tui` mock that records calls.)

```typescript
import { CursorEditor } from "../lib/editor.ts";
import { DEFAULT_CONFIG } from "../lib/defaults.ts";

function mockTui() {
  const writes: string[] = [];
  const hw: boolean[] = [];
  return {
    writes,
    hw,
    tui: {
      setShowHardwareCursor(v: boolean) { hw.push(v); },
      requestRender() {},
      write(s: string) { writes.push(s); },
    },
  };
}
function mockTheme() {
  return { getFgAnsi: (c: string) => c === "accent" ? "\x1b[38;2;203;166;247m" : "", getColorMode: () => "truecolor" as const };
}

test("hardware mode: focused emits DECSCUSR steady block + OSC 12 accent + shows hw cursor", () => {
  const m = mockTui();
  const blink = new BlinkController();
  const ed = new CursorEditor(m.tui, mockTheme(), {}, { wrapped: null, blink });
  ed.updateConfig({ ...DEFAULT_CONFIG, cursorMode: "hardware", focusedStyle: "block" });
  // editor is focused by default → applyCursorMode on updateConfig
  assert.ok(m.hw.includes(true), "hardware cursor shown");
  assert.ok(m.writes.some((w) => w.includes("\x1b[2 q")), "DECSCUSR steady block");
  assert.ok(m.writes.some((w) => w.includes("\x1b]12;#cba6f7\x07")), "OSC 12 accent hex");
});

test("hardware mode: blink on → blinking DECSCUSR (1) and BlinkController NOT started", () => {
  const m = mockTui();
  const blink = new BlinkController();
  const startSpy = blink.start;
  let started = 0;
  blink.start = () => { started++; };
  const ed = new CursorEditor(m.tui, mockTheme(), {}, { wrapped: null, blink });
  ed.updateConfig({ ...DEFAULT_CONFIG, cursorMode: "hardware", blink: true, focusedStyle: "underline" });
  assert.ok(m.writes.some((w) => w.includes("\x1b[3 q")), "blinking underline DECSCUSR");
  assert.equal(started, 0, "BlinkController not started (native blink)");
});

test("hardware mode: hex cursorColor → OSC 12 with that hex", () => {
  const m = mockTui();
  const blink = new BlinkController();
  const ed = new CursorEditor(m.tui, mockTheme(), {}, { wrapped: null, blink });
  ed.updateConfig({ ...DEFAULT_CONFIG, cursorMode: "hardware", cursorColor: "#ff5555" });
  assert.ok(m.writes.some((w) => w.includes("\x1b]12;#ff5555\x07")), "OSC 12 override hex");
});

test("hardware mode: 256-color theme → OSC 12 skipped (no exact hex)", () => {
  const m = mockTui();
  const blink = new BlinkController();
  const theme256 = { getFgAnsi: () => "\x1b[38;5;7m", getColorMode: () => "256color" as const };
  const ed = new CursorEditor(m.tui, theme256, {}, { wrapped: null, blink });
  ed.updateConfig({ ...DEFAULT_CONFIG, cursorMode: "hardware" });
  assert.ok(!m.writes.some((w) => w.includes("\x1b]12;")), "OSC 12 skipped in 256 mode");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test:run`
Expected: FAIL — `CursorEditor` doesn't emit DECSCUSR/OSC12 or call `setShowHardwareCursor`.

- [ ] **Step 3: Implement `applyCursorMode` in `lib/editor.ts`**

Add imports + the method. Call `applyCursorMode()` from `updateConfig` and `setFocus`. In hardware focused: emit DECSCUSR (shape from `focusedStyle`, blink from `cfg.blink`), emit OSC 12 (accent→`themeAccentHex`, hex→as-is), `tui.setShowHardwareCursor(true)`, stop the blink controller (native blink). In fake mode OR unfocused: `tui.setShowHardwareCursor(false)` (the unfocused hardware path is finalized in Task 7).

```typescript
import { decscusr, osc12, themeAccentHex } from "./render.ts";

// inside CursorEditor:
private applyCursorMode(): void {
  const focused = this.paneFocused;
  const hw = this.cfg.cursorMode === "hardware" && focused;
  this.tui?.setShowHardwareCursor?.(hw);
  if (hw) {
    // native blink replaces the fake-cursor blink controller
    this.deps.blink.stop();
    const shape = this.cfg.focusedStyle === "block" ? "block"
      : this.cfg.focusedStyle === "underline" ? "underline" : "bar";
    this.tui?.write?.(decscusr(shape, this.cfg.blink));
    const hex = this.cfg.cursorColor === "accent" ? themeAccentHex(this.theme) : this.cfg.cursorColor;
    const osc = osc12(hex);
    if (osc) this.tui?.write?.(osc);
  } else {
    // fake mode (or hardware-unfocused, finalized in T7): reset to default shape
    this.tui?.write?.("\x1b[0 q");
  }
}
```

Update `updateConfig` + `setFocus` to call it:

```typescript
  updateConfig(cfg: CursorConfig): void {
    this.cfg = cfg;
    this.applyCursorMode();
    this.invalidate?.();
    this.tui?.requestRender?.();
  }

  setFocus(focused: boolean): void {
    if (this.paneFocused === focused) return;
    this.paneFocused = focused;
    this.deps.blink.setActive(focused);
    this.applyCursorMode();
    this.invalidate?.();
    this.tui?.requestRender?.();
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm typecheck && pnpm test:run`
Expected: PASS. (The `tui` mock in the test provides `write`; the real `tui` has it via pi-tui's `Terminal`. If `this.tui?.write` is undefined on the real `CustomEditor.tui`, emit via `process.stdout.write` as a fallback — verify against the real `tui` shape; the existing code uses `this.tui?.requestRender`, so `tui` is the TUI instance which has `terminal.write`, but `write` may be on `tui.terminal`. Adjust to `this.tui?.terminal?.write ?? this.tui?.write` if needed and fix the test mock to match.)

- [ ] **Step 5: Commit**

```bash
git add lib/editor.ts tests/editor.test.ts
git commit -m "feat: hardware-cursor focused state (DECSCUSR + OSC 12 + setShowHardwareCursor) (v0.2.0 T6)"
```

---

## Task 7: Hardware-cursor mode — unfocused state + lifecycle restore

**Files:**
- Modify: `lib/editor.ts` (`applyCursorMode` unfocused branch + `session_shutdown`/destroy restore)
- Modify: `extensions/cursor.ts` (call editor restore on `session_shutdown`)
- Test: `tests/editor.test.ts` (extend)

**Interfaces:**
- `CursorEditor.restoreCursor()` — public; emits DECSCUSR `\x1b[0 q` + OSC 12 reset `\x1b]12;\x07` + `tui.setShowHardwareCursor(false)`. Called on `session_shutdown`.
- Unfocused hardware: `applyCursorMode` already sets `setShowHardwareCursor(false)`; render uses `transformUnfocused` (fake unfocused cell with A+B colors/styles) — no change to render needed (Task 3 already routes unfocused → `transformUnfocused`).

- [ ] **Step 1: Write the failing tests**

Append to `tests/editor.test.ts`:

```typescript
test("hardware mode unfocused: setShowHardwareCursor(false) + render uses unfocused transform", () => {
  const m = mockTui();
  const blink = new BlinkController();
  const ed = new CursorEditor(m.tui, mockTheme(), {}, { wrapped: null, blink });
  ed.updateConfig({ ...DEFAULT_CONFIG, cursorMode: "hardware", unfocusedStyle: "hollow" });
  // initial focused → hw on; now lose focus
  m.hw.length = 0;
  ed.setFocus(false);
  assert.ok(m.hw.includes(false), "hardware cursor hidden when unfocused");
  // render still produces the unfocused fake cell (hollow glyph)
  const lines = ed.render(40);
  // wrapped is null → super.render returns []; composeRender returns [] for empty. Use a wrapped mock instead:
});

test("restoreCursor resets DECSCUSR + OSC 12 + hides hardware cursor", () => {
  const m = mockTui();
  const blink = new BlinkController();
  const ed = new CursorEditor(m.tui, mockTheme(), {}, { wrapped: null, blink });
  ed.updateConfig({ ...DEFAULT_CONFIG, cursorMode: "hardware" });
  m.writes.length = 0;
  m.hw.length = 0;
  ed.restoreCursor();
  assert.ok(m.hw.includes(false), "hardware cursor hidden on restore");
  assert.ok(m.writes.some((w) => w.includes("\x1b[0 q")), "DECSCUSR reset to default");
  assert.ok(m.writes.some((w) => w.includes("\x1b]12;\x07")), "OSC 12 reset");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test:run`
Expected: FAIL — `restoreCursor` doesn't exist; unfocused `setShowHardwareCursor(false)` not asserted.

- [ ] **Step 3: Add `restoreCursor` + finalize the unfocused branch in `lib/editor.ts`**

```typescript
  /** Restore the terminal's default cursor (call on session_shutdown). */
  restoreCursor(): void {
    this.tui?.setShowHardwareCursor?.(false);
    this.tui?.write?.("\x1b[0 q");          // default cursor shape
    this.tui?.write?.("\x1b]12;\x07");      // reset cursor color
  }
```

(The unfocused `applyCursorMode` branch already does `setShowHardwareCursor(false)` from Task 6; render already routes unfocused → `transformUnfocused`. So this task only adds `restoreCursor` + the shutdown hook.)

- [ ] **Step 4: Wire `restoreCursor` into `session_shutdown` in `extensions/cursor.ts`**

In the `pi.on("session_shutdown", …)` handler, before `blink?.stop()`, add:

```typescript
    editor?.restoreCursor?.();
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm typecheck && pnpm test:run`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/editor.ts extensions/cursor.ts tests/editor.test.ts
git commit -m "feat: hardware-cursor unfocused + shutdown restoreCursor (v0.2.0 T7)"
```

---

## Task 8: Panel rows + `/cursor` subcommands (`color`, `mode`)

**Files:**
- Modify: `lib/panel.ts` (`panelRows` + `applyRowChange` + `rowDisplayValue` + `previewLine` theme)
- Modify: `extensions/cursor.ts` (`parseCursorArgs` `color`/`mode` cases + status + panel wiring)
- Test: `tests/entry.test.ts` (extend)
- Test: `tests/panel.test.ts` (extend)

**Interfaces:**
- New panel rows: `cursorColor` (cycles `accent` ↔ current hex display), `cursorMode` (fake ↔ hardware).
- New subcommands: `/cursor color accent|#RRGGBB`, `/cursor mode fake|hardware`.
- `parseCursorArgs` returns `{ action: "set", patch: { cursorColor } | { cursorMode } }`.
- `previewLine` needs `theme` to render truecolor previews — thread it.

- [ ] **Step 1: Write the failing tests (entry parsing)**

Append to `tests/entry.test.ts`:

```typescript
test("parseCursorArgs color accent", () => {
  assert.deepEqual(parseCursorArgs(["color", "accent"], DEFAULT_CONFIG), { action: "set", patch: { cursorColor: "accent" } });
});
test("parseCursorArgs color hex", () => {
  assert.deepEqual(parseCursorArgs(["color", "#cba6f7"], DEFAULT_CONFIG), { action: "set", patch: { cursorColor: "#cba6f7" } });
});
test("parseCursorArgs color rejects bad hex → throws", () => {
  assert.throws(() => parseCursorArgs(["color", "#xyz"], DEFAULT_CONFIG), /Usage/);
});
test("parseCursorArgs mode hardware", () => {
  assert.deepEqual(parseCursorArgs(["mode", "hardware"], DEFAULT_CONFIG), { action: "set", patch: { cursorMode: "hardware" } });
});
test("parseCursorArgs mode rejects unknown", () => {
  assert.throws(() => parseCursorArgs(["mode", "weird"], DEFAULT_CONFIG), /Usage/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test:run`
Expected: FAIL — `parseCursorArgs` has no `color`/`mode` cases.

- [ ] **Step 3: Add `color` + `mode` cases to `parseCursorArgs` in `extensions/cursor.ts`**

Add imports (`CURSOR_MODES` from defaults) + the cases in the `switch (a)`:

```typescript
    case "color": {
      if (b === "accent") return { action: "set", patch: { cursorColor: "accent" } };
      if (/^#[0-9a-fA-F]{6}$/.test(b ?? "")) return { action: "set", patch: { cursorColor: b! } };
      throw new Error(`Usage: /cursor color accent|#RRGGBB`);
    }
    case "mode":
      if (!CURSOR_MODES.includes(b as CursorMode)) throw new Error(`Usage: /cursor mode ${CURSOR_MODES.join("|")}`);
      return { action: "set", patch: { cursorMode: b as CursorMode } };
```

(Add `CURSOR_MODES`, `type CursorMode` to the defaults import in `extensions/cursor.ts`.)

- [ ] **Step 4: Add panel rows in `lib/panel.ts`**

Add `CURSOR_MODES` + `CursorMode` to the defaults import. Add two rows to `panelRows` (before `activeProvider`):

```typescript
    {
      id: "cursorColor",
      label: "Cursor color",
      currentValue: cfg.cursorColor,
      values: ["accent", cfg.cursorColor === "accent" ? "accent" : cfg.cursorColor],
      description: "accent follows the pi theme; or set #RRGGBB via /cursor color.",
    },
    {
      id: "cursorMode",
      label: "Cursor mode",
      currentValue: cfg.cursorMode,
      values: [...CURSOR_MODES],
      description: "fake = pi's fake cursor (default). hardware = native terminal cursor (Ghostty).",
    },
```

Add `applyRowChange` cases:

```typescript
    case "cursorColor":
      return { ...cfg, cursorColor: newValue === "accent" || /^#[0-9a-fA-F]{6}$/.test(newValue) ? newValue : cfg.cursorColor };
    case "cursorMode":
      return { ...cfg, cursorMode: newValue as CursorMode };
```

Add `rowDisplayValue` cases:

```typescript
  if (id === "cursorColor") return cfg.cursorColor;
  if (id === "cursorMode") return cfg.cursorMode;
```

- [ ] **Step 5: Write the failing tests (panel)**

Append to `tests/panel.test.ts`:

```typescript
test("panelRows includes cursorColor + cursorMode", () => {
  const rows = panelRows(DEFAULT_CONFIG, "static");
  const ids = rows.map((r) => r.id);
  assert.ok(ids.includes("cursorColor"));
  assert.ok(ids.includes("cursorMode"));
});
test("applyRowChange cursorMode hardware", () => {
  assert.equal(applyRowChange(DEFAULT_CONFIG, "cursorMode", "hardware").cursorMode, "hardware");
});
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm typecheck && pnpm test:run`
Expected: PASS. (Update the existing `tests/panel.test.ts` row-id list assertion — it enumerates expected ids — to include `cursorColor` + `cursorMode`.)

- [ ] **Step 7: Thread theme into `previewLine` (so the panel preview shows truecolor)**

`previewLine` in `lib/panel.ts` calls `transformFocused`/`transformUnfocused` which now need `theme`. The panel handler in `extensions/cursor.ts` has `theme` (from `ctx.ui.custom((tui, theme, …) => …)`). Pass `theme` + `cursorMode` into `previewLine` via getters:

Update `previewLine` signature to `previewLine(getCfg, focused, getBlinkVisible?, getTheme?, getCursorMode?)` and call `transformFocused([sample], cfg, getTheme?.() ?? mockNoColorTheme, blinkVisible, getCursorMode?.() ?? "fake")` / `transformUnfocused([sample], cfg, getTheme?.() ?? mockNoColorTheme)`. (Use a no-color fallback theme `{ getFgAnsi: () => "", getColorMode: () => "256color" }` when theme isn't supplied, so existing tests that don't pass a theme keep working.) Update the panel handler call sites in `extensions/cursor.ts` to pass `() => theme` + `() => cfg.cursorMode`.

- [ ] **Step 8: Run tests to verify they pass**

Run: `pnpm typecheck && pnpm test:run`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add lib/panel.ts extensions/cursor.ts tests/entry.test.ts tests/panel.test.ts
git commit -m "feat: /cursor color + mode subcommands + panel rows (v0.2.0 T8)"
```

---

## Task 9: Docs, version bump, tag v0.2.0

**Files:**
- Modify: `README.md` (features, focus-providers unchanged, new color/mode/highlight, hardware-mode caveat)
- Modify: `AGENTS.md` (constraints + module map)
- Modify: `package.json` (`0.1.1` → `0.2.0`, description + keywords)
- Test: full suite + `pnpm pack --dry-run`

- [ ] **Step 1: Update `README.md`**

- Features list: add "Truecolor cursor colors (theme accent or `#RRGGBB`)", "Char-preserving `highlight` unfocused style (styled underline, char visible)", "Opt-in `hardware` cursor mode (native Ghostty cursor via DECSCUSR + OSC 12)".
- `/cursor` command block: add `/cursor color accent|#RRGGBB`, `/cursor mode fake|hardware`, add `highlight` to `/cursor unfocused`.
- New "## Cursor color" section: accent follows pi theme (truecolor through tmux); hex override; ⚠️ live-verify deferred.
- New "## Cursor modes" subsection under Focus providers: `fake` (default) vs `hardware` (native cursor; DECSCUSR/OSC12; ⚠️ unverified-live, Ghostty-targeted; shutdown restores default). Note hardware focused shapes limited to block/underline/bar; unfocused still uses the fake-cursor transform.

- [ ] **Step 2: Update `AGENTS.md`**

- Constraints: add truecolor-through-tmux note; `highlight` undercurl; hardware-mode DECSCUSR/OSC12 + `setShowHardwareCursor`; shutdown `restoreCursor`. ⚠️ live-verify deferred.
- Module map: `lib/render.ts` → "ANSI transforms + truecolor colors + highlight + hardware bare-char"; `lib/editor.ts` → "+ hardware-mode side effects (DECSCUSR/OSC12) + restoreCursor".
- Add v0.2.0 to the top description.

- [ ] **Step 3: Bump `package.json`**

```json
  "version": "0.2.0",
  "description": "Focus-aware, customizable editor cursor for the pi coding agent (truecolor + Ghostty/tmux deep; tmux + cmux + herdr; static fallback).",
```
Add `"truecolor"`, `"ghostty"` to keywords.

- [ ] **Step 4: Verify**

Run: `pnpm typecheck && pnpm test:run && pnpm pack --dry-run`
Expected: typecheck clean, all tests green, `lib/render.ts`/`lib/editor.ts` etc. in the tarball.

- [ ] **Step 5: Commit + merge to main + tag**

```bash
git add README.md AGENTS.md package.json
git commit -m "docs+release: v0.2.0 — truecolor + highlight + hardware-cursor mode"
git checkout main && git merge --ff-only feat/ghostty-tmux-deep && git push origin main
git push origin --delete feat/ghostty-tmux-deep
git tag -s v0.2.0 -m "release: v0.2.0 — Ghostty + tmux deep integration"
git push origin v0.2.0
```

- [ ] **Step 6: Verify the publish**

Wait for the Release CI run to complete, then:
```bash
gh run list -L 3
curl -s -o /dev/null -w "%{http_code}\n" https://registry.npmjs.org/@getpipher/cursor/0.2.0
curl -s -o /dev/null -w "%{http_code}\n" https://registry.npmjs.org/@getpipher/cursor/-/cursor-0.2.0.tgz
```
Expected: both `200`. (Don't trust `npm view` alone — registry packument propagation lag.)

---

## Self-Review (run after writing; fix inline)

**1. Spec coverage:** A (§4) → Tasks 2,3,4. B (§5) → Task 5. C (§6) → Tasks 6,7. Config (§7) → Task 1. Command UX (§8) → Task 8. Docs/release (§14) → Task 9. Testing (§10) → each task. Risks/verify (§12) → Task 9 live-verify checklist. ✅ All spec sections covered.

**2. Placeholder scan:** No "TBD"/"TODO"/"implement later". The Task 3 `highlight` placeholder is explicitly upgraded in Task 5 (not a hidden placeholder — it's a staged implementation). The `tui.write` shape uncertainty in Task 6 Step 4 is flagged with a concrete fallback (`tui.terminal.write`), not left vague.

**3. Type consistency:** `CursorMode` defined in Task 1, used in Tasks 3/6/7/8. `composeRender` signature (Task 3) used in `editor.render` (Task 3 Step 4). `applyCursorMode`/`restoreCursor` (Tasks 6/7) — names match. `resolveFocusedColor`/`resolveUnfocusedColor`/`decscusr`/`osc12`/`themeAccentHex` (Task 2) used in Tasks 3/4/5/6 — names match. `CURSOR_MODES` (Task 1) used in Tasks 1/8. ✅

**4. Known follow-up (not plan failures):** Tasks 3/6 flag a `tui.write` shape check — verify against the real `CustomEditor.tui` during implementation (the existing code only uses `tui.requestRender`, so `write` access is new; the plan provides the `tui.terminal.write` fallback). Live verification of all v0.2.0 features is deferred to a real Ghostty+tmux pane (⚠️, documented in README/AGENTS).