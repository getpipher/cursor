import { test } from "node:test";
import assert from "node:assert/strict";
import { visibleWidth } from "@earendil-works/pi-tui";
import { WORKING_FRAMES, WORKING_MESSAGE, workingBorderLine } from "../lib/working-line.ts";

// No-op colors: assertions stay on visible composition.
const plain = (s: string) => s;
const colors = { spinner: plain, message: plain, border: plain };

test("workingBorderLine: native rule — '── ⠋ Working ' + dashes filling to width", () => {
  const line = workingBorderLine(80, 0, colors);
  assert.equal(line, `── ${WORKING_FRAMES[0]} ${WORKING_MESSAGE} ${"─".repeat(80 - 3 - 1 - 1 - WORKING_MESSAGE.length - 1)}`);
});

test("workingBorderLine: visible width === width for every frame (ANSI-safe)", () => {
  const accent = (s: string) => `\x1b[38;5;7m${s}\x1b[0m`;
  const muted = (s: string) => `\x1b[38;5;8m${s}\x1b[0m`;
  const border = (s: string) => `\x1b[38;5;8m${s}\x1b[0m`;
  for (let frame = 0; frame < WORKING_FRAMES.length; frame++) {
    const line = workingBorderLine(140, frame, { spinner: accent, message: muted, border });
    assert.equal(visibleWidth(line), 140, `frame ${frame}`);
  }
});

test("workingBorderLine: frame cycles through pi's braille set (negative-safe)", () => {
  assert.equal(workingBorderLine(80, 1, colors).slice(3, 4), WORKING_FRAMES[1 % WORKING_FRAMES.length]);
  assert.equal(workingBorderLine(80, -1, colors).slice(3, 4), WORKING_FRAMES[WORKING_FRAMES.length - 1]);
});

test("workingBorderLine: narrower than the label → label only, no negative padding", () => {
  const line = workingBorderLine(8, 0, colors);
  assert.ok(line.startsWith(`── ${WORKING_FRAMES[0]} ${WORKING_MESSAGE}`), "keeps the label content");
  assert.ok(!line.trimEnd().endsWith("───"), "no trailing dash run added");
});
