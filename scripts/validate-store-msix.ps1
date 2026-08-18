param(
  [string]$StoreIdentityName = $env:STORE_IDENTITY_NAME,
  [string]$StorePublisher = $env:STORE_PUBLISHER,
  [string]$StorePublisherDisplayName = $env:STORE_PUBLISHER_DISPLAY_NAME
)

$ErrorActionPreference = 'Stop'

function Assert-Condition {
  param(
    [bool]$Condition,
    [string]$Message
  )

  if (-not $Condition) {
    throw $Message
  }
}

function Get-RepoRoot {
  return (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
}

$repoRoot = Get-RepoRoot
$packageJsonPath = Join-Path $repoRoot 'package.json'
$storeConfigPath = Join-Path $repoRoot 'src-tauri\tauri.store.conf.json'
$templatePath = Join-Path $repoRoot 'src-tauri\store\Package.appxmanifest.template.xml'
$assetsPath = Join-Path $repoRoot 'src-tauri\store\assets'
$stagingManifestPath = Join-Path $repoRoot 'dist\store-msix\staging\AppxManifest.xml'
$builtExecutable = Join-Path $repoRoot 'src-tauri\target\x86_64-pc-windows-msvc\release\SmartPocket.exe'

$packageJson = Get-Content $packageJsonPath | ConvertFrom-Json
$version = [string]$packageJson.version
Assert-Condition ($version -match '^\d+\.\d+\.\d+$') "package.json version must be three-part semantic version. Found: $version"
$msixVersion = "$version.0"
Assert-Condition ($msixVersion -match '^\d+\.\d+\.\d+\.\d+$') "MSIX version must be four-part. Found: $msixVersion"

$storeConfig = Get-Content $storeConfigPath -Raw
Assert-Condition ($storeConfig -notmatch 'latest\.json') 'Store flavour must not keep the direct updater endpoint active.'
Assert-Condition ($storeConfig -match '"createUpdaterArtifacts"\s*:\s*false') 'Store flavour must disable updater artifacts.'
Assert-Condition ($storeConfig -match 'SmartPocketStore/1\.0') 'Store flavour must use the SmartPocketStore user-agent marker.'

$template = Get-Content $templatePath -Raw
foreach ($placeholder in @('__IDENTITY_NAME__', '__PUBLISHER__', '__PUBLISHER_DISPLAY_NAME__', '__VERSION__')) {
  Assert-Condition ($template.Contains($placeholder)) "Manifest template is missing placeholder $placeholder"
}

Assert-Condition ($template -match 'ProcessorArchitecture="x64"') 'Manifest template must declare ProcessorArchitecture="x64".'
Assert-Condition ($template -match 'Executable="SmartPocket\.exe"') 'Manifest template must declare SmartPocket.exe as the executable.'
Assert-Condition ($template -match 'EntryPoint="Windows\.FullTrustApplication"') 'Manifest template must declare Windows.FullTrustApplication.'
Assert-Condition ($template -match 'Protocol Name="smartpocket"') 'Manifest template must declare the smartpocket protocol.'
Assert-Condition ($template -match 'runFullTrust') 'Manifest template must declare the runFullTrust capability.'

if (Test-Path $stagingManifestPath) {
  $renderedManifest = Get-Content $stagingManifestPath -Raw
  foreach ($placeholder in @('__IDENTITY_NAME__', '__PUBLISHER__', '__PUBLISHER_DISPLAY_NAME__', '__VERSION__')) {
    Assert-Condition (-not $renderedManifest.Contains($placeholder)) "Rendered staging manifest still contains placeholder $placeholder"
  }

  Assert-Condition ($renderedManifest -match 'ProcessorArchitecture="x64"') 'Rendered staging manifest must declare ProcessorArchitecture="x64".'
  Assert-Condition ($renderedManifest -match 'Executable="SmartPocket\.exe"') 'Rendered staging manifest must declare SmartPocket.exe as the executable.'
  Assert-Condition ($renderedManifest -match 'EntryPoint="Windows\.FullTrustApplication"') 'Rendered staging manifest must declare Windows.FullTrustApplication.'
  Assert-Condition ($renderedManifest -match 'Protocol Name="smartpocket"') 'Rendered staging manifest must declare the smartpocket protocol.'
  Assert-Condition ($renderedManifest -match 'runFullTrust') 'Rendered staging manifest must declare the runFullTrust capability.'
}

foreach ($asset in @(
  'StoreLogo.png',
  'Square44x44Logo.png',
  'Square71x71Logo.png',
  'Square150x150Logo.png',
  'Square310x310Logo.png'
)) {
  Assert-Condition (Test-Path (Join-Path $assetsPath $asset)) "Required Store asset is missing: $asset"
}

if (Test-Path (Split-Path -Parent $builtExecutable)) {
  Assert-Condition (Test-Path $builtExecutable) "Expected Store executable is missing: $builtExecutable"
}
Assert-Condition (-not (Get-ChildItem -Path $repoRoot -Include '*.pfx','*.cer','*.pvk' -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1)) 'No signing certificate file should be committed.'

if (-not [string]::IsNullOrWhiteSpace($StoreIdentityName)) {
  Assert-Condition ($StoreIdentityName -notmatch '__') 'STORE_IDENTITY_NAME must resolve to a final value when provided.'
}

if (-not [string]::IsNullOrWhiteSpace($StorePublisher)) {
  Assert-Condition ($StorePublisher -notmatch '__') 'STORE_PUBLISHER must resolve to a final value when provided.'
}

if (-not [string]::IsNullOrWhiteSpace($StorePublisherDisplayName)) {
  Assert-Condition ($StorePublisherDisplayName -notmatch '__') 'STORE_PUBLISHER_DISPLAY_NAME must resolve to a final value when provided.'
}

Write-Host 'Store MSIX preflight checks passed.'
