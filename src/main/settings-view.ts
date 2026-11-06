import { IPC } from '../shared/ipc'
import type { SettingsView } from '../shared/types'
import { listContextFiles } from './context/files'
import { notesFolder } from './notes/meetings'
import { sendToUi, setState } from './state'
import { hasApiKey } from './store/secrets'
import { getSettings } from './store/settings'
import { transcriptionStatus } from './transcription/whisper-server'

/** Settings as the UI sees them: no secrets, plus derived facts (key set? model found?). */
export function settingsView(): SettingsView {
  return {
    ...getSettings(),
    hasApiKey: hasApiKey(),
    notesFolderResolved: notesFolder(),
    contextFiles: listContextFiles(),
    transcription: transcriptionStatus()
  }
}

/** Push fresh settings to the UI and mirror the bits the overlay state uses. */
export function publishSettings(): void {
  const view = settingsView()
  setState({ opacity: view.opacity, hasApiKey: view.hasApiKey, onboarded: view.onboarded })
  sendToUi(IPC.settingsChanged, view)
}
