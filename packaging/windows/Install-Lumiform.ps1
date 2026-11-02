param(
  [switch]$NoPause
)

# Lumiform Colorpicker installer for Windows.
# Copies the plugin folder into every detected Photoshop Plug-ins directory.
$ErrorActionPreference = 'Stop'

$scriptPath = $MyInvocation.MyCommand.Path
$root = Split-Path -Parent $scriptPath
$source = Join-Path $root 'Lumiform Colorpicker'

function Close-IfNeeded {
  if (-not $NoPause) {
    Read-Host "Press Enter to close"
  }
}

if (-not (Test-Path (Join-Path $source 'manifest.json'))) {
  Write-Host "The 'Lumiform Colorpicker' folder is missing. Extract the whole ZIP and run this script again." -ForegroundColor Red
  Close-IfNeeded
  exit 1
}

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
  Write-Host "Requesting administrator privileges..."
  $arguments = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$scriptPath`"")
  if ($NoPause) { $arguments += '-NoPause' }
  Start-Process powershell.exe -Verb RunAs -ArgumentList $arguments
  exit
}

$running = Get-Process -Name Photoshop -ErrorAction SilentlyContinue
if ($running) {
  Write-Host "Photoshop is running. Close it before installing, then run this script again." -ForegroundColor Yellow
  Close-IfNeeded
  exit 1
}

$roots = @("$env:ProgramFiles\Adobe", "${env:ProgramFiles(x86)}\Adobe")
$targets = @()
foreach ($rootPath in $roots) {
  if (Test-Path $rootPath) {
    $targets += Get-ChildItem -Path $rootPath -Directory -Filter 'Adobe Photoshop *' -ErrorAction SilentlyContinue
  }
}

if ($targets.Count -eq 0) {
  Write-Host "No Photoshop installation was found under Program Files\Adobe." -ForegroundColor Yellow
  Write-Host "Install Photoshop 2025 or newer, or copy the 'Lumiform Colorpicker' folder into Photoshop's Plug-ins directory manually."
  Close-IfNeeded
  exit 1
}

foreach ($target in $targets) {
  $dest = Join-Path $target.FullName 'Plug-ins\Lumiform Colorpicker'
  Write-Host "Installing into $dest"
  New-Item -ItemType Directory -Force -Path $dest | Out-Null
  Copy-Item -Path (Join-Path $source '*') -Destination $dest -Recurse -Force
  Write-Host "  done" -ForegroundColor Green
}

Write-Host ""
Write-Host "Installed. Restart Photoshop, then open Plugins > Lumiform Colorpicker." -ForegroundColor Green
Close-IfNeeded
