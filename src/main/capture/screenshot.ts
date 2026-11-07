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
/** macOS returned no image without saying "denied": its prompt is showing for the first
 *  time, or Screen Recording was just switched on and Sotto must be reopened. */
export class ScreenNotAllowedYetError extends Error {}

export const SCREEN_PERMISSION_HELP =
  process.platform === 'darwin'
    ? [
        '**Sotto can’t see your screen yet.** macOS needs your OK once:',
        '',
        '1. Open **System Settings → Privacy & Security → Screen & System Audio Recording**.',
        '2. Turn on **Sotto** (use **+** to add it from Applications if it isn’t listed).',
        '3. When macOS asks, click **Quit & Reopen**. Sotto only gets access after a restart.',
        '',
        'Then press Ask screen again. Settings → Permissions → **Screen recording** opens that page for you.'
      ].join('\n')
    : '**Sotto can’t see your screen.** Check Windows Settings → Privacy & security → Screen capture, then try again.'

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
    if (permission === 'granted') throw new Error('Nothing to capture. Is the screen locked or asleep?')
    throw new ScreenNotAllowedYetError('Screen Recording is not allowed yet.')
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
