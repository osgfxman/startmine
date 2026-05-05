$f = 'c:\Users\NTRA\Desktop\Startmine - 26 Apr\public\js\miro-engine.js'
$c = [System.IO.File]::ReadAllText($f, [System.Text.Encoding]::UTF8)

# 1. Make progress bars interactive
$old1 = @"
    // Week/Sprint progress bars
    const _wkBar = document.createElement('div');
    _wkBar.style.cssText = 'display:flex;gap:1px;align-items:center;margin-left:8px;';
    for (let w=1;w<=52;w++) {
      const d = document.createElement('div');
      const isPast = w < _wk;
      const isCur = w === _wk;
      d.style.cssText = 'width:3px;height:'+(isCur?'14':'8')+'px;border-radius:1px;background:'+(isPast?'#111':(isCur?'#6c8fff':'rgba(0,0,0,.1)'))+';'+(isCur?'box-shadow:0 0 4px #6c8fff;':'');
      d.title = 'W'+w;
      _wkBar.appendChild(d);
    }
    hdr.appendChild(_wkBar);
    const _spBar = document.createElement('div');
    _spBar.style.cssText = 'display:flex;gap:1px;align-items:center;margin-left:4px;';
    for (let s=1;s<=26;s++) {
      const d = document.createElement('div');
      const isPast = s < _sp;
      const isCur = s === _sp;
      d.style.cssText = 'width:5px;height:'+(isCur?'14':'6')+'px;border-radius:1px;background:'+(isPast?'#111':(isCur?'#10b981':'rgba(0,0,0,.08)'))+';'+(isCur?'box-shadow:0 0 4px #10b981;':'');
      d.title = 'Sprint '+s;
      _spBar.appendChild(d);
    }
    hdr.appendChild(_spBar);
"@

$new1 = @"
    // Interactive Week progress bar - click to navigate
    const _wkBar = document.createElement('div');
    _wkBar.style.cssText = 'display:flex;gap:1px;align-items:center;margin-left:6px;cursor:pointer;';
    for (let w=1;w<=52;w++) {
      const d = document.createElement('div');
      const isPast = w < _wk;
      const isCur = w === _wk;
      d.style.cssText = 'width:3px;height:'+(isCur?'14':'8')+'px;border-radius:1px;background:'+(isPast?'#111':(isCur?'#6c8fff':'rgba(0,0,0,.1)'))+';'+(isCur?'box-shadow:0 0 4px #6c8fff;':'')+'transition:height .15s;';
      d.title = 'W'+w;
      d.onmouseenter=function(){d.style.height='14px';};
      d.onmouseleave=function(){d.style.height=isCur?'14px':'8px';};
      (function(wn){d.onclick=function(e){e.stopPropagation();_state.offset=(wn-_wk)*7;_state.page=4;_renderPage();_buildOverlay();};})(w);
      _wkBar.appendChild(d);
    }
    hdr.appendChild(_wkBar);
    // Interactive Sprint progress bar - click to navigate
    const _spBar = document.createElement('div');
    _spBar.style.cssText = 'display:flex;gap:1px;align-items:center;margin-left:4px;cursor:pointer;';
    for (let s=1;s<=26;s++) {
      const d = document.createElement('div');
      const isPast = s < _sp;
      const isCur = s === _sp;
      d.style.cssText = 'width:5px;height:'+(isCur?'14':'6')+'px;border-radius:1px;background:'+(isPast?'#111':(isCur?'#10b981':'rgba(0,0,0,.08)'))+';'+(isCur?'box-shadow:0 0 4px #10b981;':'')+'transition:height .15s;';
      d.title = 'Sprint '+s;
      d.onmouseenter=function(){d.style.height='14px';};
      d.onmouseleave=function(){d.style.height=isCur?'14px':'6px';};
      (function(sn){d.onclick=function(e){e.stopPropagation();_state.offset=(sn-_sp)*2;_state.page=4;_renderPage();_buildOverlay();};})(s);
      _spBar.appendChild(d);
    }
    hdr.appendChild(_spBar);
"@

$c = $c.Replace($old1, $new1)

# 2. Apply v18 Zooper function
$s = "    async function _renderGantt2() {"
$e = "    async function _renderFruit() {"
$si = $c.IndexOf($s); $ei = $c.IndexOf($e)
if ($si -lt 0 -or $ei -lt $si) { Write-Host "FAIL at Zooper replace"; exit }
$before = $c.Substring(0, $si); $after = $c.Substring($ei)
$fnContent = Get-Content -Path "c:\Users\NTRA\Desktop\Startmine - 26 Apr\zooper_v17_fn.js" -Raw
$c = $before + $fnContent + "`n" + $after

[System.IO.File]::WriteAllText($f, $c, [System.Text.Encoding]::UTF8)
Write-Host "=== Zooper v18 Done ==="
