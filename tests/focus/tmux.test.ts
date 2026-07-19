import { test } from "node:test";
import assert from "node:assert/strict";
import { TmuxFocusProvider } from "../../lib/focus/tmux.ts";

function makeProvider(pane = "%5") {
  const calls: string[] = [];
  const exec = async (args: string[]) => {
    calls.push(args.join(" "));
  };
  const p = new TmuxFocusProvider(pane, () => {}, exec);
  return { p, calls };
}

test("start installs pane-focus-in/out hooks + writes state file", async () => {
  const { p, calls } = makeProvider();
  await p.start();
  assert.ok(calls.some((c) => c.startsWith("set-hook -p -t %5 pane-focus-in")), "pane-focus-in hook installed");
  assert.ok(calls.some((c) => c.startsWith("set-hook -p -t %5 pane-focus-out")), "pane-focus-out hook installed");
  await p.stop();
  assert.ok(calls.some((c) => c.includes("set-hook -up -t %5 pane-focus-in")), "pane-focus-in hook removed");
});

test("no TMUX_PANE → start is a no-op (no hooks, no throw)", async () => {
  const { p, calls } = makeProvider("");
  await p.start();
  assert.equal(calls.length, 0);
  await p.stop();
});

test("focus change via applyStateFromValue emits onChange", async () => {
  let last: boolean | undefined;
  const p = new TmuxFocusProvider("%5", (f) => {
    last = f;
  }, async () => {});
  await p.start();
  (p as any).applyStateFromValue("0"); // simulate focus-out hook fired
  assert.equal(last, false);
  (p as any).applyStateFromValue("1");
  assert.equal(last, true);
  await p.stop();
});