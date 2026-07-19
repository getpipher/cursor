import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_CONFIG,
  FOCUSED_STYLES,
  UNFOCUSED_STYLES,
  BLINK_RATES,
  FOCUS_PROVIDERS,
} from "../lib/defaults.ts";

test("default config has expected shape", () => {
  assert.deepEqual(DEFAULT_CONFIG, {
    enabled: true,
    focusedStyle: "block",
    unfocusedStyle: "hollow",
    blink: false,
    blinkRate: 600,
    focusProvider: "auto",
  });
});

test("focused styles enum", () => {
  assert.deepEqual(FOCUSED_STYLES, ["block", "bar", "underline"]);
});

test("unfocused styles enum", () => {
  assert.deepEqual(UNFOCUSED_STYLES, ["dim", "hollow", "outline", "underline", "hide"]);
});

test("blink rates enum", () => {
  assert.deepEqual(BLINK_RATES, [400, 500, 600, 800, 1000]);
});

test("focus providers enum", () => {
  assert.deepEqual(FOCUS_PROVIDERS, ["auto", "tmux", "herdr", "static"]);
});