#!/usr/bin/env node
// macOS dev only: starts Electron as its own "responsible process" for privacy (TCC).
//
// Started from a terminal, Electron's permissions are checked against the terminal app
// (the TCC prompt says "Terminal.app would like access to record your system audio").
// Terminal's Info.plist has no NSAudioCaptureUsageDescription, so the system-audio track
// from getDisplayMedia comes back dead ('ended'). Spawning Electron with responsibility
// disclaimed (what Chromium does for its helpers) makes TCC use Electron.app's own
// Info.plist and grants (bundle id com.github.Electron) instead.
//
// electron-vite runs this file in place of the Electron binary (scripts/electron-vite.mjs
// points ELECTRON_EXEC_PATH here), passes the usual Electron arguments, and kills it on
// restart or Ctrl+C. Signals are forwarded, so Electron dies with this launcher. If the
// FFI path fails, it falls back to a plain spawn (audio from the terminal, as before).

import { spawn } from 'node:child_process'
import { constants } from 'node:os'
import process from 'node:process'
import { setInterval, clearInterval } from 'node:timers'

const electron = process.env.SOTTO_ELECTRON_BIN
if (!electron) {
  process.stderr.write('[sotto] SOTTO_ELECTRON_BIN is not set; run through `npm run dev`.\n')
  process.exit(1)
}
const args = process.argv.slice(2)
const env = { ...process.env }
delete env.SOTTO_ELECTRON_BIN
delete env.ELECTRON_EXEC_PATH

const FORWARDED = ['SIGINT', 'SIGTERM', 'SIGHUP']

let pid
try {
  pid = await spawnDisclaimed(electron, args, env)
} catch (err) {
  process.stderr.write(
    `[sotto] could not start Electron with its own permissions (${err.message}); ` +
      'falling back to a plain spawn, so system audio may not work in dev.\n'
  )
  fallback()
}

if (pid !== undefined) supervise(pid)

/** posix_spawn with responsibility_spawnattrs_setdisclaim(attr, 1), via koffi. */
async function spawnDisclaimed(file, argv, environment) {
  const { default: koffi } = await import('koffi')
  const lib = koffi.load('/usr/lib/libSystem.B.dylib')
  // posix_spawnattr_t is `void *` on macOS; the functions take a pointer to it.
  const attrInit = lib.func('int posix_spawnattr_init(void *attr)')
  const attrDestroy = lib.func('int posix_spawnattr_destroy(void *attr)')
  const setFlags = lib.func('int posix_spawnattr_setflags(void *attr, int16_t flags)')
  const setSigDefault = lib.func('int posix_spawnattr_setsigdefault(void *attr, const uint32_t *set)')
  const setSigMask = lib.func('int posix_spawnattr_setsigmask(void *attr, const uint32_t *set)')
  const setDisclaim = lib.func('int responsibility_spawnattrs_setdisclaim(void *attr, int disclaim)')
  const posixSpawn = lib.func(
    'int posix_spawn(_Out_ int32_t *pid, const char *path, void *actions, void *attr, const char **argv, const char **envp)'
  )

  const actionsInit = lib.func('int posix_spawn_file_actions_init(void *actions)')
  const actionsDestroy = lib.func('int posix_spawn_file_actions_destroy(void *actions)')
  const addInherit = lib.func('int posix_spawn_file_actions_addinherit_np(void *actions, int fd)')

  const POSIX_SPAWN_SETSIGDEF = 0x0004
  const POSIX_SPAWN_SETSIGMASK = 0x0008

  const attr = koffi.alloc('void *', 1)
  const actions = koffi.alloc('void *', 1)
  try {
    check(attrInit(attr), 'posix_spawnattr_init')
    check(actionsInit(actions), 'posix_spawn_file_actions_init')
    try {
      // Node marks stdin/stdout/stderr close-on-exec; keep them so Electron's logs show here.
      for (const fd of [0, 1, 2]) check(addInherit(actions, fd), 'posix_spawn_file_actions_addinherit_np')
      // Like libuv: every signal back to its default (Node ignores SIGPIPE), nothing blocked.
      check(setFlags(attr, POSIX_SPAWN_SETSIGDEF | POSIX_SPAWN_SETSIGMASK), 'posix_spawnattr_setflags')
      check(setSigDefault(attr, [0xffffffff]), 'posix_spawnattr_setsigdefault')
      check(setSigMask(attr, [0]), 'posix_spawnattr_setsigmask')
      check(setDisclaim(attr, 1), 'responsibility_spawnattrs_setdisclaim')
      const envp = Object.entries(environment).map(([k, v]) => `${k}=${v}`)
      const out = [0]
      check(posixSpawn(out, file, actions, attr, [file, ...argv, null], [...envp, null]), 'posix_spawn')
      return out[0]
    } finally {
      actionsDestroy(actions)
      attrDestroy(attr)
    }
  } finally {
    koffi.free(actions)
    koffi.free(attr)
  }

  function check(rc, name) {
    if (rc !== 0) throw new Error(`${name} returned ${rc}`)
  }
}

/** Forward signals, reap the child, and exit the way it exited. */
async function supervise(child) {
  const { default: koffi } = await import('koffi')
  const lib = koffi.load('/usr/lib/libSystem.B.dylib')
  const waitpid = lib.func('int waitpid(int pid, _Out_ int *status, int options)')
  const WNOHANG = 1

  for (const signal of FORWARDED) {
    process.on(signal, () => {
      try {
        process.kill(child, signal)
      } catch {
        // already gone; the poll below reaps it
      }
    })
  }

  // If electron-vite dies without signalling us (e.g. SIGKILL), don't leave Electron behind.
  const parent = process.ppid
  let orphaned = false

  const timer = setInterval(() => {
    if (!orphaned && process.ppid !== parent) {
      orphaned = true
      try {
        process.kill(child, 'SIGTERM')
      } catch {
        // already gone
      }
    }
    const status = [0]
    const rc = waitpid(child, status, WNOHANG)
    if (rc === 0) return
    clearInterval(timer)
    if (rc < 0) process.exit(1)
    const termSignal = status[0] & 0x7f
    if (termSignal === 0) process.exit((status[0] >> 8) & 0xff)
    // Died from a signal: die from the same one, so electron-vite sees what it would have.
    const name = Object.keys(constants.signals).find((n) => constants.signals[n] === termSignal)
    if (name) {
      process.removeAllListeners(name)
      process.kill(process.pid, name)
    }
    process.exit(128 + termSignal)
  }, 100)
}

function fallback() {
  const ps = spawn(electron, args, { stdio: 'inherit', env })
  for (const signal of FORWARDED) process.on(signal, () => ps.kill(signal))
  ps.on('close', (code, signal) => process.exit(code ?? (signal ? 1 : 0)))
}
