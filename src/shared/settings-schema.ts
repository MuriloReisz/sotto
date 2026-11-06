import { z } from 'zod'
import { DEFAULT_HOTKEYS, DEFAULT_SETTINGS } from './defaults'
import type { HotkeyAction, Settings } from './types'

// Validation for settings.json. Every field falls back to its default on its own
// (`.catch`), so one bad or missing value never wipes the rest of the user's settings.

const hotkeyField = (action: HotkeyAction) => z.string().catch(DEFAULT_HOTKEYS[action])

const hotkeysSchema = z
  .object({
    toggleOverlay: hotkeyField('toggleOverlay'),
    screenshot: hotkeyField('screenshot'),
    toggleListening: hotkeyField('toggleListening'),
    toggleClickThrough: hotkeyField('toggleClickThrough'),
    suggestReply: hotkeyField('suggestReply'),
    moveUp: hotkeyField('moveUp'),
    moveDown: hotkeyField('moveDown'),
    moveLeft: hotkeyField('moveLeft'),
    moveRight: hotkeyField('moveRight')
  })
  .catch(DEFAULT_HOTKEYS)

const boundsSchema = z.object({
  x: z.number().int(),
  y: z.number().int(),
  width: z.number().int().min(200),
  height: z.number().int().min(120)
})

export const settingsSchema = z.object({
  hotkeys: hotkeysSchema,
  model: z.string().min(1).catch(DEFAULT_SETTINGS.model),
  systemPrompt: z.string().catch(DEFAULT_SETTINGS.systemPrompt),
  opacity: z.number().min(0.3).max(1).catch(DEFAULT_SETTINGS.opacity),
  transcriptMinutes: z.number().int().min(1).max(60).catch(DEFAULT_SETTINGS.transcriptMinutes),
  overlayBounds: boundsSchema.nullable().catch(null)
})

/** Turn anything (parsed JSON, a partial object, garbage) into valid Settings. */
export function parseSettings(raw: unknown): Settings {
  const input = typeof raw === 'object' && raw !== null ? raw : {}
  return settingsSchema.parse(input)
}
