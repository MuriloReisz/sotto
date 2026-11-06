import { HOTKEY_LABELS } from '../../../shared/defaults'
import { formatAccelerator } from '../../../shared/hotkey-format'
import type { HotkeyAction, OverlayState, SettingsView } from '../../../shared/types'
import { ApiKeyField } from './SettingsPanel'

// First-run welcome and the always-available help page.

const MAIN_KEYS: HotkeyAction[] = ['toggleOverlay', 'screenshot', 'toggleListening', 'suggestReply', 'focusChat', 'toggleClickThrough']

function ShortcutList({ state, actions }: { state: OverlayState; actions: HotkeyAction[] }): React.JSX.Element {
  return (
    <dl className="shortcuts">
      {actions.map((a) => (
        <div key={a} className="shortcut">
          <dt>{HOTKEY_LABELS[a]}</dt>
          <dd>
            <kbd>{formatAccelerator(state.hotkeys[a], state.platform)}</kbd>
          </dd>
        </div>
      ))}
      <div className="shortcut">
        <dt>Move Sotto</dt>
        <dd>
          <kbd>{formatAccelerator(state.hotkeys.moveUp, state.platform).replace('↑', '')} + arrows</kbd>
        </dd>
      </div>
    </dl>
  )
}

export function WelcomeView({ state, settings, onDone }: { state: OverlayState; settings: SettingsView; onDone: () => void }): React.JSX.Element {
  const finish = (): void => {
    void window.sotto.updateSettings({ onboarded: true })
    onDone()
  }
  return (
    <div className="welcome">
      <h2 className="welcome-title">Help on cue, out of sight.</h2>
      <p className="welcome-lead">
        Sotto sits on top of everything but is left out of screen shares and recordings. It can read your screen, listen to
        your calls and write the meeting notes afterwards.
      </p>

      <ol className="steps">
        <li>
          <h3>Add your Anthropic API key</h3>
          {state.fakeModel && !settings.hasApiKey ? (
            <p className="hint">Test mode is on, so Sotto works without a key for now.</p>
          ) : (
            <ApiKeyField hasKey={settings.hasApiKey} />
          )}
        </li>
        <li>
          <h3>Learn the shortcuts</h3>
          <ShortcutList state={state} actions={MAIN_KEYS.slice(0, 4)} />
        </li>
        <li>
          <h3>Say yes when asked</h3>
          <p className="hint">
            {state.platform === 'darwin'
              ? 'macOS asks for Screen Recording the first time you ask about your screen, and for the Microphone and system audio the first time you listen.'
              : 'Windows asks for the microphone the first time you listen.'}{' '}
            Use headphones on calls so your mic doesn’t pick up the other side.
          </p>
        </li>
      </ol>

      <div className="row-end">
        <button type="button" className="btn btn-primary" onClick={finish}>
          Start using Sotto
        </button>
      </div>
    </div>
  )
}

export function HelpView({ state }: { state: OverlayState }): React.JSX.Element {
  return (
    <div className="help">
      <ShortcutList state={state} actions={MAIN_KEYS} />

      <h3>How it works</h3>
      <ul className="plain-list">
        <li>Clicking Sotto doesn’t take focus from the app you’re in. Click a text box when you want to type; Esc gives focus back.</li>
        <li>Listening transcribes your mic as “Me” and your computer’s audio as “Them”, on this computer.</li>
        <li>When you stop listening, Sotto writes meeting notes and a follow-up email into the Notes tab.</li>
        <li>Everything you add under Settings → About you and Your files is used in every answer.</li>
      </ul>

      <h3>What stays hidden, and what doesn’t</h3>
      <ul className="plain-list">
        <li>Hidden from screen shares and recordings, the Dock and the app switcher.</li>
        <li>Not hidden from software on this computer that lists running apps, from cameras, or from the menu bar icon in full-screen shares.</li>
        <li>Screenshots and transcript text are sent to Anthropic when you ask a question. Audio is not.</li>
      </ul>
    </div>
  )
}
