# Veil

A personal, always-on-top AI assistant overlay for macOS and Windows, inspired by Cluely.
It stays on top of everything, tries to stay out of screen shares, and is driven by global hotkeys.

> **Status: M1 of 5.** Overlay window, hotkeys and content protection are done.
> Screenshot → Claude (M2), chat (M3), live transcription (M4) and settings/packaging (M5) come next.

## Setup

Requirements: Node 20.19+ or 22.12+ (developed on Node 24), macOS 13+ or Windows 10 2004+.

```bash
npm install      # also downloads the Electron binary (postinstall)
npm run dev      # starts Vite + Electron with hot reload
```

If Electron complains that it "failed to install correctly", run `node node_modules/electron/install.js`.

Other scripts:

| Script | What it does |
|---|---|
| `npm run dev` | Development mode with hot reload (UI changes apply instantly; main-process changes restart the app) |
| `npm run build` / `npm start` | Production build into `out/`, then run that build |
| `npm run typecheck` | TypeScript check for the Node side and the browser side |
| `npm test` | Unit tests (vitest) for the pure logic in `src/shared` |
| `npm run lint` | ESLint |

Veil has **no Dock icon**. Look for the ring icon in the menu bar (macOS) or the system tray (Windows): it has Show/Hide, Click-through and **Quit**.

## Hotkeys

| Action | macOS | Windows |
|---|---|---|
| Show / hide overlay | ⌘⇧Space | Ctrl+Shift+Space |
| Screenshot → ask Claude *(M2)* | ⌘⇧S | Ctrl+Shift+S |
| Start / stop listening *(M4)* | ⌘⇧A | Ctrl+Shift+A |
| What should I say? *(M4)* | ⌘⇧↩ | Ctrl+Shift+Enter |
| Click-through on/off | ⌘⇧C | Ctrl+Shift+C |
| Move overlay | ⌃⌥ + arrows | Ctrl+Alt + arrows |

You can also drag the overlay by its header and resize it from the edges. Position and size are remembered.

While Veil runs, these combos are taken system-wide: ⌘⇧S no longer means "Save As" and ⌘⇧C no longer opens Chrome's element inspector. The move keys use ⌃⌥ rather than ⌘+arrows, because a global ⌘←/→ would break "jump to start/end of line" in every app. All hotkeys become editable in Settings (M5). If a combo is already owned by another app, the overlay lists it in red.

## How it works (M1)

```
src/
  shared/     types, defaults, IPC channel names, settings schema (no Electron imports; used everywhere)
  main/       Electron main process
    index.ts           app lifecycle: hides the Dock icon, wires window + hotkeys + tray + IPC
    windows/overlay.ts the overlay window: always-on-top, content protection, click-through, move
    hotkeys.ts         global shortcut registration with error reporting
    tray.ts            menu-bar / tray icon (drawn in code, no image file)
    state.ts           app state owned by main, pushed to the UI on every change
    store/settings.ts  settings.json in the OS app-data folder (no secrets)
  preload/    the only bridge: exposes a small typed API as window.veil
  renderer/   React UI (sandboxed: no Node, strict Content-Security-Policy)
tests/        unit tests for src/shared
```

Each overlay property maps to one Electron call:

- **Always on top, even over full-screen apps:** `setAlwaysOnTop(true, 'screen-saver')` + `setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })`, and on macOS the window is an `NSPanel` (`type: 'panel'`).
- **Doesn't steal focus:** shown with `showInactive()`.
- **Hidden from capture:** `setContentProtection(true)` → macOS `NSWindowSharingNone`, Windows `WDA_EXCLUDEFROMCAPTURE`.
- **Click-through:** `setIgnoreMouseEvents(true, { forward: true })`; the card gets a dashed amber border so you know clicks go to the app behind it.
- **No Dock / taskbar / Alt-Tab presence:** `app.dock.hide()` (macOS), `skipTaskbar` + `type: 'toolbar'` (Windows).

Settings file: `~/Library/Application Support/veil/settings.json` (macOS), `%APPDATA%\veil\settings.json` (Windows).

## Screen-share invisibility: test results

Reports online say that on macOS 15+ apps capturing through **ScreenCaptureKit** (Zoom, new Teams, QuickTime, ⌘⇧5, new OBS) ignore `NSWindowSharingNone`, and that Apple offers "no public API for preventing screen capture". So it gets tested on the real machine rather than assumed.

**Automated checks, 2026-11-06, macOS 26.5.1, Electron 45.2.3:**

| Check | Result |
|---|---|
| Window server reports the overlay's sharing state | `sharing=0` (none) ✅ |
| `screencapture` (built-in CLI) | overlay **not** in the image ✅ |
| ScreenCaptureKit `SCScreenshotManager`, whole-display filter (the mode used for "share entire screen") | overlay **not** in the image ✅ |

**Manual checks (share your entire screen, then look at the viewer's side or the recording):**

| Tool | Hidden? | Notes |
|---|---|---|
| Zoom (share entire screen) | ☐ | |
| Microsoft Teams (share screen) | ☐ | |
| Google Meet in Chrome | ☐ | |
| QuickTime screen recording | ☐ | |
| ⌘⇧5 screenshot / recording | ☐ | |
| OBS (macOS Screen Capture source) | ☐ | |

If a tool shows the overlay, the most reliable fallback is to **share a single window instead of the entire screen**: the overlay is a separate window, so it's never part of that share.

## Permissions

M1 needs no permissions. Global hotkeys don't need Accessibility on macOS: Electron registers them through the OS hotkey API.

- **Screen Recording** (M2, for screenshots): macOS will prompt on first use.
- **Microphone** and **Screen & System Audio Recording** (M4): prompted when you first start listening.

## Known limitations (so far)

- Content protection is best-effort, not a guarantee. Capture tools can change, and on Windows versions before 10 2004 protected windows show up as black rectangles instead of disappearing.
- Content protection doesn't hide Veil from a phone camera pointed at your screen, or from software that reads the screen at the driver level.
- On Windows, some older Intel graphics drivers use Ctrl+Alt+arrows to rotate the screen. Rebind the move keys if that happens.
