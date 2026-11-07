import { globalShortcut } from 'electron'
import { findDuplicateHotkeys } from '../shared/hotkey-format'
import type { HotkeyAction, HotkeyError, Hotkeys, Platform } from '../shared/types'
import { getState, setState } from './state'
import { getSettings, onSettingsChanged } from './store/settings'

// Global hotkeys work even when Sotto isn't focused. Electron registers them through the
// OS hotkey API (Carbon on macOS, RegisterHotKey on Windows), which needs no
// Accessibility permission. A combo already owned by another app fails to register;
// we report that instead of failing silently.

export type HotkeyHandlers = Record<HotkeyAction, () => void>

let handlers: HotkeyHandlers | null = null
/** True while the hotkey editor records a new combo: nothing is registered. */
let suspended = false

/** (Re)register all hotkeys. Returns one error per hotkey that couldn't be registered. */
export function registerHotkeys(hotkeys: Hotkeys, handlers: HotkeyHandlers): HotkeyError[] {
  globalShortcut.unregisterAll()
  const errors: HotkeyError[] = []

  // Two actions on the same combo: only the first one registered would ever fire.
  const duplicates = new Set(findDuplicateHotkeys(hotkeys, process.platform as Platform).flatMap((group) => group.slice(1)))

  for (const [action, accelerator] of Object.entries(hotkeys) as [HotkeyAction, string][]) {
    if (!accelerator) continue // empty = unbound on purpose
    if (duplicates.has(action)) {
      errors.push({ action, accelerator, reason: 'Same shortcut as another action' })
      continue
    }
    try {
      const ok = globalShortcut.register(accelerator, handlers[action])
      if (!ok) errors.push({ action, accelerator, reason: 'Already used by another app' })
    } catch {
      errors.push({ action, accelerator, reason: 'Not a valid shortcut' })
    }
  }
  return errors
}

/** Register the hotkeys from settings, and again whenever they change (no restart needed). */
export function initHotkeys(hotkeyHandlers: HotkeyHandlers): void {
  handlers = hotkeyHandlers
  applyHotkeys()
  onSettingsChanged((next) => {
    // Re-register only when the bindings actually changed (position saves happen often).
    if (JSON.stringify(next.hotkeys) !== JSON.stringify(getState().hotkeys)) applyHotkeys()
  })
}

/** Register the current settings' hotkeys and publish them (and any failures) to the UI. */
export function applyHotkeys(): void {
  const { hotkeys } = getSettings()
  if (suspended || !handlers) {
    // While recording, only show the new bindings; they are registered on resume.
    setState({ hotkeys })
    return
  }
  const hotkeyErrors = registerHotkeys(hotkeys, handlers)
  setState({ hotkeys, hotkeyErrors })
  for (const e of hotkeyErrors) console.warn(`[hotkeys] ${e.action} (${e.accelerator}): ${e.reason}`)
}

/** Unregister everything, so pressing a combo in the editor doesn't trigger Sotto itself. */
export function suspendHotkeys(): void {
  suspended = true
  globalShortcut.unregisterAll()
}

export function resumeHotkeys(): void {
  suspended = false
  applyHotkeys()
}

/**
 * Can this combo be registered right now? Tries it with a no-op and releases it again.
 * A combo Sotto itself already holds counts as available (the caller checks duplicates).
 */
export function canRegister(accelerator: string): boolean {
  try {
    if (globalShortcut.isRegistered(accelerator)) return true
    const ok = globalShortcut.register(accelerator, () => {})
    if (ok) globalShortcut.unregister(accelerator)
    return ok
  } catch {
    return false
  }
}

export function unregisterHotkeys(): void {
  globalShortcut.unregisterAll()
}
