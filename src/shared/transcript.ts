import type { TranscriptSegment } from './types'

// Pure helpers for the rolling transcript.

const SPEAKER = { me: 'Me', them: 'Them' } as const

/** whisper.cpp prints these for silence/noise; they are not speech. */
const NON_SPEECH = /^\s*[[(].*[\])]\s*$|^\s*(\[BLANK_AUDIO\]|\.+|you\.?|thank you\.?)\s*$/i

export function isSpeech(text: string): boolean {
  return text.trim().length > 0 && !NON_SPEECH.test(text) && !isRepeatLoop(text)
}

/** whisper sometimes turns noise into one word repeated ("Fokri Fokri Fokri Fokri").
 *  Real speech almost never says the same word 4+ times with nothing else. */
function isRepeatLoop(text: string): boolean {
  const words = text.toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? []
  return words.length >= 4 && new Set(words).size === 1
}

/** Clean whisper output: trim, collapse whitespace, drop bracketed sound tags. */
export function cleanText(text: string): string {
  return text
    .replace(/\[[^\]]*\]|\([^)]*\)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function clock(at: number, start: number): string {
  const s = Math.max(0, Math.round((at - start) / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/**
 * Format segments as "[m:ss] Me: …" lines, merging consecutive lines from the same
 * speaker. `sinceMs` limits it to the most recent window (e.g. the last 5 minutes).
 */
export function formatTranscript(segments: TranscriptSegment[], opts: { sinceMs?: number; now?: number } = {}): string {
  if (segments.length === 0) return ''
  const start = segments[0].at
  const cutoff = opts.sinceMs !== undefined ? (opts.now ?? Date.now()) - opts.sinceMs : -Infinity
  const lines: { speaker: string; at: number; text: string }[] = []
  for (const seg of segments) {
    if (seg.at < cutoff) continue
    const last = lines[lines.length - 1]
    if (last && last.speaker === seg.speaker) last.text += ' ' + seg.text
    else lines.push({ speaker: seg.speaker, at: seg.at, text: seg.text })
  }
  return lines.map((l) => `[${clock(l.at, start)}] ${SPEAKER[l.speaker as 'me' | 'them']}: ${l.text}`).join('\n')
}

export function wordCount(segments: TranscriptSegment[]): number {
  return segments.reduce((n, s) => n + s.text.split(/\s+/).filter(Boolean).length, 0)
}
