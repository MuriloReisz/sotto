import type { Bounds } from './types'

// Pure window-placement maths, kept free of Electron so it can be unit-tested with
// made-up monitor layouts. A "work area" is a display minus the menu bar / Dock / taskbar.

/** Smallest part of the overlay that must overlap a display for saved bounds to be reused. */
const MIN_VISIBLE = { width: 100, height: 40 }

export function intersection(a: Bounds, b: Bounds): Bounds | null {
  const x = Math.max(a.x, b.x)
  const y = Math.max(a.y, b.y)
  const right = Math.min(a.x + a.width, b.x + b.width)
  const bottom = Math.min(a.y + a.height, b.y + b.height)
  return right > x && bottom > y ? { x, y, width: right - x, height: bottom - y } : null
}

/** Shrink `rect` to fit inside `area`, then slide it fully inside. */
export function clampInto(rect: Bounds, area: Bounds): Bounds {
  const width = Math.min(rect.width, area.width)
  const height = Math.min(rect.height, area.height)
  const x = Math.min(Math.max(rect.x, area.x), area.x + area.width - width)
  const y = Math.min(Math.max(rect.y, area.y), area.y + area.height - height)
  return { x, y, width, height }
}

/** The work area containing the rect's centre, or else the one it overlaps most. */
export function areaFor(rect: Bounds, areas: Bounds[]): Bounds {
  const cx = rect.x + rect.width / 2
  const cy = rect.y + rect.height / 2
  const containing = areas.find((a) => cx >= a.x && cx < a.x + a.width && cy >= a.y && cy < a.y + a.height)
  if (containing) return containing
  const overlap = (a: Bounds): number => {
    const i = intersection(rect, a)
    return i ? i.width * i.height : 0
  }
  return [...areas].sort((a, b) => overlap(b) - overlap(a))[0]
}

/**
 * Where to open the overlay: the saved position if a usable part of the window would
 * still be on a connected display (then pulled fully on-screen, so the command bar is
 * always reachable), otherwise centred at the top of the given display.
 */
export function placeOverlay(
  saved: { x: number; y: number } | null,
  size: { width: number; height: number },
  areas: Bounds[],
  home: Bounds,
  margin: number
): Bounds {
  if (saved) {
    const rect = { ...saved, ...size }
    const usable = areas.some((a) => {
      const i = intersection(rect, a)
      return i !== null && i.width >= MIN_VISIBLE.width && i.height >= MIN_VISIBLE.height
    })
    if (usable) return clampInto(rect, areaFor(rect, areas))
  }
  return topCenter(size, home, margin)
}

/** Centred horizontally, `margin` px below the top of the work area. */
export function topCenter(size: { width: number; height: number }, area: Bounds, margin: number): Bounds {
  return clampInto(
    { ...size, x: Math.round(area.x + (area.width - size.width) / 2), y: area.y + margin },
    area
  )
}

/**
 * One press of a move hotkey. Moves `step` px within the current display; when the
 * overlay is already against that display's edge and another display lies in that
 * direction, it jumps onto the neighbouring display.
 */
export function moveOverlayBounds(
  bounds: Bounds,
  dx: -1 | 0 | 1,
  dy: -1 | 0 | 1,
  areas: Bounds[],
  step: number
): Bounds {
  const current = areaFor(bounds, areas)
  const moved = clampInto({ ...bounds, x: bounds.x + dx * step, y: bounds.y + dy * step }, current)
  if (moved.x !== bounds.x || moved.y !== bounds.y) return moved

  // Stuck at an edge: look for the nearest display on that side that lines up with this one.
  const neighbours = areas.filter((a) => {
    if (a === current) return false
    if (dx === 1) return a.x >= current.x + current.width - 1 && overlaps1d(a.y, a.height, current.y, current.height)
    if (dx === -1) return a.x + a.width <= current.x + 1 && overlaps1d(a.y, a.height, current.y, current.height)
    if (dy === 1) return a.y >= current.y + current.height - 1 && overlaps1d(a.x, a.width, current.x, current.width)
    if (dy === -1) return a.y + a.height <= current.y + 1 && overlaps1d(a.x, a.width, current.x, current.width)
    return false
  })
  if (neighbours.length === 0) return moved
  const distance = (a: Bounds): number => Math.abs(a.x - current.x) + Math.abs(a.y - current.y)
  const next = neighbours.sort((a, b) => distance(a) - distance(b))[0]

  // Enter the neighbour at its near edge, keeping the other coordinate where it was.
  const entry = {
    ...bounds,
    x: dx === 1 ? next.x : dx === -1 ? next.x + next.width - bounds.width : bounds.x,
    y: dy === 1 ? next.y : dy === -1 ? next.y + next.height - bounds.height : bounds.y
  }
  return clampInto(entry, next)
}

function overlaps1d(start1: number, len1: number, start2: number, len2: number): boolean {
  return start1 < start2 + len2 && start2 < start1 + len1
}
