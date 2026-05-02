$f = 'c:\Users\NTRA\Desktop\Startmine - 26 Apr\public\js\miro-engine.js'
$c = [System.IO.File]::ReadAllText($f)

# Change const body to let body inside _buildOverlay
$old = "    const body = document.createElement('div');`r`n    body.className = 'gantt-overlay-body';"
$new = "    let body = document.createElement('div');`r`n    body.className = 'gantt-overlay-body';"

if ($c.Contains($old)) {
  $c = $c.Replace($old, $new)
  [System.IO.File]::WriteAllText($f, $c)
  Write-Host "Fixed: const body -> let body"
} else {
  Write-Host "Not found, trying alt..."
  $old2 = "    const body = document.createElement('div');" + [char]10 + "    body.className = 'gantt-overlay-body';"
  $new2 = "    let body = document.createElement('div');" + [char]10 + "    body.className = 'gantt-overlay-body';"
  if ($c.Contains($old2)) {
    $c = $c.Replace($old2, $new2)
    [System.IO.File]::WriteAllText($f, $c)
    Write-Host "Fixed (alt): const body -> let body"
  } else {
    Write-Host "ERROR: Could not find target"
  }
}
