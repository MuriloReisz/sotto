import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { IPC, type VeilApi } from '../shared/ipc'
import type { OverlayState, Toast } from '../shared/types'

// The preload script is the only bridge between the page and the main process.
// The page gets this small typed API as `window.veil`, never raw ipcRenderer or Node.

function subscribe<T>(channel: string, listener: (payload: T) => void): () => void {
  const handler = (_event: IpcRendererEvent, payload: T): void => listener(payload)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

const api: VeilApi = {
  getState: () => ipcRenderer.invoke(IPC.getState),
  toggleClickThrough: () => ipcRenderer.send(IPC.toggleClickThrough),
  hideOverlay: () => ipcRenderer.send(IPC.hideOverlay),
  onStateChanged: (listener) => subscribe<OverlayState>(IPC.stateChanged, listener),
  onToast: (listener) => subscribe<Toast>(IPC.toast, listener)
}

contextBridge.exposeInMainWorld('veil', api)
