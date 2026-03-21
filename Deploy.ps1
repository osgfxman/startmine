$ErrorActionPreference = 'Stop'

# ─── Auto-version: inject timestamp into all versioned file references ───
$ts = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
Write-Host "Auto-versioning with timestamp: $ts" -ForegroundColor Cyan

$indexPath = "$PSScriptRoot\public\index.html"
$swPath    = "$PSScriptRoot\public\sw.js"

# Replace ?v=ANYTHING with ?v=TIMESTAMP in index.html
$html = Get-Content $indexPath -Raw -Encoding UTF8
$html = $html -replace '\?v=[^"'']+', "?v=$ts"
[System.IO.File]::WriteAllText($indexPath, $html, [System.Text.UTF8Encoding]::new($false))
Write-Host "  Updated index.html" -ForegroundColor Green

# Replace CACHE_NAME and asset versions in sw.js
$sw = Get-Content $swPath -Raw -Encoding UTF8
$sw = $sw -replace "const CACHE_NAME = '[^']+';", "const CACHE_NAME = 'startmine-$ts';"
$sw = $sw -replace '\?v=[^"'']+', "?v=$ts"
[System.IO.File]::WriteAllText($swPath, $sw, [System.Text.UTF8Encoding]::new($false))
Write-Host "  Updated sw.js" -ForegroundColor Green

# ─── Deploy ───
Write-Host "`nDeploying to Firebase..." -ForegroundColor Yellow
firebase deploy
Write-Host "`nDone! Version: $ts" -ForegroundColor Green
