import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { IPC, type SottoApi } from '../shared/ipc'

// The preload script is the only bridge between the page and the main process.
// The page gets this small typed API as `window.sotto`, never raw ipcRenderer or Node.

function subscribe<T>(channel: string, listener: (payload: T) => void): () => void {
  const handler = (_event: IpcRendererEvent, payload: T): void => listener(payload)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

const send = (channel: string, ...args: unknown[]): void => ipcRenderer.send(channel, ...args)
const invoke = <T>(channel: string, ...args: unknown[]): Promise<T> => ipcRenderer.invoke(channel, ...args)

const api: SottoApi = {
  // overlay
  getState: () => invoke(IPC.getState),
  onStateChanged: (l) => subscribe(IPC.stateChanged, l),
  onToast: (l) => subscribe(IPC.toast, l),
  onShowView: (l) => subscribe(IPC.showView, l),
  toggleClickThrough: () => send(IPC.toggleClickThrough),
  hideOverlay: () => send(IPC.hideOverlay),
  setHeight: (h) => send(IPC.setHeight, h),
  setTyping: (t) => send(IPC.setTyping, t),
  copyText: (t) => send(IPC.copyText, t),
  uiReady: () => send(IPC.uiReady),
  // chat
  getChat: () => invoke(IPC.getChat),
  onChatItem: (l) => subscribe(IPC.chatItem, l),
  onChatReset: (l) => subscribe(IPC.chatReset, l),
  send: (text) => send(IPC.send, text),
  askScreen: () => send(IPC.askScreen),
  quickAction: (a) => send(IPC.quickAction, a),
  stop: () => send(IPC.stop),
  newChat: () => send(IPC.newChat),
  // audio + transcript
  toggleListening: () => send(IPC.toggleListening),
  onAudioCommand: (l) => subscribe(IPC.audioCommand, l),
  audioStatus: (s) => send(IPC.audioStatus, s),
  sendAudioChunk: (c) => send(IPC.audioChunk, c),
  getTranscript: () => invoke(IPC.getTranscript),
  onTranscriptSegment: (l) => subscribe(IPC.transcriptSegment, l),
  onTranscriptReset: (l) => subscribe(IPC.transcriptReset, l),
  onTranscriptRemove: (l) => subscribe(IPC.transcriptRemove, l),
  // meeting notes
  listMeetings: () => invoke(IPC.listMeetings),
  readMeeting: (id) => invoke(IPC.readMeeting, id),
  openMeeting: (id) => send(IPC.openMeeting, id),
  writeNotes: () => send(IPC.writeNotes),
  askMeetings: (q) => send(IPC.askMeetings, q),
  onMeetingsChanged: (l) => subscribe(IPC.meetingsChanged, l),
  // settings
  getSettings: () => invoke(IPC.getSettings),
  onSettingsChanged: (l) => subscribe(IPC.settingsChanged, l),
  updateSettings: (patch) => invoke(IPC.updateSettings, patch),
  setApiKey: (key) => invoke(IPC.setApiKey, key),
  clearApiKey: () => invoke(IPC.clearApiKey),
  addContextFiles: () => invoke(IPC.addContextFiles),
  removeContextFile: (name) => invoke(IPC.removeContextFile, name),
  chooseNotesFolder: () => invoke(IPC.chooseNotesFolder),
  openNotesFolder: () => send(IPC.openNotesFolder),
  openPermissionSettings: (kind) => send(IPC.openPermissionSettings, kind),
  // hotkey editor
  setHotkey: (slot, accelerator) => invoke(IPC.setHotkey, slot, accelerator),
  resetHotkeys: () => invoke(IPC.resetHotkeys),
  recordHotkey: (active) => send(IPC.recordHotkey, active),
  onHotkeyRecordEnded: (l) => subscribe(IPC.hotkeyRecordEnded, l)
}

contextBridge.exposeInMainWorld('sotto', api)
