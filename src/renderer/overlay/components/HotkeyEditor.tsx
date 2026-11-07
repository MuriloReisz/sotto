import { useEffect, useRef, useState } from 'react'
import { DEFAULT_HOTKEYS } from '../../../shared/defaults'
import { formatAccelerator, formatMoveHotkeys } from '../../../shared/hotkey-format'
import { HOTKEY_SLOTS, SLOT_LABELS, readKeyPress, slotActions } from '../../../shared/hotkey-rules'
import type { HotkeyAction, HotkeyResult, HotkeySlot, OverlayState } from '../../../shared/types'

// Settings → Shortcuts. "Change" records the next key combination. While recording, the
// main process pauses Sotto's own hotkeys and gives the overlay keyboard focus; any way
// the recording ends (saved, Esc, a click elsewhere, the overlay losing focus, the panel
// closing, main's own timeout) runs the effect cleanup below, which tells main to restore both.

export function HotkeyEditor({ state }: { state: OverlayState }): React.JSX.Element {
  const { platform, hotkeys, hotkeyErrors } = state
  const [recording, setRecording] = useState<HotkeySlot | null>(null)
  /** Modifiers held so far (or the combo being saved), as an accelerator. */
  const [held, setHeld] = useState('')
  const [error, setError] = useState<{ slot: HotkeySlot; text: string } | null>(null)
  const typingAtStart = useRef(false)

  const start = (slot: HotkeySlot): void => {
    typingAtStart.current = state.typing
    setError(null)
    setHeld('')
    setRecording(slot)
  }

  useEffect(() => {
    if (!recording) return
    const slot = recording
    let sawTyping = typingAtStart.current
    let saving = false
    const end = (): void => {
      setRecording(null)
      setHeld('')
    }

    const save = async (accelerator: string): Promise<void> => {
      saving = true
      setHeld(accelerator)
      let result: HotkeyResult
      try {
        result = await window.sotto.setHotkey(slot, accelerator)
      } catch {
        result = { ok: false, error: 'The shortcut could not be saved.' }
      }
      saving = false
      if (result.ok) return end()
      setHeld('')
      setError({ slot, text: result.error ?? 'The shortcut could not be saved.' })
    }

    // Capture phase on window: runs before React's handlers and the app-wide Esc handler.
    const onKeyDown = (e: KeyboardEvent): void => {
      e.preventDefault()
      e.stopPropagation()
      if (e.repeat || saving) return
      const reading = readKeyPress(e, platform)
      if (reading.kind === 'cancel') end()
      else if (reading.kind === 'clear') void save('')
      else if (reading.kind === 'modifiers') setHeld(reading.modifiers)
      else if (reading.kind === 'invalid') setError({ slot, text: reading.error })
      else {
        setError(null)
        void save(reading.accelerator)
      }
    }
    const onKeyUp = (e: KeyboardEvent): void => {
      e.preventDefault()
      e.stopPropagation()
      const reading = readKeyPress(e, platform)
      if (!saving && reading.kind === 'modifiers') setHeld(reading.modifiers)
    }
    const onMouseDown = (e: MouseEvent): void => {
      if (!(e.target as HTMLElement | null)?.closest('.hotkey-row.is-recording')) end()
    }
    const focusRow = (): void => {
      requestAnimationFrame(() => document.querySelector<HTMLElement>('.hotkey-row.is-recording button')?.focus())
    }

    // Typing mode ending (blur, hide, timeout in main) ends the recording too.
    const offState = window.sotto.onStateChanged((s) => {
      if (s.typing && !sawTyping) {
        sawTyping = true
        focusRow()
      } else if (!s.typing && sawTyping) end()
    })
    // Main ended the recording itself (its timeout, or the overlay lost focus).
    const offEnded = window.sotto.onHotkeyRecordEnded(end)
    window.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('keyup', onKeyUp, true)
    window.addEventListener('mousedown', onMouseDown, true)
    window.sotto.recordHotkey(true)
    focusRow()

    return () => {
      offState()
      offEnded()
      window.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('keyup', onKeyUp, true)
      window.removeEventListener('mousedown', onMouseDown, true)
      window.sotto.recordHotkey(false)
    }
  }, [recording, platform])

  const isDefault = (Object.keys(DEFAULT_HOTKEYS) as HotkeyAction[]).every((a) => hotkeys[a] === DEFAULT_HOTKEYS[a])

  return (
    <>
      <div className="hotkeys" role="list">
        {HOTKEY_SLOTS.map((slot) => {
          const label = SLOT_LABELS[slot]
          const isRecording = recording === slot
          const current = slot === 'move' ? formatMoveHotkeys(hotkeys, platform) : formatAccelerator(hotkeys[slot], platform)
          const failed = hotkeyErrors.find((e) => slotActions(slot).includes(e.action))
          const rowError = error?.slot === slot ? error.text : null
          return (
            <div key={slot} role="listitem" className={`hotkey-row ${isRecording ? 'is-recording' : ''}`}>
              <span className="hotkey-name">{label}</span>
              <span className="hotkey-keys">
                {isRecording ? (
                  <kbd className="is-live">{held ? `${formatAccelerator(held, platform)}…` : 'Press keys…'}</kbd>
                ) : current ? (
                  <kbd>{current}</kbd>
                ) : (
                  <span className="hotkey-unset">Not set</span>
                )}
              </span>
              {isRecording ? (
                <button type="button" className="btn btn-small" onClick={() => setRecording(null)}>
                  Cancel
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn-small"
                  disabled={recording !== null}
                  onClick={() => start(slot)}
                  aria-label={`Change shortcut: ${label}`}
                >
                  Change
                </button>
              )}
              {rowError && <p className="hotkey-note is-error">{rowError}</p>}
              {isRecording ? (
                <p className="hotkey-note" aria-live="polite">
                  {slot === 'move' ? 'Hold the modifiers and press any arrow.' : 'Press the new shortcut.'} Esc cancels, Delete
                  clears it.
                </p>
              ) : (
                failed &&
                !rowError && <p className="hotkey-note is-error">Not working: {failed.reason.toLowerCase()}. Pick another.</p>
              )}
            </div>
          )
        })}
      </div>
      <div className="btn-row">
        <button
          type="button"
          className="link-btn"
          disabled={recording !== null || isDefault}
          onClick={() => {
            setError(null)
            void window.sotto.resetHotkeys()
          }}
        >
          Reset to defaults
        </button>
      </div>
    </>
  )
}
