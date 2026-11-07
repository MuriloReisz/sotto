import { MIC_UNHEARD, SYSTEM_UNHEARD, WAITING_FOR_PERMISSION, hasSignal, inputDeviceGone } from '../../../shared/audio-health'
import { SpeechChunker, floatToPcm16, type SpeechChunk } from '../../../shared/speech-chunker'
import type { AudioChunk, Speaker } from '../../../shared/types'
import workletUrl from './pcm-worklet.js?url&no-inline'

// Captures two audio sources and turns them into speech chunks for transcription:
//   'me'   - your microphone (getUserMedia)
//   'them' - everything your computer plays, i.e. the other people on the call
//            (getDisplayMedia with system-audio loopback; the main process answers the
//            request without a picker and the video track is thrown away)
// Each source gets its own SpeechChunker, which is how the transcript knows who spoke.
//
// A source is only reported as working while it really delivers audio: an ended track,
// or a microphone that gives exact digital silence for its first few seconds, counts as
// dead. A dead or vanished microphone (e.g. AirPods disconnected) is re-opened once on
// the current default device before Sotto says it can't hear you.

export interface SourceUpdate {
  microphone: boolean
  systemAudio: boolean
  /** System audio is still waiting on a permission prompt. */
  waiting: boolean
  message?: string
}

export interface CaptureEvents {
  onChunk: (chunk: AudioChunk) => void
  onLevel: (levels: Record<Speaker, number>) => void
  /** After start() resolved: a source died, switched device or arrived late. */
  onSources: (update: SourceUpdate) => void
  /** A status line while a permission prompt is probably open; null clears it. */
  onNotice: (text: string | null) => void
}

export interface CaptureResult {
  microphone: boolean
  systemAudio: boolean
  waiting: boolean
  /** Set when one of the two sources is unavailable or was switched. */
  message?: string
}

/** One attached stream and the audio nodes it feeds. */
interface Source {
  stream: MediaStream
  track: MediaStreamTrack
  nodes: AudioNode[]
  worklet: AudioWorkletNode
  /** Any samples arrived / any louder than digital silence. */
  received: boolean
  heard: boolean
  check?: number
}

const SAMPLE_RATE = 16_000
/** A media request still open after this is probably waiting on a macOS prompt. */
const NOTICE_AFTER_MS = 1_500
/** How long a new source has to prove it delivers audio. */
const CHECK_MS = 3_000
/**
 * Sources where digital silence means "dead". Not system audio: the loopback is exact
 * zeros whenever nothing is playing (e.g. before the call starts).
 */
const SILENCE_CHECKED: ReadonlySet<Speaker> = new Set<Speaker>(['me'])
const MIC: MediaStreamConstraints = {
  audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  video: false
}

/**
 * An audio context with no output device. Sotto never plays sound, and a context tied to
 * the default output stays 'suspended' when that device misbehaves or disappears.
 */
function createContext(): AudioContext {
  try {
    const options: AudioContextOptions & { sinkId: { type: 'none' } } = { sinkId: { type: 'none' } }
    return new AudioContext(options)
  } catch {
    return new AudioContext()
  }
}

const stopStream = (stream: MediaStream | null | undefined): void => stream?.getTracks().forEach((t) => t.stop())
const delay = (ms: number): Promise<void> => new Promise((resolve) => window.setTimeout(resolve, ms))

export class AudioCapture {
  private ctx: AudioContext | null = null
  private sources = new Map<Speaker, Source>()
  private chunkers = new Map<Speaker, SpeechChunker>()
  /** When each speaker's current chunker started (sources can attach late or re-open). */
  private origins = new Map<Speaker, number>()
  private live: Record<Speaker, boolean> = { me: false, them: false }
  private running = false
  private levelTimer: number | undefined
  /** Bumped by stop(), so a start() still waiting on a permission prompt gives up cleanly. */
  private generation = 0
  /** start() has resolved; later changes go out through onSources. */
  private announced = false
  /** Messages from before start() resolved, folded into its result. */
  private notes: string[] = []
  private systemPending = false
  private reopening = false
  /** Microphone re-opens since it last delivered real sound (at most one). */
  private micRetries = 0
  private openRequests = 0

  constructor(private readonly events: CaptureEvents) {}

  async start(): Promise<CaptureResult> {
    const generation = ++this.generation
    const cancelled = (): boolean => generation !== this.generation
    this.chunkers.clear()
    this.origins.clear()
    this.live = { me: false, them: false }
    this.notes = []
    this.announced = false
    this.micRetries = 0
    this.running = true
    const ctx = createContext()
    this.ctx = ctx
    // Something (an output device change, the system) can suspend it; ask it to keep running.
    ctx.onstatechange = () => {
      if (this.ctx === ctx && this.running && ctx.state === 'suspended') void ctx.resume().catch(() => undefined)
    }
    await ctx.audioWorklet.addModule(workletUrl).catch(async (error: unknown) => {
      await this.stop()
      throw error
    })
    // Not awaited: without a working output this promise can stay pending forever.
    void ctx.resume().catch(() => undefined)
    navigator.mediaDevices.addEventListener('devicechange', this.onDeviceChange)

    try {
      const mic = await this.whileWaiting(navigator.mediaDevices.getUserMedia(MIC))
      if (cancelled()) stopStream(mic)
      else this.attachMic(mic)
    } catch {
      if (!cancelled()) this.notes.push(MIC_UNHEARD)
    }
    if (cancelled()) throw new Error('cancelled')

    // System audio: a quick answer is part of the first status. A slow one (macOS asking
    // for permission) must not hold up your side, so it's attached whenever it arrives.
    this.systemPending = true
    const display = this.whileWaiting(navigator.mediaDevices.getDisplayMedia({ audio: true, video: true }))
    const settled = display.then(
      (stream) => this.onSystemAudio(generation, stream),
      () => this.onSystemAudio(generation, null)
    )
    if (this.live.me) await Promise.race([settled, delay(NOTICE_AFTER_MS)])
    else await settled
    if (cancelled()) throw new Error('cancelled')

    const { me: microphone, them: systemAudio } = this.live
    if (!microphone && !systemAudio && !this.systemPending) {
      await this.stop()
      throw new Error('Sotto could not hear your microphone or your computer’s audio. Check the permissions in Settings.')
    }

    this.levelTimer = window.setInterval(() => {
      this.events.onLevel({ me: this.chunkers.get('me')?.level ?? 0, them: this.chunkers.get('them')?.level ?? 0 })
    }, 70)
    this.announced = true
    return { microphone, systemAudio, waiting: this.systemPending, message: this.notes.join(' ') || undefined }
  }

  /** Stop capturing; the last unfinished phrase of each speaker is still sent. */
  async stop(): Promise<void> {
    this.generation++
    this.running = false
    navigator.mediaDevices.removeEventListener('devicechange', this.onDeviceChange)
    window.clearInterval(this.levelTimer)
    this.sources.forEach((s) => this.detach(s))
    this.sources.clear()
    for (const speaker of [...this.chunkers.keys()]) this.flush(speaker)
    this.live = { me: false, them: false }
    this.systemPending = false
    this.reopening = false
    this.openRequests = 0
    this.events.onNotice(null)
    await this.ctx?.close().catch(() => undefined)
    this.ctx = null
    this.events.onLevel({ me: 0, them: 0 })
  }

  // ---- sources ----

  private attachMic(stream: MediaStream): void {
    const track = stream.getAudioTracks()[0]
    if (track?.readyState === 'live') this.attach(stream, 'me', track)
    else throw new Error('ended')
  }

  /** getDisplayMedia answered (stream) or failed (null), possibly long after start(). */
  private onSystemAudio(generation: number, stream: MediaStream | null): void {
    if (generation !== this.generation) {
      stopStream(stream) // listening was stopped while the prompt was open
      return
    }
    this.systemPending = false
    stream?.getVideoTracks().forEach((t) => t.stop())
    const track = stream?.getAudioTracks()[0]
    // macOS without the system-audio permission gives a track that is already ended.
    if (track?.readyState === 'live') {
      this.attach(new MediaStream([track]), 'them', track)
      if (this.announced) this.report('Now listening to your computer’s audio too.')
    } else {
      stopStream(stream)
      this.report(SYSTEM_UNHEARD)
    }
  }

  private attach(stream: MediaStream, speaker: Speaker, track: MediaStreamTrack): void {
    const ctx = this.ctx!
    this.flush(speaker)
    this.chunkers.set(speaker, new SpeechChunker())
    this.origins.set(speaker, Date.now())
    const input = ctx.createMediaStreamSource(stream)
    const worklet = new AudioWorkletNode(ctx, 'pcm-capture')
    // The worklet only runs while the graph pulls it, so route it to the (silent) output
    // through a muted gain. With sinkId 'none' there is no device, but this stays harmless.
    const mute = ctx.createGain()
    mute.gain.value = 0
    input.connect(worklet)
    worklet.connect(mute).connect(ctx.destination)
    const source: Source = { stream, track, nodes: [input, worklet, mute], worklet, received: false, heard: false }
    worklet.port.onmessage = (e: MessageEvent<Float32Array>) => this.feed(speaker, source, e.data)
    track.onended = () => this.died(speaker, source)
    // Proof of life: samples must arrive, and the mic must be louder than digital silence.
    source.check = window.setTimeout(() => {
      if (!source.received || (SILENCE_CHECKED.has(speaker) && !source.heard)) this.died(speaker, source)
    }, CHECK_MS)
    this.sources.set(speaker, source)
    this.live[speaker] = true
  }

  private detach(source: Source): void {
    window.clearTimeout(source.check)
    source.track.onended = null
    source.worklet.port.onmessage = null
    source.nodes.forEach((n) => n.disconnect())
    stopStream(source.stream)
  }

  /** A source ended or never delivered audio. The mic gets one re-open first. */
  private died(speaker: Speaker, source: Source): void {
    if (!this.running || this.sources.get(speaker) !== source) return
    this.detach(source)
    this.sources.delete(speaker)
    if (speaker === 'me' && this.micRetries < 1) {
      this.micRetries++
      void this.reopenMic()
      return
    }
    this.lose(speaker)
  }

  /** Give up on a source and say so. */
  private lose(speaker: Speaker): void {
    this.flush(speaker)
    this.live[speaker] = false
    this.report(speaker === 'me' ? MIC_UNHEARD : SYSTEM_UNHEARD)
  }

  /** Open the microphone again on whatever the default input is now. */
  private async reopenMic(): Promise<void> {
    if (this.reopening) return
    this.reopening = true
    const generation = this.generation
    try {
      const stream = await navigator.mediaDevices.getUserMedia(MIC)
      if (generation !== this.generation) return stopStream(stream)
      this.attachMic(stream)
      this.report(`Switched to ${stream.getAudioTracks()[0].label || 'your default microphone'}.`)
    } catch {
      if (generation === this.generation) this.lose('me')
    } finally {
      if (generation === this.generation) this.reopening = false
    }
  }

  /** A device was plugged in or removed: follow the default input if ours is gone. */
  private onDeviceChange = async (): Promise<void> => {
    const source = this.sources.get('me')
    if (!source || this.reopening) return
    const devices = await navigator.mediaDevices.enumerateDevices().catch(() => null)
    if (!devices || this.sources.get('me') !== source) return
    if (inputDeviceGone(source.track.getSettings(), devices.filter((d) => d.kind === 'audioinput'))) {
      this.detach(source)
      this.sources.delete('me')
      void this.reopenMic() // a vanished device is not a dead mic, so no retry is used up
    }
  }

  /** Tell the page what changed (or keep it for start()'s result). */
  private report(message: string): void {
    if (!this.running) return
    if (!this.announced) {
      this.notes.push(message)
      return
    }
    this.events.onSources({ microphone: this.live.me, systemAudio: this.live.them, waiting: this.systemPending, message })
  }

  /** Show the permission hint if a media request takes a while; clear it when it settles. */
  private whileWaiting<T>(request: Promise<T>): Promise<T> {
    const generation = this.generation
    let shown = false
    const timer = window.setTimeout(() => {
      if (generation !== this.generation) return
      shown = true
      if (this.openRequests++ === 0) this.events.onNotice(WAITING_FOR_PERMISSION)
    }, NOTICE_AFTER_MS)
    return request.finally(() => {
      window.clearTimeout(timer)
      if (shown && generation === this.generation && --this.openRequests === 0) this.events.onNotice(null)
    })
  }

  // ---- samples ----

  /** Samples from a worklet. Ignored once stopped or replaced (messages can still be in flight). */
  private feed(speaker: Speaker, source: Source, samples: Float32Array): void {
    const chunker = this.chunkers.get(speaker)
    if (!this.running || !chunker || this.sources.get(speaker) !== source) return
    source.received = true
    if (!source.heard && hasSignal(samples)) {
      source.heard = true
      if (speaker === 'me') this.micRetries = 0
    }
    for (const chunk of chunker.push(samples)) this.emit(speaker, chunk)
  }

  /** Send a speaker's last unfinished phrase and drop its chunker. */
  private flush(speaker: Speaker): void {
    const last = this.chunkers.get(speaker)?.flush()
    if (last) this.emit(speaker, last)
    this.chunkers.delete(speaker)
  }

  private emit(speaker: Speaker, chunk: SpeechChunk): void {
    const pcm = floatToPcm16(chunk.audio)
    this.events.onChunk({
      speaker,
      pcm: pcm.buffer as ArrayBuffer,
      at: (this.origins.get(speaker) ?? Date.now()) + Math.round((chunk.startSample / SAMPLE_RATE) * 1000)
    })
  }
}
