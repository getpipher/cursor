import { CURSOR_MARKER } from "@earendil-works/pi-tui";
import type { CursorConfig, FocusedStyle, UnfocusedStyle } from "./defaults.ts";

type Theme = { getFgAnsi(color: string): string; getColorMode(): "truecolor" | "256color" };

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
  const steady: Record<"block" | "underline" | "bar", number> = { block: 2, underline: 4, bar: 6 };
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

// pi renders the cursor as: CURSOR_MARKER + "\x1b[7m" + char + "\x1b[0m"
const CELL_RE = /\x1b\[7m([\s\S])\x1b\[0m/;

/** Replace the cursor cell on a single line via a replacer that returns the new cell text (no marker). */
function rewriteCursorCell(line: string, replacer: (ch: string) => string): string {
  const mi = line.indexOf(CURSOR_MARKER);
  if (mi === -1) return line;
  const after = line.slice(mi + CURSOR_MARKER.length);
  const m = after.match(CELL_RE);
  if (!m) return line.slice(0, mi) + after; // marker without the SGR wrapper: drop marker, keep rest
  const ch = m[1] ?? " ";
  const replacement = replacer(ch);
  const tail = after.slice(m[0].length);
  return line.slice(0, mi) + replacement + tail;
}

function transformLine(line: string, fn: (ch: string) => string): string {
  return line.includes(CURSOR_MARKER) ? rewriteCursorCell(line, fn) : line;
}

// bar/hollow/outline glyphs (color now comes from the theme via resolveFocused/UnfocusedColor).
const BAR = "\u258E"; // ▎
const HOLLOW = "\u25A1"; // □ sharp hollow block (matches focused block shape)
const OUTLINE = "\u25A2"; // ▢ rounded hollow square

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
      // char-preserving colored styled underline (T5 fills the full impl;
      // here it's a plain colored underline placeholder that T5 upgrades).
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
  // blink off-phase: render the bare char (hide). blink always blinks to invisible.
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