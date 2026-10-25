param([string]$ElectronArchive)
$ErrorActionPreference = 'Stop'
$appRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$portableRoot = [IO.Path]::GetFullPath((Join-Path $appRoot 'portable'))
$package = Get-Content -LiteralPath (Join-Path $appRoot 'package.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$electronVersion = $package.devDependencies.electron
$installedRuntime = Join-Path $appRoot 'node_modules\electron\dist'
# Only this generated output is replaced; stale runtime files must not enter the new build.
if ($portableRoot -ne (Join-Path $appRoot 'portable') -or -not $portableRoot.StartsWith($appRoot + [IO.Path]::DirectorySeparatorChar)) { throw 'Invalid output path.' }
if (-not $ElectronArchive -and -not (Test-Path -LiteralPath (Join-Path $installedRuntime 'electron.exe'))) {
  $electronCache = Join-Path $env:LOCALAPPDATA 'electron\Cache'
  $cachedArchive = Get-ChildItem -LiteralPath $electronCache -Recurse -File -Filter "electron-v$electronVersion-win32-x64.zip" -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($cachedArchive) { $ElectronArchive = $cachedArchive.FullName }
  else { throw "Run npm ci first, or pass -ElectronArchive with electron-v$electronVersion-win32-x64.zip." }
}
if ($ElectronArchive) { $resolvedArchive = (Resolve-Path -LiteralPath $ElectronArchive).Path }
if (Test-Path -LiteralPath $portableRoot) { Remove-Item -LiteralPath $portableRoot -Recurse -Force }
New-Item -ItemType Directory -Path $portableRoot | Out-Null
if ($ElectronArchive) {
  Expand-Archive -LiteralPath $resolvedArchive -DestinationPath $portableRoot
} else {
  Get-ChildItem -LiteralPath $installedRuntime -Force | ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination $portableRoot -Recurse }
}
$runtimeExe = Join-Path $portableRoot 'electron.exe'
if (-not (Test-Path -LiteralPath $runtimeExe)) { throw 'Expected a Windows Electron runtime containing electron.exe.' }
$actualVersion = (Get-Item -LiteralPath $runtimeExe).VersionInfo.ProductVersion
if ($actualVersion -notlike "$electronVersion*") { throw "Expected Electron $electronVersion; found $actualVersion." }
$resourceApp = Join-Path $portableRoot 'resources\app'
New-Item -ItemType Directory -Force -Path $resourceApp | Out-Null
$sourceFiles = @('package.json','main.cjs','preload.cjs','core.cjs','renderer.js','index.html','styles.css','persona.json','persona-sandrone.json','duo-scenes.json','README.md','THIRD_PARTY_NOTICES.md')
foreach ($sourceFile in $sourceFiles) { Copy-Item -LiteralPath (Join-Path $appRoot $sourceFile) -Destination $resourceApp }
foreach ($folder in @('assets','docs')) { Copy-Item -LiteralPath (Join-Path $appRoot $folder) -Destination $resourceApp -Recurse }
Move-Item -LiteralPath $runtimeExe -Destination (Join-Path $portableRoot 'Columbina.exe')
Write-Output "Portable app ready: $(Join-Path $portableRoot 'Columbina.exe')"
