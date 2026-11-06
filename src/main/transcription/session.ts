import { randomUUID } from 'node:crypto'
import { IPC } from '../../shared/ipc'
import { cleanText, isSpeech } from '../../shared/transcript'
import type { AudioChunk, TranscriptSegment } from '../../shared/types'
import { pcm16ToWav } from '../../shared/wav'
import { sendToUi } from '../state'
import { transcribe } from './whisper-server'

// The transcript of the current (or last) listening session. Chunks of speech arrive
// from the UI, are transcribed one at a time in arrival order, and each recognised
// line is pushed back to the UI.

let segments: TranscriptSegment[] = []
let queue: Promise<void> = Promise.resolve()
let failures = 0

export function getTranscript(): TranscriptSegment[] {
  return segments
}

export function resetTranscript(): void {
  segments = []
  failures = 0
  sendToUi(IPC.transcriptReset)
}

export function addChunk(chunk: AudioChunk): void {
  queue = queue.then(async () => {
    try {
      const text = cleanText(await transcribe(pcm16ToWav(new Uint8Array(chunk.pcm))))
      if (!isSpeech(text)) return
      const segment: TranscriptSegment = { id: randomUUID(), speaker: chunk.speaker, text, at: chunk.at }
      // Keep the list in time order even if a chunk from the other speaker finished first.
      segments = [...segments, segment].sort((a, b) => a.at - b.at)
      sendToUi(IPC.transcriptSegment, segment)
    } catch (error) {
      if (++failures <= 3) console.error('[transcription] chunk failed:', error)
    }
  })
}

/** Resolves once every chunk received so far has been transcribed. */
export function drained(): Promise<void> {
  return queue
}
