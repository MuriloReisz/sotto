#!/bin/bash
# Sotto installer for macOS 13 or later.
#
#   curl -fsSL https://raw.githubusercontent.com/MuriloReisz/sotto/main/install.sh | bash
#
# What it does, in order:
#   1. Downloads the Sotto release for this Mac (Apple Silicon or Intel) and checks it: its
#      SHA-256 must be listed in the release's SHA256SUMS file, and the app must be signed
#      with Sotto's release certificate. Nothing is installed if either check fails.
#   2. Installs Sotto.app into /Applications (or ~/Applications if that isn't writable),
#      replacing an older copy. Your settings and API key are kept: they live elsewhere.
#      If Sotto is open, it asks before quitting it.
#   3. Installs whisper.cpp with Homebrew (if you have Homebrew) for local transcription.
#   4. Downloads a speech model (466 MB, checked against a fixed SHA-256) into
#      ~/Library/Application Support/Sotto/models.
#   5. Opens Sotto.
#
# Options (environment variables):
#   SOTTO_MODEL=base.en   smaller, faster model (142 MB) instead of small.en
#   SOTTO_SKIP_WHISPER=1  skip steps 3 and 4 (chat and screenshots still work)
#   SOTTO_VERSION=v0.2.0  install a specific release instead of the latest
#   SOTTO_NO_OPEN=1       don't open Sotto at the end (used by the CI install test)
#
# Everything runs inside main(), which is called on the very last line, so a download
# that is cut short can't run half of the script.

set -euo pipefail

REPO="MuriloReisz/sotto"
# The release signing certificate's designated requirement (README > Packaging > Signing).
SIGNING_REQUIREMENT='identifier "com.muriloreis.sotto" and certificate leaf = H"19c4a1feecc3210951b0686bab1bb84236b27b46"'
# Speech models come from one fixed commit of huggingface.co/ggerganov/whisper.cpp, and
# each file must have the SHA-256 below (the Git LFS object id of that commit's file).
HF_COMMIT="5359861c739e955e79d9a303bcbc70fb988958b1"
MODELS_DIR="$HOME/Library/Application Support/Sotto/models"
TMP_DIR=""

say() { printf '\033[1m%s\033[0m\n' "$*"; }
warn() { printf '\033[33m%s\033[0m\n' "$*" >&2; }
fail() { printf '\033[31m%s\033[0m\n' "$*" >&2; exit 1; }

# download <url> <file> <what> [hint for a 404]: exits with a clear message on any failure.
download() {
  local url="$1" out="$2" what="$3" hint="${4:-}" code="" rc=0
  local progress=(-sS)
  [ -t 2 ] && progress=(--progress-bar)
  code="$(curl "${progress[@]}" -L --retry 3 --retry-delay 2 --connect-timeout 20 \
    -o "$out" -w '%{http_code}' "$url")" || rc=$?
  if [ "$rc" -eq 0 ] && [ "$code" = "200" ]; then return 0; fi
  rm -f "$out"
  case "$code" in
    404) fail "$what was not found ($url).${hint:+ $hint}" ;;
    403 | 429) fail "$what: the server refused the download (HTTP $code), probably a rate limit. Wait a few minutes and run the installer again." ;;
    000 | 200) fail "$what: the download failed (curl error $rc). Check your internet connection and run the installer again." ;;
    *) fail "$what: the download failed (HTTP $code from $url). Try again later." ;;
  esac
}

# sha256_of <file>
sha256_of() { shasum -a 256 "$1" | awk '{ print $1 }'; }

# ask <question>: 0 = yes, 1 = no, 2 = there is nobody to ask (not run from a terminal).
# Under `curl | bash`, stdin is the script itself, so the answer is read from /dev/tty.
ask() {
  local answer=""
  if [ -t 0 ]; then
    read -r -p "$1 [y/N] " answer || answer=""
  elif { : </dev/tty; } 2>/dev/null; then
    read -r -p "$1 [y/N] " answer </dev/tty || answer=""
  else
    return 2
  fi
  case "$answer" in [yY] | [yY][eE][sS]) return 0 ;; *) return 1 ;; esac
}

sotto_running() { pgrep -x Sotto >/dev/null 2>&1; }

# Ask before closing a running Sotto (it may be listening to a call). Never closes it
# without a yes; when nobody can answer, it stops and says what to do.
CLOSE_AGREED=0
agree_to_close() {
  [ "$CLOSE_AGREED" = 1 ] && return 0
  sotto_running || return 0
  local rc=0
  ask "Sotto is open (it may be listening to a call). Quit it to install the update?" || rc=$?
  case "$rc" in
    0) CLOSE_AGREED=1 ;;
    1) fail "Nothing was changed. Quit Sotto (menu-bar icon > Quit) when you're ready and run the installer again." ;;
    *) fail "Sotto is open. Quit it (menu-bar icon > Quit) and run the installer again; it doesn't close Sotto without asking." ;;
  esac
}

quit_sotto() {
  sotto_running || return 0
  agree_to_close
  say "Quitting Sotto..."
  osascript -e 'tell application id "com.muriloreis.sotto" to quit' >/dev/null 2>&1 || true
  local i
  for i in 1 2 3 4 5 6 7 8 9 10; do
    sotto_running || return 0
    sleep 1
  done
  pkill -x Sotto >/dev/null 2>&1 || true
  sleep 2
  if sotto_running; then fail "Sotto didn't quit. Quit it from the menu-bar icon and run the installer again."; fi
  return 0
}

main() {
  [ "$(uname -s)" = "Darwin" ] || fail "This installer is for macOS. On Windows, see the README."

  # --- Checks before anything is downloaded ----------------------------------------
  local macos major minor
  macos="$(sw_vers -productVersion)"
  IFS=. read -r major minor _ <<<"$macos.0.0"
  case "$major" in '' | *[!0-9]*) major=0 ;; esac
  case "$minor" in '' | *[!0-9]*) minor=0 ;; esac
  if [ "$major" -lt 13 ]; then
    fail "Sotto needs macOS 13 (Ventura) or later. This Mac has macOS $macos."
  fi
  if [ "$major" -eq 13 ] || { [ "$major" -eq 14 ] && [ "$minor" -lt 2 ]; }; then
    warn "macOS $macos: Sotto works, but hearing your computer's audio needs macOS 14.2 or later."
  fi

  local arch
  case "$(uname -m)" in
    arm64) arch="arm64" ;;
    x86_64)
      # An Intel shell on Apple Silicon (Rosetta) still gets the native build.
      if [ "$(sysctl -n hw.optional.arm64 2>/dev/null || echo 0)" = "1" ]; then arch="arm64"; else arch="x64"; fi ;;
    *) fail "Unsupported Mac processor: $(uname -m)" ;;
  esac

  local model="${SOTTO_MODEL:-small.en}" model_sha model_size model_time
  case "$model" in
    small.en)
      model_sha="c6138d6d58ecc8322097e0f987c32f1be8bb0a18532a3f88f734d1bbf9c41e5d"
      model_size="466 MB"; model_time="about 1-2 minutes on a fast connection, up to 10 on a slow one" ;;
    base.en)
      model_sha="a03779c86df3323075f5e796cb2ce5029f00ec8869eee3fdfb897afe36c6d002"
      model_size="142 MB"; model_time="under a minute on a fast connection, a few minutes on a slow one" ;;
    *) fail "SOTTO_MODEL must be small.en or base.en (it is \"$model\")." ;;
  esac

  # Release files have no version in their names, so "latest" needs no GitHub API call.
  local base release
  if [ -n "${SOTTO_VERSION:-}" ]; then
    release="$SOTTO_VERSION"
    case "$release" in v*) ;; *) release="v$release" ;; esac
    [[ "$release" =~ ^v[0-9]+\.[0-9]+\.[0-9]+([-+][0-9A-Za-z.-]+)?$ ]] ||
      fail "SOTTO_VERSION should look like v0.2.0 (it is \"$SOTTO_VERSION\")."
    base="https://github.com/$REPO/releases/download/$release"
  else
    release="latest"
    base="https://github.com/$REPO/releases/latest/download"
  fi

  # Ask now, before the downloads, rather than after the user has walked away.
  agree_to_close

  TMP_DIR="$(mktemp -d)"
  trap 'rm -rf "$TMP_DIR"' EXIT

  # --- 1. Download and check Sotto -------------------------------------------------
  local asset="Sotto-mac-$arch.zip"
  local missing="Release $release has no $asset. See https://github.com/$REPO/releases"
  say "Downloading Sotto for this Mac ($arch, about 125 MB: under a minute on a fast connection)..."
  download "$base/SHA256SUMS" "$TMP_DIR/SHA256SUMS" "The checksum list (SHA256SUMS) of release $release" \
    "See https://github.com/$REPO/releases"
  download "$base/$asset" "$TMP_DIR/$asset" "Sotto ($asset)" "$missing"

  local expected actual
  expected="$(awk -v f="$asset" '{ sub(/^\*/, "", $2) } $2 == f { print $1; exit }' "$TMP_DIR/SHA256SUMS")"
  [[ "$expected" =~ ^[0-9a-f]{64}$ ]] || fail "SHA256SUMS of release $release has no line for $asset, so it can't be checked. Nothing was installed."
  actual="$(sha256_of "$TMP_DIR/$asset")" || fail "Couldn't compute the SHA-256 of $asset."
  if [ "$actual" != "$expected" ]; then
    fail "$asset doesn't match SHA256SUMS (expected $expected, got $actual). Nothing was installed. If a new release was published just now, run the installer again."
  fi

  ditto -x -k "$TMP_DIR/$asset" "$TMP_DIR/unzipped" || fail "Couldn't unpack $asset."
  local app_src
  app_src="$(find "$TMP_DIR/unzipped" -maxdepth 2 -name 'Sotto.app' -type d -print -quit)"
  [ -n "$app_src" ] || fail "The download didn't contain Sotto.app."

  if ! codesign --verify --deep --strict -R="$SIGNING_REQUIREMENT" "$app_src" 2>"$TMP_DIR/codesign.log"; then
    cat "$TMP_DIR/codesign.log" >&2
    fail "The downloaded Sotto.app isn't signed with Sotto's release certificate, so it was not installed. Please report this at https://github.com/$REPO/issues"
  fi
  local version
  version="$(plutil -extract CFBundleShortVersionString raw -o - "$app_src/Contents/Info.plist" 2>/dev/null || echo "?")"
  say "Checked Sotto $version: checksum and signature are OK."

  # --- 2. Install the app ----------------------------------------------------------
  local dest="/Applications"
  [ -w "$dest" ] || { dest="$HOME/Applications"; mkdir -p "$dest"; }

  quit_sotto
  rm -rf "$dest/Sotto.app"
  ditto "$app_src" "$dest/Sotto.app"
  # curl doesn't add the quarantine flag, but clear it in case the zip carried one.
  xattr -dr com.apple.quarantine "$dest/Sotto.app" 2>/dev/null || true
  say "Installed $dest/Sotto.app"

  # --- 3 + 4. Local transcription --------------------------------------------------
  if [ "${SOTTO_SKIP_WHISPER:-0}" != "1" ]; then
    if [ -x /opt/homebrew/bin/whisper-server ] || [ -x /usr/local/bin/whisper-server ] || command -v whisper-server >/dev/null 2>&1; then
      say "whisper.cpp is already installed."
    elif command -v brew >/dev/null 2>&1; then
      say "Installing whisper.cpp with Homebrew (local, offline transcription; a few MB, but it can take a few minutes if Homebrew updates itself first)..."
      if ! brew install whisper-cpp; then
        warn "Homebrew couldn't install whisper.cpp, so live transcription won't work yet."
        warn "To add it later, run: brew install whisper-cpp"
      fi
    else
      warn "Homebrew isn't installed, so live transcription is skipped for now."
      warn "To add it later: install Homebrew from https://brew.sh, then run: brew install whisper-cpp"
    fi

    mkdir -p "$MODELS_DIR"
    local existing
    existing="$(find "$MODELS_DIR" -maxdepth 1 -name 'ggml-*.bin' -print -quit)"
    if [ -n "$existing" ]; then
      say "A speech model is already installed ($(basename "$existing"))."
    else
      local part="$MODELS_DIR/ggml-$model.bin.part"
      say "Downloading the speech model $model ($model_size: $model_time)..."
      download "https://huggingface.co/ggerganov/whisper.cpp/resolve/$HF_COMMIT/ggml-$model.bin" "$part" \
        "The speech model ggml-$model.bin"
      actual="$(sha256_of "$part")" || fail "Couldn't compute the SHA-256 of the speech model."
      if [ "$actual" != "$model_sha" ]; then
        rm -f "$part"
        fail "The speech model doesn't match its expected SHA-256 (got $actual), so it was deleted. Run the installer again."
      fi
      mv "$part" "$MODELS_DIR/ggml-$model.bin"
      say "Installed the speech model ($model, checksum OK)."
    fi
  fi

  # --- 5. Open it -----------------------------------------------------------------
  local opened=0
  if [ "${SOTTO_NO_OPEN:-0}" = "1" ]; then
    say "Not opening Sotto (SOTTO_NO_OPEN=1)."
  elif open "$dest/Sotto.app"; then
    opened=1
  else
    warn "Couldn't open Sotto. Open it from $dest."
  fi

  echo
  if [ "$opened" = 1 ]; then
    echo "Sotto is open. It lives in the menu bar (no Dock icon)."
  else
    echo "Sotto is installed in $dest. It lives in the menu bar (no Dock icon) once opened."
  fi
  cat <<'EOF'

Next:
  1. Press Cmd+Shift+Space to show it, then paste your Anthropic API key
     (get one at https://console.anthropic.com/settings/keys).
  2. The first time you listen or take a screenshot, macOS asks for permission
     for "Sotto". Click Allow. You only do this once.

To update later, run the same command again.
EOF
}

main "$@"
