import { globalShortcut } from 'electron'
import { findDuplicateHotkeys } from '../shared/hotkey-format'
import type { HotkeyAction, HotkeyError, Hotkeys } from '../shared/types'

// Global hotkeys work even when Veil isn't focused. Electron registers them through the
// OS hotkey API (Carbon on macOS, RegisterHotKey on Windows), which needs no
// Accessibility permission. A combo already owned by another app fails to register;
// we report that instead of failing silently.

export type HotkeyHandlers = Record<HotkeyAction, () => void>

/** (Re)register all hotkeys. Returns one error per hotkey that couldn't be registered. */
export function registerHotkeys(hotkeys: Hotkeys, handlers: HotkeyHandlers): HotkeyError[] {
  globalShortcut.unregisterAll()
  const errors: HotkeyError[] = []

  // Two actions on the same combo: only the first one registered would ever fire.
  const duplicates = new Set(findDuplicateHotkeys(hotkeys).flatMap((group) => group.slice(1)))

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

export function unregisterHotkeys(): void {
  globalShortcut.unregisterAll()
}
