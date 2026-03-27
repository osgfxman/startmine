// ─── Alignment Handle Drag (Miro-style progressive spacing) ───
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

  // ─── Right-click settings popup ───
  handle.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (_miroSelected.size < 2) return;

    // Remove existing popup if any
    let popup = document.getElementById('align-settings-popup');
    if (popup) popup.remove();

    const page = cp();
    const cards = [];
    _miroSelected.forEach(cid => {
      const c = (page.miroCards || []).find(x => x.id === cid);
      if (c) cards.push(c);
    });
    if (cards.length < 2) return;

    // Detect current layout
    const currentCols = detectCurrentCols(cards);
    const currentRows = Math.ceil(cards.length / currentCols);

    popup = document.createElement('div');
    popup.id = 'align-settings-popup';
    popup.style.cssText = `
      position: fixed; left: ${e.clientX}px; top: ${e.clientY}px;
      background: #1e2030; border: 1px solid rgba(108,143,255,0.3);
      border-radius: 10px; padding: 12px 14px; z-index: 9999;
      box-shadow: 0 8px 32px rgba(0,0,0,0.5); backdrop-filter: blur(12px);
      display: flex; flex-direction: column; gap: 8px; min-width: 180px;
      font-family: var(--font); color: #ccc; font-size: 0.78rem;
    `;

    function row(label, value, id) {
      const r = document.createElement('div');
      r.style.cssText = 'display:flex; align-items:center; justify-content:space-between; gap:8px;';
      const lbl = document.createElement('span');
      lbl.textContent = label;
      lbl.style.cssText = 'font-weight:600; color:#aaa; font-size:0.72rem;';
      const inp = document.createElement('input');
      inp.type = 'number';
      inp.id = id;
      inp.value = value;
      inp.min = id === 'aset-cols' ? 1 : 0;
      inp.style.cssText = `
        width: 54px; background: rgba(255,255,255,0.08);
        border: 1px solid rgba(255,255,255,0.15); border-radius: 5px;
        color: #fff; font-size: 0.75rem; font-weight: 600;
        text-align: center; padding: 4px 6px; outline: none;
        -moz-appearance: textfield; appearance: textfield;
      `;
      r.appendChild(lbl);
      r.appendChild(inp);
      popup.appendChild(r);
      return inp;
    }

    const colInput = row('Columns', currentCols, 'aset-cols');
    const gapHInput = row('Col Gap', 6, 'aset-gaph');
    const gapVInput = row('Row Gap', 6, 'aset-gapv');

    const applyBtn = document.createElement('button');
    applyBtn.textContent = 'Apply';
    applyBtn.style.cssText = `
      background: linear-gradient(135deg, #4a7aff, #6c8fff);
      border: none; color: #fff; padding: 6px 0; border-radius: 7px;
      cursor: pointer; font-size: 0.78rem; font-weight: 700;
      margin-top: 4px; transition: background 0.15s;
    `;
    applyBtn.onclick = () => {
      const cols = clamp(parseInt(colInput.value) || 1, 1, cards.length);
      const gH = Math.max(0, parseInt(gapHInput.value) || 0);
      const gV = Math.max(0, parseInt(gapVInput.value) || 0);

      origCards = cards.map(c => ({ id: c.id, x: c.x || 0, y: c.y || 0, w: c.w || 280, h: c.h || 240 }));
      anchorX = Math.min(...origCards.map(c => c.x));
      anchorY = Math.min(...origCards.map(c => c.y));
      totalCards = origCards.length;
      _forceUniform = false;

      pushUndo();
      arrangeGrid(cols, null, gH, gV);
      sv();
      const savedSel = [..._miroSelected];
      buildMiroCanvas();
      savedSel.forEach(cid => addMiroSelect(cid));
      updateMiroSelFrame();

      popup.remove();
    };
    popup.appendChild(applyBtn);

    document.body.appendChild(popup);

    // Close on click outside
    function closePopup(ev) {
      if (!popup.contains(ev.target)) {
        popup.remove();
        document.removeEventListener('mousedown', closePopup);
      }
    }
    setTimeout(() => document.addEventListener('mousedown', closePopup), 50);
  });

  // ─── Main drag handler ───
  handle.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return; // Only left click
    e.preventDefault();
    e.stopPropagation();
    if (_miroSelected.size < 2) return;

    _alignDragging = true;
    _forceUniform = false;
    startX = e.clientX;
    startY = e.clientY;
    totalCards = _miroSelected.size;
    baseCols = Math.round(Math.sqrt(totalCards));

    const page = cp();
    origCards = [];
    _miroSelected.forEach((cid) => {
      const c = (page.miroCards || []).find((x) => x.id === cid);
      if (c) {
        const el = document.querySelector(`[data-cid="${cid}"]`);
        const renderedW = el ? Math.max(el.offsetWidth, c.w || 280) : (c.w || 280);
        const renderedH = el ? Math.max(el.offsetHeight, c.h || 240) : (c.h || 240);
        origCards.push({ id: c.id, x: c.x || 0, y: c.y || 0, w: renderedW, h: renderedH });
      }
    });

    uniformW = Math.round(origCards.reduce((s, c) => s + c.w, 0) / origCards.length);
    uniformH = Math.round(origCards.reduce((s, c) => s + c.h, 0) / origCards.length);

    anchorX = Math.min(...origCards.map((c) => c.x));
    anchorY = Math.min(...origCards.map((c) => c.y));

    // Calculate widest row width for each col count (used for progressive spacing)
    pushUndo();
    arrangeGrid(baseCols, e);

    document.addEventListener('mousemove', onAlignMove);
    document.addEventListener('mouseup', onAlignUp);
  });

  function onAlignMove(e) {
    if (!_alignDragging) return;

    const isModifier = e.ctrlKey || e.metaKey || e.altKey;

    if (isModifier) {
      // ─── MODIFIER MODE: old behavior ───
      const deltaX = e.clientX - startX;
      const deltaY = e.clientY - startY;
      const colDelta = Math.round(deltaX / 100);
      const cols = clamp(baseCols + colDelta, 1, totalCards);

      let extraGapH = 0, extraGapV = 0;
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
    } else {
      // ─── MIRO-STYLE MODE: progressive columns + spacing ───
      const totalDeltaX = e.clientX - startX;

      // Calculate the total width of a single-row layout (all items side by side, no gap)
      const avgW = uniformW;
      const avgH = uniformH;
      const ROW_GAP = 6; // Fixed row gap

      // The total available "spread" from anchor determines cols + gap
      // For each possible col count, calculate the base width (items touching)
      // Then the remaining delta becomes gap
      const minSpread = avgW; // 1 column = avgW
      const currentSpread = baseCols * avgW + totalDeltaX;

      // Find which column count this spread corresponds to
      let bestCols = 1;
      let bestGap = 0;

      for (let c = totalCards; c >= 1; c--) {
        const baseWidth = c * avgW; // Width with 0 gap
        if (currentSpread >= baseWidth) {
          bestCols = c;
          // Remaining spread becomes gap between columns
          if (c > 1) {
            bestGap = Math.max(0, (currentSpread - baseWidth) / (c - 1));
          } else {
            bestGap = 0;
          }
          break;
        }
      }

      bestCols = clamp(bestCols, 1, totalCards);

      arrangeGrid(bestCols, e, bestGap, ROW_GAP);
    }
  }

  function arrangeGrid(cols, e, extraGapH, extraGapV) {
    const page = cp();
    const gapH = extraGapH !== undefined ? extraGapH : 6;
    const gapV = extraGapV !== undefined ? extraGapV : 6;
    const rows = Math.ceil(totalCards / cols);

    // Sort cards by their original position (left-to-right, top-to-bottom)
    const sorted = [...origCards].sort((a, b) => {
      const rowA = Math.floor(a.y / 100),
        rowB = Math.floor(b.y / 100);
      if (Math.abs(rowA - rowB) > 0) return rowA - rowB;
      return a.x - b.x;
    });

    if (_forceUniform) {
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
      // Preserve each card's original size
      const colMaxW = new Array(cols).fill(0);
      const rowMaxH = new Array(rows).fill(0);
      sorted.forEach((oc, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        colMaxW[col] = Math.max(colMaxW[col], oc.w);
        rowMaxH[row] = Math.max(rowMaxH[row], oc.h);
      });

      const colOffsets = [0];
      for (let ci = 1; ci < cols; ci++) colOffsets[ci] = colOffsets[ci - 1] + colMaxW[ci - 1] + gapH;
      const rowOffsets = [0];
      for (let ri = 1; ri < rows; ri++) rowOffsets[ri] = rowOffsets[ri - 1] + rowMaxH[ri - 1] + gapV;

      sorted.forEach((oc, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const cellW = colMaxW[col];
        const cellH = rowMaxH[row];
        const newX = anchorX + colOffsets[col] + (cellW - oc.w) / 2;
        const newY = anchorY + rowOffsets[row] + (cellH - oc.h) / 2;
        const c = (page.miroCards || []).find((x) => x.id === oc.id);
        if (c) {
          c.x = newX;
          c.y = newY;
        }
        const el = document.querySelector(`[data-cid="${oc.id}"]`);
        if (el) {
          el.style.left = newX + 'px';
          el.style.top = newY + 'px';
          el.style.width = oc.w + 'px';
          el.style.height = oc.h + 'px';
        }
      });
    }

    // Update indicator
    if (indicator) {
      indicator.textContent = cols + '×' + Math.ceil(totalCards / cols);
      indicator.style.display = 'block';
    }
    updateMiroSelFrame();
  }

  function onAlignUp() {
    _alignDragging = false;
    if (indicator) indicator.style.display = 'none';
    document.removeEventListener('mousemove', onAlignMove);
    document.removeEventListener('mouseup', onAlignUp);
    sv();
    const savedSel = [..._miroSelected];
    buildMiroCanvas();
    savedSel.forEach(cid => addMiroSelect(cid));
    updateMiroSelFrame();
  }

  // Detect current columns from card positions
  function detectCurrentCols(cards) {
    if (cards.length < 2) return 1;
    const ys = cards.map(c => c.y || 0);
    const minY = Math.min(...ys);
    const threshold = 20;
    return cards.filter(c => Math.abs((c.y || 0) - minY) < threshold).length || 1;
  }
})();

// Click on empty canvas deselects (creation modes handled by miro-engine.js click handler)
document.getElementById('miro-canvas').addEventListener('click', (e) => {
  if (
    (e.target === document.getElementById('miro-canvas') || e.target.id === 'miro-board') &&
    !_alignDragging &&
    !_justRubberBanded
  ) {
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
      const corner = handle.dataset.corner;
      const page = cp();
      const zoom = (page.zoom || 100) / 100;
      const bbox = getSelectedCardsBBox();
      const startX = e.clientX;
      const startY = e.clientY;
      const startW = bbox.w;
      const startH = bbox.h;
      const isEdge = ['t', 'b', 'l', 'r'].includes(corner);
      // For edges: anchor is the opposite edge center
      const anchorX = (corner === 'r' || corner === 'tr' || corner === 'br') ? bbox.minX :
                      (corner === 'l' || corner === 'tl' || corner === 'bl') ? bbox.maxX :
                      bbox.minX; // t/b: keep X unchanged
      const anchorY = (corner === 'b' || corner === 'bl' || corner === 'br') ? bbox.minY :
                      (corner === 't' || corner === 'tl' || corner === 'tr') ? bbox.maxY :
                      bbox.minY; // l/r: keep Y unchanged
      const origCards = [];
      _miroSelected.forEach(cid => {
        const c = (page.miroCards || []).find(x => x.id === cid);
        if (c) origCards.push({ id: cid, x: c.x || 0, y: c.y || 0, w: c.w || 280, h: c.h || 240 });
      });
      pushUndo();

      function onMove(ev) {
        const dx = (ev.clientX - startX) / zoom;
        const dy = (ev.clientY - startY) / zoom;
        let newW = startW, newH = startH;

        // Corners
        if (corner === 'br') { newW = startW + dx; newH = startH + dy; }
        else if (corner === 'bl') { newW = startW - dx; newH = startH + dy; }
        else if (corner === 'tr') { newW = startW + dx; newH = startH - dy; }
        else if (corner === 'tl') { newW = startW - dx; newH = startH - dy; }
        // Edges (single axis)
        else if (corner === 'r') { newW = startW + dx; }
        else if (corner === 'l') { newW = startW - dx; }
        else if (corner === 'b') { newH = startH + dy; }
        else if (corner === 't') { newH = startH - dy; }

        newW = Math.max(40, newW);
        newH = Math.max(40, newH);

        if (ev.shiftKey && !isEdge) {
          const s = Math.max(newW / startW, newH / startH);
          newW = startW * s;
          newH = startH * s;
        }

        const scaleX = isEdge && (corner === 't' || corner === 'b') ? 1 : newW / startW;
        const scaleY = isEdge && (corner === 'l' || corner === 'r') ? 1 : newH / startH;

        origCards.forEach(o => {
          const c = page.miroCards.find(x => x.id === o.id);
          if (!c) return;
          c.w = Math.max(20, o.w * scaleX);
          c.h = Math.max(20, o.h * scaleY);
          c.x = anchorX + (o.x - anchorX) * scaleX;
          c.y = anchorY + (o.y - anchorY) * scaleY;
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
