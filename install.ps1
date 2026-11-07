# Sotto installer for Windows 10/11 (64-bit). Run in PowerShell:
#
#   irm https://raw.githubusercontent.com/MuriloReisz/sotto/main/install.ps1 | iex
#
# What it does, in order:
#   1. Downloads the Sotto installer and checks its SHA-256 against the release's SHA256SUMS
#      file, then installs it silently (per user, no admin needed). If Sotto is open, it asks
#      before closing it.
#   2. For local, offline transcription: makes sure the Microsoft Visual C++ runtime is
#      installed (if it isn't, Windows asks once for administrator permission), then downloads
#      whisper.cpp (one fixed release, checked against a fixed SHA-256) into
#      %APPDATA%\Sotto\whisper.
#   3. Downloads a speech model (466 MB, checked against a fixed SHA-256) into
#      %APPDATA%\Sotto\models.
#   4. Opens Sotto.
#
# Options (set before running):  $env:SOTTO_MODEL = 'base.en'     smaller model (142 MB)
#                                $env:SOTTO_SKIP_WHISPER = '1'    chat and screenshots only
#                                $env:SOTTO_VERSION = 'v0.2.0'    a specific release
#                                $env:SOTTO_NO_OPEN = '1'         don't open Sotto at the end
#
# Everything is inside the Install-Sotto function, which is called on the very last line, so
# a download that is cut short can't run half of the script. Its settings stay inside the
# function and don't change your PowerShell window. (This file is plain ASCII on purpose:
# Windows PowerShell 5.1 misreads other characters in a saved script without a BOM.)

function Install-Sotto {
  $ErrorActionPreference = 'Stop'
  $ProgressPreference = 'SilentlyContinue'   # Invoke-WebRequest is far faster without the progress bar
  # Older Windows 10 builds of PowerShell 5.1 don't offer TLS 1.2, which GitHub requires.
  [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

  $Repo = 'MuriloReisz/sotto'
  $Asset = 'Sotto-win-x64.exe'
  # Per-user NSIS install folder (electron-builder uses the package name, "sotto").
  $AppExe = Join-Path $env:LOCALAPPDATA 'Programs\sotto\Sotto.exe'
  $WhisperDir = Join-Path $env:APPDATA 'Sotto\whisper'
  $ModelsDir = Join-Path $env:APPDATA 'Sotto\models'

  # whisper.cpp v1.9.2: the newest release that is not marked prerelease and ships the
  # Windows CPU build (whisper-bin-x64.zip). Newer tags (b5454 etc.) are prereleases.
  $WhisperTag = 'v1.9.2'
  $WhisperZipSha256 = '49dcc16de826f20bd53d44f947a1ae49dfa81f86cad67a64d80820cb192d674a'
  # Only what whisper-server.exe needs: it imports whisper.dll and ggml.dll, which import
  # ggml-base.dll; ggml.dll then loads the best ggml-cpu-*.dll for this processor at run time.
  $WhisperFiles = @('whisper-server.exe', 'whisper.dll', 'ggml.dll', 'ggml-base.dll')
  # Those files are linked with MSVC 14.51, and Microsoft only supports running them on a
  # Visual C++ runtime at least that new. aka.ms/vc14 is Microsoft's link to the latest v14
  # runtime (aka.ms/vs/17/release/vc_redist.x64.exe still serves 14.44).
  $VcMinMinor = 51
  $VcRedistUrl = 'https://aka.ms/vc14/vc_redist.x64.exe'

  # Speech models come from one fixed commit of huggingface.co/ggerganov/whisper.cpp, and each
  # file must have the SHA-256 below (the Git LFS object id of that commit's file).
  $HfCommit = '5359861c739e955e79d9a303bcbc70fb988958b1'
  $Models = @{
    'small.en' = @{ Sha256 = 'c6138d6d58ecc8322097e0f987c32f1be8bb0a18532a3f88f734d1bbf9c41e5d'; Size = '466 MB'; Time = 'about 1-2 minutes on a fast connection, up to 10 on a slow one' }
    'base.en'  = @{ Sha256 = 'a03779c86df3323075f5e796cb2ce5029f00ec8869eee3fdfb897afe36c6d002'; Size = '142 MB'; Time = 'under a minute on a fast connection, a few minutes on a slow one' }
  }

  function Say([string]$Text) { Write-Host $Text -ForegroundColor Cyan }
  function Warn([string]$Text) { Write-Host $Text -ForegroundColor Yellow }

  # Download $Url to $OutFile, or stop with a clear message.
  function Get-File([string]$Url, [string]$OutFile, [string]$What, [string]$Hint = '') {
    try {
      Invoke-WebRequest -UseBasicParsing -Uri $Url -OutFile $OutFile -Headers @{ 'User-Agent' = 'sotto-installer' }
    } catch {
      Remove-Item -LiteralPath $OutFile -Force -ErrorAction SilentlyContinue
      $status = $null
      if ($_.Exception.Response) { try { $status = [int]$_.Exception.Response.StatusCode } catch { $status = $null } }
      if ($status -eq 404) { throw "$What was not found ($Url). $Hint" }
      if ($status -eq 403 -or $status -eq 429) { throw "${What}: the server refused the download (HTTP $status), probably a rate limit. Wait a few minutes and run the installer again." }
      if ($status) { throw "${What}: the download failed (HTTP $status from $Url). Try again later." }
      throw "${What}: the download failed ($($_.Exception.Message)). Check your internet connection and run the installer again."
    }
  }

  function Get-Sha256([string]$Path) { (Get-FileHash -Algorithm SHA256 -LiteralPath $Path).Hash.ToLowerInvariant() }

  # Can we ask the user a question? Not when input is redirected or PowerShell runs with
  # -NonInteractive (scheduled tasks, CI).
  function Test-CanPrompt {
    if (-not [Environment]::UserInteractive) { return $false }
    try { if ([Console]::IsInputRedirected) { return $false } } catch { return $false }
    foreach ($arg in [Environment]::GetCommandLineArgs()) { if ($arg -match '^[-/]noni') { return $false } }
    return $true
  }

  function Test-SottoRunning { [bool](Get-Process -Name 'Sotto' -ErrorAction SilentlyContinue) }

  # Sotto may be listening to a call, so it is never closed without a yes. (A hashtable in
  # this function's scope, not a $script: variable: under iex that would be the user's
  # session and outlive this run.)
  $state = @{ CloseAgreed = $false }
  function Confirm-CloseSotto {
    if ($state.CloseAgreed -or -not (Test-SottoRunning)) { return }
    if (-not (Test-CanPrompt)) {
      throw 'Sotto is open. Quit it (tray icon > Quit) and run the installer again; it does not close Sotto without asking.'
    }
    $answer = Read-Host 'Sotto is open (it may be listening to a call). Close it to install the update? [y/N]'
    if ($answer -notmatch '^(y|yes)$') {
      throw 'Nothing was changed. Quit Sotto (tray icon > Quit) when you are ready and run the installer again.'
    }
    $state.CloseAgreed = $true
  }

  function Close-Sotto {
    if (-not (Test-SottoRunning)) { return }
    Confirm-CloseSotto
    Say 'Closing Sotto...'
    Get-Process -Name 'Sotto' -ErrorAction SilentlyContinue | Stop-Process -Force
    for ($i = 0; $i -lt 20 -and (Test-SottoRunning); $i++) { Start-Sleep -Milliseconds 500 }
    if (Test-SottoRunning) { throw 'Sotto did not close. Quit it from the tray icon and run the installer again.' }
  }

  # Visual C++ 2015-2026 (v14) x64 runtime, at least 14.$VcMinMinor. The key is in the 64-bit
  # registry view; WOW6432Node covers a 32-bit PowerShell.
  function Test-VcRuntime {
    foreach ($key in @('HKLM:\SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\x64',
                       'HKLM:\SOFTWARE\WOW6432Node\Microsoft\VisualStudio\14.0\VC\Runtimes\x64')) {
      $rt = Get-ItemProperty -Path $key -ErrorAction SilentlyContinue
      if ($rt -and $rt.Installed -eq 1 -and ($rt.Major -gt 14 -or ($rt.Major -eq 14 -and $rt.Minor -ge $VcMinMinor))) { return $true }
    }
    return $false
  }

  function Install-VcRuntime([string]$TmpDir) {
    Say 'whisper.cpp needs the Microsoft Visual C++ runtime (x64, about 18 MB, under a minute).'
    Say 'Windows will ask for administrator permission (a UAC prompt) to install it. This is a one-time step.'
    $vc = Join-Path $TmpDir 'vc_redist.x64.exe'
    Get-File $VcRedistUrl $vc 'The Microsoft Visual C++ runtime'
    $sig = Get-AuthenticodeSignature -LiteralPath $vc
    if ($sig.Status -ne 'Valid' -or $sig.SignerCertificate.Subject -notmatch 'O=Microsoft Corporation') {
      throw 'The Visual C++ runtime download is not signed by Microsoft, so it was not run.'
    }
    try {
      $p = Start-Process -FilePath $vc -ArgumentList '/install', '/quiet', '/norestart' -PassThru
      $null = $p.Handle   # keeps the exit code readable in Windows PowerShell 5.1
      $p.WaitForExit()
      $code = $p.ExitCode
    } catch {
      $code = $null
      Warn "The Visual C++ runtime was not installed ($($_.Exception.Message))."
    }
    # 0 = installed, 3010 = installed (restart later), 1638 = a newer version is already there.
    if ($code -eq 3010) { Warn 'The Visual C++ runtime is installed; Windows wants a restart at some point.' }
    elseif ($null -ne $code -and $code -ne 0 -and $code -ne 1638) { Warn "The Visual C++ runtime installer failed (exit code $code)." }
  }

  # --- Checks before anything is downloaded ---------------------------------------------
  if (-not [Environment]::Is64BitOperatingSystem) { throw 'Sotto needs 64-bit Windows.' }
  if ([Environment]::OSVersion.Version.Major -lt 10) { throw 'Sotto needs Windows 10 or 11.' }

  $model = if ($env:SOTTO_MODEL) { $env:SOTTO_MODEL.ToLowerInvariant() } else { 'small.en' }
  if (-not $Models.ContainsKey($model)) { throw "SOTTO_MODEL must be small.en or base.en (it is '$model')." }

  # Release files have no version in their names, so "latest" needs no GitHub API call.
  if ($env:SOTTO_VERSION) {
    $release = $env:SOTTO_VERSION
    if ($release -notmatch '^v') { $release = "v$release" }
    if ($release -notmatch '^v[0-9]+\.[0-9]+\.[0-9]+([-+][0-9A-Za-z.-]+)?$') { throw "SOTTO_VERSION should look like v0.2.0 (it is '$env:SOTTO_VERSION')." }
    $base = "https://github.com/$Repo/releases/download/$release"
  } else {
    $release = 'latest'
    $base = "https://github.com/$Repo/releases/latest/download"
  }

  # Ask now, before the downloads, rather than after the user has walked away.
  Confirm-CloseSotto

  $tmp = Join-Path $env:TEMP "sotto-install-$([guid]::NewGuid())"
  New-Item -ItemType Directory -Path $tmp | Out-Null
  try {
    # --- 1. Sotto -------------------------------------------------------------------------
    Say 'Downloading Sotto (about 100 MB: under a minute on a fast connection)...'
    $sums = Join-Path $tmp 'SHA256SUMS'
    Get-File "$base/SHA256SUMS" $sums "The checksum list (SHA256SUMS) of release $release" "See https://github.com/$Repo/releases"
    $setup = Join-Path $tmp $Asset
    Get-File "$base/$Asset" $setup "Sotto ($Asset)" "Release $release has no Windows download. See https://github.com/$Repo/releases"

    $expected = $null
    foreach ($line in Get-Content -LiteralPath $sums) {
      $parts = $line -split '\s+', 2
      if ($parts.Count -eq 2 -and $parts[1].TrimStart('*').Trim() -eq $Asset) { $expected = $parts[0].ToLowerInvariant() }
    }
    if ($expected -notmatch '^[0-9a-f]{64}$') { throw "SHA256SUMS of release $release has no line for $Asset, so it can't be checked. Nothing was installed." }
    $actual = Get-Sha256 $setup
    if ($actual -ne $expected) {
      throw "$Asset doesn't match SHA256SUMS (expected $expected, got $actual). Nothing was installed. If a new release was published just now, run the installer again."
    }
    Say 'Checksum OK.'

    Close-Sotto
    Say 'Installing...'
    $p = Start-Process -FilePath $setup -ArgumentList '/S' -PassThru
    $null = $p.Handle   # keeps the exit code readable in Windows PowerShell 5.1
    $p.WaitForExit()
    if ($p.ExitCode -ne 0) { throw "The Sotto installer failed (exit code $($p.ExitCode))." }
    if (-not (Test-Path -LiteralPath $AppExe)) { throw "The Sotto installer finished, but $AppExe is missing." }
    Say "Installed $AppExe"

    # --- 2 + 3. Local transcription -------------------------------------------------------
    if ($env:SOTTO_SKIP_WHISPER -ne '1') {
      if (-not (Test-VcRuntime)) { Install-VcRuntime $tmp }
      $vcOk = Test-VcRuntime
      if (-not $vcOk) {
        Warn "The Visual C++ runtime (14.$VcMinMinor or newer) is still missing, so transcription may not start."
        Warn "Install it from $VcRedistUrl and run this installer again."
      }

      $marker = Join-Path $WhisperDir 'sotto-whisper-version.txt'
      $server = Join-Path $WhisperDir 'whisper-server.exe'
      $current = if (Test-Path -LiteralPath $marker) { (Get-Content -LiteralPath $marker -Raw).Trim() } else { '' }
      if ((Test-Path -LiteralPath $server) -and $current -eq $WhisperTag) {
        Say "whisper.cpp $WhisperTag is already installed."
      } else {
        Say "Downloading whisper.cpp $WhisperTag (local, offline transcription; 8 MB)..."
        $wzip = Join-Path $tmp 'whisper-bin-x64.zip'
        Get-File "https://github.com/ggml-org/whisper.cpp/releases/download/$WhisperTag/whisper-bin-x64.zip" $wzip 'whisper.cpp'
        $wsha = Get-Sha256 $wzip
        if ($wsha -ne $WhisperZipSha256) { throw "The whisper.cpp download doesn't match its expected SHA-256 (got $wsha)." }
        $wtmp = Join-Path $tmp 'whisper'
        Expand-Archive -LiteralPath $wzip -DestinationPath $wtmp -Force
        $found = Get-ChildItem -LiteralPath $wtmp -Recurse -Filter 'whisper-server.exe' | Select-Object -First 1
        if (-not $found) { throw 'The whisper.cpp download did not contain whisper-server.exe.' }
        $src = $found.DirectoryName
        foreach ($f in $WhisperFiles) {
          if (-not (Test-Path -LiteralPath (Join-Path $src $f))) { throw "The whisper.cpp download did not contain $f." }
        }
        $cpu = @(Get-ChildItem -LiteralPath $src -Filter 'ggml-cpu-*.dll')
        if ($cpu.Count -eq 0) { throw 'The whisper.cpp download did not contain ggml-cpu-*.dll.' }

        # Replace an older copy completely, so no DLLs from another version stay behind. Sotto
        # is closed by now, but a whisper-server it started can outlive it and lock the files.
        Get-Process -Name 'whisper-server' -ErrorAction SilentlyContinue |
          Where-Object { $_.Path -and $_.Path.StartsWith($WhisperDir, [StringComparison]::OrdinalIgnoreCase) } |
          Stop-Process -Force
        if (Test-Path -LiteralPath $WhisperDir) { Remove-Item -LiteralPath $WhisperDir -Recurse -Force }
        New-Item -ItemType Directory -Path $WhisperDir -Force | Out-Null
        foreach ($f in $WhisperFiles) { Copy-Item -LiteralPath (Join-Path $src $f) -Destination $WhisperDir }
        foreach ($f in $cpu) { Copy-Item -LiteralPath $f.FullName -Destination $WhisperDir }
        Set-Content -LiteralPath $marker -Value $WhisperTag -Encoding Ascii
        Say "Installed whisper.cpp $WhisperTag in $WhisperDir"
      }

      # A missing runtime or DLL shows up here, not in the middle of a call. (Skipped without
      # the runtime: Windows would show a "DLL not found" dialog. Start-Process, not
      # `& $server 2>&1`: PowerShell 5.1 turns the usage text on stderr into an error.)
      if ($vcOk) {
        $help = Start-Process -FilePath $server -ArgumentList '--help' -NoNewWindow -PassThru `
          -RedirectStandardOutput (Join-Path $tmp 'whisper-help.out') -RedirectStandardError (Join-Path $tmp 'whisper-help.err')
        $null = $help.Handle
        if (-not $help.WaitForExit(30000)) { $help.Kill() }
        if ($help.HasExited -and $help.ExitCode -eq 0) {
          Say 'whisper.cpp starts correctly.'
        } else {
          $why = if ($help.HasExited) { "exit code $($help.ExitCode)" } else { 'it did not answer' }
          Warn "whisper.cpp doesn't start ($why), so live transcription won't work yet."
          Warn "Please report this at https://github.com/$Repo/issues"
        }
      }

      New-Item -ItemType Directory -Path $ModelsDir -Force | Out-Null
      $existing = Get-ChildItem -LiteralPath $ModelsDir -Filter 'ggml-*.bin' -ErrorAction SilentlyContinue | Select-Object -First 1
      if ($existing) {
        Say "A speech model is already installed ($($existing.Name))."
      } else {
        $m = $Models[$model]
        Say "Downloading the speech model $model ($($m.Size): $($m.Time))..."
        $part = Join-Path $ModelsDir "ggml-$model.bin.part"
        Get-File "https://huggingface.co/ggerganov/whisper.cpp/resolve/$HfCommit/ggml-$model.bin" $part "The speech model ggml-$model.bin"
        $msha = Get-Sha256 $part
        if ($msha -ne $m.Sha256) {
          Remove-Item -LiteralPath $part -Force
          throw "The speech model doesn't match its expected SHA-256 (got $msha), so it was deleted. Run the installer again."
        }
        Move-Item -LiteralPath $part -Destination (Join-Path $ModelsDir "ggml-$model.bin") -Force
        Say "Installed the speech model ($model, checksum OK)."
      }
    }
  } finally {
    Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue
  }

  # --- 4. Open it -------------------------------------------------------------------------
  $running = $false
  if ($env:SOTTO_NO_OPEN -eq '1') {
    Say 'Not opening Sotto (SOTTO_NO_OPEN=1).'
  } else {
    Start-Process -FilePath $AppExe
    for ($i = 0; $i -lt 20 -and -not $running; $i++) { Start-Sleep -Milliseconds 500; $running = Test-SottoRunning }
    if (-not $running) { Warn 'Sotto did not start. Open it from the Start menu.' }
  }

  Write-Host ''
  if ($running) { Write-Host 'Sotto is running in the system tray.' }
  else { Write-Host 'Sotto is installed. Open it from the Start menu; it lives in the system tray.' }
  Write-Host @'

Next:
  1. Press Ctrl+Shift+Space to show it, then paste your Anthropic API key
     (get one at https://console.anthropic.com/settings/keys).
  2. Windows may ask about microphone access the first time you listen. Allow it.

Windows support is newer and less tested than macOS. Problems: https://github.com/MuriloReisz/sotto/issues
To update later, run the same command again.
'@
}

try {
  Install-Sotto
  $global:LASTEXITCODE = 0
} catch {
  Write-Host ''
  Write-Host "Sotto installer stopped: $($_.Exception.Message)" -ForegroundColor Red
  $global:LASTEXITCODE = 1   # lets scripts and CI see the failure without closing this window
}
