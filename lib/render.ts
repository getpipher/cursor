import { CURSOR_MARKER } from "@earendil-works/pi-tui";
import type { CursorConfig, FocusedStyle, UnfocusedStyle } from "./defaults.ts";

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

// bar/hollow/outline glyphs in dim accent (256-color: 7 = light gray for bar, 8 = dark gray for hollow/outline).
const BAR = "\u258E"; // ▎
const HOLLOW = "\u25A1"; // □ sharp hollow block (matches focused block shape)
const OUTLINE = "\u25A2"; // ▢ rounded hollow square

function focusedCell(style: FocusedStyle, ch: string): string {
  switch (style) {
    case "block":
      return `\x1b[7m${ch}\x1b[0m`; // unchanged from pi
    case "underline":
      return `\x1b[4m${ch}\x1b[0m`;
    case "bar":
      return `\x1b[38;5;7m${BAR}\x1b[39m`; // char hidden
  }
}

function unfocusedCell(style: UnfocusedStyle, ch: string): string {
  switch (style) {
    case "dim":
      return `\x1b[2;7m${ch}\x1b[0m`;
    case "hollow":
      return `\x1b[38;5;8m${HOLLOW}\x1b[39m`; // char hidden (sharp hollow block)
    case "outline":
      return `\x1b[38;5;8m${OUTLINE}\x1b[39m`; // char hidden (rounded hollow square)
    case "underline":
      return `\x1b[4;2m${ch}\x1b[0m`;
    case "hide":
      return ch;
    case "highlight":
      return ch; // placeholder — T5 upgrades to undercurl + colored underline
  }
}

export function transformFocused(lines: string[], cfg: CursorConfig, blinkVisible: boolean): string[] {
  if (!cfg.enabled) return lines;
  // block + visible = pi-native passthrough (keep CURSOR_MARKER + reverse-video cell unchanged)
  if (cfg.focusedStyle === "block" && blinkVisible) return lines;
  // blink off-phase: render the bare char (hide). blink always blinks to invisible.
  const fn = blinkVisible
    ? (ch: string) => focusedCell(cfg.focusedStyle, ch)
    : (ch: string) => ch;
  return lines.map((l) => transformLine(l, fn));
}

export function transformUnfocused(lines: string[], cfg: CursorConfig): string[] {
  if (!cfg.enabled) return lines;
  const fn = (ch: string) => unfocusedCell(cfg.unfocusedStyle, ch);
  return lines.map((l) => transformLine(l, fn));
}