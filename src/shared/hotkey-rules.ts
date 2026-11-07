import { HOTKEY_LABELS } from './defaults'
import { formatAccelerator, normalizeAccelerator } from './hotkey-format'
import type { HotkeyAction, HotkeySlot, Hotkeys, Platform } from './types'

// Rules for the hotkey editor, shared by the page (reading key presses) and the main
// process (validating what the page sends). Pure, so it is unit-tested.

// ---- Slots: what the editor shows ----

/** The editor's rows, in display order. "move" sets all four move keys at once. */
export const HOTKEY_SLOTS: readonly HotkeySlot[] = [
  'toggleOverlay',
  'screenshot',
  'toggleListening',
  'suggestReply',
  'focusChat',
  'toggleClickThrough',
  'move'
]

const MOVE_KEYS: Record<'moveUp' | 'moveDown' | 'moveLeft' | 'moveRight', string> = {
  moveUp: 'Up',
  moveDown: 'Down',
  moveLeft: 'Left',
  moveRight: 'Right'
}
const MOVE_ACTIONS = Object.keys(MOVE_KEYS) as (keyof typeof MOVE_KEYS)[]

export const SLOT_LABELS: Record<HotkeySlot, string> = {
  toggleOverlay: HOTKEY_LABELS.toggleOverlay,
  screenshot: HOTKEY_LABELS.screenshot,
  toggleListening: HOTKEY_LABELS.toggleListening,
  suggestReply: HOTKEY_LABELS.suggestReply,
  focusChat: HOTKEY_LABELS.focusChat,
  toggleClickThrough: HOTKEY_LABELS.toggleClickThrough,
  move: 'Move Sotto'
}

export function isHotkeySlot(value: unknown): value is HotkeySlot {
  return typeof value === 'string' && (HOTKEY_SLOTS as readonly string[]).includes(value)
}

/** The actions a slot sets. */
export function slotActions(slot: HotkeySlot): HotkeyAction[] {
  return slot === 'move' ? MOVE_ACTIONS : [slot]
}

function slotOf(action: HotkeyAction): HotkeySlot {
  return action in MOVE_KEYS ? 'move' : (action as HotkeySlot)
}

// ---- Accelerator syntax (the allowlist the main process enforces) ----

/** Longest accelerator the main process accepts. */
export const MAX_ACCELERATOR_LENGTH = 64

/** Modifiers in the order they are written. On macOS CommandOrControl = ⌘, elsewhere Ctrl. */
const MODIFIERS = ['CommandOrControl', 'Control', 'Alt', 'Shift', 'Super'] as const
type Modifier = (typeof MODIFIERS)[number]

/** KeyboardEvent.code -> accelerator key, for keys that aren't letters, digits or F-keys. */
const NAMED_CODES: Record<string, string> = {
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  Space: 'Space',
  Enter: 'Enter',
  NumpadEnter: 'Enter',
  Tab: 'Tab',
  Backspace: 'Backspace',
  Delete: 'Delete',
  Insert: 'Insert',
  Home: 'Home',
  End: 'End',
  PageUp: 'PageUp',
  PageDown: 'PageDown',
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Semicolon: ';',
  Quote: "'",
  Comma: ',',
  Period: '.',
  Slash: '/',
  Backquote: '`',
  NumpadAdd: 'numadd',
  NumpadSubtract: 'numsub',
  NumpadMultiply: 'nummult',
  NumpadDivide: 'numdiv',
  NumpadDecimal: 'numdec'
}

const F_KEY = /^F([1-9]|1[0-9]|2[0-4])$/

const ALLOWED_KEYS = new Set<string>([
  ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
  ...Array.from({ length: 24 }, (_, i) => `F${i + 1}`),
  ...Array.from({ length: 10 }, (_, i) => `num${i}`),
  ...Object.values(NAMED_CODES)
])

/** Split a well-formed accelerator into modifiers and key, or null if it isn't one we allow. */
export function parseAccelerator(accelerator: string): { modifiers: Modifier[]; key: string } | null {
  if (typeof accelerator !== 'string' || !accelerator || accelerator.length > MAX_ACCELERATOR_LENGTH) return null
  const parts = accelerator.split('+')
  const key = parts.pop() as string
  if (!ALLOWED_KEYS.has(key)) return null
  const modifiers: Modifier[] = []
  for (const part of parts) {
    if (!(MODIFIERS as readonly string[]).includes(part) || modifiers.includes(part as Modifier)) return null
    modifiers.push(part as Modifier)
  }
  return { modifiers, key }
}

// ---- Reading a key press in the page ----

/** The fields of a KeyboardEvent the recorder needs (so this stays testable without a DOM). */
export interface KeyPress {
  code: string
  metaKey: boolean
  ctrlKey: boolean
  altKey: boolean
  shiftKey: boolean
}

export type KeyReading =
  /** Esc: stop recording, keep the old shortcut. */
  | { kind: 'cancel' }
  /** Backspace/Delete on its own: set the shortcut to "not set". */
  | { kind: 'clear' }
  /** Only modifiers held so far; `modifiers` is an accelerator prefix like "CommandOrControl+Shift". */
  | { kind: 'modifiers'; modifiers: string }
  | { kind: 'invalid'; error: string }
  | { kind: 'combo'; accelerator: string }

const MODIFIER_CODES = /^(Meta|OS|Control|Alt|Shift)(Left|Right)?$|^(CapsLock|Fn|FnLock|NumLock|ScrollLock)$/

function keyFromCode(code: string): string | null {
  const letter = /^Key([A-Z])$/.exec(code)
  if (letter) return letter[1]
  const digit = /^Digit([0-9])$/.exec(code)
  if (digit) return digit[1]
  if (F_KEY.test(code)) return code
  const numpad = /^Numpad([0-9])$/.exec(code)
  if (numpad) return `num${numpad[1]}`
  return NAMED_CODES[code] ?? null
}

/**
 * Turn a keydown into an accelerator. Uses the physical key (`code`), because with ⌥ held
 * macOS changes the typed character (⌥S types "ß"). Modifiers map as Electron expects:
 * macOS ⌘ -> CommandOrControl, ⌃ -> Control; elsewhere Ctrl -> CommandOrControl, Win -> Super.
 */
export function readKeyPress(event: KeyPress, platform: Platform): KeyReading {
  const isMac = platform === 'darwin'
  const held: Record<Modifier, boolean> = {
    CommandOrControl: isMac ? event.metaKey : event.ctrlKey,
    Control: isMac && event.ctrlKey,
    Alt: event.altKey,
    Shift: event.shiftKey,
    Super: !isMac && event.metaKey
  }
  const modifiers = MODIFIERS.filter((m) => held[m])

  if (event.code === 'Escape') return { kind: 'cancel' }
  if ((event.code === 'Backspace' || event.code === 'Delete') && modifiers.length === 0) return { kind: 'clear' }
  if (MODIFIER_CODES.test(event.code)) return { kind: 'modifiers', modifiers: modifiers.join('+') }

  const key = keyFromCode(event.code)
  if (!key) return { kind: 'invalid', error: 'That key can’t be used in a shortcut. Try a letter, number or F-key.' }
  return { kind: 'combo', accelerator: [...modifiers, key].join('+') }
}

// ---- Validation ----

/** Combos the system or every app relies on. Blocked outright: taking them globally breaks them everywhere. */
const SYSTEM_COMBOS: Record<'mac' | 'other', [string, string][]> = {
  mac: [
    ['Command+Q', 'quit an app'],
    ['Command+W', 'close a window'],
    ['Command+H', 'hide an app'],
    ['Command+M', 'minimise'],
    ['Command+Tab', 'switch apps'],
    ['Command+Shift+Tab', 'switch apps'],
    ['Command+`', 'switch windows'],
    ['Command+Space', 'Spotlight'],
    ['Control+Space', 'switch input source'],
    ['Control+Alt+Space', 'switch input source'],
    ['Control+Command+Space', 'emoji and symbols'],
    ['Control+Command+Q', 'lock screen'],
    ['Control+Command+F', 'full screen'],
    ['Command+Alt+D', 'show or hide the Dock'],
    ['Command+Shift+3', 'screenshot'],
    ['Command+Shift+4', 'screenshot'],
    ['Command+Shift+5', 'screenshot'],
    ['Control+Up', 'Mission Control'],
    ['Control+Down', 'app windows'],
    ['Control+Left', 'switch spaces'],
    ['Control+Right', 'switch spaces'],
    ['Command+C', 'copy'],
    ['Command+V', 'paste'],
    ['Command+X', 'cut'],
    ['Command+Z', 'undo'],
    ['Command+Shift+Z', 'redo'],
    ['Command+A', 'select all'],
    ['Command+S', 'save'],
    ['Command+F', 'find'],
    ['Command+N', 'new'],
    ['Command+T', 'new tab'],
    ['Command+O', 'open'],
    ['Command+P', 'print'],
    ['Command+,', 'settings']
  ],
  other: [
    ['Alt+Tab', 'switch apps'],
    ['Alt+Shift+Tab', 'switch apps'],
    ['Alt+F4', 'close an app'],
    ['Alt+Space', 'the window menu'],
    ['Control+Shift+Escape', 'Task Manager'],
    ['Control+C', 'copy'],
    ['Control+V', 'paste'],
    ['Control+X', 'cut'],
    ['Control+Z', 'undo'],
    ['Control+Y', 'redo'],
    ['Control+A', 'select all'],
    ['Control+S', 'save'],
    ['Control+F', 'find'],
    ['Control+N', 'new'],
    ['Control+T', 'new tab'],
    ['Control+O', 'open'],
    ['Control+P', 'print'],
    ['Control+W', 'close a tab or window']
  ]
}

/** What a system combo does, or null if it isn't one. */
export function systemComboUse(accelerator: string, platform: Platform): string | null {
  const target = normalizeAccelerator(accelerator, platform)
  const list = SYSTEM_COMBOS[platform === 'darwin' ? 'mac' : 'other']
  const hit = list.find(([combo]) => normalizeAccelerator(combo, platform) === target)
  return hit ? hit[1] : null
}

export type HotkeyValidation = { ok: true; hotkeys: Hotkeys } | { ok: false; error: string }

/**
 * Check a new shortcut for a slot against the rules and the other hotkeys. On success,
 * returns the full hotkey map with the change applied ("" clears the slot).
 * Rules: a known key; at least one of ⌘/⌃/⌥ (Ctrl/Alt), except bare F-keys; no system
 * combos; no Windows-key combos off macOS; not already used by another Sotto action.
 * "move" takes modifiers plus any arrow and sets all four arrows.
 */
export function validateHotkey(slot: HotkeySlot, accelerator: string, hotkeys: Hotkeys, platform: Platform): HotkeyValidation {
  const actions = slotActions(slot)
  const next: Hotkeys = { ...hotkeys }

  if (accelerator === '') {
    for (const action of actions) next[action] = ''
    return { ok: true, hotkeys: next }
  }

  const parsed = parseAccelerator(accelerator)
  if (!parsed) return { ok: false, error: 'That isn’t a shortcut Sotto can use.' }
  const { modifiers, key } = parsed
  const isMac = platform === 'darwin'
  const show = (accel: string): string => formatAccelerator(accel, platform)

  if (slot === 'move') {
    if (!['Up', 'Down', 'Left', 'Right'].includes(key)) return { ok: false, error: 'Hold the modifiers you want and press an arrow key.' }
    for (const action of MOVE_ACTIONS) next[action] = [...modifiers, MOVE_KEYS[action]].join('+')
  } else {
    next[slot] = accelerator
  }

  const strongModifiers = modifiers.filter((m) => m !== 'Shift')
  if (strongModifiers.length === 0 && !(F_KEY.test(key) && slot !== 'move')) {
    return {
      ok: false,
      error: `Add ${isMac ? '⌘, ⌃ or ⌥' : 'Ctrl or Alt'}, so the shortcut doesn’t get in the way of typing.`
    }
  }
  if (!isMac && modifiers.includes('Super')) {
    return { ok: false, error: 'Shortcuts with the Windows key belong to the system. Pick another.' }
  }

  for (const action of actions) {
    const accel = next[action]
    const use = systemComboUse(accel, platform)
    if (use) return { ok: false, error: `${show(accel)} is a system shortcut (${use}). Pick another.` }

    const target = normalizeAccelerator(accel, platform)
    const clash = (Object.keys(hotkeys) as HotkeyAction[]).find(
      (other) => !actions.includes(other) && hotkeys[other] && normalizeAccelerator(hotkeys[other], platform) === target
    )
    if (clash) return { ok: false, error: `${show(accel)} is already used for “${SLOT_LABELS[slotOf(clash)]}”.` }
  }

  return { ok: true, hotkeys: next }
}
