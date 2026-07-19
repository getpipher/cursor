import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { loadConfig, saveConfigTracked, watchConfig } from "../lib/config.ts";
import { DEFAULT_CONFIG, type CursorConfig } from "../lib/defaults.ts";

test("watchConfig fires on external write", async () => {
  const dir = await mkdtemp(join(tmpdir(), "cursor-watch-"));
  const cfg = await loadConfig(dir);
  const self = { mtimeMs: 0, fingerprint: "" };
  await saveConfigTracked(cfg, dir, self);
  let received: CursorConfig | null = null;
  const w = watchConfig(dir, self, (c) => {
    received = c;
  });
  // external write (bypass saveConfigTracked so self isn't updated)
  const next = { ...cfg, blink: true, blinkRate: 800 };
  await writeFile(join(dir, "cursor.json"), JSON.stringify(next), "utf8");
  await sleep(300); // allow fs.watch + 80ms debounce
  assert.ok(received, "watch fired on external write");
  assert.equal((received as CursorConfig).blink, true);
  assert.equal((received as CursorConfig).blinkRate, 800);
  w.close();
  await rm(dir, { recursive: true });
});

test("watchConfig ignores self-write (same mtime + fingerprint)", async () => {
  const dir = await mkdtemp(join(tmpdir(), "cursor-self-"));
  const cfg = await loadConfig(dir);
  const self = { mtimeMs: 0, fingerprint: "" };
  await saveConfigTracked(cfg, dir, self);
  let calls = 0;
  const w = watchConfig(dir, self, () => {
    calls++;
  });
  // re-save the SAME content via saveConfigTracked → self updated → watch should ignore
  await saveConfigTracked(cfg, dir, self);
  await sleep(300);
  assert.equal(calls, 0, "self-write ignored");
  w.close();
  await rm(dir, { recursive: true });
});

test("saveConfigTracked updates self mtime + fingerprint", async () => {
  const dir = await mkdtemp(join(tmpdir(), "cursor-track-"));
  const cfg = await loadConfig(dir);
  const self = { mtimeMs: 0, fingerprint: "" };
  await saveConfigTracked(cfg, dir, self);
  assert.ok(self.mtimeMs > 0, "mtime set");
  assert.ok(self.fingerprint.length > 0, "fingerprint set");
  await rm(dir, { recursive: true });
});