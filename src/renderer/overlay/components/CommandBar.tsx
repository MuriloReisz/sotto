import { describeSources } from '../../../shared/audio-health'
import { formatAccelerator } from '../../../shared/hotkey-format'
import type { HotkeyAction, OverlayState, Speaker, View } from '../../../shared/types'
import { useElapsed } from '../hooks'
import { Icon } from './Icon'

// The always-visible bar. Also the drag handle for moving the overlay with the mouse.

interface Props {
  state: OverlayState
  view: View | null
  levels: Record<Speaker, number>
  /** Capture is waiting on a macOS permission prompt. */
  notice: string | null
  onToggleView: (view: View) => void
  onOpenView: (view: View) => void
}

export function CommandBar({ state, view, levels, notice, onToggleView, onOpenView }: Props): React.JSX.Element {
  const key = (action: HotkeyAction): string => formatAccelerator(state.hotkeys[action], state.platform)
  /** "Label (⌘⇧S)", or just "Label" when the shortcut is not set. */
  const hint = (label: string, action: HotkeyAction): string => (key(action) ? `${label} (${key(action)})` : label)
  const listening = state.listening
  const elapsed = useElapsed(listening?.since ?? null)
  const clock = `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, '0')}`

  return (
    <header className="bar">
      <span className="brand" title="Sotto">
        <span className="brand-mark" aria-hidden />
        <span className="brand-name">Sotto</span>
      </span>

      <nav className="bar-actions" aria-label="Actions">
        <button type="button" className="bar-btn" onClick={() => window.sotto.askScreen()} title={hint('Ask about your screen', 'screenshot')}>
          <Icon name="screen" />
          <span>Ask screen</span>
          {key('screenshot') && <kbd>{key('screenshot')}</kbd>}
        </button>

        <button
          type="button"
          className={`bar-btn listen ${listening ? 'is-live' : ''}`}
          onClick={() => window.sotto.toggleListening()}
          title={
            listening
              ? `${describeSources(listening.microphone, listening.systemAudio)} ${hint('Stop listening', 'toggleListening')}`
              : (notice ?? hint('Start listening', 'toggleListening'))
          }
          aria-pressed={Boolean(listening)}
        >
          {listening ? <Meter levels={levels} /> : <Icon name="mic" />}
          <span>{listening ? clock : notice ? 'Waiting…' : 'Listen'}</span>
          {!listening && key('toggleListening') && <kbd>{key('toggleListening')}</kbd>}
        </button>

        <button
          type="button"
          className={`bar-btn ${view === 'chat' ? 'is-open' : ''}`}
          onClick={() => {
            onOpenView('chat')
            window.sotto.setTyping(true)
          }}
          title={hint('Type a question', 'focusChat')}
        >
          <Icon name="chat" />
          <span>Chat</span>
        </button>

        <button
          type="button"
          className={`bar-btn ${view === 'notes' ? 'is-open' : ''}`}
          onClick={() => onToggleView('notes')}
          title="Meeting notes"
        >
          <Icon name="notes" />
          <span>{state.notesStatus === 'writing' ? 'Writing…' : 'Notes'}</span>
        </button>
      </nav>

      <span className="bar-end">
        {state.fakeModel && (
          <span className="tag" title="Answers come from a built-in fake model (SOTTO_FAKE_LLM=1).">
            Test mode
          </span>
        )}
        {state.clickThrough && (
          <span
            className="tag tag-amber"
            title={
              key('toggleClickThrough')
                ? `Clicks pass through. ${key('toggleClickThrough')} to interact again.`
                : `Clicks pass through. Turn it off from the Sotto icon in the ${state.platform === 'darwin' ? 'menu bar' : 'system tray'}.`
            }
          >
            Click-through
          </span>
        )}
        <button type="button" className="icon-btn" onClick={() => onToggleView('settings')} title="Settings" aria-label="Settings">
          <Icon name="gear" />
        </button>
        <button type="button" className="icon-btn" onClick={() => window.sotto.hideOverlay()} title={hint('Hide', 'toggleOverlay')} aria-label="Hide Sotto">
          <Icon name="close" />
        </button>
      </span>
    </header>
  )
}

/** Live audio meter: two thin bars, you (sea-glass) and them (periwinkle). */
function Meter({ levels }: { levels: Record<Speaker, number> }): React.JSX.Element {
  return (
    <span className="meter" aria-hidden>
      <span className="meter-bar meter-me" style={{ transform: `scaleY(${0.15 + levels.me * 0.85})` }} />
      <span className="meter-bar meter-them" style={{ transform: `scaleY(${0.15 + levels.them * 0.85})` }} />
      <span className="meter-dot" />
    </span>
  )
}
