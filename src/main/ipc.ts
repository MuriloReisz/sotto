import { ipcMain, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron'
import { IPC } from '../shared/ipc'
import { isTrustedSender } from './security'
import { getState } from './state'
import { hideOverlay, setClickThrough } from './windows/overlay'

// All handlers for messages coming from the overlay UI. Each channel is declared in
// src/shared/ipc.ts; the matching sender lives in src/preload/index.ts.
// Every handler first checks the message came from one of Sotto's own pages.

type Event = IpcMainEvent | IpcMainInvokeEvent

function trusted(event: Event): boolean {
  const ok = isTrustedSender(event.senderFrame)
  if (!ok) console.warn(`[ipc] rejected message from ${event.senderFrame?.url ?? 'unknown frame'}`)
  return ok
}

export function registerIpcHandlers(): void {
  ipcMain.handle(IPC.getState, (event) => {
    if (!trusted(event)) throw new Error('Untrusted sender')
    return getState()
  })
  ipcMain.on(IPC.toggleClickThrough, (event) => {
    if (trusted(event)) setClickThrough(!getState().clickThrough)
  })
  ipcMain.on(IPC.hideOverlay, (event) => {
    if (trusted(event)) hideOverlay()
  })
}
