import type { SottoApi } from '../shared/ipc'

declare global {
  interface Window {
    /** Exposed by src/preload/index.ts. */
    sotto: SottoApi
  }
}

export {}
