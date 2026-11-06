import { describe, expect, it } from 'vitest'
import { moveOverlayBounds, placeOverlay } from '../src/shared/geometry'

// Mirrors Murilo's real setup: MacBook (main) with an external 1080p monitor to its left.
const laptop = { x: 0, y: 25, width: 1728, height: 1092 }
const external = { x: -1920, y: 0, width: 1920, height: 1080 }
const areas = [laptop, external]
const size = { width: 440, height: 560 }

describe('moveOverlayBounds', () => {
  it('moves by one step inside the current display', () => {
    const b = { x: 500, y: 200, ...size }
    expect(moveOverlayBounds(b, -1, 0, areas, 40)).toEqual({ ...b, x: 460 })
    expect(moveOverlayBounds(b, 0, 1, areas, 40)).toEqual({ ...b, y: 240 })
  })

  it('stops at the edge before jumping', () => {
    const b = { x: 20, y: 200, ...size }
    expect(moveOverlayBounds(b, -1, 0, areas, 40)).toEqual({ ...b, x: 0 })
  })

  it('jumps to the neighbouring display when already against the edge', () => {
    const b = { x: 0, y: 200, ...size }
    expect(moveOverlayBounds(b, -1, 0, areas, 40)).toEqual({ ...b, x: -440 })
  })

  it('jumps back the other way', () => {
    const b = { x: -440, y: 200, ...size }
    expect(moveOverlayBounds(b, 1, 0, areas, 40)).toEqual({ ...b, x: 0 })
  })

  it('stays put at an edge with no display beyond it', () => {
    const b = { x: 1288, y: 200, ...size }
    expect(moveOverlayBounds(b, 1, 0, areas, 40)).toEqual(b)
  })
})

describe('placeOverlay', () => {
  it('restores saved bounds that are on a connected display', () => {
    const saved = { x: -600, y: 150, ...size }
    expect(placeOverlay(saved, areas, laptop, size, 24)).toEqual(saved)
  })

  it('pulls mostly off-screen bounds fully back on-screen', () => {
    const saved = { x: 1600, y: 900, ...size }
    expect(placeOverlay(saved, areas, laptop, size, 24)).toEqual({ x: 1288, y: 557, ...size })
  })

  it('falls back to the default spot when the saved display is gone', () => {
    const saved = { x: 4000, y: 100, ...size }
    expect(placeOverlay(saved, areas, laptop, size, 24)).toEqual({ x: 1264, y: 49, ...size })
  })

  it('shrinks a window larger than the display', () => {
    const small = { x: 0, y: 0, width: 800, height: 400 }
    const placed = placeOverlay({ x: 0, y: 0, width: 1000, height: 900 }, [small], small, size, 24)
    expect(placed).toEqual({ x: 0, y: 0, width: 800, height: 400 })
  })
})
