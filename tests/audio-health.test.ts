import { describe, expect, it } from 'vitest'
import { SILENCE_FLOOR, describeSources, hasSignal, inputDeviceGone } from '../src/shared/audio-health'

describe('hasSignal', () => {
  it('treats exact zeros as dead silence', () => {
    expect(hasSignal(new Float32Array(48_000))).toBe(false)
  })

  it('treats samples at or below the floor as dead silence', () => {
    expect(hasSignal(new Float32Array(1600).fill(SILENCE_FLOOR))).toBe(false)
    expect(hasSignal(new Float32Array(1600).fill(-5e-7))).toBe(false)
  })

  it('hears a quiet room (mic noise floor)', () => {
    const room = new Float32Array(1600)
    for (let i = 0; i < room.length; i++) room[i] = (((i * 7919) % 200) - 100) * 1e-6 // about ±1e-4
    expect(hasSignal(room)).toBe(true)
  })

  it('hears a single non-silent sample, negative too', () => {
    const a = new Float32Array(1600)
    a[900] = -3e-5 // one 16-bit step
    expect(hasSignal(a)).toBe(true)
  })

  it('handles an empty block', () => {
    expect(hasSignal(new Float32Array(0))).toBe(false)
  })
})

describe('inputDeviceGone', () => {
  const builtIn = { deviceId: 'mbp', groupId: 'g-mbp' }

  it('is false while the device is still listed', () => {
    expect(inputDeviceGone({ deviceId: 'mbp', groupId: 'g-mbp' }, [builtIn])).toBe(false)
  })

  it('is true when the device was removed', () => {
    expect(inputDeviceGone({ deviceId: 'airpods', groupId: 'g-airpods' }, [builtIn])).toBe(true)
  })

  it('notices the default input switching to another device', () => {
    const track = { deviceId: 'default', groupId: 'g-airpods' }
    expect(inputDeviceGone(track, [{ deviceId: 'default', groupId: 'g-mbp' }, builtIn])).toBe(true)
    expect(inputDeviceGone(track, [{ deviceId: 'default', groupId: 'g-airpods' }, builtIn])).toBe(false)
  })

  it('compares ids only when groups are unknown', () => {
    expect(inputDeviceGone({ deviceId: 'mbp' }, [builtIn])).toBe(false)
    expect(inputDeviceGone({ deviceId: 'mbp', groupId: 'g' }, [{ deviceId: 'mbp', groupId: '' }])).toBe(false)
  })

  it('never reports a track without a device id as gone', () => {
    expect(inputDeviceGone({}, [])).toBe(false)
  })
})

describe('describeSources', () => {
  it('says what Sotto is listening to', () => {
    expect(describeSources(true, true)).toBe('Listening to your microphone and your computer’s audio.')
    expect(describeSources(true, false)).toBe('Listening to your microphone only.')
    expect(describeSources(false, true)).toBe('Listening to your computer’s audio only.')
    expect(describeSources(false, false)).toBe('Sotto can’t hear anything yet.')
  })
})
