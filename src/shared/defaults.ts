import type { HotkeyAction, Hotkeys, ModelId, QuickAction, Settings } from './types'

// Electron accelerator syntax: https://www.electronjs.org/docs/latest/api/accelerator
// "CommandOrControl" = Cmd on macOS, Ctrl on Windows. "Alt" = Option on macOS.
export const DEFAULT_HOTKEYS: Hotkeys = {
  toggleOverlay: 'CommandOrControl+Shift+Space',
  screenshot: 'CommandOrControl+Shift+S',
  toggleListening: 'CommandOrControl+Shift+A',
  focusChat: 'CommandOrControl+Shift+K',
  toggleClickThrough: 'CommandOrControl+Shift+C',
  suggestReply: 'CommandOrControl+Shift+Enter',
  // Ctrl+Option+Arrows rather than Cmd+Arrows: a global Cmd+Left/Right would break
  // "jump to line start/end" in every other app while Sotto is running.
  moveUp: 'Control+Alt+Up',
  moveDown: 'Control+Alt+Down',
  moveLeft: 'Control+Alt+Left',
  moveRight: 'Control+Alt+Right'
}

export const HOTKEY_LABELS: Record<HotkeyAction, string> = {
  toggleOverlay: 'Show or hide Sotto',
  screenshot: 'Ask about your screen',
  toggleListening: 'Start or stop listening',
  focusChat: 'Type a question',
  toggleClickThrough: 'Let clicks pass through',
  suggestReply: 'What should I say?',
  moveUp: 'Move up',
  moveDown: 'Move down',
  moveLeft: 'Move left',
  moveRight: 'Move right'
}

export const MODELS: { id: ModelId; label: string; hint: string }[] = [
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5', hint: 'Fast and capable (recommended)' },
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5', hint: 'Smartest, a little slower' },
  { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5', hint: 'Fastest and cheapest' }
]

export const QUICK_ACTIONS: Record<QuickAction, { label: string; prompt: string }> = {
  whatToSay: {
    label: 'What should I say?',
    prompt:
      'Based on the live conversation, what should I say next? Give me one or two short, natural replies I can say out loud, then one line on why.'
  },
  followUps: {
    label: 'Follow-up questions',
    prompt: 'Suggest three sharp follow-up questions I could ask right now, given the conversation so far.'
  },
  factCheck: {
    label: 'Fact check',
    prompt:
      'Fact-check the most recent claims in the conversation. List anything that looks wrong or doubtful, with the correction. Say plainly if everything checks out.'
  },
  recap: {
    label: 'Recap',
    prompt: 'Recap the conversation so far in five bullet points or fewer, including any open questions.'
  }
}

export const SCREEN_PROMPT =
  "Help me with what's on my screen. Work out what I'm most likely doing or stuck on, and give me the answer or next step directly."

export const DEFAULT_SETTINGS: Settings = {
  hotkeys: DEFAULT_HOTKEYS,
  model: 'claude-sonnet-5-5',
  customInstructions: '',
  aboutMe: '',
  opacity: 0.9,
  transcriptMinutes: 5,
  notesFolder: '',
  whisperModelPath: '',
  removeEcho: true,
  overlayPosition: null,
  onboarded: false
}

/** Pixels the overlay moves per Ctrl+Option+Arrow press. */
export const MOVE_STEP_PX = 40

/** Fixed overlay width; the height follows the content. */
export const OVERLAY_WIDTH = 700

/** Meetings shorter than this many transcribed words don't get automatic notes. */
export const MIN_WORDS_FOR_NOTES = 40
