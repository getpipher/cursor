import { test } from "node:test";
import assert from "node:assert/strict";
import { BlinkController, type Scheduler } from "../lib/state.ts";

function manualScheduler(): Scheduler & { tick: () => void; cleared: number } {
  let cb: () => void = () => {};
  return {
    setInterval: (fn: () => void) => {
      cb = fn;
      return 1;
    },
    clearInterval: () => {
      cb = () => {};
    },
    tick: () => cb(),
    cleared: 0,
  } as any;
}

test("toggles visible at rate and calls onToggle", () => {
  const s = manualScheduler();
  let toggles = 0;
  const b = new BlinkController(s);
  b.start(600, () => toggles++);
  assert.equal(b.visible, true);
  s.tick();
  assert.equal(b.visible, false);
  assert.equal(toggles, 1);
  s.tick();
  assert.equal(b.visible, true);
  assert.equal(toggles, 2);
  b.stop();
});

test("setActive(false) pauses; setActive(true) resumes toggling", () => {
  const s = manualScheduler();
  const b = new BlinkController(s);
  b.start(600, () => {});
  b.setActive(false);
  s.tick();
  s.tick();
  assert.equal(b.visible, true); // paused, stays visible
  b.setActive(true);
  s.tick();
  assert.equal(b.visible, false);
  b.stop();
});

test("stop clears the interval (no further toggles)", () => {
  const s = manualScheduler();
  const b = new BlinkController(s);
  b.start(600, () => {});
  b.stop();
  s.tick();
  s.tick();
  assert.equal(b.visible, true); // no toggles after stop
});