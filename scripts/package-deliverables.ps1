param([switch]$SourceOnly)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$appRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$outputRoot = Join-Path $appRoot 'dist'
New-Item -ItemType Directory -Force -Path $outputRoot | Out-Null

# A fixed list excludes profiles, dependencies and generated outputs.
# .NET ZIP APIs preserve dotfiles that Compress-Archive can omit.
function Write-ProjectZip([string]$Destination, [string[]]$Names) {
  $items = @()
  foreach ($name in $Names) {
    $source = Join-Path $appRoot $name
    if (-not (Test-Path -LiteralPath $source)) { throw "Missing required package input: $name" }
    $item = Get-Item -LiteralPath $source -Force
    if ($item.PSIsContainer) { $items += Get-ChildItem -LiteralPath $source -File -Recurse -Force }
    else { $items += $item }
  }
  $stream = [IO.File]::Open($Destination, [IO.FileMode]::Create)
  $archive = New-Object IO.Compression.ZipArchive($stream, [IO.Compression.ZipArchiveMode]::Create)
  try {
    foreach ($item in $items) {
      $entryName = $item.FullName.Substring($appRoot.Length + 1).Replace('\','/')
      [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $item.FullName, $entryName, [IO.Compression.CompressionLevel]::Optimal) | Out-Null
    }
  } finally { $archive.Dispose(); $stream.Dispose() }
  Get-Item -LiteralPath $Destination | Select-Object FullName,Length
}

$sourceNames = @('.gitignore','.gitattributes','.github','package.json','package-lock.json','main.cjs','preload.cjs','core.cjs','renderer.js','index.html','styles.css','persona.json','persona-sandrone.json','duo-scenes.json','README.md','THIRD_PARTY_NOTICES.md','Launch-Columbina.cmd','assets','docs','test','scripts')
Write-ProjectZip (Join-Path $outputRoot 'columbina-sandrone-desktop-source.zip') $sourceNames
if (-not $SourceOnly) {
  if (-not (Test-Path -LiteralPath (Join-Path $appRoot 'portable\Columbina.exe'))) { throw 'Run npm run build:portable first, or use -SourceOnly.' }
  Write-ProjectZip (Join-Path $outputRoot 'columbina-sandrone-desktop-win-x64.zip') @('portable','Launch-Columbina.cmd','README.md','THIRD_PARTY_NOTICES.md','docs')
}
