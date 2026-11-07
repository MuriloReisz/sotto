import { describe, expect, it } from 'vitest'
import { SpeechChunker, floatToPcm16 } from '../src/shared/speech-chunker'
import { pcm16ToWav } from '../src/shared/wav'
import { cleanText, formatTranscript, isSpeech, wordCount } from '../src/shared/transcript'

const RATE = 16_000
const silence = (ms: number): Float32Array => new Float32Array((RATE * ms) / 1000)
const tone = (ms: number, amp = 0.3): Float32Array => {
  const a = new Float32Array((RATE * ms) / 1000)
  for (let i = 0; i < a.length; i++) a[i] = amp * Math.sin((2 * Math.PI * 220 * i) / RATE)
  return a
}
/** Feed in 100 ms blocks like the real audio worklet does. */
const feed = (c: SpeechChunker, audio: Float32Array) => {
  const out = []
  for (let i = 0; i < audio.length; i += 1600) out.push(...c.push(audio.subarray(i, i + 1600)))
  return out
}

describe('SpeechChunker', () => {
  it('emits one chunk per phrase, cut at the pause', () => {
    const c = new SpeechChunker()
    const chunks = feed(c, Float32Array.from([...silence(500), ...tone(1500), ...silence(1000), ...tone(1000), ...silence(1000)]))
    expect(chunks).toHaveLength(2)
    // First chunk starts ~200 ms (preroll) before the speech at 500 ms.
    expect(chunks[0].startSample / RATE).toBeCloseTo(0.3, 1)
    expect(chunks[0].audio.length / RATE).toBeGreaterThan(1.5)
  })

  it('ignores pure silence and very short blips', () => {
    const c = new SpeechChunker()
    expect(feed(c, Float32Array.from([...silence(2000), ...tone(100), ...silence(2000)]))).toHaveLength(0)
  })

  it('splits a long monologue with no pauses at the hard maximum', () => {
    const c = new SpeechChunker({ softMaxChunkMs: 2000, maxChunkMs: 3000 })
    const chunks = feed(c, tone(7000))
    expect(chunks.length).toBe(2)
    expect(c.flush()).not.toBeNull() // the remaining second of speech
  })

  it('splits a long monologue at a breath, not mid-word, once past the soft maximum', () => {
    const c = new SpeechChunker() // soft 8 s, short pause 200 ms, hard 15 s
    // 9 s of speech, a 300 ms breath (shorter than the 700 ms phrase pause), then 3 s more.
    const chunks = feed(c, Float32Array.from([...tone(9000), ...silence(300), ...tone(3000), ...silence(1000)]))
    expect(chunks).toHaveLength(2)
    // The first chunk ends at the breath (about 9.2 s), not at the old fixed 8 s cut.
    expect(chunks[0].audio.length / RATE).toBeGreaterThan(9)
    expect(chunks[0].audio.length / RATE).toBeLessThan(9.6)
  })

  it('keeps a short breath inside a chunk before the soft maximum', () => {
    const c = new SpeechChunker()
    const chunks = feed(c, Float32Array.from([...tone(2000), ...silence(300), ...tone(2000), ...silence(1000)]))
    expect(chunks).toHaveLength(1)
  })

  it('reports a level for the meter', () => {
    const c = new SpeechChunker()
    feed(c, tone(200, 0.05))
    expect(c.level).toBeGreaterThan(0.3)
  })
})

describe('audio encoding', () => {
  it('converts floats to 16-bit PCM with clipping', () => {
    expect(Array.from(floatToPcm16(Float32Array.from([0, 1, -1, 2])))).toEqual([0, 32767, -32768, 32767])
  })

  it('writes a valid WAV header', () => {
    const wav = pcm16ToWav(new Uint8Array(3200))
    const text = (a: number, b: number) => String.fromCharCode(...wav.slice(a, b))
    expect(text(0, 4)).toBe('RIFF')
    expect(text(8, 12)).toBe('WAVE')
    expect(new DataView(wav.buffer).getUint32(40, true)).toBe(3200)
    expect(wav.length).toBe(3244)
  })
})

describe('transcript helpers', () => {
  it('filters whisper noise markers', () => {
    expect(isSpeech('[BLANK_AUDIO]')).toBe(false)
    expect(isSpeech(' (music) ')).toBe(false)
    expect(isSpeech('So about the pricing')).toBe(true)
    // whisper's noise loop: one word over and over
    expect(isSpeech('Fokri Fokri Fokri Fokri Fokri')).toBe(false)
    expect(isSpeech('No, no, no, no.')).toBe(false)
    expect(isSpeech('No, no, that is not it.')).toBe(true)
    expect(isSpeech('Yes yes yes')).toBe(true)
    expect(cleanText('  Hello [laughs] there  (coughs) ')).toBe('Hello there')
  })

  it('formats and merges consecutive lines per speaker', () => {
    const t0 = 1_000_000
    const segs = [
      { id: '1', speaker: 'them' as const, text: 'What is the price?', at: t0, durationMs: 1500 },
      { id: '2', speaker: 'them' as const, text: 'Per seat?', at: t0 + 2000, durationMs: 1000 },
      { id: '3', speaker: 'me' as const, text: 'Yes, 20 euro.', at: t0 + 65_000, durationMs: 1500 }
    ]
    expect(formatTranscript(segs)).toBe('[0:00] Them: What is the price? Per seat?\n[1:05] Me: Yes, 20 euro.')
    expect(formatTranscript(segs, { sinceMs: 10_000, now: t0 + 70_000 })).toBe('[1:05] Me: Yes, 20 euro.')
    expect(wordCount(segs)).toBe(9)
  })
})
