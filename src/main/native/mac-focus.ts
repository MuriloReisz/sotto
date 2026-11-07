import type { BrowserWindow } from 'electron'
import { createRequire } from 'node:module'

// macOS only: control which app is "active" around the overlay.
//
// 1. Clicking the overlay must not activate Sotto, so the app you're working in stays
//    frontmost (a browser page would otherwise see its window lose focus, which some
//    interview/proctoring tools watch for). Electron's `type: 'panel'` adds the
//    non-activating style after the window exists, which AppKit ignores, so we call the
//    private `-[NSWindow _setPreventsActivation:]` (Wine uses it for the same problem).
//    Tested 2026-11-06: without it one click turned Terminal -> Electron; with it,
//    Terminal stayed frontmost.
// 2. To type, Sotto must become active. Before that we remember the frontmost app, and
//    afterwards we hand activation back to it.
//
// Calls go through the Objective-C runtime with koffi (prebuilt FFI, no compiling).
// Private methods are checked with respondsToSelector: first; if Apple removes one,
// Sotto keeps working and just loses that refinement.
//
// koffi is loaded on first use, and only on macOS: a top-level import would crash the
// whole main process at startup wherever its native part fails to load (e.g. Windows).
// If it fails, every function below just does nothing.

type Ptr = unknown
type Koffi = typeof import('koffi')

const isMac = process.platform === 'darwin'
/** undefined = not tried yet, null = unavailable. */
let koffiModule: Koffi | null | undefined

function koffi(): Koffi {
  if (koffiModule === undefined) {
    koffiModule = null
    if (isMac) {
      try {
        // createRequire: a plain runtime require the bundler leaves alone (koffi stays external).
        koffiModule = createRequire(__filename)('koffi') as Koffi
      } catch (error) {
        console.warn('[sotto] koffi could not load; the overlay focus refinements are off:', error)
      }
    }
  }
  if (!koffiModule) throw new Error('koffi is not available')
  return koffiModule
}

interface Runtime {
  cls: (name: string) => Ptr
  sel: (name: string) => Ptr
  send: (target: Ptr, selector: Ptr) => Ptr
  sendPtr: (target: Ptr, selector: Ptr, arg: Ptr) => void
  sendBool: (target: Ptr, selector: Ptr, value: boolean) => void
  sendU64: (target: Ptr, selector: Ptr, value: number) => boolean
  sendInt: (target: Ptr, selector: Ptr) => number
  responds: (target: Ptr, selector: Ptr, query: Ptr) => boolean
}

let rt: Runtime | null = null

function runtime(): Runtime {
  if (!rt) {
    const lib = koffi().load('/usr/lib/libobjc.A.dylib')
    // objc_msgSend has no fixed signature, so we declare one typed variant per call shape.
    rt = {
      cls: lib.func('objc_getClass', 'void *', ['str']),
      sel: lib.func('sel_registerName', 'void *', ['str']),
      send: lib.func('objc_msgSend', 'void *', ['void *', 'void *']),
      sendPtr: lib.func('objc_msgSend', 'void', ['void *', 'void *', 'void *']),
      sendBool: lib.func('objc_msgSend', 'void', ['void *', 'void *', 'bool']),
      sendU64: lib.func('objc_msgSend', 'bool', ['void *', 'void *', 'uint64']),
      sendInt: lib.func('objc_msgSend', 'int', ['void *', 'void *']),
      responds: lib.func('objc_msgSend', 'bool', ['void *', 'void *', 'void *'])
    }
  }
  return rt
}

function can(target: Ptr, selector: string): boolean {
  const r = runtime()
  return target !== null && r.responds(target, r.sel('respondsToSelector:'), r.sel(selector))
}

function nsWindow(win: BrowserWindow): Ptr {
  const r = runtime()
  // getNativeWindowHandle() is a buffer holding an NSView* pointer on macOS.
  const view = koffi().decode(win.getNativeWindowHandle(), 'void *')
  return r.send(view, r.sel('window'))
}

/** true = clicks on the overlay never activate Sotto. Returns false if unsupported. */
export function setPreventsActivation(win: BrowserWindow, prevent: boolean): boolean {
  if (!isMac) return false
  try {
    const w = nsWindow(win)
    if (!can(w, '_setPreventsActivation:')) {
      console.warn('[sotto] _setPreventsActivation: not available on this macOS')
      return false
    }
    runtime().sendBool(w, runtime().sel('_setPreventsActivation:'), prevent)
    return true
  } catch (error) {
    console.warn('[sotto] could not change window activation:', error)
    return false
  }
}

let previousApp: Ptr = null

/** Remember the frontmost app (call just before Sotto takes focus). */
export function rememberFrontmostApp(): void {
  if (!isMac) return
  try {
    const r = runtime()
    releasePrevious()
    const workspace = r.send(r.cls('NSWorkspace'), r.sel('sharedWorkspace'))
    const app = r.send(workspace, r.sel('frontmostApplication'))
    const self = r.send(r.cls('NSRunningApplication'), r.sel('currentApplication'))
    const pid = (p: Ptr): number => r.sendInt(p, r.sel('processIdentifier'))
    if (app && pid(app) !== pid(self)) previousApp = r.send(app, r.sel('retain'))
  } catch (error) {
    console.warn('[sotto] could not read the frontmost app:', error)
  }
}

/** Give activation back to the app remembered above. */
export function reactivatePreviousApp(): void {
  if (!isMac || !previousApp) return
  try {
    const r = runtime()
    const nsApp = r.send(r.cls('NSApplication'), r.sel('sharedApplication'))
    // macOS 14+ "cooperative activation": the active app yields, the target activates.
    if (can(nsApp, 'yieldActivationToApplication:')) r.sendPtr(nsApp, r.sel('yieldActivationToApplication:'), previousApp)
    if (can(previousApp, 'activate')) r.send(previousApp, r.sel('activate'))
    else r.sendU64(previousApp, r.sel('activateWithOptions:'), 2 /* ignoring other apps */)
  } catch (error) {
    console.warn('[sotto] could not reactivate the previous app:', error)
  } finally {
    releasePrevious()
  }
}

function releasePrevious(): void {
  if (previousApp) runtime().send(previousApp, runtime().sel('release'))
  previousApp = null
}
