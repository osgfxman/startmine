$f = 'c:\Users\NTRA\Desktop\Startmine - 26 Apr\public\js\miro-engine.js'
$c = [System.IO.File]::ReadAllText($f, [System.Text.Encoding]::UTF8)
$s = "    async function _renderGantt2() {"
$e = "    async function _renderFruit() {"
$si = $c.IndexOf($s); $ei = $c.IndexOf($e)
if ($si -lt 0 -or $ei -lt $si) { Write-Host "FAIL"; exit }
$before = $c.Substring(0, $si); $after = $c.Substring($ei)

# Read from external file to avoid PS escaping issues
$fnContent = Get-Content -Path "c:\Users\NTRA\Desktop\Startmine - 26 Apr\zooper_v17_fn.js" -Raw

$c = $before + $fnContent + "`n" + $after
[System.IO.File]::WriteAllText($f, $c, [System.Text.Encoding]::UTF8)
Write-Host "=== Zooper v17 Done ==="
