import { describe, expect, it } from 'vitest'
import { routeAudioStatus } from '../src/shared/listen-session'

describe('routeAudioStatus', () => {
  it('handles every status of the current session', () => {
    for (const state of ['started', 'stopped', 'error', 'changed'] as const) {
      expect(routeAudioStatus({ id: 3, state }, 3)).toBe('handle')
    }
  })

  it('stops a capture that started after its start was cancelled', () => {
    // You cancelled a stalled start (main now waits on nothing), then the prompt was answered.
    expect(routeAudioStatus({ id: 3, state: 'started' }, 0)).toBe('stop')
    // ...or you already started again: the old capture must not count as the new one.
    expect(routeAudioStatus({ id: 3, state: 'started' }, 4)).toBe('stop')
  })

  it('ignores other statuses from a cancelled or finished session', () => {
    for (const state of ['stopped', 'error', 'changed'] as const) {
      expect(routeAudioStatus({ id: 3, state }, 0)).toBe('ignore')
      expect(routeAudioStatus({ id: 3, state }, 4)).toBe('ignore')
    }
  })

  it('never handles a status without a session', () => {
    expect(routeAudioStatus({ id: 0, state: 'stopped' }, 0)).toBe('ignore')
    expect(routeAudioStatus({ id: 0, state: 'started' }, 0)).toBe('stop')
  })
})
