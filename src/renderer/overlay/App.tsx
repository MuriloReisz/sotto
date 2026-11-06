import { HOTKEY_LABELS } from '../../shared/defaults'
import { formatAccelerator } from '../../shared/hotkey-format'
import type { HotkeyAction, OverlayState } from '../../shared/types'
import { useOverlayState, useToasts } from './useOverlayState'

// M1 overlay: a status header plus a hotkey cheat sheet. The response view, chat
// panel and transcript drawer slot into <main> in later milestones.

const MAIN_ACTIONS: HotkeyAction[] = [
  'toggleOverlay',
  'screenshot',
  'toggleListening',
  'suggestReply',
  'toggleClickThrough'
]

export function App(): React.JSX.Element {
  const state = useOverlayState()
  const toasts = useToasts()
  if (!state) return <div className="card" />

  return (
    <div className={`card ${state.clickThrough ? 'is-click-through' : ''}`}>
      <Header state={state} />

      <main className="body">
        <p className="lead">Ready. Use a shortcut, or keep working: I stay on top.</p>
        <HotkeyList state={state} />
        {state.hotkeyErrors.length > 0 && (
          <section className="errors" role="alert">
            <h2>Shortcuts that didn't register</h2>
            {state.hotkeyErrors.map((e) => (
              <p key={e.action}>
                <strong>{HOTKEY_LABELS[e.action]}</strong> <kbd>{formatAccelerator(e.accelerator, state.platform)}</kbd>
                : {e.reason}
              </p>
            ))}
          </section>
        )}
      </main>

      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.kind}`}>
            {t.text}
          </div>
        ))}
      </div>
    </div>
  )
}

function Header({ state }: { state: OverlayState }): React.JSX.Element {
  const key = (action: HotkeyAction): string => formatAccelerator(state.hotkeys[action], state.platform)
  return (
    <header className="header">
      <span className="brand">
        <span className="logo" aria-hidden />
        Veil
      </span>
      <span className="pills">
        <span
          className={`pill ${state.contentProtected ? 'pill-ok' : 'pill-warn'}`}
          title="Content protection is on. Some macOS 15+ capture tools may ignore it; see README."
        >
          {state.contentProtected ? 'Protected' : 'Not protected'}
        </span>
        {state.clickThrough && (
          <span className="pill pill-amber" title={`Mouse passes through. ${key('toggleClickThrough')} to interact.`}>
            Click-through
          </span>
        )}
        {state.listening && <span className="pill pill-live">Listening</span>}
      </span>
      <span className="actions">
        <button
          type="button"
          className="icon-btn"
          onClick={() => window.veil.toggleClickThrough()}
          title={`Click-through (${key('toggleClickThrough')})`}
          aria-label="Toggle click-through"
        >
          ⇣
        </button>
        <button
          type="button"
          className="icon-btn"
          onClick={() => window.veil.hideOverlay()}
          title={`Hide (${key('toggleOverlay')})`}
          aria-label="Hide overlay"
        >
          ×
        </button>
      </span>
    </header>
  )
}

function HotkeyList({ state }: { state: OverlayState }): React.JSX.Element {
  const move = formatAccelerator(state.hotkeys.moveUp, state.platform).replace('↑', '')
  return (
    <dl className="hotkeys">
      {MAIN_ACTIONS.map((action) => (
        <div key={action} className="hotkey">
          <dt>{HOTKEY_LABELS[action]}</dt>
          <dd>
            <kbd>{formatAccelerator(state.hotkeys[action], state.platform)}</kbd>
          </dd>
        </div>
      ))}
      <div className="hotkey">
        <dt>Move overlay</dt>
        <dd>
          <kbd>{move}+arrows</kbd>
        </dd>
      </div>
    </dl>
  )
}
