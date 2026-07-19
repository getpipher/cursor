import { test } from "node:test";
import assert from "node:assert/strict";
import { panelRows, applyRowChange } from "../lib/panel.ts";
import { DEFAULT_CONFIG } from "../lib/defaults.ts";

test("panel rows cover all config keys in order", () => {
  const rows = panelRows(DEFAULT_CONFIG, "static");
  assert.deepEqual(
    rows.map((r) => r.id),
    ["enabled", "focusedStyle", "unfocusedStyle", "blink", "blinkRate", "focusProvider", "activeProvider"],
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

test("activeProvider applyRowChange is a no-op (read-only)", () => {
  assert.deepEqual(applyRowChange(DEFAULT_CONFIG, "activeProvider", "tmux"), DEFAULT_CONFIG);
});