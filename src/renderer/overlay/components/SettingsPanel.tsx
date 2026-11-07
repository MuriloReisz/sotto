import { useState } from 'react'
import { MODELS } from '../../../shared/defaults'
import { MAX_TEXT } from '../../../shared/settings-schema'
import type { OverlayState, Settings, SettingsView } from '../../../shared/types'
import { HotkeyEditor } from './HotkeyEditor'
import { Icon } from './Icon'

// Settings, grouped by what you're trying to do. Text fields save when you leave them.

export function SettingsPanel({ settings, state, onHelp }: { settings: SettingsView; state: OverlayState; onHelp: () => void }): React.JSX.Element {
  const update = (patch: Partial<Settings>): void => void window.sotto.updateSettings(patch)
  const isMac = state.platform === 'darwin'

  return (
    <div className="settings">
      <Section title="Anthropic API key" hint="Stored encrypted on this computer. It never leaves Sotto except to talk to Anthropic.">
        <ApiKeyField hasKey={settings.hasApiKey} />
      </Section>

      <Section title="Model">
        <div className="radio-list" role="radiogroup">
          {MODELS.map((m) => (
            <label key={m.id} className={`radio ${settings.model === m.id ? 'is-on' : ''}`}>
              <input type="radio" name="model" checked={settings.model === m.id} onChange={() => update({ model: m.id })} />
              <span className="radio-label">{m.label}</span>
              <span className="radio-hint">{m.hint}</span>
            </label>
          ))}
        </div>
      </Section>

      <Section title="About you" hint="Your role, company, what you sell, how you like to sound. Used in every answer.">
        <SavedTextarea key={settings.aboutMe} value={settings.aboutMe} onSave={(aboutMe) => update({ aboutMe })} placeholder="e.g. I run a small consultancy that builds AI automations for local businesses. I prefer short, friendly replies." />
      </Section>

      <Section title="Your files" hint="PDF, text or markdown: a CV, pricing sheet, product notes. Claude reads them in every conversation.">
        <ul className="file-list">
          {settings.contextFiles.map((f) => (
            <li key={f.name}>
              <span className="file-name">{f.name}</span>
              <span className="file-size">{f.sizeKb} KB</span>
              <button type="button" className="link-btn" onClick={() => void window.sotto.removeContextFile(f.name)}>
                Remove
              </button>
            </li>
          ))}
          {settings.contextFiles.length === 0 && <li className="empty-line">No files yet.</li>}
        </ul>
        <button type="button" className="btn" onClick={() => void window.sotto.addContextFiles()}>
          <Icon name="plus" size={14} /> Add files
        </button>
      </Section>

      <Section title="Custom instructions" hint="Anything Sotto should always do, e.g. “Answer in Portuguese” or “Keep replies under 3 lines”.">
        <SavedTextarea key={settings.customInstructions} value={settings.customInstructions} onSave={(customInstructions) => update({ customInstructions })} placeholder="Optional" />
      </Section>

      <Section title="Live transcription" hint="Runs on this computer with whisper.cpp, so call audio never leaves it.">
        <p className={`status ${settings.transcription.ready ? 'status-ok' : 'status-warn'}`}>
          {settings.transcription.ready ? `Ready: ${settings.transcription.detail}` : settings.transcription.detail}
        </p>
        <label className="inline-field">
          Call features use the last
          <select value={settings.transcriptMinutes} onChange={(e) => update({ transcriptMinutes: Number(e.target.value) })}>
            {[2, 5, 10, 15, 30].map((n) => (
              <option key={n} value={n}>
                {n} minutes
              </option>
            ))}
          </select>
          of the conversation.
        </label>
        <label className="inline-field">
          <input type="checkbox" checked={settings.removeEcho} onChange={(e) => update({ removeEcho: e.target.checked })} />
          Remove echo when you’re not wearing headphones
        </label>
      </Section>

      <Section title="Meeting notes" hint="Saved as markdown files you own.">
        <p className="path">{settings.notesFolderResolved}</p>
        <div className="btn-row">
          <button type="button" className="btn" onClick={() => void window.sotto.chooseNotesFolder()}>
            Change folder
          </button>
          <button type="button" className="btn" onClick={() => window.sotto.openNotesFolder()}>
            <Icon name="open" size={14} /> Open folder
          </button>
        </div>
      </Section>

      <Section title="Appearance">
        <label className="inline-field">
          Background
          <input
            type="range"
            min={0.5}
            max={1}
            step={0.05}
            value={settings.opacity}
            onChange={(e) => update({ opacity: Number(e.target.value) })}
            aria-label="Background opacity"
          />
          {Math.round(settings.opacity * 100)}%
        </label>
      </Section>

      <Section title="Shortcuts" hint="They work in every app, even when Sotto is hidden.">
        <HotkeyEditor state={state} />
      </Section>

      <Section
        title="Permissions"
        hint={isMac ? 'macOS asks the first time. If you said no, turn Sotto on here.' : 'Windows asks the first time.'}
      >
        <div className="btn-row">
          <button type="button" className="btn" onClick={() => window.sotto.openPermissionSettings('screen')}>
            Screen recording
          </button>
          <button type="button" className="btn" onClick={() => window.sotto.openPermissionSettings('microphone')}>
            Microphone
          </button>
          <button type="button" className="link-btn" onClick={onHelp}>
            Help
          </button>
        </div>
      </Section>
    </div>
  )
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <section className="setting">
      <h3>{title}</h3>
      {hint && <p className="hint">{hint}</p>}
      {children}
    </section>
  )
}

export function ApiKeyField({ hasKey }: { hasKey: boolean }): React.JSX.Element {
  const [key, setKey] = useState('')
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = async (): Promise<void> => {
    setChecking(true)
    setError(null)
    let problem: string | null
    try {
      problem = await window.sotto.setApiKey(key)
    } catch (e) {
      problem = e instanceof Error ? e.message : 'The key could not be saved.'
    } finally {
      setChecking(false)
    }
    if (problem) setError(problem)
    else {
      setKey('')
      window.sotto.setTyping(false)
    }
  }

  if (hasKey) {
    return (
      <div className="key-row">
        <p className="status status-ok">Key saved and verified.</p>
        <button type="button" className="link-btn" onClick={() => void window.sotto.clearApiKey()}>
          Remove key
        </button>
      </div>
    )
  }
  return (
    <>
      <div className="key-row">
        <input
          type="password"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && key && void save()}
          placeholder="sk-ant-…"
          aria-label="Anthropic API key"
          autoComplete="off"
          spellCheck={false}
        />
        <button type="button" className="btn btn-primary" onClick={() => void save()} disabled={!key || checking}>
          {checking ? 'Checking…' : 'Save key'}
        </button>
      </div>
      {error && <p className="status status-warn">{error}</p>}
      <p className="hint">Create one at console.anthropic.com → API keys.</p>
    </>
  )
}

/** Saves on blur. Callers pass `key={value}` so a value saved elsewhere resets the draft. */
function SavedTextarea({ value, onSave, placeholder }: { value: string; onSave: (v: string) => void; placeholder: string }): React.JSX.Element {
  const [draft, setDraft] = useState(value)
  return (
    <textarea
      className="field"
      rows={3}
      maxLength={MAX_TEXT}
      value={draft}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => draft !== value && onSave(draft)}
    />
  )
}
