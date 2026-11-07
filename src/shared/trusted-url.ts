// URL checks behind Sotto's trust decisions (main/security.ts). Pure: unit-tested in
// tests/trusted-url.test.ts. Both sides go through the URL parser, so ".." segments are
// resolved before comparing, and an encoded slash ("%2F") is refused outright: it could
// turn into a real one when a file:// URL becomes a path.

function parse(url: string): URL | null {
  try {
    const parsed = new URL(url)
    return /%2f|%5c/i.test(parsed.pathname) ? null : parsed
  } catch {
    return null
  }
}

/** The path with escapes undone, so "%20" and " " (or two ways of encoding "é") match. */
function decodedPath(url: URL): string | null {
  try {
    return decodeURIComponent(url.pathname)
  } catch {
    return null
  }
}

/** True when `url` lies inside `folder` (a URL ending in "/"): same scheme and host, path below it. */
export function isUnder(url: string, folder: string): boolean {
  const u = parse(url)
  const f = parse(folder)
  if (!u || !f || !f.pathname.endsWith('/')) return false
  return u.protocol === f.protocol && u.host === f.host && u.pathname.startsWith(f.pathname)
}

/** True when `url` is exactly the page `page` (its query and #hash don't matter). */
export function isSamePage(url: string, page: string): boolean {
  const u = parse(url)
  const p = parse(page)
  if (!u || !p || u.protocol !== p.protocol || u.host !== p.host) return false
  const path = decodedPath(u)
  return path !== null && path === decodedPath(p)
}
