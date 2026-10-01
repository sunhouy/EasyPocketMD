# Matches @tauri-apps/cli 2.11.2's verified NSIS toolchain.
$ErrorActionPreference = 'Stop'
$tools = Join-Path $env:LOCALAPPDATA 'tauri'
$nsis = Join-Path $tools 'NSIS'
New-Item -ItemType Directory -Force -Path $tools | Out-Null

function Get-VerifiedDownload([string]$Url, [string]$Destination, [string]$Sha1) {
    if ((Test-Path $Destination) -and (Get-FileHash $Destination -Algorithm SHA1).Hash -eq $Sha1) {
        return
    }
    $partial = "$Destination.partial"
    try {
        # Tauri's built-in download timed out after ~20 seconds in the failed job.
        & curl.exe --fail --location --retry 5 --retry-all-errors --connect-timeout 20 --max-time 120 --output $partial $Url
        if ($LASTEXITCODE -ne 0) { throw "Download failed: $Url" }
        if ((Get-FileHash $partial -Algorithm SHA1).Hash -ne $Sha1) { throw "Checksum mismatch: $Url" }
        Move-Item -Force $partial $Destination
    } finally {
        if (Test-Path $partial) { Remove-Item -Force $partial }
    }
}

$required = @(
    'makensis.exe', 'Bin/makensis.exe', 'Stubs/lzma-x86-unicode',
    'Stubs/lzma_solid-x86-unicode', 'Include/MUI2.nsh', 'Include/FileFunc.nsh',
    'Include/x64.nsh', 'Include/nsDialogs.nsh', 'Include/WinMessages.nsh',
    'Include/Win/COM.nsh', 'Include/Win/Propkey.nsh', 'Include/Win/RestartManager.nsh'
)
$missing = $required | Where-Object { -not (Test-Path (Join-Path $nsis $_)) }
if ($missing) {
    $zip = Join-Path $tools 'nsis-3.11.zip'
    Get-VerifiedDownload 'https://github.com/tauri-apps/binary-releases/releases/download/nsis-3.11/nsis-3.11.zip' $zip 'EF7FF767E5CBD9EDD22ADD3A32C9B8F4500BB10D'
    $extracted = Join-Path $tools 'nsis-3.11'
    if (Test-Path $extracted) { Remove-Item -Recurse -Force $extracted }
    Expand-Archive -Force $zip $tools
    if (Test-Path $nsis) { Remove-Item -Recurse -Force $nsis }
    Move-Item $extracted $nsis
}

$pluginDirectory = Join-Path $nsis 'Plugins/x86-unicode/additional'
New-Item -ItemType Directory -Force -Path $pluginDirectory | Out-Null
Get-VerifiedDownload 'https://github.com/tauri-apps/nsis-tauri-utils/releases/download/nsis_tauri_utils-v0.5.3/nsis_tauri_utils.dll' (Join-Path $pluginDirectory 'nsis_tauri_utils.dll') '75197FEE3C6A814FE035788D1C34EAD39349B860'
Write-Host 'Verified NSIS and Tauri plugin ready in the bundler cache.'
