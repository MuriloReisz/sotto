import type { TranscriptSegment } from './types'

// Echo removal. Without headphones the microphone ("me") also hears the other side
// playing through the speakers, so their words come back as a second, slightly different
// "me" line. Such a line is a near-copy of what "them" said AT THE SAME TIME: the mic
// hears the speakers within milliseconds, so both chunks start together and last about
// as long. A "me" line is dropped only when both hold: it overlaps "them" in time, and
// its words repeat theirs. Timing is what keeps you repeating them a few seconds later
// ("four seven two nine one, got it") from being taken for an echo.
// "Them" lines are never dropped: call apps don't play your own voice back.
// Pure logic, unit-tested in tests/echo.test.ts.

/** An echo starts within this of the original. Each source is cut at its own pauses, so
 *  the starts rarely line up exactly. */
export const ECHO_START_MS = 1_500
/** ...or "them" lines cover at least this share of the "me" line's time (the mic's
 *  chunk began a little late, partway into theirs). */
export const ECHO_MIN_OVERLAP = 0.6
/** Share of the "me" line's words that must appear, in order, in what "them" said. */
export const ECHO_MIN_SHARE = 0.6
/** At least this many matching words, so a short genuine reply ("yes, that makes sense")
 *  that happens to repeat a few of their words is kept. */
export const ECHO_MIN_WORDS = 4

const NUMBERS: Record<string, string> = {
  zero: '0', one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9',
  ten: '10', eleven: '11', twelve: '12', thirteen: '13', fourteen: '14', fifteen: '15', sixteen: '16',
  seventeen: '17', eighteen: '18', nineteen: '19', twenty: '20'
}

/** Lowercase words without punctuation; apostrophes vanish ("don't" → "dont") and small
 *  number words become digits ("two" → "2"). */
export function normalizeWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/['’]/g, '')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .map((w) => NUMBERS[w] ?? w)
}

/** Length of the longest common subsequence of two word lists (words in the same order). */
function commonWords(a: string[], b: string[]): number {
  let prev = new Array<number>(b.length + 1).fill(0)
  for (const word of a) {
    const row = [0]
    for (let j = 0; j < b.length; j++) row.push(word === b[j] ? prev[j] + 1 : Math.max(prev[j + 1], row[j]))
    prev = row
  }
  return prev[b.length]
}

/**
 * How much of `mine` is a copy of `theirs`: the words of `mine` found in the same order
 * within one stretch of `theirs` not much longer than `mine`. The stretch limit stops
 * common words ("I", "that", "is", "a") scattered over 20 seconds of their speech from
 * adding up to a match. Measured against your words (not the shorter line), so a line
 * where you talked over a short "okay, sounds good" from them still counts as yours.
 */
export function echoMatch(mine: string, theirs: string): { words: number; share: number } {
  const me = normalizeWords(mine)
  const them = normalizeWords(theirs)
  if (me.length === 0) return { words: 0, share: 0 }
  const span = Math.ceil(me.length * 1.5) + 2
  let words = 0
  for (let start = 0; start <= Math.max(0, them.length - span) && words < me.length; start++) {
    words = Math.max(words, commonWords(me, them.slice(start, start + span)))
  }
  return { words, share: words / me.length }
}

const end = (s: TranscriptSegment): number => s.at + s.durationMs

/** "Them" lines that started together with `mine` or ran during it. */
function concurrent(mine: TranscriptSegment, all: TranscriptSegment[]): TranscriptSegment[] {
  return all.filter(
    (s) => s.speaker === 'them' && (Math.abs(s.at - mine.at) <= ECHO_START_MS || (s.at < end(mine) && end(s) > mine.at))
  )
}

/** True when `theirs` sit in time where an echo of them would: same start, or covering
 *  most of the "me" line. */
function echoTiming(mine: TranscriptSegment, theirs: TranscriptSegment[]): boolean {
  if (theirs.some((s) => Math.abs(s.at - mine.at) <= ECHO_START_MS)) return true
  if (mine.durationMs <= 0) return false
  // Time of `mine` covered by their lines (merged, so two overlapping lines count once).
  let covered = 0
  let reached = mine.at
  for (const s of [...theirs].sort((a, b) => a.at - b.at)) {
    const from = Math.max(s.at, reached)
    const to = Math.min(end(s), end(mine))
    if (to > from) covered += to - from
    reached = Math.max(reached, to)
  }
  return covered / mine.durationMs >= ECHO_MIN_OVERLAP
}

/** True when a "me" line repeats what "them" said at the same time. All their lines in
 *  that time are read together, since either side may be cut into pieces. */
export function isEcho(segment: TranscriptSegment, all: TranscriptSegment[]): boolean {
  if (segment.speaker !== 'me') return false
  const theirs = concurrent(segment, all).sort((a, b) => a.at - b.at)
  if (theirs.length === 0 || !echoTiming(segment, theirs)) return false
  const { words, share } = echoMatch(segment.text, theirs.map((s) => s.text).join(' '))
  return words >= ECHO_MIN_WORDS && share >= ECHO_MIN_SHARE
}

/**
 * Add a recognised line to the time-ordered transcript, leaving echoes out (unless
 * `removeEcho` is off: you wear headphones, so there is no echo to remove). Lines can
 * arrive in either order (whisper is slower on some chunks), so a new "them" line can
 * also reveal an earlier "me" line as an echo: its id is returned in `removed`.
 */
export function addSegment(
  segments: TranscriptSegment[],
  segment: TranscriptSegment,
  { removeEcho = true }: { removeEcho?: boolean } = {}
): { segments: TranscriptSegment[]; kept: boolean; removed: string[] } {
  const withNew = [...segments, segment].sort((a, b) => a.at - b.at)
  if (!removeEcho) return { segments: withNew, kept: true, removed: [] }
  if (segment.speaker === 'me') {
    return isEcho(segment, withNew) ? { segments, kept: false, removed: [] } : { segments: withNew, kept: true, removed: [] }
  }
  const removed = withNew
    .filter((s) => s.speaker === 'me' && concurrent(s, [segment]).length > 0 && isEcho(s, withNew))
    .map((s) => s.id)
  return { segments: withNew.filter((s) => !removed.includes(s.id)), kept: true, removed }
}
