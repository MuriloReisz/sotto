import type { AudioStatus } from './types'

// Every start/stop command main sends to the page carries the id of a capture session,
// and every status the page sends back carries it too. Main only acts on statuses for
// the session it is waiting on; anything else answers a start it already gave up on
// (cancelled while a permission prompt was open) or a session that already ended.
// Pure logic, unit-tested in tests/listen-session.test.ts.

/** What main does with a status from the page. */
export type StatusRoute = 'handle' | 'ignore' | 'stop'

/**
 * `currentId` is the session main is starting or running, 0 when none. A late 'started'
 * from another session means capture is (or was) running that nobody wants: it gets a
 * stop and never turns listening on. Other late statuses are dropped.
 */
export function routeAudioStatus(status: Pick<AudioStatus, 'id' | 'state'>, currentId: number): StatusRoute {
  if (currentId !== 0 && status.id === currentId) return 'handle'
  return status.state === 'started' ? 'stop' : 'ignore'
}
