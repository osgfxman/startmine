# Check specific emoji bytes in the files
$utf8 = [System.Text.Encoding]::UTF8

# Check app.js for the user-email emoji
$appJs = [System.IO.File]::ReadAllText("public\js\app.js", $utf8)
$idx = $appJs.IndexOf("user-email")
if ($idx -gt 0) {
    # Find the emoji near "user-email"
    $chunk = $appJs.Substring($idx, 100)
    Write-Host "app.js user-email context:"
    Write-Host $chunk
    Write-Host ""
    
    # Find the actual emoji bytes
    $emojiIdx = $appJs.IndexOf("textContent = '", $idx)
    if ($emojiIdx -gt 0) {
        $emojiArea = $appJs.Substring($emojiIdx + 15, 10)
        $bytes = $utf8.GetBytes($emojiArea)
        Write-Host "Emoji bytes: $($bytes[0..7] | ForEach-Object { $_.ToString('X2') })"
        Write-Host "Emoji chars: $emojiArea"
    }
}

# Check index.html for search button
$html = [System.IO.File]::ReadAllText("public\index.html", $utf8)
$idx2 = $html.IndexOf("id=""seb""")
if ($idx2 -gt 0) {
    $chunk2 = $html.Substring($idx2, 40)
    Write-Host ""
    Write-Host "index.html seb button:"
    Write-Host $chunk2
    $emojiIdx2 = $html.IndexOf(">", $idx2) + 1
    $emojiArea2 = $html.Substring($emojiIdx2, 6)
    $bytes2 = $utf8.GetBytes($emojiArea2)
    Write-Host "Emoji bytes: $($bytes2[0..5] | ForEach-Object { $_.ToString('X2') })"
}

# Check Quick Inbox placeholder
$idx3 = $html.IndexOf("Quick Inbox")
if ($idx3 -gt 0) {
    $start = [Math]::Max(0, $idx3 - 20)
    $chunk3 = $html.Substring($start, 40)
    Write-Host ""
    Write-Host "Quick Inbox placeholder:"
    Write-Host $chunk3
}
