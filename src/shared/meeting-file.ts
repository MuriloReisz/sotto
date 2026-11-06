import type { MeetingDetail, MeetingNotes, MeetingSummary } from './types'

// Meeting notes are saved as plain markdown files with a small frontmatter header, so
// they open nicely in any editor (or Obsidian) and Sotto can list and search them later.

export interface MeetingMeta {
  title: string
  /** ISO date-time of the start of the meeting. */
  date: string
  durationMin: number
}

const FENCE = '---'

/** Safe, readable file name: "2026-11-06 14-05 Pricing call with Acme.md". */
export function meetingFileName(meta: MeetingMeta): string {
  const d = new Date(meta.date)
  const pad = (n: number): string => String(n).padStart(2, '0')
  const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}-${pad(d.getMinutes())}`
  const title = meta.title.replace(/[\\/:*?"<>|\n\r]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Meeting'
  return `${stamp} ${title}.md`
}

const list = (items: string[], empty: string): string =>
  items.length ? items.map((i) => `- ${i}`).join('\n') : `_${empty}_`

/** Build the full markdown file for a meeting. */
export function buildMeetingMarkdown(meta: MeetingMeta, notes: MeetingNotes, transcript: string): string {
  const actions = notes.actionItems.length
    ? notes.actionItems
        .map((a) => `- [ ] **${a.owner || 'Unassigned'}**: ${a.task}${a.due ? ` (due ${a.due})` : ''}`)
        .join('\n')
    : '_No action items._'
  return [
    FENCE,
    `title: ${JSON.stringify(meta.title)}`,
    `date: ${meta.date}`,
    `duration_min: ${meta.durationMin}`,
    `source: sotto`,
    FENCE,
    '',
    `# ${meta.title}`,
    '',
    '## Summary',
    notes.summary.trim(),
    '',
    '## Key points',
    list(notes.keyPoints, 'None noted.'),
    '',
    '## Decisions',
    list(notes.decisions, 'No decisions recorded.'),
    '',
    '## Action items',
    actions,
    '',
    '## Follow-up email',
    `**Subject:** ${notes.followUpEmail.subject}`,
    '',
    notes.followUpEmail.body.trim(),
    '',
    '## Transcript',
    '',
    '```text',
    transcript.trim() || '(empty)',
    '```',
    ''
  ].join('\n')
}

/** Read the frontmatter + sections back out of a meeting file. Tolerates hand edits. */
export function parseMeetingMarkdown(id: string, markdown: string): MeetingDetail {
  const meta: Record<string, string> = {}
  let body = markdown
  if (markdown.startsWith(FENCE)) {
    const end = markdown.indexOf(`\n${FENCE}`, FENCE.length)
    if (end !== -1) {
      for (const line of markdown.slice(FENCE.length, end).split('\n')) {
        const m = line.match(/^(\w+):\s*(.*)$/)
        if (m) meta[m[1]] = m[2]
      }
      body = markdown.slice(end + FENCE.length + 1).replace(/^\n+/, '')
    }
  }
  const title = parseTitle(meta.title) ?? body.match(/^# (.+)$/m)?.[1] ?? id.replace(/\.md$/, '')
  const summary = section(body, 'Summary')
  return {
    id,
    title,
    date: meta.date ?? '',
    durationMin: Number(meta.duration_min) || 0,
    preview: summary.split('\n').find((l) => l.trim())?.trim() ?? '',
    markdown: body,
    followUpEmail: section(body, 'Follow-up email')
  }
}

export function toSummary(detail: MeetingDetail): MeetingSummary {
  const { id, title, date, durationMin, preview } = detail
  return { id, title, date, durationMin, preview }
}

/** The notes part of a meeting (everything before the transcript), for past-meeting Q&A. */
export function notesWithoutTranscript(markdown: string): string {
  const i = markdown.indexOf('\n## Transcript')
  return (i === -1 ? markdown : markdown.slice(0, i)).trim()
}

function parseTitle(raw: string | undefined): string | undefined {
  if (!raw) return undefined
  try {
    return String(JSON.parse(raw))
  } catch {
    return raw
  }
}

function section(body: string, heading: string): string {
  const re = new RegExp(`^## ${heading}\\s*$`, 'm')
  const m = re.exec(body)
  if (!m) return ''
  const rest = body.slice(m.index + m[0].length)
  const next = rest.search(/^## /m)
  return (next === -1 ? rest : rest.slice(0, next)).trim()
}
