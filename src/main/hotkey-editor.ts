import { Menu } from 'electron'
import { DEFAULT_HOTKEYS } from '../shared/defaults'
import { IPC } from '../shared/ipc'
import { MAX_ACCELERATOR_LENGTH, isHotkeySlot, slotActions, validateHotkey } from '../shared/hotkey-rules'
import type { HotkeyResult, Platform } from '../shared/types'
import { canRegister, resumeHotkeys, suspendHotkeys } from './hotkeys'
import { installAppMenu } from './menu'
import { publishSettings } from './settings-view'
import { getState, onStateChanged, sendToUi } from './state'
import { getSettings, updateSettings } from './store/settings'
import { enterTyping, exitTyping } from './windows/overlay'

// The Settings hotkey editor. While you record a new combo:
//  - Sotto's own global hotkeys are unregistered, so pressing one doesn't fire it;
//  - the app menu is removed, so ⌘Q / Ctrl+C reach the page instead of quitting or copying;
//  - the overlay takes keyboard focus (typing mode), handed back afterwards.
// Recording always ends by restoring all three: on save, Esc, the page closing the panel,
// the overlay losing focus or hiding, or after a timeout if nothing else ends it.
// Whenever main ends it (not the page), the page is told, so it stops recording too.

/** Ends a recording nobody finished (e.g. the page went away without saying so). */
const RECORDING_TIMEOUT_MS = 30_000

let recording = false
/** Set once typing mode is on; from then on, typing mode ending ends the recording. */
let armed = false
/** We turned typing mode on, so we turn it off (and give focus back) at the end. */
let tookFocus = false
let timer: NodeJS.Timeout | null = null
let watching = false

const platform = (): Platform => process.platform as Platform

function armTimer(): void {
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => stopHotkeyRecording(), RECORDING_TIMEOUT_MS)
}

export function startHotkeyRecording(): void {
  if (recording) return
  if (!watching) {
    watching = true
    // Typing mode ends on blur, hide, click-through or Esc: recording ends with it.
    onStateChanged((state) => {
      if (armed && !state.typing) stopHotkeyRecording()
    })
  }
  recording = true
  try {
    suspendHotkeys()
    Menu.setApplicationMenu(null)
    tookFocus = !getState().typing
    enterTyping() // its own state changes (show, click-through off) come before `armed`
    armTimer()
    armed = getState().typing
    if (!armed) stopHotkeyRecording() // no window to focus
  } catch (error) {
    console.error('[hotkeys] could not start recording:', error)
    stopHotkeyRecording()
  }
}

/** `byPage`: the page asked, so its side has already ended. Every other path tells the
 *  page (hotkeys:record-ended): otherwise, e.g. after the timeout while you were already
 *  typing, it would keep showing "Press keys…" with Sotto's hotkeys back on. */
export function stopHotkeyRecording(byPage = false): void {
  if (!recording) return
  recording = false
  armed = false
  if (timer) clearTimeout(timer)
  timer = null
  try {
    installAppMenu()
  } finally {
    resumeHotkeys()
    if (tookFocus) exitTyping({ giveFocusBack: true })
    tookFocus = false
    if (!byPage) sendToUi(IPC.hotkeyRecordEnded)
  }
}

/**
 * Change one slot's shortcut ("" = not set). Everything from the page is checked here
 * again: the slot name, the accelerator's syntax (allowlisted modifiers and keys, length
 * limit), Sotto's rules and duplicates. Then the new combo is test-registered, so a combo
 * another app owns is refused and the old one stays.
 */
export function setHotkey(slot: unknown, accelerator: unknown): HotkeyResult {
  if (!isHotkeySlot(slot) || typeof accelerator !== 'string' || accelerator.length > MAX_ACCELERATOR_LENGTH) {
    return { ok: false, error: 'That isn’t a shortcut Sotto can use.' }
  }
  if (recording) armTimer()

  const current = getSettings().hotkeys
  const result = validateHotkey(slot, accelerator, current, platform())
  if (!result.ok) return { ok: false, error: result.error }

  for (const action of slotActions(slot)) {
    const next = result.hotkeys[action]
    if (next && next !== current[action] && !canRegister(next)) {
      return { ok: false, error: 'That shortcut is taken by another app.' }
    }
  }

  updateSettings({ hotkeys: result.hotkeys }) // re-registers via initHotkeys' listener
  publishSettings()
  return { ok: true }
}

/** Back to the default shortcuts. Ones another app owns show as errors on their rows. */
export function resetHotkeys(): HotkeyResult {
  if (recording) return { ok: false, error: 'Finish changing the shortcut first.' }
  updateSettings({ hotkeys: { ...DEFAULT_HOTKEYS } })
  publishSettings()
  return { ok: true }
}
