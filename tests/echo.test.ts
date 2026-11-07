import { describe, expect, it } from 'vitest'
import { addSegment, echoMatch, isEcho, normalizeWords } from '../src/shared/echo'
import type { Speaker, TranscriptSegment } from '../src/shared/types'

const T0 = 1_700_000_000_000
let nextId = 0
/** A line starting at `atSec`. Its chunk lasts `durSec`, by default about as long as
 *  saying the words (0.4 s each) plus the pause that ended it. */
const seg = (speaker: Speaker, text: string, atSec: number, durSec?: number): TranscriptSegment => ({
  id: `${speaker}-${++nextId}`,
  speaker,
  text,
  at: T0 + atSec * 1000,
  durationMs: Math.round((durSec ?? normalizeWords(text).length * 0.4 + 0.7) * 1000)
})

/** Feed lines in arrival order, as the transcription queue does. */
function run(
  lines: TranscriptSegment[],
  removeEcho = true
): { segments: TranscriptSegment[]; removed: string[]; dropped: string[] } {
  let segments: TranscriptSegment[] = []
  const removed: string[] = []
  const dropped: string[] = []
  for (const line of lines) {
    const result = addSegment(segments, line, { removeEcho })
    segments = result.segments
    removed.push(...result.removed)
    if (!result.kept) dropped.push(line.id)
  }
  return { segments, removed, dropped }
}

// Lines from the live test on 2026-11-07 (speakers, no headphones).
const THEM_MAKES_SENSE = 'That makes sense. How many invoices do you process each month?'
const THEM_MAIN_PROBLEM = 'The main problem with supplier invoices is that they don’t match the purchase orders.'
const ME_MAIN_PROBLEM_ECHO = 'The main problem with supplier invoices is that to not match…'

describe('normalizeWords', () => {
  it('lowercases, drops punctuation and apostrophes, and turns small numbers into digits', () => {
    expect(normalizeWords('That makes sense. How many invoices…')).toEqual(['that', 'makes', 'sense', 'how', 'many', 'invoices'])
    expect(normalizeWords('They don’t match—five of them!')).toEqual(['they', 'dont', 'match', '5', 'of', 'them'])
    expect(normalizeWords(' ... ')).toEqual([])
  })
})

describe('echoMatch', () => {
  it('scores an identical line as a full match', () => {
    expect(echoMatch(THEM_MAKES_SENSE, THEM_MAKES_SENSE)).toEqual({ words: 11, share: 1 })
  })

  it('scores a slightly different transcription of the same audio highly', () => {
    const { words, share } = echoMatch(ME_MAIN_PROBLEM_ECHO, THEM_MAIN_PROBLEM)
    expect(words).toBeGreaterThanOrEqual(8)
    expect(share).toBeGreaterThanOrEqual(0.8)
  })

  it('does not add up common words scattered over a long stretch of their speech', () => {
    const theirs =
      'I wanted to check that the budget is approved, and a few of the team think that the timeline is a bit tight, ' +
      'so I would like a good look at the point where we hand over to finance.'
    expect(echoMatch('I think that is a good point', theirs).share).toBeLessThan(0.6)
  })

  it('handles empty text', () => {
    expect(echoMatch('', 'anything at all')).toEqual({ words: 0, share: 0 })
    expect(echoMatch('some words here today', '')).toEqual({ words: 0, share: 0 })
  })
})

describe('isEcho', () => {
  it('flags a "me" line that repeats "them" at the same moment', () => {
    const them = seg('them', THEM_MAKES_SENSE, 27)
    const me = seg('me', THEM_MAKES_SENSE, 27)
    expect(isEcho(me, [them, me])).toBe(true)
  })

  it('never flags a "them" line', () => {
    const me = seg('me', THEM_MAKES_SENSE, 27)
    const them = seg('them', THEM_MAKES_SENSE, 27)
    expect(isEcho(them, [me, them])).toBe(false)
  })

  it('keeps a genuine short reply that repeats a few of their words', () => {
    // Talking over them, so only the words decide.
    const them = seg('them', THEM_MAKES_SENSE, 27)
    expect(isEcho(seg('me', 'Yes, that makes sense.', 27.5), [them])).toBe(false)
    expect(isEcho(seg('me', 'Yes, that makes sense. We do about two hundred a month.', 27.5), [them])).toBe(false)
  })

  it('keeps your line when you talk over a short "okay" from them', () => {
    const them = seg('them', 'Okay, sounds good, thanks.', 40)
    const me = seg('me', 'Okay sounds good thanks. So the plan is we ship the pilot next week.', 40)
    expect(isEcho(me, [them])).toBe(false)
  })

  it('needs the two lines to start together or overlap', () => {
    const them = seg('them', THEM_MAKES_SENSE, 10, 5) // 10 s to 15 s
    expect(isEcho(seg('me', THEM_MAKES_SENSE, 11.5, 5), [them])).toBe(true) // starts 1.5 s later
    expect(isEcho(seg('me', THEM_MAKES_SENSE, 7, 5), [them])).toBe(false) // 3 s early, mostly before theirs
    expect(isEcho(seg('me', THEM_MAKES_SENSE, 15.5, 5), [them])).toBe(false) // after they finished
    expect(isEcho(seg('me', THEM_MAKES_SENSE, 21, 5), [them])).toBe(false)
  })

  it('catches an echo whose chunk starts late, inside theirs', () => {
    // The mic missed the quiet start, so its chunk begins 3 s into their 8 s one.
    const them = seg('them', `${THEM_MAKES_SENSE} And who approves them before they are paid?`, 27, 8)
    expect(isEcho(seg('me', 'and who approves them before they are paid', 30, 4), [them])).toBe(true)
  })

  it('needs most of a late-starting line to overlap theirs', () => {
    const them = seg('them', THEM_MAKES_SENSE, 10, 5) // 10 s to 15 s
    expect(isEcho(seg('me', THEM_MAKES_SENSE, 12, 5), [them])).toBe(true) // 3 of 5 s overlap
    expect(isEcho(seg('me', THEM_MAKES_SENSE, 13, 5), [them])).toBe(false) // 2 of 5 s
  })

  it('catches an echo that spans two of their lines', () => {
    const a = seg('them', 'We started using the new system in March.', 50, 3)
    const b = seg('them', 'Since then the approvals have been much faster.', 53, 3)
    expect(isEcho(seg('me', 'the new system in March since then the approvals', 51.8, 3), [a, b])).toBe(true)
  })

  it('treats number words and digits as the same', () => {
    const them = seg('them', 'We have 5 people on the finance team.', 60)
    expect(isEcho(seg('me', 'We have five people on the finance team', 60), [them])).toBe(true)
  })

  it('needs at least four matching words', () => {
    const them = seg('them', 'Sounds good to me.', 70)
    expect(isEcho(seg('me', 'Sounds good to me.', 70), [them])).toBe(true)
    const short = seg('them', 'That makes sense.', 80)
    expect(isEcho(seg('me', 'That makes sense.', 80), [short])).toBe(false)
  })
})

describe('addSegment', () => {
  it('drops the echo when "them" arrives first', () => {
    const them = seg('them', THEM_MAKES_SENSE, 27)
    const me = seg('me', THEM_MAKES_SENSE, 27.3)
    const result = run([them, me])
    expect(result.segments.map((s) => s.id)).toEqual([them.id])
    expect(result.dropped).toEqual([me.id])
    expect(result.removed).toEqual([])
  })

  it('removes an already-shown echo when the matching "them" line arrives later', () => {
    const me = seg('me', ME_MAIN_PROBLEM_ECHO, 41.2)
    const them = seg('them', THEM_MAIN_PROBLEM, 41)
    const result = run([me, them])
    expect(result.segments.map((s) => s.id)).toEqual([them.id])
    expect(result.removed).toEqual([me.id])
    expect(result.dropped).toEqual([])
  })

  it('keeps a real conversation intact and in time order', () => {
    const lines = [
      seg('them', THEM_MAKES_SENSE, 27),
      seg('me', 'Yes, that makes sense.', 26), // arrives late but started earlier
      seg('me', 'Around four hundred, mostly from three suppliers.', 33),
      seg('them', THEM_MAIN_PROBLEM, 41)
    ]
    const result = run(lines)
    expect(result.segments.map((s) => s.text)).toEqual([
      'Yes, that makes sense.',
      THEM_MAKES_SENSE,
      'Around four hundred, mostly from three suppliers.',
      THEM_MAIN_PROBLEM
    ])
    expect(result.removed).toEqual([])
    expect(result.dropped).toEqual([])
  })

  it('only removes "me" lines near the new "them" line', () => {
    const early = seg('me', THEM_MAIN_PROBLEM, 5) // you said it yourself, long before
    const echo = seg('me', THEM_MAIN_PROBLEM, 41)
    const them = seg('them', THEM_MAIN_PROBLEM, 41)
    const result = run([early, echo, them])
    expect(result.removed).toEqual([echo.id])
    expect(result.segments.map((s) => s.id)).toEqual([early.id, them.id])
  })

  it('keeps your line when they repeat it back a few seconds later', () => {
    // You speak, then they confirm by repeating you: same words, but not at the same time.
    const me = seg('me', 'I want the blue one delivered by Friday', 0, 3)
    const them = seg('them', 'Okay so you want the blue one delivered by Friday, right?', 4, 3.5)
    expect(echoMatch(me.text, them.text).share).toBeGreaterThanOrEqual(0.6) // the words alone would match
    for (const order of [[me, them], [them, me]]) {
      const result = run(order)
      expect(result.segments.map((s) => s.id)).toEqual([me.id, them.id])
      expect(result.removed).toEqual([])
      expect(result.dropped).toEqual([])
    }
  })

  it('keeps your line when you read back what they said', () => {
    const them = seg('them', 'The reference number is four seven two nine one', 0, 4)
    const me = seg('me', 'Four seven two nine one, got it', 5, 2.5)
    expect(echoMatch(me.text, them.text).share).toBeGreaterThanOrEqual(0.6)
    for (const order of [[them, me], [me, them]]) {
      const result = run(order)
      expect(result.segments.map((s) => s.id)).toEqual([them.id, me.id])
      expect(result.removed).toEqual([])
      expect(result.dropped).toEqual([])
    }
  })

  it('keeps every line when echo removal is off (headphones)', () => {
    const them = seg('them', THEM_MAKES_SENSE, 27)
    const me = seg('me', THEM_MAKES_SENSE, 27.3)
    for (const order of [[them, me], [me, them]]) {
      const result = run(order, false)
      expect(result.segments.map((s) => s.id)).toEqual([them.id, me.id])
      expect(result.removed).toEqual([])
      expect(result.dropped).toEqual([])
    }
  })

  it('does not change the list it was given', () => {
    const them = seg('them', THEM_MAKES_SENSE, 27)
    const before: TranscriptSegment[] = [seg('me', THEM_MAKES_SENSE, 27)]
    addSegment(before, them)
    expect(before).toHaveLength(1)
  })
})
