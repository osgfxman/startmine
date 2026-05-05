$f = 'c:\Users\NTRA\Desktop\Startmine - 26 Apr\public\js\miro-engine.js'
$c = [System.IO.File]::ReadAllText($f, [System.Text.Encoding]::UTF8)

# 1. Fix progress bars - make interactive (use regex to handle CRLF)
$pattern = "d\.style\.cssText = 'width:3px;height:'\+\(isCur\?'14':'8'\)\+'px;border-radius:1px;background:'\+\(isPast\?'#111':\(isCur\?'#6c8fff':'rgba\(0,0,0,\.1\)'\)\)\+';'\+\(isCur\?'box-shadow:0 0 4px #6c8fff;':''\);\r?\n\s+d\.title = 'W'\+w;\r?\n\s+_wkBar\.appendChild\(d\);"
$replacement = "d.style.cssText = 'width:3px;height:'+(isCur?'14':'8')+'px;border-radius:1px;background:'+(isPast?'#111':(isCur?'#6c8fff':'rgba(0,0,0,.1)'))+';'+(isCur?'box-shadow:0 0 4px #6c8fff;':'')+'transition:height .15s;cursor:pointer;';`r`n      d.title = 'W'+w;`r`n      d.onmouseenter=function(){d.style.height='14px';};`r`n      d.onmouseleave=function(){d.style.height=isCur?'14px':'8px';};`r`n      (function(wn){d.onclick=function(e){e.stopPropagation();_state.offset=(wn-_wk)*7;_state.page=4;_renderPage();_buildOverlay();};})(w);`r`n      _wkBar.appendChild(d);"
$c = [regex]::Replace($c, $pattern, $replacement)

$pattern2 = "d\.style\.cssText = 'width:5px;height:'\+\(isCur\?'14':'6'\)\+'px;border-radius:1px;background:'\+\(isPast\?'#111':\(isCur\?'#10b981':'rgba\(0,0,0,\.08\)'\)\)\+';'\+\(isCur\?'box-shadow:0 0 4px #10b981;':''\);\r?\n\s+d\.title = 'Sprint '\+s;\r?\n\s+_spBar\.appendChild\(d\);"
$replacement2 = "d.style.cssText = 'width:5px;height:'+(isCur?'14':'6')+'px;border-radius:1px;background:'+(isPast?'#111':(isCur?'#10b981':'rgba(0,0,0,.08)'))+';'+(isCur?'box-shadow:0 0 4px #10b981;':'')+'transition:height .15s;cursor:pointer;';`r`n      d.title = 'Sprint '+s;`r`n      d.onmouseenter=function(){d.style.height='14px';};`r`n      d.onmouseleave=function(){d.style.height=isCur?'14px':'6px';};`r`n      (function(sn){d.onclick=function(e){e.stopPropagation();_state.offset=(sn-_sp)*2;_state.page=4;_renderPage();_buildOverlay();};})(s);`r`n      _spBar.appendChild(d);"
$c = [regex]::Replace($c, $pattern2, $replacement2)

# 2. Reduce overlay header height (gantt-overlay-hdr class) - find in CSS
$c = $c.Replace("hdr.className = 'gantt-overlay-hdr';", "hdr.className = 'gantt-overlay-hdr';`r`n    hdr.style.cssText = 'height:22px !important;min-height:22px !important;max-height:22px !important;padding:0 4px !important;overflow:hidden;';")

# 3. Apply v19 Zooper function
$s = "    async function _renderGantt2() {"
$e = "    async function _renderFruit() {"
$si = $c.IndexOf($s); $ei = $c.IndexOf($e)
if ($si -lt 0 -or $ei -lt $si) { Write-Host "FAIL"; exit }
$before = $c.Substring(0, $si); $after = $c.Substring($ei)
$fnContent = Get-Content -Path "c:\Users\NTRA\Desktop\Startmine - 26 Apr\zooper_v17_fn.js" -Raw
$c = $before + $fnContent + "`n" + $after

[System.IO.File]::WriteAllText($f, $c, [System.Text.Encoding]::UTF8)
Write-Host "=== Zooper v19 Done ==="
