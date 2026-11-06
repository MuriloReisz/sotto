import type Anthropic from '@anthropic-ai/sdk'
import { app, shell } from 'electron'
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { IPC } from '../../shared/ipc'
import {
  buildMeetingMarkdown,
  meetingFileName,
  notesWithoutTranscript,
  parseMeetingMarkdown,
  toSummary,
  type MeetingMeta
} from '../../shared/meeting-file'
import { formatTranscript } from '../../shared/transcript'
import type { MeetingDetail, MeetingNotes, MeetingSummary, TranscriptSegment } from '../../shared/types'
import { ask } from '../chat/conversation'
import { fallback, fakeModel, friendlyError, getClient } from '../llm/client'
import { fakeNotes } from '../llm/fake'
import { NOTES_SCHEMA, NOTES_SYSTEM, pastMeetingsContext } from '../llm/prompts'
import { sendToUi, setState, toast } from '../state'
import { getSettings } from '../store/settings'

// Meeting notes: written by Claude from the transcript when you stop listening, saved
// as markdown files you own (default: Documents/Sotto/Meetings), listed and searchable
// in the Notes tab, and usable as context for "ask about past meetings".

export function notesFolder(): string {
  return getSettings().notesFolder || join(app.getPath('documents'), 'Sotto', 'Meetings')
}

export async function writeMeetingNotes(segments: TranscriptSegment[], startedAt: number, endedAt: number): Promise<void> {
  const transcript = formatTranscript(segments)
  const meta = (title: string): MeetingMeta => ({
    title,
    date: new Date(startedAt).toISOString(),
    durationMin: Math.max(1, Math.round((endedAt - startedAt) / 60_000))
  })
  const client = getClient()
  if (!client && !fakeModel()) {
    saveMeeting(meta('Meeting transcript'), failedNotes('No Anthropic API key was set.'), transcript)
    toast('Transcript saved without notes: add your Anthropic API key in Settings.', 'error')
    return
  }
  setState({ notesStatus: 'writing' })
  try {
    const notes = client ? await requestNotes(client, transcript) : fakeNotes(transcript)
    const title = notes.title || 'Meeting'
    saveMeeting(meta(title), notes, transcript)
    toast(`Notes saved: ${title}`, 'success')
  } catch (error) {
    // Never lose a call: keep the transcript even when the notes can't be written.
    const reason = friendlyError(error)
    saveMeeting(meta('Meeting transcript (no notes)'), failedNotes(reason), transcript)
    toast(`Couldn’t write notes (${reason}). The transcript was saved in Notes.`, 'error')
  } finally {
    setState({ notesStatus: 'idle' })
  }
}

async function requestNotes(client: Anthropic, transcript: string): Promise<MeetingNotes> {
  const settings = getSettings()
  const response = await client.beta.messages.create({
    model: settings.model,
    max_tokens: 16_000,
    system: settings.aboutMe.trim() ? `${NOTES_SYSTEM}\n\nAbout the user:\n${settings.aboutMe.trim()}` : NOTES_SYSTEM,
    messages: [{ role: 'user', content: `<transcript>\n${transcript}\n</transcript>\n\nWrite the meeting notes.` }],
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: NOTES_SCHEMA } },
    ...fallback()
  })
  if (response.stop_reason === 'refusal') throw new Error('Claude declined to write notes for this meeting')
  if (response.stop_reason === 'max_tokens') throw new Error('the notes were cut off by the length limit')
  // If a fallback model took over mid-answer, only the text after the last switch is the answer.
  const lastFallback = response.content.map((b) => b.type).lastIndexOf('fallback')
  const text = response.content
    .slice(lastFallback + 1)
    .flatMap((b) => (b.type === 'text' ? [b.text] : []))
    .join('')
  return JSON.parse(text) as MeetingNotes
}

function failedNotes(reason: string): MeetingNotes {
  return {
    title: 'Meeting transcript',
    summary: `Sotto couldn’t write notes for this meeting: ${reason} The full transcript is below.`,
    keyPoints: [],
    decisions: [],
    actionItems: [],
    followUpEmail: { subject: '', body: '' }
  }
}

function saveMeeting(meta: MeetingMeta, notes: MeetingNotes, transcript: string): void {
  const folder = notesFolder()
  mkdirSync(folder, { recursive: true })
  const base = meetingFileName(meta)
  let name = base
  for (let n = 2; existsSync(join(folder, name)); n++) name = base.replace(/\.md$/, ` (${n}).md`)
  writeFileSync(join(folder, name), buildMeetingMarkdown(meta, notes, transcript))
  sendToUi(IPC.meetingsChanged)
}

/** Only Sotto's own files (frontmatter `source: sotto`), so a notes folder inside an
 *  Obsidian vault doesn't pull in unrelated notes. */
function isSottoFile(markdown: string): boolean {
  return markdown.startsWith('---') && /^source: sotto$/m.test(markdown.slice(0, 600))
}

function readAll(): MeetingDetail[] {
  const folder = notesFolder()
  let names: string[] = []
  try {
    names = readdirSync(folder).filter((n) => n.endsWith('.md'))
  } catch {
    return []
  }
  return names
    .map((name) => ({ name, markdown: readFileSync(join(folder, name), 'utf8') }))
    .filter((f) => isSottoFile(f.markdown))
    .map((f) => parseMeetingMarkdown(f.name, f.markdown))
    .sort((a, b) => (b.date || b.id).localeCompare(a.date || a.id))
}

export function listMeetings(): MeetingSummary[] {
  return readAll().map(toSummary)
}

/** A meeting id from the UI → a path inside the notes folder, or null. Only existing
 *  `.md` files directly in the folder are accepted (no "..", no other file types). */
function meetingPath(id: string): string | null {
  const name = basename(String(id))
  if (!name.endsWith('.md') || name !== String(id)) return null
  const path = join(notesFolder(), name)
  return existsSync(path) && statSync(path).isFile() ? path : null
}

export function readMeeting(id: string): MeetingDetail | null {
  const path = meetingPath(id)
  if (!path) return null
  const markdown = readFileSync(path, 'utf8')
  return isSottoFile(markdown) ? parseMeetingMarkdown(basename(path), markdown) : null
}

export function openMeeting(id: string): void {
  const path = meetingPath(id)
  if (path) void shell.openPath(path)
}

/** Answer a question using every saved meeting's notes (newest first, within a budget).
 *  A one-off question, so the large notes context isn't carried into later turns. */
export function askAboutMeetings(question: string): void {
  const meetings = readAll()
  if (meetings.length === 0) {
    toast('No saved meetings yet. Notes appear here after you listen to a call.', 'info')
    return
  }
  const context = pastMeetingsContext(
    meetings.map((m) => ({ title: m.title, date: m.date, notes: notesWithoutTranscript(m.markdown) }))
  )
  void ask({ text: question, label: `Past meetings (${context.included})`, extra: context.text, oneOff: true, effort: 'medium' })
}
