import { desktopCapturer, session, systemPreferences } from 'electron'
import { MIN_WORDS_FOR_NOTES } from '../../shared/defaults'
import { IPC } from '../../shared/ipc'
import { wordCount } from '../../shared/transcript'
import type { AudioStatus } from '../../shared/types'
import { writeMeetingNotes } from '../notes/meetings'
import { isTrustedUrl } from '../security'
import { getState, sendToUi, setState, showView, toast } from '../state'
import { showOverlay } from '../windows/overlay'
import { drained, getTranscript, resetTranscript } from './session'
import { ensureWhisperServer, transcriptionStatus } from './whisper-server'

// Start/stop listening. The overlay page captures the audio (browser audio APIs live
// there); this file coordinates: speech recognizer up, capture on/off, notes at the end.

let startedAt = 0
let stopping = false
/** True from the toggle until capture reports back (permission prompts can take a while). */
let starting = false

/**
 * System audio comes from `getDisplayMedia` in the page. This handler answers it
 * without showing a picker: whole screen (video is discarded) + 'loopback' audio
 * (macOS CoreAudio tap / Windows WASAPI loopback). Only Sotto's own page may ask.
 */
export function registerSystemAudioHandler(): void {
  session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
    if (!isTrustedUrl(request.frame?.url ?? '')) {
      callback({})
      return
    }
    desktopCapturer
      .getSources({ types: ['screen'] })
      .then((sources) => callback(sources[0] ? { video: sources[0], audio: 'loopback' } : {}))
      .catch(() => callback({})) // always answer, or the page's getDisplayMedia hangs
  })
}

export async function toggleListening(): Promise<void> {
  if (getState().listening) await stopListening()
  else if (starting) toast('Still starting: answer the macOS permission prompt if one is open.')
  else {
    starting = true
    const handedOff = await startListening().catch(() => false)
    // Handed off: the page reports 'started' or 'error' (onAudioStatus clears the flag);
    // the timer is only a safety net. Not handed off: allow a retry straight away.
    if (handedOff) setTimeout(() => (starting = false), 15_000)
    else starting = false
  }
}

/** Returns true once the page has been told to start capturing. */
async function startListening(): Promise<boolean> {
  if (stopping) {
    toast('Still finishing the last session. Try again in a moment.')
    return false
  }
  showOverlay()
  const status = transcriptionStatus()
  if (!status.ready) {
    toast(status.detail, 'error')
    showView('settings')
    return false
  }
  showView('transcript')
  await askForMicrophone()
  try {
    await ensureWhisperServer()
  } catch (error) {
    toast(`Speech recognition failed to start: ${(error as Error).message}`, 'error')
    return false
  }
  resetTranscript()
  startedAt = Date.now()
  sendToUi(IPC.audioCommand, { type: 'start' })
  // `listening` is set when the page confirms capture started (onAudioStatus).
  return true
}

/**
 * macOS: ask for the microphone up front (from the main process) so the prompt appears
 * right away with a clear message, instead of capture silently waiting on it. If you say
 * no, Sotto still listens to the computer's audio ("Them") without your side.
 * In development the permission belongs to the terminal app that launched Sotto.
 */
async function askForMicrophone(): Promise<void> {
  if (process.platform !== 'darwin') return
  const status = systemPreferences.getMediaAccessStatus('microphone')
  if (status === 'not-determined') {
    toast('macOS is asking for microphone access. Choose Allow to transcribe your side of the call.')
    await systemPreferences.askForMediaAccess('microphone')
  } else if (status === 'denied' || status === 'restricted') {
    toast('Microphone access is off, so only the other side will be transcribed. Turn it on in Settings → Permissions.', 'error')
  }
}

async function stopListening(): Promise<void> {
  if (stopping) return
  stopping = true
  sendToUi(IPC.audioCommand, { type: 'stop' })
  // The page answers with status 'stopped' after sending its last chunk.
}

export async function onAudioStatus(status: AudioStatus): Promise<void> {
  starting = false
  if (status.state === 'started') {
    setState({ listening: { since: startedAt, microphone: status.microphone, systemAudio: status.systemAudio } })
    if (status.message) toast(status.message, 'info')
    return
  }
  if (status.state === 'error') {
    stopping = false
    setState({ listening: null })
    toast(status.message ?? 'Could not start listening.', 'error')
    return
  }
  // stopped: finish transcribing what's queued, then write the notes.
  const endedAt = Date.now()
  setState({ listening: null })
  await drained()
  stopping = false
  const segments = getTranscript()
  if (wordCount(segments) >= MIN_WORDS_FOR_NOTES) {
    void writeMeetingNotes(segments, startedAt, endedAt)
  } else if (segments.length > 0) {
    toast('Too short for meeting notes. Use "Write notes" in the Notes tab if you still want them.')
  }
}

/** Manual "Write notes" for the latest transcript (e.g. a short call). */
export function writeNotesNow(): void {
  const segments = getTranscript()
  if (segments.length === 0) {
    toast('Nothing to summarise yet: start listening first.')
    return
  }
  void writeMeetingNotes(segments, segments[0].at, segments[segments.length - 1].at)
}
