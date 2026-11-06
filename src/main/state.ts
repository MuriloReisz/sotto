import type { WebContents } from 'electron'
import { IPC } from '../shared/ipc'
import type { OverlayState, Toast, View } from '../shared/types'

// The main process owns the app state. Any change is pushed to the overlay UI,
// which simply renders whatever it receives (one-way data flow).

let state: OverlayState
let target: WebContents | null = null
let listeners: Array<(state: OverlayState) => void> = []
let toastId = 0

export function initState(initial: OverlayState): void {
  state = initial
}

export function getState(): OverlayState {
  return state
}

/** The web page that receives pushes (the overlay window's contents). */
export function setUiTarget(webContents: WebContents): void {
  target = webContents
}

/** Push any message to the overlay UI (no-op before the window exists). */
export function sendToUi(channel: string, payload?: unknown): void {
  if (target && !target.isDestroyed()) target.send(channel, payload)
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
