import { test } from "node:test";
import assert from "node:assert/strict";
import { visibleWidth } from "@earendil-works/pi-tui";
import { CursorEditor } from "../lib/editor.ts";
import { WORKING_FRAMES, WORKING_MESSAGE, workingBorderLine, stripAnsi } from "../lib/working-line.ts";
import { DEFAULT_CONFIG } from "../lib/defaults.ts";
import { BlinkController, type Scheduler } from "../lib/state.ts";

// Full-ish fake theme: EditorTheme borderColor for the base Editor + real-theme fg for the rule.
const THEME = {
  getFgAnsi: (c: string) => (c === "accent" ? "\x1b[38;5;7m" : c === "muted" ? "\x1b[38;5;8m" : ""),
  getColorMode: () => "256color" as const,
  borderColor: (s: string) => `\x1b[38;5;8m${s}\x1b[0m`,
  fg: (c: string, s: string) => (c === "accent" ? `\x1b[38;5;7m${s}\x1b[0m` : c === "muted" ? `\x1b[38;5;8m${s}\x1b[0m` : s),
};

// Manual scheduler: capture the interval callback so frames advance deterministically.
function manualScheduler() {
  let cb: (() => void) | null = null;
  return {
    scheduler: {
      setInterval: (fn: () => void, _ms: number) => { cb = fn; return 1; },
      clearInterval: () => { cb = null; },
    } satisfies Scheduler,
    tick: () => cb?.(),
    running: () => cb !== null,
  };
}

function makeBareEditor() {
  const blink = new BlinkController(manualScheduler().scheduler);
  const tui = { requestRender: () => {}, terminal: { rows: 40 } };
  const ed = new CursorEditor(tui as any, THEME as any, {} as any, {
    wrapped: null,
    blink,
    getTheme: () => THEME as any,
  });
  ed.updateConfig(DEFAULT_CONFIG);
  return ed;
}

test("setStreaming(true) → top border becomes the native working rule; false restores plain border", () => {
  const ed = makeBareEditor();
  const before = ed.render(80);
  assert.match(stripAnsi(before[0]!), /^─+$/, "idle: plain top border");
  try {
    ed.setStreaming(true);
    const during = ed.render(80);
    assert.equal(during[0], workingBorderLine(80, 0, {
      spinner: (s) => THEME.fg("accent", s),
      message: (s) => THEME.fg("muted", s),
      border: (s) => THEME.borderColor(s),
    }), "streaming: label-in-rule on line 0");
    const rest = during.slice(1).map((l) => stripAnsi(l));
    assert.ok(rest.some((l) => /^─+$/.test(l)), "bottom border still present");
  } finally {
    ed.setStreaming(false); // never leak the real interval — it would hang the test runner
  }
  assert.equal(stripAnsi(ed.render(80)[0]!), "─".repeat(80), "idle again after stop");
});

test("spinner frames advance via the scheduler ticks", () => {
  const sched = manualScheduler();
  const blink = new BlinkController(sched.scheduler);
  const tui = { requestRender: () => {}, terminal: { rows: 40 } };
  const ed = new CursorEditor(tui as any, THEME as any, {} as any, {
    wrapped: null, blink, getTheme: () => THEME as any, scheduler: sched.scheduler,
  });
  ed.updateConfig(DEFAULT_CONFIG);
  ed.setStreaming(true);
  assert.ok(sched.running(), "interval running while streaming");
  const f0 = ed.render(80)[0]!;
  sched.tick();
  sched.tick();
  const f2 = ed.render(80)[0]!;
  assert.notEqual(f0, f2, "frame advanced");
  assert.equal(visibleWidth(f2), 80, "rule still fills width");
  ed.setStreaming(false);
  assert.ok(!sched.running(), "interval cleared on stop (timer hygiene)");
});

test("wrapped editor present → render untouched by streaming (respect foreign composition)", () => {
  const sched = manualScheduler();
  const blink = new BlinkController(sched.scheduler);
  const tui = { requestRender: () => {}, terminal: { rows: 40 } };
  const ed = new CursorEditor(tui as any, THEME as any, {} as any, {
    wrapped: { render: () => [`── wrapped ──`], handleInput: () => {} },
    blink,
    getTheme: () => THEME as any,
    scheduler: sched.scheduler,
  });
  ed.updateConfig(DEFAULT_CONFIG);
  ed.setStreaming(true);
  assert.deepEqual(ed.render(80), [`── wrapped ──`]);
});
