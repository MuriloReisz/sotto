// Runs the electron-vite CLI (`node scripts/electron-vite.mjs dev [...flags]`).
//
// On macOS it first points ELECTRON_EXEC_PATH (which electron-vite honours) at
// electron-disclaimed.mjs, so Electron becomes its own responsible process and system
// audio works in dev (see that file). Other platforms run electron-vite unchanged.
// Set SOTTO_DEV_DISCLAIM=0 to skip the launcher on macOS.

import { accessSync, chmodSync, constants } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const require = createRequire(import.meta.url)

if (process.platform === 'darwin' && process.env.SOTTO_DEV_DISCLAIM !== '0') {
  const launcher = join(dirname(fileURLToPath(import.meta.url)), 'electron-disclaimed.mjs')
  try {
    accessSync(launcher, constants.X_OK)
  } catch {
    chmodSync(launcher, 0o755) // the exec bit can get lost (zip downloads, some git setups)
  }
  // Respect an ELECTRON_EXEC_PATH the user already set: that is the Electron to launch.
  process.env.SOTTO_ELECTRON_BIN = process.env.ELECTRON_EXEC_PATH || require('electron')
  process.env.ELECTRON_EXEC_PATH = launcher
}

// Hand over to electron-vite's own CLI in this process; it reads process.argv.slice(2).
const cli = join(dirname(require.resolve('electron-vite/package.json')), 'bin', 'electron-vite.js')
await import(pathToFileURL(cli).href)
