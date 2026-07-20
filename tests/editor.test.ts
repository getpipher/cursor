import { test } from "node:test";
import assert from "node:assert/strict";
import { CURSOR_MARKER } from "@earendil-works/pi-tui";
import { CursorEditor, composeRender } from "../lib/editor.ts";
import { DEFAULT_CONFIG } from "../lib/defaults.ts";
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