import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from '../src/shared/defaults'
import { parseSettings } from '../src/shared/settings-schema'

describe('parseSettings', () => {
  it('returns defaults for empty or junk input', () => {
    expect(parseSettings({})).toEqual(DEFAULT_SETTINGS)
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS)
    expect(parseSettings('nonsense')).toEqual(DEFAULT_SETTINGS)
  })

  it('keeps valid fields and repairs only the invalid ones', () => {
    const parsed = parseSettings({ model: 'claude-opus-5-5', opacity: 7, transcriptMinutes: 10 })
    expect(parsed.model).toBe('claude-opus-5-5')
    expect(parsed.opacity).toBe(DEFAULT_SETTINGS.opacity)
    expect(parsed.transcriptMinutes).toBe(10)
  })

  it('fills in a missing hotkey without touching the others', () => {
    const parsed = parseSettings({ hotkeys: { toggleOverlay: 'Alt+Space' } })
    expect(parsed.hotkeys.toggleOverlay).toBe('Alt+Space')
    expect(parsed.hotkeys.screenshot).toBe(DEFAULT_SETTINGS.hotkeys.screenshot)
  })

  it('drops bounds that are not a sensible rectangle', () => {
    expect(parseSettings({ overlayBounds: { x: 0, y: 0, width: 10, height: 10 } }).overlayBounds).toBeNull()
    const ok = { x: 100, y: 50, width: 440, height: 560 }
    expect(parseSettings({ overlayBounds: ok }).overlayBounds).toEqual(ok)
  })
})
