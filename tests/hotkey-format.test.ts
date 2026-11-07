import { describe, expect, it } from 'vitest'
import { DEFAULT_HOTKEYS } from '../src/shared/defaults'
import { findDuplicateHotkeys, formatAccelerator, formatMoveHotkeys, normalizeAccelerator } from '../src/shared/hotkey-format'

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

describe('unset hotkeys and platforms', () => {
  it('formats an unset hotkey as empty', () => {
    expect(formatAccelerator('', 'darwin')).toBe('')
    expect(formatAccelerator('', 'win32')).toBe('')
  })

  it('formats the move keys as modifiers + arrows', () => {
    expect(formatMoveHotkeys(DEFAULT_HOTKEYS, 'darwin')).toBe('⌃⌥ + arrows')
    expect(formatMoveHotkeys(DEFAULT_HOTKEYS, 'win32')).toBe('Ctrl+Alt + arrows')
    expect(formatMoveHotkeys({ ...DEFAULT_HOTKEYS, moveUp: '' }, 'darwin')).toBe('')
  })

  it('treats CommandOrControl as Ctrl off macOS and as ⌘ on macOS', () => {
    expect(normalizeAccelerator('CommandOrControl+S', 'win32')).toBe(normalizeAccelerator('Control+S', 'win32'))
    expect(normalizeAccelerator('CommandOrControl+S', 'darwin')).not.toBe(normalizeAccelerator('Control+S', 'darwin'))
    expect(normalizeAccelerator('CommandOrControl+S', 'darwin')).toBe(normalizeAccelerator('Command+S', 'darwin'))
  })

  it('finds platform-specific duplicates', () => {
    const hotkeys = { ...DEFAULT_HOTKEYS, screenshot: 'Control+Shift+Space' }
    expect(findDuplicateHotkeys(hotkeys, 'win32')).toEqual([['toggleOverlay', 'screenshot']])
    expect(findDuplicateHotkeys(hotkeys, 'darwin')).toEqual([])
  })
})
