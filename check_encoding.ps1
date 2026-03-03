$bytes = [System.IO.File]::ReadAllBytes('public\index.html')
Write-Host ("BOM check: " + $bytes[0].ToString('X2') + " " + $bytes[1].ToString('X2') + " " + $bytes[2].ToString('X2'))

$text = [System.IO.File]::ReadAllText('public\index.html', [System.Text.Encoding]::UTF8)
$idx = $text.IndexOf('outline-btn')
if ($idx -gt 0) {
    $sub = $text.Substring($idx, 80)
    Write-Host "HTML emoji test: $sub"
}

$jsText = [System.IO.File]::ReadAllText('public\js\app.js', [System.Text.Encoding]::UTF8)
$idx2 = $jsText.IndexOf('ENGINES')
if ($idx2 -gt 0) {
    $sub2 = $jsText.Substring($idx2, 120)
    Write-Host "JS emoji test: $sub2"
}
