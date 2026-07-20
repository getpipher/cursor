import { test } from "node:test";
import assert from "node:assert/strict";
import { panelRows, applyRowChange, previewLine } from "../lib/panel.ts";
import { CURSOR_MARKER } from "@earendil-works/pi-tui";
import { DEFAULT_CONFIG, type CursorConfig } from "../lib/defaults.ts";

const THEME = {
  getFgAnsi: (c: string) => (c === "accent" ? "\x1b[38;5;7m" : c === "dim" ? "\x1b[38;5;8m" : ""),
  getColorMode: () => "256color" as const,
};

test("panel rows cover all config keys in order", () => {
  const rows = panelRows(DEFAULT_CONFIG, "static");
  assert.deepEqual(
    rows.map((r) => r.id),
    ["enabled", "focusedStyle", "unfocusedStyle", "blink", "blinkRate", "focusProvider", "cursorColor", "cursorMode", "activeProvider"],
  );
});

test("cycler rows have values; activeProvider is read-only (no values)", () => {
  const rows = panelRows(DEFAULT_CONFIG, "static");
  for (const r of rows) {
    if (r.id === "activeProvider") {
      assert.equal(r.values, undefined, `${r.id} should be read-only`);
    } else {
      assert.ok(r.values && r.values.length > 0, `${r.id} should have values`);
    }
  }
});

test("enabled row currentValue reflects config", () => {
  assert.equal(panelRows(DEFAULT_CONFIG, "x").find((r) => r.id === "enabled")!.currentValue, "on");
  assert.equal(
    panelRows({ ...DEFAULT_CONFIG, enabled: false }, "x").find((r) => r.id === "enabled")!.currentValue,
    "off",
  );
});

test("applyRowChange focusedStyle bar", () => {
  assert.equal(applyRowChange(DEFAULT_CONFIG, "focusedStyle", "bar").focusedStyle, "bar");
});

test("applyRowChange enabled on/off", () => {
  assert.equal(applyRowChange(DEFAULT_CONFIG, "enabled", "off").enabled, false);
  assert.equal(applyRowChange({ ...DEFAULT_CONFIG, enabled: false }, "enabled", "on").enabled, true);
});

test("applyRowChange blink + blinkRate", () => {
  assert.equal(applyRowChange(DEFAULT_CONFIG, "blink", "on").blink, true);
  assert.equal(applyRowChange(DEFAULT_CONFIG, "blinkRate", "800").blinkRate, 800);
});

test("applyRowChange focusProvider", () => {
  assert.equal(applyRowChange(DEFAULT_CONFIG, "focusProvider", "tmux").focusProvider, "tmux");
});

test("applyRowChange cursorMode hardware", () => {
  assert.equal(applyRowChange(DEFAULT_CONFIG, "cursorMode", "hardware").cursorMode, "hardware");
});

test("applyRowChange cursorColor accepts hex + accent, rejects junk", () => {
  assert.equal(applyRowChange(DEFAULT_CONFIG, "cursorColor", "#cba6f7").cursorColor, "#cba6f7");
  assert.equal(applyRowChange({ ...DEFAULT_CONFIG, cursorColor: "#cba6f7" }, "cursorColor", "accent").cursorColor, "accent");
  assert.equal(applyRowChange(DEFAULT_CONFIG, "cursorColor", "junk").cursorColor, "accent");
});

test("activeProvider applyRowChange is a no-op (read-only)", () => {
  assert.deepEqual(applyRowChange(DEFAULT_CONFIG, "activeProvider", "tmux"), DEFAULT_CONFIG);
});

test("previewLine focused renders the sample with the focused style cursor", () => {
  const sample = `const result = await fetch(url);${CURSOR_MARKER}\x1b[7m \x1b[0m`;
  // block + enabled → passthrough (keeps marker)
  const block = previewLine(() => DEFAULT_CONFIG, true);
  assert.deepEqual(block.render(80), [sample]);
  // underline → underline SGR on the trailing space, marker dropped
  const ul = previewLine(() => ({ ...DEFAULT_CONFIG, focusedStyle: "underline" }), true);
  assert.deepEqual(ul.render(80), [`const result = await fetch(url);\x1b[4m \x1b[0m`]);
  // bar → ▎ glyph at line end (no char eaten)
  const bar = previewLine(() => ({ ...DEFAULT_CONFIG, focusedStyle: "bar" }), true, undefined, () => THEME);
  assert.deepEqual(bar.render(80), [`const result = await fetch(url);\x1b[38;5;7m▎\x1b[39m`]);
});

test("previewLine unfocused renders the sample with the unfocused style cursor", () => {
  // hollow (default) → □ sharp hollow block
  const hollow = previewLine(() => DEFAULT_CONFIG, false, undefined, () => THEME);
  assert.deepEqual(hollow.render(80), [`const result = await fetch(url);\x1b[38;5;8m□\x1b[39m`]);
  // outline → ▢ rounded hollow square
  const outline = previewLine(() => ({ ...DEFAULT_CONFIG, unfocusedStyle: "outline" }), false, undefined, () => THEME);
  assert.deepEqual(outline.render(80), [`const result = await fetch(url);\x1b[38;5;8m▢\x1b[39m`]);
  // dim
  const dim = previewLine(() => ({ ...DEFAULT_CONFIG, unfocusedStyle: "dim" }), false);
  assert.deepEqual(dim.render(80), [`const result = await fetch(url);\x1b[2;7m \x1b[0m`]);
  // hide
  const hide = previewLine(() => ({ ...DEFAULT_CONFIG, unfocusedStyle: "hide" }), false);
  assert.deepEqual(hide.render(80), [`const result = await fetch(url); `]);
});

test("previewLine focused respects blink phase via getBlinkVisible", () => {
  const cfgBlink: CursorConfig = { ...DEFAULT_CONFIG, focusedStyle: "block", blink: true };
  const sample = `const result = await fetch(url);${CURSOR_MARKER}\x1b[7m \x1b[0m`;
  // blink visible=true → block passthrough (keeps marker)
  const vis = previewLine(() => cfgBlink, true, () => true);
  assert.deepEqual(vis.render(80), [sample]);
  // blink visible=false → hide (bare trailing space, marker dropped)
  const hid = previewLine(() => cfgBlink, true, () => false);
  assert.deepEqual(hid.render(80), [`const result = await fetch(url); `]);
});

test("previewLine reads live cfg (updates when cfg changes)", () => {
  let cfg: CursorConfig = { ...DEFAULT_CONFIG, focusedStyle: "block" };
  const p = previewLine(() => cfg, true);
  const sample = `const result = await fetch(url);${CURSOR_MARKER}\x1b[7m \x1b[0m`;
  assert.deepEqual(p.render(80), [sample]); // block
  cfg = { ...cfg, focusedStyle: "underline" };
  assert.deepEqual(p.render(80), [`const result = await fetch(url);\x1b[4m \x1b[0m`]); // now underline
});