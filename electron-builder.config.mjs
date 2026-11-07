// electron-builder configuration (M7 packaging). Used by `npm run dist:mac` / `dist:win`.
// Docs: https://www.electron.build/configuration
//
// Output goes to release/<version>/. File names carry no version (the release tag does), so
// the installers can use https://github.com/MuriloReisz/sotto/releases/latest/download/<file>.
// macOS: Sotto-mac-arm64.zip/.dmg and Sotto-mac-x64.zip/.dmg.
//   Signing: with SOTTO_SIGN_IDENTITY set (a certificate name or SHA-1 hash in the login
//   keychain, e.g. the "Sotto Self-Signed" certificate) every build is signed with that
//   certificate, so its designated requirement stays the same from release to release and
//   macOS keeps the Microphone / Screen Recording grants after an update. Unset, the build
//   is signed ad hoc ('-'): it runs on Apple Silicon, but each build has a new identity, so
//   macOS asks for the permissions again after every update. Never notarized.
// Windows: Sotto-win-x64.exe (NSIS), built on GitHub Actions (.github/workflows/release.yml).

import { readFileSync } from 'node:fs'

const signIdentity = process.env.SOTTO_SIGN_IDENTITY?.trim() || null
// Only the electron-vite output goes into app.asar. Production dependencies
// (@anthropic-ai/sdk, koffi, zod) are added from node_modules by electron-builder.
const appFiles = ['out/**/*', 'package.json', '!**/*.map']

const koffiVersion = JSON.parse(readFileSync(new URL('./node_modules/koffi/package.json', import.meta.url), 'utf8')).version

/** @type {import('electron-builder').Configuration} */
const config = {
  appId: 'com.muriloreis.sotto',
  productName: 'Sotto',
  copyright: 'Copyright © 2026 Murilo Reis',

  directories: {
    output: 'release/${version}',
    buildResources: 'build'
  },

  files: appFiles,
  // koffi's native module can't be loaded from inside app.asar.
  asarUnpack: ['**/*.node'],
  // koffi ships prebuilt Node-API binaries that work in Electron as they are; a rebuild
  // would only try (and fail) to compile it.
  npmRebuild: false,

  // Hardening: stop other local processes from reusing Sotto's binary (and so its
  // microphone / screen-recording grants) as a plain Node.js runtime, and only load the
  // integrity-checked app.asar.
  electronFuses: {
    runAsNode: false,
    enableNodeOptionsEnvironmentVariable: false,
    enableNodeCliInspectArguments: false,
    enableEmbeddedAsarIntegrityValidation: true,
    onlyLoadAppFromAsar: true
  },

  mac: {
    target: [
      { target: 'zip', arch: ['arm64', 'x64'] },
      { target: 'dmg', arch: ['arm64', 'x64'] }
    ],
    artifactName: '${productName}-mac-${arch}.${ext}',
    category: 'public.app-category.productivity',
    icon: 'build/icon.icns',
    // The koffi binary for the architecture being built goes to
    // Contents/Resources/koffi/darwin_<arch>/koffi.node, where koffi looks in a packaged app.
    // scripts/koffi-prebuilds.mjs fetches both (npm only installs this Mac's own).
    // (A platform `files` list replaces the top-level one, so it repeats appFiles.)
    files: [...appFiles, '!node_modules/@koromix/**'],
    extraResources: [{ from: `node_modules/.cache/sotto-koffi/${koffiVersion}/darwin_\${arch}`, to: 'koffi/darwin_${arch}' }],

    // electron-builder's own identity lookup only accepts trusted certificates, so it is
    // always asked for an ad-hoc signature and `sign` below swaps in SOTTO_SIGN_IDENTITY.
    identity: '-',
    sign: async (options) => {
      const { signAsync } = await import('@electron/osx-sign')
      await signAsync(signIdentity ? { ...options, identity: signIdentity } : options)
    },
    // No secure timestamp: it only matters for notarization and expiring Apple certificates,
    // and it makes each of the ~50 signatures a network call to Apple's timestamp server.
    // (Remove this if a real Developer ID certificate is ever used.)
    timestamp: 'none',
    // Hardened runtime is only required for notarization, which needs an Apple Developer ID.
    // Without it no entitlements are needed (with it, an ad-hoc or self-signed app would also
    // need disable-library-validation to load Electron's frameworks).
    hardenedRuntime: false,
    gatekeeperAssess: false,
    notarize: false,

    extendInfo: {
      // Menu-bar app: no Dock icon or ⌘Tab entry (the app also calls app.dock.hide()).
      LSUIElement: true,
      NSMicrophoneUsageDescription: 'Sotto listens to your microphone while you ask it to, so it can transcribe your side of a call on this Mac.',
      NSAudioCaptureUsageDescription: "Sotto listens to your computer's audio while you ask it to, so it can transcribe the other side of a call on this Mac.",
      NSScreenCaptureUsageDescription: 'Sotto takes a screenshot only when you ask about your screen. macOS also uses this permission for call audio.'
    }
  },

  dmg: {
    artifactName: '${productName}-mac-${arch}.${ext}'
  },

  win: {
    target: [{ target: 'nsis', arch: ['x64'] }],
    icon: 'build/icon.png'
  },

  nsis: {
    artifactName: '${productName}-win-${arch}.${ext}',
    // Per-user install, no admin prompt; one click, then Sotto starts.
    oneClick: true,
    perMachine: false,
    runAfterFinish: true,
    createDesktopShortcut: false,
    createStartMenuShortcut: true,
    shortcutName: 'Sotto',
    // Keep settings, the encrypted key and models on uninstall (meeting notes live in Documents).
    deleteAppDataOnUninstall: false
  },

  // Releases are uploaded by scripts / GitHub Actions with `gh`, never by electron-builder.
  publish: null
}

export default config
