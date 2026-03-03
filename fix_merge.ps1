# Fix the split buildMiroSticky function
# miro-cards.js content needs to be appended to thumbnails.js

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$jsDir = Join-Path $PSScriptRoot "public\js"

$thumbPath = Join-Path $jsDir "thumbnails.js"
$cardsPath = Join-Path $jsDir "miro-cards.js"

$thumbContent = [System.IO.File]::ReadAllText($thumbPath, [System.Text.Encoding]::UTF8)
$cardsContent = [System.IO.File]::ReadAllText($cardsPath, [System.Text.Encoding]::UTF8)

# Merge: append miro-cards.js content to thumbnails.js
$merged = $thumbContent + "`n" + $cardsContent
[System.IO.File]::WriteAllText($thumbPath, $merged, $utf8NoBom)

# Clear miro-cards.js (make it empty with a comment)
[System.IO.File]::WriteAllText($cardsPath, "      // Merged into thumbnails.js`n", $utf8NoBom)

$newLines = ($merged -split "`r?`n").Count
Write-Host "thumbnails.js: $newLines lines (merged)"
Write-Host "miro-cards.js: cleared (merged into thumbnails.js)"
Write-Host "Done!"
