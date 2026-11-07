import { describe, expect, it } from 'vitest'
import { DEFAULT_HOTKEYS } from '../src/shared/defaults'
import { formatMoveHotkeys } from '../src/shared/hotkey-format'
import {
  HOTKEY_SLOTS,
  isHotkeySlot,
  parseAccelerator,
  readKeyPress,
  slotActions,
  systemComboUse,
  validateHotkey,
  type KeyPress
} from '../src/shared/hotkey-rules'

const press = (code: string, mods: Partial<Omit<KeyPress, 'code'>> = {}): KeyPress => ({
  code,
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  ...mods
})

describe('readKeyPress', () => {
  it('maps ⌘ to CommandOrControl and ⌃ to Control on macOS', () => {
    expect(readKeyPress(press('KeyS', { metaKey: true, shiftKey: true }), 'darwin')).toEqual({
      kind: 'combo',
      accelerator: 'CommandOrControl+Shift+S'
    })
    expect(readKeyPress(press('ArrowUp', { ctrlKey: true, altKey: true }), 'darwin')).toEqual({
      kind: 'combo',
      accelerator: 'Control+Alt+Up'
    })
  })

  it('maps Ctrl to CommandOrControl and the Windows key to Super elsewhere', () => {
    expect(readKeyPress(press('KeyK', { ctrlKey: true, shiftKey: true }), 'win32')).toEqual({
      kind: 'combo',
      accelerator: 'CommandOrControl+Shift+K'
    })
    expect(readKeyPress(press('KeyL', { metaKey: true }), 'win32')).toEqual({ kind: 'combo', accelerator: 'Super+L' })
  })

  it('uses the physical key, so ⌥ doesn’t turn S into ß', () => {
    expect(readKeyPress(press('KeyS', { altKey: true, metaKey: true }), 'darwin')).toEqual({
      kind: 'combo',
      accelerator: 'CommandOrControl+Alt+S'
    })
  })

  it('reads digits, F-keys, punctuation and the numpad', () => {
    const accel = (code: string): string | undefined => {
      const r = readKeyPress(press(code, { metaKey: true }), 'darwin')
      return r.kind === 'combo' ? r.accelerator : undefined
    }
    expect(accel('Digit1')).toBe('CommandOrControl+1')
    expect(accel('F12')).toBe('CommandOrControl+F12')
    expect(accel('Space')).toBe('CommandOrControl+Space')
    expect(accel('NumpadEnter')).toBe('CommandOrControl+Enter')
    expect(accel('Slash')).toBe('CommandOrControl+/')
    expect(accel('Numpad5')).toBe('CommandOrControl+num5')
  })

  it('waits while only modifiers are held', () => {
    expect(readKeyPress(press('ShiftLeft', { shiftKey: true, metaKey: true }), 'darwin')).toEqual({
      kind: 'modifiers',
      modifiers: 'CommandOrControl+Shift'
    })
    expect(readKeyPress(press('MetaLeft', { metaKey: true }), 'darwin')).toEqual({ kind: 'modifiers', modifiers: 'CommandOrControl' })
  })

  it('cancels on Esc and clears on Backspace/Delete alone', () => {
    expect(readKeyPress(press('Escape'), 'darwin')).toEqual({ kind: 'cancel' })
    expect(readKeyPress(press('Escape', { metaKey: true }), 'darwin')).toEqual({ kind: 'cancel' })
    expect(readKeyPress(press('Backspace'), 'darwin')).toEqual({ kind: 'clear' })
    expect(readKeyPress(press('Delete'), 'win32')).toEqual({ kind: 'clear' })
    // With a modifier, Backspace is just a key.
    expect(readKeyPress(press('Backspace', { metaKey: true }), 'darwin')).toEqual({
      kind: 'combo',
      accelerator: 'CommandOrControl+Backspace'
    })
  })

  it('rejects keys an accelerator can’t express', () => {
    expect(readKeyPress(press('IntlBackslash', { metaKey: true }), 'darwin').kind).toBe('invalid')
    expect(readKeyPress(press('MediaPlayPause'), 'darwin').kind).toBe('invalid')
  })
})

describe('parseAccelerator', () => {
  it('accepts every default', () => {
    for (const accel of Object.values(DEFAULT_HOTKEYS)) expect(parseAccelerator(accel)).not.toBeNull()
  })

  it('rejects unknown modifiers or keys, repeats, junk and over-long input', () => {
    expect(parseAccelerator('Hyper+S')).toBeNull()
    expect(parseAccelerator('CommandOrControl+Banana')).toBeNull()
    expect(parseAccelerator('Shift+Shift+S')).toBeNull()
    expect(parseAccelerator('CommandOrControl+')).toBeNull()
    expect(parseAccelerator('')).toBeNull()
    expect(parseAccelerator('Shift+'.repeat(20) + 'S')).toBeNull()
    expect(parseAccelerator('CommandOrControl+S; rm -rf /')).toBeNull()
  })
})

describe('validateHotkey', () => {
  it('accepts a free combo and returns the updated map', () => {
    const r = validateHotkey('screenshot', 'CommandOrControl+Alt+S', DEFAULT_HOTKEYS, 'darwin')
    expect(r).toEqual({ ok: true, hotkeys: { ...DEFAULT_HOTKEYS, screenshot: 'CommandOrControl+Alt+S' } })
  })

  it('clears a slot with ""', () => {
    const r = validateHotkey('focusChat', '', DEFAULT_HOTKEYS, 'darwin')
    expect(r.ok && r.hotkeys.focusChat).toBe('')
  })

  it('needs a modifier other than Shift, except for bare F-keys', () => {
    const shiftOnly = validateHotkey('screenshot', 'Shift+S', DEFAULT_HOTKEYS, 'darwin')
    expect(shiftOnly).toEqual({ ok: false, error: expect.stringContaining('Add ⌘, ⌃ or ⌥') })
    expect(validateHotkey('screenshot', 'S', DEFAULT_HOTKEYS, 'win32')).toEqual({ ok: false, error: expect.stringContaining('Add Ctrl or Alt') })
    expect(validateHotkey('screenshot', 'F8', DEFAULT_HOTKEYS, 'darwin').ok).toBe(true)
    expect(validateHotkey('screenshot', 'Shift+F8', DEFAULT_HOTKEYS, 'darwin').ok).toBe(true)
  })

  it('names the action that already uses the combo', () => {
    const r = validateHotkey('screenshot', 'CommandOrControl+Shift+K', DEFAULT_HOTKEYS, 'darwin')
    expect(r).toEqual({ ok: false, error: '⌘⇧K is already used for “Type a question”.' })
  })

  it('treats aliases and Ctrl = CommandOrControl (Windows) as the same combo', () => {
    const hotkeys = { ...DEFAULT_HOTKEYS, focusChat: 'Ctrl+Shift+J' }
    const win = validateHotkey('screenshot', 'CommandOrControl+Shift+J', hotkeys, 'win32')
    expect(win).toEqual({ ok: false, error: 'Ctrl+Shift+J is already used for “Type a question”.' })
    // On macOS ⌘ and ⌃ are different keys.
    expect(validateHotkey('screenshot', 'CommandOrControl+Shift+J', hotkeys, 'darwin').ok).toBe(true)
  })

  it('lets a slot keep its own combo', () => {
    expect(validateHotkey('screenshot', DEFAULT_HOTKEYS.screenshot, DEFAULT_HOTKEYS, 'darwin').ok).toBe(true)
  })

  it('blocks system combos', () => {
    expect(validateHotkey('screenshot', 'CommandOrControl+Q', DEFAULT_HOTKEYS, 'darwin')).toEqual({
      ok: false,
      error: '⌘Q is a system shortcut (quit an app). Pick another.'
    })
    expect(validateHotkey('screenshot', 'CommandOrControl+Space', DEFAULT_HOTKEYS, 'darwin').ok).toBe(false)
    expect(validateHotkey('screenshot', 'CommandOrControl+Tab', DEFAULT_HOTKEYS, 'darwin').ok).toBe(false)
    expect(validateHotkey('screenshot', 'CommandOrControl+W', DEFAULT_HOTKEYS, 'win32').ok).toBe(false)
    expect(validateHotkey('screenshot', 'Alt+Tab', DEFAULT_HOTKEYS, 'win32').ok).toBe(false)
    // ⌃Q is not ⌘Q on macOS.
    expect(validateHotkey('screenshot', 'Control+Q', DEFAULT_HOTKEYS, 'darwin').ok).toBe(true)
  })

  it('blocks Windows-key combos off macOS', () => {
    expect(validateHotkey('screenshot', 'Super+J', DEFAULT_HOTKEYS, 'win32').ok).toBe(false)
  })

  it('rejects malformed accelerators', () => {
    expect(validateHotkey('screenshot', 'Cmd+Shift+S', DEFAULT_HOTKEYS, 'darwin').ok).toBe(false)
    expect(validateHotkey('screenshot', 'nonsense', DEFAULT_HOTKEYS, 'darwin').ok).toBe(false)
  })

  describe('move', () => {
    it('sets all four arrows from one combo', () => {
      const r = validateHotkey('move', 'CommandOrControl+Alt+Left', DEFAULT_HOTKEYS, 'darwin')
      expect(r.ok && [r.hotkeys.moveUp, r.hotkeys.moveDown, r.hotkeys.moveLeft, r.hotkeys.moveRight]).toEqual([
        'CommandOrControl+Alt+Up',
        'CommandOrControl+Alt+Down',
        'CommandOrControl+Alt+Left',
        'CommandOrControl+Alt+Right'
      ])
    })

    it('needs an arrow and a modifier', () => {
      expect(validateHotkey('move', 'Control+Alt+M', DEFAULT_HOTKEYS, 'darwin')).toEqual({
        ok: false,
        error: 'Hold the modifiers you want and press an arrow key.'
      })
      expect(validateHotkey('move', 'Shift+Up', DEFAULT_HOTKEYS, 'darwin').ok).toBe(false)
    })

    it('blocks ⌃ + arrows on macOS (Mission Control and Spaces)', () => {
      expect(validateHotkey('move', 'Control+Up', DEFAULT_HOTKEYS, 'darwin')).toEqual({
        ok: false,
        error: '⌃↑ is a system shortcut (Mission Control). Pick another.'
      })
    })

    it('checks each arrow against the other actions', () => {
      const hotkeys = { ...DEFAULT_HOTKEYS, screenshot: 'CommandOrControl+Shift+Down' }
      expect(validateHotkey('move', 'CommandOrControl+Shift+Up', hotkeys, 'darwin')).toEqual({
        ok: false,
        error: '⌘⇧↓ is already used for “Ask about your screen”.'
      })
    })

    it('names "Move Sotto" when another slot clashes with an arrow', () => {
      expect(validateHotkey('screenshot', 'Control+Alt+Left', DEFAULT_HOTKEYS, 'darwin')).toEqual({
        ok: false,
        error: '⌃⌥← is already used for “Move Sotto”.'
      })
    })

    it('clears all four', () => {
      const r = validateHotkey('move', '', DEFAULT_HOTKEYS, 'darwin')
      expect(r.ok && formatMoveHotkeys(r.hotkeys, 'darwin')).toBe('')
    })
  })
})

describe('slots', () => {
  it('cover every action exactly once', () => {
    const actions = HOTKEY_SLOTS.flatMap(slotActions).sort()
    expect(actions).toEqual(Object.keys(DEFAULT_HOTKEYS).sort())
  })

  it('only accept known slot names', () => {
    expect(isHotkeySlot('move')).toBe(true)
    expect(isHotkeySlot('moveUp')).toBe(false)
    expect(isHotkeySlot('__proto__')).toBe(false)
    expect(isHotkeySlot(42)).toBe(false)
  })
})

describe('systemComboUse', () => {
  it('matches regardless of alias or modifier order', () => {
    expect(systemComboUse('Shift+CommandOrControl+3', 'darwin')).toBe('screenshot')
    expect(systemComboUse('CommandOrControl+Shift+S', 'darwin')).toBeNull()
  })
})
