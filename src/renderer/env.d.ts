import type { VeilApi } from '../shared/ipc'

declare global {
  interface Window {
    /** Exposed by src/preload/index.ts. */
    veil: VeilApi
  }
}

export {}
