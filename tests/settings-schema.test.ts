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

  it('rejects an unknown model id', () => {
    expect(parseSettings({ model: 'gpt-9' }).model).toBe('claude-sonnet-5-5')
  })

  it('fills in a missing hotkey without touching the others', () => {
    const parsed = parseSettings({ hotkeys: { toggleOverlay: 'Alt+Space' } })
    expect(parsed.hotkeys.toggleOverlay).toBe('Alt+Space')
    expect(parsed.hotkeys.focusChat).toBe(DEFAULT_SETTINGS.hotkeys.focusChat)
  })

  it('migrates M1 settings files (old fields are ignored)', () => {
    const parsed = parseSettings({ overlayBounds: { x: 1, y: 2, width: 440, height: 560 }, systemPrompt: 'x' })
    expect(parsed.overlayPosition).toBeNull()
    expect(parsed.customInstructions).toBe('')
  })
})

describe('long text fields', () => {
  it('shortens over-long text instead of wiping it', () => {
    const long = 'x'.repeat(25_000)
    const parsed = parseSettings({ aboutMe: long })
    expect(parsed.aboutMe.length).toBe(20_000)
  })
})
