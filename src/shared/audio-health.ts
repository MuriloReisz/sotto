// Is a capture source really working? Pure checks used by the page's audio capture,
// plus the plain-English lines the UI shows about it. No browser APIs: unit-tested.

/**
 * Below this, a sample counts as digital silence (-120 dBFS). Any real microphone has a
 * noise floor far above it, even in a quiet room (one 16-bit step is ~3e-5), so a
 * window with nothing louder means the device delivers no audio at all.
 */
export const SILENCE_FLOOR = 1e-6

/** True when at least one sample is louder than digital silence. */
export function hasSignal(samples: Float32Array, floor = SILENCE_FLOOR): boolean {
  for (let i = 0; i < samples.length; i++) if (Math.abs(samples[i]) > floor) return true
  return false
}

/** The bits of a MediaDeviceInfo / MediaTrackSettings we compare. */
export interface DeviceRef {
  deviceId?: string
  groupId?: string
}

/**
 * True when the microphone a track was opened on is no longer in the device list.
 * Compares the group too: the "default" entry keeps its id when macOS switches the
 * default input (AirPods disconnect), but its group changes to the new device.
 */
export function inputDeviceGone(track: DeviceRef, inputs: DeviceRef[]): boolean {
  if (!track.deviceId) return false // nothing to compare against
  return !inputs.some((d) => d.deviceId === track.deviceId && (!track.groupId || !d.groupId || d.groupId === track.groupId))
}

export const MIC_UNHEARD = 'Sotto can’t hear your microphone. Check System Settings › Privacy & Security › Microphone.'
export const SYSTEM_UNHEARD =
  'Sotto can’t hear your computer’s audio. Check System Settings › Privacy & Security › Screen & System Audio Recording.'
export const WAITING_FOR_PERMISSION = 'Waiting for macOS permission. Look for a dialog asking about your microphone or system audio.'

/** One line saying what Sotto is listening to right now. */
export function describeSources(microphone: boolean, systemAudio: boolean): string {
  if (microphone && systemAudio) return 'Listening to your microphone and your computer’s audio.'
  if (microphone) return 'Listening to your microphone only.'
  if (systemAudio) return 'Listening to your computer’s audio only.'
  return 'Sotto can’t hear anything yet.'
}
