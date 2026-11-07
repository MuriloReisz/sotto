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

> **Status:** M1–M8 built. Signed macOS builds (Apple Silicon and Intel) and a Windows installer, with one-line installs below. Windows is newer and less tested than macOS.

## Install

**macOS 13 or later** (Apple Silicon or Intel). In Terminal:

```bash
curl -fsSL https://raw.githubusercontent.com/MuriloReisz/sotto/main/install.sh | bash
```

**Windows 10 or 11** (64-bit). In PowerShell:

```powershell
irm https://raw.githubusercontent.com/MuriloReisz/sotto/main/install.ps1 | iex
```

Run the same command again to update. Your settings, API key and meeting notes are kept.

What the commands do:
1. **Download the latest release and check it before installing anything.** Its SHA-256 must match the release's `SHA256SUMS` file. On macOS the app must also be signed with Sotto's release certificate. If a check fails, nothing is installed.
2. **Install the app.**
   - macOS: into `/Applications` (or `~/Applications` if that isn't writable).
   - Windows: for your user only, with no admin prompt, into `%LOCALAPPDATA%\Programs\sotto`.
3. **Set up local, offline transcription.**
   - macOS: installs whisper.cpp with Homebrew. If you don't have Homebrew, this step is skipped with a note.
   - Windows: downloads whisper.cpp (pinned release v1.9.2, hash-checked) into `%APPDATA%\Sotto\whisper`. If the Microsoft Visual C++ runtime is missing or too old, it installs it, and Windows shows **one UAC (administrator) prompt** for that.
4. **Download a speech model.** This is `small.en` (466 MB, about 1–2 minutes on a fast connection), from a fixed Hugging Face commit and hash-checked.
5. **Open Sotto.** If Sotto is already open (maybe in a call), the installer asks before closing it. When it can't ask, for example with no terminal attached, it stops and tells you to quit Sotto and run it again.

Options (environment variables):

| Variable | Effect |
|---|---|
| `SOTTO_MODEL=base.en` | Smaller, faster model (142 MB) instead of `small.en` |
| `SOTTO_SKIP_WHISPER=1` | No transcription setup (chat and screenshots still work) |
| `SOTTO_VERSION=v0.2.0` | Install that release instead of the latest |
| `SOTTO_NO_OPEN=1` | Don't open Sotto at the end |

Example on macOS: `curl -fsSL …/install.sh | SOTTO_MODEL=base.en bash`. On Windows, run `$env:SOTTO_MODEL = 'base.en'` first.

**Permissions.** On macOS, the first time you listen or ask about your screen, macOS asks for Microphone and Screen & System Audio Recording access. The prompts name **"Sotto"**. Click Allow. You only do this once, because releases are always signed with the same certificate, so the permissions survive updates. On Windows, you may be asked about microphone access the first time you listen.

**Gatekeeper (macOS).** Sotto isn't notarized, because there's no Apple Developer ID. The install command downloads with `curl`, which doesn't set the quarantine flag, so Sotto opens normally. If you download the `.zip` or `.dmg` from the Releases page in a browser instead, macOS says it "can't be opened":
- macOS 13–14: right-click Sotto.app › Open, once.
- macOS 15 or later: System Settings › Privacy & Security › Open Anyway.
- Any version: you can also run `xattr -dr com.apple.quarantine /Applications/Sotto.app`.

On Windows, a browser-downloaded `Sotto-win-x64.exe` triggers SmartScreen. Click More info › Run anyway. The PowerShell command doesn't trigger it.

**Windows is newer and less tested than macOS.** Please [report problems](https://github.com/MuriloReisz/sotto/issues).

## Setup (development)

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
  https://huggingface.co/ggerganov/whisper.cpp/resolve/5359861c739e955e79d9a303bcbc70fb988958b1/ggml-small.en.bin
shasum -a 256 ~/Library/Application\ Support/Sotto/models/ggml-small.en.bin
# expect c6138d6d58ecc8322097e0f987c32f1be8bb0a18532a3f88f734d1bbf9c41e5d
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

While Sotto runs, these combos are taken system-wide: ⌘⇧S isn't "Save As", ⌘⇧C isn't Chrome's inspector, and ⌘⇧K isn't Slack's DM list. Change any of them in **Settings → Shortcuts**: press Change, then the new keys (Esc cancels, Delete clears it). The change applies at once; combos another app owns and system shortcuts (⌘Q, ⌘W, ⌘Tab, ⌘Space, copy/paste…) are refused.

**Headphones work best on calls.** Without them your microphone also hears the other side. Sotto removes those echoed lines automatically (Settings › Live transcription), but headphones give cleaner audio.

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

`npm test` runs 112 unit tests: geometry, the speech chunker, the WAV encoder, transcript formatting, echo removal, listening sessions, trusted URLs, meeting files, the settings schema and hotkeys.

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

## Packaging

```bash
npm run dist:mac                                         # ad-hoc signed
SOTTO_SIGN_IDENTITY="Sotto Self-Signed" npm run dist:mac # signed with the release certificate
npm run dist:win                                         # NSIS installer (run on Windows; CI does this)
```

`dist:mac` builds with electron-vite, fetches koffi's native module for both Mac architectures (`scripts/koffi-prebuilds.mjs`), then runs electron-builder (`electron-builder.config.mjs`). Output goes to `release/<version>/`. The file names carry no version (the release tag does), so the installers can always download `releases/latest/download/<file>`:

| File | What |
|---|---|
| `Sotto-mac-arm64.zip` / `.dmg` | Apple Silicon |
| `Sotto-mac-x64.zip` / `.dmg` | Intel (also runs under Rosetta) |
| `Sotto-win-x64.exe` | Windows installer, per user, no admin prompt (`/S` installs silently) |
| `SHA256SUMS` | `npm run release:sums` (mac lines); CI adds the `.exe` line |

- **App:** `com.muriloreis.sotto`, menu-bar only (`LSUIElement`), with usage descriptions for the microphone, system audio (`NSAudioCaptureUsageDescription`, macOS 14.2+) and screen recording. Icon: `build/icon.png` / `build/icon.icns`.
- **Signing (macOS):** there is no Apple Developer ID, so builds are never notarized and run without hardened runtime (which only notarization requires; no entitlements needed).
  - Without `SOTTO_SIGN_IDENTITY` the app is signed **ad hoc**. That signature is a hash of this exact build, so macOS treats every build as a new app and asks for Microphone / Screen Recording again after each update.
  - With `SOTTO_SIGN_IDENTITY` (a certificate name or SHA-1 in the login keychain) every build carries the same designated requirement, `identifier "com.muriloreis.sotto" and certificate leaf = H"…"`, so permission grants survive updates. Always sign releases with the same certificate.
  - Downloaded with a browser, an unnotarized app is blocked by Gatekeeper ("can't be opened"). See [Install](#install) for how to open it. `curl` downloads (the install script) are not quarantined.
- **Hardening:** Electron fuses turn off `ELECTRON_RUN_AS_NODE`, `NODE_OPTIONS` and `--inspect`, and the app only loads its integrity-checked `app.asar`. DevTools, the dev CSP and `SOTTO_FAKE_LLM` are all off in packaged builds.
- **Transcription:** packaged apps launched from Finder don't get Homebrew's `PATH`, so `whisper-server` is also looked up at `/opt/homebrew/bin` and `/usr/local/bin` (and `~/Library/Application Support/Sotto/whisper`). Models are found as described in [Setup](#setup-development).
- **Data:** the packaged app uses the same data folder as `npm run dev` (`~/Library/Application Support/Sotto`). The first time it reads a key saved by the dev build, macOS asks once for keychain access ("Sotto Safe Storage").
- **Windows** is built by `.github/workflows/release.yml` on a `v*` tag (or by hand from the Actions tab) and uploaded to that GitHub release. Untested on real hardware.

## Releasing (maintainers)

1. Bump `"version"` in `package.json`, commit and push.
2. Build and sign the Mac apps with the release certificate:
   ```bash
   SOTTO_SIGN_IDENTITY="Sotto Self-Signed" npm run dist:mac
   ```
3. Write the checksums for the Mac files (`release/<version>/SHA256SUMS`):
   ```bash
   npm run release:sums
   ```
4. Create the release with every Mac file and `SHA256SUMS`. This also creates the tag:
   ```bash
   v=0.2.0
   gh release create "v$v" \
     "release/$v/Sotto-mac-arm64.zip" "release/$v/Sotto-mac-x64.zip" \
     "release/$v/Sotto-mac-arm64.dmg" "release/$v/Sotto-mac-x64.dmg" \
     "release/$v/SHA256SUMS" \
     --title "Sotto v$v" --notes "What changed…"
   ```
5. CI does the rest:
   - The tag starts `release.yml`. It builds `Sotto-win-x64.exe` (the build job has a read-only token), adds it to the release, and adds its line to `SHA256SUMS`.
   - It never creates a release. If the release or its `SHA256SUMS` is missing, the upload job fails. Fix that, then re-run the job.
   - `install-test.yml` then runs both install commands on clean runners. The macOS test runs when the release is published, the Windows test after the upload. Each checks the app, whisper.cpp and the model hash. You can also start it from the Actions tab.

Notes:
- **Don't rename release files.** The installers download them by name.
- **Replacing a Mac file later:** run `npm run release:sums` again and upload `SHA256SUMS` with `--clobber`. That drops the `.exe` line, so then re-run `release.yml` from the Actions tab with the tag.
- **Pinned downloads:** whisper.cpp for Windows is `v1.9.2`, and the speech models come from Hugging Face commit `5359861c…`. Both have fixed SHA-256 values in `install.sh` and `install.ps1`. To update them, change the version or commit and the hashes together.

## Roadmap

| # | Milestone | Status |
|---|---|---|
| M1 | Overlay, hotkeys, screen-share protection, focus behaviour, tray | ✅ |
| M2 | Screenshot → Claude → streamed answer; encrypted key | ✅ (real-key test pending) |
| M3 | Chat + history; your own context (about you, files) | ✅ |
| M4 | Live transcription (local whisper.cpp), "What should I say?" + quick buttons | ✅ (live-mic test pending) |
| M5 | Meeting notes + follow-up email | ✅ |
| M6 | Ask about past meetings | ✅ |
| M7 | Hotkey editor, packaging (signed mac arm64 + x64, Windows installer) | ✅ |
| M8 | Sharing: public GitHub repo + releases + one-line install commands, tested in CI | ✅ |

## Known limitations

- Screen-share protection is best-effort; capture tools and macOS versions change. Re-run the checks above after updates.
- The macOS focus refinement uses private Apple methods. Sotto checks they exist first and keeps working without them.
- Transcription with the `.en` models is English-only, and lags a phrase (≈1–3 s after someone stops talking).
- Without headphones, your mic also hears the other side. Echo removal drops those copies, but very short echoes (under four words) can still appear twice.
- Windows is configured but untested.
