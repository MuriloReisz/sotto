import { shell } from 'electron'
import { QUICK_ACTIONS, SCREEN_PROMPT } from '../shared/defaults'
import { formatAccelerator } from '../shared/hotkey-format'
import { formatTranscript } from '../shared/transcript'
import type { QuickAction } from '../shared/types'
import { SCREEN_PERMISSION_HELP, ScreenNotAllowedYetError, ScreenPermissionError, captureScreen } from './capture/screenshot'
import { ask, newChat, notice } from './chat/conversation'
import { showView, getState, toast } from './state'
import { getSettings } from './store/settings'
import { getTranscript } from './transcription/session'
import { enterTyping, showOverlay } from './windows/overlay'

// What the hotkeys and buttons do. Kept here so the hotkey map, tray menu and IPC
// handlers all call the same functions.

/** After listening stops, typed questions still get the call as context this long
 *  (e.g. "what did they say about pricing?"), unless you start a new chat. */
const CALL_GRACE_MS = 2 * 60_000
let chatStartedAt = 0

/** Live transcript for the call features: the last N minutes, or undefined if none. */
function recentTranscript(): string | undefined {
  const minutes = getSettings().transcriptMinutes
  const text = formatTranscript(getTranscript(), { sinceMs: minutes * 60_000 })
  return text || undefined
}

export async function askAboutScreen(): Promise<void> {
  showOverlay()
  try {
    const image = await captureScreen()
    await ask({
      text: 'Help me with what’s on my screen',
      prompt: SCREEN_PROMPT,
      label: 'Screenshot',
      image,
      transcript: getState().listening ? recentTranscript() : undefined
    })
  } catch (error) {
    // Explained in the chat, where it stays, not in a toast that vanishes after a few
    // seconds. Never open System Settings on our own: a window popping up mid-call would
    // show on a screen share.
    if (error instanceof ScreenPermissionError || error instanceof ScreenNotAllowedYetError) {
      notice(SCREEN_PERMISSION_HELP)
    } else {
      notice(`**Screenshot failed:** ${(error as Error).message}`)
    }
  }
}

export function sendMessage(text: string): void {
  const question = text.trim()
  if (!question) return
  void ask({ text: question, transcript: callContext() })
}

/** The transcript for a typed question: while listening, or just after the call ended in
 *  the same chat. Otherwise a question about something else would get the call mixed in. */
function callContext(): string | undefined {
  if (getState().listening) return recentTranscript()
  const last = getTranscript().at(-1)
  if (!last || last.at < chatStartedAt || Date.now() - last.at > CALL_GRACE_MS) return undefined
  return recentTranscript()
}

/** New chat: also stops a finished call from being added to the questions that follow. */
export function startNewChat(): void {
  chatStartedAt = Date.now()
  newChat()
}

export function runQuickAction(action: QuickAction): void {
  showOverlay()
  const transcript = recentTranscript()
  if (!transcript) {
    const { hotkeys, platform } = getState()
    const listenKey = formatAccelerator(hotkeys.toggleListening, platform)
    toast(`Start listening first${listenKey ? ` (${listenKey})` : ''}: these buttons use the live conversation.`, 'info')
    showView('transcript')
    return
  }
  const { label, prompt } = QUICK_ACTIONS[action]
  // Quick answers during a call: low effort keeps them fast.
  void ask({ text: label, prompt, label, transcript, effort: 'low' })
}

export function focusChat(): void {
  showView('chat')
  enterTyping()
}

export function openPermissionSettings(kind: 'screen' | 'microphone'): void {
  if (process.platform === 'darwin') {
    const pane = kind === 'screen' ? 'Privacy_ScreenCapture' : 'Privacy_Microphone'
    void shell.openExternal(`x-apple.systempreferences:com.apple.preference.security?${pane}`)
  } else if (process.platform === 'win32') {
    void shell.openExternal(kind === 'screen' ? 'ms-settings:privacy' : 'ms-settings:privacy-microphone')
  }
}
