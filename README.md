# Sotto

*Sotto voce*: said quietly, so only one person hears.

Sotto is a personal AI assistant that floats at the top of your screen, stays out of screen shares and recordings, and helps on cue:

- **Ask about your screen**: one shortcut sends a screenshot to Claude and streams back the answer.
- **Chat**: type follow-up questions. The conversation keeps its context.
- **Listen to calls**: transcribes your microphone ("Me") and your computer's audio ("Them") live, on your own computer.
- **On-call buttons**: *What should I say?*, *Follow-up questions*, *Fact check*, *Recap*, all answered from the live conversation.
- **Meeting notes**: when you stop listening, Sotto writes a summary, key points, decisions, action items and a follow-up email, and saves them as a markdown file.
- **Ask about past meetings**: "what did I promise Acme?" is answered from your saved notes.
- **Your own context**: a short "about you" and files (CV, pricing, product notes) go into every answer.

> **Status:** M1–M6 built and tested (see [Testing](#testing)). Next come packaging (M7) and a one-line installer for sharing (M8).

## Setup

You need:
- macOS 13+ or Windows 10 2004+
- Node 20.19+ or 22.12+
- an Anthropic API key, from console.anthropic.com → API keys

```bash
npm install              # also downloads the Electron binary
brew install whisper-cpp # macOS: local speech recognition (free, offline)
npm run dev              # start Sotto
```

**Speech model.** Sotto looks for a whisper.cpp model: the path in Settings, then `~/Library/Application Support/Sotto/models/`, then `~/.cache/whisper/`. It prefers `ggml-small.en.bin` (English, 466 MB, accurate and fast on Apple Silicon). To download it:

```bash
mkdir -p ~/Library/Application\ Support/Sotto/models
curl -L -o ~/Library/Application\ Support/Sotto/models/ggml-small.en.bin \
  https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.en.bin
```

For other languages, use `ggml-small.bin` (multilingual) instead.

On first launch a short welcome guide asks for your API key. The key is checked with Anthropic, then stored encrypted with the OS keychain (Electron `safeStorage`) in Sotto's data folder. It is never written to the repo or shown to the UI.

| Script | What it does |
|---|---|
| `npm run dev` | Development mode. UI changes apply instantly; restart after main-process changes |
| `SOTTO_FAKE_LLM=1 npm run dev` | **Test mode**: canned, streamed answers and fake notes. No key and no cost. Never active in a packaged build |
| `npm run build` / `npm start` | Production build into `out/`, then run it |
| `npm run typecheck` · `npm test` · `npm run lint` | TypeScript, unit tests (vitest), ESLint |

Sotto has **no Dock icon and no ⌘Tab entry**. The ring icon in the menu bar (or system tray) has Show/Hide, Settings, Help, "Move back to the top centre" and **Quit**.

## Using it

| Action | macOS | Windows |
|---|---|---|
| Show / hide Sotto | ⌘⇧Space | Ctrl+Shift+Space |
| Ask about your screen | ⌘⇧S | Ctrl+Shift+S |
| Start / stop listening | ⌘⇧A | Ctrl+Shift+A |
| What should I say? | ⌘⇧↩ | Ctrl+Shift+Enter |
| Type a question | ⌘⇧K | Ctrl+Shift+K |
| Let clicks pass through | ⌘⇧C | Ctrl+Shift+C |
| Move Sotto (hops to the next monitor at the edge) | ⌃⌥ + arrows | Ctrl+Alt + arrows |

How focus works:
- **Clicking Sotto never takes focus from the app you're in.**
- **Clicking a text box (or ⌘⇧K) lets you type.** Enter sends the question and hands focus back to the app you were in; Esc does the same without sending.

While Sotto runs, these combos are taken system-wide: ⌘⇧S isn't "Save As", ⌘⇧C isn't Chrome's inspector, and ⌘⇧K isn't Slack's DM list. Editing hotkeys comes in M7.

**On calls, use headphones.** Otherwise your microphone also picks up the other side, and their words appear twice.

**Meeting notes** are saved to `~/Documents/Sotto/Meetings` by default; you can change the folder in Settings. Each meeting is one markdown file (`2026-11-06 14-05 Pricing call with Acme.md`) with frontmatter, the notes, the follow-up email and the full transcript. They open in any editor or Obsidian. Calls under ~40 words don't get automatic notes; use "Write meeting notes" in the Transcript tab.

## Privacy: what goes where

| Data | Where it goes |
|---|---|
| Call audio | Stays on your computer. whisper.cpp runs locally; audio isn't saved, only the transcript |
| Transcript, screenshots, your files and "about you" | Sent to Anthropic's API **when you ask something** (and the transcript when notes are written) |
| API key | Encrypted on disk (`safeStorage`). Only the main process can read it |
| Meeting notes | Markdown files in the folder you choose |

## How it stays out of the way

| Goal | How | Tested on the dev Mac (macOS 26.5.1) |
|---|---|---|
| Hidden from screen share / recording | `setContentProtection(true)` → macOS `NSWindowSharingNone`, Windows `WDA_EXCLUDEFROMCAPTURE` | ✅ 6 capture methods, see below |
| On top of everything, incl. full-screen apps | `setAlwaysOnTop(true, 'screen-saver')`, `setVisibleOnAllWorkspaces(…, { visibleOnFullScreen: true })`, `NSPanel` | ✅ |
| No Dock / ⌘Tab / taskbar / Alt-Tab | `app.dock.hide()` (UIElement), Windows tool window + `skipTaskbar` | ✅ macOS |
| Clicking it doesn't steal focus | `focusable: false` + `-[NSWindow _setPreventsActivation:]` via koffi (`src/main/native/mac-focus.ts`) | ✅ Terminal stayed frontmost |
| No surprise windows during a call | No native error dialogs (errors are logged), no DevTools in builds, minimal menu, and Sotto never opens System Settings on its own | ✅ by design |
| Window only as big as its content | The page reports its height and the window follows, so there's no invisible click-blocking area | ✅ |

**Screen-share tests (automated, 2026-11-06):**
- **Window server:** reports `sharing=0` for the overlay.
- **Built-in capture:** `screencapture` stills and video don't show it.
- **ScreenCaptureKit:** whole display and all-apps captures don't show it, and capturing the window directly gives a black image.

Reports say macOS 15 broke this ([Electron #48258](https://github.com/electron/electron/issues/48258)); on macOS 26.5 it held in every mode tested.

**Your manual checks** (share your *entire* screen and look at what the other side sees):

| Tool | Hidden? |
|---|---|
| Google Meet in Chrome (meet.new → present → look at the preview tile) | ☐ |
| Zoom | ☐ |
| Microsoft Teams | ☐ |
| Discord | ☐ |
| QuickTime screen recording | ☐ |

If one shows Sotto, share a single window instead of the whole screen.

**What it does not hide:**
- **Software on the same computer.** Sotto is in the process and window lists, and proctoring tools such as Honorlock block apps like it by name.
- **Your screen and your mic.** It doesn't hide from cameras. The menu-bar icon shows in full-screen shares, and the macOS orange/purple recording indicators appear while listening.
- **Permission windows** (macOS prompts, the file picker in Settings) are system windows, so do setup before a call.
- **Other people's voices.** Listening records them; check the consent rules for your calls, and the rules of any exam, interview or platform.

## Permissions

- **Screen Recording** (asking about your screen): macOS prompts on first use.
- **Microphone** and **Screen & System Audio Recording** (listening): Sotto asks for the microphone first. Without it, only "Them" is transcribed; without system audio, only "Me".
- **In development** (`npm run dev`) on macOS, `scripts/electron-vite.mjs` starts Electron as its own "responsible process", so the prompts and System Settings entries say **Electron** (bundle id `com.github.Electron`, shared by every dev Electron app on this Mac), not your terminal. Without it macOS checks the terminal app, which has no system-audio usage key, so "Them" would get a dead stream. `SOTTO_DEV_DISCLAIM=0 npm run dev` turns this off (permissions then go to the terminal again). The packaged app gets its own entries.
- **Accessibility is not needed.** Global hotkeys use the OS hotkey API.

## Architecture

```
src/
  shared/      types, IPC contract, defaults, settings schema, pure logic (unit-tested):
               geometry, speech-chunker (VAD), wav, transcript, meeting-file
  main/        Electron main process: owns all state and secrets, makes every network call
    index.ts            wiring: window, hotkeys, tray, IPC, permissions
    actions.ts          what hotkeys/buttons do (ask screen, quick actions, focus chat)
    chat/conversation   Claude conversation: streaming, stop, append-only history
    llm/                SDK client (+ refusal fallback), prompts, dev-only fake model
    capture/screenshot  display under the mouse → JPEG ≤1568px
    transcription/      whisper-server process, transcript session, listen start/stop
    notes/meetings      notes via structured output → markdown files; past-meeting Q&A
    context/files       your files → document/text blocks (cached)
    store/              settings.json (zod-validated) and the encrypted key
    native/mac-focus    koffi → Objective-C: non-activating overlay, focus hand-back
    windows/overlay     the window: placement, height, typing mode, click-through, moving
    security.ts         navigation lockdown, trusted-sender checks, permission allow-list
  preload/     the only bridge: a typed API as window.sotto
  renderer/    React UI (sandboxed, strict CSP)
    overlay/audio/      mic + system audio → AudioWorklet (16 kHz) → SpeechChunker → main
    overlay/components/ command bar, chat, transcript, notes, settings, welcome/help
tests/         vitest
```

Data flow for "What should I say?":
1. The page captures audio and cuts it into phrases at pauses.
2. The main process transcribes each phrase with whisper.cpp.
3. The hotkey sends the last N minutes of transcript and your context to Claude.
4. The answer streams back into the chat.

## Testing

`npm test` runs 33 unit tests: geometry, the speech chunker, the WAV encoder, transcript formatting, meeting files, the settings schema and hotkeys.

End-to-end tests run on 2026-11-06 in test mode, driven through DevTools Protocol:
- **First-run guide**, chat streaming with markdown, Stop and New chat.
- **Transcription**, with a synthetic two-voice call made with `say` and pushed through IPC. whisper returned all four lines word for word, labelled Me/Them correctly.
- **Meeting notes** written and saved, then listed, opened and searched. Asking about past meetings worked.
- **Quick actions**, API-key validation against Anthropic (an invalid key is rejected with a clear message), and the screenshot error path.

Not yet verified (they need your unlocked screen, permissions or a real key):
- live mic and system-audio capture
- a real Claude answer and real notes
- typing mode handing focus back
- screenshots of an unlocked screen
- Windows

## Roadmap

| # | Milestone | Status |
|---|---|---|
| M1 | Overlay, hotkeys, screen-share protection, focus behaviour, tray | ✅ |
| M2 | Screenshot → Claude → streamed answer; encrypted key | ✅ (real-key test pending) |
| M3 | Chat + history; your own context (about you, files) | ✅ |
| M4 | Live transcription (local whisper.cpp), "What should I say?" + quick buttons | ✅ (live-mic test pending) |
| M5 | Meeting notes + follow-up email | ✅ |
| M6 | Ask about past meetings | ✅ |
| M7 | Hotkey editor, packaging (dmg arm64, ad-hoc signed; Windows installer) | next |
| M8 | Sharing: private GitHub repo + releases + one-line install command | |

## Known limitations

- Screen-share protection is best-effort; capture tools and macOS versions change. Re-run the checks above after updates.
- The macOS focus refinement uses private Apple methods. Sotto checks they exist first and keeps working without them.
- Transcription with the `.en` models is English-only, and lags a phrase (≈1–3 s after someone stops talking).
- Without headphones, your mic also hears the other side.
- Windows is configured but untested.
