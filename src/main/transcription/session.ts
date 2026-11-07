import { randomUUID } from 'node:crypto'
import { addSegment } from '../../shared/echo'
import { IPC } from '../../shared/ipc'
import { cleanText, isSpeech } from '../../shared/transcript'
import type { AudioChunk, TranscriptSegment } from '../../shared/types'
import { pcm16ToWav } from '../../shared/wav'
import { sendToUi } from '../state'
import { getSettings } from '../store/settings'
import { transcribe } from './whisper-server'

// The transcript of the current (or last) listening session. Chunks of speech arrive
// from the UI, are transcribed one at a time in arrival order, and each recognised
// line is pushed back to the UI. Your microphone's copies of the other side (no
// headphones) are left out here, so the UI, Claude and the saved notes never see them
// (Settings → "Remove echo when you're not wearing headphones", on by default).

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
      // 16 kHz mono 16-bit: 32 bytes per millisecond.
      const durationMs = Math.round(chunk.pcm.byteLength / 32)
      const segment: TranscriptSegment = { id: randomUUID(), speaker: chunk.speaker, text, at: chunk.at, durationMs }
      // Keeps the list in time order even if a chunk from the other speaker finished first.
      const result = addSegment(segments, segment, { removeEcho: getSettings().removeEcho })
      segments = result.segments
      if (result.kept) sendToUi(IPC.transcriptSegment, segment)
      // A late "them" line showed that an earlier "me" line was its echo.
      for (const id of result.removed) sendToUi(IPC.transcriptRemove, id)
    } catch (error) {
      if (++failures <= 3) console.error('[transcription] chunk failed:', error)
    }
  })
}

/** Resolves once every chunk received so far has been transcribed. */
export function drained(): Promise<void> {
  return queue
}
