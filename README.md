# @getpipher/cursor

A [pi coding-agent](https://github.com/earendil-works/pi-coding-agent) extension that customizes the editor cursor and makes it **focus-aware** across terminal/multiplexer stacks.

pi draws its own fake cursor (a reverse-video cell) and hides the real hardware cursor. That fake cursor has no "inactive" state and no configurability. `@getpipher/cursor` replaces the editor with a `CustomEditor` that render-transforms the cursor cell per your config and restyles it when the pane loses focus.

## Install

```bash
pi install npm:@getpipher/cursor
```

Then `/reload` (or restart pi) and run `/cursor` to open the settings panel.

## Features

- **Focused styles:** `block` (pi native, default), `bar` (▎), `underline`.
- **Unfocused styles:** `hollow` (□ sharp hollow block, default), `outline` (▢ rounded), `dim` (faint block), `underline`, `hide`.
- **Blink** (opt-in, default off) — pauses when the pane is unfocused.
- **Focus detection** via a pluggable `FocusProvider`:
  - **tmux** — pane-focus-in/out hooks + `fs.watch` (push).
  - **cmux** — cmux v2 socket API `debug.terminal.is_focused` RPC (poll).
  - **herdr** — herdr socket API events (push).
  - **static** — always-focused fallback (bare terminal / unknown).
- **`/cursor` panel** — the same `SettingsList` engine pi's native `/settings` uses, plus power-user subcommands. Press **`r`** in the panel to reset to defaults.

## `/cursor` command

```
/cursor                      # open the settings panel (TUI) or print status
/cursor on | off             # master switch
/cursor focused block|bar|underline
/cursor unfocused dim|hollow|outline|underline|hide
/cursor blink on [ms] | off  # ms ∈ {400,500,600,800,1000}
/cursor provider auto|tmux|cmux|herdr|static
/cursor status               # print config + active provider + detected env
/cursor reset                # reset to defaults (also: `r` in the panel)
```

Config persists to `~/.pi/agent/cursor.json` and survives restarts. It's **live-global**: a change in one pi session writes the file and propagates to all other running pi sessions immediately (via a file watcher) — set it once in any pane, every running pane updates its cursor live.

## Focus providers

### tmux (default for tmux users)

Uses `tmux set-hook -p -t $TMUX_PANE pane-focus-in/out` to write focus state to a per-pane file, watched via `fs.watch`. **Requires** focus-events enabled in your tmux config:

```conf
# ~/.tmux.conf
set -g focus-events on
```

If `focus-events` is off, the extension degrades gracefully to static mode and notifies you once.

### cmux

Uses cmux's v2 socket API to call the purpose-built `debug.terminal.is_focused` RPC with our surface id (`CMUX_SURFACE_ID`), polled every ~300 ms. The server authoritatively resolves the full window→workspace→pane→surface focus hierarchy, so the client never reconstructs it. Auto-detected when `CMUX_SURFACE_ID` is present and the cmux control socket is reachable (`CMUX_SOCKET_PATH`, or `~/Library/Application Support/cmux/last-socket-path`, or `/tmp/cmux-debug.sock`, or `~/Library/Application Support/cmux/cmux.sock`, or `/tmp/cmux.sock`). Precedence: `tmux` > `cmux` > `herdr` > `static`.

> **⚠️ v0.1.1 cmux adapter is built from `manaflow-ai/cmux` source (`tests_v2/cmux.py`, `docs/events.md`, `docs/cli-contract.md`) and unit-tested against a mocked RPC, but not verified against a live cmux session.** The wire envelope, the `debug.terminal.is_focused` method + params + result shape, and the socket-path resolution order are confirmed against the Python client source (not just prose docs). The one assumption: that `CMUX_SURFACE_ID` is always injected into terminal surfaces (cli-contract.md states it is the "Default surface context inside cmux terminals"). Debug-build glob socket discovery (`/tmp/cmux-debug-*.sock`, `cmux*.sock`) is not implemented in v0.1.1. See `lib/focus/cmux.ts`.

### herdr

Uses herdr's local socket API (`session.snapshot` + `events.subscribe`); auto-detected when the herdr socket is present (`HERDR_SOCKET_PATH`, `HERDR_SESSION`, or `~/.config/herdr/herdr.sock`).

> **⚠️ v0.1 herdr adapter is built from `herdr.dev/docs/socket-api` and unit-tested against a mocked socket, but not verified against a live herdr session.** Three constants (the our-own-pane-id env var, the `events.subscribe` event names, and the focus-event field name) are documented assumptions — confirm/adjust them in a real herdr pane with `env | grep -i herdr` and `herdr api schema --json`. See `lib/focus/herdr.ts`.

### static (fallback)

No multiplexer detected (bare Ghostty/Kitty/iTerm2/Alacritty, or unknown). The cursor styles still work; only the focus-aware behavior is inactive.

> **Bare-terminal focus detection (DEC 1004) is not in v0.1** — pi 0.80.x doesn't enable `?1004h` or parse `\x1b[I`/`\x1b[O`. Tracked for a later release.

## The char-hidden constraint

A fake cursor *is* the cell — ANSI has no partial-cell overlay. So the **`bar`** (focused) and **`hollow`**/**`outline`** (unfocused) styles render a glyph that **hides the character at the cursor position** while the cursor sits on it; the character reappears when the cursor moves. This is a terminal limitation, not a bug. `block`, `underline`, `dim`, and `hide` preserve the character.

## Compatibility

- pi `@earendil-works/pi-coding-agent` and `@earendil-works/pi-tui` `^0.80.x` (peer deps `*`).
- Node `>=20`.
- macOS / Linux (Unix domain sockets). Windows herdr uses named pipes (untested).

## Development

```bash
pnpm install
pnpm typecheck
pnpm test:run      # node:test via tsx
```

## License

MIT © RECTOR