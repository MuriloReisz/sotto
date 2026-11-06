import type { View } from '../../../shared/types'
import { Icon } from './Icon'

const TABS: { view: View; label: string }[] = [
  { view: 'chat', label: 'Chat' },
  { view: 'transcript', label: 'Transcript' },
  { view: 'notes', label: 'Notes' }
]

const TITLES: Partial<Record<View, string>> = { settings: 'Settings', help: 'Shortcuts and help' }

export function PanelHeader({ view, onView, onClose }: { view: View; onView: (v: View) => void; onClose: () => void }): React.JSX.Element {
  const title = TITLES[view]
  return (
    <div className="panel-head">
      {title ? (
        <h2 className="panel-title">{title}</h2>
      ) : (
        <div className="tabs" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.view}
              type="button"
              role="tab"
              aria-selected={view === t.view}
              className={`tab ${view === t.view ? 'is-active' : ''}`}
              onClick={() => onView(t.view)}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}
      <span className="panel-head-end">
        {view !== 'help' && (
          <button type="button" className="icon-btn" onClick={() => onView('help')} title="Shortcuts and help" aria-label="Shortcuts and help">
            <Icon name="help" />
          </button>
        )}
        <button type="button" className="icon-btn" onClick={onClose} title="Collapse" aria-label="Collapse panel">
          <Icon name="chevron" />
        </button>
      </span>
    </div>
  )
}
