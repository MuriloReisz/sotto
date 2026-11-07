import { app, safeStorage } from 'electron'
import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

// The Anthropic API key is encrypted with Electron safeStorage, which uses the OS
// keychain (macOS Keychain, Windows DPAPI). Only the encrypted bytes touch disk, in the
// app's userData folder, never the repo. The key never leaves the main process: the UI
// only learns whether one is set.

const file = (): string => join(app.getPath('userData'), 'secrets.json')

/** undefined until loadApiKey() has run (at startup, before anything asks for the key). */
let cached: string | null | undefined

/** Read and decrypt the saved key once at startup. Never rejects. */
export async function loadApiKey(): Promise<void> {
  cached = null
  try {
    const { anthropicApiKey } = JSON.parse(readFileSync(file(), 'utf8')) as { anthropicApiKey?: string }
    if (!anthropicApiKey || !(await safeStorage.isAsyncEncryptionAvailable())) return
    const { result, shouldReEncrypt } = await safeStorage.decryptStringAsync(Buffer.from(anthropicApiKey, 'base64'))
    cached = result
    // The OS rotated the encryption key: store the key again under the new one.
    if (shouldReEncrypt) await writeKey(result).catch(() => undefined)
  } catch {
    // No key saved yet, or it can't be decrypted (e.g. copied from another machine).
  }
}

/** The key, from memory. Null when none is saved (or before loadApiKey has run). */
export function getApiKey(): string | null {
  return cached ?? null
}

export function hasApiKey(): boolean {
  return getApiKey() !== null
}

export async function saveApiKey(key: string): Promise<void> {
  if (!(await safeStorage.isAsyncEncryptionAvailable())) {
    throw new Error('This computer has no secure storage available, so the key cannot be saved safely.')
  }
  await writeKey(key)
  cached = key
}

async function writeKey(key: string): Promise<void> {
  const encrypted = (await safeStorage.encryptStringAsync(key)).toString('base64')
  writeFileSync(file(), JSON.stringify({ anthropicApiKey: encrypted }), { mode: 0o600 })
}

export function deleteApiKey(): void {
  rmSync(file(), { force: true })
  cached = null
}
