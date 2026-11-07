import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'
import { isSamePage, isUnder } from '../src/shared/trusted-url'

// What the packaged app loads (windows/overlay.ts → loadFile) and trusts (security.ts).
const RENDERER = 'file:///Applications/Sotto.app/Contents/Resources/app.asar/out/renderer/'
const PAGE = `${RENDERER}overlay/index.html`
const DEV = 'http://localhost:5173/'

describe('isUnder', () => {
  it('accepts files inside the folder', () => {
    expect(isUnder(PAGE, RENDERER)).toBe(true)
    expect(isUnder(`${RENDERER}assets/overlay-abc.js`, RENDERER)).toBe(true)
    expect(isUnder(`${DEV}overlay/index.html`, DEV)).toBe(true)
  })

  it('refuses other files, schemes and hosts', () => {
    expect(isUnder('file:///Users/me/Downloads/evil.html', RENDERER)).toBe(false)
    expect(isUnder('file:///Applications/Sotto.app/Contents/Resources/app.asar/out/renderer-evil/x.html', RENDERER)).toBe(false)
    expect(isUnder('https://localhost:5173/overlay/index.html', DEV)).toBe(false)
    expect(isUnder('http://localhost:5174/overlay/index.html', DEV)).toBe(false)
    expect(isUnder('http://localhost:5173.evil.com/', DEV)).toBe(false)
  })

  it('resolves ".." and refuses encoded slashes', () => {
    expect(isUnder(`${RENDERER}../../../../../../Users/me/evil.html`, RENDERER)).toBe(false)
    expect(isUnder(`${RENDERER}overlay%2F..%2F..%2Fevil.html`, RENDERER)).toBe(false)
    expect(isUnder(`${RENDERER}overlay%5C..%5Cevil.html`, RENDERER)).toBe(false)
  })

  it('refuses a bare origin and junk (the old permission check passed "file://" + "/")', () => {
    expect(isUnder('file:///', RENDERER)).toBe(false)
    expect(isUnder('null/', RENDERER)).toBe(false)
    expect(isUnder('', RENDERER)).toBe(false)
    expect(isUnder(PAGE, 'not a url')).toBe(false)
  })
})

describe('isSamePage', () => {
  it('matches the overlay page, ignoring query and hash', () => {
    expect(isSamePage(PAGE, PAGE)).toBe(true)
    expect(isSamePage(`${PAGE}#settings`, PAGE)).toBe(true)
    expect(isSamePage(`${PAGE}?x=1`, PAGE)).toBe(true)
    expect(isSamePage(`${DEV}overlay/index.html`, `${DEV}overlay/index.html`)).toBe(true)
  })

  it('matches however the path is escaped', () => {
    const path = '/Users/Murilo Reis/Apps/Sottó.app/out/renderer/overlay/index.html'
    const page = pathToFileURL(path).href
    expect(isSamePage('file:///Users/Murilo%20Reis/Apps/Sott%C3%B3.app/out/renderer/overlay/index.html', page)).toBe(true)
    expect(isSamePage(`file://${path}`, page)).toBe(true)
  })

  it('refuses any other page, even next to it', () => {
    expect(isSamePage(`${RENDERER}overlay/other.html`, PAGE)).toBe(false)
    expect(isSamePage('file:///Users/me/Downloads/index.html', PAGE)).toBe(false)
    expect(isSamePage(`${RENDERER}overlay/sub/../index.html`, PAGE)).toBe(true) // resolves to the page itself
    expect(isSamePage(`${RENDERER}x%2F..%2Foverlay/index.html`, PAGE)).toBe(false)
    expect(isSamePage('file://', PAGE)).toBe(false)
    expect(isSamePage('file:///', PAGE)).toBe(false)
    expect(isSamePage('', PAGE)).toBe(false)
  })
})
