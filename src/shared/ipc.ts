import type { OverlayState, Toast } from './types'

// The single source of truth for IPC channel names. Main, preload and renderer
// all import from here, so a renamed channel is a compile error, not a silent bug.
export const IPC = {
  // renderer -> main (request/response)
  getState: 'overlay:get-state',
  // renderer -> main (fire and forget)
  toggleClickThrough: 'overlay:toggle-click-through',
  hideOverlay: 'overlay:hide',
  // main -> renderer (push)
  stateChanged: 'overlay:state-changed',
  toast: 'overlay:toast'
} as const

/** The API the preload script exposes to the page as `window.sotto`. */
export interface SottoApi {
  getState(): Promise<OverlayState>
  toggleClickThrough(): void
  hideOverlay(): void
  /** Subscribe to state pushes. Returns an unsubscribe function. */
  onStateChanged(listener: (state: OverlayState) => void): () => void
  onToast(listener: (toast: Toast) => void): () => void
}
