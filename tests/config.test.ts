import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig, saveConfig, normalizeConfig, cycleValue } from "../lib/config.ts";
import { DEFAULT_CONFIG } from "../lib/defaults.ts";

test("missing file → defaults written + returned", async () => {
  const dir = await mkdtemp(join(tmpdir(), "cursor-cfg-"));
  const cfg = await loadConfig(dir);
  assert.deepEqual(cfg, DEFAULT_CONFIG);
  const raw = await readFile(join(dir, "cursor.json"), "utf8");
  assert.deepEqual(JSON.parse(raw), DEFAULT_CONFIG);
  await rm(dir, { recursive: true });
});

test("invalid persisted value resets to default", () => {
  const n = normalizeConfig({ enabled: "maybe", focusedStyle: "weird", blinkRate: -5 });
  assert.equal(n.config.enabled, true);
  assert.equal(n.config.focusedStyle, "block");
  assert.equal(n.config.blinkRate, 600);
  assert.equal(n.fixed, true);
});

test("save round-trips", async () => {
  const dir = await mkdtemp(join(tmpdir(), "cursor-cfg-"));
  const cfg = { ...DEFAULT_CONFIG, blink: true, blinkRate: 800 };
  await saveConfig(cfg, dir);
  const loaded = await loadConfig(dir);
  assert.deepEqual(loaded, cfg);
  await rm(dir, { recursive: true });
});

test("cycleValue wraps within enum", () => {
  assert.equal(cycleValue(DEFAULT_CONFIG, "focusedStyle").focusedStyle, "bar");
  const last = { ...DEFAULT_CONFIG, focusedStyle: "underline" as const };
  assert.equal(cycleValue(last, "focusedStyle").focusedStyle, "block");
  assert.equal(cycleValue(DEFAULT_CONFIG, "unfocusedStyle").unfocusedStyle, "outline");
  assert.equal(cycleValue(DEFAULT_CONFIG, "blinkRate").blinkRate, 800);
  assert.equal(cycleValue(DEFAULT_CONFIG, "focusProvider").focusProvider, "tmux");
});

test("normalizeConfig accepts cursorColor accent + hex + cursorMode + highlight", () => {
  const { config } = normalizeConfig({
    cursorColor: "#cba6f7",
    cursorMode: "hardware",
    unfocusedStyle: "highlight",
  });
  assert.equal(config.cursorColor, "#cba6f7");
  assert.equal(config.cursorMode, "hardware");
  assert.equal(config.unfocusedStyle, "highlight");
});

test("normalizeConfig full valid v0.2.0 config → fixed=false", () => {
  const { fixed } = normalizeConfig({
    enabled: true,
    focusedStyle: "block",
    unfocusedStyle: "highlight",
    blink: false,
    blinkRate: 600,
    focusProvider: "auto",
    cursorColor: "#cba6f7",
    cursorMode: "hardware",
  });
  assert.equal(fixed, false);
});

test("normalizeConfig rejects bad hex → falls back to accent (fixed=true)", () => {
  const { config, fixed } = normalizeConfig({ cursorColor: "#xyz" });
  assert.equal(fixed, true);
  assert.equal(config.cursorColor, "accent");
});

test("normalizeConfig rejects unknown cursorMode → fake (fixed=true)", () => {
  const { config, fixed } = normalizeConfig({ cursorMode: "weird" as any });
  assert.equal(fixed, true);
  assert.equal(config.cursorMode, "fake");
});

test("cycleValue cycles cursorMode fake → hardware → fake", () => {
  assert.equal(cycleValue({ ...DEFAULT_CONFIG }, "cursorMode").cursorMode, "hardware");
  assert.equal(cycleValue({ ...DEFAULT_CONFIG, cursorMode: "hardware" as const }, "cursorMode").cursorMode, "fake");
});