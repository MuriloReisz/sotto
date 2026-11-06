import { SpeechChunker, floatToPcm16, type SpeechChunk } from '../../../shared/speech-chunker'
import type { AudioChunk, Speaker } from '../../../shared/types'
import workletUrl from './pcm-worklet.js?url'

// Captures two audio sources and turns them into speech chunks for transcription:
//   'me'   - your microphone (getUserMedia)
//   'them' - everything your computer plays, i.e. the other people on the call
//            (getDisplayMedia with system-audio loopback; the main process answers the
//            request without a picker and the video track is thrown away)
// Each source gets its own SpeechChunker, which is how the transcript knows who spoke.

export interface CaptureEvents {
  onChunk: (chunk: AudioChunk) => void
  onLevel: (levels: Record<Speaker, number>) => void
}

export interface CaptureResult {
  microphone: boolean
  systemAudio: boolean
  /** Set when one of the two sources is unavailable. */
  message?: string
}

const SAMPLE_RATE = 16_000

/** Release a stream we no longer want (listening was stopped while a prompt was open). */
function stopTracks(stream: MediaStream): never {
  stream.getTracks().forEach((t) => t.stop())
  throw new Error('cancelled')
}

export class AudioCapture {
  private ctx: AudioContext | null = null
  private streams: MediaStream[] = []
  private chunkers = new Map<Speaker, SpeechChunker>()
  private nodes: AudioWorkletNode[] = []
  private running = false
  private startedAt = 0
  private levelTimer: number | undefined
  /** Bumped by stop(), so a start() still waiting on a permission prompt gives up cleanly. */
  private generation = 0

  constructor(private readonly events: CaptureEvents) {}

  async start(): Promise<CaptureResult> {
    const generation = ++this.generation
    const cancelled = (): boolean => generation !== this.generation
    this.chunkers.clear()
    this.running = true
    this.ctx = new AudioContext()
    await this.ctx.audioWorklet.addModule(workletUrl)
    this.startedAt = Date.now()
    const missing: string[] = []

    try {
      const mic = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false
      })
      if (cancelled()) return stopTracks(mic)
      this.attach(mic, 'me')
    } catch {
      missing.push('your microphone')
    }

    try {
      const display = await navigator.mediaDevices.getDisplayMedia({ audio: true, video: true })
      if (cancelled()) return stopTracks(display)
      display.getVideoTracks().forEach((t) => t.stop())
      const track = display.getAudioTracks()[0]
      // macOS without the system-audio permission gives a track that is already ended.
      if (track && track.readyState === 'live') this.attach(new MediaStream([track]), 'them')
      else missing.push('system audio')
    } catch {
      missing.push('system audio')
    }
    if (cancelled()) throw new Error('cancelled')

    const microphone = this.chunkers.has('me')
    const systemAudio = this.chunkers.has('them')
    if (!microphone && !systemAudio) {
      await this.stop()
      throw new Error('Sotto could not hear your microphone or your computer’s audio. Check the permissions in Settings.')
    }

    this.levelTimer = window.setInterval(() => {
      this.events.onLevel({ me: this.chunkers.get('me')?.level ?? 0, them: this.chunkers.get('them')?.level ?? 0 })
    }, 70)

    return {
      microphone,
      systemAudio,
      message: missing.length ? `Listening without ${missing.join(' and ')}.` : undefined
    }
  }

  private attach(stream: MediaStream, speaker: Speaker): void {
    const ctx = this.ctx!
    this.streams.push(stream)
    const chunker = new SpeechChunker()
    this.chunkers.set(speaker, chunker)
    const node = new AudioWorkletNode(ctx, 'pcm-capture')
    this.nodes.push(node)
    node.port.onmessage = (e: MessageEvent<Float32Array>) => this.feed(speaker, e.data)
    ctx.createMediaStreamSource(stream).connect(node)
    // A worklet only runs while connected to the output; route it through a muted gain.
    const mute = ctx.createGain()
    mute.gain.value = 0
    node.connect(mute).connect(ctx.destination)
  }

  /** Samples from a worklet. Ignored once stopped (messages can still be in flight). */
  private feed(speaker: Speaker, samples: Float32Array): void {
    const chunker = this.chunkers.get(speaker)
    if (!this.running || !chunker) return
    for (const chunk of chunker.push(samples)) this.emit(speaker, chunk)
  }

  private emit(speaker: Speaker, chunk: SpeechChunk): void {
    const pcm = floatToPcm16(chunk.audio)
    this.events.onChunk({
      speaker,
      pcm: pcm.buffer as ArrayBuffer,
      at: this.startedAt + Math.round((chunk.startSample / SAMPLE_RATE) * 1000)
    })
  }

  /** Stop capturing; the last unfinished phrase of each speaker is still sent. */
  async stop(): Promise<void> {
    this.generation++
    this.running = false
    window.clearInterval(this.levelTimer)
    for (const node of this.nodes) {
      node.port.onmessage = null
      node.disconnect()
    }
    this.nodes = []
    for (const [speaker, chunker] of this.chunkers) {
      const last = chunker.flush()
      if (last) this.emit(speaker, last)
    }
    this.chunkers.clear()
    this.streams.forEach((s) => s.getTracks().forEach((t) => t.stop()))
    this.streams = []
    await this.ctx?.close().catch(() => undefined)
    this.ctx = null
    this.events.onLevel({ me: 0, them: 0 })
  }
}
