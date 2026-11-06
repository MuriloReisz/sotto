import { desktopCapturer, screen, systemPreferences } from 'electron'

// Screenshot of the display under the mouse pointer. The overlay is content-protected,
// so it is not in the image (checked in tests on macOS 26), and nothing flickers.

/** Long edge in pixels. Larger images cost more and are slower without helping Claude much. */
const MAX_EDGE = 1568

export interface Screenshot {
  /** JPEG, base64 (no data: prefix), for the API. */
  base64: string
  /** Small JPEG data URL for the chat thumbnail. */
  thumbnail: string
}

export class ScreenPermissionError extends Error {}

export async function captureScreen(): Promise<Screenshot> {
  const permission = process.platform === 'darwin' ? systemPreferences.getMediaAccessStatus('screen') : 'granted'
  if (permission === 'denied' || permission === 'restricted') {
    throw new ScreenPermissionError('Sotto needs Screen Recording permission to see your screen.')
  }
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: {
      width: Math.round(display.size.width * display.scaleFactor),
      height: Math.round(display.size.height * display.scaleFactor)
    }
  })
  const source = sources.find((s) => s.display_id === String(display.id)) ?? sources[0]
  if (!source || source.thumbnail.isEmpty()) {
    // Permission is fine but nothing came back: the screen is locked or asleep, or (first
    // run) macOS has just shown its permission prompt.
    throw new Error(
      permission === 'granted'
        ? 'Nothing to capture. Is the screen locked or asleep?'
        : 'macOS needs to allow Screen Recording for Sotto. Allow it, then try again.'
    )
  }
  let image = source.thumbnail
  const { width, height } = image.getSize()
  const scale = Math.min(1, MAX_EDGE / Math.max(width, height))
  if (scale < 1) image = image.resize({ width: Math.round(width * scale), height: Math.round(height * scale), quality: 'best' })
  const thumb = image.resize({ width: 220, quality: 'good' })
  return {
    base64: image.toJPEG(80).toString('base64'),
    thumbnail: `data:image/jpeg;base64,${thumb.toJPEG(70).toString('base64')}`
  }
}
