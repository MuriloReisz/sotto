import { clipboard, dialog, ipcMain, shell, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron'
import { mkdirSync } from 'node:fs'
import { IPC } from '../shared/ipc'
import type { AudioChunk, AudioStatus, HotkeyResult, QuickAction, Settings } from '../shared/types'
import { askAboutScreen, openPermissionSettings, runQuickAction, sendMessage, startNewChat } from './actions'
import { resetHotkeys, setHotkey, startHotkeyRecording, stopHotkeyRecording } from './hotkey-editor'
import { getChat, stop } from './chat/conversation'
import { CONTEXT_FILE_FILTERS, addContextFiles, removeContextFile } from './context/files'
import { verifyApiKey } from './llm/client'
import { askAboutMeetings, listMeetings, notesFolder, openMeeting, readMeeting } from './notes/meetings'
import { isTrustedSender } from './security'
import { publishSettings, settingsView } from './settings-view'
import { getState, markUiReady, toast } from './state'
import { deleteApiKey, saveApiKey } from './store/secrets'
import { updateSettings } from './store/settings'
import { onAudioStatus, toggleListening, writeNotesNow } from './transcription/listening'
import { addChunk, getTranscript } from './transcription/session'
import { enterTyping, exitTyping, hideOverlay, setClickThrough, setOverlayHeight } from './windows/overlay'

// All handlers for messages coming from the overlay UI. Each channel is declared in
// src/shared/ipc.ts; the matching sender lives in src/preload/index.ts.
// Every handler first checks the message came from one of Sotto's own pages.

type Event = IpcMainEvent | IpcMainInvokeEvent

function trusted(event: Event): boolean {
  const ok = isTrustedSender(event.senderFrame)
  if (!ok) console.warn(`[ipc] rejected message from ${event.senderFrame?.url ?? 'unknown frame'}`)
  return ok
}

/** Fire-and-forget message from the page. */
function on<T extends unknown[]>(channel: string, handler: (...args: T) => void): void {
  ipcMain.on(channel, (event, ...args) => {
    if (trusted(event)) handler(...(args as T))
  })
}

/** Request/response from the page. */
function handle<T extends unknown[], R>(channel: string, handler: (...args: T) => R | Promise<R>): void {
  ipcMain.handle(channel, (event, ...args) => {
    if (!trusted(event)) throw new Error('Untrusted sender')
    return handler(...(args as T))
  })
}

export function registerIpcHandlers(): void {
  // overlay
  handle(IPC.getState, () => getState())
  on(IPC.toggleClickThrough, () => setClickThrough(!getState().clickThrough))
  on(IPC.hideOverlay, () => hideOverlay())
  on<[number]>(IPC.setHeight, (h) => Number.isFinite(h) && setOverlayHeight(h))
  on<[boolean]>(IPC.setTyping, (typing) => (typing ? enterTyping() : exitTyping({ giveFocusBack: true })))
  on<[string]>(IPC.copyText, (text) => {
    clipboard.writeText(String(text))
    toast('Copied', 'success')
  })
  on(IPC.uiReady, () => markUiReady())

  // chat
  handle(IPC.getChat, () => getChat())
  on<[string]>(IPC.send, (text) => sendMessage(String(text)))
  on(IPC.askScreen, () => void askAboutScreen())
  on<[QuickAction]>(IPC.quickAction, (action) => runQuickAction(action))
  on(IPC.stop, () => stop())
  on(IPC.newChat, () => startNewChat())

  // audio + transcript
  on(IPC.toggleListening, () => void toggleListening())
  on<[AudioStatus]>(IPC.audioStatus, (status) => void onAudioStatus(status))
  on<[AudioChunk]>(IPC.audioChunk, (chunk) => {
    const pcm = chunk?.pcm as unknown
    const buffer = pcm instanceof ArrayBuffer ? pcm : ArrayBuffer.isView(pcm) ? pcm.buffer.slice(pcm.byteOffset, pcm.byteOffset + pcm.byteLength) : null
    const valid =
      buffer instanceof ArrayBuffer &&
      buffer.byteLength > 0 &&
      buffer.byteLength < 2_000_000 && // ~60 s of 16 kHz audio; chunks are at most 8 s
      (chunk.speaker === 'me' || chunk.speaker === 'them') &&
      Number.isFinite(chunk.at)
    if (valid) addChunk({ speaker: chunk.speaker, at: chunk.at, pcm: buffer })
  })
  handle(IPC.getTranscript, () => getTranscript())

  // meeting notes
  handle(IPC.listMeetings, () => listMeetings())
  handle<[string], ReturnType<typeof readMeeting>>(IPC.readMeeting, (id) => readMeeting(String(id)))
  on<[string]>(IPC.openMeeting, (id) => openMeeting(String(id)))
  on(IPC.writeNotes, () => writeNotesNow())
  on<[string]>(IPC.askMeetings, (q) => askAboutMeetings(String(q)))

  // settings
  handle(IPC.getSettings, () => settingsView())
  handle<[Partial<Settings>], ReturnType<typeof settingsView>>(IPC.updateSettings, (patch) => {
    // The page may only change these. Folders and file paths are set by the main
    // process's own dialogs, so a compromised page can't point Sotto at arbitrary files.
    const allowed: (keyof Settings)[] = ['model', 'customInstructions', 'aboutMe', 'opacity', 'transcriptMinutes', 'removeEcho', 'onboarded']
    const safe = Object.fromEntries(Object.entries(patch ?? {}).filter(([k]) => allowed.includes(k as keyof Settings)))
    updateSettings(safe)
    publishSettings()
    return settingsView()
  })
  handle<[string], string | null>(IPC.setApiKey, async (key) => {
    const trimmed = String(key).trim()
    if (!/^sk-ant-/.test(trimmed)) return 'That doesn’t look like an Anthropic API key (they start with sk-ant-).'
    const problem = await verifyApiKey(trimmed)
    if (problem) return problem
    await saveApiKey(trimmed)
    publishSettings()
    return null
  })
  handle(IPC.clearApiKey, () => {
    deleteApiKey()
    publishSettings()
  })
  handle(IPC.addContextFiles, async () => {
    const result = await dialog.showOpenDialog({
      title: 'Add files Sotto should know about',
      properties: ['openFile', 'multiSelections'],
      filters: CONTEXT_FILE_FILTERS
    })
    if (result.canceled) return
    const problems = addContextFiles(result.filePaths)
    if (problems.length) toast(`Skipped ${problems.join('; ')}`, 'error')
    publishSettings()
  })
  handle<[string], void>(IPC.removeContextFile, (name) => {
    removeContextFile(String(name))
    publishSettings()
  })
  handle(IPC.chooseNotesFolder, async () => {
    const result = await dialog.showOpenDialog({ title: 'Save meeting notes in…', properties: ['openDirectory', 'createDirectory'] })
    if (result.canceled || !result.filePaths[0]) return
    updateSettings({ notesFolder: result.filePaths[0] })
    publishSettings()
  })
  on(IPC.openNotesFolder, () => {
    mkdirSync(notesFolder(), { recursive: true })
    void shell.openPath(notesFolder())
  })
  on<['screen' | 'microphone']>(IPC.openPermissionSettings, (kind) => openPermissionSettings(kind))

  // hotkey editor: hotkeys are never changed through updateSettings; setHotkey validates
  // the slot and accelerator (allowlist + length limit) and test-registers it first.
  handle<[unknown, unknown], HotkeyResult>(IPC.setHotkey, (slot, accelerator) => setHotkey(slot, accelerator))
  handle(IPC.resetHotkeys, () => resetHotkeys())
  on<[unknown]>(IPC.recordHotkey, (active) => (active === true ? startHotkeyRecording() : stopHotkeyRecording(true)))
}
