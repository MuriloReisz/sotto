// Tiny inline icon set (stroke icons, 16px), so there are no image files or icon fonts.

const PATHS = {
  screen: 'M2.5 3.5h11v7.5h-11z M6 14h4 M8 11v3',
  mic: 'M8 2.5a2 2 0 0 1 2 2v3.5a2 2 0 0 1-4 0V4.5a2 2 0 0 1 2-2z M4.5 7.5a3.5 3.5 0 0 0 7 0 M8 11v2.5',
  chat: 'M2.5 3.5h11v7h-6l-3 2.5v-2.5h-2z',
  notes: 'M4 2.5h6l2.5 2.5v8.5h-8.5z M6 7h4.5 M6 9.5h4.5 M6 12h2.5',
  gear: 'M8 5.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5z M8 1.5v2 M8 12.5v2 M1.5 8h2 M12.5 8h2 M3.4 3.4l1.4 1.4 M11.2 11.2l1.4 1.4 M3.4 12.6l1.4-1.4 M11.2 4.8l1.4-1.4',
  close: 'M4 4l8 8 M12 4l-8 8',
  chevron: 'M4 6l4 4 4-4',
  send: 'M2.5 8h9 M8 4.5l3.5 3.5L8 11.5',
  stop: 'M5 5h6v6H5z',
  plus: 'M8 3v10 M3 8h10',
  copy: 'M5.5 5.5h7v7h-7z M3.5 10.5v-7h7',
  open: 'M9 2.5h4.5V7 M13.5 2.5L7.5 8.5 M11.5 9.5v4h-9v-9h4',
  search: 'M7 2.5a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9z M10.5 10.5l3 3',
  help: 'M8 1.8a6.2 6.2 0 1 1 0 12.4A6.2 6.2 0 0 1 8 1.8z M6.2 6.2a1.9 1.9 0 1 1 2.6 1.8c-.5.2-.8.6-.8 1.1v.4 M8 11.6v.1'
} as const

export type IconName = keyof typeof PATHS

export function Icon({ name, size = 16 }: { name: IconName; size?: number }): React.JSX.Element {
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d={PATHS[name]} stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
