param(
  [string]$StoreIdentityName = $env:STORE_IDENTITY_NAME,
  [string]$StorePublisher = $env:STORE_PUBLISHER,
  [string]$StorePublisherDisplayName = $env:STORE_PUBLISHER_DISPLAY_NAME
)

$ErrorActionPreference = 'Stop'

function Require-Value {
  param(
    [string]$Name,
    [string]$Value
  )

  if ([string]::IsNullOrWhiteSpace($Value)) {
    throw "Missing required Store identity input: $Name"
  }
}

function Get-RepoRoot {
  return (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
}

function Get-FourPartVersion {
  param([string]$Version)

  if ($Version -notmatch '^\d+\.\d+\.\d+$') {
    throw "package.json version must be a three-part semantic version. Found: $Version"
  }

  return "$Version.0"
}

function Require-Command {
  param([string]$Name)

  $command = Get-Command $Name -ErrorAction SilentlyContinue
  if (-not $command) {
    throw "Required command not found on PATH: $Name"
  }

  return $command.Source
}

$repoRoot = Get-RepoRoot
$packageJsonPath = Join-Path $repoRoot 'package.json'
$storeConfigPath = Join-Path $repoRoot 'src-tauri\tauri.store.conf.json'
$templatePath = Join-Path $repoRoot 'src-tauri\store\Package.appxmanifest.template.xml'
$assetsSource = Join-Path $repoRoot 'src-tauri\store\assets'
$outputRoot = Join-Path $repoRoot 'dist\store-msix'
$stagingDirectory = Join-Path $outputRoot 'staging'
$assetsTarget = Join-Path $stagingDirectory 'Assets'
$manifestPath = Join-Path $stagingDirectory 'AppxManifest.xml'

Require-Value -Name 'STORE_IDENTITY_NAME' -Value $StoreIdentityName
Require-Value -Name 'STORE_PUBLISHER' -Value $StorePublisher
Require-Value -Name 'STORE_PUBLISHER_DISPLAY_NAME' -Value $StorePublisherDisplayName

Require-Command -Name 'npx' | Out-Null
Require-Command -Name 'MakeAppx.exe' | Out-Null

$packageJson = Get-Content $packageJsonPath | ConvertFrom-Json
$packageVersion = [string]$packageJson.version
$msixVersion = Get-FourPartVersion -Version $packageVersion
$packageFileName = "SmartPocket_${msixVersion}_x64.msix"
$packageOutputPath = Join-Path $outputRoot $packageFileName

if (Test-Path $outputRoot) {
  Remove-Item -Path $outputRoot -Recurse -Force
}

New-Item -ItemType Directory -Path $stagingDirectory -Force | Out-Null
New-Item -ItemType Directory -Path $assetsTarget -Force | Out-Null

Push-Location $repoRoot
try {
  & npx tauri build --target x86_64-pc-windows-msvc --config src-tauri/tauri.store.conf.json --no-bundle
  if ($LASTEXITCODE -ne 0) {
    throw 'Store-specific Tauri executable build failed.'
  }
}
finally {
  Pop-Location
}

$builtExecutable = Join-Path $repoRoot 'src-tauri\target\x86_64-pc-windows-msvc\release\SmartPocket.exe'
if (-not (Test-Path $builtExecutable)) {
  throw "Expected Store executable was not produced: $builtExecutable"
}

Copy-Item -Path $builtExecutable -Destination (Join-Path $stagingDirectory 'SmartPocket.exe') -Force
Copy-Item -Path (Join-Path $assetsSource '*') -Destination $assetsTarget -Recurse -Force

$manifestTemplate = Get-Content $templatePath -Raw
$manifest = $manifestTemplate.Replace('__IDENTITY_NAME__', $StoreIdentityName)
$manifest = $manifest.Replace('__PUBLISHER__', $StorePublisher)
$manifest = $manifest.Replace('__PUBLISHER_DISPLAY_NAME__', $StorePublisherDisplayName)
$manifest = $manifest.Replace('__VERSION__', $msixVersion)
foreach ($placeholder in @('__IDENTITY_NAME__', '__PUBLISHER__', '__PUBLISHER_DISPLAY_NAME__', '__VERSION__')) {
  if ($manifest.Contains($placeholder)) {
    throw "Rendered manifest still contains unresolved placeholder: $placeholder"
  }
}
Set-Content -Path $manifestPath -Value $manifest -Encoding UTF8

Push-Location $stagingDirectory
try {
  & MakeAppx.exe pack /d . /p $packageOutputPath /o
  if ($LASTEXITCODE -ne 0) {
    throw 'MakeAppx failed to generate the Store MSIX package.'
  }
}
finally {
  Pop-Location
}

Write-Host "Created Store MSIX foundation package: $packageOutputPath"
