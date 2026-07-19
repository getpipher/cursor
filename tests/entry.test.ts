import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCursorArgs } from "../extensions/cursor.ts";
import { DEFAULT_CONFIG } from "../lib/defaults.ts";

test("no args → panel", () => {
  assert.deepEqual(parseCursorArgs([], DEFAULT_CONFIG), { action: "panel" });
});

test("on/off toggles enabled", () => {
  assert.deepEqual(parseCursorArgs(["on"], DEFAULT_CONFIG), { action: "set", patch: { enabled: true } });
  assert.deepEqual(parseCursorArgs(["off"], DEFAULT_CONFIG), { action: "set", patch: { enabled: false } });
});

test("focused block|bar|underline", () => {
  assert.deepEqual(parseCursorArgs(["focused", "bar"], DEFAULT_CONFIG), { action: "set", patch: { focusedStyle: "bar" } });
  assert.throws(() => parseCursorArgs(["focused", "weird"], DEFAULT_CONFIG));
});

test("unfocused dim|hollow|outline|underline|hide", () => {
  assert.deepEqual(parseCursorArgs(["unfocused", "hide"], DEFAULT_CONFIG), { action: "set", patch: { unfocusedStyle: "hide" } });
  assert.deepEqual(parseCursorArgs(["unfocused", "hollow"], DEFAULT_CONFIG), { action: "set", patch: { unfocusedStyle: "hollow" } });
  assert.deepEqual(parseCursorArgs(["unfocused", "outline"], DEFAULT_CONFIG), { action: "set", patch: { unfocusedStyle: "outline" } });
});

test("blink on [ms] / off", () => {
  assert.deepEqual(parseCursorArgs(["blink", "on"], DEFAULT_CONFIG), { action: "set", patch: { blink: true } });
  assert.deepEqual(parseCursorArgs(["blink", "on", "800"], DEFAULT_CONFIG), {
    action: "set",
    patch: { blink: true, blinkRate: 800 },
  });
  assert.deepEqual(parseCursorArgs(["blink", "off"], DEFAULT_CONFIG), { action: "set", patch: { blink: false } });
  assert.throws(() => parseCursorArgs(["blink", "on", "999"], DEFAULT_CONFIG)); // 999 not a valid rate
});

test("provider auto|tmux|herdr|static", () => {
  assert.deepEqual(parseCursorArgs(["provider", "tmux"], DEFAULT_CONFIG), { action: "set", patch: { focusProvider: "tmux" } });
  assert.throws(() => parseCursorArgs(["provider", "bogus"], DEFAULT_CONFIG));
});

test("status → status", () => {
  assert.deepEqual(parseCursorArgs(["status"], DEFAULT_CONFIG), { action: "status" });
});

test("reset → reset", () => {
  assert.deepEqual(parseCursorArgs(["reset"], DEFAULT_CONFIG), { action: "reset" });
});

test("unknown → usage", () => {
  assert.deepEqual(parseCursorArgs(["bogus"], DEFAULT_CONFIG), { action: "usage" });
});