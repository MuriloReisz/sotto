// Cuts a continuous 16 kHz audio stream into speech chunks at natural pauses, so each
// chunk can be transcribed as soon as someone stops talking (a few seconds of lag)
// instead of waiting for fixed-size blocks. Pure maths, no browser APIs: unit-tested.
//
// How it decides "speech": the loudness (RMS) of each 20 ms slice is compared with a
// slowly-adapting estimate of the background noise. Louder than ~3x the noise = speech.

export interface ChunkerOptions {
  sampleRate: number
  /** End a chunk after this much silence following speech. */
  silenceMs: number
  /** After this long, end the chunk at the next short pause (a breath between phrases),
   *  so long monologues are split between words rather than mid-sentence. */
  softMaxChunkMs: number
  /** The short pause that ends a chunk once it is past softMaxChunkMs. */
  shortPauseMs: number
  /** Never let a chunk grow longer than this, pause or not. */
  maxChunkMs: number
  /** Drop chunks with less speech than this (coughs, clicks). */
  minSpeechMs: number
  /** Audio kept from just before speech starts, so first syllables aren't clipped. */
  prerollMs: number
}

export const DEFAULT_CHUNKER: ChunkerOptions = {
  sampleRate: 16_000,
  silenceMs: 700,
  softMaxChunkMs: 8_000,
  shortPauseMs: 200,
  maxChunkMs: 15_000,
  minSpeechMs: 300,
  prerollMs: 200
}

export interface SpeechChunk {
  audio: Float32Array
  /** Index of the chunk's first sample since the stream started (for timestamps). */
  startSample: number
}

const SLICE_MS = 20
const MIN_THRESHOLD = 0.008

export class SpeechChunker {
  private readonly o: ChunkerOptions
  private readonly sliceLen: number
  private pending = new Float32Array(0) // samples not yet forming a whole slice
  private preroll: Float32Array[] = []
  private chunk: Float32Array[] = []
  private chunkStart = 0
  private samplesSeen = 0
  private speechSlices = 0
  private silentSlices = 0
  private noise = 0.003
  /** Loudness of the latest slice, 0..1, for a level meter. */
  level = 0

  constructor(options: Partial<ChunkerOptions> = {}) {
    this.o = { ...DEFAULT_CHUNKER, ...options }
    this.sliceLen = Math.round((this.o.sampleRate * SLICE_MS) / 1000)
  }

  /** Feed audio of any length. Returns the chunks completed by this audio. */
  push(samples: Float32Array): SpeechChunk[] {
    const out: SpeechChunk[] = []
    const all = concat([this.pending, samples])
    let offset = 0
    for (; offset + this.sliceLen <= all.length; offset += this.sliceLen) {
      const done = this.slice(all.subarray(offset, offset + this.sliceLen))
      if (done) out.push(done)
    }
    this.pending = all.slice(offset)
    return out
  }

  /** Call when the stream stops: returns the last chunk if it holds enough speech. */
  flush(): SpeechChunk | null {
    const chunk = this.finish()
    this.pending = new Float32Array(0)
    return chunk
  }

  private slice(slice: Float32Array): SpeechChunk | null {
    const rms = Math.sqrt(slice.reduce((s, v) => s + v * v, 0) / slice.length)
    this.level = Math.min(1, rms * 12)
    const isSpeech = rms > Math.max(MIN_THRESHOLD, this.noise * 3)
    if (!isSpeech) this.noise = this.noise * 0.95 + rms * 0.05
    const sliceStart = this.samplesSeen
    this.samplesSeen += slice.length
    const copy = slice.slice()

    if (this.chunk.length === 0) {
      if (!isSpeech) {
        this.preroll.push(copy)
        const keep = Math.ceil(this.o.prerollMs / SLICE_MS)
        if (this.preroll.length > keep) this.preroll.shift()
        return null
      }
      // Speech starts: open a chunk with the preroll in front.
      this.chunk = [...this.preroll, copy]
      this.chunkStart = sliceStart - this.preroll.length * this.sliceLen
      this.preroll = []
      this.speechSlices = 1
      this.silentSlices = 0
      return null
    }

    this.chunk.push(copy)
    if (isSpeech) {
      this.speechSlices++
      this.silentSlices = 0
    } else {
      this.silentSlices++
    }
    const lengthMs = this.chunk.length * SLICE_MS
    const silentMs = this.silentSlices * SLICE_MS
    if (
      silentMs >= this.o.silenceMs ||
      (lengthMs >= this.o.softMaxChunkMs && silentMs >= this.o.shortPauseMs) ||
      lengthMs >= this.o.maxChunkMs
    ) {
      return this.finish()
    }
    return null
  }

  private finish(): SpeechChunk | null {
    const enoughSpeech = this.speechSlices * SLICE_MS >= this.o.minSpeechMs
    const chunk = this.chunk.length && enoughSpeech ? { audio: concat(this.chunk), startSample: this.chunkStart } : null
    this.chunk = []
    this.speechSlices = 0
    this.silentSlices = 0
    return chunk
  }
}

function concat(parts: Float32Array[]): Float32Array {
  const out = new Float32Array(parts.reduce((n, p) => n + p.length, 0))
  let i = 0
  for (const p of parts) {
    out.set(p, i)
    i += p.length
  }
  return out
}

/** Float32 [-1, 1] -> signed 16-bit PCM, the format whisper.cpp expects. */
export function floatToPcm16(samples: Float32Array): Int16Array {
  const out = new Int16Array(samples.length)
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff
  }
  return out
}
