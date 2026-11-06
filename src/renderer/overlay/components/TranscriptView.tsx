import { useEffect, useRef } from 'react'
import { formatAccelerator } from '../../../shared/hotkey-format'
import type { OverlayState, TranscriptSegment } from '../../../shared/types'
import { useTranscript } from '../hooks'

export function TranscriptView({ state }: { state: OverlayState }): React.JSX.Element {
  const segments = useTranscript()
  const listRef = useRef<HTMLDivElement>(null)
  const listenKey = formatAccelerator(state.hotkeys.toggleListening, state.platform)
  const suggestKey = formatAccelerator(state.hotkeys.suggestReply, state.platform)

  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [segments])

  const sources = state.listening
    ? [state.listening.microphone && 'your microphone', state.listening.systemAudio && 'your computer’s audio'].filter(Boolean).join(' and ')
    : ''

  return (
    <div className="transcript">
      <p className="transcript-status">
        {state.listening ? (
          <>
            <span className="live-dot" /> Listening to {sources}. Press <kbd>{suggestKey}</kbd> for a reply suggestion.
          </>
        ) : segments.length > 0 ? (
          <>Last session. Press <kbd>{listenKey}</kbd> to start a new one.</>
        ) : (
          <>Press <kbd>{listenKey}</kbd> to start listening. Speech is transcribed on this computer.</>
        )}
      </p>
      <div className="transcript-list" ref={listRef}>
        {segments.length === 0 ? (
          <p className="empty-line">{state.listening ? 'Waiting for someone to speak…' : 'Nothing transcribed yet.'}</p>
        ) : (
          merge(segments).map((line) => (
            <p key={line.id} className={`line line-${line.speaker}`}>
              <span className="who">{line.speaker === 'me' ? 'Me' : 'Them'}</span>
              <span className="said">{line.text}</span>
            </p>
          ))
        )}
      </div>
      {!state.listening && segments.length > 0 && (
        <div className="row-end">
          <button type="button" className="btn" disabled={state.notesStatus === 'writing'} onClick={() => window.sotto.writeNotes()}>
            {state.notesStatus === 'writing' ? 'Writing notes…' : 'Write meeting notes'}
          </button>
        </div>
      )}
    </div>
  )
}

/** Consecutive lines from the same speaker read as one paragraph. */
function merge(segments: TranscriptSegment[]): TranscriptSegment[] {
  const out: TranscriptSegment[] = []
  for (const s of segments) {
    const last = out[out.length - 1]
    if (last && last.speaker === s.speaker && s.at - last.at < 30_000) out[out.length - 1] = { ...last, text: `${last.text} ${s.text}` }
    else out.push(s)
  }
  return out
}
