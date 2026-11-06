import { app } from 'electron'
import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { createServer } from 'node:net'
import { homedir } from 'node:os'
import { delimiter, join } from 'node:path'
import { getSettings } from '../store/settings'

// Local speech-to-text with whisper.cpp's `whisper-server`: free, offline, private.
// Sotto starts it on a random local port the first time you listen and keeps it warm
// until Sotto quits. Audio never leaves the computer.

let child: ChildProcess | null = null
let baseUrl: string | null = null
let starting: Promise<void> | null = null

const exe = process.platform === 'win32' ? 'whisper-server.exe' : 'whisper-server'

function findBinary(): string | null {
  const dirs = [
    ...(process.env['PATH'] ?? '').split(delimiter),
    '/opt/homebrew/bin',
    '/usr/local/bin',
    join(app.getPath('userData'), 'whisper')
  ]
  for (const dir of dirs) {
    if (dir && existsSync(join(dir, exe))) return join(dir, exe)
  }
  return null
}

/** Model preference: the one set in Settings, then English "small", then "base", then any. */
function findModel(): string | null {
  const configured = getSettings().whisperModelPath
  if (configured) return existsSync(configured) ? configured : null
  const dirs = [
    join(app.getPath('userData'), 'models'),
    join(homedir(), '.cache', 'whisper'),
    join(homedir(), '.cache', 'hyperframes', 'whisper', 'models'),
    '/opt/homebrew/share/whisper-cpp/models'
  ]
  const found: string[] = []
  for (const dir of dirs) {
    try {
      for (const name of readdirSync(dir)) {
        if (/^ggml-.*\.bin$/.test(name) && !name.includes('for-tests')) found.push(join(dir, name))
      }
    } catch {
      // folder doesn't exist
    }
  }
  const rank = (p: string): number => (p.includes('small.en') ? 0 : p.includes('base.en') ? 1 : p.includes('small') ? 2 : 3)
  return found.sort((a, b) => rank(a) - rank(b))[0] ?? null
}

export function transcriptionStatus(): { ready: boolean; detail: string } {
  const bin = findBinary()
  if (!bin) return { ready: false, detail: 'whisper.cpp is not installed. On a Mac: brew install whisper-cpp' }
  const model = findModel()
  if (!model) return { ready: false, detail: 'No speech model found. See README > Transcription to download ggml-small.en.bin.' }
  return { ready: true, detail: model.split(/[\\/]/).pop() ?? model }
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      server.close(() => (typeof address === 'object' && address ? resolve(address.port) : reject(new Error('no port'))))
    })
  })
}

/** Start the server if needed and wait until it answers. */
export function ensureWhisperServer(): Promise<void> {
  if (child && baseUrl) return Promise.resolve()
  starting ??= (async () => {
    const bin = findBinary()
    const model = findModel()
    if (!bin || !model) throw new Error(transcriptionStatus().detail)
    const port = await freePort()
    // -nt: no timestamps in the text. Language comes from the model (".en" = English).
    const proc = spawn(bin, ['-m', model, '--host', '127.0.0.1', '--port', String(port), '-nt'], { stdio: 'ignore' })
    child = proc
    proc.once('exit', () => {
      // Only clear the state if it still belongs to this process (not a newer one).
      if (child === proc) {
        child = null
        baseUrl = null
      }
    })
    const url = `http://127.0.0.1:${port}`
    for (let i = 0; i < 100; i++) {
      try {
        await fetch(url)
        baseUrl = url
        return
      } catch {
        await new Promise((r) => setTimeout(r, 200))
      }
    }
    stopWhisperServer()
    throw new Error('The speech recognizer did not start within 20 seconds.')
  })().finally(() => {
    starting = null
  })
  return starting
}

/** Transcribe one WAV clip. Returns the recognised text (may be empty). */
export async function transcribe(wav: Uint8Array): Promise<string> {
  if (!baseUrl) await ensureWhisperServer()
  const form = new FormData()
  form.append('file', new Blob([Buffer.from(wav)], { type: 'audio/wav' }), 'chunk.wav')
  form.append('response_format', 'json')
  form.append('temperature', '0')
  // A chunk is at most 8 s of audio and normally takes well under a second. The timeout
  // keeps one hung request from blocking the queue (and so stop/notes) forever.
  const response = await fetch(`${baseUrl}/inference`, { method: 'POST', body: form, signal: AbortSignal.timeout(30_000) })
  if (!response.ok) throw new Error(`whisper-server answered ${response.status}`)
  const body = (await response.json()) as { text?: string }
  return body.text ?? ''
}

export function stopWhisperServer(): void {
  child?.kill()
  child = null
  baseUrl = null
}
