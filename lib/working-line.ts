import { visibleWidth } from "@earendil-works/pi-tui";

/** pi Loader default braille frames (pi-tui components/loader.js) — same animation as the native indicator. */
export const WORKING_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
export const WORKING_MESSAGE = "Working";
export const WORKING_INTERVAL_MS = 80;

/** Strip ANSI SGR sequences — local copy so we don't depend on newer pi-tui exports. */
export function stripAnsi(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;]*[A-Za-z]/g, "");
}

export interface WorkingLineColors {
  spinner: (s: string) => string;
  message: (s: string) => string;
  border: (s: string) => string;
}

/** Native streaming rule (pi default-editor style): `── ⠋ Working ────────`.
 *  Cursor's custom editor replaces the default editor, which loses this label-in-border
 *  composition (cursor#6) — this rebuilds it. Pure: caller supplies the color functions;
 *  the rendered line's visible width === `width` (ANSI-aware via pi-tui visibleWidth). */
export function workingBorderLine(
  width: number,
  frame: number,
  colors: WorkingLineColors,
): string {
  const w = Math.max(0, width);
  const frames = WORKING_FRAMES;
  const spin = frames[((frame % frames.length) + frames.length) % frames.length]!;
  const label = `${colors.border("── ")}${colors.spinner(spin)} ${colors.message(WORKING_MESSAGE)}${colors.border(" ")}`;
  const remaining = w - visibleWidth(label);
  return remaining >= 0 ? label + colors.border("─".repeat(remaining)) : label;
}
