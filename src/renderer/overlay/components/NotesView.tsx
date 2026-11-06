import { useEffect, useMemo, useState } from 'react'
import type { MeetingDetail, OverlayState } from '../../../shared/types'
import { useMeetings } from '../hooks'
import { Icon } from './Icon'
import { Markdown } from './Markdown'

export function NotesView({ state }: { state: OverlayState }): React.JSX.Element {
  const meetings = useMeetings()
  const [query, setQuery] = useState('')
  const [question, setQuestion] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? meetings.filter((m) => `${m.title} ${m.preview}`.toLowerCase().includes(q)) : meetings
  }, [meetings, query])

  if (openId) return <MeetingDetailView id={openId} onBack={() => setOpenId(null)} />

  const ask = (): void => {
    if (!question.trim()) return
    window.sotto.askMeetings(question)
    setQuestion('')
    window.sotto.setTyping(false)
  }

  return (
    <div className="notes">
      <div className="ask-past">
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && ask()}
          placeholder="Ask about past meetings, e.g. what did I promise Acme?"
          aria-label="Ask about past meetings"
        />
        <button type="button" className="btn btn-primary" onClick={ask} disabled={!question.trim() || meetings.length === 0}>
          Ask
        </button>
      </div>

      {state.notesStatus === 'writing' && <p className="notice">Writing notes for the last meeting…</p>}

      {meetings.length === 0 ? (
        <div className="empty">
          <p className="empty-title">No meeting notes yet.</p>
          <p>
            Start listening on a call. When you stop, Sotto writes a summary, decisions, action items and a follow-up email,
            and saves them here as a markdown file you own.
          </p>
        </div>
      ) : (
        <>
          <label className="search">
            <Icon name="search" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter meetings" aria-label="Filter meetings" />
          </label>
          <ul className="meeting-list">
            {shown.map((m) => (
              <li key={m.id}>
                <button type="button" className="meeting" onClick={() => setOpenId(m.id)}>
                  <span className="meeting-title">{m.title}</span>
                  <span className="meeting-meta">
                    {formatDate(m.date)}
                    {m.durationMin ? `, ${m.durationMin} min` : ''}
                  </span>
                  {m.preview && <span className="meeting-preview">{m.preview}</span>}
                </button>
              </li>
            ))}
            {shown.length === 0 && <li className="empty-line">No meeting matches “{query}”.</li>}
          </ul>
        </>
      )}
      <div className="row-end">
        <button type="button" className="link-btn" onClick={() => window.sotto.openNotesFolder()}>
          Open notes folder
        </button>
      </div>
    </div>
  )
}

function MeetingDetailView({ id, onBack }: { id: string; onBack: () => void }): React.JSX.Element {
  const [meeting, setMeeting] = useState<MeetingDetail | null | undefined>(undefined)
  useEffect(() => {
    void window.sotto.readMeeting(id).then(setMeeting)
  }, [id])

  if (meeting === undefined) return <p className="empty-line">Loading…</p>
  if (meeting === null) return <p className="empty-line">This meeting file no longer exists.</p>

  const [notes, transcript] = splitTranscript(meeting.markdown)
  return (
    <div className="meeting-detail">
      <div className="detail-actions">
        <button type="button" className="link-btn" onClick={onBack}>
          All meetings
        </button>
        <span className="spacer" />
        <button type="button" className="btn" onClick={() => window.sotto.copyText(meeting.followUpEmail.replace(/\*\*/g, ''))}>
          <Icon name="copy" size={14} /> Copy follow-up email
        </button>
        <button type="button" className="btn" onClick={() => window.sotto.openMeeting(meeting.id)}>
          <Icon name="open" size={14} /> Open file
        </button>
      </div>
      <div className="detail-body">
        <Markdown text={notes} />
        {transcript && (
          <details className="detail-transcript">
            <summary>Full transcript</summary>
            <pre>{transcript}</pre>
          </details>
        )}
      </div>
    </div>
  )
}

function splitTranscript(markdown: string): [string, string] {
  const i = markdown.indexOf('\n## Transcript')
  if (i === -1) return [markdown, '']
  const transcript = markdown.slice(i).replace(/^\n## Transcript\s*/, '').replace(/^```text\n?|```\s*$/gm, '').trim()
  return [markdown.slice(0, i), transcript]
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
}
