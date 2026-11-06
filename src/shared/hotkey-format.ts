import type { HotkeyAction, Hotkeys, Platform } from './types'

const MAC_SYMBOLS: Record<string, string> = {
  commandorcontrol: '⌘',
  cmdorctrl: '⌘',
  command: '⌘',
  cmd: '⌘',
  control: '⌃',
  ctrl: '⌃',
  alt: '⌥',
  option: '⌥',
  shift: '⇧',
  enter: '↩',
  return: '↩'
}

const OTHER_NAMES: Record<string, string> = {
  commandorcontrol: 'Ctrl',
  cmdorctrl: 'Ctrl',
  control: 'Ctrl',
  ctrl: 'Ctrl',
  alt: 'Alt',
  option: 'Alt',
  shift: 'Shift',
  return: 'Enter'
}

const ARROWS: Record<string, string> = { up: '↑', down: '↓', left: '←', right: '→' }

/** "CommandOrControl+Shift+Space" -> "⌘⇧Space" on macOS, "Ctrl+Shift+Space" elsewhere. */
export function formatAccelerator(accelerator: string, platform: Platform): string {
  const isMac = platform === 'darwin'
  const parts = accelerator.split('+').map((part) => {
    const key = part.toLowerCase()
    if (ARROWS[key]) return ARROWS[key]
    if (isMac) return MAC_SYMBOLS[key] ?? part
    return OTHER_NAMES[key] ?? part
  })
  return parts.join(isMac ? '' : '+')
}

/** Normalise an accelerator so "CmdOrCtrl+shift+s" and "CommandOrControl+Shift+S" compare equal. */
export function normalizeAccelerator(accelerator: string): string {
  const aliases: Record<string, string> = {
    cmdorctrl: 'commandorcontrol',
    cmd: 'command',
    ctrl: 'control',
    option: 'alt',
    return: 'enter'
  }
  const parts = accelerator
    .split('+')
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean)
    .map((p) => aliases[p] ?? p)
  const key = parts.pop() ?? ''
  return [...parts.sort(), key].join('+')
}

/** Groups of actions that share the same accelerator (each group has 2+ actions). */
export function findDuplicateHotkeys(hotkeys: Hotkeys): HotkeyAction[][] {
  const byAccel = new Map<string, HotkeyAction[]>()
  for (const [action, accel] of Object.entries(hotkeys) as [HotkeyAction, string][]) {
    if (!accel) continue
    const key = normalizeAccelerator(accel)
    byAccel.set(key, [...(byAccel.get(key) ?? []), action])
  }
  return [...byAccel.values()].filter((group) => group.length > 1)
}
