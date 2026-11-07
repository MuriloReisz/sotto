import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Speaker, View } from '../../shared/types'
import { AudioCapture } from './audio/capture'
import { ChatView } from './components/ChatView'
import { CommandBar } from './components/CommandBar'
import { HelpView, WelcomeView } from './components/Guide'
import { NotesView } from './components/NotesView'
import { PanelHeader } from './components/PanelHeader'
import { SettingsPanel } from './components/SettingsPanel'
import { TranscriptView } from './components/TranscriptView'
import { useOverlayState, useSettings, useToasts } from './hooks'

// Layout: the command bar, then (when a view is open) the panel, then toasts. The whole
// stack is measured and the window is resized to fit it exactly.

export function App(): React.JSX.Element | null {
  const state = useOverlayState()
  const settings = useSettings()
  const toasts = useToasts()
  // undefined = "nothing chosen yet": first run then shows the welcome guide.
  const [chosenView, setView] = useState<View | null | undefined>(undefined)
  const view: View | null = chosenView === undefined ? (state && !state.onboarded ? 'welcome' : null) : chosenView
  const [levels, setLevels] = useState<Record<Speaker, number>>({ me: 0, them: 0 })
  /** Shown while capture waits on a macOS permission prompt. */
  const [audioNotice, setAudioNotice] = useState<string | null>(null)
  const stackRef = useRef<HTMLDivElement>(null)
  const pendingFocus = useRef<HTMLElement | null>(null)
  const capture = useRef<AudioCapture | null>(null)
  /** The capture session main last started; every status we send names it. */
  const sessionId = useRef(0)

  // The main process can ask for a view (hotkeys, errors).
  useEffect(() => window.sotto.onShowView((v) => setView(v)), [])

  // Report our height so the window fits the content exactly (no invisible click-blocker).
  useLayoutEffect(() => {
    const el = stackRef.current
    if (!el) return
    const report = (): void => window.sotto.setHeight(Math.ceil(el.getBoundingClientRect().height) + 2)
    const observer = new ResizeObserver(report)
    observer.observe(el)
    report()
    return () => observer.disconnect()
  }, [state !== null]) // eslint-disable-line react-hooks/exhaustive-deps

  // Typing: the window is not focusable until you click a text field. Then we ask the
  // main process for focus and re-focus the field once it's granted.
  const onMouseDownCapture = (e: React.MouseEvent): void => {
    const target = e.target as HTMLElement
    if (target.closest('input, textarea, select') && !state?.typing) {
      pendingFocus.current = target.closest('input, textarea, select') as HTMLElement
      window.sotto.setTyping(true)
    }
  }
  useEffect(() => {
    if (!state?.typing) return
    const el = pendingFocus.current ?? document.querySelector<HTMLElement>('[data-autofocus]')
    pendingFocus.current = null
    // Wait a frame: the window becomes focusable asynchronously.
    requestAnimationFrame(() => el?.focus())
  }, [state?.typing])
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        ;(document.activeElement as HTMLElement | null)?.blur()
        window.sotto.setTyping(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Audio capture lives in the page (browser audio APIs); the main process says when.
  useEffect(
    () =>
      window.sotto.onAudioCommand(async (command) => {
        const id = command.id
        if (command.type === 'start') {
          sessionId.current = id
          capture.current ??= new AudioCapture({
            onChunk: (c) => window.sotto.sendAudioChunk(c),
            onLevel: setLevels,
            onSources: (update) => window.sotto.audioStatus({ id: sessionId.current, state: 'changed', ...update }),
            onNotice: setAudioNotice
          })
          try {
            const result = await capture.current.start()
            window.sotto.audioStatus({ id, state: 'started', ...result })
          } catch (error) {
            // 'cancelled' = you stopped listening while a permission prompt was open; already handled.
            if ((error as Error).message !== 'cancelled') {
              window.sotto.audioStatus({ id, state: 'error', microphone: false, systemAudio: false, message: (error as Error).message })
            }
          }
        } else {
          // A stop for an older session (main gave up on it) must not end the current one.
          if (id !== sessionId.current) return
          await capture.current?.stop()
          window.sotto.audioStatus({ id, state: 'stopped', microphone: false, systemAudio: false })
        }
      }),
    []
  )

  // Last effect, so every listener above is attached: main can now send hotkey commands
  // it held back while the page was loading (e.g. ⌘⇧A pressed right after launch).
  useEffect(() => window.sotto.uiReady(), [])

  if (!state) return null

  const toggleView = (v: View): void => setView(view === v ? null : v)

  return (
    <div
      className={`stack ${state.clickThrough ? 'is-click-through' : ''}`}
      ref={stackRef}
      onMouseDownCapture={onMouseDownCapture}
      style={{ '--glass-alpha': state.opacity } as React.CSSProperties}
    >
      <CommandBar state={state} view={view} levels={levels} notice={audioNotice} onToggleView={toggleView} onOpenView={setView} />

      {view && (
        <section className="panel" aria-label="Sotto panel">
          {view !== 'welcome' && <PanelHeader view={view} onView={setView} onClose={() => setView(null)} />}
          {view === 'chat' && <ChatView state={state} />}
          {view === 'transcript' && <TranscriptView state={state} notice={audioNotice} />}
          {view === 'notes' && <NotesView state={state} />}
          {view === 'settings' && settings && <SettingsPanel settings={settings} state={state} onHelp={() => setView('help')} />}
          {view === 'help' && <HelpView state={state} />}
          {view === 'welcome' && settings && <WelcomeView state={state} settings={settings} onDone={() => setView(null)} />}
        </section>
      )}

      {toasts.length > 0 && (
        <div className="toasts" aria-live="polite">
          {toasts.map((t) => (
            <div key={t.id} className={`toast toast-${t.kind}`}>
              {t.text}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
