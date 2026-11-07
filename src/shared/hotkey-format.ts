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

/**
 * "CommandOrControl+Shift+Space" -> "⌘⇧Space" on macOS, "Ctrl+Shift+Space" elsewhere.
 * An unset hotkey ("") formats as "", so callers can leave the keycap out.
 */
export function formatAccelerator(accelerator: string, platform: Platform): string {
  if (!accelerator) return ''
  const isMac = platform === 'darwin'
  const parts = accelerator.split('+').map((part) => {
    const key = part.toLowerCase()
    if (ARROWS[key]) return ARROWS[key]
    if (isMac) return MAC_SYMBOLS[key] ?? part
    return OTHER_NAMES[key] ?? part
  })
  return parts.join(isMac ? '' : '+')
}

/**
 * Normalise an accelerator so "CmdOrCtrl+shift+s" and "CommandOrControl+Shift+S" compare equal.
 * With a platform, keys that are the same physical combo there also compare equal:
 * on macOS CommandOrControl = Command = Super, elsewhere CommandOrControl = Control.
 */
export function normalizeAccelerator(accelerator: string, platform?: Platform): string {
  const aliases: Record<string, string> = {
    cmdorctrl: 'commandorcontrol',
    cmd: 'command',
    ctrl: 'control',
    option: 'alt',
    return: 'enter',
    esc: 'escape'
  }
  const platformAliases: Record<string, string> =
    platform === undefined
      ? {}
      : platform === 'darwin'
        ? { commandorcontrol: 'command', super: 'command', meta: 'command' }
        : { commandorcontrol: 'control', meta: 'super' }
  const parts = accelerator
    .split('+')
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean)
    .map((p) => aliases[p] ?? p)
    .map((p) => platformAliases[p] ?? p)
  const key = parts.pop() ?? ''
  return [...new Set(parts)].sort().concat(key).join('+')
}

/** Groups of actions that share the same accelerator (each group has 2+ actions). */
export function findDuplicateHotkeys(hotkeys: Hotkeys, platform?: Platform): HotkeyAction[][] {
  const byAccel = new Map<string, HotkeyAction[]>()
  for (const [action, accel] of Object.entries(hotkeys) as [HotkeyAction, string][]) {
    if (!accel) continue
    const key = normalizeAccelerator(accel, platform)
    byAccel.set(key, [...(byAccel.get(key) ?? []), action])
  }
  return [...byAccel.values()].filter((group) => group.length > 1)
}

/** The modifier part of an accelerator: "Control+Alt+Up" -> "Control+Alt". */
export function acceleratorModifiers(accelerator: string): string {
  return accelerator.split('+').slice(0, -1).join('+')
}

/**
 * The four move keys shown as one shortcut: "⌃⌥ + arrows" (macOS), "Ctrl+Alt + arrows".
 * Read from "move up"; the editor always sets all four with the same modifiers. "" = not set.
 */
export function formatMoveHotkeys(hotkeys: Hotkeys, platform: Platform): string {
  if (!hotkeys.moveUp) return ''
  const modifiers = formatAccelerator(acceleratorModifiers(hotkeys.moveUp), platform)
  return modifiers ? `${modifiers} + arrows` : 'Arrows'
}
