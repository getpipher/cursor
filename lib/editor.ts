import { CustomEditor } from "@earendil-works/pi-coding-agent";
import { transformFocused, transformUnfocused, decscusr, osc12, themeAccentHex } from "./render.ts";
import type { CursorConfig, CursorMode } from "./defaults.ts";
import { BlinkController } from "./state.ts";
import { WORKING_INTERVAL_MS, workingBorderLine, stripAnsi } from "./working-line.ts";

type Theme = { getFgAnsi(color: string): string; getColorMode(): "truecolor" | "256color" };

export interface CursorEditorDeps {
  wrapped: { render(width: number): string[]; handleInput(data: string): void } | null;
  blink: BlinkController;
  /** Live accessor for the active pi `Theme` instance (NOT the EditorTheme
   *  passed to the editor factory, which only has `borderColor`/`selectList`).
   *  The real Theme exposes `getFgAnsi`/`getColorMode` for truecolor cursor
   *  colors and must be read live so theme switches are reflected. */
  getTheme: () => Theme;
  /** Injectable timer scheduler (tests). Default: global setInterval/clearInterval. */
  scheduler?: { setInterval(callback: () => void, ms: number): unknown; clearInterval(id: unknown): void };
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
  // #6: native working-rule state — replaces the top border with `── ⠸ Working ──…` while streaming.
  private streaming = false;
  private frame = 0;
  private spinnerTimer: unknown = null;

  constructor(tui: any, theme: any, keybindings: any, deps: CursorEditorDeps) {
    super(tui, theme, keybindings, {});
    this.deps = deps;
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
      const hex = this.cfg.cursorColor === "accent" ? themeAccentHex(this.deps.getTheme()) : this.cfg.cursorColor;
      const osc = osc12(hex);
      if (osc) this.writeTerm(osc);
    } else {
      // fake mode (or hardware-unfocused): reset to the terminal's default shape
      this.writeTerm("\x1b[0 q");
    }
  }

  /** Write a raw escape sequence to the terminal (via pi-tui's TUI.terminal.write).
   *  Must call write as a METHOD (t.terminal.write(seq)) so `this` is the Terminal
   *  instance — detaching the fn reference loses `this` (Terminal.write reads
   *  this.writeLogPath) and throws. */
  private writeTerm(seq: string): void {
    const t = this.tui as any;
    if (t?.terminal?.write) t.terminal.write(seq);
    else if (t?.write) t.write(seq);
  }

  /** Restore the terminal's default cursor (call on session_shutdown). */
  restoreCursor(): void {
    this.tui?.setShowHardwareCursor?.(false);
    this.writeTerm("\x1b[0 q");      // default cursor shape (DECSCUSR reset)
    this.writeTerm("\x1b]112\x07");  // OSC 112: reset cursor color to terminal default
  }

  /** Called by the BlinkController on each toggle so the editor re-renders. */
  onBlinkToggle(): void {
    this.invalidate?.();
    this.tui?.requestRender?.();
  }

  /** #6: while streaming, render the top border as the native `── ⠸ Working ──…` rule
   *  (pi's default editor embeds the label in the border; custom editors lose that).
   *  Owns a spinner interval — always pair with setStreaming(false) (timer hygiene). */
  setStreaming(active: boolean): void {
    if (this.streaming === active) return;
    this.streaming = active;
    const sched = this.deps.scheduler ?? {
      setInterval: (cb: () => void, ms: number) => setInterval(cb, ms),
      clearInterval: (id: unknown) => clearInterval(id as ReturnType<typeof setInterval>),
    };
    if (active) {
      this.frame = 0;
      this.spinnerTimer = sched.setInterval(() => {
        this.frame++;
        this.invalidate?.();
        this.tui?.requestRender?.();
      }, WORKING_INTERVAL_MS);
    } else {
      sched.clearInterval(this.spinnerTimer);
      this.spinnerTimer = null;
    }
    this.invalidate?.();
    this.tui?.requestRender?.();
  }

  handleInput(data: string): void {
    if (this.deps.wrapped) this.deps.wrapped.handleInput(data);
    else super.handleInput(data);
  }

  render(width: number): string[] {
    const lines = this.deps.wrapped ? this.deps.wrapped.render(width) : super.render(width);
    const out = composeRender(lines, this.paneFocused, this.cfg, this.deps.getTheme(), this.deps.blink.visible, this.cfg.cursorMode);
    // #6: streaming rule — replace the plain top border with `── ⠸ Working ──…`.
    // Only when cursor owns the full render (no wrapped foreign editor) and line 0 is a pure rule.
    if (!this.streaming || this.deps.wrapped || out.length === 0) return out;
    const stripped = stripAnsi(out[0]!);
    if (!/^─+$/.test(stripped)) return out;
    const theme = this.deps.getTheme();
    const self = this as unknown as { borderColor?: (s: string) => string };
    const borderColor = typeof self.borderColor === "function" ? self.borderColor : (s: string) => s;
    out[0] = workingBorderLine(width, this.frame, {
      spinner: (s) => theme.getFgAnsi("accent") + s + "\x1b[0m",
      message: (s) => theme.getFgAnsi("muted") + s + "\x1b[0m",
      border: borderColor,
    });
    return out;
  }
}