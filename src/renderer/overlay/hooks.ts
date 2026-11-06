import { useEffect, useState } from 'react'
import type {
  ChatItem,
  MeetingSummary,
  OverlayState,
  SettingsView,
  Toast,
  TranscriptSegment
} from '../../shared/types'

// Small hooks that mirror main-process data into React state. The main process is the
// source of truth; these fetch once and then follow its pushes.

export function useOverlayState(): OverlayState | null {
  const [state, setState] = useState<OverlayState | null>(null)
  useEffect(() => {
    void window.sotto.getState().then(setState)
    return window.sotto.onStateChanged(setState)
  }, [])
  return state
}

const TOAST_MS = 4500

export function useToasts(): Toast[] {
  const [toasts, setToasts] = useState<Toast[]>([])
  useEffect(
    () =>
      window.sotto.onToast((toast) => {
        setToasts((list) => [...list.slice(-1), toast]) // at most 2 on screen
        setTimeout(() => setToasts((list) => list.filter((t) => t.id !== toast.id)), TOAST_MS)
      }),
    []
  )
  return toasts
}

export function useChat(): ChatItem[] {
  const [items, setItems] = useState<ChatItem[]>([])
  useEffect(() => {
    void window.sotto.getChat().then(setItems)
    const offItem = window.sotto.onChatItem((item) =>
      setItems((list) => (list.some((x) => x.id === item.id) ? list.map((x) => (x.id === item.id ? item : x)) : [...list, item]))
    )
    const offReset = window.sotto.onChatReset(() => setItems([]))
    return () => {
      offItem()
      offReset()
    }
  }, [])
  return items
}

export function useTranscript(): TranscriptSegment[] {
  const [segments, setSegments] = useState<TranscriptSegment[]>([])
  useEffect(() => {
    void window.sotto.getTranscript().then(setSegments)
    const offSeg = window.sotto.onTranscriptSegment((s) => setSegments((list) => [...list, s].sort((a, b) => a.at - b.at)))
    const offReset = window.sotto.onTranscriptReset(() => setSegments([]))
    return () => {
      offSeg()
      offReset()
    }
  }, [])
  return segments
}

export function useSettings(): SettingsView | null {
  const [settings, setSettings] = useState<SettingsView | null>(null)
  useEffect(() => {
    void window.sotto.getSettings().then(setSettings)
    return window.sotto.onSettingsChanged(setSettings)
  }, [])
  return settings
}

export function useMeetings(): MeetingSummary[] {
  const [meetings, setMeetings] = useState<MeetingSummary[]>([])
  useEffect(() => {
    const load = (): void => void window.sotto.listMeetings().then(setMeetings)
    load()
    return window.sotto.onMeetingsChanged(load)
  }, [])
  return meetings
}

/** Seconds since `since`, ticking once a second (for the listening timer). */
export function useElapsed(since: number | null): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (since === null) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [since])
  return since === null ? 0 : Math.max(0, Math.floor((now - since) / 1000))
}
