// Types shared by the main process, the preload bridge and the React UI.
// Keep this file free of Electron/Node imports so the renderer can use it too.

export type Platform = 'darwin' | 'win32' | 'linux'

/** Every action that can be bound to a global hotkey. */
export type HotkeyAction =
  | 'toggleOverlay'
  | 'screenshot'
  | 'toggleListening'
  | 'focusChat'
  | 'toggleClickThrough'
  | 'suggestReply'
  | 'moveUp'
  | 'moveDown'
  | 'moveLeft'
  | 'moveRight'

/** Action -> Electron accelerator string, e.g. "CommandOrControl+Shift+Space". "" = not set. */
export type Hotkeys = Record<HotkeyAction, string>

/** What the hotkey editor edits: one row per action, except the four move keys share one row. */
export type HotkeySlot = Exclude<HotkeyAction, 'moveUp' | 'moveDown' | 'moveLeft' | 'moveRight'> | 'move'

/** Result of changing a hotkey. `error` is a sentence for the UI. */
export interface HotkeyResult {
  ok: boolean
  error?: string
}

export interface Bounds {
  x: number
  y: number
  width: number
  height: number
}

export type ModelId = 'claude-sonnet-5-5' | 'claude-opus-5-5' | 'claude-haiku-5-5'

/** Persisted user settings (settings.json in the app's userData folder). No secrets here. */
export interface Settings {
  hotkeys: Hotkeys
  /** Claude model used for every request. */
  model: ModelId
  /** Extra instructions added to every request. */
  customInstructions: string
  /** "About me": who you are, your role, company, goals. Added to every request. */
  aboutMe: string
  /** Background opacity of the overlay, 0.5–1. */
  opacity: number
  /** How many minutes of transcript the call features send as context. */
  transcriptMinutes: number
  /** Where meeting notes are saved. Empty = the default (Documents/Sotto/Meetings). */
  notesFolder: string
  /** whisper.cpp model file. Empty = auto-detect. */
  whisperModelPath: string
  /** Drop your mic's copy of the other side (speakers, no headphones). */
  removeEcho: boolean
  /** Last overlay position (size is driven by its content). */
  overlayPosition: { x: number; y: number } | null
  /** Set after the welcome screen has been completed. */
  onboarded: boolean
}

/** Settings as shown in the UI: no secrets, plus a few derived facts. */
export interface SettingsView extends Settings {
  hasApiKey: boolean
  /** Folder actually used for notes (resolved default). */
  notesFolderResolved: string
  contextFiles: ContextFile[]
  transcription: { ready: boolean; detail: string }
}

export interface ContextFile {
  name: string
  sizeKb: number
  kind: 'text' | 'pdf'
}

export interface HotkeyError {
  action: HotkeyAction
  accelerator: string
  reason: string
}

export type View = 'chat' | 'transcript' | 'notes' | 'settings' | 'help' | 'welcome'

/** Live state the overlay UI renders. Owned by the main process, pushed to the UI on change. */
export interface OverlayState {
  platform: Platform
  visible: boolean
  clickThrough: boolean
  /** The overlay currently has keyboard focus (you're typing). */
  typing: boolean
  /** What Electron reports for content protection (not proof that every capture tool respects it). */
  contentProtected: boolean
  hotkeys: Hotkeys
  hotkeyErrors: HotkeyError[]
  /** Listening session: null when not listening. */
  listening: { since: number; systemAudio: boolean; microphone: boolean } | null
  /** Claude is writing an answer. */
  busy: boolean
  /** Meeting notes are being written. */
  notesStatus: 'idle' | 'writing'
  opacity: number
  hasApiKey: boolean
  onboarded: boolean
  /** True when answers come from the built-in fake model (development testing). */
  fakeModel: boolean
}

export interface Toast {
  id: number
  text: string
  kind: 'info' | 'error' | 'success'
}

// ---- Chat ----

export type QuickAction = 'whatToSay' | 'followUps' | 'factCheck' | 'recap'

export interface ChatItem {
  id: string
  role: 'user' | 'assistant'
  /** Markdown for assistant items, plain text for user items. */
  text: string
  /** Small JPEG data URL shown next to screenshot questions. */
  thumbnail?: string
  /** Short label for where the question came from, e.g. "Screenshot", "What should I say?". */
  label?: string
  status: 'streaming' | 'done' | 'error' | 'stopped'
  at: number
}

// ---- Transcript ----

export type Speaker = 'me' | 'them'

export interface TranscriptSegment {
  id: string
  speaker: Speaker
  text: string
  /** Epoch ms when the speech started. */
  at: number
  /** Length of the audio chunk it came from, in ms (used to tell echoes from replies). */
  durationMs: number
}

/** One chunk of speech captured in the renderer, sent to the main process for transcription. */
export interface AudioChunk {
  speaker: Speaker
  /** 16 kHz mono signed 16-bit PCM. */
  pcm: ArrayBuffer
  at: number
}

/** `id` names the capture session (see shared/listen-session.ts). */
export type AudioCommand = { type: 'start'; id: number } | { type: 'stop'; id: number }

export interface AudioStatus {
  /** The session this is about: the id of the start command it answers. */
  id: number
  /** 'changed' = while listening, a source died, switched device or arrived late. */
  state: 'started' | 'stopped' | 'error' | 'changed'
  microphone: boolean
  systemAudio: boolean
  /** System audio is still waiting on a macOS permission prompt (it is attached when it arrives). */
  waiting?: boolean
  message?: string
}

// ---- Meeting notes ----

export interface ActionItem {
  owner: string
  task: string
  due: string
}

/** What Claude returns for a meeting (structured output). */
export interface MeetingNotes {
  title: string
  summary: string
  keyPoints: string[]
  decisions: string[]
  actionItems: ActionItem[]
  followUpEmail: { subject: string; body: string }
}

export interface MeetingSummary {
  /** File name, used as the id. */
  id: string
  title: string
  date: string
  durationMin: number
  /** First line of the summary, for the list. */
  preview: string
}

export interface MeetingDetail extends MeetingSummary {
  markdown: string
  followUpEmail: string
}
