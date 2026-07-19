import type { ExtensionAPI, ExtensionContext, ExtensionCommandContext, Theme } from "@earendil-works/pi-coding-agent";
import { DynamicBorder } from "@earendil-works/pi-coding-agent";
import {
  SettingsList,
  Container,
  Spacer,
  Text,
  matchesKey,
} from "@earendil-works/pi-tui";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  DEFAULT_CONFIG,
  FOCUSED_STYLES,
  UNFOCUSED_STYLES,
  BLINK_RATES,
  FOCUS_PROVIDERS,
  type CursorConfig,
  type FocusedStyle,
  type UnfocusedStyle,
  type FocusProviderName,
} from "../lib/defaults.ts";
import type { FSWatcher } from "node:fs";
import { loadConfig, saveConfigTracked, watchConfig } from "../lib/config.ts";
import { CursorEditor } from "../lib/editor.ts";
import { BlinkController } from "../lib/state.ts";
import { createProvider, type FocusProvider } from "../lib/focus/index.ts";
import { panelRows, applyRowChange, rowDisplayValue, previewLine } from "../lib/panel.ts";

const CONFIG_DIR = join(homedir(), ".pi", "agent");

export type CursorArgs =
  | { action: "panel" }
  | { action: "status" }
  | { action: "usage" }
  | { action: "reset" }
  | { action: "set"; patch: Partial<CursorConfig> };

export function parseCursorArgs(args: string[], _cfg: CursorConfig): CursorArgs {
  if (args.length === 0) return { action: "panel" };
  const [a, b, c] = args;
  switch (a) {
    case "on":
      return { action: "set", patch: { enabled: true } };
    case "off":
      return { action: "set", patch: { enabled: false } };
    case "status":
      return { action: "status" };
    case "reset":
      return { action: "reset" };
    case "focused":
      if (!FOCUSED_STYLES.includes(b as FocusedStyle)) throw new Error(`Usage: /cursor focused ${FOCUSED_STYLES.join("|")}`);
      return { action: "set", patch: { focusedStyle: b as FocusedStyle } };
    case "unfocused":
      if (!UNFOCUSED_STYLES.includes(b as UnfocusedStyle)) throw new Error(`Usage: /cursor unfocused ${UNFOCUSED_STYLES.join("|")}`);
      return { action: "set", patch: { unfocusedStyle: b as UnfocusedStyle } };
    case "blink":
      if (b === "off") return { action: "set", patch: { blink: false } };
      if (b === "on") {
        const patch: Partial<CursorConfig> = { blink: true };
        if (c !== undefined) {
          const n = Number(c);
          if (!BLINK_RATES.includes(n)) throw new Error(`blink rate must be one of ${BLINK_RATES.join(",")}`);
          patch.blinkRate = n;
        }
        return { action: "set", patch };
      }
      throw new Error("Usage: /cursor blink on [ms] | off");
    case "provider":
      if (!FOCUS_PROVIDERS.includes(b as FocusProviderName)) throw new Error(`Usage: /cursor provider ${FOCUS_PROVIDERS.join("|")}`);
      return { action: "set", patch: { focusProvider: b as FocusProviderName } };
    default:
      return { action: "usage" };
  }
}

export default function (pi: ExtensionAPI): void {
  let cfg: CursorConfig = { ...DEFAULT_CONFIG };
  let editor: CursorEditor | null = null;
  let provider: FocusProvider | null = null;
  let blink: BlinkController | null = null;
  let prevEditorFactory: ((tui: any, theme: any, kb: any) => any) | null = null;
  let configWatcher: FSWatcher | undefined;
  const self = { mtimeMs: 0, fingerprint: "" };

  function restartBlink(): void {
    if (!blink || !editor) return;
    blink.stop();
    if (cfg.blink) blink.start(cfg.blinkRate, () => editor!.onBlinkToggle());
  }

  async function restartProvider(): Promise<void> {
    await provider?.stop();
    provider = await createProvider(cfg.focusProvider, (focused) => editor?.setFocus(focused));
    await provider.start(() => {});
  }

  // `save=true` for local changes (writes the file → propagates to other sessions
  // via the watcher). `save=false` for external changes (already on disk; don't
  // re-save, to avoid a cross-session cascade).
  async function applyConfig(next: CursorConfig, save: boolean): Promise<void> {
    const prev = cfg;
    cfg = next;
    editor?.updateConfig(next);
    if (prev.focusProvider !== next.focusProvider) await restartProvider();
    if (prev.blink !== next.blink || prev.blinkRate !== next.blinkRate) restartBlink();
    if (save) await saveConfigTracked(next, CONFIG_DIR, self);
  }

  pi.on("session_start", async (_e, ctx) => {
    if (!ctx.hasUI) return;
    cfg = await loadConfig(CONFIG_DIR);
    await saveConfigTracked(cfg, CONFIG_DIR, self);
    prevEditorFactory = ctx.ui.getEditorComponent?.() ?? null;
    const blinkController = new BlinkController();
    blink = blinkController;
    ctx.ui.setEditorComponent((tui: any, theme: any, keybindings: any) => {
      const wrapped = prevEditorFactory ? prevEditorFactory(tui, theme, keybindings) : null;
      const ed = new CursorEditor(tui, theme, keybindings, { wrapped, blink: blinkController });
      editor = ed;
      ed.updateConfig(cfg);
      if (cfg.blink) blinkController.start(cfg.blinkRate, () => ed.onBlinkToggle());
      return ed;
    });
    provider = await createProvider(cfg.focusProvider, (focused) => editor?.setFocus(focused));
    await provider.start(() => {});
    configWatcher = watchConfig(CONFIG_DIR, self, (next) => {
      void applyConfig(next, false);
    });
  });

  pi.on("session_shutdown", async () => {
    configWatcher?.close();
    configWatcher = undefined;
    await provider?.stop();
    provider = null;
    blink?.stop();
    blink = null;
    editor = null;
  });

  pi.registerCommand("cursor", {
    description: "Configure the focus-aware editor cursor",
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      const parsed = parseCursorArgs(args.split(/\s+/).filter(Boolean), cfg);
      if (parsed.action === "usage") {
        ctx.ui.notify(`Usage: /cursor [on|off|focused <s>|unfocused <s>|blink on|off [ms]|provider <p>|status]`, "warning");
        return;
      }
      if (parsed.action === "status") {
        ctx.ui.notify(`cursor: ${JSON.stringify(cfg)} · provider=${provider?.name ?? "none"}`, "info");
        return;
      }
      if (parsed.action === "reset") {
        await applyConfig(DEFAULT_CONFIG, true);
        ctx.ui.notify("cursor: reset to defaults", "info");
        return;
      }
      if (parsed.action === "set") {
        await applyConfig({ ...cfg, ...parsed.patch }, true);
        ctx.ui.notify("cursor: config saved", "info");
        return;
      }
      // panel
      if (ctx.mode !== "tui") {
        ctx.ui.notify(`cursor: ${JSON.stringify(cfg)}`, "info");
        return;
      }
      await ctx.ui.custom<boolean>((tui: any, theme: Theme, _kb, done) => {
        const container = new Container();
        container.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));
        container.addChild(new Spacer(1));
        container.addChild(new Text(theme.fg("accent", theme.bold("Cursor settings")), 0, 0));

        const items = panelRows(cfg, `${provider?.name ?? "none"} · ${cfg.focusProvider}`);
        const settingsList = new SettingsList(
          items,
          12,
          {
            label: (text: string, selected: boolean) => (selected ? theme.fg("accent", theme.bold(text)) : text),
            value: (text: string, selected: boolean) => (selected ? theme.fg("accent", text) : theme.fg("muted", text)),
            description: (text: string) => theme.fg("dim", text),
            cursor: "❯",
            hint: (text: string) => theme.fg("dim", text),
          },
          (id: string, newValue: string) => {
            const next = applyRowChange(cfg, id, newValue);
            void applyConfig(next, true);
            settingsList.updateValue(id, rowDisplayValue(id, next));
          },
          () => done(true),
        );
        const accentBorder = (s: string) => theme.fg("accent", s);
        const getCfg = () => cfg;
        const getBlinkVisible = () => (cfg.blink ? blink?.visible ?? true : true);
        container.addChild(new Text(theme.fg("dim", "focused:"), 0, 0));
        container.addChild(previewLine(getCfg, true, getBlinkVisible) as any);
        container.addChild(new Text(theme.fg("dim", "unfocused:"), 0, 0));
        container.addChild(previewLine(getCfg, false) as any);
        container.addChild(new Spacer(1));
        container.addChild(settingsList);
        container.addChild(new Text(theme.fg("dim", "↑↓ navigate • enter edit/cycle • r reset • esc done"), 0, 0));
        container.addChild(new Spacer(1));
        container.addChild(new DynamicBorder(accentBorder)); // bottom border (matches /settings framing)

        return {
          render(width: number) {
            return container.render(width);
          },
          invalidate() {
            container.invalidate();
          },
          handleInput(data: string) {
            if (matchesKey(data, "r")) {
              void applyConfig(DEFAULT_CONFIG, true);
              tui.requestRender();
              return;
            }
            settingsList.handleInput(data);
            tui.requestRender();
          },
        } as any;
      });
    },
  });
}