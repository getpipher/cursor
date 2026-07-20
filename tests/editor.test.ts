import { test } from "node:test";
import assert from "node:assert/strict";
import { CURSOR_MARKER } from "@earendil-works/pi-tui";
import { CursorEditor, composeRender } from "../lib/editor.ts";
import { DEFAULT_CONFIG, type CursorConfig } from "../lib/defaults.ts";
import { BlinkController, type Scheduler } from "../lib/state.ts";

const cell = (ch: string) => `${CURSOR_MARKER}\x1b[7m${ch}\x1b[0m`;

const THEME = {
  getFgAnsi: (c: string) => (c === "accent" ? "\x1b[38;5;7m" : c === "dim" ? "\x1b[38;5;8m" : ""),
  getColorMode: () => "256color" as const,
};

// Pure composition test — no instantiation needed.
test("composeRender: focused+block = passthrough; focused+dim-underline; unfocused+hide", () => {
  const lines = [`const x = ${cell("f")}await;`];
  assert.deepEqual(
    composeRender(lines, true, { ...DEFAULT_CONFIG, focusedStyle: "block" }, THEME, true, "fake"),
    lines, // block + visible = passthrough (keeps marker)
  );
  assert.deepEqual(
    composeRender(lines, true, { ...DEFAULT_CONFIG, focusedStyle: "underline" }, THEME, true, "fake"),
    [`const x = \x1b[4mf\x1b[0mawait;`],
  );
  assert.deepEqual(
    composeRender(lines, false, { ...DEFAULT_CONFIG, unfocusedStyle: "hide" }, THEME, true, "fake"),
    [`const x = fawait;`],
  );
});

// Instantiation harness: a no-op scheduler so blink never fires during tests.
const noopScheduler: Scheduler = { setInterval: () => 0, clearInterval: () => {} };

function makeEditor(wrappedRender: (w: number) => string[]) {
  const blink = new BlinkController(noopScheduler);
  const wrapped = { render: wrappedRender, handleInput: (_d: string) => {} };
  const tui = { requestRender: () => {} };
  const theme = THEME;
  const ed = new CursorEditor(tui as any, theme as any, {} as any, { wrapped: wrapped as any, blink });
  ed.updateConfig(DEFAULT_CONFIG);
  return { ed, wrapped };
}

test("focused + block → passthrough of wrapped render", () => {
  const { ed } = makeEditor(() => [`hi ${cell("f")}`]);
  ed.setFocus(true);
  assert.deepEqual(ed.render(80), [`hi ${cell("f")}`]);
});

test("unfocused + hollow (default) → transform applied to wrapped render", () => {
  const { ed } = makeEditor(() => [`hi ${cell("f")}`]);
  ed.setFocus(false);
  assert.deepEqual(ed.render(80), [`hi \x1b[38;5;8m□\x1b[39m`]);
});

test("handleInput delegates to wrapped editor", () => {
  let got = "";
  const { ed, wrapped } = makeEditor(() => [`hi ${cell("f")}`]);
  (wrapped as any).handleInput = (d: string) => {
    got = d;
  };
  ed.handleInput("x");
  assert.equal(got, "x");
});

test("enabled=false → untransformed passthrough regardless of focus", () => {
  const { ed } = makeEditor(() => [`hi ${cell("f")}`]);
  ed.updateConfig({ ...DEFAULT_CONFIG, enabled: false });
  ed.setFocus(false);
  assert.deepEqual(ed.render(80), [`hi ${cell("f")}`]);
});

test("setFocus(true) twice is a no-op (no redundant renders)", () => {
  const { ed } = makeEditor(() => [`hi ${cell("f")}`]);
  let renders = 0;
  (ed as any).tui.requestRender = () => {
    renders++;
  };
  ed.setFocus(true); // initial state already true → no change, no render
  assert.equal(renders, 0);
  ed.setFocus(false);
  assert.equal(renders, 1);
  ed.setFocus(false); // already false → no-op
  assert.equal(renders, 1);
});

// --- v0.2.0 (C): hardware-cursor mode ---
function mockTui() {
  const writes: string[] = [];
  const hw: boolean[] = [];
  return {
    writes,
    hw,
    tui: {
      setShowHardwareCursor(v: boolean) { hw.push(v); },
      requestRender() {},
      terminal: { write(s: string) { writes.push(s); } },
    },
  };
}
const HW_THEME = {
  getFgAnsi: (c: string) => (c === "accent" ? "\x1b[38;2;203;166;247m" : ""),
  getColorMode: () => "truecolor" as const,
};

function makeHwEditor(cfg: Partial<CursorConfig> = {}) {
  const m = mockTui();
  const blink = new BlinkController(noopScheduler);
  const wrapped = { render: () => [""], handleInput: (_d: string) => {} };
  const ed = new CursorEditor(m.tui as any, HW_THEME as any, {} as any, { wrapped: wrapped as any, blink });
  ed.updateConfig({ ...DEFAULT_CONFIG, ...cfg });
  return { ed, m, blink };
}

test("hardware mode: focused emits DECSCUSR steady block + OSC 12 accent + shows hw cursor", () => {
  const { m } = makeHwEditor({ cursorMode: "hardware", focusedStyle: "block" });
  assert.ok(m.hw.includes(true), "hardware cursor shown");
  assert.ok(m.writes.some((w) => w.includes("\x1b[2 q")), "DECSCUSR steady block");
  assert.ok(m.writes.some((w) => w.includes("\x1b]12;#cba6f7\x07")), "OSC 12 accent hex");
});

test("hardware mode: blink on → blinking DECSCUSR + BlinkController stopped", () => {
  const m = mockTui();
  const blink = new BlinkController(noopScheduler);
  let stopped = 0;
  const origStop = blink.stop.bind(blink);
  blink.stop = () => { stopped++; origStop(); };
  const wrapped = { render: () => [""], handleInput: (_d: string) => {} };
  const ed = new CursorEditor(m.tui as any, HW_THEME as any, {} as any, { wrapped: wrapped as any, blink });
  ed.updateConfig({ ...DEFAULT_CONFIG, cursorMode: "hardware", blink: true, focusedStyle: "underline" });
  assert.ok(m.writes.some((w) => w.includes("\x1b[3 q")), "blinking underline DECSCUSR");
  assert.ok(stopped >= 1, "blink.stop called (native blink replaces fake blink)");
});

test("hardware mode: hex cursorColor → OSC 12 with that hex", () => {
  const { m } = makeHwEditor({ cursorMode: "hardware", cursorColor: "#ff5555" });
  assert.ok(m.writes.some((w) => w.includes("\x1b]12;#ff5555\x07")), "OSC 12 override hex");
});

test("hardware mode: 256-color theme → OSC 12 skipped (no exact hex)", () => {
  const m = mockTui();
  const blink = new BlinkController(noopScheduler);
  const wrapped = { render: () => [""], handleInput: (_d: string) => {} };
  const theme256 = { getFgAnsi: () => "\x1b[38;5;7m", getColorMode: () => "256color" as const };
  const ed = new CursorEditor(m.tui as any, theme256 as any, {} as any, { wrapped: wrapped as any, blink });
  ed.updateConfig({ ...DEFAULT_CONFIG, cursorMode: "hardware" });
  assert.ok(!m.writes.some((w) => w.includes("\x1b]12;")), "OSC 12 skipped in 256 mode");
});

test("fake mode: no DECSCUSR shape set (resets to default) + hw cursor hidden", () => {
  const { m } = makeHwEditor({ cursorMode: "fake" });
  assert.ok(m.hw.includes(false), "hardware cursor hidden in fake mode");
  assert.ok(m.writes.some((w) => w.includes("\x1b[0 q")), "DECSCUSR reset to default");
});

test("restoreCursor resets DECSCUSR + OSC 12 + hides hardware cursor", () => {
  const { ed, m } = makeHwEditor({ cursorMode: "hardware" });
  m.writes.length = 0;
  m.hw.length = 0;
  ed.restoreCursor();
  assert.ok(m.hw.includes(false), "hardware cursor hidden on restore");
  assert.ok(m.writes.some((w) => w.includes("\x1b[0 q")), "DECSCUSR reset to default");
  assert.ok(m.writes.some((w) => w.includes("\x1b]12;\x07")), "OSC 12 reset");
});

test("hardware mode unfocused: setShowHardwareCursor(false) on focus loss", () => {
  const { ed, m } = makeHwEditor({ cursorMode: "hardware" });
  // initial focused → hw on; now lose focus
  m.hw.length = 0;
  ed.setFocus(false);
  assert.ok(m.hw.includes(false), "hardware cursor hidden when unfocused");
  assert.ok(m.writes.some((w) => w.includes("\x1b[0 q")), "DECSCUSR reset to default when unfocused");
});

test("hardware mode refocus: setShowHardwareCursor(true) + DECSCUSR re-emitted", () => {
  const { ed, m } = makeHwEditor({ cursorMode: "hardware", focusedStyle: "underline" });
  ed.setFocus(false); // lose
  m.hw.length = 0;
  m.writes.length = 0;
  ed.setFocus(true); // regain
  assert.ok(m.hw.includes(true), "hardware cursor shown on refocus");
  assert.ok(m.writes.some((w) => w.includes("\x1b[4 q")), "DECSCUSR underline re-emitted on refocus");
});