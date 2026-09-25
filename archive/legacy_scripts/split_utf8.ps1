# Proper UTF-8 split script using .NET APIs
# No emojis in this script to avoid encoding issues

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$srcPath = Join-Path $PSScriptRoot "public\index.html"

# Read entire file as proper UTF-8
$allText = [System.IO.File]::ReadAllText($srcPath, [System.Text.Encoding]::UTF8)
$lines = $allText -split "`r?`n"
$total = $lines.Count
Write-Host "Total lines: $total"

# --- Find CSS boundaries ---
$styleStart = -1
$styleEnd = -1
for ($i = 0; $i -lt $total; $i++) {
    $trimmed = $lines[$i].Trim()
    if ($trimmed -eq '<style>') { $styleStart = $i + 1 }
    if ($trimmed -eq '</style>' -and $styleStart -gt 0 -and $styleEnd -lt 0) { $styleEnd = $i - 1 }
}
Write-Host "CSS block: lines $($styleStart+1) to $($styleEnd+1)"

# Find the Miro CSS section
$miroStart = -1
for ($i = $styleStart; $i -le $styleEnd; $i++) {
    if ($lines[$i] -match 'Miro Page') { $miroStart = $i; break }
}

if ($miroStart -gt 0) {
    $baseCssContent = ($lines[$styleStart..($miroStart - 1)]) -join "`n"
    $cssDir = Join-Path $PSScriptRoot "public\css"
    [System.IO.File]::WriteAllText((Join-Path $cssDir "base.css"), $baseCssContent, $utf8NoBom)
    Write-Host "base.css: $($miroStart - $styleStart) lines"

    $miroCssContent = ($lines[$miroStart..$styleEnd]) -join "`n"
    [System.IO.File]::WriteAllText((Join-Path $cssDir "miro.css"), $miroCssContent, $utf8NoBom)
    Write-Host "miro.css: $($styleEnd - $miroStart + 1) lines"
}
else {
    Write-Host "ERROR: Could not find Miro CSS section"
    exit 1
}

# --- Find JS boundaries ---
$scriptStart = -1
$scriptEnd = -1
for ($i = $total - 1; $i -ge 0; $i--) {
    $trimmed = $lines[$i].Trim()
    if ($trimmed -eq '</script>' -and $scriptEnd -lt 0) { $scriptEnd = $i - 1 }
    if ($trimmed -eq '<script>' -and $scriptEnd -gt 0 -and $scriptStart -lt 0) { $scriptStart = $i + 1 }
}
Write-Host "JS block: lines $($scriptStart+1) to $($scriptEnd+1)"

# Find JS section markers
$outlineStart = -1
$miroEngStart = -1
$thumbStart = -1
$stickyStart = -1
$alignStart = -1

for ($i = $scriptStart; $i -le $scriptEnd; $i++) {
    if ($lines[$i] -match 'Outline Sidebar') { $outlineStart = $i }
    if ($lines[$i] -match 'Miro Page Engine') { $miroEngStart = $i }
    if ($lines[$i] -match 'Fast Thumbnail') { $thumbStart = $i }
    if ($lines[$i] -match '4-Corner Resize') { $stickyStart = $i }
    if ($lines[$i] -match 'Alignment Handle Drag') { $alignStart = $i }
}

Write-Host "Sections: Outline=$($outlineStart+1) MiroEng=$($miroEngStart+1) Thumb=$($thumbStart+1) Sticky=$($stickyStart+1) Align=$($alignStart+1)"

$jsDir = Join-Path $PSScriptRoot "public\js"

$appContent = ($lines[$scriptStart..($outlineStart - 1)]) -join "`n"
[System.IO.File]::WriteAllText((Join-Path $jsDir "app.js"), $appContent, $utf8NoBom)
Write-Host "app.js: $($outlineStart - $scriptStart) lines"

$outlineContent = ($lines[$outlineStart..($miroEngStart - 1)]) -join "`n"
[System.IO.File]::WriteAllText((Join-Path $jsDir "outline.js"), $outlineContent, $utf8NoBom)
Write-Host "outline.js: $($miroEngStart - $outlineStart) lines"

$miroEngContent = ($lines[$miroEngStart..($thumbStart - 1)]) -join "`n"
[System.IO.File]::WriteAllText((Join-Path $jsDir "miro-engine.js"), $miroEngContent, $utf8NoBom)
Write-Host "miro-engine.js: $($thumbStart - $miroEngStart) lines"

$thumbContent = ($lines[$thumbStart..($stickyStart - 1)]) -join "`n"
[System.IO.File]::WriteAllText((Join-Path $jsDir "thumbnails.js"), $thumbContent, $utf8NoBom)
Write-Host "thumbnails.js: $($stickyStart - $thumbStart) lines"

$miroCardsContent = ($lines[$stickyStart..($alignStart - 1)]) -join "`n"
[System.IO.File]::WriteAllText((Join-Path $jsDir "miro-cards.js"), $miroCardsContent, $utf8NoBom)
Write-Host "miro-cards.js: $($alignStart - $stickyStart) lines"

$alignContent = ($lines[$alignStart..$scriptEnd]) -join "`n"
[System.IO.File]::WriteAllText((Join-Path $jsDir "alignment.js"), $alignContent, $utf8NoBom)
Write-Host "alignment.js: $($scriptEnd - $alignStart + 1) lines"

# --- Rebuild index.html ---
$header = ($lines[0..($styleStart - 2)]) -join "`n"
$middle = ($lines[($styleEnd + 1)..($scriptStart - 2)]) -join "`n"

# Get lines after the closing </script>
$closingScriptLine = $scriptEnd + 1
$footer = ""
if (($closingScriptLine + 1) -lt $total) {
    $footer = ($lines[($closingScriptLine + 1)..($total - 1)]) -join "`n"
}

# Remove duplicate </html>
$footer = [regex]::Replace($footer, '(</html>)\s*(</html>(\s*</html>)*)', '</html>')

$cssRefs = "  <link rel=`"stylesheet`" href=`"css/base.css`">`n  <link rel=`"stylesheet`" href=`"css/miro.css`">"
$jsRefs = "  <script src=`"js/app.js`"></script>`n  <script src=`"js/outline.js`"></script>`n  <script src=`"js/miro-engine.js`"></script>`n  <script src=`"js/thumbnails.js`"></script>`n  <script src=`"js/miro-cards.js`"></script>`n  <script src=`"js/alignment.js`"></script>"

$newHtml = $header + "`n" + $cssRefs + "`n" + $middle + "`n" + $jsRefs + "`n" + $footer

[System.IO.File]::WriteAllText($srcPath, $newHtml, $utf8NoBom)

$finalLines = ([System.IO.File]::ReadAllText($srcPath, [System.Text.Encoding]::UTF8) -split "`r?`n").Count
Write-Host "`nNew index.html: $finalLines lines"
Write-Host "Done! All files re-extracted with proper UTF-8 (no BOM)."
