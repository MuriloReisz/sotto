import type { MeetingNotes } from '../../shared/types'

// Canned output for SOTTO_FAKE_LLM=1 (development only). Lets every UI flow be tested
// without an API key: streaming, markdown rendering, stop, notes, past-meeting Q&A.

export async function* fakeStream(question: string, signal: AbortSignal): AsyncGenerator<string> {
  const answer = `**Fake answer** (development mode, no API call).

You asked: _${question.slice(0, 120).replace(/[_*`]/g, '')}_

- This text streams in word by word, like a real answer.
- Markdown works: **bold**, lists and code:

\`\`\`ts
const answer = 42
\`\`\`

Set a real API key in Settings and restart without \`SOTTO_FAKE_LLM\` to use Claude.`
  for (const word of answer.split(/(?<= )/)) {
    if (signal.aborted) return
    await new Promise((r) => setTimeout(r, 18))
    yield word
  }
}

export function fakeNotes(transcript: string): MeetingNotes {
  const lines = transcript.split('\n').filter(Boolean)
  return {
    title: 'Test meeting (fake notes)',
    summary: `Fake notes generated in development mode from ${lines.length} transcript lines.`,
    keyPoints: lines.slice(0, 3).map((l) => l.replace(/^\[\d+:\d+\] /, '')),
    decisions: ['Use Sotto for meeting notes'],
    actionItems: [{ owner: 'Me', task: 'Try Sotto with a real API key', due: '' }],
    followUpEmail: { subject: 'Thanks for today', body: 'Hi all,\n\nThanks for the chat today. Notes are attached.\n\nBest' }
  }
}
