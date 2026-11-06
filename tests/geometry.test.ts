import { describe, expect, it } from 'vitest'
import { moveOverlayBounds, placeOverlay, topCenter } from '../src/shared/geometry'

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
  it('defaults to the top centre of the display', () => {
    expect(placeOverlay(null, size, areas, laptop, 12)).toEqual({ x: 644, y: 37, ...size })
    expect(topCenter(size, external, 12)).toEqual({ x: -1180, y: 12, ...size })
  })

  it('restores a saved position that is on a connected display', () => {
    expect(placeOverlay({ x: -600, y: 150 }, size, areas, laptop, 12)).toEqual({ x: -600, y: 150, ...size })
  })

  it('pulls a mostly off-screen position fully back on-screen', () => {
    expect(placeOverlay({ x: 1600, y: 900 }, size, areas, laptop, 12)).toEqual({ x: 1288, y: 557, ...size })
  })

  it('falls back to the top centre when the saved display is gone', () => {
    expect(placeOverlay({ x: 4000, y: 100 }, size, areas, laptop, 12)).toEqual({ x: 644, y: 37, ...size })
  })

  it('shrinks a window larger than the display', () => {
    const small = { x: 0, y: 0, width: 800, height: 400 }
    expect(placeOverlay({ x: 0, y: 0 }, { width: 1000, height: 900 }, [small], small, 0)).toEqual(small)
  })
})
