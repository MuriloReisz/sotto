import type { BrowserWindow } from 'electron'
import koffi from 'koffi'

// macOS only. Stops a click on the overlay from activating Sotto, so the app you're
// working in stays frontmost (no "window lost focus" event for a browser page to notice).
//
// Why this is needed: Electron's `type: 'panel'` adds NSWindowStyleMaskNonactivatingPanel
// after the window is created. AppKit ignores that mask when it's added late, so clicks
// still activate the app (tested 2026-11-06: Terminal -> Electron on one click).
// `-[NSWindow _setPreventsActivation:]` is a private AppKit method (also used by Wine
// for the same problem). Private means Apple could remove it: we check it exists first
// and simply do nothing if it doesn't.
//
// We call it through the Objective-C runtime with koffi (an FFI library with prebuilt
// binaries), which avoids compiling a native Node addon.

type Ptr = unknown

let objc: {
  sel: (name: string) => Ptr
  sendPtr: (target: Ptr, selector: Ptr) => Ptr
  sendBool: (target: Ptr, selector: Ptr, value: boolean) => void
  respondsTo: (target: Ptr, selector: Ptr, query: Ptr) => boolean
} | null = null

function runtime(): NonNullable<typeof objc> {
  if (!objc) {
    const lib = koffi.load('/usr/lib/libobjc.A.dylib')
    // objc_msgSend has no fixed signature, so we declare one typed variant per call shape.
    objc = {
      sel: lib.func('sel_registerName', 'void *', ['str']),
      sendPtr: lib.func('objc_msgSend', 'void *', ['void *', 'void *']),
      sendBool: lib.func('objc_msgSend', 'void', ['void *', 'void *', 'bool']),
      respondsTo: lib.func('objc_msgSend', 'bool', ['void *', 'void *', 'void *'])
    }
  }
  return objc
}

/** Returns true if the window now refuses to activate the app on click. */
export function preventActivationOnClick(win: BrowserWindow): boolean {
  if (process.platform !== 'darwin') return false
  try {
    const rt = runtime()
    // getNativeWindowHandle() is a buffer holding an NSView* pointer on macOS.
    const view = koffi.decode(win.getNativeWindowHandle(), 'void *')
    const nsWindow = rt.sendPtr(view, rt.sel('window'))
    const setter = rt.sel('_setPreventsActivation:')
    if (!rt.respondsTo(nsWindow, rt.sel('respondsToSelector:'), setter)) {
      console.warn('[sotto] _setPreventsActivation: not available on this macOS; clicks will activate the app')
      return false
    }
    rt.sendBool(nsWindow, setter, true)
    return true
  } catch (error) {
    console.warn('[sotto] could not make the overlay non-activating:', error)
    return false
  }
}
