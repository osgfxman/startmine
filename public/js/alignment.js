// ─── Alignment Handle Drag ───
(function () {
  const handle = document.getElementById('miro-align-handle');
  const indicator = document.getElementById('miro-col-indicator');
  let startX = 0, startY = 0,
    baseCols = 0,
    totalCards = 0;
  let origCards = []; // {id, x, y, w, h}
  let anchorX = 0,
    anchorY = 0;
  let uniformW = 280,
    uniformH = 240;
  let _forceUniform = false;

  handle.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (_miroSelected.size < 2) return;

    _alignDragging = true;
    _forceUniform = e.ctrlKey || e.metaKey; // Ctrl+drag = uniform sizing
    startX = e.clientX;
    startY = e.clientY;
    totalCards = _miroSelected.size;
    baseCols = Math.round(Math.sqrt(totalCards));

    const page = cp();
    origCards = [];
    _miroSelected.forEach((cid) => {
      const c = (page.miroCards || []).find((x) => x.id === cid);
      if (c) {
        // Use rendered dimensions to respect CSS min-width/min-height
        const el = document.querySelector(`[data-cid="${cid}"]`);
        const renderedW = el ? Math.max(el.offsetWidth, c.w || 280) : (c.w || 280);
        const renderedH = el ? Math.max(el.offsetHeight, c.h || 240) : (c.h || 240);
        origCards.push({ id: c.id, x: c.x || 0, y: c.y || 0, w: renderedW, h: renderedH });
      }
    });

    // Calculate uniform card size (average) — used only in Ctrl mode
    uniformW = Math.round(origCards.reduce((s, c) => s + c.w, 0) / origCards.length);
    uniformH = Math.round(origCards.reduce((s, c) => s + c.h, 0) / origCards.length);

    // Anchor = top-left of bounding box
    anchorX = Math.min(...origCards.map((c) => c.x));
    anchorY = Math.min(...origCards.map((c) => c.y));

    // Immediately arrange in initial grid
    arrangeGrid(baseCols, e);

    document.addEventListener('mousemove', onAlignMove);
    document.addEventListener('mouseup', onAlignUp);
  });

  function onAlignMove(e) {
    if (!_alignDragging) return;
    const deltaX = e.clientX - startX;
    const deltaY = e.clientY - startY;
    // Moving right = more columns, moving left = fewer columns (like Miro)
    const colDelta = Math.round(deltaX / 100);
    const cols = clamp(baseCols + colDelta, 1, totalCards);

    // Calculate overflow beyond alignment limits for distribution
    const maxCols = totalCards;
    const rawCols = baseCols + colDelta;
    let extraGapH = 0, extraGapV = 0;

    if (rawCols > maxCols) {
      // Dragging right past max cols → distribute horizontal spacing
      extraGapH = Math.max(0, (rawCols - maxCols) * 30);
    } else if (rawCols < 1) {
      // Dragging left past 1 col (all in one column) → distribute vertical spacing
      extraGapV = Math.max(0, (1 - rawCols) * 30);
    }

    // Vertical drag controls gap distribution:
    // - Normal: up/down adjusts vertical gap (between rows)
    // - Ctrl held: up/down adjusts horizontal gap (between columns)
    // - Ctrl+Alt held: up/down adjusts both gaps together
    const verticalGapDelta = Math.max(0, deltaY * 0.5);
    if ((e.ctrlKey || e.metaKey) && e.altKey) {
      extraGapH += verticalGapDelta;
      extraGapV += verticalGapDelta;
    } else if (e.ctrlKey || e.metaKey) {
      extraGapH += verticalGapDelta;
    } else {
      extraGapV += verticalGapDelta;
    }

    arrangeGrid(cols, e, extraGapH, extraGapV);
  }

  function arrangeGrid(cols, e, extraGapH, extraGapV) {
    const page = cp();
    const baseGap = 6;
    const gapH = baseGap + (extraGapH || 0);
    const gapV = baseGap + (extraGapV || 0);
    const rows = Math.ceil(totalCards / cols);

    // Sort cards by their original position (left-to-right, top-to-bottom)
    const sorted = [...origCards].sort((a, b) => {
      const rowA = Math.floor(a.y / 100),
        rowB = Math.floor(b.y / 100);
      if (Math.abs(rowA - rowB) > 0) return rowA - rowB;
      return a.x - b.x;
    });

    if (_forceUniform) {
      // Ctrl mode: all cards get uniform size
      sorted.forEach((oc, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const newX = anchorX + col * (uniformW + gapH);
        const newY = anchorY + row * (uniformH + gapV);
        const c = (page.miroCards || []).find((x) => x.id === oc.id);
        if (c) {
          c.x = newX;
          c.y = newY;
          c.w = uniformW;
          c.h = uniformH;
        }
        const el = document.querySelector(`[data-cid="${oc.id}"]`);
        if (el) {
          el.style.left = newX + 'px';
          el.style.top = newY + 'px';
          el.style.width = uniformW + 'px';
          el.style.height = uniformH + 'px';
        }
      });
    } else {
      // Default mode: preserve each card's original size
      // Calculate max width per column and max height per row
      const colMaxW = new Array(cols).fill(0);
      const rowMaxH = new Array(rows).fill(0);
      sorted.forEach((oc, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        colMaxW[col] = Math.max(colMaxW[col], oc.w);
        rowMaxH[row] = Math.max(rowMaxH[row], oc.h);
      });

      // Calculate cumulative offsets for each column and row
      const colOffsets = [0];
      for (let ci = 1; ci < cols; ci++) colOffsets[ci] = colOffsets[ci - 1] + colMaxW[ci - 1] + gapH;
      const rowOffsets = [0];
      for (let ri = 1; ri < rows; ri++) rowOffsets[ri] = rowOffsets[ri - 1] + rowMaxH[ri - 1] + gapV;

      sorted.forEach((oc, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        // Center card within its cell
        const cellW = colMaxW[col];
        const cellH = rowMaxH[row];
        const newX = anchorX + colOffsets[col] + (cellW - oc.w) / 2;
        const newY = anchorY + rowOffsets[row] + (cellH - oc.h) / 2;
        const c = (page.miroCards || []).find((x) => x.id === oc.id);
        if (c) {
          c.x = newX;
          c.y = newY;
        } // keep original w/h
        const el = document.querySelector(`[data-cid="${oc.id}"]`);
        if (el) {
          el.style.left = newX + 'px';
          el.style.top = newY + 'px';
          el.style.width = oc.w + 'px';
          el.style.height = oc.h + 'px';
        }
      });
    }

    updateMiroSelFrame();
  }

  function onAlignUp() {
    _alignDragging = false;
    document.removeEventListener('mousemove', onAlignMove);
    document.removeEventListener('mouseup', onAlignUp);
    sv();
    // Save selection IDs BEFORE buildMiroCanvas (which calls _miroSelected.clear())
    const savedSel = [..._miroSelected];
    buildMiroCanvas();
    // Restore selection after DOM rebuild
    savedSel.forEach(cid => addMiroSelect(cid));
    updateMiroSelFrame();
  }
})();

// Click on empty canvas deselects (creation modes handled by miro-engine.js click handler)
document.getElementById('miro-canvas').addEventListener('click', (e) => {
  if (
    (e.target === document.getElementById('miro-canvas') || e.target.id === 'miro-board') &&
    !_alignDragging &&
    !_justRubberBanded
  ) {
    // If in a creation mode, let the miro-engine click handler deal with it
    if (_stickyCreateMode || _textCreateMode || _gridCreateMode || _mindmapCreateMode || _widgetCreateMode) return;
    if (typeof closeOpenGroup === 'function') closeOpenGroup();
    clearMiroSelection();
  }
});

// ─── Group Resize via Selection Frame Corners ───
(function () {
  document.querySelectorAll('.msel-resize').forEach(handle => {
    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const corner = handle.dataset.corner; // tl, tr, bl, br
      const page = cp();
      const zoom = (page.zoom || 100) / 100;
      const bbox = getSelectedCardsBBox();
      const startX = e.clientX;
      const startY = e.clientY;
      const startW = bbox.w;
      const startH = bbox.h;
      // Anchor = opposite corner
      const anchorX = corner.includes('r') ? bbox.minX : bbox.maxX;
      const anchorY = corner.includes('b') ? bbox.minY : bbox.maxY;
      // Snapshot original card positions/sizes
      const origCards = [];
      _miroSelected.forEach(cid => {
        const c = (page.miroCards || []).find(x => x.id === cid);
        if (c) origCards.push({ id: cid, x: c.x || 0, y: c.y || 0, w: c.w || 280, h: c.h || 240 });
      });
      pushUndo();

      function onMove(ev) {
        const dx = (ev.clientX - startX) / zoom;
        const dy = (ev.clientY - startY) / zoom;
        // Determine new bbox size based on corner
        let newW = startW, newH = startH;
        if (corner === 'br') { newW = startW + dx; newH = startH + dy; }
        else if (corner === 'bl') { newW = startW - dx; newH = startH + dy; }
        else if (corner === 'tr') { newW = startW + dx; newH = startH - dy; }
        else if (corner === 'tl') { newW = startW - dx; newH = startH - dy; }
        newW = Math.max(40, newW);
        newH = Math.max(40, newH);
        // Shift = lock aspect ratio
        if (ev.shiftKey) {
          const s = Math.max(newW / startW, newH / startH);
          newW = startW * s;
          newH = startH * s;
        }
        const scaleX = newW / startW;
        const scaleY = newH / startH;
        origCards.forEach(o => {
          const c = page.miroCards.find(x => x.id === o.id);
          if (!c) return;
          c.w = Math.max(20, o.w * scaleX);
          c.h = Math.max(20, o.h * scaleY);
          c.x = anchorX + (o.x - anchorX) * scaleX;
          c.y = anchorY + (o.y - anchorY) * scaleY;
          // Update DOM directly for live feedback
          const el = document.querySelector(`[data-cid="${c.id}"]`);
          if (el) {
            el.style.left = c.x + 'px';
            el.style.top = c.y + 'px';
            el.style.width = c.w + 'px';
            el.style.height = c.h + 'px';
          }
        });
        updateMiroSelFrame();
      }
      function onUp() {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        sv();
        const savedSel = [..._miroSelected];
        buildMiroCanvas();
        savedSel.forEach(cid => addMiroSelect(cid));
        updateMiroSelFrame();
        // Re-run autoSizeText on resized sticky notes
        const curPage = cp();
        savedSel.forEach(cid => {
          const c = (curPage.miroCards || []).find(x => x.id === cid);
          if (c && c.type === 'sticky' && c.fontSizeMode === 'auto') {
            const el = document.querySelector(`[data-cid="${cid}"]`);
            if (el) {
              const txt = el.querySelector('.ms-text');
              if (txt) requestAnimationFrame(() => autoSizeText(txt, el));
            }
          }
        });
      }
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  });
})();
