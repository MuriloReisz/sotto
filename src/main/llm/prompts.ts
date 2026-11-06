import type Anthropic from '@anthropic-ai/sdk'
import type { Settings } from '../../shared/types'

// Prompt text in one place. Pure functions (no Electron), covered by unit tests.

type TextBlock = Anthropic.Beta.Messages.BetaTextBlockParam

const ASSISTANT_RULES = `You are Sotto, a discreet assistant shown in a small overlay while the user works, presents or is on a call.

How to answer:
- Lead with the answer. Keep it short enough to read at a glance: a few lines or bullets. Expand only when asked.
- When the user is on a call, phrase suggestions so they can be said out loud naturally, in the user's voice.
- Screenshots show the user's screen. Work out what they most likely need help with and answer that.
- Transcript lines are labelled "Me" (the user) and "Them" (everyone else). Speech recognition makes mistakes; read through obvious errors instead of commenting on them.
- Use markdown sparingly: short bullets, bold for the one key line, code blocks for code.
- If you are unsure or lack context, say so in one line rather than guessing.`

/** System prompt: fixed rules + the user's own profile and instructions. Stable across a
 *  conversation, so it is cached. */
export function systemBlocks(settings: Pick<Settings, 'aboutMe' | 'customInstructions'>): TextBlock[] {
  const parts = [ASSISTANT_RULES]
  if (settings.aboutMe.trim()) parts.push(`About the user (use this to tailor answers):\n${settings.aboutMe.trim()}`)
  if (settings.customInstructions.trim()) parts.push(`The user's own instructions:\n${settings.customInstructions.trim()}`)
  return [{ type: 'text', text: parts.join('\n\n'), cache_control: { type: 'ephemeral' } }]
}

/** The text part of a user turn: optional live transcript and extra material, then the question. */
export function userTurnText(question: string, opts: { transcript?: string; extra?: string } = {}): string {
  const parts: string[] = []
  if (opts.extra) parts.push(opts.extra)
  if (opts.transcript) parts.push(`<live_transcript>\n${opts.transcript}\n</live_transcript>`)
  parts.push(question)
  return parts.join('\n\n')
}

export const NOTES_SYSTEM = `You write meeting notes from a raw transcript. Lines are labelled "Me" (the user, who will read the notes) and "Them" (everyone else); recognition errors are common, so infer the intended words.

Rules:
- title: 3–8 words naming what the meeting was about.
- summary: 2–4 sentences, plain language.
- keyPoints, decisions: short bullet texts; empty lists when there are none. Never invent decisions.
- actionItems: concrete next steps with an owner ("Me", a name, or "Them") and a due date only if one was said (else "").
- followUpEmail: a short, friendly email from the user to the other participants recapping outcomes and next steps. Sign it from the user without inventing a name if none is known.`

export const NOTES_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'summary', 'keyPoints', 'decisions', 'actionItems', 'followUpEmail'],
  properties: {
    title: { type: 'string' },
    summary: { type: 'string' },
    keyPoints: { type: 'array', items: { type: 'string' } },
    decisions: { type: 'array', items: { type: 'string' } },
    actionItems: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['owner', 'task', 'due'],
        properties: { owner: { type: 'string' }, task: { type: 'string' }, due: { type: 'string' } }
      }
    },
    followUpEmail: {
      type: 'object',
      additionalProperties: false,
      required: ['subject', 'body'],
      properties: { subject: { type: 'string' }, body: { type: 'string' } }
    }
  }
} as const

/** Past meetings as context for a question, newest first, within a size budget.
 *  Reports how many were left out instead of silently truncating. */
export function pastMeetingsContext(
  meetings: { title: string; date: string; notes: string }[],
  budgetChars = 300_000
): { text: string; included: number; omitted: number } {
  const blocks: string[] = []
  let used = 0
  for (const m of meetings) {
    const block = `<meeting title=${JSON.stringify(m.title)} date="${m.date}">\n${m.notes}\n</meeting>`
    if (used + block.length > budgetChars) break
    blocks.push(block)
    used += block.length
  }
  const omitted = meetings.length - blocks.length
  const note = omitted > 0 ? `\n(Only the ${blocks.length} most recent meetings fit; ${omitted} older ones were left out.)` : ''
  return {
    text: `<past_meetings>\n${blocks.join('\n\n')}\n</past_meetings>${note}`,
    included: blocks.length,
    omitted
  }
}
