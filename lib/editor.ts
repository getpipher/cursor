import { CustomEditor } from "@earendil-works/pi-coding-agent";
import { transformFocused, transformUnfocused } from "./render.ts";
import type { CursorConfig, CursorMode } from "./defaults.ts";
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
    this.invalidate?.();
  }

  setFocus(focused: boolean): void {
    if (this.paneFocused === focused) return;
    this.paneFocused = focused;
    this.deps.blink.setActive(focused);
    this.invalidate?.();
    this.tui?.requestRender?.();
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