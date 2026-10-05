param(
  [Parameter(Mandatory = $false)]
  [ValidateSet('1', '2', '3', '4')]
  [string]$Part = ''
)

$ErrorActionPreference = 'Stop'

$dir = 'C:\Users\DELL\Desktop\Insurance-System\scripts\migration\schema-parts'

$targets = @(
  [pscustomobject]@{ N = '1'; File = 'REST-01.sql' },
  [pscustomobject]@{ N = '2'; File = 'REST-02.sql' },
  [pscustomobject]@{ N = '3'; File = 'REST-03.sql' },
  [pscustomobject]@{ N = '4'; File = 'REST-04.sql' }
)

function Show-Part {
  param([string]$File)

  $path = Join-Path $dir $File

  if (-not (Test-Path -LiteralPath $path)) {
    Write-Host ''
    Write-Host "  [X] File not found: $path" -ForegroundColor Red
    Write-Host '      Run the bundles script first.' -ForegroundColor Yellow
    return
  }

  $bytes = (Get-Item -LiteralPath $path).Length
  $text  = Get-Content -LiteralPath $path -Raw

  $null = [System.Windows.Forms.Clipboard]::SetText($text)

  $kb = [math]::Round($bytes / 1KB, 0)
  $lines = ($text -split "`r?`n").Count
  $last = $text.Trim().Substring($text.Trim().Length - 1)

  Write-Host ''
  Write-Host "  [OK] $File" -ForegroundColor Green -NoNewline
  Write-Host "  ($kb KB, $lines lines, ends '$last')" -ForegroundColor DarkGray
  Write-Host '       Copied to clipboard. Paste into Supabase SQL Editor with Ctrl+V.' -ForegroundColor DarkGray
}

Write-Host ''
Write-Host '  ============================================================' -ForegroundColor Cyan
Write-Host '   Insurance-System  -  schema-parts bundles to clipboard' -ForegroundColor Cyan
Write-Host '  ============================================================' -ForegroundColor Cyan

Add-Type -AssemblyName System.Windows.Forms

if ([string]::IsNullOrWhiteSpace($Part)) {
  Write-Host ''
  Write-Host '  Available:' -ForegroundColor White
  foreach ($t in $targets) {
    $p = Join-Path $dir $t.File
    $size = if (Test-Path -LiteralPath $p) { "$([math]::Round((Get-Item -LiteralPath $p).Length / 1KB, 0)) KB" } else { 'MISSING' }
    Write-Host ("    {0}. {1,-14} {2}" -f $t.N, $t.File, $size) -ForegroundColor Gray
  }
  Write-Host ''
  Write-Host '  Run all four, in order:' -ForegroundColor White
  Write-Host '    .\open-part.ps1' -ForegroundColor Green
  Write-Host ''
  Write-Host '  Or one at a time:' -ForegroundColor Gray
  Write-Host '    .\open-part.ps1 -Part 1' -ForegroundColor Gray
  Write-Host ''
} else {
  $t = $targets | Where-Object { $_.N -eq $Part }
  Show-Part -File $t.File
}

Write-Host ''
