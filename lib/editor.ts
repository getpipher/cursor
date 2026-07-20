import { CustomEditor } from "@earendil-works/pi-coding-agent";
import { transformFocused, transformUnfocused, decscusr, osc12, themeAccentHex } from "./render.ts";
import type { CursorConfig, CursorMode, FocusedStyle } from "./defaults.ts";
import { BlinkController } from "./state.ts";

type Theme = { getFgAnsi(color: string): string; getColorMode(): "truecolor" | "256color" };

export interface CursorEditorDeps {
  wrapped: { render(width: number): string[]; handleInput(data: string): void } | null;
  blink: BlinkController;
}

export function composeRender(
  lines: string[],
  focused: boolean,
  cfg: CursorConfig,
  theme: Theme,
  blinkVisible: boolean,
  cursorMode: CursorMode,
): string[] {
  if (!cfg.enabled) return lines;
  return focused
    ? transformFocused(lines, cfg, theme, blinkVisible, cursorMode)
    : transformUnfocused(lines, cfg, theme);
}

export class CursorEditor extends CustomEditor {
  private cfg: CursorConfig;
  private paneFocused = true;
  private deps: CursorEditorDeps;
  private cursorTheme: Theme;

  constructor(tui: any, theme: any, keybindings: any, deps: CursorEditorDeps) {
    super(tui, theme, keybindings, {});
    this.deps = deps;
    this.cursorTheme = theme as Theme;
    this.cfg = {
      enabled: true,
      focusedStyle: "block",
      unfocusedStyle: "dim",
      blink: false,
      blinkRate: 600,
      focusProvider: "auto",
      cursorColor: "accent",
      cursorMode: "fake",
    };
  }

  updateConfig(cfg: CursorConfig): void {
    this.cfg = cfg;
    this.applyCursorMode();
    this.invalidate?.();
    this.tui?.requestRender?.();
  }

  setFocus(focused: boolean): void {
    if (this.paneFocused === focused) return;
    this.paneFocused = focused;
    this.deps.blink.setActive(focused);
    this.applyCursorMode();
    this.invalidate?.();
    this.tui?.requestRender?.();
  }

  /** Emit DECSCUSR/OSC12 + toggle the hardware cursor for the current mode/focus. */
  private applyCursorMode(): void {
    const hw = this.cfg.cursorMode === "hardware" && this.paneFocused;
    this.tui?.setShowHardwareCursor?.(hw);
    if (hw) {
      // native blink replaces the fake-cursor blink controller
      this.deps.blink.stop();
      const shape: "block" | "underline" | "bar" =
        this.cfg.focusedStyle === "underline" ? "underline" :
        this.cfg.focusedStyle === "bar" ? "bar" : "block";
      this.writeTerm(decscusr(shape, this.cfg.blink));
      const hex = this.cfg.cursorColor === "accent" ? themeAccentHex(this.cursorTheme) : this.cfg.cursorColor;
      const osc = osc12(hex);
      if (osc) this.writeTerm(osc);
    } else {
      // fake mode (or hardware-unfocused): reset to the terminal's default shape
      this.writeTerm("\x1b[0 q");
    }
  }

  /** Write a raw escape sequence to the terminal (via pi-tui's TUI.terminal.write). */
  private writeTerm(seq: string): void {
    const t = this.tui as any;
    (t?.terminal?.write ?? t?.write)?.(seq);
  }

  /** Restore the terminal's default cursor (call on session_shutdown). */
  restoreCursor(): void {
    this.tui?.setShowHardwareCursor?.(false);
    this.writeTerm("\x1b[0 q");
    this.writeTerm("\x1b]12;\x07");
  }

  /** Called by the BlinkController on each toggle so the editor re-renders. */
  onBlinkToggle(): void {
    this.invalidate?.();
    this.tui?.requestRender?.();
  }

  handleInput(data: string): void {
    if (this.deps.wrapped) this.deps.wrapped.handleInput(data);
    else super.handleInput(data);
  }

  render(width: number): string[] {
    const lines = this.deps.wrapped ? this.deps.wrapped.render(width) : super.render(width);
    return composeRender(lines, this.paneFocused, this.cfg, this.cursorTheme, this.deps.blink.visible, this.cfg.cursorMode);
  }
}