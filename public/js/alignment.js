// ─── Alignment Handle Drag ───
(function () {
  const handle = document.getElementById('miro-align-handle');
  const indicator = document.getElementById('miro-col-indicator');
  let startX = 0,
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
    totalCards = _miroSelected.size;
    baseCols = Math.round(Math.sqrt(totalCards));

    const page = cp();
    origCards = [];
    _miroSelected.forEach((cid) => {
      const c = (page.miroCards || []).find((x) => x.id === cid);
      if (c) origCards.push({ id: c.id, x: c.x || 0, y: c.y || 0, w: c.w || 280, h: c.h || 240 });
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
    // Moving right = more columns, moving left = fewer columns (like Miro)
    const colDelta = Math.round(deltaX / 100);
    const cols = clamp(baseCols + colDelta, 1, totalCards);
    arrangeGrid(cols, e);
  }

  function arrangeGrid(cols, e) {
    const page = cp();
    const gap = 18;
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
        const newX = anchorX + col * (uniformW + gap);
        const newY = anchorY + row * (uniformH + gap);
        const c = (page.miroCards || []).find((x) => x.id === oc.id);
        if (c) {
          c.x = newX;
          c.y = newY;
          c.w = uniformW;
          c.h = uniformH;
        }
        const el = document.querySelector(`.miro-card[data-cid="${oc.id}"]`);
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
      for (let ci = 1; ci < cols; ci++) colOffsets[ci] = colOffsets[ci - 1] + colMaxW[ci - 1] + gap;
      const rowOffsets = [0];
      for (let ri = 1; ri < rows; ri++) rowOffsets[ri] = rowOffsets[ri - 1] + rowMaxH[ri - 1] + gap;

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
        const el = document.querySelector(`.miro-card[data-cid="${oc.id}"]`);
        if (el) {
          el.style.left = newX + 'px';
          el.style.top = newY + 'px';
          el.style.width = oc.w + 'px';
          el.style.height = oc.h + 'px';
        }
      });
    }

    updateMiroSelFrame();

    // Show column indicator near cursor
    const modeLabel = _forceUniform ? ' ⊞' : '';
    indicator.textContent = `${cols} col${cols > 1 ? 's' : ''} × ${rows} row${rows > 1 ? 's' : ''}${modeLabel}`;
    indicator.classList.add('show');
    indicator.style.left = e.clientX + 20 + 'px';
    indicator.style.top = e.clientY - 20 + 'px';
  }

  function onAlignUp() {
    _alignDragging = false;
    document.removeEventListener('mousemove', onAlignMove);
    document.removeEventListener('mouseup', onAlignUp);
    indicator.classList.remove('show');
    sv();
    updateMiroSelFrame();
  }
})();

// Click on empty canvas deselects
document.getElementById('miro-canvas').addEventListener('click', (e) => {
  if (
    (e.target === document.getElementById('miro-canvas') || e.target.id === 'miro-board') &&
    !_alignDragging &&
    !_justRubberBanded
  ) {
    // If in sticky creation mode, create a note at click position
    if (_stickyCreateMode) {
      const page = cp();
      const canvas = document.getElementById('miro-canvas');
      const canvasRect = canvas.getBoundingClientRect();
      const zoom = (page.zoom || 100) / 100;
      const bx = (e.clientX - canvasRect.left - (page.panX || 0)) / zoom;
      const by = (e.clientY - canvasRect.top - (page.panY || 0)) / zoom;
      if (!page.miroCards) page.miroCards = [];
      const w = 280,
        h = 160;
      const card = {
        id: uid(),
        type: 'sticky',
        text: '',
        color: 'yellow',
        shape: 'rect',
        x: bx - w / 2,
        y: by - h / 2,
        w,
        h,
      };
      page.miroCards.push(card);
      // Exit creation mode
      _stickyCreateMode = false;
      canvas.classList.remove('sn-create-mode');
      document.getElementById('sn-create-hint').classList.remove('show');
      sv();
      buildMiroCanvas();
      buildOutline();
      // Focus the new note's text
      requestAnimationFrame(() => {
        const newEl = document.querySelector(`[data-cid="${card.id}"] .ms-text`);
        if (newEl) newEl.focus();
      });
      return;
    }
    clearMiroSelection();
  }
});

// N key = enter sticky note creation mode
document.addEventListener('keydown', (e) => {
  // Don't trigger if user is typing in an input/textarea/contenteditable
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable)
    return;
  const page = cp();
  if (page.pageType !== 'miro') return;

  if (e.key === 'n' || e.key === 'N') {
    _stickyCreateMode = true;
    document.getElementById('miro-canvas').classList.add('sn-create-mode');
    document.getElementById('sn-create-hint').classList.add('show');
  }
  if (e.key === 'Escape' && _stickyCreateMode) {
    _stickyCreateMode = false;
    document.getElementById('miro-canvas').classList.remove('sn-create-mode');
    document.getElementById('sn-create-hint').classList.remove('show');
  }
});
