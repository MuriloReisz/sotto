import { desktopCapturer, session, systemPreferences } from 'electron'
import { MIN_WORDS_FOR_NOTES } from '../../shared/defaults'
import { formatAccelerator } from '../../shared/hotkey-format'
import { IPC } from '../../shared/ipc'
import { routeAudioStatus } from '../../shared/listen-session'
import { wordCount } from '../../shared/transcript'
import type { AudioStatus } from '../../shared/types'
import { writeMeetingNotes } from '../notes/meetings'
import { isOverlayPage } from '../security'
import { getState, sendToUi, setState, showView, toast } from '../state'
import { showOverlay } from '../windows/overlay'
import { drained, getTranscript, resetTranscript } from './session'
import { ensureWhisperServer, transcriptionStatus } from './whisper-server'

// Start/stop listening. The overlay page captures the audio (browser audio APIs live
// there); this file coordinates: speech recognizer up, capture on/off, notes at the end.

let startedAt = 0
let stopping = false
/** The capture session being started or run (0 = none). Sent with every command; the
 *  page's statuses carry it back, so answers to a cancelled start can be told apart. */
let sessionId = 0
let lastSessionId = 0
/** True from the toggle until capture reports back (permission prompts can take a while). */
let starting = false
/** The page has had the start command this long without answering: probably a prompt. */
const START_PATIENCE_MS = 15_000
/** Set once START_PATIENCE_MS has passed; the next press then cancels the start. */
let stalled = false
let patienceTimer: NodeJS.Timeout | undefined
/** The page normally confirms a stop within a second; no answer means it crashed or hung. */
const STOP_PATIENCE_MS = 10_000
let stopTimer: NodeJS.Timeout | undefined

/**
 * System audio comes from `getDisplayMedia` in the page. This handler answers it
 * without showing a picker: whole screen (video is discarded) + 'loopback' audio
 * (macOS CoreAudio tap / Windows WASAPI loopback). Only Sotto's own page may ask.
 */
export function registerSystemAudioHandler(): void {
  session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
    if (!isOverlayPage(request.frame?.url ?? '')) {
      callback({})
      return
    }
    // Electron only hands out loopback audio together with a video stream. Use Sotto's
    // own page as that video (the renderer drops it straight away), so listening needs
    // no Screen Recording permission: only Microphone and System Audio Recording.
    if (request.frame) {
      callback({ video: request.frame, audio: 'loopback' })
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
  else if (starting && stalled) cancelStart()
  else if (starting) toast('Still starting: answer the macOS permission prompt if one is open.')
  else {
    starting = true
    const handedOff = await startListening().catch((error: unknown) => {
      console.error('[listening] start failed:', error)
      toast(`Could not start listening: ${error instanceof Error ? error.message : String(error)}`, 'error')
      return false
    })
    // Handed off: the page reports 'started', 'error' or 'stopped' (onAudioStatus clears
    // the flag). Not handed off: allow a retry straight away.
    if (handedOff) patienceTimer = setTimeout(onStartStalled, START_PATIENCE_MS)
    else startSettled()
  }
}

/** The start/stop listening shortcut for messages, e.g. " (⌘⇧A)", or "" when unset. */
function listenKey(): string {
  const { hotkeys, platform } = getState()
  const key = formatAccelerator(hotkeys.toggleListening, platform)
  return key ? ` (${key})` : ''
}

/**
 * Still no answer from the page: usually a macOS permission prompt is open (with no
 * microphone, capture waits for the system-audio prompt). Don't give up on it, since
 * you may still click Allow, but say what's happening and let the next press cancel.
 */
function onStartStalled(): void {
  if (!starting) return
  stalled = true
  toast(`Still waiting on a permission prompt. Answer it, or press Listen${listenKey()} again to cancel.`, 'error')
}

/** Give up on a stalled start. The page stops capture; whatever it answers for this
 *  session from now on is stale (a late 'started' gets another stop). */
function cancelStart(): void {
  const id = sessionId
  sessionId = 0
  startSettled()
  sendToUi(IPC.audioCommand, { type: 'stop', id })
  toast(`Stopped waiting. Press Listen${listenKey()} to try again.`)
}

function startSettled(): void {
  starting = false
  stalled = false
  clearTimeout(patienceTimer)
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
  sessionId = ++lastSessionId
  sendToUi(IPC.audioCommand, { type: 'start', id: sessionId })
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
  sendToUi(IPC.audioCommand, { type: 'stop', id: sessionId })
  // The page answers with status 'stopped' after sending its last chunk.
  stopTimer = setTimeout(onStopUnanswered, STOP_PATIENCE_MS)
}

/** The page never confirmed the stop (it crashed or hung): end the session from here. */
function onStopUnanswered(): void {
  if (!stopping) return
  toast('Audio capture stopped responding, so listening has ended.', 'error')
  void finishSession() // a 'stopped' arriving later is stale and ignored
}

export async function onAudioStatus(status: AudioStatus): Promise<void> {
  const route = routeAudioStatus(status, sessionId)
  if (route === 'stop') sendToUi(IPC.audioCommand, { type: 'stop', id: status.id })
  if (route !== 'handle') return
  const microphone = status.microphone === true
  const systemAudio = status.systemAudio === true
  if (status.state === 'changed') {
    // Mid-session: a source died, switched device or arrived late.
    const listening = getState().listening
    if (!listening || stopping) return
    const lost = (listening.microphone && !microphone) || (listening.systemAudio && !systemAudio)
    if (status.message) toast(status.message, lost ? 'error' : 'info')
    if (!microphone && !systemAudio && status.waiting !== true) {
      void stopListening() // nothing left to hear: stop cleanly (notes are still written)
      return
    }
    setState({ listening: { ...listening, microphone, systemAudio } })
    return
  }
  startSettled()
  if (status.state === 'started') {
    setState({ listening: { since: startedAt, microphone, systemAudio } })
    const missing = !microphone || (!systemAudio && status.waiting !== true)
    if (status.message) toast(status.message, missing ? 'error' : 'info')
    return
  }
  if (status.state === 'error') {
    sessionId = 0
    stopping = false
    clearTimeout(stopTimer)
    setState({ listening: null })
    toast(status.message ?? 'Could not start listening.', 'error')
    return
  }
  await finishSession()
}

/** Stopped: finish transcribing what's queued, then write the notes. */
async function finishSession(): Promise<void> {
  sessionId = 0
  clearTimeout(stopTimer)
  const endedAt = Date.now()
  setState({ listening: null })
  await drained()
  stopping = false
  const segments = getTranscript()
  if (wordCount(segments) >= MIN_WORDS_FOR_NOTES) {
    void writeMeetingNotes(segments, startedAt, endedAt)
  } else if (segments.length > 0) {
    toast('Too short for meeting notes. Use "Write meeting notes" in the Transcript tab if you still want them.')
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
