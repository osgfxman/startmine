$f = 'c:\Users\NTRA\Desktop\Startmine - 26 Apr\public\js\miro-engine.js'
$c = [System.IO.File]::ReadAllText($f, [System.Text.Encoding]::UTF8)

# Find the drag section by looking for unique strings
$startMark = "Drag-to-select for events (on .pomo-ev cells)"
$endMark = "          sp.appendChild(pg);"

$si = $c.IndexOf($startMark)
if ($si -gt 0) {
  # Go back to find the start of the comment line
  $lineStart = $c.LastIndexOf("`n", $si) + 1
  $ei = $c.IndexOf($endMark, $si)
  
  if ($ei -gt $lineStart) {
    $beforeDrag = $c.Substring(0, $lineStart)
    $afterDrag = $c.Substring($ei)
    
    $newDrag = "          // Drag-to-select (document-level with bounding rect hit testing)`n" +
"          (function(cellElements, sess, dayMs, fruitCalId, frSlotMap, pg) {`n" +
"            var mode = null;`n" +
"            var startSlot = -1;`n" +
"`n" +
"            function getCellAt(x, y) {`n" +
"              for (var i = 0; i < cellElements.length; i++) {`n" +
"                var r = cellElements[i].el.getBoundingClientRect();`n" +
"                if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return cellElements[i];`n" +
"              }`n" +
"              return null;`n" +
"            }`n" +
"`n" +
"            function highlightRange(mn, mx) {`n" +
"              cellElements.forEach(function(ce) {`n" +
"                var tgt = mode === 'ev' ? ce.el.querySelector('.pomo-ev') : ce.el.querySelector('.pomo-fr');`n" +
"                var clr = mode === 'ev' ? '#4285f4' : '#e74c3c';`n" +
"                if (ce.slot >= mn && ce.slot <= mx) {`n" +
"                  tgt.style.outline = '2px solid ' + clr;`n" +
"                } else {`n" +
"                  tgt.style.outline = 'none';`n" +
"                }`n" +
"              });`n" +
"            }`n" +
"`n" +
"            function clearAll() {`n" +
"              cellElements.forEach(function(ce) {`n" +
"                ce.el.querySelector('.pomo-ev').style.outline = 'none';`n" +
"                ce.el.querySelector('.pomo-fr').style.outline = 'none';`n" +
"              });`n" +
"            }`n" +
"`n" +
"            cellElements.forEach(function(ce) {`n" +
"              ce.el.querySelector('.pomo-ev').addEventListener('mousedown', function(e) {`n" +
"                if (e.button !== 0) return;`n" +
"                mode = 'ev'; startSlot = ce.slot; pg._didDrag = false;`n" +
"                highlightRange(ce.slot, ce.slot);`n" +
"                e.preventDefault();`n" +
"              });`n" +
"              ce.el.querySelector('.pomo-fr').addEventListener('mousedown', function(e) {`n" +
"                if (e.button !== 0) return;`n" +
"                mode = 'fr'; startSlot = ce.slot; pg._didDragFr = false;`n" +
"                highlightRange(ce.slot, ce.slot);`n" +
"                e.preventDefault();`n" +
"              });`n" +
"            });`n" +
"`n" +
"            document.addEventListener('mousemove', function(e) {`n" +
"              if (!mode) return;`n" +
"              var hit = getCellAt(e.clientX, e.clientY);`n" +
"              if (!hit) return;`n" +
"              highlightRange(Math.min(startSlot, hit.slot), Math.max(startSlot, hit.slot));`n" +
"            });`n" +
"`n" +
"            document.addEventListener('mouseup', function() {`n" +
"              if (!mode) return;`n" +
"              var curMode = mode; mode = null;`n" +
"              var sel = [];`n" +
"              cellElements.forEach(function(ce) {`n" +
"                var tgt = curMode === 'ev' ? ce.el.querySelector('.pomo-ev') : ce.el.querySelector('.pomo-fr');`n" +
"                if (tgt.style.outline && tgt.style.outline !== 'none') sel.push(ce);`n" +
"              });`n" +
"              clearAll();`n" +
"              if (curMode === 'ev') {`n" +
"                if (sel.length < 2) return;`n" +
"                pg._didDrag = true; setTimeout(function(){ pg._didDrag = false; }, 300);`n" +
"                var sMin = Math.min.apply(null, sel.map(function(h){return h.startMin;}));`n" +
"                var eMin = Math.max.apply(null, sel.map(function(h){return h.endMin;}));`n" +
"                showCalendarEventForm(body, body, null, { mode:'create', startTime:new Date(dayMs+sMin*60000), endTime:new Date(dayMs+eMin*60000) });`n" +
"              } else if (curMode === 'fr') {`n" +
"                if (sel.length < 2) return;`n" +
"                pg._didDragFr = true; setTimeout(function(){ pg._didDragFr = false; }, 300);`n" +
"                if (!fruitCalId) return;`n" +
"                var hasC = sel.filter(function(c2) { return (frSlotMap[c2.absSlot]||[]).length > 0; }).length;`n" +
"                var del2 = hasC > sel.length / 2;`n" +
"                var ops = [];`n" +
"                sel.forEach(function(c2) {`n" +
"                  var fEvs = frSlotMap[c2.absSlot] || [];`n" +
"                  var sM = (sess.start * 60) + (c2.slot * 30);`n" +
"                  var sd2 = new Date(dayMs + sM * 60000), ed2 = new Date(dayMs + (sM+30) * 60000);`n" +
"                  if (del2 && fEvs.length > 0) ops.push(deleteCalendarEvent(fEvs[0].calendarId, fEvs[0].id));`n" +
"                  else if (!del2 && fEvs.length === 0) ops.push(createCalendarEvent(fruitCalId, ""!40's Fruit"", sd2, ed2, ''));`n" +
"                });`n" +
"                if (ops.length) Promise.all(ops).then(function() { _renderToday(); }).catch(function() { _renderToday(); });`n" +
"              }`n" +
"            });`n" +
"          })(cellElements, sess, dayMs, fruitCalId, frSlotMap, pg);`n" +
"`n"

    $c = $beforeDrag + $newDrag + $afterDrag
    Write-Host "[OK] Replaced drag with document-level approach"
  } else {
    Write-Host "[FAIL] endMark not found after startMark"
  }
} else {
  Write-Host "[FAIL] startMark not found"
}

[System.IO.File]::WriteAllText($f, $c, [System.Text.Encoding]::UTF8)
Write-Host "=== Done ==="
