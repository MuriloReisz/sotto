import { describe, expect, it } from 'vitest'
import {
  buildMeetingMarkdown,
  meetingFileName,
  notesWithoutTranscript,
  parseMeetingMarkdown
} from '../src/shared/meeting-file'
import type { MeetingNotes } from '../src/shared/types'

const meta = { title: 'Pricing call: Acme / Q4', date: new Date(2026, 10, 6, 14, 5).toISOString(), durationMin: 23 }
const notes: MeetingNotes = {
  title: meta.title,
  summary: 'Acme wants 40 seats.\nThey need SSO.',
  keyPoints: ['Budget approved', 'Decision by Friday'],
  decisions: ['Offer annual billing'],
  actionItems: [{ owner: 'Murilo', task: 'Send proposal', due: 'Friday' }],
  followUpEmail: { subject: 'Next steps', body: 'Hi Ana,\n\nThanks for today.' }
}

describe('meeting files', () => {
  it('makes a safe, sortable file name', () => {
    expect(meetingFileName(meta)).toBe('2026-11-06 14-05 Pricing call Acme Q4.md')
  })

  it('round-trips through markdown', () => {
    const md = buildMeetingMarkdown(meta, notes, '[0:00] Them: hello')
    const parsed = parseMeetingMarkdown('x.md', md)
    expect(parsed.title).toBe(meta.title)
    expect(parsed.durationMin).toBe(23)
    expect(parsed.preview).toBe('Acme wants 40 seats.')
    expect(parsed.followUpEmail).toContain('**Subject:** Next steps')
    expect(parsed.followUpEmail).toContain('Thanks for today.')
    expect(md).toContain('- [ ] **Murilo**: Send proposal (due Friday)')
  })

  it('separates notes from the transcript', () => {
    const md = buildMeetingMarkdown(meta, notes, '[0:00] Them: secret transcript')
    expect(notesWithoutTranscript(md)).not.toContain('secret transcript')
    expect(notesWithoutTranscript(md)).toContain('## Action items')
  })

  it('reads a hand-written file without frontmatter', () => {
    const parsed = parseMeetingMarkdown('Old.md', '# Old meeting\n\n## Summary\nSomething.')
    expect(parsed.title).toBe('Old meeting')
    expect(parsed.preview).toBe('Something.')
  })
})

describe('failed notes', () => {
  it('still produces a readable file with the transcript', () => {
    const md = buildMeetingMarkdown(meta, { ...notes, keyPoints: [], decisions: [], actionItems: [], followUpEmail: { subject: '', body: '' } }, '[0:00] Me: hi')
    expect(md).toContain('_No action items._')
    expect(md).toContain('[0:00] Me: hi')
    expect(md).toMatch(/^source: sotto$/m)
  })
})
