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

test("hexToAnsi malformed → empty", () => {
  assert.equal(hexToAnsi("#xyz"), "");
  assert.equal(hexToAnsi("cba6f7"), "");
});

test("dimHex halves each channel", () => {
  assert.equal(dimHex("#cba6f7"), "#65537b");
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
  assert.equal(resolveUnfocusedColor(cfg, theme), "\x1b[38;2;101;83;123m");
});