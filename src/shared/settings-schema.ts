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
    focusChat: hotkeyField('focusChat'),
    toggleClickThrough: hotkeyField('toggleClickThrough'),
    suggestReply: hotkeyField('suggestReply'),
    moveUp: hotkeyField('moveUp'),
    moveDown: hotkeyField('moveDown'),
    moveLeft: hotkeyField('moveLeft'),
    moveRight: hotkeyField('moveRight')
  })
  .catch(DEFAULT_HOTKEYS)

/** Longest "About you" / "Custom instructions" text, in characters. */
export const MAX_TEXT = 20_000

const positionSchema =z.object({ x: z.number().int(), y: z.number().int() })

export const settingsSchema = z.object({
  hotkeys: hotkeysSchema,
  model: z.enum(['claude-sonnet-5-5', 'claude-opus-5-5', 'claude-haiku-5-5']).catch(DEFAULT_SETTINGS.model),
  // Over-long text is shortened, never thrown away (the UI also caps input at this length).
  customInstructions: z.string().transform((s) => s.slice(0, MAX_TEXT)).catch(DEFAULT_SETTINGS.customInstructions),
  aboutMe: z.string().transform((s) => s.slice(0, MAX_TEXT)).catch(DEFAULT_SETTINGS.aboutMe),
  opacity: z.number().min(0.5).max(1).catch(DEFAULT_SETTINGS.opacity),
  transcriptMinutes: z.number().int().min(1).max(60).catch(DEFAULT_SETTINGS.transcriptMinutes),
  notesFolder: z.string().catch(DEFAULT_SETTINGS.notesFolder),
  whisperModelPath: z.string().catch(DEFAULT_SETTINGS.whisperModelPath),
  overlayPosition: positionSchema.nullable().catch(null),
  onboarded: z.boolean().catch(false)
})

/** Turn anything (parsed JSON, a partial object, garbage) into valid Settings. */
export function parseSettings(raw: unknown): Settings {
  const input = typeof raw === 'object' && raw !== null ? raw : {}
  return settingsSchema.parse(input)
}
