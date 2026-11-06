import type { HotkeyAction, Hotkeys, Settings } from './types'

// Electron accelerator syntax: https://www.electronjs.org/docs/latest/api/accelerator
// "CommandOrControl" = Cmd on macOS, Ctrl on Windows. "Alt" = Option on macOS.
export const DEFAULT_HOTKEYS: Hotkeys = {
  toggleOverlay: 'CommandOrControl+Shift+Space',
  screenshot: 'CommandOrControl+Shift+S',
  toggleListening: 'CommandOrControl+Shift+A',
  toggleClickThrough: 'CommandOrControl+Shift+C',
  suggestReply: 'CommandOrControl+Shift+Enter',
  // Ctrl+Option+Arrows rather than Cmd+Arrows: a global Cmd+Left/Right would break
  // "jump to line start/end" in every other app while Veil is running.
  moveUp: 'Control+Alt+Up',
  moveDown: 'Control+Alt+Down',
  moveLeft: 'Control+Alt+Left',
  moveRight: 'Control+Alt+Right'
}

export const HOTKEY_LABELS: Record<HotkeyAction, string> = {
  toggleOverlay: 'Show / hide',
  screenshot: 'Screenshot → ask Claude',
  toggleListening: 'Start / stop listening',
  toggleClickThrough: 'Click-through',
  suggestReply: 'What should I say?',
  moveUp: 'Move up',
  moveDown: 'Move down',
  moveLeft: 'Move left',
  moveRight: 'Move right'
}

export const DEFAULT_SYSTEM_PROMPT = `You are a discreet real-time assistant shown in a small overlay.
Be concise: lead with the answer, use short bullet points, and only add detail when asked.
When given a screenshot, focus on what the user most likely needs help with.`

export const DEFAULT_SETTINGS: Settings = {
  hotkeys: DEFAULT_HOTKEYS,
  model: 'claude-sonnet-5-5',
  systemPrompt: DEFAULT_SYSTEM_PROMPT,
  opacity: 0.86,
  transcriptMinutes: 5,
  overlayBounds: null
}

/** Pixels the overlay moves per Ctrl+Option+Arrow press. */
export const MOVE_STEP_PX = 40
