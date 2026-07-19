# @getpipher/cursor

A pi coding-agent extension that customizes the editor cursor and makes it
focus-aware across terminal/multiplexer stacks (tmux + cmux + herdr in v0.1.1;
static fallback elsewhere; zellij/screen/wezterm + bare-terminal DEC 1004 in
later releases).

## Build & test

```bash
pnpm install
pnpm typecheck
pnpm test:run      # node:test via tsx
```

## Commands

- `/cursor` — interactive settings panel (TUI) or text status
- `/cursor on` / `/cursor off` — master switch
- `/cursor focused block|bar|underline`
- `/cursor unfocused dim|hollow|outline|underline|hide`
- `/cursor blink on [ms] | off`
- `/cursor provider auto|tmux|cmux|herdr|static`
- `/cursor status`
- `/cursor reset` (also `r` in the panel)

## Module map

| file | responsibility |
|---|---|
| `extensions/cursor.ts` | entry: `/cursor` command + session lifecycle |
| `lib/defaults.ts` | style enums + default config |
| `lib/config.ts` | load/save/normalize config (`~/.pi/agent/cursor.json`) |
| `lib/render.ts` | ANSI cursor-cell transforms per style |
| `lib/editor.ts` | `CursorEditor` (CustomEditor subclass) + composition |
| `lib/panel.ts` | `/cursor` SettingsList rows |
| `lib/state.ts` | blink timer |
| `lib/focus/index.ts` | `FocusProvider` interface + auto-detect |
| `lib/focus/tmux.ts` | tmux pane-focus hooks + fs.watch |
| `lib/focus/cmux.ts` | cmux v2 socket `debug.terminal.is_focused` RPC (poll) |
| `lib/focus/herdr.ts` | herdr socket API events |
| `lib/focus/static.ts` | always-focused fallback |

## Design references

- Spec: `~/Documents/secret/strategy/getpipher/cursor/SPEC.md`
- Plan: `~/Documents/secret/strategy/getpipher/cursor/PLAN-1.md`

## Constraints

- `bar` / `hollow` / `outline` cursor styles hide the char at the cursor position (a fake
  cursor *is* the cell; ANSI has no partial-cell overlay). Reappears on move.
  Documented, not a bug.
- tmux focus detection requires `set -g focus-events on` in `~/.tmux.conf`.
- cmux adapter is built from `manaflow-ai/cmux` source (`tests_v2/cmux.py`,
  `docs/events.md`, `docs/cli-contract.md`); uses the `debug.terminal.is_focused`
  RPC polled every ~300 ms. Unverified without a live cmux session in v0.1.1;
  debug-build glob socket discovery not implemented.
- herdr adapter is built from `herdr.dev/docs/socket-api` (verified against
  `herdr api schema --json`); unverified without a live herdr session in v0.1.
- Bare-terminal (no multiplexer) = static mode in v0.1 (pi-tui upstream gap;
  DEC 1004 not enabled/parsed by pi 0.80.x). v0.2.

## Publish

npm `@getpipher/cursor` under account `rz1989`, published via CI on tag `v*`
using the getpipher org `NPM_TOKEN` secret (no manual OTP).