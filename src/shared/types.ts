// Types shared by the main process, the preload bridge and the React UI.
// Keep this file free of Electron/Node imports so the renderer can use it too.

export type Platform = 'darwin' | 'win32' | 'linux'

/** Every action that can be bound to a global hotkey. */
export type HotkeyAction =
  | 'toggleOverlay'
  | 'screenshot'
  | 'toggleListening'
  | 'toggleClickThrough'
  | 'suggestReply'
  | 'moveUp'
  | 'moveDown'
  | 'moveLeft'
  | 'moveRight'

/** Action -> Electron accelerator string, e.g. "CommandOrControl+Shift+Space". */
export type Hotkeys = Record<HotkeyAction, string>

export interface Bounds {
  x: number
  y: number
  width: number
  height: number
}

/** Persisted user settings (settings.json in the app's userData folder). No secrets here. */
export interface Settings {
  hotkeys: Hotkeys
  /** Claude model id used for every request. */
  model: string
  /** Extra instructions prepended to every request. */
  systemPrompt: string
  /** Background opacity of the overlay card, 0.3–1. */
  opacity: number
  /** How many minutes of transcript "What should I say?" sends as context. */
  transcriptMinutes: number
  /** Last overlay position/size, restored on launch. */
  overlayBounds: Bounds | null
}

export interface HotkeyError {
  action: HotkeyAction
  accelerator: string
  reason: string
}

/** Live state the overlay UI renders. Owned by the main process, pushed to the UI on change. */
export interface OverlayState {
  platform: Platform
  visible: boolean
  clickThrough: boolean
  listening: boolean
  /** What Electron reports for content protection (not proof that every capture tool respects it). */
  contentProtected: boolean
  hotkeys: Hotkeys
  hotkeyErrors: HotkeyError[]
}

export interface Toast {
  id: number
  text: string
  kind: 'info' | 'error'
}
