# Sotto

*Sotto voce*: said quietly, so only one person hears.

Sotto is a personal, always-on-top AI assistant overlay for macOS and Windows, inspired by Cluely. It sits on top of everything, stays out of screen shares, and is driven entirely by global hotkeys.

> **Status: M1 of 8 done.** The overlay window, hotkeys, screen-share protection and focus behaviour work and have been tested. See the [roadmap](#roadmap).

## Setup

Requirements: Node 20.19+ or 22.12+ (developed on Node 24), macOS 13+ or Windows 10 2004+.

```bash
npm install      # also downloads the Electron binary (postinstall)
npm run dev      # starts Vite + Electron with hot reload for the UI
```

Recent npm versions don't run dependencies' install scripts until you approve them (`npm install-scripts approve <pkg>`). Sotto doesn't need that:
- The project's own `postinstall` downloads Electron. If Electron ever says it "failed to install correctly", run `node node_modules/electron/install.js`.
- `koffi` loads its prebuilt binary from `@koromix/koffi-<platform>`.

| Script | What it does |
|---|---|
| `npm run dev` | Development mode. UI changes apply instantly; restart it after main-process changes (or use `npx electron-vite dev -w`) |
| `npm run build` / `npm start` | Production build into `out/`, then run that build |
| `npm run typecheck` | TypeScript check for the Node side and the browser side |
| `npm test` | Unit tests (vitest) for the pure logic in `src/shared` |
| `npm run lint` | ESLint |

Sotto has **no Dock icon and no ⌘Tab entry**. Look for the ring icon in the menu bar (macOS) or the system tray (Windows): it has Show/Hide, Click-through and **Quit**.

## Hotkeys

| Action | macOS | Windows |
|---|---|---|
| Show / hide overlay | ⌘⇧Space | Ctrl+Shift+Space |
| Screenshot → ask Claude *(M2)* | ⌘⇧S | Ctrl+Shift+S |
| Start / stop listening *(M4)* | ⌘⇧A | Ctrl+Shift+A |
| What should I say? *(M4)* | ⌘⇧↩ | Ctrl+Shift+Enter |
| Click-through on/off | ⌘⇧C | Ctrl+Shift+C |
| Move overlay (hops to the next monitor at the edge) | ⌃⌥ + arrows | Ctrl+Alt + arrows |

You can also drag the overlay by its header and resize it from the edges (resizing on Windows is untested, see limitations). Position and size are remembered. If a monitor is unplugged, the overlay is pulled back on-screen.

While Sotto runs, these combos are taken system-wide: ⌘⇧S no longer means "Save As" and ⌘⇧C no longer opens Chrome's element inspector. The move keys use ⌃⌥ rather than ⌘+arrows, because a global ⌘←/→ would break "jump to start/end of line" in every app. All hotkeys become editable in Settings (M7). If a combo is already owned by another app, the overlay lists it in red.

## How it stays out of the way

| Goal | How | Tested on this Mac |
|---|---|---|
| Hidden from screen share / recording | `setContentProtection(true)`: macOS `NSWindowSharingNone`, Windows `WDA_EXCLUDEFROMCAPTURE` | ✅ (see below) |
| On top of everything, incl. full-screen apps | `setAlwaysOnTop(true, 'screen-saver')`, `setVisibleOnAllWorkspaces(…, { visibleOnFullScreen: true })`, macOS `NSPanel` | ✅ level 1000 |
| No Dock / ⌘Tab / taskbar / Alt-Tab | `app.dock.hide()` → macOS `UIElement` app; Windows `skipTaskbar` + tool window | ✅ macOS |
| Appearing doesn't steal focus | `showInactive()` | ✅ |
| **Clicking it doesn't steal focus** | `focusable: false`, plus `-[NSWindow _setPreventsActivation:]` on macOS (`src/main/native/mac-nonactivating.ts`) | ✅ Terminal stayed frontmost through clicks and drags |
| Click-through | `setIgnoreMouseEvents(true, { forward: true })`; the card gets a dashed amber border | ✅ |
| No unprotected pop-ups | Uncaught main-process errors are logged, not shown as a dialog. The default menu (⌘R reload, ⌥⌘I DevTools) is replaced. DevTools are disabled in packaged builds | ✅ by design |

Why the private macOS call is needed: Electron's `panel` type adds the "non-activating" style only after the window exists, and AppKit ignores it then. Without the fix, one click turned the frontmost app from Terminal into Sotto. A browser page sees that as the window losing focus, and some interview and proctoring tools watch for exactly that. Because the method is private, Apple could remove it. Sotto checks it exists first and otherwise carries on without it.

### Screen-share test results

Reports from 2025 (including an [Electron issue](https://github.com/electron/electron/issues/48258) closed as "not planned") say macOS 15's ScreenCaptureKit ignores content protection, so this gets tested rather than assumed.

**Automated, 2026-11-06, macOS 26.5.1, Electron 45.2.3, run twice (before and after the fixes):**

| Capture method | Overlay visible? |
|---|---|
| Window server sharing state | `0` = excluded ✅ |
| `screencapture` still image | hidden ✅ |
| `screencapture -v` 3-second video recording | hidden ✅ |
| ScreenCaptureKit, whole display (the "share entire screen" mode) | hidden ✅ |
| ScreenCaptureKit, all apps on the display | hidden ✅ |
| ScreenCaptureKit, targeting the overlay window itself | all-black image ✅ |

**Manual: share your entire screen and look at what the other side sees:**

| Tool | Hidden? | Notes |
|---|---|---|
| Google Meet in Chrome | ☐ | Test alone: open meet.new, present your entire screen, look at the preview tile |
| Zoom (share entire screen) | ☐ | not installed on the dev Mac |
| Microsoft Teams | ☐ | not installed on the dev Mac |
| Discord screen share | ☐ | |
| QuickTime screen recording | ☐ | |
| OBS (macOS Screen Capture source) | ☐ | |

If a tool shows the overlay, the most reliable fallback is to **share a single window instead of the entire screen**: the overlay is a separate window, so it's never part of that share.

### What it does *not* hide

Be clear-eyed about this:
- **Software on the same computer can see Sotto.** It's in the process list (as "Electron" in dev, "Sotto" when packaged) and in the system window list. Proctoring tools such as Honorlock block or flag apps like this by name.
- **The menu-bar icon** appears in full-screen shares that include the menu bar. An option to hide it comes with Settings (M7).
- **Cameras.** A phone or webcam pointed at your screen sees it.
- **Your data.** Transcription runs locally (M4), but screenshots and transcript text are sent to Anthropic's API when you ask for help.
- **Recording consent.** Live listening (M4) records other people's voices. Check the consent rules for your calls, and the rules of any exam, interview or platform you use it in.

## Architecture

```
src/
  shared/     types, defaults, IPC contract, settings schema, window geometry (no Electron imports)
  main/       Electron main process: holds all secrets, makes every network call
    index.ts            app lifecycle: Dock hiding, menu, permissions, window + hotkeys + tray + IPC
    windows/overlay.ts  the overlay window: always-on-top, protection, focus, click-through, move
    native/             macOS non-activating fix (koffi → Objective-C runtime)
    security.ts         navigation lockdown, trusted-sender check, permission allow-list
    menu.ts             minimal app menu (Edit + Quit only)
    hotkeys.ts          global shortcut registration with error reporting
    tray.ts             menu-bar / tray icon (drawn in code)
    state.ts            app state owned by main, pushed to the UI on every change
    store/settings.ts   settings.json in the OS app-data folder (never secrets)
  preload/    the only bridge: exposes a small typed API as window.sotto
  renderer/   React UI (sandboxed, no Node, strict Content-Security-Policy)
tests/        unit tests for src/shared
```

Security rules:
- The page can't navigate away or open windows, so a dropped link can't load a remote page that gets `window.sotto`.
- Every IPC handler checks that the sender is one of Sotto's own pages.
- Permission requests are denied except mic/system audio for Sotto's own page (needed in M4).
- API keys (M2) stay in the main process, encrypted with Electron `safeStorage`.

Settings file: `~/Library/Application Support/Sotto/settings.json` (macOS), `%APPDATA%\Sotto\settings.json` (Windows).

## Roadmap

| # | Milestone | Status |
|---|---|---|
| M1 | Overlay window, hotkeys, screen-share protection, focus behaviour, tray | ✅ |
| M2 | Screenshot → Claude → streamed markdown answer; API key stored encrypted | next |
| M3 | Chat panel + conversation history; **your own context** (profile, CV, product docs) included in every answer | |
| M4 | Live mic + system-audio transcription (local whisper.cpp), "What should I say?" and **quick buttons**: follow-up questions, fact check, recap | |
| M5 | **Meeting notes + follow-up email** when you stop listening: summary, decisions, action items, transcript, saved as markdown | |
| M6 | **Ask about past meetings**: search and question your saved notes | |
| M7 | Settings window (keys, model, hotkeys, opacity, prompt, tray icon), packaging with electron-builder | |
| M8 | Sharing: private GitHub repo + releases + one-line install command (installs Sotto, whisper.cpp and the speech model) | |

## Permissions

M1 needs no permissions. Global hotkeys don't need Accessibility on macOS: Electron registers them through the OS hotkey API.
- **Screen Recording** (M2, for screenshots): macOS prompts on first use.
- **Microphone** and **Screen & System Audio Recording** (M4): prompted when you first start listening.

## Known limitations (so far)

- Screen-share protection is best-effort, not a guarantee. Capture tools and macOS versions change; re-run the tests above after updates. On Windows versions before 10 2004, protected windows show as black rectangles instead of disappearing.
- The macOS non-activating fix uses a private Apple API (see above).
- Resizing a transparent window from its edges is untested on Windows and may not work. A size setting arrives with Settings (M7).
- On Windows, some older Intel graphics drivers use Ctrl+Alt+arrows to rotate the screen. Rebind the move keys if that happens.
