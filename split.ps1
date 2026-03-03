$lines = Get-Content 'public\index.html'
Write-Host "Total lines: $($lines.Count)"

# CSS: base.css = lines 16-2185 (0-indexed: 15-2184)
$lines[15..2184] | Set-Content 'public\css\base.css' -Encoding UTF8
Write-Host "base.css: $((Get-Content 'public\css\base.css').Count) lines"

# CSS: miro.css = lines 2186-3083 (0-indexed: 2185-3082)
$lines[2185..3082] | Set-Content 'public\css\miro.css' -Encoding UTF8
Write-Host "miro.css: $((Get-Content 'public\css\miro.css').Count) lines"

# JS: app.js = lines 3491-4554 (0-indexed: 3490-4553)
$lines[3490..4553] | Set-Content 'public\js\app.js' -Encoding UTF8
Write-Host "app.js: $((Get-Content 'public\js\app.js').Count) lines"

# JS: outline.js = lines 4555-4688 (0-indexed: 4554-4687)
$lines[4554..4687] | Set-Content 'public\js\outline.js' -Encoding UTF8
Write-Host "outline.js: $((Get-Content 'public\js\outline.js').Count) lines"

# JS: miro-engine.js = lines 4689-5194 (0-indexed: 4688-5193)
$lines[4688..5193] | Set-Content 'public\js\miro-engine.js' -Encoding UTF8
Write-Host "miro-engine.js: $((Get-Content 'public\js\miro-engine.js').Count) lines"

# JS: thumbnails.js = lines 5195-5408 (0-indexed: 5194-5407)
$lines[5194..5407] | Set-Content 'public\js\thumbnails.js' -Encoding UTF8
Write-Host "thumbnails.js: $((Get-Content 'public\js\thumbnails.js').Count) lines"

# JS: miro-cards.js = lines 5409-5658 (0-indexed: 5408-5657)
$lines[5408..5657] | Set-Content 'public\js\miro-cards.js' -Encoding UTF8
Write-Host "miro-cards.js: $((Get-Content 'public\js\miro-cards.js').Count) lines"

# JS: alignment.js = lines 5659-5822 (0-indexed: 5658-5821)
$lines[5658..5821] | Set-Content 'public\js\alignment.js' -Encoding UTF8
Write-Host "alignment.js: $((Get-Content 'public\js\alignment.js').Count) lines"

Write-Host "`nAll files extracted successfully!"
