import { app } from 'electron'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { parseSettings } from '../../shared/settings-schema'
import type { Settings } from '../../shared/types'

// Settings live in a plain JSON file in the OS app-data folder:
//   macOS:   ~/Library/Application Support/veil/settings.json
//   Windows: %APPDATA%\veil\settings.json
// API keys are NOT stored here; they go through safeStorage (see secrets.ts, M2).

type Listener = (settings: Settings) => void

let current: Settings | null = null
let saveTimer: NodeJS.Timeout | null = null
const listeners = new Set<Listener>()

const settingsPath = (): string => join(app.getPath('userData'), 'settings.json')

export function getSettings(): Settings {
  if (!current) {
    let raw: unknown = {}
    try {
      raw = JSON.parse(readFileSync(settingsPath(), 'utf8'))
    } catch {
      // First launch or unreadable file: fall back to defaults.
    }
    current = parseSettings(raw)
  }
  return current
}

/** Merge a partial update, validate it, notify listeners and save (debounced). */
export function updateSettings(patch: Partial<Settings>): Settings {
  const next = parseSettings({ ...getSettings(), ...patch })
  current = next
  scheduleSave()
  listeners.forEach((listener) => listener(next))
  return next
}

export function onSettingsChanged(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function scheduleSave(): void {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(flushSettings, 300)
}

/** Write to a temp file then rename, so a crash mid-write can't corrupt settings.json. */
export function flushSettings(): void {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = null
  if (!current) return
  const file = settingsPath()
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(`${file}.tmp`, JSON.stringify(current, null, 2))
  renameSync(`${file}.tmp`, file)
}
