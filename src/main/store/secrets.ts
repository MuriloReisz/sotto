import { app, safeStorage } from 'electron'
import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

// The Anthropic API key is encrypted with Electron safeStorage, which uses the OS
// keychain (macOS Keychain, Windows DPAPI). Only the encrypted bytes touch disk, in the
// app's userData folder, never the repo. The key never leaves the main process: the UI
// only learns whether one is set.

const file = (): string => join(app.getPath('userData'), 'secrets.json')

let cached: string | null | undefined

export function getApiKey(): string | null {
  if (cached !== undefined) return cached
  cached = null
  try {
    const { anthropicApiKey } = JSON.parse(readFileSync(file(), 'utf8')) as { anthropicApiKey?: string }
    if (anthropicApiKey && safeStorage.isEncryptionAvailable()) {
      cached = safeStorage.decryptString(Buffer.from(anthropicApiKey, 'base64'))
    }
  } catch {
    // No key saved yet, or it can't be decrypted (e.g. copied from another machine).
  }
  return cached
}

export function hasApiKey(): boolean {
  return getApiKey() !== null
}

export function saveApiKey(key: string): void {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('This computer has no secure storage available, so the key cannot be saved safely.')
  }
  const encrypted = safeStorage.encryptString(key).toString('base64')
  writeFileSync(file(), JSON.stringify({ anthropicApiKey: encrypted }), { mode: 0o600 })
  cached = key
}

export function deleteApiKey(): void {
  rmSync(file(), { force: true })
  cached = null
}
