import { useEffect, useState } from 'react'
import type { OverlayState, Toast } from '../../shared/types'

/** Live overlay state from the main process (null until the first fetch resolves). */
export function useOverlayState(): OverlayState | null {
  const [state, setState] = useState<OverlayState | null>(null)
  useEffect(() => {
    void window.sotto.getState().then(setState)
    return window.sotto.onStateChanged(setState)
  }, [])
  return state
}

const TOAST_MS = 4000

/** Short-lived messages pushed from the main process. */
export function useToasts(): Toast[] {
  const [toasts, setToasts] = useState<Toast[]>([])
  useEffect(
    () =>
      window.sotto.onToast((toast) => {
        setToasts((list) => [...list.slice(-2), toast]) // keep at most 3 on screen
        setTimeout(() => setToasts((list) => list.filter((t) => t.id !== toast.id)), TOAST_MS)
      }),
    []
  )
  return toasts
}
