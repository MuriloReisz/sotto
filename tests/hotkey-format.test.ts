import { describe, expect, it } from 'vitest'
import { DEFAULT_HOTKEYS } from '../src/shared/defaults'
import { findDuplicateHotkeys, formatAccelerator, normalizeAccelerator } from '../src/shared/hotkey-format'

describe('formatAccelerator', () => {
  it('uses symbols on macOS', () => {
    expect(formatAccelerator('CommandOrControl+Shift+Space', 'darwin')).toBe('⌘⇧Space')
    expect(formatAccelerator('Control+Alt+Up', 'darwin')).toBe('⌃⌥↑')
    expect(formatAccelerator('CommandOrControl+Shift+Enter', 'darwin')).toBe('⌘⇧↩')
  })

  it('uses words on Windows', () => {
    expect(formatAccelerator('CommandOrControl+Shift+S', 'win32')).toBe('Ctrl+Shift+S')
    expect(formatAccelerator('Control+Alt+Left', 'win32')).toBe('Ctrl+Alt+←')
  })
})

describe('normalizeAccelerator', () => {
  it('treats aliases, case and modifier order as equal', () => {
    expect(normalizeAccelerator('CmdOrCtrl+shift+S')).toBe(normalizeAccelerator('Shift+CommandOrControl+s'))
    expect(normalizeAccelerator('Ctrl+Option+Up')).toBe(normalizeAccelerator('Control+Alt+Up'))
  })
})

describe('findDuplicateHotkeys', () => {
  it('finds no duplicates in the defaults', () => {
    expect(findDuplicateHotkeys(DEFAULT_HOTKEYS)).toEqual([])
  })

  it('groups actions bound to the same combo', () => {
    const hotkeys = { ...DEFAULT_HOTKEYS, screenshot: 'CmdOrCtrl+Shift+Space' }
    expect(findDuplicateHotkeys(hotkeys)).toEqual([['toggleOverlay', 'screenshot']])
  })

  it('ignores unbound (empty) actions', () => {
    const hotkeys = { ...DEFAULT_HOTKEYS, moveUp: '', moveDown: '' }
    expect(findDuplicateHotkeys(hotkeys)).toEqual([])
  })
})
