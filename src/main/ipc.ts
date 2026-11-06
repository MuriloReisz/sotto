import { ipcMain } from 'electron'
import { IPC } from '../shared/ipc'
import { getState } from './state'
import { hideOverlay, setClickThrough } from './windows/overlay'

// All handlers for messages coming from the overlay UI. Each channel is declared in
// src/shared/ipc.ts; the matching sender lives in src/preload/index.ts.
export function registerIpcHandlers(): void {
  ipcMain.handle(IPC.getState, () => getState())
  ipcMain.on(IPC.toggleClickThrough, () => setClickThrough(!getState().clickThrough))
  ipcMain.on(IPC.hideOverlay, () => hideOverlay())
}
