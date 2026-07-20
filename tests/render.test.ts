import { test } from "node:test";
import assert from "node:assert/strict";
import { CURSOR_MARKER } from "@earendil-works/pi-tui";
import { transformFocused, transformUnfocused } from "../lib/render.ts";
import { DEFAULT_CONFIG, type CursorConfig } from "../lib/defaults.ts";

// Mock theme returning the v0.1 256-color codes so the existing assertions
// (which encode 38;5;7 / 38;5;8) stay valid under the theme-threaded signature.
const THEME = {
  getFgAnsi: (c: string) => (c === "accent" ? "\x1b[38;5;7m" : c === "dim" ? "\x1b[38;5;8m" : ""),
  getColorMode: () => "256color" as const,
};

const cell = (ch: string) => `${CURSOR_MARKER}\x1b[7m${ch}\x1b[0m`;
const line = (ch: string) => `const x = ${cell(ch)}await;`;

test("focused block = passthrough (no transform)", () => {
  const l = line("f");
  assert.deepEqual(transformFocused([l], { ...DEFAULT_CONFIG, focusedStyle: "block" }, THEME, true), [l]);
});

test("focused underline = underline SGR on char", () => {
  assert.deepEqual(
    transformFocused([line("f")], { ...DEFAULT_CONFIG, focusedStyle: "underline" }, THEME, true),
    [`const x = \x1b[4mf\x1b[0mawait;`],
  );
});

test("focused bar = ▎ glyph replacing cell, char hidden", () => {
  assert.deepEqual(
    transformFocused([line("f")], { ...DEFAULT_CONFIG, focusedStyle: "bar" }, THEME, true),
    [`const x = \x1b[38;5;7m▎\x1b[39mawait;`],
  );
});

test("focused blinkVisible=false → hide regardless of style", () => {
  assert.deepEqual(
    transformFocused([line("f")], { ...DEFAULT_CONFIG, focusedStyle: "block" }, THEME, false),
    [`const x = fawait;`],
  );
  assert.deepEqual(
    transformFocused([line("f")], { ...DEFAULT_CONFIG, focusedStyle: "bar" }, THEME, false),
    [`const x = fawait;`],
  );
});

test("unfocused dim = dim+reverse", () => {
  assert.deepEqual(
    transformUnfocused([line("f")], { ...DEFAULT_CONFIG, unfocusedStyle: "dim" }, THEME),
    [`const x = \x1b[2;7mf\x1b[0mawait;`],
  );
});

test("unfocused hollow = □ sharp hollow block, char hidden", () => {
  assert.deepEqual(
    transformUnfocused([line("f")], { ...DEFAULT_CONFIG, unfocusedStyle: "hollow" }, THEME),
    [`const x = \x1b[38;5;8m□\x1b[39mawait;`],
  );
});

test("unfocused outline = ▢ rounded hollow square, char hidden", () => {
  assert.deepEqual(
    transformUnfocused([line("f")], { ...DEFAULT_CONFIG, unfocusedStyle: "outline" }, THEME),
    [`const x = \x1b[38;5;8m▢\x1b[39mawait;`],
  );
});

test("unfocused underline = dim underline", () => {
  assert.deepEqual(
    transformUnfocused([line("f")], { ...DEFAULT_CONFIG, unfocusedStyle: "underline" }, THEME),
    [`const x = \x1b[4;2mf\x1b[0mawait;`],
  );
});

test("unfocused hide = strip cursor", () => {
  assert.deepEqual(
    transformUnfocused([line("f")], { ...DEFAULT_CONFIG, unfocusedStyle: "hide" }, THEME),
    [`const x = fawait;`],
  );
});

test("multi-line: only the line with the cursor is transformed", () => {
  const a = "line one no cursor";
  const b = line("f");
  const c = "line three no cursor";
  assert.deepEqual(
    transformUnfocused([a, b, c], { ...DEFAULT_CONFIG, unfocusedStyle: "hide" }, THEME),
    [a, "const x = fawait;", c],
  );
});

test("no cursor in any line = passthrough", () => {
  assert.deepEqual(transformFocused(["nothing here"], DEFAULT_CONFIG, THEME, true), ["nothing here"]);
});

// --- v0.2.0 (A): truecolor via theme.getFgAnsi replaces the v0.1 256-color codes ---
const TRUECOLOR_THEME = {
  getFgAnsi: (c: string) => (c === "accent" ? "\x1b[38;2;203;166;247m" : c === "dim" ? "\x1b[38;2;88;91;112m" : ""),
  getColorMode: () => "truecolor" as const,
};

test("focused bar uses theme accent truecolor (not 256-color 7)", () => {
  const out = transformFocused([line("f")], { ...DEFAULT_CONFIG, focusedStyle: "bar" }, TRUECOLOR_THEME, true, "fake");
  assert.ok(out[0]!.includes("\x1b[38;2;203;166;247m"), "bar uses accent truecolor");
  assert.ok(!out[0]!.includes("\x1b[38;5;7m"), "no 256-color 7");
});

test("unfocused hollow uses theme dim truecolor (not 256-color 8)", () => {
  const out = transformUnfocused([line("f")], { ...DEFAULT_CONFIG, unfocusedStyle: "hollow" }, TRUECOLOR_THEME);
  assert.ok(out[0]!.includes("\x1b[38;2;88;91;112m"), "hollow uses dim truecolor");
  assert.ok(!out[0]!.includes("\x1b[38;5;8m"), "no 256-color 8");
});

test("hardware focused: bare char (marker kept, reverse-video dropped)", () => {
  const out = transformFocused([line("f")], { ...DEFAULT_CONFIG, cursorMode: "hardware" }, TRUECOLOR_THEME, true, "hardware");
  // char preserved, no reverse-video cell, marker dropped by rewriteCursorCell
  assert.ok(out[0]!.includes("fawait;"), "bare char preserved");
  assert.ok(!out[0]!.includes("\x1b[7m"), "no reverse-video");
});

// --- v0.2.0 (A): cursorColor hex override ---
test("cursorColor hex override flows to focused bar", () => {
  const theme = { getFgAnsi: () => "\x1b[38;2;0;0;0m", getColorMode: () => "truecolor" as const };
  const cfg: CursorConfig = { ...DEFAULT_CONFIG, focusedStyle: "bar", cursorColor: "#ff5555" };
  const out = transformFocused([line("f")], cfg, theme as any, true, "fake");
  assert.ok(out[0]!.includes("\x1b[38;2;255;85;85m"), "hex override used");
});

test("cursorColor hex override flows to unfocused hollow (dimmed)", () => {
  const theme = { getFgAnsi: () => "\x1b[38;2;0;0;0m", getColorMode: () => "truecolor" as const };
  const cfg: CursorConfig = { ...DEFAULT_CONFIG, unfocusedStyle: "hollow", cursorColor: "#cba6f7" };
  const out = transformUnfocused([line("f")], cfg, theme as any);
  assert.ok(out[0]!.includes("\x1b[38;2;101;83;123m"), "dimmed hex used (#cba6f7 → 101;83;123)");
});

// --- v0.2.0 (B): highlight unfocused style (char-preserving undercurl) ---
test("unfocused highlight: truecolor undercurl + colored underline, char preserved", () => {
  const theme = { getFgAnsi: (c: string) => (c === "dim" ? "\x1b[38;2;88;91;112m" : ""), getColorMode: () => "truecolor" as const };
  const cfg: CursorConfig = { ...DEFAULT_CONFIG, unfocusedStyle: "highlight" };
  const out = transformUnfocused([line("f")], cfg, theme as any);
  assert.ok(out[0]!.includes("f"), "char preserved");
  assert.ok(out[0]!.includes("\x1b[4:3m"), "undercurl");
  assert.ok(out[0]!.includes("\x1b[58:2::88:91:112m"), "colored underline (RGB from dim)");
});

test("unfocused highlight: 256-color fallback = plain colored underline, char preserved", () => {
  const theme = { getFgAnsi: (c: string) => (c === "dim" ? "\x1b[38;5;8m" : ""), getColorMode: () => "256color" as const };
  const cfg: CursorConfig = { ...DEFAULT_CONFIG, unfocusedStyle: "highlight" };
  const out = transformUnfocused([line("f")], cfg, theme as any);
  assert.ok(out[0]!.includes("f"), "char preserved");
  assert.ok(out[0]!.includes("\x1b[4m"), "plain underline");
  assert.ok(!out[0]!.includes("\x1b[4:3m"), "no undercurl in 256 mode");
  assert.ok(out[0]!.includes("\x1b[38;5;8m"), "256 fg color");
});