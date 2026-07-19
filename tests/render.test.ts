import { test } from "node:test";
import assert from "node:assert/strict";
import { CURSOR_MARKER } from "@earendil-works/pi-tui";
import { transformFocused, transformUnfocused } from "../lib/render.ts";
import { DEFAULT_CONFIG } from "../lib/defaults.ts";

const cell = (ch: string) => `${CURSOR_MARKER}\x1b[7m${ch}\x1b[0m`;
const line = (ch: string) => `const x = ${cell(ch)}await;`;

test("focused block = passthrough (no transform)", () => {
  const l = line("f");
  assert.deepEqual(transformFocused([l], { ...DEFAULT_CONFIG, focusedStyle: "block" }, true), [l]);
});

test("focused underline = underline SGR on char", () => {
  assert.deepEqual(
    transformFocused([line("f")], { ...DEFAULT_CONFIG, focusedStyle: "underline" }, true),
    [`const x = \x1b[4mf\x1b[0mawait;`],
  );
});

test("focused bar = ▎ glyph replacing cell, char hidden", () => {
  assert.deepEqual(
    transformFocused([line("f")], { ...DEFAULT_CONFIG, focusedStyle: "bar" }, true),
    [`const x = \x1b[38;5;7m▎\x1b[39mawait;`],
  );
});

test("focused blinkVisible=false → hide regardless of style", () => {
  assert.deepEqual(
    transformFocused([line("f")], { ...DEFAULT_CONFIG, focusedStyle: "block" }, false),
    [`const x = fawait;`],
  );
  assert.deepEqual(
    transformFocused([line("f")], { ...DEFAULT_CONFIG, focusedStyle: "bar" }, false),
    [`const x = fawait;`],
  );
});

test("unfocused dim = dim+reverse", () => {
  assert.deepEqual(
    transformUnfocused([line("f")], { ...DEFAULT_CONFIG, unfocusedStyle: "dim" }),
    [`const x = \x1b[2;7mf\x1b[0mawait;`],
  );
});

test("unfocused hollow = □ sharp hollow block, char hidden", () => {
  assert.deepEqual(
    transformUnfocused([line("f")], { ...DEFAULT_CONFIG, unfocusedStyle: "hollow" }),
    [`const x = \x1b[38;5;8m□\x1b[39mawait;`],
  );
});

test("unfocused outline = ▢ rounded hollow square, char hidden", () => {
  assert.deepEqual(
    transformUnfocused([line("f")], { ...DEFAULT_CONFIG, unfocusedStyle: "outline" }),
    [`const x = \x1b[38;5;8m▢\x1b[39mawait;`],
  );
});

test("unfocused underline = dim underline", () => {
  assert.deepEqual(
    transformUnfocused([line("f")], { ...DEFAULT_CONFIG, unfocusedStyle: "underline" }),
    [`const x = \x1b[4;2mf\x1b[0mawait;`],
  );
});

test("unfocused hide = strip cursor", () => {
  assert.deepEqual(
    transformUnfocused([line("f")], { ...DEFAULT_CONFIG, unfocusedStyle: "hide" }),
    [`const x = fawait;`],
  );
});

test("multi-line: only the line with the cursor is transformed", () => {
  const a = "line one no cursor";
  const b = line("f");
  const c = "line three no cursor";
  assert.deepEqual(
    transformUnfocused([a, b, c], { ...DEFAULT_CONFIG, unfocusedStyle: "hide" }),
    [a, "const x = fawait;", c],
  );
});

test("no cursor in any line = passthrough", () => {
  assert.deepEqual(transformFocused(["nothing here"], DEFAULT_CONFIG, true), ["nothing here"]);
});