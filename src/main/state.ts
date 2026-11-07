import type { WebContents } from 'electron'
import { IPC } from '../shared/ipc'
import type { OverlayState, Toast, View } from '../shared/types'

// The main process owns the app state. Any change is pushed to the overlay UI,
// which simply renders whatever it receives (one-way data flow).

let state: OverlayState
let target: WebContents | null = null
let listeners: Array<(state: OverlayState) => void> = []
let toastId = 0
/** The page has attached its listeners (it says so once React has mounted). */
let uiReady = false
/** Messages that matter, held back while the page loads (a hotkey right after launch). */
let pending: Array<[string, unknown]> = []
const HELD_BACK = new Set<string>([IPC.audioCommand, IPC.showView, IPC.toast])

export function initState(initial: OverlayState): void {
  state = initial
}

export function getState(): OverlayState {
  return state
}

/** The web page that receives pushes (the overlay window's contents). */
export function setUiTarget(webContents: WebContents): void {
  target = webContents
  uiReady = false
  // A reload (development) starts a fresh page that has to attach its listeners again.
  webContents.on('did-start-navigation', (details) => {
    if (details.isMainFrame && !details.isSameDocument) uiReady = false
  })
}

/** The page is listening: deliver what was held back, in order. */
export function markUiReady(): void {
  uiReady = true
  const held = pending
  pending = []
  held.forEach(([channel, payload]) => sendToUi(channel, payload))
}

/**
 * Push a message to the overlay UI (no-op before the window exists). Until the page is
 * ready, commands, views and toasts wait; anything else is sent straight away (if the
 * page isn't listening yet, it fetches that data when it mounts).
 */
export function sendToUi(channel: string, payload?: unknown): void {
  if (!target || target.isDestroyed()) return
  if (uiReady || !HELD_BACK.has(channel)) target.send(channel, payload)
  else if (pending.length < 50) pending.push([channel, payload])
}

export function setState(patch: Partial<OverlayState>): void {
  state = { ...state, ...patch }
  sendToUi(IPC.stateChanged, state)
  listeners.forEach((listener) => listener(state))
}

/** For main-process consumers such as the tray menu. */
export function onStateChanged(listener: (state: OverlayState) => void): void {
  listeners = [...listeners, listener]
}

/** Show a short message in the overlay. */
export function toast(text: string, kind: Toast['kind'] = 'info'): void {
  sendToUi(IPC.toast, { id: ++toastId, text, kind } satisfies Toast)
}

export function showView(view: View): void {
  sendToUi(IPC.showView, view)
}
