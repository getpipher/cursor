# @getpipher/cursor — SPEC-2 (v0.2.0): Ghostty + tmux Deep Integration

**Status:** DRAFT → self-reviewed ✅ → pending RECTOR review
**Date:** 2026-07-19
**Supersedes/adds:** Builds on SPEC.md (v0.1) + the v0.1.1 cmux adapter. v0.2.0 is a
minor feature release (new config fields + new styles + new cursor mode).
**Stack target:** Ghostty terminal + tmux multiplexer (RECTOR's daily stack).
Verified-capable: Ghostty truecolor + styled underlines; tmux `terminal-overrides
",*256col*:Tc"` + `",xterm-ghostty:Tc"` (truecolor passthrough) + `allow-passthrough
on` (escape passthrough) + `focus-events on` (via tmux-sensible).

---

## 1. Overview

v0.2.0 deepens `@getpipher/cursor` for the Ghostty + tmux stack across three
composing axes:

- **(A) Truecolor + theme-aware cursor colors** — replace the v0.1 256-color
  approximation (`\x1b[38;5;7m`/`38;5;8m`) with exact colors sourced from pi's
  loaded `Theme` (`theme.getFgAnsi("accent")`), resolved to the theme's color
  mode (`truecolor` on RECTOR's stack). Plus an optional explicit hex override.
  The cursor color *follows the app theme* automatically — no Ghostty-config
  parsing required.
- **(B) Char-preserving `highlight` unfocused style** — a new unfocused style
  that draws a colored styled underline (undercurl / colored underline) on the
  cursor cell, preserving the character under it. Leverages Ghostty styled
  underlines (`\x1b[4:3m`, `\x1b[58:2::R:G:Bm`) passed through tmux. Solves the
  "char-hidden" limitation documented in v0.1 for an *unfocused* state.
- **(C) Hardware-cursor mode** — an opt-in `cursorMode: "hardware"` that drives
  Ghostty's *native* cursor for the focused state (DECSCUSR shape + OSC 12
  color + pi's hardware-cursor positioning), falling back to the fake-cursor
  transform for the unfocused state. Zero char-hidden limitation for the
  focused state; native color + native blink.

A and B apply to **both** cursor modes (fake + hardware); C selects *who draws
the focused cursor*. The v0.1 proven fake-cursor path remains the default
(`cursorMode: "fake"`).

## 2. Goals

1. Cursor colors match the active pi theme exactly (truecolor end-to-end through
   tmux) instead of 256-color approximation.
2. A char-preserving unfocused style exists (`highlight`) for users who don't
   want the char hidden.
3. A native-hardware-cursor mode exists for Ghostty users who want the real
   terminal cursor (native shape/color/blink) in the focused state.
4. All three compose; none regresses the v0.1/v0.1.1 behavior when left at
   defaults.
5. 80%+ coverage on new code; `pnpm typecheck` + `pnpm test:run` green; live
   verification deferred + flagged ⚠️ (mirrors v0.1 herdr / v0.1.1 cmux caveat).

## 3. Non-goals (v0.2.0)

- Bare-terminal (no-mux) hardware-cursor mode — still gated on pi-tui DEC 1004
  upstream support (unchanged from v0.1 §12).
- `cursorMode: "auto"` detection — future; v0.2.0 ships `"fake" | "hardware"`
  with explicit opt-in. Auto-detect (pick `hardware` on Ghostty+tmux-passthrough)
  is a v0.2.1+ item.
- Separate `unfocusedColor` config field — v0.2.0 derives the unfocused color
  from the focused color (auto-dimmed). A separate field is a v0.2.1+ escape
  hatch if the auto-dim is insufficient.
- Non-Ghostty hardware-cursor verification — DECSCUSR/OSC12 are standard but
  only verified-against Ghostty in this release; other terminals get the fake
  default.
- cmux live verification — unaffected by this epic; remains ⚠️ from v0.1.1.

## 4. Cursor colors (A)

### 4.1 Theme as the color source

pi's `Theme` class (`@earendil-works/pi-coding-agent`, re-exported) exposes:

- `theme.getFgAnsi(color: ThemeColor): string` — returns the ANSI color prefix
  resolved to the theme's color mode (`\x1b[38;2;R;G;Bm` for truecolor,
  `\x1b[38;5;Nm` for 256).
- `theme.getColorMode(): "truecolor" | "256color"`.
- `ThemeColor` includes `"accent"`, `"muted"`, `"dim"`, `"border"`, …

The extension already uses `theme.fg("accent", …)` for panel borders. v0.2.0
threads the `Theme` object into `render.ts` (currently `render.ts` takes only
`CursorConfig`) so the cursor cell colors resolve through `getFgAnsi`.

**No Ghostty-config parsing.** The cursor color follows the app theme; if pi's
theme matches the terminal (RECTOR's Mocha setup), the cursor matches the
terminal. If they differ, the cursor matches the app — which is the correct
coupling (the cursor is app UI, like borders).

### 4.2 Config: `cursorColor`

New field on `CursorConfig`:

```
cursorColor: string   // "accent" (default) | "#RRGGBB"
```

- `"accent"` → use `theme.getFgAnsi("accent")` (focused) and a dimmed variant
  for unfocused (see 4.3).
- `"#RRGGBB"` → parse to `{r,g,b}`, emit `\x1b[38;2;R;G;Bm` directly, overriding
  the theme. Validated: `/^#[0-9a-fA-F]{6}$/`. Invalid values normalize to
  `"accent"` with `fixed=true`.

New subcommand: `/cursor color accent|#RRGGBB`. New panel row `cursorColor`
— cycles between `accent` and the current custom hex (if one is set); hex entry
is via the subcommand only (cycling arbitrary hex through a SettingsList row is
awkward). When `cursorColor: "accent"` the row reads `accent`; when a hex is
set it reads that hex.

### 4.3 Unfocused color derivation

Unfocused color = the focused color dimmed ~50% toward the terminal background:

- If `cursorColor: "accent"` → `theme.getFgAnsi("dim")` (or `"muted"`, picked
  for best contrast — see §4.4 decision). This is already a theme-coordinated
  dim color; no manual dimming.
- If `cursorColor: "#RRGGBB"` → compute `{r,g,b}` dimmed 50%
  (`r*0.5 | 0`, etc.), emit `\x1b[38;2;R;G;Bm`.

The unfocused color is a *derived* value, not a config field (non-goal). This
keeps one knob (`cursorColor`) and guarantees focused/unfocused contrast.

### 4.4 Open decision — `dim` vs `muted` for the unfocused theme color

Both are `ThemeColor` values. `dim` is typically darker than `muted`. Pick the
one that keeps the unfocused cursor *visible but clearly secondary* against
Mocha's surface. **Decision: `"dim"`** (matches the v0.1 hollow/outline glyph
color `\x1b[38;5;8m` = dark gray → `dim`). Revisit at live-verify.

## 5. `highlight` unfocused style (B)

### 5.1 Glyph + escape

New `UnfocusedStyle: "highlight"`. Renders a **colored styled underline** on the
cursor cell, **preserving the character** (no glyph substitution, no char
hidden):

- Undercurl: `\x1b[4:3m` + colored-underline `\x1b[58:2::R:G:Bm` + `<char>` +
  `\x1b[0m` (or `\x1b[4m` plain underline if styled-underline unsupported).
- Color = the unfocused color (§4.3).

Falls back gracefully: if the terminal doesn't support `4:3`/`58:2`, it
degrades to a plain colored underline (`\x1b[4m` + fg color) — still
char-preserving. Detected via `theme.getColorMode()` (truecolor → use styled;
256 → plain underline + 256 fg). This is a best-effort capability, not a hard
gate — the escape is standard and Ghostty supports it.

### 5.2 Placement

`highlight` is an **unfocused-only** style (RECTOR's confirmed scope). It joins
`dim`/`hollow`/`outline`/`underline`/`hide` as the 6th `UnfocusedStyle`. Added
to `UNFOCUSED_STYLES`, the panel row, and `/cursor unfocused highlight`.

## 6. Hardware-cursor mode (C)

### 6.1 Config: `cursorMode`

```
cursorMode: "fake" | "hardware"   // default "fake"
```

New subcommand `/cursor mode fake|hardware`. New panel row `cursorMode`. The
v0.1 proven fake-cursor path is the default; `hardware` is opt-in.

### 6.2 Mechanism (verified feasible in the v0.2 spike)

- pi-tui `TUI.setShowHardwareCursor(bool)` is public; the extension already
  receives the `tui` instance in `ctx.ui.setEditorComponent((tui, theme, kb) => …)`.
- `positionHardwareCursor()` moves + `\x1b[?25h`-shows the real cursor at the
  cursor cell each frame; `extractCursorPosition()` strips `CURSOR_MARKER` but
  leaves the styled cell.
- DECSCUSR (`\x1b[<n> q`: 2=steady block, 4=underline, 6=bar; 1/3/5 = blinking
  variants) and OSC 12 (`\x1b]12;<color>\x07`) are terminal *modes* that persist
  across pi's render frames (pi only writes `\x1b[?25h`, never resets
  shape/color).

### 6.3 Focused state (hardware mode)

1. `tui.setShowHardwareCursor(true)`.
2. Emit DECSCUSR for the focused shape: `block`→`2`, `underline`→`4`, `bar`→`6`.
   If `blink` config on → blinking variants `1`/`3`/`5`; *disable* the
   fake-cursor `BlinkController` in hardware mode (native blink replaces it).
3. Emit OSC 12 with the focused color: resolve `cursorColor` (`"accent"` →
   theme accent hex via a new helper `themeAccentHex(theme)` that reads the
   accent color; `#RRGGBB` → as-is). **256-color theme edge case:** if
   `theme.getColorMode() === "256color"`, `themeAccentHex` can't produce an
   exact hex (the accent is a 256 palette index) — in that case **skip OSC 12**
   and let the terminal use its configured cursor color (documented). RECTOR's
   stack is truecolor, so this only affects non-truecolor terminals.
4. Focused render-transform = **bare char** (drop the fake `\x1b[7m<char>` cell)
   so only the native hardware cursor shows. (`focusedCell` in hardware mode
   returns `ch` unchanged.)

### 6.4 Unfocused state (hardware mode)

1. `tui.setShowHardwareCursor(false)` → hides the real cursor.
2. Render the unfocused fake cell using A's color + any unfocused style
   (incl. B's `highlight`). This is the *same* `transformUnfocused` path as fake
   mode — hardware mode only changes the focused state.

### 6.5 Mode-switch + lifecycle

- On `cursorMode` config change (panel/subcommand/watch): emit the new mode's
  setup immediately + `tui.requestRender()`.
- On `session_shutdown`: restore `tui.setShowHardwareCursor(false)` (pi's
  default) + emit default DECSCUSR (`\x1b[0 q`) + reset OSC 12 (`\x1b]12;\x07`)
  so we don't leave the terminal with a foreign cursor shape/color. This is
  the "wrapped-editor restore" hygiene (a v0.1.1 polish item) — addressed here
  because hardware mode *requires* it to avoid leaking terminal state.

### 6.6 Why opt-in (not default)

Hardware mode is standard DECSCUSR/OSC12, but: (a) the focused shape is
constrained to block/underline/bar (the 3 DECSCUSR shapes) — `hollow`/`outline`
focused shapes are fake-cursor-only; (b) cursor *color* via OSC 12 is less
portable than SGR fg (some terminals ignore it); (c) it changes the terminal's
global cursor state (more invasive than per-cell SGR). Default `"fake"`
preserves the proven path; Ghostty users opt in.

## 7. Configuration (additions to `CursorConfig`)

```ts
interface CursorConfig {
  // …v0.1/v0.1.1 fields…
  cursorColor: string;        // "accent" | "#RRGGBB"  — default "accent"
  cursorMode: "fake" | "hardware";                       // default "fake"
}
```

`DEFAULT_CONFIG` additions: `cursorColor: "accent"`, `cursorMode: "fake"`.
`FOCUS_PROVIDERS` unchanged. `UnfocusedStyle` gains `"highlight"`;
`UNFOCUSED_STYLES` gains `"highlight"` (6th). `FocusProviderName` unchanged.

`normalizeConfig` (config.ts): parse + validate `cursorColor` (hex regex or
`"accent"`), `cursorMode` (enum), and the new `unfocusedStyle` value.

## 8. `/cursor` command UX (additions)

- `/cursor color accent|#RRGGBB` — set cursor color.
- `/cursor mode fake|hardware` — set cursor mode.
- `/cursor unfocused highlight` — new unfocused style option.
- Panel rows: `cursorColor` (cycles accent → presets), `cursorMode` (fake↔hardware),
  plus `unfocusedStyle` row already exists (now includes `highlight`).
- `/cursor status` includes `cursorColor` + `cursorMode`.
- `/cursor reset` restores `cursorColor: "accent"`, `cursorMode: "fake"`.

## 9. Architecture / files (changes)

| file | change |
|---|---|
| `lib/defaults.ts` | add `cursorColor`, `cursorMode` fields + `"highlight"` unfocused; defaults + enums |
| `lib/config.ts` | parse/validate `cursorColor` (hex), `cursorMode`, `unfocusedStyle` highlight; cycleValue for new keys |
| `lib/render.ts` | **thread `Theme`**; replace 256-color with `theme.getFgAnsi(...)`; `highlight` underline escapes; hardware-mode bare-char focused; `hexToAnsi` + `themeAccentHex` helpers |
| `lib/editor.ts` | pass `theme` into `transformFocused`/`transformUnfocused`; manage `cursorMode` (emit DECSCUSR/OSC12, toggle `tui.setShowHardwareCursor`); shutdown restore |
| `lib/panel.ts` | new rows `cursorColor` + `cursorMode`; `unfocusedStyle` row includes `highlight`; display values |
| `extensions/cursor.ts` | parse `color` + `mode` subcommands; panel row wiring; pass `tui` ref to editor for hardware mode |
| `lib/state.ts` | `BlinkController` — no change, but editor skips it in hardware-focused mode (native blink) |
| `lib/focus/*` | **no change** (v0.1.1 cmux + v0.1 tmux/herdr/static unchanged) |

New helpers in `render.ts`:
- `hexToAnsi(hex: string): string` — `#RRGGBB` → `\x1b[38;2;R;G;Bm`.
- `dimHex(hex: string): string` — 50% dim → `#RRGGBB`.
- `themeAccentHex(theme: Theme): string` — read the accent color (via a new
  `getFgHex`/reflection on Theme, or by resolving `getFgAnsi("accent")` to RGB
  by parsing the emitted escape — see §11 open decision).
- `decscusr(shape, blink): string` — `\x1b[<n> q`.
- `osc12(colorHex): string` — `\x1b]12;<hex>\x07`.

## 10. Testing

Stack unchanged: `tsx` + `node:test`/`node:assert/strict` (NOT vitest). 80%+
coverage on new code.

- `tests/render.test.ts` (extend): mock `Theme` (`{ getFgAnsi: c => PREFIX[c],
  getColorMode: () => "truecolor" }`); assert focused bar/hollow/outline now emit
  `theme.getFgAnsi("accent")`/`"dim"`; assert hex-override emits `\x1b[38;2;…m`;
  assert `highlight` emits styled-underline + preserves char; assert hardware
  focused = bare char.
- `tests/config.test.ts` (extend): `cursorColor` hex validation/normalization;
  `cursorMode` enum; `highlight` unfocused cycle.
- `tests/defaults.test.ts` (extend): new defaults + enums.
- `tests/entry.test.ts` (extend): parse `color` + `mode` subcommands.
- `tests/panel.test.ts` (extend): new row ids + display values.
- `tests/editor.test.ts` (new or extend): hardware-mode DECSCUSR/OSC12 emission
  on focus flip; `setShowHardwareCursor` toggling; blink disabled in
  hardware-focused; shutdown restore (DECSCUSR `\x1b[0 q` + OSC12 reset +
  `setShowHardwareCursor(false)`). Mock `tui` (`{ setShowHardwareCursor, requestRender }`)
  + capture emitted escape sequences via a spy on the write path.

## 11. Open decisions (resolve before/during plan)

- **`themeAccentHex`** — `Theme.fgColors` is private; `getFgAnsi("accent")`
  returns the *prefix* (e.g. `\x1b[38;2;203;166;247m` for Mocha mauve), not the
  hex. Two options: (a) parse the emitted `\x1b[38;2;R;G;Bm` prefix back to RGB
  → hex (works for truecolor). (b) Add a thin accessor. **Decision: (a)** parse
  `getFgAnsi` output — no upstream change, works today. **256-color mode:**
  parsing `\x1b[38;5;Nm` to hex is inexact; in that mode `themeAccentHex`
  returns `""` and hardware mode skips OSC 12 (terminal uses its default cursor
  color). No upstream change; documented.
- **`dim` vs `muted`** (§4.4) — `dim` (decided, revisit at live-verify).
- **`highlight` underline variant** — undercurl (`4:3`) vs plain colored
  underline (`4` + `58:2`). **Decision: undercurl** (more distinct as a cursor
  indicator); fall back to plain if `getColorMode() !== "truecolor"`.
- **Hardware-mode focused `bar` shape** — DECSCUSR `6` = steady bar. Confirm
  Ghostty renders it as expected at live-verify (the v0.1 fake `bar` is `▎`;
  the hardware bar is a 1-cell-wide vertical bar — slightly different; document).

## 12. Risks & verification

- **⚠️ Live-verification deferred** — like v0.1 herdr + v0.1.1 cmux, A/B/C are
  unit-tested against mocks (mock Theme, mock tui) but not verified against a
  live Ghostty+tmux pane in this release. Flagged in README + AGENTS + code
  headers. Live-verify checklist: (1) truecolor renders Mocha-exact through
  tmux, (2) `highlight` undercurl preserves char, (3) `hardware` mode shows
  native Ghostty cursor with accent color + correct shape, (4) shutdown
  restores default cursor.
- **OSC 12 portability** — some terminals ignore cursor-color OSC 12; hardware
  mode then shows the terminal's default cursor color. Mitigated by opt-in +
  documentation.
- **DECSCUSR shape set** — only block/underline/bar for hardware focused;
  `hollow`/`outline` focused styles don't exist (they're unfocused-only in
  v0.1 too). No regression.
- **Terminal state leak** — shutdown restore (§6.5) prevents leaving a
  foreign cursor shape/color after pi exits.
- **pi-tui render-loop interaction** — the spike confirmed pi only writes
  `\x1b[?25h` (show) per frame, never DECSCUSR/OSC12, so our mode settings
  persist. Re-verify at live-verify.

## 13. Success criteria

- `pnpm typecheck` + `pnpm test:run` green; 80%+ coverage on new code.
- Defaults (`cursorColor: "accent"`, `cursorMode: "fake"`) reproduce v0.1.1
  behavior exactly (no visual regression for existing users).
- On RECTOR's Ghostty+tmux pane, `/cursor color #cba6f7` + `/cursor mode
  hardware` + `/cursor unfocused highlight` produce the intended native +
  char-preserving + truecolor result (live-verify, ⚠️ deferred).
- Tag `v0.2.0` → release.yml publishes `@getpipher/cursor@0.2.0`.

## 14. Release

Minor bump `0.1.1` → `0.2.0` (new features: new config fields, new style, new
mode — not a patch). Commit per-feature across the plan slices; final commit
bumps version + tags `v0.2.0` → CI publishes. One branch `feat/ghostty-tmux-deep`.