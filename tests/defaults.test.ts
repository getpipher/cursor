import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_CONFIG,
  FOCUSED_STYLES,
  UNFOCUSED_STYLES,
  BLINK_RATES,
  FOCUS_PROVIDERS,
  CURSOR_MODES,
} from "../lib/defaults.ts";

test("default config has expected shape", () => {
  assert.deepEqual(DEFAULT_CONFIG, {
    enabled: true,
    focusedStyle: "block",
    unfocusedStyle: "hollow",
    blink: false,
    blinkRate: 600,
    focusProvider: "auto",
    cursorColor: "accent",
    cursorMode: "fake",
  });
});

test("focused styles enum", () => {
  assert.deepEqual(FOCUSED_STYLES, ["block", "bar", "underline"]);
});

test("blink rates enum", () => {
  assert.deepEqual(BLINK_RATES, [400, 500, 600, 800, 1000]);
});

test("focus providers enum", () => {
  assert.deepEqual(FOCUS_PROVIDERS, ["auto", "tmux", "cmux", "herdr", "static"]);
});

test("default config has v0.2.0 additions", () => {
  assert.equal(DEFAULT_CONFIG.cursorColor, "accent");
  assert.equal(DEFAULT_CONFIG.cursorMode, "fake");
});

test("unfocused styles enum includes highlight", () => {
  assert.deepEqual(UNFOCUSED_STYLES, ["dim", "hollow", "outline", "underline", "hide", "highlight"]);
});

test("cursor modes enum", () => {
  assert.deepEqual(CURSOR_MODES, ["fake", "hardware"]);
});