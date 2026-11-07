import type {
  AudioChunk,
  AudioCommand,
  AudioStatus,
  ChatItem,
  HotkeyResult,
  HotkeySlot,
  MeetingDetail,
  MeetingSummary,
  OverlayState,
  QuickAction,
  Settings,
  SettingsView,
  Toast,
  TranscriptSegment,
  View
} from './types'

// The single source of truth for IPC channel names. Main, preload and renderer
// all import from here, so a renamed channel is a compile error, not a silent bug.
export const IPC = {
  // overlay
  getState: 'overlay:get-state',
  stateChanged: 'overlay:state-changed',
  toast: 'overlay:toast',
  showView: 'overlay:show-view',
  toggleClickThrough: 'overlay:toggle-click-through',
  hideOverlay: 'overlay:hide',
  setHeight: 'overlay:set-height',
  setTyping: 'overlay:set-typing',
  copyText: 'overlay:copy-text',
  uiReady: 'overlay:ui-ready',
  // chat
  getChat: 'chat:get',
  chatItem: 'chat:item',
  chatReset: 'chat:reset',
  send: 'chat:send',
  askScreen: 'chat:ask-screen',
  quickAction: 'chat:quick-action',
  stop: 'chat:stop',
  newChat: 'chat:new',
  // audio + transcript
  audioCommand: 'audio:command',
  audioStatus: 'audio:status',
  audioChunk: 'audio:chunk',
  audioLevel: 'audio:level',
  toggleListening: 'audio:toggle',
  getTranscript: 'transcript:get',
  transcriptSegment: 'transcript:segment',
  transcriptReset: 'transcript:reset',
  transcriptRemove: 'transcript:remove',
  // meeting notes
  listMeetings: 'notes:list',
  readMeeting: 'notes:read',
  openMeeting: 'notes:open',
  writeNotes: 'notes:write',
  askMeetings: 'notes:ask',
  meetingsChanged: 'notes:changed',
  // settings
  getSettings: 'settings:get',
  settingsChanged: 'settings:changed',
  updateSettings: 'settings:update',
  setApiKey: 'settings:set-api-key',
  clearApiKey: 'settings:clear-api-key',
  addContextFiles: 'settings:add-context-files',
  removeContextFile: 'settings:remove-context-file',
  chooseNotesFolder: 'settings:choose-notes-folder',
  openNotesFolder: 'settings:open-notes-folder',
  openPermissionSettings: 'settings:open-permissions',
  // hotkey editor
  setHotkey: 'hotkeys:set',
  resetHotkeys: 'hotkeys:reset',
  recordHotkey: 'hotkeys:record',
  hotkeyRecordEnded: 'hotkeys:record-ended'
} as const

type Unsubscribe = () => void

/** The API the preload script exposes to the page as `window.sotto`. */
export interface SottoApi {
  // overlay
  getState(): Promise<OverlayState>
  onStateChanged(listener: (state: OverlayState) => void): Unsubscribe
  onToast(listener: (toast: Toast) => void): Unsubscribe
  /** Main process asks the UI to switch view (e.g. after a hotkey). */
  onShowView(listener: (view: View) => void): Unsubscribe
  toggleClickThrough(): void
  hideOverlay(): void
  /** Tell the main process how tall the content is, so the window can fit it. */
  setHeight(height: number): void
  /** Take or release keyboard focus (needed to type; released so the app behind gets focus back). */
  setTyping(typing: boolean): void
  copyText(text: string): void
  /** The page is listening for pushes; main holds back hotkey commands until then. */
  uiReady(): void

  // chat
  getChat(): Promise<ChatItem[]>
  onChatItem(listener: (item: ChatItem) => void): Unsubscribe
  onChatReset(listener: () => void): Unsubscribe
  send(text: string): void
  askScreen(): void
  quickAction(action: QuickAction): void
  stop(): void
  newChat(): void

  // audio + transcript
  toggleListening(): void
  onAudioCommand(listener: (command: AudioCommand) => void): Unsubscribe
  audioStatus(status: AudioStatus): void
  sendAudioChunk(chunk: AudioChunk): void
  getTranscript(): Promise<TranscriptSegment[]>
  onTranscriptSegment(listener: (segment: TranscriptSegment) => void): Unsubscribe
  onTranscriptReset(listener: () => void): Unsubscribe
  /** A line already shown turned out to be an echo of the other side. */
  onTranscriptRemove(listener: (id: string) => void): Unsubscribe

  // meeting notes
  listMeetings(): Promise<MeetingSummary[]>
  readMeeting(id: string): Promise<MeetingDetail | null>
  openMeeting(id: string): void
  writeNotes(): void
  askMeetings(question: string): void
  onMeetingsChanged(listener: () => void): Unsubscribe

  // settings
  getSettings(): Promise<SettingsView>
  onSettingsChanged(listener: (settings: SettingsView) => void): Unsubscribe
  updateSettings(patch: Partial<Settings>): Promise<SettingsView>
  /** Saves the key encrypted after checking it with Anthropic. Resolves to an error message, or null on success. */
  setApiKey(key: string): Promise<string | null>
  clearApiKey(): Promise<void>
  addContextFiles(): Promise<void>
  removeContextFile(name: string): Promise<void>
  chooseNotesFolder(): Promise<void>
  openNotesFolder(): void
  openPermissionSettings(kind: 'screen' | 'microphone'): void

  // hotkey editor
  /** Change one shortcut ("" = not set). Checked and test-registered in the main process. */
  setHotkey(slot: HotkeySlot, accelerator: string): Promise<HotkeyResult>
  resetHotkeys(): Promise<HotkeyResult>
  /** Start/stop recording a combo: Sotto's hotkeys are paused and the overlay takes focus meanwhile. */
  recordHotkey(active: boolean): void
  /** Main ended the recording on its own (timeout, focus lost): stop recording in the page too. */
  onHotkeyRecordEnded(listener: () => void): Unsubscribe
}
