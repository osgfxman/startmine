/**
 * @module MiroEngine
 * @description Core event loop, interaction handling, and tools for the Miro canvas
 * @namespace SM.miro.engine
 * @depends namespace.js, miro-state.js, builders.js, grid.js
 * @provides window.setActiveTool, window.deleteMiroCard, window.performUndo, window.unpinAll, window.createWidgetFromSelection
 * @safety Prevent conflicting touch and mouse interactions
 */
console.log('[MIRO-ENGINE.JS] ✅ Loaded at', new Date().toISOString());
/* ─── Miro Page Engine ─── */
// State moved to miro-state.js

/* ─── Edge Auto-Pan: pan canvas when mouse is near screen edge during drag ─── */
// State moved to miro-state.js
function startEdgeAutoPan(e) {
  const edge = 40, speed = 8;
  const page = cp();
  if (!page) return;
  const canvas = document.getElementById('miro-canvas');
  if (!canvas) return;
  const w = window.innerWidth, h = window.innerHeight;
  let dx = 0, dy = 0;
  if (e.clientX < edge) dx = speed;
  else if (e.clientX > w - edge) dx = -speed;
  if (e.clientY < edge) dy = speed;
  else if (e.clientY > h - edge) dy = -speed;
  if (dx === 0 && dy === 0) { stopEdgeAutoPan(); return; }
  if (_edgePanRAF) return; // already running
  function tick() {
    page.panX = (page.panX || 0) + dx;
    page.panY = (page.panY || 0) + dy;
    const zoom = (page.zoom || 100) / 100;
    canvas.style.transform = `translate(${page.panX}px,${page.panY}px) scale(${zoom})`;
    _edgePanRAF = requestAnimationFrame(tick);
  }
  _edgePanRAF = requestAnimationFrame(tick);
}
function stopEdgeAutoPan() {
  if (_edgePanRAF) { cancelAnimationFrame(_edgePanRAF); _edgePanRAF = null; }
}

/* ─── Multi-Step Undo System ─── */
const _undoStack = [];
const UNDO_MAX = 50;
let _undoInProgress = false;
function pushUndo() {
  if (_undoInProgress) return;
  const page = cp();
  if (!page || !page.miroCards) return;
  const snapshot = JSON.stringify(page.miroCards);
  // Don't push if identical to last snapshot
  if (_undoStack.length > 0 && _undoStack[_undoStack.length - 1] === snapshot) return;
  _undoStack.push(snapshot);
  if (_undoStack.length > UNDO_MAX) _undoStack.shift();
}
function performUndo() {
  if (_undoStack.length === 0) {
    if (typeof showToast === 'function') showToast('Nothing to undo');
    return;
  }
  const page = cp();
  if (!page) return;
  const currentState = JSON.stringify(page.miroCards);
  // Skip entries identical to current state (no visible change)
  while (_undoStack.length > 0 && _undoStack[_undoStack.length - 1] === currentState) {
    _undoStack.pop();
  }
  if (_undoStack.length === 0) {
    if (typeof showToast === 'function') showToast('Nothing to undo');
    return;
  }
  const snapshot = _undoStack.pop();
  try {
    _undoInProgress = true;
    page.miroCards = JSON.parse(snapshot);
    _miroSelected.clear();
    buildMiroCanvas();
    sv();
    setTimeout(() => { if (typeof buildOutline === 'function') buildOutline(); }, 50);
    _undoInProgress = false;
    if (typeof showToast === 'function') showToast('↩ Undo');
  } catch (e) { _undoInProgress = false; console.error('[UNDO ERROR]', e); }
}



function getCardAbsoluteCoords(card, page, canvasW, canvasH) {
  if (!card.cell) {
    return {
      x: card.x || 0,
      y: card.y || 0,
      w: card.w || 280,
      h: card.h || 240
    };
  }

  let cellLeft = 0;
  let cellTop = 0;

  if (card.cell.startsWith('cc_')) {
    const cc = (page.customCells || []).find(c => c.id === card.cell);
    if (cc) {
      cellLeft = cc.x * canvasW;
      cellTop = cc.y * canvasH;
    }
  } else {
    const vg = [0, ...(page.vGuides || []).sort((a,b)=>a-b), 1];
    const hg = [0, ...(page.hGuides || []).sort((a,b)=>a-b), 1];
    const parts = card.cell.split('_');
    const c = parseInt(parts[0]), r = parseInt(parts[1]);
    if (!isNaN(c) && !isNaN(r)) {
      cellLeft = (vg[c] || 0) * canvasW;
      cellTop = (hg[r] || 0) * canvasH;
    }
  }

  const state = (page.cellStates && page.cellStates[card.cell]) || { zoom: 100, panX: 0, panY: 0 };
  const cellZoom = (state.zoom || 100) / 100;
  const cellPanX = state.panX || 0;
  const cellPanY = state.panY || 0;

  return {
    x: cellLeft + cellPanX + (card.x || 0) * cellZoom,
    y: cellTop + cellPanY + (card.y || 0) * cellZoom,
    w: (card.w || 280) * cellZoom,
    h: (card.h || 240) * cellZoom
  };
}

function addMiroSelect(cid) {
  if (_miroSelected.has(cid)) return;
  _miroSelected.add(cid);
  const el = document.querySelector(`[data-cid="${cid}"]`);
  if (el) el.classList.add('miro-selected');
}
function removeMiroSelect(cid) {
  if (!_miroSelected.has(cid)) return;
  _miroSelected.delete(cid);
  const el = document.querySelector(`[data-cid="${cid}"]`);
  if (el) el.classList.remove('miro-selected');
}
function toggleMiroSelect(cid) {
  if (_miroSelected.has(cid)) removeMiroSelect(cid);
  else addMiroSelect(cid);
  updateMiroSelFrame();
}
function clearMiroSelection() {
  _miroSelected.forEach((cid) => {
    const el = document.querySelector(`[data-cid="${cid}"]`);
    if (el) {
      el.classList.remove('miro-selected');
      // Hide sticky toolbar if present
      const tb = el.querySelector('.sn-toolbar');
      if (tb) tb.classList.remove('show');
    }
  });
  _miroSelected.clear();
  document.getElementById('miro-sel-frame').style.display = 'none';
}
function getSelectedCardsBBox() {
  const page = cp();
  const canvas = document.getElementById('miro-canvas');
  const canvasW = canvas ? canvas.clientWidth : 1000;
  const canvasH = canvas ? canvas.clientHeight : 800;

  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  _miroSelected.forEach((cid) => {
    const c = (page.miroCards || []).find((x) => x.id === cid);
    if (!c) return;
    const abs = getCardAbsoluteCoords(c, page, canvasW, canvasH);
    minX = Math.min(minX, abs.x);
    minY = Math.min(minY, abs.y);
    maxX = Math.max(maxX, abs.x + abs.w);
    maxY = Math.max(maxY, abs.y + abs.h);
  });
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
}
function updateMiroSelFrame() {
  const frame = document.getElementById('miro-sel-frame');
  if (_miroSelected.size < 2) {
    frame.style.display = 'none';
    return;
  }
  const bbox = getSelectedCardsBBox();
  if (bbox.w <= 0 || bbox.h <= 0) {
    frame.style.display = 'none';
    return;
  }
  const pad = 12;
  frame.style.display = 'block';
  frame.style.left = bbox.minX - pad + 'px';
  frame.style.top = bbox.minY - pad + 'px';
  frame.style.width = bbox.w + pad * 2 + 'px';
  frame.style.height = bbox.h + pad * 2 + 'px';

  // Counter-scale interactive elements so they stay constant size on screen
  const page = cp();
  const zoom = (page.zoom || 100) / 100;
  const invZoom = Math.min(3, Math.max(0.25, 1 / zoom));
  const handleEls = frame.querySelectorAll('#miro-align-handle, #miro-widget-handle, #miro-multi-lock');
  handleEls.forEach(el => {
    el.style.transform = `scale(${invZoom})`;
  });
  // Filter/Convert buttons need both translateX and scale
  const filterBtn = document.getElementById('miro-filter-btn');
  const convertBtn = document.getElementById('miro-convert-btn');
  if (filterBtn) filterBtn.style.transform = `translateX(-120%) scale(${invZoom})`;
  if (convertBtn) convertBtn.style.transform = `translateX(20%) scale(${invZoom})`;

  // ── Type icons/labels ──
  const typeInfo = {
    sticky:    { icon: '📝', label: 'Sticky note' },
    shape:     { icon: '⬠', label: 'Shape' },
    text:      { icon: 'T',  label: 'Text' },
    image:     { icon: '🖼️', label: 'Image' },
    bookmark:  { icon: '🔗', label: 'Bookmark' },
    trelloList:{ icon: '📋', label: 'Trello list' },
  };

  // ── Count types in selection ──
  const typeCounts = {};
  _miroSelected.forEach(cid => {
    const c = (page.miroCards || []).find(x => x.id === cid);
    if (c) {
      const t = c.type || 'sticky';
      typeCounts[t] = (typeCounts[t] || 0) + 1;
    }
  });
  const typeKeys = Object.keys(typeCounts).sort();

  // ── Populate Filter menu ──
  const filterLabel = document.getElementById('miro-filter-label');
  const filterMenu  = document.getElementById('miro-filter-menu');
  filterLabel.textContent = `Filter ${_miroSelected.size}`;
  filterMenu.innerHTML = '';

  // Color hex map for sticky dots
  const _filterColorHex = {
    yellow: '#f9e96b', pink: '#f4a4c0', green: '#a6d89b', blue: '#84c6e8',
    purple: '#c9a6e8', orange: '#f5b971', red: '#ff6b6b', cyan: '#66d9e8',
    white: '#f1f3f5', gray: '#adb5bd', dark: '#495057', magenta: '#e64980',
  };

  // Count sticky colors
  const stickyColorCounts = {};
  _miroSelected.forEach(cid => {
    const c = (page.miroCards || []).find(x => x.id === cid);
    if (c && (c.type || 'sticky') === 'sticky') {
      const col = c.color || 'yellow';
      stickyColorCounts[col] = (stickyColorCounts[col] || 0) + 1;
    }
  });

  typeKeys.forEach(t => {
    const info = typeInfo[t] || { icon: '?', label: t };
    const label = t === 'sticky' && Object.keys(stickyColorCounts).length > 1
      ? `${info.label} (ALL)` : info.label;
    const row = document.createElement('div');
    row.className = 'dd-row';
    row.innerHTML = `<span class="dd-icon">${info.icon}</span>${label}<span class="dd-count">${typeCounts[t]}</span>`;
    row.addEventListener('click', (e) => {
      e.stopPropagation();
      const curPage = cp();
      const toRemove = [];
      _miroSelected.forEach(cid => {
        const c = (curPage.miroCards || []).find(x => x.id === cid);
        if (c && (c.type || 'sticky') !== t) toRemove.push(cid);
      });
      toRemove.forEach(cid => removeMiroSelect(cid));
      updateMiroSelFrame();
    });
    filterMenu.appendChild(row);

    // Add color sub-rows for stickies
    if (t === 'sticky' && Object.keys(stickyColorCounts).length > 1) {
      Object.entries(stickyColorCounts).sort((a, b) => b[1] - a[1]).forEach(([col, cnt]) => {
        const cRow = document.createElement('div');
        cRow.className = 'dd-row';
        cRow.style.paddingLeft = '28px';
        const dot = `<span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:${_filterColorHex[col] || '#ccc'};margin-right:6px;vertical-align:middle;border:1px solid rgba(0,0,0,0.15)"></span>`;
        cRow.innerHTML = `${dot}${col}<span class="dd-count">${cnt}</span>`;
        cRow.addEventListener('click', (ev) => {
          ev.stopPropagation();
          const curPage = cp();
          const toRemove = [];
          _miroSelected.forEach(cid => {
            const c = (curPage.miroCards || []).find(x => x.id === cid);
            if (!c || (c.type || 'sticky') !== 'sticky' || (c.color || 'yellow') !== col) toRemove.push(cid);
          });
          toRemove.forEach(cid => removeMiroSelect(cid));
          updateMiroSelFrame();
        });
        filterMenu.appendChild(cRow);
      });
    }
  });

  // ── Populate Convert To menu ──
  const convertMenu = document.getElementById('miro-convert-menu');
  convertMenu.innerHTML = '';
  const convertTargets = ['sticky', 'shape', 'text'];
  convertTargets.forEach(t => {
    const info = typeInfo[t] || { icon: '?', label: t };
    const row = document.createElement('div');
    row.className = 'dd-row';
    row.innerHTML = `<span class="dd-icon">${info.icon}</span>${info.label}`;
    row.addEventListener('click', (e) => {
      e.stopPropagation();
      convertSelectedTo(t);
    });
    convertMenu.appendChild(row);
  });
}

// ── Convert selected elements to target type ──
function convertSelectedTo(targetType) {
  pushUndo();
  const page = cp();
  _miroSelected.forEach(cid => {
    const c = (page.miroCards || []).find(x => x.id === cid);
    if (!c) return;
    const oldType = c.type || 'sticky';
    if (oldType === targetType) return;

    c.type = targetType;
    // Set sensible defaults based on target
    if (targetType === 'sticky') {
      if (!c.color) c.color = 'yellow';
      // Preserve shape fill color as sticky bg
      if (oldType === 'shape' && c.fillColor && c.fillColor !== 'none') {
        c.bgHex = c.fillColor;
      }
      // Keep text from shape
      if (oldType === 'shape' && c.text === undefined) c.text = '';
      // Clean up shape properties
      delete c.shape; delete c.fillColor; delete c.strokeColor; delete c.strokeWidth; delete c.textColor;
    }
    if (targetType === 'shape') {
      if (!c.shape) c.shape = 'rect';
      if (!c.fillColor) c.fillColor = c.bgHex || '#e6e6e6';
      if (!c.strokeColor) c.strokeColor = '#333';
    }
    if (targetType === 'text') {
      // Remove visual bg for plain text
      delete c.color;
      delete c.bgHex;
      if (!c.fontSize) c.fontSize = 18;
    }
  });
  sv();
  buildMiroCanvas();
  updateMiroSelFrame();
}

/* ─── Miro Infinite Zoom Grid ─── */






// ─── Video URL Detection ───


// Resolve TikTok short URLs to full URLs




// ─── Play video inside card ───




// Canvas Pan + Rubber-band selection
(function () {
  const canvas = document.getElementById('miro-canvas');
  let _rubberBanding = false;
  let _rbStartX = 0,
    _rbStartY = 0;
  let _rbCellKey = null;
  let _wheelSvTimer = null;

  canvas.addEventListener('mousedown', (e) => {
    const page = cp();
    if (page && (page.pageType === 'web' || page.id.startsWith('time_'))) return;

    // Custom Freeform Cell drawing mode handling
    if (window._customCellDrawMode && e.button === 0) {
      e.stopPropagation();
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      window._drawingCustomCell = true;
      window._drawCellStartX = e.clientX - rect.left;
      window._drawCellStartY = e.clientY - rect.top;

      let temp = document.getElementById('miro-temp-cell-draw');
      if (!temp) {
        temp = document.createElement('div');
        temp.id = 'miro-temp-cell-draw';
        temp.style.position = 'absolute';
        temp.style.border = '2px dashed #ff8a65';
        temp.style.background = 'rgba(255, 138, 101, 0.15)';
        temp.style.borderRadius = '8px';
        temp.style.pointerEvents = 'none';
        temp.style.zIndex = '99999';
        canvas.appendChild(temp);
      }
      temp.style.left = window._drawCellStartX + 'px';
      temp.style.top = window._drawCellStartY + 'px';
      temp.style.width = '0px';
      temp.style.height = '0px';
      temp.style.display = 'block';
      return;
    }

    // Cell Pan Start delegation for Slices Mode (prevent if in any card creation/drawing mode)
    const hasGuides = page && (page._guidesMode || (page.vGuides && page.vGuides.length > 0) || (page.hGuides && page.hGuides.length > 0) || (page.customCells && page.customCells.length > 0));
    const anyCreateMode = typeof _stickyCreateMode !== 'undefined' && (_stickyCreateMode || _textCreateMode || _gridCreateMode || _mindmapCreateMode || _widgetCreateMode || _trelloCreateMode || _embedCreateMode || _overlayPageCreateMode || _penMode || _shapeMode);
    if (!anyCreateMode && hasGuides && typeof window.handleMiroCellPanStart === 'function') {
      if (e.target === canvas || e.target.id === 'miro-board' || (e.target.closest('.miro-cell-viewport') && !e.target.closest('[data-cid]') && !e.target.closest('.miro-guide-v, .miro-guide-h'))) {
        if (window.handleMiroCellPanStart(e)) return;
      }
    }

    const isMiro = page.pageType === 'miro';

    // FIRST: if in a creation/drawing mode, pass through immediately
    // so the click-to-place handler can handle it.
    // This MUST be checked BEFORE the target guard to avoid swallowing clicks.
    if (isMiro && (_stickyCreateMode || _textCreateMode || _gridCreateMode || _mindmapCreateMode || _widgetCreateMode || _penMode || _shapeMode)) {
      return; // Let the click-to-place handler handle it
    }

    // Only handle pan/rubberband if clicking on empty canvas or board
    // BUT middle mouse button (button === 1) always pans, even over elements
    if (e.button === 1) {
      e.preventDefault();
      _miroPanning = true;
      _miroPanStartX = e.clientX - (page.panX || 0);
      _miroPanStartY = e.clientY - (page.panY || 0);
      canvas.style.cursor = 'grabbing';
      return;
    }
    // Allow rubber-band over locked elements: if target is inside a locked card, treat as empty canvas
    const insideViewport = e.target.closest('.miro-cell-viewport');
    const onGuide = e.target.closest('.miro-guide-v, .miro-guide-h');
    const onMenuOrModal = e.target.closest('.miro-slices-menu, .miro-cell-modal, .sn-toolbar');

    if (e.target !== canvas && e.target.id !== 'miro-board' && !insideViewport) {
      const cardEl = e.target.closest('[data-cid]');
      if (cardEl) {
        const cid = cardEl.dataset.cid;
        const card = (page.miroCards || []).find(c => c.id === cid);
        if (!card || !card.locked) return; // Non-locked card: let card's own handler deal with it
        // Locked card: fall through to rubber-band logic below
      } else {
        return; // Not a card element, not canvas
      }
    } else {
      if (insideViewport) {
        const cardEl = e.target.closest('[data-cid]');
        if (cardEl) {
          const cid = cardEl.dataset.cid;
          const card = (page.miroCards || []).find(c => c.id === cid);
          if (!card || !card.locked) return; // Non-locked card: let card's own handler deal with it
        }
        if (onGuide || onMenuOrModal) {
          return; // Do not start rubber-band when dragging guides or menus
        }
      }
    }
    if (e.button !== 0) {
      e.preventDefault();
      _miroPanning = true;
      _miroPanStartX = e.clientX - (page.panX || 0);
      _miroPanStartY = e.clientY - (page.panY || 0);
      canvas.style.cursor = 'grabbing';
      return;
    }

    e.preventDefault();

    // Left-click on empty space: start rubber-band selection if miro page
    if (isMiro) {
      _rubberBanding = true;
      const box = document.getElementById('miro-sel-box');
      if (insideViewport) {
        _rbCellKey = insideViewport.dataset.cellKey;
        const cellBoard = insideViewport.querySelector('.miro-cell-board');
        if (cellBoard) {
          cellBoard.appendChild(box);
          const cellRect = cellBoard.getBoundingClientRect();
          const cellState = (page.cellStates && page.cellStates[_rbCellKey]) || { zoom: 100 };
          const cellZoom = (cellState.zoom || 100) / 100;
          _rbStartX = (e.clientX - cellRect.left) / cellZoom;
          _rbStartY = (e.clientY - cellRect.top) / cellZoom;
        } else {
          _rbCellKey = null;
        }
      }
      if (!_rbCellKey) {
        const board = document.getElementById('miro-board');
        if (board) board.appendChild(box);
        const zoom = (page.zoom || 100) / 100;
        const canvasRect = canvas.getBoundingClientRect();
        _rbStartX = (e.clientX - canvasRect.left - (page.panX || 0)) / zoom;
        _rbStartY = (e.clientY - canvasRect.top - (page.panY || 0)) / zoom;
      }
      box.style.left = _rbStartX + 'px';
      box.style.top = _rbStartY + 'px';
      box.style.width = '0px';
      box.style.height = '0px';
      box.style.display = 'block';
      if (!e.ctrlKey && !e.metaKey) clearMiroSelection();
      canvas.style.cursor = 'crosshair';
      return;
    }

    // Regular pan for non-miro
    _miroPanning = true;
    _miroPanStartX = e.clientX - (page.panX || 0);
    _miroPanStartY = e.clientY - (page.panY || 0);
    canvas.style.cursor = 'grabbing';
  });

  document.addEventListener('mousemove', (e) => {
    if (window._drawingCustomCell) {
      const rect = canvas.getBoundingClientRect();
      const curX = e.clientX - rect.left;
      const curY = e.clientY - rect.top;

      const x = Math.min(window._drawCellStartX, curX);
      const y = Math.min(window._drawCellStartY, curY);
      const w = Math.abs(curX - window._drawCellStartX);
      const h = Math.abs(curY - window._drawCellStartY);

      const temp = document.getElementById('miro-temp-cell-draw');
      if (temp) {
        temp.style.left = x + 'px';
        temp.style.top = y + 'px';
        temp.style.width = w + 'px';
        temp.style.height = h + 'px';
      }
      return;
    }

    if (typeof window.handleMiroCellPanMove === 'function' && window.handleMiroCellPanMove(e)) return;

    // Rubber-band drag
    if (_rubberBanding) {
      const page = cp();
      let curX = 0, curY = 0;
      if (_rbCellKey) {
        const cellViewport = document.querySelector(`.miro-cell-viewport[data-cell-key="${_rbCellKey}"]`);
        const cellBoard = cellViewport ? cellViewport.querySelector('.miro-cell-board') : null;
        if (cellBoard) {
          const cellRect = cellBoard.getBoundingClientRect();
          const cellState = (page.cellStates && page.cellStates[_rbCellKey]) || { zoom: 100 };
          const cellZoom = (cellState.zoom || 100) / 100;
          curX = (e.clientX - cellRect.left) / cellZoom;
          curY = (e.clientY - cellRect.top) / cellZoom;
        }
      } else {
        const zoom = (page.zoom || 100) / 100;
        const canvasRect = canvas.getBoundingClientRect();
        curX = (e.clientX - canvasRect.left - (page.panX || 0)) / zoom;
        curY = (e.clientY - canvasRect.top - (page.panY || 0)) / zoom;
      }
      const box = document.getElementById('miro-sel-box');
      const x = Math.min(_rbStartX, curX);
      const y = Math.min(_rbStartY, curY);
      const w = Math.abs(curX - _rbStartX);
      const h = Math.abs(curY - _rbStartY);
      box.style.left = x + 'px';
      box.style.top = y + 'px';
      box.style.width = w + 'px';
      box.style.height = h + 'px';
      // Live selection preview
      if (w > 5 || h > 5) {
        const page2 = cp();
        const canvasW = canvas.clientWidth;
        const canvasH = canvas.clientHeight;

        if (window._mergeSelectionMode) {
          const vg = [0, ...(page2.vGuides || []).sort((a,b)=>a-b), 1];
          const hg = [0, ...(page2.hGuides || []).sort((a,b)=>a-b), 1];
          if (!window._selectedCellsForMerge) window._selectedCellsForMerge = new Set();
          window._selectedCellsForMerge.clear();

          if (typeof window.getActiveCells === 'function') {
            const activeCells = window.getActiveCells(page2);
            activeCells.forEach(span => {
              const cellLeft = vg[span.cStart] * canvasW;
              const cellRight = vg[span.cEnd+1] * canvasW;
              const cellTop = hg[span.rStart] * canvasH;
              const cellBottom = hg[span.rEnd+1] * canvasH;

              const intersects = !(cellRight < x || cellLeft > x + w || cellBottom < y || cellTop > y + h);
              if (intersects) {
                let cellKey = span.cStart + "_" + span.rStart;
                if (span.cStart !== span.cEnd || span.rStart !== span.rEnd) {
                  cellKey = span.cStart + "_" + span.rStart + "_" + span.cEnd + "_" + span.rEnd;
                }
                window._selectedCellsForMerge.add(cellKey);
              }
            });
          }

          // Highlight matching cell DIVs
          document.querySelectorAll('.miro-cell-viewport').forEach(cellDiv => {
            const key = cellDiv.dataset.cellKey;
            const isSelected = window._selectedCellsForMerge.has(key);
            if (isSelected) {
              cellDiv.style.boxShadow = '0 0 15px rgba(255, 107, 53, 0.95), inset 0 0 15px rgba(255, 107, 53, 0.4)';
              cellDiv.style.borderColor = 'rgba(255, 107, 53, 0.9)';
            } else {
              cellDiv.style.boxShadow = '';
              cellDiv.style.borderColor = '';
            }
          });
        } else {
          (page2.miroCards || []).forEach((c) => {
            let intersects = false;
            if (_rbCellKey) {
              if (c.cell === _rbCellKey) {
                const cx = c.x || 0;
                const cy = c.y || 0;
                const cw = c.w || 280;
                const ch = c.h || 240;
                intersects = !(cx + cw < x || cx > x + w || cy + ch < y || cy > y + h);
              }
            } else {
              const abs = getCardAbsoluteCoords(c, page2, canvasW, canvasH);
              intersects = !(abs.x + abs.w < x || abs.x > x + w || abs.y + abs.h < y || abs.y > y + h);
            }
            if (c.locked) return; // Locked elements are invisible to selection
            if (intersects) addMiroSelect(c.id);
            else if (!e.ctrlKey && !e.metaKey) removeMiroSelect(c.id);
          });
        }
      }
      return;
    }

    if (!_miroPanning) return;
    const page = cp();
    page.panX = e.clientX - _miroPanStartX;
    page.panY = e.clientY - _miroPanStartY;
    const zoom = (page.zoom || 100) / 100;
    document.getElementById('miro-board').style.transform =
      `translate(${page.panX}px,${page.panY}px) scale(${zoom})`;
    updateMiroGrid();
  });

  document.addEventListener('mouseup', (e) => {
    if (window._drawingCustomCell) {
      const rect = canvas.getBoundingClientRect();
      const curX = e.clientX - rect.left;
      const curY = e.clientY - rect.top;

      const minX = Math.min(window._drawCellStartX, curX);
      const minY = Math.min(window._drawCellStartY, curY);
      const width = Math.abs(curX - window._drawCellStartX);
      const height = Math.abs(curY - window._drawCellStartY);

      const temp = document.getElementById('miro-temp-cell-draw');
      if (temp) temp.remove();

      window._drawingCustomCell = false;

      if (width > 30 && height > 30) {
        const page = cp();
        if (!page.customCells) page.customCells = [];

        const W = canvas.clientWidth || 1000;
        const H = canvas.clientHeight || 800;

        const cellId = 'cc_' + uid();
        page.customCells.push({
          id: cellId,
          x: minX / W,
          y: minY / H,
          w: width / W,
          h: height / H,
          title: 'Screen ' + (page.customCells.length + 1)
        });

        if (!page.cellStates) page.cellStates = {};
        page.cellStates[cellId] = { zoom: 100, panX: 0, panY: 0 };

        sv();
        buildMiroCanvas();
        showToast('📺 Custom Cell created!', 2000);
      }

      if (typeof window._exitCustomCellDrawMode === 'function') {
        window._exitCustomCellDrawMode();
      }
      return;
    }

    if (typeof window.handleMiroCellPanEnd === 'function' && window.handleMiroCellPanEnd()) return;

    if (_rubberBanding) {
      _rubberBanding = false;
      _justRubberBanded = true;
      setTimeout(() => {
        _justRubberBanded = false;
      }, 50);
      const box = document.getElementById('miro-sel-box');
      if (box) {
        box.style.display = 'none';
        const board = document.getElementById('miro-board');
        if (board && box.parentNode !== board) {
          board.appendChild(box);
        }
      }
      _rbCellKey = null;
      document.getElementById('miro-canvas').style.cursor = 'grab';

      if (window._mergeSelectionMode) {
        const zoom = (page.zoom || 100) / 100;
        const canvasRect = canvas.getBoundingClientRect();
        const curX = (e.clientX - canvasRect.left - (page.panX || 0)) / zoom;
        const curY = (e.clientY - canvasRect.top - (page.panY || 0)) / zoom;
        const x = Math.min(_rbStartX, curX);
        const y = Math.min(_rbStartY, curY);
        const w = Math.abs(curX - _rbStartX);
        const h = Math.abs(curY - _rbStartY);

        if (w > 10 || h > 10) {
          const canvasW = canvas.clientWidth;
          const canvasH = canvas.clientHeight;
          const vg = [0, ...(page.vGuides || []).sort((a,b)=>a-b), 1];
          const hg = [0, ...(page.hGuides || []).sort((a,b)=>a-b), 1];

          let minCol = Infinity, minRow = Infinity;
          let maxCol = -Infinity, maxRow = -Infinity;
          let mergeCount = 0;

          if (typeof window.getActiveCells === 'function') {
            const activeCells = window.getActiveCells(page);
            activeCells.forEach(span => {
              const cellLeft = vg[span.cStart] * canvasW;
              const cellRight = vg[span.cEnd+1] * canvasW;
              const cellTop = hg[span.rStart] * canvasH;
              const cellBottom = hg[span.rEnd+1] * canvasH;

              const intersects = !(cellRight < x || cellLeft > x + w || cellBottom < y || cellTop > y + h);
              if (intersects) {
                minCol = Math.min(minCol, span.cStart);
                minRow = Math.min(minRow, span.rStart);
                maxCol = Math.max(maxCol, span.cEnd);
                maxRow = Math.max(maxRow, span.rEnd);
                mergeCount++;
              }
            });
          }

          if (mergeCount >= 2 && minCol !== Infinity) {
            if (typeof window.mergeMiroCellRange === 'function') {
              window.mergeMiroCellRange(page, minCol, minRow, maxCol, maxRow);
              if (typeof showToast === 'function') showToast('🔗 Cells merged successfully');
              
              // Keep merge mode active
              window._selectedCellsForMerge = new Set();
              
              sv();
              buildMiroCanvas();
            }
          } else {
            // Did not select enough cells, reset styling
            document.querySelectorAll('.miro-cell-viewport').forEach(cellDiv => {
              cellDiv.style.boxShadow = '';
              cellDiv.style.borderColor = '';
            });
          }
        } else {
          // Reset styling
          document.querySelectorAll('.miro-cell-viewport').forEach(cellDiv => {
            cellDiv.style.boxShadow = '';
            cellDiv.style.borderColor = '';
          });
        }
        return;
      }

      updateMiroSelFrame();
      return;
    }
    if (_miroPanning) {
      _miroPanning = false;
      document.getElementById('miro-canvas').style.cursor = 'grab';
      sv();
    }
  });

  // ─── Miro-style predefined zoom levels ───
  const _zoomLevels = [
    1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
    12, 14, 16, 18, 20, 22,
    25, 28, 31, 35, 39, 44, 49, 55, 62, 69, 77, 86, 97, 108,
    121, 136, 152, 171, 191, 214, 240, 268, 301, 337, 377, 400
  ];

  function getNextZoomLevel(current, direction) {
    // direction: 1 = zoom in, -1 = zoom out
    if (direction > 0) {
      for (let i = 0; i < _zoomLevels.length; i++) {
        if (_zoomLevels[i] > current) return _zoomLevels[i];
      }
      return _zoomLevels[_zoomLevels.length - 1];
    } else {
      for (let i = _zoomLevels.length - 1; i >= 0; i--) {
        if (_zoomLevels[i] < current) return _zoomLevels[i];
      }
      return _zoomLevels[0];
    }
  }

  // ─── Wheel: zoom at cursor position with Miro-style zoom steps ───
  canvas.addEventListener(
    'wheel',
    (e) => {
      const page = cp();
      if (page && (page.pageType === 'web' || page.id.startsWith('time_'))) return;

      const hasGuides = page && (page._guidesMode || (page.vGuides && page.vGuides.length > 0) || (page.hGuides && page.hGuides.length > 0) || (page.customCells && page.customCells.length > 0));
      if (hasGuides && typeof window.handleMiroCellWheel === 'function') {
        if (window.handleMiroCellWheel(e)) return;
      }

      e.preventDefault();

      const rect = canvas.getBoundingClientRect();
      const cursorX = e.clientX - rect.left;
      const cursorY = e.clientY - rect.top;

      const oldZoom = (page.zoom || 100) / 100;

      // Calculate cursor position RELATIVE to the unscaled board origin
      const boardPointX = (cursorX - (page.panX || 0)) / oldZoom;
      const boardPointY = (cursorY - (page.panY || 0)) / oldZoom;

      let newZoomNum;
      if (e.ctrlKey) {
        // Trackpad pinch: smooth continuous zoom
        const delta = -e.deltaY * 0.5;
        newZoomNum = Math.max(1, Math.min(400, Math.round((page.zoom || 100) + delta)));
      } else {
        // Mouse wheel: step through predefined levels
        const direction = e.deltaY > 0 ? -1 : 1;
        newZoomNum = getNextZoomLevel(page.zoom || 100, direction);
      }

      page.zoom = newZoomNum;
      const newZoom = newZoomNum / 100;

      // Adjust pan so the exact unscaled board point remains under the cursor screen point
      page.panX = cursorX - (boardPointX * newZoom);
      page.panY = cursorY - (boardPointY * newZoom);

      applyZoomPan(page);

      // Debounced save so zoom state persists
      clearTimeout(_wheelSvTimer);
      _wheelSvTimer = setTimeout(() => sv(), 1000);
    },
    { passive: false },
  );

  // ─── Touch: pinch-to-zoom + single-finger pan ───
  let _touchStartDist = 0;
  let _touchStartZoom = 100;
  let _touchStartPanX = 0;
  let _touchStartPanY = 0;
  let _touchStartMidX = 0;
  let _touchStartMidY = 0;
  let _touchPanning = false;
  let _lastTouchCount = 0;
  let _touchPanStartX = 0;
  let _touchPanStartY = 0;

  canvas.addEventListener('touchstart', (e) => {
    if (e.target !== canvas && e.target.id !== 'miro-board') return;
    const page = cp();
    if (page && (page.pageType === 'web' || page.id.startsWith('time_'))) return;

    if (e.touches.length === 2) {
      // Pinch start
      e.preventDefault();
      const t0 = e.touches[0], t1 = e.touches[1];
      _touchStartDist = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY);
      _touchStartZoom = page.zoom || 100;
      _touchStartPanX = page.panX || 0;
      _touchStartPanY = page.panY || 0;
      _touchStartMidX = (t0.clientX + t1.clientX) / 2;
      _touchStartMidY = (t0.clientY + t1.clientY) / 2;
      _touchPanning = false;
      _lastTouchCount = 2;
    } else if (e.touches.length === 1) {
      // Single finger pan
      _touchPanning = true;
      _touchPanStartX = e.touches[0].clientX - (page.panX || 0);
      _touchPanStartY = e.touches[0].clientY - (page.panY || 0);
      _lastTouchCount = 1;
    }
  }, { passive: false });

  canvas.addEventListener('touchmove', (e) => {
    const page = cp();
    if (page && (page.pageType === 'web' || page.id.startsWith('time_'))) return;

    if (e.touches.length === 2) {
      e.preventDefault();
      const t0 = e.touches[0], t1 = e.touches[1];
      const dist = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY);
      const midX = (t0.clientX + t1.clientX) / 2;
      const midY = (t0.clientY + t1.clientY) / 2;

      // Re-init pinch if transitioning from non-pinch (fixes Android repeat-pinch bug)
      if (_lastTouchCount !== 2 || _touchStartDist === 0) {
        _touchStartDist = dist;
        _touchStartZoom = page.zoom || 100;
        _touchStartPanX = page.panX || 0;
        _touchStartPanY = page.panY || 0;
        _touchStartMidX = midX;
        _touchStartMidY = midY;
        _lastTouchCount = 2;
        return;
      }

      // Zoom
      const scale = dist / _touchStartDist;
      const newZoom = Math.max(1, Math.min(400, Math.round(_touchStartZoom * scale)));
      const oldZoomFrac = _touchStartZoom / 100;
      const newZoomFrac = newZoom / 100;

      // Adjust pan so pinch center stays fixed + track finger movement
      const rect = canvas.getBoundingClientRect();
      const anchorX = _touchStartMidX - rect.left;
      const anchorY = _touchStartMidY - rect.top;
      page.panX = midX - rect.left - (anchorX - _touchStartPanX) * (newZoomFrac / oldZoomFrac);
      page.panY = midY - rect.top - (anchorY - _touchStartPanY) * (newZoomFrac / oldZoomFrac);
      page.zoom = newZoom;
      applyZoomPan(page);
      _touchPanning = false;
    } else if (e.touches.length === 1 && _touchPanning) {
      e.preventDefault();
      page.panX = e.touches[0].clientX - _touchPanStartX;
      page.panY = e.touches[0].clientY - _touchPanStartY;
      const zoom = (page.zoom || 100) / 100;
      document.getElementById('miro-board').style.transform =
        `translate(${page.panX}px,${page.panY}px) scale(${zoom})`;
      updateMiroGrid();
      _lastTouchCount = 1;
    }
  }, { passive: false });

  canvas.addEventListener('touchend', (e) => {
    if (e.touches.length === 0) {
      _touchPanning = false;
      _lastTouchCount = 0;
      sv();
    } else if (e.touches.length === 1) {
      // Switched from pinch to single finger — restart pan
      const page = cp();
      _touchPanning = true;
      _touchPanStartX = e.touches[0].clientX - (page.panX || 0);
      _touchPanStartY = e.touches[0].clientY - (page.panY || 0);
    }
  });

  // ─── Double-click + drag → zoom ───
  let _dblDragActive = false;
  let _dblDragStartY = 0;
  let _dblDragStartZoom = 100;
  let _lastClickTime = 0;
  let _lastClickX = 0;
  let _lastClickY = 0;

  canvas.addEventListener('mousedown', (e) => {
    if (e.target !== canvas && e.target.id !== 'miro-board') return;
    const page = cp();
    if (page && (page.pageType === 'web' || page.id.startsWith('time_'))) return;
    const now = Date.now();
    const dx = Math.abs(e.clientX - _lastClickX);
    const dy = Math.abs(e.clientY - _lastClickY);
    if (now - _lastClickTime < 350 && dx < 10 && dy < 10 && e.button === 0) {
      // Second click within 350ms — enter drag-zoom mode
      e.preventDefault();
      e.stopPropagation();
      _dblDragActive = true;
      _dblDragStartY = e.clientY;
      _dblDragStartZoom = cp().zoom || 100;
      canvas.style.cursor = 'ns-resize';
      // Prevent rubber-band from starting
      _rubberBanding = false;
      document.getElementById('miro-sel-box').style.display = 'none';
    }
    _lastClickTime = now;
    _lastClickX = e.clientX;
    _lastClickY = e.clientY;
  }, true); // capture phase so it fires before the rubber-band handler

  document.addEventListener('mousemove', (e) => {
    if (!_dblDragActive) return;
    e.preventDefault();
    const page = cp();
    const dragDelta = _dblDragStartY - e.clientY; // drag up = zoom in
    const newZoom = Math.max(1, Math.min(400, _dblDragStartZoom + dragDelta * 0.8));
    page.zoom = Math.round(newZoom);
    applyZoomPan(page);
  });

  document.addEventListener('mouseup', (e) => {
    if (_dblDragActive) {
      _dblDragActive = false;
      canvas.style.cursor = 'grab';
      sv();
    }
  });
})();

// ─── Central zoom/pan apply helper ───
function applyZoomPan(page) {
  if (page && (page.pageType === 'web' || page.id.startsWith('time_'))) {
    page.zoom = 100;
    page.panX = 0;
    page.panY = 0;
  }
  const board = document.getElementById('miro-board');
  if (board) {
    if (page && page._guidesMode) {
      board.style.transform = 'none';
      board.style.setProperty('--inv-zoom', '1');
      board.style.zIndex = '2000';
      board.style.pointerEvents = 'none';
    } else {
      const zoom = (page.zoom || 100) / 100;
      board.style.transform =
        `translate(${page.panX || 0}px,${page.panY || 0}px) scale(${zoom})`;
      // Keep floating UI at constant screen size
      board.style.setProperty('--inv-zoom', Math.min(3, Math.max(0.25, 1 / zoom)));
      board.style.zIndex = '';
      board.style.pointerEvents = '';
    }
  }
  const mzSlider = document.getElementById('mz-slider');
  if (mzSlider) mzSlider.value = page.zoom || 100;
  const mzPct = document.getElementById('mz-pct');
  if (mzPct) mzPct.textContent = (page.zoom || 100) + '%';
  updateMiroGrid();
  // Update sel-frame handles if visible
  if (_miroSelected.size >= 2) updateMiroSelFrame();
}

// Zoom to fit selection (or all elements if nothing selected)
function zoomToFitSelection() {
  const page = cp();
  if (!page.miroCards || page.miroCards.length === 0) return;
  const canvas = document.getElementById('miro-canvas');
  const cw = canvas.clientWidth;
  const ch = canvas.clientHeight;
  if (!cw || !ch) return;

  // Get target cards
  let targets;
  if (_miroSelected.size > 0) {
    targets = page.miroCards.filter(c => _miroSelected.has(c.id));
  } else {
    targets = page.miroCards;
  }
  if (targets.length === 0) return;

  // Calculate bounding box
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  targets.forEach(c => {
    const x = c.x || 0, y = c.y || 0;
    const w = c.w || 200, h = c.h || 200;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x + w > maxX) maxX = x + w;
    if (y + h > maxY) maxY = y + h;
  });

  const bw = maxX - minX;
  const bh = maxY - minY;
  if (bw <= 0 || bh <= 0) return;

  // Calculate zoom to fit with 10% padding
  const padding = 0.1;
  const availW = cw * (1 - padding * 2);
  const availH = ch * (1 - padding * 2);
  const fitZoom = Math.min(availW / bw, availH / bh);
  const newZoomNum = Math.max(1, Math.min(400, Math.round(fitZoom * 100)));
  const newZoom = newZoomNum / 100;

  // Center the bounding box
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  page.panX = cw / 2 - centerX * newZoom;
  page.panY = ch / 2 - centerY * newZoom;
  page.zoom = newZoomNum;

  applyZoomPan(page);
  updateMiroScrollbars();
  sv();
  showToast('🔍 Zoom to fit');
}

window._ctrlPressed = false;
window._altPressed = false;
window.addEventListener('keydown', (e) => {
  if (e.key === 'Control') window._ctrlPressed = true;
  if (e.key === 'Alt') window._altPressed = true;
});
window.addEventListener('keyup', (e) => {
  if (e.key === 'Control') window._ctrlPressed = false;
  if (e.key === 'Alt') window._altPressed = false;
});
window.addEventListener('blur', () => {
  window._ctrlPressed = false;
  window._altPressed = false;
});

// Zoom controls
document.getElementById('mz-slider').oninput = function (e) {
  const page = cp();
  const zoomVal = +this.value;
  const hasGuides = page && (page._guidesMode || (page.vGuides && page.vGuides.length > 0) || (page.hGuides && page.hGuides.length > 0) || (page.customCells && page.customCells.length > 0));
  const isCtrlAlt = (e && e.ctrlKey && e.altKey) || (window._ctrlPressed && window._altPressed);

  if (hasGuides && isCtrlAlt) {
    if (page.cellStates) {
      for (const cellKey in page.cellStates) {
        if (page.cellStates.hasOwnProperty(cellKey)) {
          page.cellStates[cellKey].zoom = zoomVal;
        }
      }
    }
    const mzPct = document.getElementById('mz-pct');
    if (mzPct) mzPct.textContent = zoomVal + '%';
    if (typeof buildMiroCanvas === 'function') buildMiroCanvas();
    sv();
  } else {
    page.zoom = zoomVal;
    applyZoomPan(page);
    sv();
  }
};
document.getElementById('mz-in').onclick = (e) => {
  const page = cp();
  const hasGuides = page && (page._guidesMode || (page.vGuides && page.vGuides.length > 0) || (page.hGuides && page.hGuides.length > 0) || (page.customCells && page.customCells.length > 0));
  const isCtrlAlt = (e && e.ctrlKey && e.altKey) || (window._ctrlPressed && window._altPressed);

  if (hasGuides && isCtrlAlt) {
    let currentZoom = 100;
    if (page.cellStates) {
      const keys = Object.keys(page.cellStates);
      if (keys.length > 0) currentZoom = page.cellStates[keys[0]].zoom || 100;
    }
    const newZoom = Math.min(400, currentZoom + 10);
    document.getElementById('mz-slider').value = newZoom;
    document.getElementById('mz-slider').oninput(e);
  } else {
    page.zoom = Math.min(400, (page.zoom || 100) + 10);
    document.getElementById('mz-slider').value = page.zoom;
    document.getElementById('mz-slider').oninput(e);
  }
};
document.getElementById('mz-out').onclick = (e) => {
  const page = cp();
  const hasGuides = page && (page._guidesMode || (page.vGuides && page.vGuides.length > 0) || (page.hGuides && page.hGuides.length > 0) || (page.customCells && page.customCells.length > 0));
  const isCtrlAlt = (e && e.ctrlKey && e.altKey) || (window._ctrlPressed && window._altPressed);

  if (hasGuides && isCtrlAlt) {
    let currentZoom = 100;
    if (page.cellStates) {
      const keys = Object.keys(page.cellStates);
      if (keys.length > 0) currentZoom = page.cellStates[keys[0]].zoom || 100;
    }
    const newZoom = Math.max(1, currentZoom - 10);
    document.getElementById('mz-slider').value = newZoom;
    document.getElementById('mz-slider').oninput(e);
  } else {
    page.zoom = Math.max(1, (page.zoom || 100) - 10);
    document.getElementById('mz-slider').value = page.zoom;
    document.getElementById('mz-slider').oninput(e);
  }
};
document.getElementById('mz-reset').onclick = (e) => {
  const page = cp();
  const hasGuides = page && (page._guidesMode || (page.vGuides && page.vGuides.length > 0) || (page.hGuides && page.hGuides.length > 0) || (page.customCells && page.customCells.length > 0));
  const isCtrlAlt = (e && e.ctrlKey && e.altKey) || (window._ctrlPressed && window._altPressed);

  if (hasGuides && isCtrlAlt) {
    if (page.cellStates) {
      for (const cellKey in page.cellStates) {
        if (page.cellStates.hasOwnProperty(cellKey)) {
          page.cellStates[cellKey].zoom = 100;
        }
      }
    }
    document.getElementById('mz-slider').value = 100;
    document.getElementById('mz-slider').oninput(e);
  } else {
    page.zoom = 100;
    document.getElementById('mz-slider').value = 100;
    document.getElementById('mz-slider').oninput(e);
  }
};
document.getElementById('mz-fit').onclick = () => {
  const page = cp();
  if (!page.miroCards || !page.miroCards.length) return;
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  page.miroCards.forEach((c) => {
    minX = Math.min(minX, c.x || 0);
    minY = Math.min(minY, c.y || 0);
    maxX = Math.max(maxX, (c.x || 0) + (c.w || 280));
    maxY = Math.max(maxY, (c.y || 0) + (c.h || 240));
  });
  const canvas = document.getElementById('miro-canvas');
  const cw = canvas.clientWidth,
    ch = canvas.clientHeight;
  const contentW = maxX - minX + 60,
    contentH = maxY - minY + 60;
  const zoom = Math.min(cw / contentW, ch / contentH, 4) * 100;
  page.zoom = Math.max(1, Math.min(400, Math.round(zoom)));
  page.panX = cw / 2 - ((minX + maxX) / 2) * (page.zoom / 100);
  page.panY = ch / 2 - ((minY + maxY) / 2) * (page.zoom / 100);
  document.getElementById('mz-slider').value = page.zoom;
  document.getElementById('mz-pct').textContent = page.zoom + '%';
  const z = page.zoom / 100;
  document.getElementById('miro-board').style.transform =
    `translate(${page.panX}px,${page.panY}px) scale(${z})`;
  updateMiroGrid();
  sv();
};

// Floating add button → menu toggle
document.getElementById('miro-add-float').onclick = () => {
  document.getElementById('miro-add-menu').classList.toggle('show');
};
// Close menu when clicking elsewhere
document.addEventListener('click', (e) => {
  if (!e.target.closest('#miro-add-float') && !e.target.closest('#miro-add-menu')) {
    document.getElementById('miro-add-menu').classList.remove('show');
  }
});
document.getElementById('miro-opt-card').onclick = () => {
  document.getElementById('miro-add-menu').classList.remove('show');
  document.getElementById('miro-add-url').value = '';
  document.getElementById('miro-add-label').value = '';
  openM('m-miro-add');
};
document.getElementById('miro-opt-sticky').onclick = () => {
  document.getElementById('miro-add-menu').classList.remove('show');
  document.getElementById('sn-add-text').value = '';
  document.querySelectorAll('.sn-csw').forEach((s) => s.classList.remove('sel'));
  document.querySelector('.sn-csw.c-yellow').classList.add('sel');
  document.querySelectorAll('.sn-shp').forEach((s) => s.classList.remove('sel'));
  document.querySelector('.sn-shp[data-shape="square"]').classList.add('sel');
  openM('m-miro-sticky');
};
// Sticky note color picker
document.querySelectorAll('.sn-csw').forEach((sw) => {
  sw.onclick = () => {
    document.querySelectorAll('.sn-csw').forEach((s) => s.classList.remove('sel'));
    sw.classList.add('sel');
  };
});
// Sticky note shape picker
document.querySelectorAll('.sn-shp').forEach((sh) => {
  sh.onclick = () => {
    document.querySelectorAll('.sn-shp').forEach((s) => s.classList.remove('sel'));
    sh.classList.add('sel');
  };
});
// Create sticky note
document.getElementById('ok-miro-sticky').onclick = () => {
  const text = document.getElementById('sn-add-text').value.trim();
  const color = document.querySelector('.sn-csw.sel')?.dataset.color || 'yellow';
  const shape = document.querySelector('.sn-shp.sel')?.dataset.shape || 'square';
  const page = cp();
  if (!page.miroCards) page.miroCards = [];
  const canvas = document.getElementById('miro-canvas');
  const zoom = (page.zoom || 100) / 100;
  const cx = (canvas.clientWidth / 2 - (page.panX || 0)) / zoom;
  const cy = (canvas.clientHeight / 2 - (page.panY || 0)) / zoom;
  const w = shape === 'square' ? 200 : 280;
  const h = shape === 'square' ? 200 : 160;
  const card = {
    id: uid(),
    type: 'sticky',
    text,
    color,
    shape,
    x: cx - w / 2,
    y: cy - h / 2,
    w,
    h,
  };
  page.miroCards.push(card);
  sv();
  buildMiroCanvas();
  buildOutline();
  closeM('m-miro-sticky');
};

// Add card (existing)
document.getElementById('miro-add-url').addEventListener('blur', () => {
  const u = document.getElementById('miro-add-url').value.trim();
  if (u && !document.getElementById('miro-add-label').value) {
    try {
      const h = new URL(u).hostname.replace('www.', '');
      document.getElementById('miro-add-label').value = h
        .split('.')[0]
        .replace(/^./, (c) => c.toUpperCase());
    } catch (e4) { }
  }
});
document.getElementById('ok-miro-add').onclick = () => {
  let url = document.getElementById('miro-add-url').value.trim();
  if (!url) return;
  if (!url.startsWith('http')) url = 'https://' + url;
  const label = document.getElementById('miro-add-label').value.trim() || domainOf(url);
  const page = cp();
  if (!page.miroCards) page.miroCards = [];
  const canvas = document.getElementById('miro-canvas');
  const zoom = (page.zoom || 100) / 100;
  const cx = (canvas.clientWidth / 2 - (page.panX || 0)) / zoom;
  const cy = (canvas.clientHeight / 2 - (page.panY || 0)) / zoom;
  const card = { id: uid(), url, label, x: cx - 140, y: cy - 120, w: 280, h: 240 };
  page.miroCards.push(card);
  sv();
  buildMiroCanvas();
  buildOutline();
  closeM('m-miro-add');
};

// ─── Image Upload ───
// State moved to miro-state.js

document.getElementById('miro-opt-image').onclick = () => {
  document.getElementById('miro-add-menu').classList.remove('show');
  document.getElementById('miro-img-file').value = '';
  document.getElementById('miro-img-label').value = '';
  document.getElementById('miro-img-preview').style.display = 'none';
  document.getElementById('ok-miro-image').disabled = true;
  _miroImgData = null;
  openM('m-miro-image');
};

document.getElementById('miro-img-file').onchange = function (e) {
  const f = e.target.files[0];
  if (!f) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    const base64 = ev.target.result;
    // Show preview
    document.getElementById('miro-img-preview').style.display = 'block';
    document.getElementById('miro-img-prev-el').src = base64;

    // Get natural dimensions
    const tempImg = new Image();
    tempImg.onload = () => {
      const natW = tempImg.naturalWidth;
      const natH = tempImg.naturalHeight;

      // Upload to ImgBB (with compression)
      const btn = document.getElementById('ok-miro-image');
      btn.textContent = 'Compressing…';
      btn.disabled = true;
      uploadToImgBB(base64).then(url => {
        if (url) {
          _miroImgData = { imgbbUrl: url, naturalW: natW, naturalH: natH };
          btn.textContent = 'Add Image';
          btn.disabled = false;
        } else {
          btn.textContent = '⚠️ Upload Failed — Pick Again';
          btn.disabled = false;
          _miroImgData = null;
          if (typeof showToast === 'function') showToast('⚠️ Image upload failed. Try a smaller image or check connection.', 4000);
        }
      });
    };
    tempImg.src = base64;
  };
  reader.readAsDataURL(f);
  this.value = '';
};

document.getElementById('ok-miro-image').onclick = () => {
  if (!_miroImgData) return;
  const label = document.getElementById('miro-img-label').value.trim();
  const page = cp();
  if (!page.miroCards) page.miroCards = [];
  const canvas = document.getElementById('miro-canvas');
  const zoom = (page.zoom || 100) / 100;
  const cx = (canvas.clientWidth / 2 - (page.panX || 0)) / zoom;
  const cy = (canvas.clientHeight / 2 - (page.panY || 0)) / zoom;

  // Scale to max 400px wide, preserving aspect ratio
  const maxW = 400;
  let w = _miroImgData.naturalW;
  let h = _miroImgData.naturalH;
  if (w > maxW) {
    h = Math.round((h / w) * maxW);
    w = maxW;
  }

  const card = {
    id: uid(),
    type: 'image',
    imageUrl: _miroImgData.imgbbUrl,
    label: label || '',
    x: cx - w / 2,
    y: cy - h / 2,
    w,
    h,
  };
  page.miroCards.push(card);
  sv();
  buildMiroCanvas();
  buildOutline();
  closeM('m-miro-image');
  _miroImgData = null;
};

// ─── Drag & Drop Images onto Canvas ───
const IMGBB_KEY = '129f1b49da234235959ee4405ac9ebb1';

// Compress base64 image using Canvas before upload
// Preserves transparency (PNG) when detected, uses JPEG for opaque images
function compressBase64(base64, maxDim = 1000, quality = 0.75) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let w = img.naturalWidth, h = img.naturalHeight;
      // Only resize if too large
      if (w > maxDim || h > maxDim) {
        if (w > h) { h = Math.round(h * maxDim / w); w = maxDim; }
        else { w = Math.round(w * maxDim / h); h = maxDim; }
      }
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      // Detect transparency: check if source is PNG/WebP (has alpha)
      const isPNG = base64.includes('data:image/png') || base64.includes('data:image/webp');
      let hasAlpha = false;
      if (isPNG) {
        // Quick alpha check: sample some pixels
        try {
          const data = ctx.getImageData(0, 0, Math.min(w, 100), Math.min(h, 100)).data;
          for (let i = 3; i < data.length; i += 4) {
            if (data[i] < 250) { hasAlpha = true; break; }
          }
        } catch(e) { hasAlpha = isPNG; }
      }
      // PNG for transparency, JPEG for opaque (much smaller)
      const format = hasAlpha ? 'image/png' : 'image/jpeg';
      const compressed = canvas.toDataURL(format, quality);
      resolve(compressed);
    };
    img.onerror = () => resolve(base64);
    img.src = base64;
  });
}

async function uploadToImgBB(base64) {
  try {
    // Compress first to avoid 400 errors from oversized uploads
    const compressed = await compressBase64(base64);
    const raw = compressed.split(',')[1];
    if (!raw || raw.length < 100) { console.warn('[uploadToImgBB] Invalid compressed data'); return null; }
    const sizeKB = Math.round(raw.length * 3 / 4 / 1024);
    console.log(`[uploadToImgBB] Compressed size: ${sizeKB}KB`);
    const fd = new FormData();
    fd.append('image', raw);
    const resp = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_KEY}`, { method: 'POST', body: fd });
    const data = await resp.json();
    if (data.success) return data.data.url;
    console.warn('[uploadToImgBB] API error:', JSON.stringify(data));
    return null;
  } catch (e) {
    console.warn('[uploadToImgBB] Error:', e);
    return null;
  }
}

(function initCanvasDragDrop() {
  const canvas = document.getElementById('miro-canvas');
  if (!canvas) return;

  canvas.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
  canvas.addEventListener('dragleave', (e) => { e.preventDefault(); });

  canvas.addEventListener('drop', async (e) => {
    e.preventDefault();
    const files = [...e.dataTransfer.files].filter(f => f.type.startsWith('image/'));
    if (files.length === 0) return;

    const page = cp();
    if (!page.miroCards) page.miroCards = [];
    const zoom = (page.zoom || 100) / 100;
    const rect = canvas.getBoundingClientRect();
    const baseX = (e.clientX - rect.left - (page.panX || 0)) / zoom;
    const baseY = (e.clientY - rect.top - (page.panY || 0)) / zoom;

    if (typeof showToast === 'function') showToast(`📤 Uploading ${files.length} image(s)...`, 3000);

    let offsetX = 0;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const base64 = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (ev) => resolve(ev.target.result);
        reader.readAsDataURL(file);
      });

      // Get natural dimensions
      const dims = await new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
        img.onerror = () => resolve({ w: 400, h: 300 });
        img.src = base64;
      });

      // Upload to ImgBB (compressed, NO base64 fallback)
      const imgbbUrl = await uploadToImgBB(base64);
      if (!imgbbUrl) {
        if (typeof showToast === 'function') showToast(`⚠️ Failed to upload "${file.name}" — skipped`, 3000);
        continue; // Skip this image entirely
      }

      // Scale to max 400px wide
      let w = dims.w, h = dims.h;
      if (w > 400) { h = Math.round((h / w) * 400); w = 400; }

      page.miroCards.push({
        id: uid(), type: 'image',
        imageUrl: imgbbUrl,
        label: '',
        x: baseX + offsetX, y: baseY,
        w, h
      });

      offsetX += w + 20;
    }

    sv(); buildMiroCanvas(); buildOutline();
    if (typeof showToast === 'function') showToast(`✅ Images added!`, 2000);
  });
})();

// ─── Auto-fix base64 images on page load ───
// When a page is displayed and has base64 images, upload them to ImgBB and save.
// This is called from buildMiroCanvas after rendering.
async function _fixBase64ImagesOnPage() {
  try {
    if (typeof D === 'undefined' || !D.pages) return;
    if (typeof USER_ID === 'undefined' || !USER_ID) return;
    const page = cp();
    if (!page || !page.miroCards || !page.miroCards.length) return;

    // ── Step 1: Try to recover lost images from IndexedDB cache ──
    try {
      const cached = typeof getCachedPageDataAsync === 'function'
        ? await getCachedPageDataAsync(page.id) : null;
      if (cached && cached.miroCards) {
        for (let i = 0; i < page.miroCards.length; i++) {
          const card = page.miroCards[i];
          if (card.type === 'image' && (!card.imageUrl || card.imageUrl === '')) {
            // Find matching card in cache by ID
            const cachedCard = cached.miroCards.find(c => c.id === card.id);
            if (cachedCard && cachedCard.imageUrl && cachedCard.imageUrl.startsWith('data:image')) {
              card.imageUrl = cachedCard.imageUrl;
              console.log('[ImgFix] 🔄 Recovered from cache:', card.id);
            }
          }
        }
      }
    } catch (e) { /* cache recovery failed, continue */ }

    // ── Step 2: Upload base64 images to ImgBB one by one ──
    let successCount = 0;
    for (let i = 0; i < page.miroCards.length; i++) {
      const card = page.miroCards[i];
      if (card.type !== 'image' || !card.imageUrl) continue;
      if (card.imageUrl.startsWith('http://') || card.imageUrl.startsWith('https://')) continue;
      if (card.imageUrl.startsWith('data:image')) {
        console.log('[ImgFix] Uploading:', card.id, '(index', i, ')');
        const url = await uploadToImgBB(card.imageUrl);
        if (url) {
          card.imageUrl = url;
          successCount++;
          console.log('[ImgFix] ✅ Done:', card.id);
          // Update visible element
          const imgEl = document.querySelector(`[data-cid="${card.id}"] .mi-img`);
          if (imgEl) imgEl.src = url;
          // Save ONLY this card's URL to Firebase (not the whole page!)
          try {
            const cardRef = `users/${USER_ID}/startmine_pages/${page.id}/miroCards/${i}/imageUrl`;
            await firebase.database().ref(cardRef).set(url);
            console.log('[ImgFix] ✅ Saved card', i, 'to Firebase');
          } catch (e) { console.warn('[ImgFix] Card save error:', e); }
        } else {
          // Upload failed — DO NOT touch the card, leave base64 for local display
          console.warn('[ImgFix] ⚠️ Upload failed for card:', card.id, '— keeping local data');
        }
      }
    }
    if (successCount > 0) {
      if (typeof showToast === 'function') showToast(`🔄 ${successCount} image(s) uploaded to cloud!`, 3000);
    }
  } catch (e) { console.warn('[ImgFix] Error:', e); }
}
// Run 3s after page loads
setTimeout(() => _fixBase64ImagesOnPage(), 3000);

// ─── Localize Remote Image URL ───
function localizeCardImageUrl(card) {
  if (!card || !card.imageUrl) return;
  if (card.imageUrl.startsWith('data:image')) return;
  if (/imgbb\.com|imgur\.com|i\.ibb\.co/i.test(card.imageUrl)) return;

  console.log('[ImgLocalize] Attempting to localize remote image URL:', card.imageUrl);
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = function() {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth || img.width;
      canvas.height = img.naturalHeight || img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const base64 = canvas.toDataURL('image/png');
      if (base64 && base64.length > 100) {
        card.imageUrl = base64;
        console.log('[ImgLocalize] ✅ Converted remote image to base64:', card.id);
        sv();
        // Trigger _fixBase64ImagesOnPage to upload this new Base64 to ImgBB and update Firebase/DOM
        setTimeout(() => {
          if (typeof _fixBase64ImagesOnPage === 'function') {
            _fixBase64ImagesOnPage();
          }
        }, 1000);
      }
    } catch (e) {
      console.warn('[ImgLocalize] ⚠️ Failed to canvas-convert remote image:', e);
    }
  };
  img.onerror = function(err) {
    console.warn('[ImgLocalize] ⚠️ Failed to load remote image for localizing:', err);
  };
  img.src = card.imageUrl;
}

// ─── Text Widget ───
document.getElementById('miro-opt-text').onclick = () => {
  document.getElementById('miro-add-menu').classList.remove('show');
  const page = cp();
  if (!page.miroCards) page.miroCards = [];
  const canvas = document.getElementById('miro-canvas');
  const zoom = (page.zoom || 100) / 100;
  const cx = (canvas.clientWidth / 2 - (page.panX || 0)) / zoom;
  const cy = (canvas.clientHeight / 2 - (page.panY || 0)) / zoom;
  const card = {
    id: uid(), type: 'text', text: 'Text', x: cx - 100, y: cy - 20,
    w: 200, h: 40, font: 'DM Sans', fontSize: 24, fontColor: '#333333',
    bold: false, italic: false, align: 'left',
  };
  page.miroCards.push(card);
  sv(); buildMiroCanvas(); buildOutline();
};

// ─── Shape Widget ───
document.getElementById('miro-opt-shape').onclick = () => {
  document.getElementById('miro-add-menu').classList.remove('show');
  document.getElementById('miro-shape-panel').classList.toggle('show');
};
document.getElementById('msp-close').onclick = () => {
  document.getElementById('miro-shape-panel').classList.remove('show');
};

// Shape panel: drag-and-drop onto canvas
document.querySelectorAll('.msp-item').forEach(item => {
  item.addEventListener('dragstart', (e) => {
    e.dataTransfer.setData('shape', item.dataset.shape);
  });
});
document.getElementById('miro-canvas').addEventListener('dragover', (e) => { e.preventDefault(); });
document.getElementById('miro-canvas').addEventListener('drop', (e) => {
  // Image files handled by initCanvasDragDrop — only handle shape drops here
  const shapeType = e.dataTransfer.getData('shape');
  if (!shapeType) return;
  e.preventDefault();
  const page = cp();
  if (!page.miroCards) page.miroCards = [];
  const zoom = (page.zoom || 100) / 100;
  const rect = document.getElementById('miro-canvas').getBoundingClientRect();
  const x = (e.clientX - rect.left - (page.panX || 0)) / zoom;
  const y = (e.clientY - rect.top - (page.panY || 0)) / zoom;
  const card = {
    id: uid(), type: 'shape', shape: shapeType, x: x - 80, y: y - 60,
    w: 160, h: 120, fillColor: 'none', strokeColor: '#333333',
    strokeWidth: 2, opacity: 1,
  };
  page.miroCards.push(card);
  sv(); buildMiroCanvas(); buildOutline();
  document.getElementById('miro-shape-panel').classList.remove('show');
});

// ─── Vertical Toolbar Handlers ───
// State moved to miro-state.js

function setActiveTool(tool) {
  _activeTool = tool;
  document.querySelectorAll('.mtb-btn').forEach(b => b.classList.remove('sel'));
  const btnMap = { select: 'mtb-select', sticky: 'mtb-sticky', text: 'mtb-text', shape: 'mtb-shape', pen: 'mtb-pen', grid: 'mtb-grid', mindmap: 'mtb-mindmap', image: 'mtb-image', card: 'mtb-card', widget: 'mtb-widget', trello: 'mtb-trello', embed: 'mtb-embed', 'overlay-page': null };
  const btn = document.getElementById(btnMap[tool]);
  if (btn) btn.classList.add('sel');
  _penMode = tool === 'pen';
  _shapeMode = tool === 'shape';
  _stickyCreateMode = tool === 'sticky';
  _textCreateMode = tool === 'text';
  _gridCreateMode = tool === 'grid';
  _mindmapCreateMode = tool === 'mindmap';
  _widgetCreateMode = tool === 'widget';
  _trelloCreateMode = tool === 'trello';
  _embedCreateMode = tool === 'embed';
  _overlayPageCreateMode = (tool === 'overlay-page');

  const hint = document.getElementById('sn-create-hint');
  if (_stickyCreateMode) { hint.textContent = '📝 Click anywhere to place a sticky note • Press Esc to cancel'; hint.style.display = 'block'; }
  else if (_textCreateMode) { hint.textContent = '✏️ Click anywhere to place text • Press Esc to cancel'; hint.style.display = 'block'; }
  else if (_gridCreateMode) { hint.textContent = '📊 Click anywhere to place a table • Press Esc to cancel'; hint.style.display = 'block'; }
  else if (_mindmapCreateMode) { hint.textContent = '🧠 Click anywhere to place a mind map • Press Esc to cancel'; hint.style.display = 'block'; }
  else if (_widgetCreateMode) { hint.textContent = '🗂️ Click anywhere to place a bookmark widget • Press Esc to cancel'; hint.style.display = 'block'; }
  else if (_trelloCreateMode) { hint.textContent = '📋 Click anywhere to place Trello lists • Press Esc to cancel'; hint.style.display = 'block'; }
  else if (_embedCreateMode) { hint.textContent = '🌐 Click anywhere to place an embed web view • Press Esc to cancel'; hint.style.display = 'block'; }
  else if (_overlayPageCreateMode) { var _opn = ['2Days','Gantt Chart','Statistics','Fruit Tracker']; hint.textContent = _opn[_overlayPageCreateIdx] + ' - Click anywhere to place widget'; hint.style.display = 'block'; }
  else { hint.style.display = 'none'; }

  document.getElementById('miro-pen-toolbar').classList.toggle('show', _penMode);
  const cursor = (_penMode || _shapeMode || _stickyCreateMode || _textCreateMode || _gridCreateMode || _mindmapCreateMode || _widgetCreateMode || _trelloCreateMode || _embedCreateMode || _overlayPageCreateMode || _overlayPageCreateMode) ? 'crosshair' : 'grab';
  document.getElementById('miro-canvas').style.cursor = cursor;
  if (!_shapeMode) document.getElementById('miro-shape-panel').classList.remove('show');
}

// State moved to miro-state.js

document.getElementById('mtb-select').onclick = () => setActiveTool('select');
document.getElementById('mtb-sticky').onclick = () => setActiveTool('sticky');
document.getElementById('mtb-text').onclick = () => setActiveTool('text');
document.getElementById('mtb-widget').onclick = () => setActiveTool('widget');
document.getElementById('mtb-trello').onclick = () => setActiveTool('trello');

// Canvas click handler for click-to-place modes
document.getElementById('miro-canvas').addEventListener('mousedown', (e) => {
  if (e.button !== 0 && e.type !== 'touchstart') return;

  // Check if ANY creation mode is active
  const anyCreateMode = _stickyCreateMode || _textCreateMode || _gridCreateMode || _mindmapCreateMode || _widgetCreateMode || _trelloCreateMode || _embedCreateMode || _overlayPageCreateMode;
  if (!anyCreateMode) return;

  // Only block clicks on toolbar controls themselves
  if (e.target.closest('#miro-toolbar, .mc-del')) return;

  e.preventDefault();
  e.stopPropagation();

  try {
    const page = cp();
    if (!page.miroCards) page.miroCards = [];
    const zoom = (page.zoom || 100) / 100;
    const rect = document.getElementById('miro-canvas').getBoundingClientRect();
    
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;
    let bx = (clickX - (page.panX || 0)) / zoom;
    let by = (clickY - (page.panY || 0)) / zoom;
    let targetCell = null;

    const hasSlices = page && (page._guidesMode || (page.vGuides && page.vGuides.length > 0) || (page.hGuides && page.hGuides.length > 0) || (page.customCells && page.customCells.length > 0));
    if (hasSlices) {
      const W = rect.width, H = rect.height;
      const pctX = clickX / W;
      const pctY = clickY / H;

      let targetCustomCell = null;
      if (page.customCells) {
        for (let i = page.customCells.length - 1; i >= 0; i--) {
          const cc = page.customCells[i];
          if (pctX >= cc.x && pctX <= (cc.x + cc.w) && pctY >= cc.y && pctY <= (cc.y + cc.h)) {
            targetCustomCell = cc;
            break;
          }
        }
      }

      const vg = [0, ...(page.vGuides || []).sort((a,b)=>a-b), 1];
      const hg = [0, ...(page.hGuides || []).sort((a,b)=>a-b), 1];
      const hasGridGuides = page.vGuides && (page.vGuides.length > 0 || (page.hGuides && page.hGuides.length > 0));
      let targetGridCell = null;

      if (!targetCustomCell && hasGridGuides) {
        let col = vg.length - 2;
        for (let i = 0; i < vg.length - 1; i++) {
          if (pctX >= vg[i] && pctX < vg[i+1]) { col = i; break; }
        }
        let row = hg.length - 2;
        for (let i = 0; i < hg.length - 1; i++) {
          if (pctY >= hg[i] && pctY < hg[i+1]) { row = i; break; }
        }

        const mergedCell = (page.mergedCells || []).find(m => col >= m.cStart && col <= m.cEnd && row >= m.rStart && row <= m.rEnd);
        if (mergedCell) {
          targetGridCell = mergedCell.cStart + "_" + mergedCell.rStart + "_" + mergedCell.cEnd + "_" + mergedCell.rEnd;
        } else {
          targetGridCell = col + "_" + row;
        }
      }

      if (targetCustomCell) {
        targetCell = targetCustomCell.id;
      } else if (targetGridCell) {
        targetCell = targetGridCell;
      } else {
        targetCell = "0_0";
      }

      const state = page.cellStates[targetCell] || { zoom: 100, panX: 0, panY: 0 };
      const cellZoom = state.zoom / 100;
      let cellLeft = 0, cellTop = 0;

      if (targetCustomCell) {
        cellLeft = targetCustomCell.x * W;
        cellTop = targetCustomCell.y * H;
      } else if (targetGridCell) {
        const parts = targetGridCell.split('_');
        const col = parseInt(parts[0]), row = parseInt(parts[1]);
        cellLeft = (vg[col] !== undefined ? vg[col] : 0) * W;
        cellTop = (hg[row] !== undefined ? hg[row] : 0) * H;
      }

      bx = (clickX - cellLeft - state.panX) / cellZoom;
      by = (clickY - cellTop - state.panY) / cellZoom;
    }

    const cardIndexBefore = page.miroCards.length;

    if (_stickyCreateMode) {
      const newId = uid();
      page.miroCards.push({ id: newId, type: 'sticky', text: '', color: 'yellow', shape: 'rect', x: bx - 140, y: by - 80, w: 280, h: 160 });
      if (targetCell) {
        page.miroCards[page.miroCards.length - 1].cell = targetCell;
      }
      sv(); buildMiroCanvas(); buildOutline();
      setTimeout(() => {
        const el = document.querySelector(`.miro-sticky[data-cid="${newId}"] .ms-text`);
        if (el) {
          el.contentEditable = true;
          el.focus();
          // Show toolbar
          const tb = el.closest('.miro-sticky')?.querySelector('.sn-toolbar');
          if (tb) tb.classList.add('show');
        }
      }, 100);
    } else if (_textCreateMode) {
      const newId = uid();
      page.miroCards.push({ id: newId, type: 'text', text: '', x: bx - 60, y: by - 15, w: 200, h: 40, fontSize: 24, font: 'Inter', fontColor: '#333333', align: 'right' });
      if (targetCell) {
        page.miroCards[page.miroCards.length - 1].cell = targetCell;
      }
      sv(); buildMiroCanvas(); buildOutline();
      setTimeout(() => {
        const el = document.querySelector(`.miro-text[data-cid="${newId}"] .mt-text`);
        if (el) {
          el.contentEditable = true;
          el.focus();
          // Show toolbar
          const tb = el.closest('.miro-text')?.querySelector('.mt-toolbar');
          if (tb) tb.classList.add('show');
        }
      }, 100);
    } else if (_gridCreateMode) {
      const rows = _gridPickerRows || 3, cols = _gridPickerCols || 3;
      const rdInput = document.getElementById('mgp-rd');
      const cdInput = document.getElementById('mgp-cd');
      const rowH = rdInput ? parseInt(rdInput.value) || 40 : 40;
      const colW = cdInput ? parseInt(cdInput.value) || 120 : 120;
      const cells = [];
      for (let r = 0; r < rows; r++) { const row = []; for (let c = 0; c < cols; c++) row.push(''); cells.push(row); }
      const w = cols * colW, h = rows * rowH;
      const colWidths = Array(cols).fill(colW);
      const rowHeights = Array(rows).fill(rowH);
      page.miroCards.push({ id: uid(), type: 'grid', rows, cols, cells, colWidths, rowHeights, x: bx - w / 2, y: by - h / 2, w, h, headerColor: 'none', borderColor: '#555' });
      if (targetCell) {
        page.miroCards[page.miroCards.length - 1].cell = targetCell;
      }
      sv(); buildMiroCanvas(); buildOutline();
    } else if (_mindmapCreateMode) {
      const rootId = uid(), child1 = uid(), child2 = uid(), child3 = uid();
      page.miroCards.push({
        id: uid(), type: 'mindmap', x: bx - 300, y: by - 200, w: 600, h: 400,
        root: {
          id: rootId, text: 'Main Topic', color: '#6c8fff',
          children: [
            { id: child1, text: 'Branch 1', color: '#ff6b6b', children: [] },
            { id: child2, text: 'Branch 2', color: '#51cf66', children: [] },
            { id: child3, text: 'Branch 3', color: '#ffd43b', children: [] },
          ],
        },
      });
      if (targetCell) {
        page.miroCards[page.miroCards.length - 1].cell = targetCell;
      }
      sv(); buildMiroCanvas(); buildOutline();
    } else if (_widgetCreateMode) {
      page.miroCards.push({ id: uid(), type: 'bwidget', title: 'Bookmarks', emoji: '🗂️', items: [], x: bx - 160, y: by - 200, w: 320, h: 400, color: { r: 255, g: 255, b: 255, a: 1 } });
      if (targetCell) {
        page.miroCards[page.miroCards.length - 1].cell = targetCell;
      }
      sv(); buildMiroCanvas(); buildOutline();
    } else if (_trelloCreateMode) {
      const gap = 20;
      const lw = 260, lh = 380;
      const lists = [
        { title: '2Do', color: '#6c8fff' },
        { title: 'In Progress', color: '#ffd43b' },
        { title: 'Done', color: '#51cf66' }
      ];
      const totalW = lists.length * lw + (lists.length - 1) * gap;
      const startX = bx - totalW / 2;
      lists.forEach((l, i) => {
        page.miroCards.push({ id: uid(), type: 'trello', title: l.title, listColor: l.color, cards: [], x: startX + i * (lw + gap), y: by - lh / 2, w: lw, h: lh });
      });
      if (targetCell) {
        for (let i = cardIndexBefore; i < page.miroCards.length; i++) {
          page.miroCards[i].cell = targetCell;
        }
      }
      sv(); buildMiroCanvas(); buildOutline();
    } else if (_overlayPageCreateMode) {
      var opIdx = _overlayPageCreateIdx;
      page.miroCards.push({ id: uid(), type: 'overlay-page', overlayPage: opIdx, x: bx - Math.floor(window.innerWidth*0.42), y: by - Math.floor(window.innerHeight*0.4), w: Math.floor(window.innerWidth*0.85), h: Math.floor(window.innerHeight*0.8), calOffset: 0, calTheme: 'light', ganttView: '2week', ganttRowHeight: 50 });
      if (targetCell) {
        page.miroCards[page.miroCards.length - 1].cell = targetCell;
      }
      sv(); buildMiroCanvas(); buildOutline();
    } else if (_embedCreateMode) {
      const url = prompt('🌐 Enter published URL (Google Sheets chart, web page, etc.):');
      if (url && url.trim()) {
        page.miroCards.push({ id: uid(), type: 'embed', embedUrl: url.trim(), cropRect: null, refreshMin: 15, x: bx - 300, y: by - 200, w: 600, h: 400 });
        if (targetCell) {
          page.miroCards[page.miroCards.length - 1].cell = targetCell;
        }
        sv(); buildMiroCanvas(); buildOutline();
      }
    }
  } catch (err) {
    console.error('[TOOL CREATE ERROR]', err);
  }

  // Always reset to select mode, even on error
  setActiveTool('select');
});
document.getElementById('mtb-shape').onclick = () => {
  setActiveTool('shape');
  document.getElementById('miro-shape-panel').classList.add('show');
};
// Shape panel item click → set active shape type for draw mode
document.querySelectorAll('.msp-item').forEach(item => {
  item.addEventListener('click', () => {
    _activeShapeType = item.dataset.shape;
    document.querySelectorAll('.msp-item').forEach(i => i.classList.remove('sel'));
    item.classList.add('sel');
  });
});
document.getElementById('mtb-pen').onclick = () => setActiveTool('pen');
/* ─── Grid Size Picker ─── */
// State moved to miro-state.js
(function initGridPicker() {
  const panel = document.getElementById('miro-grid-picker');
  const grid = document.getElementById('mgp-grid');
  const dimLabel = document.getElementById('mgp-dim');
  const rnInput = document.getElementById('mgp-rn');
  const cnInput = document.getElementById('mgp-cn');
  const MAXR = 15, MAXC = 10;
  // Build cells
  for (let r = 0; r < MAXR; r++) {
    for (let c = 0; c < MAXC; c++) {
      const cell = document.createElement('div');
      cell.className = 'mgp-cell';
      cell.dataset.r = r; cell.dataset.c = c;
      grid.appendChild(cell);
    }
  }
  const cells = grid.querySelectorAll('.mgp-cell');
  function highlight(hr, hc) {
    cells.forEach(cell => {
      const cr = +cell.dataset.r, cc = +cell.dataset.c;
      cell.classList.toggle('active', cr <= hr && cc <= hc);
    });
    dimLabel.textContent = `${hr + 1} × ${hc + 1}`;
    dimLabel.classList.add('visible');
  }
  grid.addEventListener('mousemove', (e) => {
    const cell = e.target.closest('.mgp-cell');
    if (!cell) return;
    const hr = +cell.dataset.r, hc = +cell.dataset.c;
    highlight(hr, hc);
    // Sync numeric inputs
    if (rnInput) rnInput.value = hr + 1;
    if (cnInput) cnInput.value = hc + 1;
  });
  grid.addEventListener('mouseleave', () => {
    cells.forEach(c => c.classList.remove('active'));
    dimLabel.classList.remove('visible');
  });
  grid.addEventListener('click', (e) => {
    const cell = e.target.closest('.mgp-cell');
    if (!cell) return;
    _gridPickerRows = +cell.dataset.r + 1;
    _gridPickerCols = +cell.dataset.c + 1;
    if (rnInput) rnInput.value = _gridPickerRows;
    if (cnInput) cnInput.value = _gridPickerCols;
    panel.classList.remove('show');
    setActiveTool('grid');
  });
  // Numeric inputs: update picker state and enter grid mode
  [rnInput, cnInput].forEach(inp => {
    if (!inp) return;
    inp.addEventListener('change', () => {
      _gridPickerRows = parseInt(rnInput.value) || 3;
      _gridPickerCols = parseInt(cnInput.value) || 3;
    });
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        _gridPickerRows = parseInt(rnInput.value) || 3;
        _gridPickerCols = parseInt(cnInput.value) || 3;
        panel.classList.remove('show');
        setActiveTool('grid');
      }
    });
  });
  document.getElementById('mgp-close').onclick = () => {
    panel.classList.remove('show');
    setActiveTool('select');
  };
})();
document.getElementById('mtb-grid').onclick = () => {
  const panel = document.getElementById('miro-grid-picker');
  const isOpen = panel.classList.contains('show');
  // Close other panels
  document.getElementById('miro-shape-panel').classList.remove('show');
  document.getElementById('mtb-more-panel').classList.remove('show');
  if (isOpen) {
    panel.classList.remove('show');
    setActiveTool('select');
  } else {
    panel.classList.add('show');
    // Highlight button but don't enter create mode yet
    document.querySelectorAll('.mtb-btn').forEach(b => b.classList.remove('sel'));
    document.getElementById('mtb-grid').classList.add('sel');
  }
};
document.getElementById('mtb-image').onclick = () => {
  document.getElementById('miro-opt-image').click();
  setActiveTool('select');
};
document.getElementById('mtb-card').onclick = () => {
  document.getElementById('miro-opt-card').click();
  setActiveTool('select');
};
document.getElementById('pen-cancel').onclick = () => setActiveTool('select');
document.getElementById('mtb-mindmap').onclick = () => {
  setActiveTool('mindmap');
};

// Track mouse to paste at cursor
// State moved to miro-state.js
document.addEventListener('mousemove', e => { _mouseX = e.clientX; _mouseY = e.clientY; });

document.addEventListener('keydown', (e) => {
  // ESC during contentEditable editing: blur the element and exit edit mode
  if (e.key === 'Escape' && (e.target.contentEditable === 'true' || e.target.tagName === 'TEXTAREA')) {
    e.preventDefault();
    e.target.blur();
    setActiveTool('select');
    return;
  }
  // Don't trigger shortcuts during text input
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT' || e.target.contentEditable === 'true') return;

  // Ctrl+Alt+A / Ctrl+Alt+ش — Save All (Firebase + Drive + GitHub)
  if ((e.ctrlKey || e.metaKey) && e.altKey && (e.key.toLowerCase() === 'a' || e.key === 'ش')) {
    e.preventDefault();
    if (typeof saveAllBackups === 'function') saveAllBackups();
    return;
  }

  // Ctrl+Alt+G / Ctrl+Alt+ل — Export to GitHub
  if ((e.ctrlKey || e.metaKey) && e.altKey && (e.key.toLowerCase() === 'g' || e.key === 'ل')) {
    e.preventDefault();
    if (typeof exportToGitHub === 'function') exportToGitHub();
    return;
  }

  // Ctrl+Alt+S / Ctrl+Alt+س — Export to Google Drive
  if ((e.ctrlKey || e.metaKey) && e.altKey && (e.key.toLowerCase() === 's' || e.key === 'س')) {
    e.preventDefault();
    if (typeof exportToGoogleDrive === 'function') exportToGoogleDrive();
    return;
  }

  // Ctrl+S / Ctrl+س — Save Snapshot (works on ALL page types)
  if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 's' || e.key === 'س')) {
    e.preventDefault();
    if (typeof saveSnapshot === 'function') saveSnapshot();
    return;
  }

  const page = cp();
  if (page.pageType !== 'miro') return;

  const key = e.key.toLowerCase();
  const isCmd = e.ctrlKey || e.metaKey;

  // Undo: Ctrl+Z (works with any keyboard layout via e.code)
  if (isCmd && (key === 'z' || e.code === 'KeyZ')) {
    e.preventDefault();
    performUndo();
    return;
  }

  // Select All: Ctrl+A / Ctrl+ش — select every card on canvas
  if (isCmd && (key === 'a' || key === 'ش' || e.code === 'KeyA')) {
    e.preventDefault();
    clearMiroSelection();
    (page.miroCards || []).forEach(c => addMiroSelect(c.id));
    updateMiroSelFrame();
    return;
  }

  // Copy (Cmd/Ctrl + C) or Cmd/Ctrl + ؤ
  if (isCmd && (key === 'c' || key === 'ؤ')) {
    if (_miroSelected.size > 0 && page.miroCards) {
      const copiedCards = [];
      _miroSelected.forEach(cid => {
        const card = page.miroCards.find(c => c.id === cid);
        if (card) copiedCards.push(JSON.parse(JSON.stringify(card)));
      });
      localStorage.setItem('miro_clipboard', JSON.stringify(copiedCards));

      // Also strictly write the JSON to the system clipboard so native paste works between browser tabs implicitly
      navigator.clipboard.writeText('STARTMINE_MIRO:' + JSON.stringify(copiedCards)).catch(e => console.error(e));
      // Mark copy time so Arabic paste fallback (Ctrl+ر) won't double-process
      window._lastMiroCopyTime = Date.now();
      console.log(`Copied ${copiedCards.length} items.`);
    }
  }

  // Select All (Cmd/Ctrl + A) or Cmd/Ctrl + ش
  if (isCmd && (key === 'a' || key === 'ش')) {
    e.preventDefault();
    if (page.miroCards && page.miroCards.length > 0) {
      clearMiroSelection();
      page.miroCards.forEach(c => {
        _miroSelected.add(c.id);
        const el = document.querySelector(`[data-cid="${c.id}"]`);
        if (el) el.classList.add('miro-selected');
      });
      updateMiroSelFrame();
      console.log(`Selected all ${page.miroCards.length} items.`);
    }
  }

  // Paste (Cmd/Ctrl + V) native event will handle everything now to prevent race conditions.
  // Blur any focused input to prevent typing in search box
  if (document.activeElement && document.activeElement.tagName === 'INPUT') document.activeElement.blur();

  // Explicit text-paste fallback for Arabic keyboard (Ctrl+ر) because it won't trigger native OS "paste" event.
  if (isCmd && key === 'ر') {
    if (window._lastMiroPasteTime && Date.now() - window._lastMiroPasteTime < 1000) return;

    navigator.clipboard.readText().then(text => {
      // Check again after async clipboard read just in case
      if (window._lastMiroPasteTime && Date.now() - window._lastMiroPasteTime < 1000) return;

      if (text) {
        // Mock a minimal clipboard event structure and pass it to our paste handler if needed,
        // or just let the user use English for image pasting. We can re-use the parsing logic:
        let clipData = localStorage.getItem('miro_clipboard');
        if (text.startsWith('STARTMINE_MIRO:')) clipData = text.replace('STARTMINE_MIRO:', '');

        if (clipData) {
          try {
            const cards = JSON.parse(clipData);
            if (cards && cards.length > 0) {
              e.preventDefault();
              if (!page.miroCards) page.miroCards = [];
              const coords = getPasteTargetCoords(page);
              let minX = Infinity, minY = Infinity;
              cards.forEach(c => { if (c.x < minX) minX = c.x; if (c.y < minY) minY = c.y; });
              clearMiroSelection();
              cards.forEach(c => {
                const newId = uid(); c.id = newId;
                c.x = coords.x + (c.x - minX) - (c.w || 100) / 2;
                c.y = coords.y + (c.y - minY) - (c.h || 100) / 2;
                if (coords.cell) {
                  c.cell = coords.cell;
                } else {
                  delete c.cell;
                }
                page.miroCards.push(c); _miroSelected.add(c.id);
              });
              sv(); buildMiroCanvas(); buildOutline(); return;
            }
          } catch (e) { }
        }

        // Literal text fallback
        if (!page.miroCards) page.miroCards = [];
        const coords = getPasteTargetCoords(page);
        let url = text.trim();
        if (/^(https?:\/\/[^\s]+)$/i.test(url) || /^(www\.[^\s]+)$/i.test(url)) {
          if (!url.startsWith('http')) url = 'https://' + url;
          const card = { id: uid(), type: 'card', url, label: domainOf(url), x: coords.x - 140, y: coords.y - 120, w: 280, h: 240 };
          if (coords.cell) {
            card.cell = coords.cell;
          } else {
            delete card.cell;
          }
          page.miroCards.push(card);
        } else {
          const card = { id: uid(), type: 'sticky', text: text, bg: '#ffe599', x: coords.x - 100, y: coords.y - 100, w: 200, h: 200 };
          if (coords.cell) {
            card.cell = coords.cell;
          } else {
            delete card.cell;
          }
          page.miroCards.push(card);
        }
        sv(); buildMiroCanvas(); buildOutline();
        window._lastMiroPasteTime = Date.now();
      }
    }).catch(e => console.error(e));
  }

  // Tools Shortcuts
  if (!isCmd) {
    switch (key) {
      case 'v': case 'ر': e.preventDefault(); setActiveTool('select'); break;
      case 'n': case 'ى': e.preventDefault(); document.getElementById('mtb-sticky').click(); break;
      case 't': case 'ف': e.preventDefault(); document.getElementById('mtb-text').click(); break;
      case 's': case 'س': e.preventDefault(); document.getElementById('mtb-shape').click(); break;
      case 'p': case 'ح': e.preventDefault(); document.getElementById('mtb-pen').click(); break;
      case 'g': case 'ل': e.preventDefault(); document.getElementById('mtb-grid').click(); break;
      case 'm': case 'ة': e.preventDefault(); document.getElementById('mtb-mindmap').click(); break;
      case 'w': case 'ص': e.preventDefault(); document.getElementById('mtb-widget').click(); break;
      case 'k': case 'ن': e.preventDefault(); document.getElementById('mtb-trello').click(); break;
      case 'i': case 'ه': e.preventDefault(); document.getElementById('mtb-image').click(); break;
      case 'b': case 'لا': e.preventDefault(); document.getElementById('mtb-card').click(); break;
      case 'e': case 'ث': e.preventDefault(); document.getElementById('mtb-embed').click(); break;
      case 'escape':
        setActiveTool('select');
        document.getElementById('miro-shape-panel').classList.remove('show');
        if (typeof window._exitCustomCellDrawMode === 'function') window._exitCustomCellDrawMode();
        break;
      case 'delete':
      case 'backspace':
        if (_miroSelected.size > 0) {
          e.preventDefault();
          _miroSelected.forEach(cid => {
            page.miroCards = (page.miroCards || []).filter(c => c.id !== cid);
          });
          _miroSelected.clear();
          sv(); buildMiroCanvas(); buildOutline();
        }
        break;
      case 'f': case 'ب':
        e.preventDefault();
        zoomToFitSelection();
        break;
    }
  }
});

function getPasteTargetCoords(page) {
  const canvas = document.getElementById('miro-canvas');
  let targetCellKey = null;
  let px = 0, py = 0;
  
  const targetEl = (_mouseX && _mouseY) ? document.elementFromPoint(_mouseX, _mouseY) : null;
  const cellViewport = targetEl ? targetEl.closest('.miro-cell-viewport') : null;
  if (cellViewport) {
    targetCellKey = cellViewport.dataset.cellKey;
  }

  if (targetCellKey) {
    const rect = cellViewport.getBoundingClientRect();
    const state = (page.cellStates && page.cellStates[targetCellKey]) || { zoom: 100, panX: 0, panY: 0 };
    const cellZoom = (state.zoom || 100) / 100;
    const localX = _mouseX - rect.left;
    const localY = _mouseY - rect.top;
    px = (localX - (state.panX || 0)) / cellZoom;
    py = (localY - (state.panY || 0)) / cellZoom;
  } else {
    const zoom = (page.zoom || 100) / 100;
    const panX = page.panX || 0;
    const panY = page.panY || 0;
    px = _mouseX ? (_mouseX - panX) / zoom : ((canvas ? canvas.clientWidth : 1000) / 2 - panX) / zoom;
    py = _mouseY ? (_mouseY - panY) / zoom : ((canvas ? canvas.clientHeight : 800) / 2 - panY) / zoom;
  }
  return { cell: targetCellKey, x: px, y: py };
}

document.addEventListener('paste', (e) => {
  // Ignore if pasting into an input element
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;

  const page = cp();
  if (page.pageType !== 'miro') return;

  // Mark paste time IMMEDIATELY to debounce the Ctrl+ر async fallback
  // (On Arabic keyboards, Ctrl+V fires BOTH native paste AND Ctrl+ر keydown)
  window._lastMiroPasteTime = Date.now();

  const handleMiroPasting = (cardsJSON) => {
    try {
      const cards = JSON.parse(cardsJSON);
      if (cards && cards.length > 0) {
        if (!page.miroCards) page.miroCards = [];
        const coords = getPasteTargetCoords(page);
        let minX = Infinity, minY = Infinity;
        cards.forEach(c => {
          if (c.x < minX) minX = c.x;
          if (c.y < minY) minY = c.y;
        });
        clearMiroSelection();
        cards.forEach(c => {
          const newId = uid();
          c.id = newId;
          c.x = coords.x + (c.x - minX) - (c.w || 100) / 2;
          c.y = coords.y + (c.y - minY) - (c.h || 100) / 2;
          if (coords.cell) {
            c.cell = coords.cell;
          } else {
            delete c.cell;
          }
          if (c.t === 'sticky') c.contentEditable = false;
          page.miroCards.push(c);
          _miroSelected.add(c.id);
        });
        sv(); buildMiroCanvas(); if (typeof buildOutline === 'function') buildOutline();
      }
    } catch (err) { console.error('Miro Clipboard parse err', err); }
  };

  const text = (e.clipboardData || window.clipboardData).getData('text') || '';

  // 1. Is it a STARTMINE internal paste string? (Highest Priority)
  if (text.startsWith('STARTMINE_MIRO:')) {
    handleMiroPasting(text.replace('STARTMINE_MIRO:', ''));
    return;
  }

  // 2. Fallback to localStorage clipboard (used by the Gear Menu "Copy to Miro" button)
  const ls = localStorage.getItem('miro_clipboard');
  if (ls && ls !== '[]') {
    handleMiroPasting(ls);
    // Clear it so normal image pasting can resume later if needed
    localStorage.removeItem('miro_clipboard');
    return;
  }

  const html = (e.clipboardData || window.clipboardData).getData('text/html') || '';

  // Check for image files in clipboard synchronously
  let imageBlob = null;
  if (e.clipboardData && e.clipboardData.items) {
    for (let i = 0; i < e.clipboardData.items.length; i++) {
      const item = e.clipboardData.items[i];
      if (item.type.indexOf('image') !== -1) {
        imageBlob = item.getAsFile();
        break;
      }
    }
  }

  if (imageBlob) {
    const reader = new FileReader();
    reader.onload = function (event) {
      executePaste(text, html, event.target.result, imageBlob);
    };
    reader.readAsDataURL(imageBlob);
  } else {
    executePaste(text, html, null, null);
  }

  function executePaste(text, html, dataUrl, imageBlob) {
    if (!dataUrl && html) {
      try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const img = doc.querySelector('img');
        if (img && img.src) {
          dataUrl = img.src;
          console.log('[PASTE] Extracted image source from clipboard HTML:', dataUrl);
        }
      } catch (err) {
        console.error('[PASTE] Failed to parse fallback image src from HTML:', err);
      }
    }

    // Check for HTML from Miro or other rich text sources
    if (html) {
      console.log('--- RAW CLIPBOARD HTML ---');
      console.log(html);
      console.log('--------------------------');

      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');

      let extracted = [];
      const miroSpans = doc.querySelectorAll('span[data-meta*="miro"]');
      const isMiroData = miroSpans.length > 0;

      let miroHandled = false;

      if (isMiroData) {
        // Mark IMMEDIATELY to prevent any text fallback from creating duplicate notes
        window._lastMiroPasteTime = Date.now();
        const miroColors = [
          'yellow', 'green', 'blue', 'pink', 'orange', 'purple', 'cyan', 'red', 'white', 'gray', 'dark'
        ];
        const exactColorMap = {
          '#f5f6f8': 'gray', '#fff9b1': 'yellow', '#f5d128': 'yellow', '#f09b55': 'orange',
          '#d5f692': 'green', '#c9df56': 'green', '#93d275': 'green', '#68cef8': 'cyan',
          '#fdb8dc': 'pink', '#ff73bd': 'pink', '#c39ce6': 'purple', '#ff6d6d': 'red',
          '#cde3fa': 'blue', '#8fd14f': 'green', '#568fdb': 'blue', '#000000': 'dark',
          '#ffffff': 'white', 'transparent': 'white'
        };
        let colorIdx = 0;

        miroSpans.forEach(span => {
          let miroJson = null;
          try {
            const rawMeta = span.getAttribute('data-meta') || '';
            const match = rawMeta.match(/<--\(miro-data-v1\)([\s\S]*?)\(.\/miro-data-v1\)-->/);
            if (match && match[1]) {
              let b64 = match[1].replace(/\s/g, '').replace(/-/g, '+').replace(/_/g, '/');
              while (b64.length % 4) b64 += '=';
              const raw = atob(b64);
              const firstByte = raw.charCodeAt(0);
              const key = (123 - firstByte + 256) % 256;
              let decoded = '';
              for (let i = 0; i < raw.length; i++) {
                decoded += String.fromCharCode((raw.charCodeAt(i) + key) % 256);
              }
              miroJson = JSON.parse(decoded);
            }
          } catch (e) {
            console.error('Failed to decode Miro JSON coordinates:', e);
          }

          if (miroJson && miroJson.data && miroJson.data.objects) {
            miroJson.data.objects.forEach(obj => {
              if (obj && obj.widgetData && obj.widgetData.json) {
                const jd = obj.widgetData.json;
                const type = (obj.widgetData.type || '').toLowerCase();

                // Debug: dump ALL raw Miro object data for analysis
                console.log('[PASTE] Miro RAW:', type, JSON.stringify({
                  x: jd.x, y: jd.y, width: jd.width, height: jd.height,
                  size: jd.size, scale: jd.scale, _position: jd._position,
                  shape: jd.shape, shapeType: jd.shapeType,
                  wdX: obj.widgetData.x, wdY: obj.widgetData.y,
                  wdW: obj.widgetData.width, wdH: obj.widgetData.height,
                  wdScale: obj.widgetData.scale,
                  allKeys: Object.keys(jd).join(','),
                  wdKeys: Object.keys(obj.widgetData).join(',')
                }));

                // Helper: extract position and size from Miro JSON data
                const extractPosition = (jd, opts, widgetData) => {
                  // ── Position (center-origin) ──
                  if (jd._position && jd._position.offsetPx) {
                    opts._ox = jd._position.offsetPx.x;
                    opts._oy = jd._position.offsetPx.y;
                  } else if (jd._position && typeof jd._position.x === 'number') {
                    opts._ox = jd._position.x;
                    opts._oy = jd._position.y;
                  }
                  if (opts._ox === undefined && typeof jd.x === 'number') {
                    opts._ox = jd.x;
                    opts._oy = jd.y;
                  }
                  if (opts._ox === undefined && widgetData && typeof widgetData.x === 'number') {
                    opts._ox = widgetData.x;
                    opts._oy = widgetData.y;
                  }

                  // ── Scale factor ──
                  let scale;
                  if (jd.scale && typeof jd.scale === 'object' && typeof jd.scale.scale === 'number') {
                    scale = jd.scale.scale;
                  } else if (typeof jd.scale === 'number') {
                    scale = jd.scale;
                  } else if (jd._position && typeof jd._position.scale === 'number') {
                    scale = jd._position.scale;
                  } else if (widgetData && typeof widgetData.scale === 'number') {
                    scale = widgetData.scale;
                  } else if (jd.scaleFactor) {
                    scale = jd.scaleFactor;
                  } else if (jd.transform && typeof jd.transform.scale === 'number') {
                    scale = jd.transform.scale;
                  }

                  // ── Base dimensions ──
                  let baseW, baseH;
                  if (jd.size) {
                    if (typeof jd.size.width === 'number') baseW = jd.size.width;
                    else if (typeof jd.size.w === 'number') baseW = jd.size.w;
                    if (typeof jd.size.height === 'number') baseH = jd.size.height;
                    else if (typeof jd.size.h === 'number') baseH = jd.size.h;
                  }

                  // ── Visual dimensions ──
                  let visW, visH;
                  if (typeof jd.width === 'number') visW = jd.width;
                  if (typeof jd.height === 'number') visH = jd.height;
                  if (visW === undefined && widgetData && typeof widgetData.width === 'number') visW = widgetData.width;
                  if (visH === undefined && widgetData && typeof widgetData.height === 'number') visH = widgetData.height;

                  if (scale === undefined && baseW && visW && baseW > 0) {
                    scale = visW / baseW;
                  }

                  if (baseW && scale) {
                    opts.w = baseW * scale;
                    opts.h = (baseH || baseW) * scale;
                  } else if (visW) {
                    opts.w = visW;
                    opts.h = visH || visW;
                  } else if (baseW) {
                    opts.w = baseW;
                    opts.h = baseH || baseW;
                  }
                  opts._scale = scale || 1;
                  opts._baseW = baseW;
                  opts._baseH = baseH;
                  opts._centerOrigin = true;

                  console.log('[PASTE] extractPosition:', {
                    type: opts.type, _ox: opts._ox, _oy: opts._oy,
                    w: opts.w, h: opts.h, _scale: scale,
                    baseW, baseH, visW, visH
                  });
                };

                if (type === 'sticker' || type === 'shape' || type === 'text') {
                  let textHTML = jd.text || jd.content || '';
                  textHTML = textHTML.replace(/^<p[^>]*>/i, '').replace(/<\/p>$/i, '');

                  // Fix Garbled Arabic UTF-8 (when decoded via String.fromCharCode)
                  try {
                    textHTML = decodeURIComponent(escape(textHTML));
                  } catch (err) {
                    // Fallback
                  }

                  let styleObj = jd.style;
                  if (typeof styleObj === 'string') {
                    try { styleObj = JSON.parse(styleObj); } catch (e) { }
                  }

                  // --- Handle Miro SHAPE → Startmine shape ---
                  if (type === 'shape') {
                    const miroShapeType = (jd.shape || jd.shapeType || 'rectangle').toLowerCase();
                    let smShape = 'rect';
                    if (miroShapeType.includes('circle') || miroShapeType.includes('ellipse') || miroShapeType.includes('oval')) smShape = 'ellipse';
                    else if (miroShapeType.includes('triangle') || miroShapeType.includes('wedge')) smShape = 'triangle';
                    else if (miroShapeType.includes('diamond') || miroShapeType.includes('rhombus') || miroShapeType.includes('flowchart_decision')) smShape = 'diamond';
                    else if (miroShapeType.includes('star')) smShape = 'star';
                    else if (miroShapeType.includes('hexagon')) smShape = 'hexagon';
                    else if (miroShapeType.includes('pentagon')) smShape = 'pentagon';
                    else if (miroShapeType.includes('cross') || miroShapeType.includes('plus')) smShape = 'cross';
                    else if (miroShapeType.includes('arrow') && !miroShapeType.includes('line')) smShape = 'arrow-shape';
                    else if (miroShapeType.includes('round') || miroShapeType.includes('pill')) smShape = 'rounded-rect';
                    else smShape = 'rect';

                    let fillColor = 'none';
                    let strokeColor = '#333';
                    let strokeWidth = 2;
                    let textColor = '#333333';

                    const parseMiroColor = (val) => {
                      if (val === undefined || val === null || val === '' || val === 'transparent') return null;
                      const s = String(val).trim();
                      if (s.startsWith('#')) return s.length >= 7 ? s : '#' + s.slice(1).padStart(6, '0');
                      if (s.startsWith('rgb')) {
                        const m = s.match(/\d+/g);
                        if (m && m.length >= 3) {
                          return '#' + [m[0], m[1], m[2]].map(n => parseInt(n).toString(16).padStart(2, '0')).join('');
                        }
                        return null;
                      }
                      const num = parseInt(s);
                      if (isNaN(num) || num === 0) return null;
                      const hex = num.toString(16).padStart(6, '0').slice(-6);
                      return '#' + hex;
                    };

                    if (styleObj) {
                      let fillHex = parseMiroColor(styleObj.sbc) ||
                                    parseMiroColor(styleObj.bc) ||
                                    parseMiroColor(styleObj.backgroundColor) ||
                                    parseMiroColor(styleObj.fillColor) ||
                                    parseMiroColor(jd.fillColor) ||
                                    parseMiroColor(jd.backgroundColor);
                      if (fillHex) fillColor = fillHex;

                      let strokeHex = parseMiroColor(styleObj.lc) ||
                                     parseMiroColor(styleObj.borderColor) ||
                                     parseMiroColor(jd.borderColor);
                      if (strokeHex) strokeColor = strokeHex;

                      let tcHex = parseMiroColor(styleObj.fc) || parseMiroColor(styleObj.fontColor);
                      if (tcHex) textColor = tcHex;

                      if (styleObj.lw !== undefined) strokeWidth = parseInt(styleObj.lw);
                      else if (styleObj.borderWidth !== undefined) strokeWidth = parseInt(styleObj.borderWidth);
                    }

                    let cardOpts = {
                      type: 'shape',
                      shape: smShape,
                      fillColor: fillColor,
                      strokeColor: strokeColor,
                      strokeWidth: strokeWidth,
                      text: textHTML || '',
                      textColor: textColor,
                      fontSize: styleObj && styleObj.fs ? parseInt(styleObj.fs) : (styleObj && styleObj.fontSize ? parseInt(styleObj.fontSize) : 14)
                    };
                    extractPosition(jd, cardOpts, obj.widgetData);
                    if (!cardOpts.w) cardOpts.w = 160;
                    if (!cardOpts.h) cardOpts.h = 120;
                    extracted.push(cardOpts);
                    console.log('[PASTE] Miro shape →', smShape, 'fill:', fillColor, 'stroke:', strokeColor, 'size:', cardOpts.w, 'x', cardOpts.h);
                  } else {
                    // --- Normal sticker or text handling ---
                    let startmineType = type === 'text' ? 'text' : 'sticky';
                    let bgColorString = 'yellow';
                    let exactBgHex = null;

                    if (styleObj) {
                      let hex = styleObj.backgroundColor || styleObj.bc;
                      if (!hex && styleObj.sbc !== undefined) {
                        hex = '#' + parseInt(styleObj.sbc).toString(16).padStart(6, '0');
                      }
                      if (hex) {
                        hex = String(hex);
                        exactBgHex = hex.toLowerCase();
                        if (!exactBgHex.startsWith('#')) exactBgHex = '#' + exactBgHex;
                        bgColorString = exactColorMap[exactBgHex] || 'yellow';
                      }
                    }

                    if (!exactBgHex) {
                      bgColorString = miroColors[colorIdx % miroColors.length];
                      colorIdx++;
                    }

                    let cardOpts = {
                      type: startmineType,
                      text: textHTML,
                      color: bgColorString,
                      fontSize: styleObj && styleObj.fs ? parseInt(styleObj.fs) : (styleObj && styleObj.fontSize ? parseInt(styleObj.fontSize) : 24)
                    };
                    if (exactBgHex) cardOpts.bgHex = exactBgHex;
                    extractPosition(jd, cardOpts, obj.widgetData);

                    if (type === 'sticker' && cardOpts._baseW && cardOpts._baseW <= 200) {
                      cardOpts.h = cardOpts.w; // Force 1:1 aspect ratio
                    }

                    extracted.push(cardOpts);
                  }
                } else if (type === 'image') {
                  const res = jd.resource;
                  const boardId = (res && res.boardId) || miroJson.boardId || '';
                  const resourceId = res && res.id;
                  const imgW = (res && res.width) || (jd.crop && jd.crop.width) || 300;
                  const imgH = (res && res.height) || (jd.crop && jd.crop.height) || 200;
                  const imgName = (res && res.name) || 'image';

                  if (dataUrl) {
                    // Load the image directly from the clipboard dataUrl
                    let cardOpts = {
                      type: 'image',
                      imageUrl: dataUrl,
                      w: imgW,
                      h: imgH
                    };
                    extractPosition(jd, cardOpts, obj.widgetData);
                    extracted.push(cardOpts);
                    console.log('[PASTE] Miro image created directly from clipboard data.');
                  } else {
                    // Create a placeholder card (will be upgraded to real image if fetch succeeds)
                    let cardOpts = {
                      type: 'sticky',
                      text: '⏳ Loading ' + imgName + '...',
                      color: 'light_gray',
                      w: Math.min(imgW, 350),
                      h: Math.min(imgH, 228),
                      _miroResourceId: resourceId,
                      _miroBoardId: boardId,
                      _miroImgName: imgName
                    };
                    extractPosition(jd, cardOpts, obj.widgetData);
                    extracted.push(cardOpts);
                    console.log('[PASTE] Miro image queued for download. Resource:', imgName, 'board:', boardId, 'id:', resourceId);
                  }
                } else if (type === 'embed') {
                  const cd = jd.custom_data;
                  const embedUrl = (cd && cd.url) || jd.url || (jd.html && jd.html.match(/src="([^"]+)"/)?.[1]) || '';
                  const embedTitle = (cd && cd.title) || jd.title || jd.name || embedUrl;
                  if (embedUrl) {
                    let cardOpts = { type: 'card', url: embedUrl, label: embedTitle };
                    extractPosition(jd, cardOpts, obj.widgetData);
                    cardOpts.w = cardOpts.w || 280;
                    cardOpts.h = cardOpts.h || 240;
                    extracted.push(cardOpts);
                    console.log('[PASTE] Miro embed → card:', embedUrl.substring(0, 60));
                  }
                } else if (type === 'link' || type === 'line') {
                  // Skip connectors/lines
                } else if (type === 'imagewidget') {
                  let cardOpts = { type: 'sticky', text: '🖼️ Image', color: 'gray' };
                  extractPosition(jd, cardOpts, obj.widgetData);
                  cardOpts.w = cardOpts.w || 280;
                  cardOpts.h = cardOpts.h || 160;
                  extracted.push(cardOpts);
                } else {
                  console.log('[PASTE] Skipped Miro object type:', type);
                }
              }
            });
          }
        });

        if (extracted.length > 0) {
          if (!page.miroCards) page.miroCards = [];
          const coords = getPasteTargetCoords(page);
          let px = coords.x;
          let py = coords.y;
          let targetCellKey = coords.cell;
          let curX = px;
          let curY = py;

          clearMiroSelection();

          extracted.forEach(item => {
            if (!item.w && !item.h) {
              if (item.type === 'sticky') { item.w = 350; item.h = 228; }
              else if (item.type === 'text') { item.w = 260; item.h = 100; }
              else { item.w = 200; item.h = 200; }
            }

            item._vw = item.w || 200;
            item._vh = item.h || 200;
            if (item.fontSize && item._scale && item._scale !== 1) {
              item._vfs = item.fontSize * item._scale;
            } else {
              item._vfs = item.fontSize;
            }
          });

          let minCX = Infinity, minCY = Infinity;
          extracted.forEach(item => {
            if (item._ox !== undefined) {
              minCX = Math.min(minCX, item._ox);
              minCY = Math.min(minCY, item._oy);
            }
          });
          extracted.forEach(item => {
            if (item._ox !== undefined) {
              item._ox -= minCX;
              item._oy -= minCY;
            }
          });

          const vWidths = extracted.map(i => i._vw || 200).sort((a, b) => a - b);
          const medianVW = vWidths[Math.floor(vWidths.length / 2)];
          let globalFactor = medianVW / 280;
          if (globalFactor < 0.5) globalFactor = 0.5;
          let maxSpanX = 0, maxSpanY = 0;
          extracted.forEach(item => {
            if (item._ox !== undefined) {
              maxSpanX = Math.max(maxSpanX, item._ox + item._vw / 2);
              maxSpanY = Math.max(maxSpanY, item._oy + item._vh / 2);
            }
          });
          const maxSpan = Math.max(maxSpanX, maxSpanY);
          if (maxSpan > 0 && maxSpan / globalFactor > 6000) {
            globalFactor = maxSpan / 6000;
          }

          console.log('[PASTE] Factor:', globalFactor.toFixed(3), 'MedianVW:', medianVW.toFixed(0), 'Items:', extracted.length, 'MaxSpan:', maxSpan.toFixed(0));

          extracted.forEach(item => {
            const newId = uid();
            const card = { id: newId, ...item };
            if (targetCellKey) {
              card.cell = targetCellKey;
            } else {
              delete card.cell;
            }

            const screenW = Math.max(item._vw / globalFactor, 30);
            const screenH = Math.max(item._vh / globalFactor, 20);
            const screenFS = item._vfs ? (item._vfs / globalFactor) : 14;

            card.w = screenW;
            card.h = screenH;
            card.fontSize = Math.max(screenFS, 8);

            if (item._ox !== undefined) {
              const screenCX = px + (item._ox / globalFactor);
              const screenCY = py + (item._oy / globalFactor);
              card.x = screenCX - screenW / 2;
              card.y = screenCY - screenH / 2;
            } else {
              card.x = curX - 100;
              card.y = curY - 100;
              curX += (card.w || 280) + 40;
              if (curX > px + 950) {
                curX = px;
                curY += (card.h || 160) + 40;
              }
            }

            delete card._ox;
            delete card._oy;
            delete card._scale;
            delete card._centerOrigin;
            delete card._vw;
            delete card._vh;
            delete card._vfs;
            delete card._baseW;
            delete card._baseH;
            delete card._miroLeft;
            delete card._miroTop;

            page.miroCards.push(card);
            _miroSelected.add(newId);
            if (card.type === 'image') {
              localizeCardImageUrl(card);
            }
          });
          sv(); buildMiroCanvas(); if (typeof buildOutline === 'function') buildOutline();

          // Upgrade Miro image placeholders that didn't have dataUrl
          page.miroCards.forEach(card => {
            if (card._miroResourceId && card._miroBoardId) {
              const apiUrl = 'https://miro.com/api/v1/boards/' + card._miroBoardId + '/resources/' + card._miroResourceId + '/files/original';
              console.log('[PASTE] Miro image URL:', apiUrl);
              card.type = 'image';
              card.imageUrl = apiUrl;
              delete card.text;
              delete card.color;
              const tmpImg = new Image();
              tmpImg.onload = function () {
                card.w = Math.min(tmpImg.width, 800);
                card.h = Math.round(card.w * (tmpImg.height / tmpImg.width));
                delete card._miroResourceId;
                delete card._miroBoardId;
                delete card._miroImgName;
                sv(); buildMiroCanvas();
                console.log('[PASTE] Miro image loaded!', card.w, 'x', card.h);
              };
              tmpImg.onerror = function () {
                console.warn('[PASTE] Miro image failed to load via img tag. Will show broken image.');
                delete card._miroResourceId;
                delete card._miroBoardId;
                sv(); buildMiroCanvas();
              };
              tmpImg.src = apiUrl;
            }
          });
          sv(); buildMiroCanvas();
          return;
        }

        console.log('[PASTE] Miro JSON extracted 0 items, trying HTML div fallback...');
        const divElements = doc.querySelectorAll('body > div');
        if (divElements.length > 0) {
          divElements.forEach(div => {
            const txt = div.textContent.trim();
            if (txt) {
              extracted.push({ type: 'sticky', text: txt, color: 'yellow' });
            }
          });
          console.log('[PASTE] HTML div fallback extracted', extracted.length, 'items');
        }

        if (extracted.length > 0) {
          if (!page.miroCards) page.miroCards = [];
          const coords = getPasteTargetCoords(page);
          let px = coords.x;
          let py = coords.y;
          let targetCellKey = coords.cell;
          let curX = px, curY = py;
          clearMiroSelection();
          extracted.forEach(item => {
            const newId = uid();
            const card = { id: newId, ...item, w: item.w || 280, h: item.h || 160 };
            card.x = curX - 100;
            card.y = curY - 100;
            curX += (card.w || 280) + 40;
            if (curX > px + 950) { curX = px; curY += (card.h || 160) + 40; }
            if (targetCellKey) {
              card.cell = targetCellKey;
            } else {
              delete card.cell;
            }
            page.miroCards.push(card);
            _miroSelected.add(newId);
          });
          sv(); buildMiroCanvas(); if (typeof buildOutline === 'function') buildOutline();
        }
        return;
      } else {
        // Generic HTML extraction from non-Miro sources
        const extractGenericElements = (node, result = []) => {
          if (node.nodeType === 1) {
            const style = window.getComputedStyle(node);
            const bgColor = node.style.backgroundColor || node.getAttribute('bgcolor');
            const color = node.style.color;
            const fontSizeStr = node.style.fontSize;
            let fontSize = fontSizeStr ? parseInt(fontSizeStr) : 24;

            if ((node.tagName === 'P' || node.tagName === 'DIV' || node.tagName === 'SPAN') && node.textContent.trim()) {
              let bgIsColor = bgColor && bgColor !== 'transparent' && bgColor !== 'rgba(0, 0, 0, 0)' && bgColor !== '#ffffff' && bgColor !== 'white';
              if (bgIsColor) {
                result.push({ type: 'sticky', text: node.innerHTML, bg: bgColor, color: color || '#333', fontSize: fontSize });
                return result;
              } else if (node.tagName === 'P' || node.tagName === 'SPAN') {
                result.push({ type: 'text', text: node.textContent, color: color || '#ffffff', fontSize: fontSize });
                return result;
              }
            }
            for (let i = 0; i < node.childNodes.length; i++) {
              extractGenericElements(node.childNodes[i], result);
            }
          }
          return result;
        };

        extracted = extractGenericElements(doc.body);

        if (extracted.length === 0 && doc.body.textContent.trim()) {
          extracted.push({
            type: 'sticky',
            text: doc.body.innerHTML,
            bg: '#ffe599'
          });
        }

        if (extracted.length > 0) {
          if (!page.miroCards) page.miroCards = [];
          const coords = getPasteTargetCoords(page);
          let px = coords.x;
          let py = coords.y;
          let targetCellKey = coords.cell;

          let curX = px;
          let curY = py;

          clearMiroSelection();
          let minOX = Infinity;
          let minOY = Infinity;
          extracted.forEach(item => {
            if (item._ox !== undefined) {
              if (item._ox < minOX) minOX = item._ox;
              if (item._oy < minOY) minOY = item._oy;
            }
          });

          extracted.forEach(item => {
            const newId = uid();
            const card = { id: newId, ...item };

            if (item.type === 'sticky') {
              card.w = item.w || 280;
              card.h = item.h || 160;
            } else if (item.type === 'text') {
              card.w = Math.min(Math.max(100, item.text.length * (card.fontSize / 2)), 400);
              card.h = Math.max(card.fontSize * 1.5, 40);
              card.font = 'Inter';
              card.fontColor = card.fontColor || '#333333';
              card.align = 'right';
            }

            if (targetCellKey) {
              card.cell = targetCellKey;
            } else {
              delete card.cell;
            }

            if (item._ox !== undefined && minOX !== Infinity) {
              card.x = px + (item._ox - minOX);
              card.y = py + (item._oy - minOY);
            } else {
              card.x = curX - 100;
              card.y = curY - 100;
              curX += (card.w || 280) + 40;
              if (curX > px + 950) {
                curX = px;
                curY += (card.h || 160) + 40;
              }
            }

            page.miroCards.push(card);
            _miroSelected.add(newId);
          });
          sv(); buildMiroCanvas(); if (typeof buildOutline === 'function') buildOutline();
          console.log('[PASTE DEBUG] Generic HTML parsed cards rendered, returning!');
          return;
        }
      }
      if (isMiroData) {
        window._lastMiroPasteTime = Date.now();
        console.log('[PASTE DEBUG] isMiroData was true but extracted was empty! Returning early.');
        return;
      }
    }

    console.log('[PASTE DEBUG] Reached Image/Text checking block');
    let imagePasted = false;

    // 3. Check for images natively copied (Lower Priority than Widgets)
    if (dataUrl) {
      imagePasted = true;
      const img = new Image();
      img.onload = function () {
        const coords = getPasteTargetCoords(page);
        const cx = coords.x;
        const cy = coords.y;
        const targetCellKey = coords.cell;

        if (!page.miroCards) page.miroCards = [];
        let w = 300;
        let h = Math.round(300 * (img.height / img.width));
        if (img.width > 800) { w = 800; h = Math.round(800 * (img.height / img.width)); }

        const card = { id: uid(), type: 'image', w, h, x: cx - w / 2, y: cy - h / 2, imageUrl: dataUrl };
        if (targetCellKey) {
          card.cell = targetCellKey;
        } else {
          delete card.cell;
        }
        page.miroCards.push(card);
        sv(); buildMiroCanvas(); if (typeof buildOutline === 'function') buildOutline();
        localizeCardImageUrl(card);
      };
      img.src = dataUrl;
    }

    if (imagePasted) { console.log('[PASTE DEBUG] Image handled, returning.'); return; }

    if (window._lastMiroPasteTime && Date.now() - window._lastMiroPasteTime < 1000) {
      console.log('[PASTE DEBUG] Aborting text paste because window._lastMiroPasteTime < 1000!!');
      return;
    }

    if (!text) { console.log('[PASTE DEBUG] No text data, returning.'); return; }

    console.log('[PASTE DEBUG] Reached External Text/URL fallback with text:', text.substring(0, 50));

    // 4. Check for Internal Startmine Copied Data (copied between tabs or via keyboard shortcuts)
    if (text.startsWith('STARTMINE_MIRO:')) {
      const clipData = text.replace('STARTMINE_MIRO:', '');
      try {
        const cards = JSON.parse(clipData);
        if (cards && cards.length > 0) {
          if (!page.miroCards) page.miroCards = [];
          const coords = getPasteTargetCoords(page);
          const cx = coords.x;
          const cy = coords.y;
          const targetCellKey = coords.cell;

          let minX = Infinity, minY = Infinity;
          cards.forEach(c => { if (c.x < minX) minX = c.x; if (c.y < minY) minY = c.y; });
          clearMiroSelection();
          cards.forEach(c => {
            const newId = uid(); c.id = newId;
            c.x = cx + (c.x - minX) - (c.w || 100) / 2;
            c.y = cy + (c.y - minY) - (c.h || 100) / 2;
            if (targetCellKey) {
              card.cell = targetCellKey;
            } else {
              delete card.cell;
            }
            page.miroCards.push(c); _miroSelected.add(c.id);
          });
          sv(); buildMiroCanvas(); if (typeof buildOutline === 'function') buildOutline();
          window._lastMiroPasteTime = Date.now();
          console.log('[PASTE DEBUG] Handled STARTMINE_MIRO internal paste!');
          return;
        }
      } catch (e) {
        console.error('Failed to parse internal Startmine paste:', e);
      }
    }

    // 5. It's external Text or URL
    if (!page.miroCards) page.miroCards = [];
    const coords = getPasteTargetCoords(page);
    const cx = coords.x;
    const cy = coords.y;
    const targetCellKey = coords.cell;

    let url = text.trim();
    if (/^(https?:\/\/[^\s]+)$/i.test(url) || /^(www\.[^\s]+)$/i.test(url)) {
      if (!url.startsWith('http')) url = 'https://' + url;
      const label = domainOf(url);
      const card = { id: uid(), type: 'card', url, label, x: cx - 140, y: cy - 120, w: 280, h: 240 };
      if (targetCellKey) {
        card.cell = targetCellKey;
      } else {
        delete card.cell;
      }
      page.miroCards.push(card);
      sv(); buildMiroCanvas(); if (typeof buildOutline === 'function') buildOutline();
      if (typeof queueCardFetch !== 'undefined') queueCardFetch(card.id, url);
      console.log('[PASTE DEBUG] Created URL Bookmark card!');
    } else {
      const w = 200, h = 200;
      const card = { id: uid(), type: 'sticky', text: text, bg: '#ffe599', x: cx - w / 2, y: cy - h / 2, w, h };
      if (targetCellKey) {
        card.cell = targetCellKey;
      } else {
        delete card.cell;
      }
      page.miroCards.push(card);
      sv(); buildMiroCanvas(); if (typeof buildOutline === 'function') buildOutline();
      console.log('[PASTE DEBUG] Created Plain Text Sticky card!');
    }
  }
});

// ─── Pen Tool (Freehand Drawing with Live Preview) ───
(function () {
  const canvas = document.getElementById('miro-canvas');
  const board = document.getElementById('miro-board');
  let liveSvg = null;

  canvas.addEventListener('mousedown', (e) => {
    if (!_penMode || e.button !== 0) return;
    if (e.target !== canvas && e.target.id !== 'miro-board' && !e.target.closest('#miro-board')) return;
    e.preventDefault(); e.stopPropagation();
    _penDrawing = true;
    const page = cp();
    const zoom = (page.zoom || 100) / 100;
    const rect = canvas.getBoundingClientRect();
    const bx = (e.clientX - rect.left - (page.panX || 0)) / zoom;
    const by = (e.clientY - rect.top - (page.panY || 0)) / zoom;
    _penPoints = [{ x: bx, y: by }];
    // Create live SVG preview on board (same coordinate space)
    liveSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    liveSvg.setAttribute('width', '99999');
    liveSvg.setAttribute('height', '99999');
    liveSvg.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none;z-index:9999;overflow:visible;';
    const pathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    pathEl.setAttribute('d', `M${bx},${by}`);
    pathEl.setAttribute('fill', 'none');
    pathEl.setAttribute('stroke', document.getElementById('pen-color').value || '#333');
    pathEl.setAttribute('stroke-width', document.getElementById('pen-width').value || '3');
    pathEl.setAttribute('stroke-linecap', 'round');
    pathEl.setAttribute('stroke-linejoin', 'round');
    liveSvg.appendChild(pathEl);
    board.appendChild(liveSvg);
  }, true);

  document.addEventListener('mousemove', (e) => {
    if (!_penDrawing || !liveSvg) return;
    const page = cp();
    const zoom = (page.zoom || 100) / 100;
    const rect = canvas.getBoundingClientRect();
    const bx = (e.clientX - rect.left - (page.panX || 0)) / zoom;
    const by = (e.clientY - rect.top - (page.panY || 0)) / zoom;
    _penPoints.push({ x: bx, y: by });
    // Update live path
    let d = `M${_penPoints[0].x},${_penPoints[0].y}`;
    for (let i = 1; i < _penPoints.length; i++) d += ` L${_penPoints[i].x},${_penPoints[i].y}`;
    liveSvg.querySelector('path').setAttribute('d', d);
  });

  document.addEventListener('mouseup', () => {
    if (!_penDrawing) return;
    _penDrawing = false;
    if (liveSvg) { liveSvg.remove(); liveSvg = null; }
    if (_penPoints.length < 2) return;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    _penPoints.forEach(p => { minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y); });
    const pad = 10;
    const w = maxX - minX + pad * 2, h = maxY - minY + pad * 2;
    const normalized = _penPoints.map(p => ({ x: p.x - minX + pad, y: p.y - minY + pad }));
    const page = cp();
    if (!page.miroCards) page.miroCards = [];
    page.miroCards.push({
      id: uid(), type: 'pen', points: normalized,
      x: minX - pad, y: minY - pad, w, h,
      penColor: document.getElementById('pen-color').value || '#333',
      penWidth: +(document.getElementById('pen-width').value) || 3,
    });
    sv(); buildMiroCanvas(); buildOutline();
    _penPoints = [];
  });
})();

// ─── Shape Draw Mode (click-drag or double-click) ───
(function () {
  const canvas = document.getElementById('miro-canvas');
  let shapeDrawing = false, shapeStartX = 0, shapeStartY = 0;
  let previewEl = null;

  canvas.addEventListener('mousedown', (e) => {
    if (!_shapeMode || e.button !== 0) return;
    if (e.target !== canvas && e.target.id !== 'miro-board') return;
    e.preventDefault(); e.stopPropagation();
    shapeDrawing = true;
    const page = cp();
    const zoom = (page.zoom || 100) / 100;
    const rect = canvas.getBoundingClientRect();
    shapeStartX = (e.clientX - rect.left - (page.panX || 0)) / zoom;
    shapeStartY = (e.clientY - rect.top - (page.panY || 0)) / zoom;
    // Create preview rect
    previewEl = document.createElement('div');
    previewEl.style.cssText = `position:absolute;border:2px dashed var(--ac);pointer-events:none;z-index:9999;left:${shapeStartX}px;top:${shapeStartY}px;width:0;height:0;`;
    document.getElementById('miro-board').appendChild(previewEl);
  }, true);

  document.addEventListener('mousemove', (e) => {
    if (!shapeDrawing || !previewEl) return;
    const page = cp();
    const zoom = (page.zoom || 100) / 100;
    const rect = canvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left - (page.panX || 0)) / zoom;
    const my = (e.clientY - rect.top - (page.panY || 0)) / zoom;
    const x = Math.min(shapeStartX, mx), y = Math.min(shapeStartY, my);
    const w = Math.abs(mx - shapeStartX), h = Math.abs(my - shapeStartY);
    previewEl.style.left = x + 'px'; previewEl.style.top = y + 'px';
    previewEl.style.width = w + 'px'; previewEl.style.height = h + 'px';
  });

  document.addEventListener('mouseup', (e) => {
    if (!shapeDrawing) return;
    shapeDrawing = false;
    if (previewEl) { previewEl.remove(); previewEl = null; }
    const page = cp();
    const zoom = (page.zoom || 100) / 100;
    const rect = canvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left - (page.panX || 0)) / zoom;
    const my = (e.clientY - rect.top - (page.panY || 0)) / zoom;
    const w = Math.abs(mx - shapeStartX), h = Math.abs(my - shapeStartY);
    if (w < 10 && h < 10) return; // too small, ignore (double-click handles default)
    const x = Math.min(shapeStartX, mx), y = Math.min(shapeStartY, my);
    if (!page.miroCards) page.miroCards = [];
    page.miroCards.push({
      id: uid(), type: 'shape', shape: _activeShapeType || 'rect',
      x, y, w: Math.max(w, 40), h: Math.max(h, 40),
      fillColor: 'none', strokeColor: '#333333', strokeWidth: 2, opacity: 1,
    });
    sv(); buildMiroCanvas(); buildOutline();
  });

  // Double-click → place default shape at center
  canvas.addEventListener('dblclick', (e) => {
    if (!_shapeMode) return;
    if (e.target !== canvas && e.target.id !== 'miro-board') return;
    e.preventDefault();
    const page = cp();
    if (!page.miroCards) page.miroCards = [];
    const zoom = (page.zoom || 100) / 100;
    const r = canvas.getBoundingClientRect();
    const cx = (e.clientX - r.left - (page.panX || 0)) / zoom;
    const cy = (e.clientY - r.top - (page.panY || 0)) / zoom;
    page.miroCards.push({
      id: uid(), type: 'shape', shape: _activeShapeType || 'rect',
      x: cx - 80, y: cy - 60, w: 160, h: 120,
      fillColor: 'none', strokeColor: '#333333', strokeWidth: 2, opacity: 1,
    });
    sv(); buildMiroCanvas(); buildOutline();
  });
})();

// (Grid and Mindmap tools now use click-to-place logic within the miro-canvas click event)

// =========== EXPLODE WIDGET ===========
window.explodeMiroWidget = function (widgetId) {
  const page = cp();
  if (!page || !page.miroCards) return;

  const wIdx = page.miroCards.findIndex(c => c.id === widgetId && c.type === 'bwidget');
  if (wIdx === -1) return;

  const widget = page.miroCards[wIdx];
  if (!widget.items || widget.items.length === 0) {
    console.warn("Widget has no links to explode.");
    return;
  }

  // Calculate grid layout for extracted cards
  const startX = widget.x || 0;
  const startY = widget.y || 0;
  const cardW = 280;
  const cardH = 240;
  const gap = 20;
  const cols = 4; // 4 cards per row

  const extractedCards = widget.items.map((item, index) => {
    const row = Math.floor(index / cols);
    const col = index % cols;
    return {
      id: uid(),
      type: 'card',
      url: item.url,
      label: item.title || domainOf(item.url),
      x: startX + (col * (cardW + gap)),
      y: startY + (row * (cardH + gap)),
      w: cardW,
      h: cardH
    };
  });

  // Remove the old widget
  page.miroCards.splice(wIdx, 1);

  // Add the new cards
  page.miroCards.push(...extractedCards);

  // Ensure selection is clear so the user doesn't accidentally move ghost selections
  clearMiroSelection();

  // Save and redraw
  sv();
  buildMiroCanvas();
  if (typeof buildOutline === 'function') buildOutline();
};

window.addEventListener('resize', () => {
  const page = cp();
  if (page && page.pageType === 'miro') {
    buildMiroCanvas();
  }
});

// =========== CONVERT SELECTION TO WIDGET ===========
window.createWidgetFromSelection = function () {
  const page = cp();
  if (!page || !page.miroCards || _miroSelected.size < 2) return;

  const selectedCards = [];
  _miroSelected.forEach(cid => {
    const card = page.miroCards.find(c => c.id === cid && c.type === 'card' && c.url);
    if (card) selectedCards.push(card);
  });

  if (selectedCards.length === 0) {
    if (typeof showToast === 'function') showToast("No web links selected.");
    return;
  }

  // Extract items for the widget
  const items = selectedCards.map(c => ({
    url: c.url,
    title: c.label || domainOf(c.url)
  }));

  // Calculate position (average center of selected cards)
  let sumX = 0, sumY = 0;
  selectedCards.forEach(c => {
    sumX += (c.x || 0) + (c.w || 280) / 2;
    sumY += (c.y || 0) + (c.h || 240) / 2;
  });
  const avgX = sumX / selectedCards.length;
  const avgY = sumY / selectedCards.length;

  const itemsLen = items.length;
  const wCols = 6;
  const itemPx = 94; // approx height/width of an lg grid item + gap
  const reqRows = Math.ceil(itemsLen / wCols);

  const cardW = 540;
  const cardH = Math.max(200, 70 + (reqRows * itemPx));

  const startX = avgX - (cardW / 2);
  const startY = avgY - (cardH / 2);

  // Create new widget
  const newWidget = {
    id: uid(),
    type: 'bwidget',
    title: 'New Bookmark Group',
    items: items,
    x: startX,
    y: startY,
    w: cardW,
    h: cardH,
    display: 'spark',
    size: 'lg'
  };

  page.miroCards.push(newWidget);

  // Clear selection and redraw
  clearMiroSelection();
  sv();
  buildMiroCanvas();
  if (typeof buildOutline === 'function') buildOutline();
};

/* ─── Z-Order System (Context Menu) ─── */
// State moved to miro-state.js

function getCardIndex(page, cid) {
  return (page.miroCards || []).findIndex(c => c.id === cid);
}

function zBringToFront(cids) {
  const page = cp();
  if (!page || !page.miroCards) return;
  const cards = [];
  const rest = [];
  page.miroCards.forEach(c => {
    if (cids.has(c.id)) cards.push(c);
    else rest.push(c);
  });
  if (cards.length === 0) return;
  page.miroCards = [...rest, ...cards];
  sv(); buildMiroCanvas();
  if (typeof buildOutline === 'function') buildOutline();
}

function zSendToBack(cids) {
  const page = cp();
  if (!page || !page.miroCards) return;
  const cards = [];
  const rest = [];
  page.miroCards.forEach(c => {
    if (cids.has(c.id)) cards.push(c);
    else rest.push(c);
  });
  if (cards.length === 0) return;
  page.miroCards = [...cards, ...rest];
  sv(); buildMiroCanvas();
  if (typeof buildOutline === 'function') buildOutline();
}

function zBringForward(cids) {
  const page = cp();
  if (!page || !page.miroCards) return;
  const arr = page.miroCards;
  // Process from end to start so swaps don't interfere
  for (let i = arr.length - 2; i >= 0; i--) {
    if (cids.has(arr[i].id) && !cids.has(arr[i + 1].id)) {
      [arr[i], arr[i + 1]] = [arr[i + 1], arr[i]];
    }
  }
  sv(); buildMiroCanvas();
  if (typeof buildOutline === 'function') buildOutline();
}

function zSendBackward(cids) {
  const page = cp();
  if (!page || !page.miroCards) return;
  const arr = page.miroCards;
  // Process from start to end so swaps don't interfere
  for (let i = 1; i < arr.length; i++) {
    if (cids.has(arr[i].id) && !cids.has(arr[i - 1].id)) {
      [arr[i], arr[i - 1]] = [arr[i - 1], arr[i]];
    }
  }
  sv(); buildMiroCanvas();
  if (typeof buildOutline === 'function') buildOutline();
}

function zDeleteCards(cids) {
  const page = cp();
  if (!page || !page.miroCards) return;
  if (typeof pushUndo === 'function') pushUndo();
  page.miroCards = page.miroCards.filter(c => !cids.has(c.id));
  clearMiroSelection();
  sv(); buildMiroCanvas();
  if (typeof buildOutline === 'function') buildOutline();
}

// Get the set of card IDs to operate on (selected cards or the right-clicked card)
function getZTargetCids() {
  if (_miroSelected.size > 0) return new Set(_miroSelected);
  if (_ctxTargetCid) return new Set([_ctxTargetCid]);
  return new Set();
}

// ─── Context Menu Show/Hide ───
function showCtxMenu(x, y) {
  const menu = document.getElementById('miro-ctx-menu');
  if (!menu) return;
  menu.style.left = x + 'px';
  menu.style.top = y + 'px';
  menu.classList.add('show');
  // Adjust if menu goes off-screen
  requestAnimationFrame(() => {
    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) menu.style.left = (window.innerWidth - rect.width - 8) + 'px';
    if (rect.bottom > window.innerHeight) menu.style.top = (window.innerHeight - rect.height - 8) + 'px';
  });
}

function hideCtxMenu() {
  const menu = document.getElementById('miro-ctx-menu');
  if (menu) menu.classList.remove('show');
  _ctxTargetCid = null;
}

// ─── Right-click handler for all miro card types ───
const _miroCardSelector = '.miro-card, .miro-sticky, .miro-image, .miro-text, .miro-shape, .miro-pen, .miro-grid, .miro-mindmap, .miro-widget, .miro-array, .miro-calendar, .miro-embed';

function _handleContextMenu(e) {
  const cardEl = e.target.closest(_miroCardSelector);
  if (!cardEl) {
    hideCtxMenu();
    return;
  }
  e.preventDefault();
  e.stopPropagation();

  const cid = cardEl.dataset.cid;
  if (!cid) return;

  _ctxTargetCid = cid;

  // If right-clicked card is not in selection, select it exclusively
  if (_miroSelected.size > 0 && !_miroSelected.has(cid)) {
    clearMiroSelection();
    addMiroSelect(cid);
  } else if (_miroSelected.size === 0) {
    addMiroSelect(cid);
  }

  // Update pin-toggle label based on current state
  const pinItem = document.querySelector('[data-action="pin-toggle"]');
  if (pinItem) {
    const page = typeof cp === 'function' ? cp() : {};
    const cards = page.miroCards || [];
    const cardData = cards.find(c => c.id === cid);
    const isPinned = cardData && cardData.pinned;
    const label = pinItem.querySelector('.ctx-label');
    const icon = pinItem.querySelector('.ctx-icon');
    if (label) label.textContent = isPinned ? 'Unpin from Screen' : 'Pin to Screen';
    if (icon) icon.textContent = isPinned ? '📍' : '📌';
  }

  // Show/hide image-only items
  const isImage = !!cardEl.closest('.miro-image');
  document.querySelectorAll('#miro-ctx-menu .ctx-img-only').forEach(el => {
    el.style.display = isImage ? '' : 'none';
  });
  // Show add/remove caption based on whether caption exists
  if (isImage) {
    const page = typeof cp === 'function' ? cp() : {};
    const mc = (page.miroCards || []).find(c => c.id === cid);
    const hasCaption = mc && mc.caption;
    const addBelow = document.querySelector('[data-action="add-caption-below"]');
    const addAbove = document.querySelector('[data-action="add-caption-above"]');
    const removeCap = document.querySelector('[data-action="remove-caption"]');
    if (addBelow) addBelow.style.display = hasCaption ? 'none' : '';
    if (addAbove) addAbove.style.display = hasCaption ? 'none' : '';
    if (removeCap) removeCap.style.display = hasCaption ? '' : 'none';
  }

  showCtxMenu(e.clientX, e.clientY);
}

document.getElementById('miro-canvas').addEventListener('contextmenu', _handleContextMenu);

// Also listen on pinned layer (elements are outside canvas when pinned)
const _pinnedLayer = document.getElementById('miro-pinned-layer');
if (_pinnedLayer) {
  _pinnedLayer.addEventListener('contextmenu', _handleContextMenu);
}

// ─── Unpin All — emergency escape for stuck pinned elements ───
function unpinAll() {
  const pinnedLayer = document.getElementById('miro-pinned-layer');
  const board = document.getElementById('miro-board');
  const page = typeof cp === 'function' ? cp() : {};
  const cards = page.miroCards || [];
  // Unpin from global pinned layer
  if (pinnedLayer) {
    while (pinnedLayer.firstChild) {
      const el = pinnedLayer.firstChild;
      const cid = el.dataset && el.dataset.cid;
      if (cid) {
        const cardData = cards.find(function(c) { return c.id === cid; });
        if (cardData) {
          var origX = cardData._savedX != null ? cardData._savedX : (cardData.x || 0);
          var origY = cardData._savedY != null ? cardData._savedY : (cardData.y || 0);
          var origW = cardData._savedW != null ? cardData._savedW : (cardData.w || 200);
          var origH = cardData._savedH != null ? cardData._savedH : (cardData.h || 150);
          cardData.pinned = false;
          cardData.x = origX; cardData.y = origY;
          cardData.w = origW; cardData.h = origH;
          delete cardData._pinScreenX; delete cardData._pinScreenY;
          delete cardData._pinScreenW; delete cardData._pinScreenH;
          delete cardData._savedX; delete cardData._savedY;
          delete cardData._savedW; delete cardData._savedH;
          delete cardData._pinCellX; delete cardData._pinCellY;
          delete cardData._pinCellW; delete cardData._pinCellH;
          el.style.position = 'absolute';
          el.style.left = origX + 'px';
          el.style.top = origY + 'px';
          el.style.width = origW + 'px';
          el.style.height = origH + 'px';
        }
      }
      if (board) board.appendChild(el);
      else pinnedLayer.removeChild(el);
    }
  }
  // Also clear pinned flag on any remaining cards (cell-pinned)
  cards.forEach(function(cd) {
    if (!cd.pinned) return;
    cd.pinned = false;
    if (cd._savedX != null) cd.x = cd._savedX;
    if (cd._savedY != null) cd.y = cd._savedY;
    if (cd._savedW != null) cd.w = cd._savedW;
    if (cd._savedH != null) cd.h = cd._savedH;
    delete cd._pinScreenX; delete cd._pinScreenY;
    delete cd._pinScreenW; delete cd._pinScreenH;
    delete cd._savedX; delete cd._savedY;
    delete cd._savedW; delete cd._savedH;
    delete cd._pinCellX; delete cd._pinCellY;
    delete cd._pinCellW; delete cd._pinCellH;
  });
  if (typeof sv === 'function') sv();
  if (typeof buildMiroCanvas === 'function') buildMiroCanvas();
  if (typeof showToast === 'function') showToast('📍 All elements unpinned');
}

// Clean pinned layer when switching pages/tabs
if (typeof window._onPageSwitch === 'undefined') {
  window._onPageSwitch = [];
}
window._onPageSwitch.push(unpinAll);

// ─── Context menu item clicks ───
document.getElementById('miro-ctx-menu').addEventListener('click', (e) => {
  const item = e.target.closest('.ctx-item');
  if (!item) return;
  const action = item.dataset.action;
  const cids = getZTargetCids();
  if (cids.size === 0) { hideCtxMenu(); return; }

  if (typeof pushUndo === 'function') pushUndo();

  switch (action) {
    case 'bring-front': zBringToFront(cids); break;
    case 'bring-forward': zBringForward(cids); break;
    case 'send-backward': zSendBackward(cids); break;
    case 'send-back': zSendToBack(cids); break;
    case 'delete': zDeleteCards(cids); break;
    case 'make-array':
      cids.forEach(cid => convertImageToArray(cid));
      break;
    case 'make-2d-array':
      cids.forEach(cid => make2DArray(cid));
      break;
    case 'pin-toggle':
      cids.forEach(cid => {
        if (typeof togglePinElement === 'function') togglePinElement(cid);
      });
      break;
    case 'add-caption-below':
    case 'add-caption-above': {
      const pos = action === 'add-caption-below' ? 'below' : 'above';
      const page = cp();
      cids.forEach(cid => {
        const card = (page.miroCards || []).find(c => c.id === cid);
        if (card && card.type === 'image') {
          card.caption = {
            text: 'Caption', position: pos,
            bg: '#1a1d2e', color: '#e4e4e4', fontSize: 14,
            fontWeight: 'normal', textAlign: 'center',
            height: 36
          };
        }
      });
      sv(); buildMiroCanvas();
      break;
    }
    case 'remove-caption': {
      const page = cp();
      cids.forEach(cid => {
        const card = (page.miroCards || []).find(c => c.id === cid);
        if (card) delete card.caption;
      });
      sv(); buildMiroCanvas();
      break;
    }
  }
  hideCtxMenu();
});

// Close context menu on click elsewhere or Escape
document.addEventListener('click', (e) => {
  if (!e.target.closest('#miro-ctx-menu')) hideCtxMenu();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') hideCtxMenu();
});

// ─── Keyboard shortcuts for z-order ───
document.addEventListener('keydown', (e) => {
  if (!_miroMode) return;
  // Don't trigger if typing in an input/textarea
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;
  if (!e.ctrlKey && !e.metaKey) return;

  const cids = getZTargetCids();
  if (cids.size === 0) return;

  if (e.key === 'ArrowUp' && (e.shiftKey)) {
    e.preventDefault();
    if (typeof pushUndo === 'function') pushUndo();
    zBringToFront(cids);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (typeof pushUndo === 'function') pushUndo();
    zBringForward(cids);
  } else if (e.key === 'ArrowDown' && (e.shiftKey)) {
    e.preventDefault();
    if (typeof pushUndo === 'function') pushUndo();
    zSendToBack(cids);
  } else if (e.key === 'ArrowDown') {
    e.preventDefault();
    if (typeof pushUndo === 'function') pushUndo();
    zSendBackward(cids);
  }
});

// ─── Ctrl+G / Ctrl+Shift+G → Group / Ungroup ───
// Also supports Arabic keyboard: ل = G
document.addEventListener('keydown', (e) => {
  const page = cp();
  if (page.pageType !== 'miro') return;
  const tag = (document.activeElement || {}).tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || (document.activeElement && document.activeElement.contentEditable === 'true')) return;

  const key = e.key.toLowerCase();
  // Ctrl+G or Ctrl+ل (Arabic G)
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (key === 'g' || key === 'ل')) {
    e.preventDefault();
    if (typeof groupSelectedCards === 'function') groupSelectedCards();
  }
  // Ctrl+Shift+G or Ctrl+Shift+ل
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && (key === 'g' || key === 'ل')) {
    e.preventDefault();
    if (typeof ungroupSelectedCards === 'function') ungroupSelectedCards();
  }
  // F key → zoom-to-fit selection
  if (key === 'f' && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
    if (_miroSelected.size > 0) {
      e.preventDefault();
      if (_miroSelected.size === 1) {
        if (typeof zoomToFitCard === 'function') zoomToFitCard([..._miroSelected][0]);
      } else {
        if (typeof zoomToFitCards === 'function') zoomToFitCards([..._miroSelected]);
      }
    }
  }

  // B key → create bookmark widget at canvas center
  if (key === 'b' && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
    e.preventDefault();
    const canvas = document.getElementById('miro-canvas');
    if (!canvas) return;
    const zoom = (page.zoom || 100) / 100;
    const cx = (canvas.clientWidth / 2 - (page.panX || 0)) / zoom;
    const cy = (canvas.clientHeight / 2 - (page.panY || 0)) / zoom;
    page.miroCards.push({
      id: uid(), type: 'bwidget',
      title: 'Bookmarks', emoji: '📌',
      items: [],
      x: cx - 160, y: cy - 200,
      w: 320, h: 400
    });
    if (typeof pushUndo === 'function') pushUndo();
    sv(); buildMiroCanvas(); if (typeof buildOutline === 'function') buildOutline();
  }

  // Ctrl+Enter → open inbox and focus input
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault();
    const inboxSide = document.getElementById('inbox-side');
    if (inboxSide && !inboxSide.classList.contains('open')) {
      inboxSide.classList.add('open');
      const btn = document.getElementById('inbox-btn');
      if (btn) btn.classList.add('active-toggle');
    }
    const inp = document.getElementById('inbox-input');
    if (inp) inp.focus();
  }
});

// Esc → close inbox
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    const inboxSide = document.getElementById('inbox-side');
    if (inboxSide && inboxSide.classList.contains('open')) {
      inboxSide.classList.remove('open');
      const btn = document.getElementById('inbox-btn');
      if (btn) btn.classList.remove('active-toggle');
      e.preventDefault();
    }
  }
});

// ─── Inbox drag-to-canvas: drop creates miro elements ───
(function () {
  const canvas = document.getElementById('miro-canvas');
  if (!canvas) return;
  canvas.addEventListener('dragover', (e) => {
    if (typeof _dragInboxId !== 'undefined' && _dragInboxId) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    }
  });
  canvas.addEventListener('drop', (e) => {
    if (typeof _dragInboxId === 'undefined' || !_dragInboxId) return;
    e.preventDefault();
    const page = cp();
    if (!page || page.pageType !== 'miro') return;

    const inboxItem = (D.inbox || []).find(x => x.id === _dragInboxId);
    if (!inboxItem) return;

    const zoom = (page.zoom || 100) / 100;
    const rect = canvas.getBoundingClientRect();
    const dropX = (e.clientX - rect.left - (page.panX || 0)) / zoom;
    const dropY = (e.clientY - rect.top - (page.panY || 0)) / zoom;

    const itemType = inboxItem.type || 'url';

    if (itemType === 'text') {
      // Create sticky note
      page.miroCards.push({
        id: uid(), type: 'sticky',
        text: inboxItem.text || inboxItem.label || '',
        bg: '#ffe599',
        x: dropX - 100, y: dropY - 100,
        w: 200, h: 200
      });
    } else if (itemType === 'image') {
      // Create image element
      page.miroCards.push({
        id: uid(), type: 'image',
        imageUrl: inboxItem.data,
        label: inboxItem.label || 'Image',
        x: dropX - 150, y: dropY - 100,
        w: 300, h: 200
      });
    } else {
      // URL → bookmark card
      const url = inboxItem.url || '';
      page.miroCards.push({
        id: uid(), type: 'card',
        url: url,
        label: inboxItem.label || domainOf(url),
        x: dropX - 140, y: dropY - 120,
        w: 280, h: 240
      });
    }

    // Remove from inbox
    D.inbox = D.inbox.filter(x => x.id !== _dragInboxId);
    _dragInboxId = null;
    sv(); buildMiroCanvas(); buildOutline();
    if (typeof buildInbox === 'function') buildInbox();
  });
})();

// ─── Multi-Lock Button Logic (Smart Toggle) ───
(function () {
  const lockBtn = document.getElementById('miro-multi-lock');
  if (!lockBtn) return;

  lockBtn.addEventListener('mousedown', (e) => { e.stopPropagation(); });

  lockBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const page = cp();
    if (_miroSelected.size === 0) return;

    // Check if ALL selected are locked
    let allLocked = true;
    _miroSelected.forEach(cid => {
      const c = (page.miroCards || []).find(x => x.id === cid);
      if (c && !c.locked) allLocked = false;
    });

    if (allLocked) {
      // ALL locked → UNLOCK all
      _miroSelected.forEach(cid => {
        const c = (page.miroCards || []).find(x => x.id === cid);
        if (c) {
          c.locked = false;
          const el = document.querySelector(`[data-cid="${cid}"]`);
          if (el) el.classList.remove('is-locked');
        }
      });
      lockBtn.textContent = '🔒';
      sv();
      updateMiroSelFrame();
    } else {
      // Some unlocked → LOCK all
      _miroSelected.forEach(cid => {
        const c = (page.miroCards || []).find(x => x.id === cid);
        if (c) {
          c.locked = true;
          const el = document.querySelector(`[data-cid="${cid}"]`);
          if (el) el.classList.add('is-locked');
        }
      });
      lockBtn.textContent = '🔓';
      sv();
      clearMiroSelection();
    }
  });
})();

// ─── "+" More Tools Toggle ───
document.getElementById('mtb-more').onclick = () => {
  const panel = document.getElementById('mtb-more-panel');
  const btn = document.getElementById('mtb-more');
  panel.classList.toggle('show');
  btn.classList.toggle('sel', panel.classList.contains('show'));
};
document.getElementById('mtb-more-close').onclick = () => {
  document.getElementById('mtb-more-panel').classList.remove('show');
  document.getElementById('mtb-more').classList.remove('sel');
};

// ─── Google Calendar Widget ───
// State moved to miro-state.js
const CALENDAR_LIST_CACHE_MS = 5 * 60 * 1000; // 5 min cache

document.getElementById('mtb-calendar').onclick = async () => {
  // If no token, get one via popup (this is a direct user click, so popup won't be blocked)
  if (!_googleAccessToken) {
    if (window._authPopupInProgress) return;
    try {
      window._authPopupInProgress = true;
      if (typeof manualGoogleReAuth === 'function') {
        await manualGoogleReAuth();
      } else {
        const result = await auth.signInWithPopup(provider);
        if (result.credential) cacheGoogleToken(result.credential.accessToken);
      }
    } catch (e) {
      // Auth failed or cancelled
    } finally { window._authPopupInProgress = false; }
  }
  placeCalendarWidget();
};

async function placeCalendarWidget() {
  const page = cp();
  if (!page) return;
  const zoom = (page.zoom || 100) / 100;
  const panX = page.panX || 0, panY = page.panY || 0;
  const board = document.getElementById('miro-board');
  const rect = board.getBoundingClientRect();
  const cx = (-panX + (window.innerWidth / 2 - rect.left) / zoom);
  const cy = (-panY + (window.innerHeight / 2 - rect.top) / zoom);

  const card = {
    id: 'cal_' + Date.now(),
    type: 'calendar',
    x: cx - 350,
    y: cy - 250,
    w: 700,
    h: 500,
    calView: '3day',
    calOffset: 0, // week offset for navigation
  };

  if (!page.miroCards) page.miroCards = [];
  pushUndo();
  page.miroCards.push(card);
  sv();
  buildMiroCanvas();
  showToast('📅 Calendar widget added');
}

// ─── Gantt Chart Widget (Google Calendar) ───
document.getElementById('mtb-gantt').onclick = async () => {
  if (!_googleAccessToken) {
    if (window._authPopupInProgress) return;
    try {
      window._authPopupInProgress = true;
      if (typeof manualGoogleReAuth === 'function') {
        await manualGoogleReAuth();
      } else {
        const result = await auth.signInWithPopup(provider);
        if (result.credential) cacheGoogleToken(result.credential.accessToken);
      }
    } catch (e) { /* widget will show sign-in button */ }
    finally { window._authPopupInProgress = false; }
  }
  placeGanttWidget();
};

async function placeGanttWidget() {
  const page = cp();
  if (!page) return;
  const zoom = (page.zoom || 100) / 100;
  const panX = page.panX || 0, panY = page.panY || 0;
  const board = document.getElementById('miro-board');
  const rect = board.getBoundingClientRect();
  const cx = (-panX + (window.innerWidth / 2 - rect.left) / zoom);
  const cy = (-panY + (window.innerHeight / 2 - rect.top) / zoom);

  const card = {
    id: 'gantt_' + Date.now(),
    type: 'gantt',
    x: cx - 500,
    y: cy - 250,
    w: 1000,
    h: 500,
    calView: 'week',
    calOffset: 0,
    calTheme: 'light',
    ganttRowHeight: 50,
    ganttView: 'week', // week | 2week | month
  };

  if (!page.miroCards) page.miroCards = [];
  pushUndo();
  page.miroCards.push(card);
  sv();
  buildMiroCanvas();
  showToast('📊 Gantt chart added');
}

// ─── Render Gantt Content ───
async function renderGanttContent(el, card) {
  const body = el.querySelector('.gantt-body');
  if (!body) return;
  const now = new Date();
  const gv = card.ganttView || 'week';
  const days = gv === 'month' ? 30 : gv === '2week' ? 14 : 7;
  const offset = card.calOffset || 0;
  const rowH = card.ganttRowHeight || 50;
  const theme = card.calTheme || 'light';

  let startDate = new Date(now);
  startDate.setDate(now.getDate() - now.getDay() + offset);
  startDate.setHours(0, 0, 0, 0);
  const endDate = new Date(startDate);
  endDate.setDate(startDate.getDate() + days);

  const cacheKey = `sm_gantt_${startDate.toISOString().slice(0,10)}_${days}`;
  const _cache = evts => { try { localStorage.setItem(cacheKey, JSON.stringify(evts)); } catch(e) {} };
  const _getCached = () => { try { const d = localStorage.getItem(cacheKey); return d ? JSON.parse(d) : null; } catch(e) { return null; } };

  const cached = _getCached();
  if (cached && cached.length > 0) _drawGantt(body, el, card, cached, startDate, days, now, rowH, theme);

  let fresh = null, fetchErr = null;
  try { fresh = await fetchCalendarEvents(startDate, endDate); } catch(e) { fetchErr = e; }

  if (fresh) { _cache(fresh); _drawGantt(body, el, card, fresh, startDate, days, now, rowH, theme); }
  else if (!cached || cached.length === 0) {
    body.innerHTML = '';
    const d = document.createElement('div');
    d.style.cssText = 'text-align:center;padding:40px 20px;color:#aaa;font-size:.75rem;';
    if (fetchErr && fetchErr.needsAuth) {
      d.innerHTML = '🔑 Sign in to load Gantt';
      const b = document.createElement('button');
      b.className = 'cal-form-btn cal-form-btn-primary';
      b.style.cssText = 'margin-top:12px;font-size:.7rem;padding:6px 14px;';
      b.textContent = '🔐 Sign in';
      b.onclick = async (e) => { e.stopPropagation(); try { await manualGoogleReAuth(); renderGanttContent(el, card); } catch(er) {} };
      d.appendChild(document.createElement('br')); d.appendChild(b);
    } else {
      d.innerHTML = '⚠️ No events';
      const rb = document.createElement('button');
      rb.className = 'cal-form-btn cal-form-btn-primary';
      rb.style.cssText = 'margin-top:12px;'; rb.textContent = '🔄 Retry';
      rb.onclick = (e) => { e.stopPropagation(); renderGanttContent(el, card); };
      d.appendChild(document.createElement('br')); d.appendChild(rb);
    }
    body.appendChild(d);
  }
}

function _drawGantt(body, el, card, events, startDate, days, now, rowH, theme) {
  body.innerHTML = '';
  var _rfn = (el._ganttRender) ? el._ganttRender : function(){ _rfn(); };
  var isDark = theme !== 'light';
  var txt = isDark ? '#ddd' : '#222', mut = isDark ? '#999' : '#666';
  var ln = isDark ? 'rgba(255,255,255,.06)' : 'rgba(0,0,0,.08)';
  var rEven = isDark ? 'rgba(255,255,255,.025)' : 'rgba(0,0,0,.025)';
  var todBg = isDark ? 'rgba(108,143,255,.07)' : 'rgba(66,133,244,.07)';
  var hBg = isDark ? 'rgba(0,0,0,.3)' : 'rgba(0,0,0,.05)';
  var lBg = isDark ? 'rgba(0,0,0,.25)' : 'rgba(0,0,0,.04)';
  var dn = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  var mn = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  var sCols = ['#6366f1','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4'];
  var sBgs = sCols.map(function(c){return c+(isDark?'12':'0a');});
  var brkBg = isDark ? 'rgba(255,255,255,.03)' : 'rgba(0,0,0,.02)';
  var sNames = ['S1 \uD83C\uDF19 12am-4am','S2 \uD83C\uDF05 4am-8am','S3 \u2600\uFE0F 8am-12pm','S4 \uD83D\uDD25 12pm-4pm','S5 \uD83C\uDF07 4pm-8pm','S6 \uD83C\uDF03 8pm-12am'];
  var _ampm = function(h24){if(h24===0)return'12a';if(h24<12)return h24+'a';if(h24===12)return'12p';return(h24-12)+'p';};
  var bodyW = body.clientWidth||(card.w||900), bodyH = body.clientHeight||(card.h||500)-30;
  var labW = Math.min(90,Math.max(60,bodyW*0.1));
  var adW = Math.min(55,Math.max(35,bodyW*0.05));
  var slots=48, snap=100/48;
  var hdrH = 80;
  var fruitRH = 20;
  var _fitMode = !el._ganttScroll;
  var autoRH = _fitMode ? Math.max(18, Math.floor((bodyH - hdrH) / days) - fruitRH) : Math.max(32, Math.floor((bodyH - hdrH) / days));
  var nowH = now.getHours(), nowM = now.getMinutes(), nowSlot = nowH*2+Math.floor(nowM/30);
  var curSes = Math.floor(nowSlot/8), curFlt = Math.floor(nowSlot/4), curPomo = nowSlot;
  var pastBg = '#111', pastTx = '#fff', pastBdr = '1px solid rgba(255,255,255,.3)';
  var oneJan = new Date(now.getFullYear(),0,1);
  var weekNum = Math.ceil(((now-oneJan)/86400000+oneJan.getDay()+1)/7);
  var hijri = ''; try { hijri = now.toLocaleDateString('ar-SA-u-ca-islamic',{day:'numeric',month:'long',year:'numeric'}); } catch(e){}
  var greg = now.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'});

  // Helper: auto-contrast text color based on background luminance
  function _ganttTextColor(bg) {
    var m = bg.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i);
    if (!m) return '#fff';
    var lum = (parseInt(m[1],16)*299 + parseInt(m[2],16)*587 + parseInt(m[3],16)*114) / 1000;
    return lum > 160 ? '#1a1a1a' : '#fff';
  }

  var wrap = document.createElement('div');
  wrap.style.cssText = 'display:flex;flex-direction:column;height:100%;overflow-y:'+(_fitMode?'hidden':'auto')+';overflow-x:hidden;';

  // === SESSION ROW ===
  var sRow = document.createElement('div');
  sRow.style.cssText = 'display:flex;flex-shrink:0;height:26px;border-bottom:1px solid '+ln+';';
  var sLab = document.createElement('div');
  sLab.style.cssText = 'width:'+labW+'px;flex-shrink:0;font-size:.75rem;color:#6c8fff;display:flex;align-items:center;justify-content:center;border-right:1px solid '+ln+';background:'+lBg+';font-weight:700;';
  var sprintNum = Math.ceil(weekNum/2);
  sLab.innerHTML = '<div>W'+weekNum+'</div><div style="font-size:.5rem;opacity:.7">S'+sprintNum+'</div>';
  sRow.appendChild(sLab);
  var sTL = document.createElement('div');
  sTL.style.cssText = 'flex:1;display:flex;min-width:0;';
  for(var si=0;si<6;si++){
    var sc = document.createElement('div');
    var isCur = (si===curSes);
    var isPastS = (si<curSes);
    sc.style.cssText = 'flex:8;text-align:center;font-size:.7rem;color:'+(isPastS?pastTx:(isCur?'#fff':mut))+';background:'+(isPastS?pastBg:(isCur?sCols[si]+'88':sBgs[si]))+';border-left:'+(si?'2px solid '+(isDark?'rgba(255,255,255,.2)':'rgba(0,0,0,.2)'):'none')+';display:flex;align-items:center;justify-content:center;font-weight:'+(isCur?'700':'500')+';overflow:hidden;white-space:nowrap;min-width:0;letter-spacing:.3px;';
    if(isCur) sc.style.boxShadow = 'inset 0 0 12px '+sCols[si]+'66';
    if(isPastS && si>0) sc.style.borderLeft = '2px solid rgba(255,255,255,.4)';
    sc.textContent = sNames[si];
    sTL.appendChild(sc);
  }
  sRow.appendChild(sTL);
  var sAd = document.createElement('div');
  sAd.style.cssText = 'width:'+adW+'px;flex-shrink:0;border-left:1px solid '+ln+';';
  sRow.appendChild(sAd);
  wrap.appendChild(sRow);

  // === FLIGHT ROW ===
  var fRow = document.createElement('div');
  fRow.style.cssText = 'display:flex;flex-shrink:0;height:22px;border-bottom:1px solid '+ln+';';
  var fLab = document.createElement('div');
  fLab.style.cssText = 'width:'+labW+'px;flex-shrink:0;font-size:.6rem;color:'+mut+';display:flex;align-items:center;justify-content:center;border-right:1px solid '+ln+';background:'+lBg+';';
  fLab.textContent = greg;
  fRow.appendChild(fLab);
  var fTL = document.createElement('div');
  fTL.style.cssText = 'flex:1;display:flex;min-width:0;';
  for(var fi=0;fi<12;fi++){
    var sesI = Math.floor(fi/2);
    var isCurF = (fi===curFlt); var isPastF = (fi<curFlt);
    var brk = document.createElement('div');
    var isPastBr = (fi*4<curPomo);
    brk.style.cssText = 'flex:1;text-align:center;font-size:.55rem;color:'+(isPastBr?pastTx:(curPomo===fi*4?'#fff':mut))+';background:'+(isPastBr?pastBg:(curPomo===fi*4?'rgba(255,100,100,.5)':brkBg))+';border-left:'+(fi%2===0&&fi?'2px solid '+(isDark?'rgba(255,255,255,.15)':'rgba(0,0,0,.15)'):'1px solid '+ln)+';display:flex;align-items:center;justify-content:center;overflow:hidden;font-weight:600;';
    brk.textContent = 'Br';
    fTL.appendChild(brk);
    var flt = document.createElement('div');
    flt.style.cssText = 'flex:3;text-align:center;font-size:.6rem;color:'+(isPastF?pastTx:(isCurF&&curPomo!==fi*4?'#fff':mut))+';background:'+(isPastF?pastBg:(isCurF&&curPomo!==fi*4?sCols[sesI]+'55':sBgs[sesI]))+';border-left:1px dashed '+ln+';display:flex;align-items:center;justify-content:center;font-weight:'+(isCurF?'700':'500')+';overflow:hidden;white-space:nowrap;min-width:0;';
    if(isCurF&&curPomo!==fi*4) flt.style.boxShadow = 'inset 0 0 8px '+sCols[sesI]+'44';
    if(isPastF) { flt.style.borderLeft = '1px solid rgba(255,255,255,.3)'; }
    if(isPastBr) { brk.style.borderLeft = '1px solid rgba(255,255,255,.3)'; }
    flt.textContent = 'Fl '+(fi+1);
    fTL.appendChild(flt);
  }
  fRow.appendChild(fTL);
  var fAd = document.createElement('div');
  fAd.style.cssText = 'width:'+adW+'px;flex-shrink:0;border-left:1px solid '+ln+';';
  fRow.appendChild(fAd);
  wrap.appendChild(fRow);

  // === POMO ROW ===
  var pRow = document.createElement('div');
  pRow.style.cssText = 'display:flex;flex-shrink:0;height:24px;background:'+hBg+';border-bottom:1px solid '+ln+';';
  var pLab = document.createElement('div');
  pLab.style.cssText = 'width:'+labW+'px;flex-shrink:0;font-size:.55rem;color:'+mut+';display:flex;align-items:center;justify-content:center;border-right:1px solid '+ln+';background:'+lBg+';direction:rtl;overflow:hidden;padding:0 2px;';
  pLab.textContent = hijri||'';
  pRow.appendChild(pLab);
  var pTL = document.createElement('div');
  pTL.style.cssText = 'flex:1;display:flex;min-width:0;';
  for(var ps=0;ps<slots;ps++){
    var ph=Math.floor(ps/2), isCurP=(ps===curPomo);
    var isSes=(ps%8===0&&ps>0), isFlt2=(ps%4===0&&ps>0&&!isSes);
    var bdrL = isSes?'2px solid '+(isDark?'rgba(255,255,255,.2)':'rgba(0,0,0,.2)'):isFlt2?'1px solid '+(isDark?'rgba(255,255,255,.1)':'rgba(0,0,0,.1)'):'1px solid '+ln;
    var sesIdx=Math.floor(ps/8);
    var pc = document.createElement('div');
    var isPastP = (ps<curPomo);
    pc.style.cssText = 'flex:1;text-align:center;font-size:.6rem;color:'+(isPastP?pastTx:(isCurP?'#fff':mut))+';background:'+(isPastP?pastBg:(isCurP?'#ff4444aa':((ps%4===0)?brkBg:sBgs[sesIdx])))+';border-left:'+bdrL+';display:flex;align-items:center;justify-content:center;overflow:hidden;min-width:0;';
    if(isCurP){pc.style.fontWeight='700';pc.style.boxShadow='inset 0 0 10px rgba(255,68,68,.5)';}
    if(isPastP && ps>0) pc.style.borderLeft = '1px solid rgba(255,255,255,.25)';
    pc.textContent = ps%2===0?_ampm(ph):':30';
    pTL.appendChild(pc);
  }
  pRow.appendChild(pTL);
  var pAd = document.createElement('div');
  pAd.style.cssText = 'width:'+adW+'px;flex-shrink:0;font-size:.6rem;color:'+mut+';display:flex;align-items:center;justify-content:center;border-left:1px solid '+ln+';font-weight:600;';
  pAd.textContent = 'All';
  pRow.appendChild(pAd);
  wrap.appendChild(pRow);

  // === DAY ROWS ===
  for(var d=0;d<days;d++){ (function(d){
    var ds=new Date(startDate);ds.setDate(startDate.getDate()+d);ds.setHours(0,0,0,0);
    var de=new Date(ds);de.setDate(ds.getDate()+1);
    var dMs=ds.getTime(), isT=ds.toDateString()===now.toDateString();
    var row=document.createElement('div');
    row.style.cssText='display:flex;height:'+autoRH+'px;border-bottom:1px solid '+ln+';background:'+(isT?todBg:(d%2===0?rEven:'transparent'))+';flex-shrink:0;';
    var lab=document.createElement('div');
    lab.style.cssText='width:'+labW+'px;flex-shrink:0;display:flex;align-items:center;justify-content:center;flex-direction:column;font-size:.7rem;color:'+(isT?'#6c8fff':txt)+';font-weight:'+(isT?'700':'500')+';border-right:1px solid '+ln+';background:'+lBg+';gap:1px;';
    var _hij='';try{_hij=ds.toLocaleDateString('ar-SA-u-ca-islamic',{day:'numeric',month:'short'});}catch(e){}
    var _frDayCount=events.filter(function(ev){return (ev.calendarName||'').toLowerCase()==="!40's fruit"&&!ev.allDay&&new Date(ev.start).getTime()>=dMs&&new Date(ev.start).getTime()<de.getTime();}).length;
    lab.innerHTML='<span style="font-size:.7rem">'+dn[ds.getDay()]+' '+ds.getDate()+' '+mn[ds.getMonth()]+'</span><span style="font-size:.55rem;color:#10b981;font-weight:700;direction:rtl">'+_hij+'</span><span style="font-size:.6rem;color:'+((_frDayCount>=16)?'#10b981':'#f59e0b')+';font-weight:700">\uD83C\uDF4E '+_frDayCount+'/16</span>';
    row.appendChild(lab);
    var tc=document.createElement('div');
    tc.style.cssText='flex:1;position:relative;overflow:hidden;min-width:0;';
    tc.dataset.dayIdx=d;tc.dataset.dayMs=dMs;
    for(var gs=0;gs<slots;gs++){
      var gS=Math.floor(gs/8),gIsSes=(gs%8===0&&gs>0),gIsFlt=(gs%4===0&&gs>0&&!gIsSes);
      var bg=document.createElement('div');
      bg.style.cssText='position:absolute;left:'+(gs/slots*100)+'%;width:'+(1/slots*100)+'%;top:0;bottom:0;pointer-events:none;background:'+((gs%4===0)?brkBg:sBgs[gS])+';';
      if(gIsSes)bg.style.borderLeft='2px solid '+(isDark?'rgba(255,255,255,.18)':'rgba(0,0,0,.18)');
      else if(gIsFlt)bg.style.borderLeft='1px solid '+(isDark?'rgba(255,255,255,.1)':'rgba(0,0,0,.1)');
      else if(gs>0&&gs%2===0)bg.style.borderLeft='1px solid '+ln;
      else if(gs>0)bg.style.borderLeft='1px dashed '+(isDark?'rgba(255,255,255,.03)':'rgba(0,0,0,.03)');
      tc.appendChild(bg);
    }
    var dEvts=events.filter(function(ev){if(ev.allDay)return false;if((ev.calendarName||'').toLowerCase()==="!40's fruit")return false;var s=new Date(ev.start).getTime(),e=new Date(ev.end).getTime();return s<de.getTime()&&e>dMs&&(e-s)<86400000;});
    var lanes=[];dEvts.sort(function(a,b){return new Date(a.start)-new Date(b.start);});
    var placed=dEvts.map(function(ev){var s=Math.max(new Date(ev.start).getTime(),dMs),e=Math.min(new Date(ev.end).getTime(),de.getTime());s=Math.floor(s/60000)*60000;e=Math.floor(e/60000)*60000;var la=0;for(var l=0;l<lanes.length;l++){if(lanes[l]<=s){la=l;break;}la=l+1;}if(la>=lanes.length)lanes.push(0);lanes[la]=e;return{ev:ev,es:s,ee:e,lane:la};});
    var tL=Math.max(1,lanes.length),bH=Math.max(10,Math.floor((autoRH-2)/tL)-1);
    placed.forEach(function(p){
      var ev=p.ev,es=p.es,ee=p.ee,la=p.lane;
      var lP=((es-dMs)/86400000)*100,wP=Math.max(.5,((ee-es)/86400000)*100),tP=1+la*(bH+1);
      var bar=document.createElement('div');bar.className='gantt-event';
      var _barColor = ev.color||'#4285f4';
      var _barTxt = _ganttTextColor(_barColor);
      bar.style.cssText='position:absolute;left:'+lP+'%;width:'+wP+'%;height:'+bH+'px;top:'+tP+'px;background:'+_barColor+';border-radius:3px;font-size:'+Math.min(.75,Math.max(.4,bH/18))+'rem;color:'+_barTxt+';padding:0 3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:grab;display:flex;align-items:center;box-shadow:0 1px 3px rgba(0,0,0,.3);z-index:2;font-weight:500;';
      var eS=new Date(ev.start),eE=new Date(ev.end);
      var fm=function(t){return t.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});};
      bar.title=ev.summary+'\n'+fm(eS)+' \u2014 '+fm(eE)+'\n'+ev.calendarName;bar.textContent=ev.summary||'';
      bar.addEventListener('click',function(e2){if(bar._dr){bar._dr=false;return;}e2.stopPropagation();if(typeof showCalendarEventForm==='function')showCalendarEventForm(body,el,card,{mode:'edit',calendarId:ev.calendarId,eventId:ev.id,summary:ev.summary,description:ev.description,startTime:eS,endTime:eE});});
      bar.addEventListener('mousedown',function(e3){if(e3.button!==0)return;e3.stopPropagation();e3.preventDefault();bar._dr=false;var sx=e3.clientX,sy=e3.clientY,tcR=tc.getBoundingClientRect(),tcW=tcR.width;var oL=parseFloat(bar.style.left),oW=parseFloat(bar.style.width),oDMs=dMs;var tip=document.createElement('div');tip.style.cssText='position:fixed;padding:4px 10px;background:rgba(0,0,0,.9);color:#fff;border-radius:6px;font-size:.75rem;z-index:99999;pointer-events:none;font-family:var(--font);white-space:nowrap;';document.body.appendChild(tip);bar.style.cursor='grabbing';bar.style.zIndex='100';bar.style.opacity='.8';var tT=function(pc2){var m=Math.round(pc2/100*1440),h=Math.floor(m/60),mi=m%60,ap=h>=12?'pm':'am';h=h%12||12;return h+':'+String(mi).padStart(2,'0')+ap;};var cDMs=oDMs;
      var onM=function(mv){bar._dr=true;var dx=mv.clientX-sx;var nl=oL+(dx/tcW)*100;var _sn=mv.ctrlKey?(100/1440):mv.altKey?(snap/2):snap;nl=Math.round(nl/_sn)*_sn;if(nl<0)nl=0;if(nl+oW>100)nl=100-oW;bar.style.left=nl+'%';var rows=wrap.querySelectorAll('[data-day-ms]');for(var i=0;i<rows.length;i++){var rr=rows[i].getBoundingClientRect();if(mv.clientY>=rr.top&&mv.clientY<rr.bottom){cDMs=parseInt(rows[i].dataset.dayMs);break;}}tip.textContent=tT(nl)+' \u2014 '+tT(nl+oW);tip.style.left=(mv.clientX+12)+'px';tip.style.top=(mv.clientY-22)+'px';};
      var onU=function(){document.removeEventListener('mousemove',onM);document.removeEventListener('mouseup',onU);tip.remove();bar.style.cursor='grab';bar.style.opacity='1';if(!bar._dr)return;var fl=parseFloat(bar.style.left),dur=ee-es;var nS=new Date(cDMs+(fl/100)*86400000),nE=new Date(nS.getTime()+dur);nS.setSeconds(0,0);nE.setSeconds(0,0);nS.setMinutes(Math.round(nS.getMinutes()/5)*5);nE.setMinutes(Math.round(nE.getMinutes()/5)*5);console.log('[Drag] Moving',ev.summary,'to',nS.toISOString(),'->',nE.toISOString(),'cal:',ev.calendarId);if(nE<=nS)return;bar.style.opacity='.4';updateCalendarEvent(ev.calendarId,ev.id,{summary:ev.summary,start:nS,end:nE}).then(function(){showToast('\u2705 Moved');_rfn();}).catch(function(er){showToast('\u274C '+er.message);_rfn();});};
      document.addEventListener('mousemove',onM);document.addEventListener('mouseup',onU);});
      ['left','right'].forEach(function(side){var h=document.createElement('div');h.style.cssText='position:absolute;top:0;'+side+':0;width:6px;height:100%;cursor:col-resize;z-index:6;';h.addEventListener('mousedown',function(e4){e4.stopPropagation();e4.preventDefault();var sx2=e4.clientX,tcR2=tc.getBoundingClientRect(),tcW2=tcR2.width,oL2=parseFloat(bar.style.left),oW2=parseFloat(bar.style.width);var tip2=document.createElement('div');tip2.style.cssText='position:fixed;padding:4px 10px;background:rgba(0,0,0,.9);color:#fff;border-radius:6px;font-size:.75rem;z-index:99999;pointer-events:none;font-family:var(--font);white-space:nowrap;';document.body.appendChild(tip2);var tT2=function(pc2){var m=Math.round(pc2/100*1440),h=Math.floor(m/60),mi=m%60,ap=h>=12?'pm':'am';h=h%12||12;return h+':'+String(mi).padStart(2,'0')+ap;};
      var onM2=function(mv){var nl2=side==='left'?oL2+((mv.clientX-sx2)/tcW2)*100:oL2;var nw2=side==='left'?oW2-((mv.clientX-sx2)/tcW2)*100:oW2+((mv.clientX-sx2)/tcW2)*100;nl2=Math.round(nl2/snap)*snap;nw2=Math.max(snap,Math.round(nw2/snap)*snap);if(nl2<0)nl2=0;if(nl2+nw2>100)nw2=100-nl2;bar.style.left=nl2+'%';bar.style.width=nw2+'%';tip2.textContent=tT2(nl2)+' \u2014 '+tT2(nl2+nw2);tip2.style.left=(mv.clientX+12)+'px';tip2.style.top=(mv.clientY-22)+'px';};
      var onU2=function(){document.removeEventListener('mousemove',onM2);document.removeEventListener('mouseup',onU2);tip2.remove();var fl2=parseFloat(bar.style.left),fw2=parseFloat(bar.style.width);var nS2=new Date(dMs+(fl2/100)*86400000),nE2=new Date(dMs+((fl2+fw2)/100)*86400000);nS2.setSeconds(0,0);nE2.setSeconds(0,0);nS2.setMinutes(Math.round(nS2.getMinutes()/5)*5);nE2.setMinutes(Math.round(nE2.getMinutes()/5)*5);console.log('[Resize]',ev.summary,'to',nS2.toISOString(),'->',nE2.toISOString());if(nE2<=nS2)return;bar.style.opacity='.5';updateCalendarEvent(ev.calendarId,ev.id,{summary:ev.summary,start:nS2,end:nE2}).then(function(){showToast('\u2705 Updated');_rfn();}).catch(function(er){showToast('\u274C '+er.message);_rfn();});};
      document.addEventListener('mousemove',onM2);document.addEventListener('mouseup',onU2);});bar.appendChild(h);});
      tc.appendChild(bar);
    });
    tc.addEventListener('mousedown',function(eD){if(eD.button!==0||eD.target.closest('.gantt-event'))return;eD.stopPropagation();eD.preventDefault();var tcR3=tc.getBoundingClientRect(),tcW3=tcR3.width;var sP=((eD.clientX-tcR3.left)/tcW3)*100;sP=Math.round(sP/snap)*snap;sP=Math.max(0,sP);var pv=document.createElement('div');pv.style.cssText='position:absolute;top:0;bottom:0;background:rgba(108,143,255,.25);border:1px solid rgba(108,143,255,.5);border-radius:3px;z-index:3;pointer-events:none;';pv.style.left=sP+'%';pv.style.width=snap+'%';tc.appendChild(pv);var tip3=document.createElement('div');tip3.style.cssText='position:fixed;padding:4px 10px;background:rgba(0,0,0,.9);color:#fff;border-radius:6px;font-size:.75rem;z-index:99999;pointer-events:none;font-family:var(--font);white-space:nowrap;';document.body.appendChild(tip3);var tT3=function(pc2){var m=Math.round(pc2/100*1440),h=Math.floor(m/60),mi=m%60,ap=h>=12?'pm':'am';h=h%12||12;return h+':'+String(mi).padStart(2,'0')+ap;};var cE=sP+snap;tip3.textContent=tT3(sP)+' \u2014 '+tT3(cE);tip3.style.left=(eD.clientX+12)+'px';tip3.style.top=(eD.clientY-22)+'px';var myDMs=parseInt(tc.dataset.dayMs);
    var onM3=function(mv){var eP=((mv.clientX-tcR3.left)/tcW3)*100;var _csn=mv.ctrlKey?(100/1440):mv.altKey?(snap/2):snap;eP=Math.round(eP/_csn)*_csn;if(eP<_csn)eP=_csn;var l=Math.min(sP,eP),r=Math.max(sP,eP);if(r-l<snap)r=l+snap;pv.style.left=l+'%';pv.style.width=(r-l)+'%';cE=r;tip3.textContent=tT3(l)+' \u2014 '+tT3(r);tip3.style.left=(mv.clientX+12)+'px';tip3.style.top=(mv.clientY-22)+'px';};
    var onU3=function(){document.removeEventListener('mousemove',onM3);document.removeEventListener('mouseup',onU3);var l3=parseFloat(pv.style.left),w3=parseFloat(pv.style.width);pv.remove();tip3.remove();var sT=new Date(myDMs+(l3/100)*86400000),eT=new Date(myDMs+((l3+w3)/100)*86400000);sT.setMinutes(Math.round(sT.getMinutes()/30)*30,0,0);eT.setMinutes(Math.round(eT.getMinutes()/30)*30,0,0);if(eT<=sT)eT=new Date(sT.getTime()+1800000);if(typeof showCalendarEventForm==='function')showCalendarEventForm(body,el,card,{mode:'create',startTime:sT,endTime:eT});};
    document.addEventListener('mousemove',onM3);document.addEventListener('mouseup',onU3);});
    if(isT){var nP=((now.getHours()*60+now.getMinutes())/1440)*100;var nl2=document.createElement('div');nl2.style.cssText='position:absolute;left:'+nP+'%;top:0;bottom:0;width:2px;background:#ff4444;z-index:4;pointer-events:none;box-shadow:0 0 6px #ff4444;';tc.appendChild(nl2);}
    row.appendChild(tc);
    var adc=document.createElement('div');adc.style.cssText='width:'+adW+'px;flex-shrink:0;border-left:1px solid '+ln+';display:flex;flex-direction:column;gap:1px;padding:1px;overflow:hidden;align-items:stretch;justify-content:center;';
    events.filter(function(v){if(v.allDay){var s2=new Date(v.start).getTime();return s2>=dMs&&s2<de.getTime();}var s3=new Date(v.start).getTime(),e3=new Date(v.end).getTime();return s3<de.getTime()&&e3>dMs&&(e3-s3)>=86400000;}).forEach(function(v){var ch=document.createElement('div');var _adcColor=v.color||'#4285f4';var _adcTxt=_ganttTextColor(_adcColor);ch.style.cssText='background:'+_adcColor+';color:'+_adcTxt+';font-size:.45rem;border-radius:2px;padding:0 2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:pointer;min-height:8px;display:flex;align-items:center;';ch.title=v.summary;ch.textContent=v.summary||'\u2022';ch.onclick=function(e2){e2.stopPropagation();if(typeof showCalendarEventForm==='function')showCalendarEventForm(body,el,card,{mode:'edit',calendarId:v.calendarId,eventId:v.id,summary:v.summary,description:v.description,startTime:new Date(v.start),endTime:new Date(v.end)});};adc.appendChild(ch);});
    row.appendChild(adc);wrap.appendChild(row);
    // === FRUIT CHECKBOX ROW ===
    var frRow=document.createElement('div');
    frRow.style.cssText='display:flex;height:'+fruitRH+'px;border-bottom:2px solid '+(isDark?'rgba(255,255,255,.15)':'rgba(0,0,0,.18)')+';flex-shrink:0;';
    var frLab2=document.createElement('div');
    frLab2.style.cssText='width:'+labW+'px;flex-shrink:0;border-right:1px solid '+ln+';background:'+lBg+';';
    frRow.appendChild(frLab2);
    var frTL=document.createElement('div');
    frTL.style.cssText='flex:1;display:flex;min-width:0;position:relative;';
    frTL._dayMs=dMs;
    var frSlotMap={};
    var fruitDayEvts=events.filter(function(ev){return (ev.calendarName||'').toLowerCase()==="!40's fruit"&&!ev.allDay&&new Date(ev.start).getTime()>=dMs&&new Date(ev.start).getTime()<de.getTime();});
    fruitDayEvts.forEach(function(ev){var s=new Date(ev.start).getTime(),e=new Date(ev.end).getTime();var ss=Math.floor((s-dMs)/1800000),se=Math.ceil((e-dMs)/1800000);for(var x=ss;x<se&&x<48;x++){if(x>=0){if(!frSlotMap[x])frSlotMap[x]=[];frSlotMap[x].push(ev);}}});
    var _uncBg=isDark?'transparent':'rgba(0,0,0,.02)';
    var _cbEls=[];
    for(var fs=0;fs<48;fs++){(function(fs){
      var slotEvs=frSlotMap[fs]||[];
      var isChk=slotEvs.length>0;
      var cb=document.createElement('div');
      cb._fs=fs;cb._isChk=isChk;cb._slotEvs=slotEvs;cb._dMs=dMs;
      var isSes=(fs%8===0&&fs>0),isFlt=(fs%4===0&&fs>0&&!isSes);
      var bdrL=isSes?'2px solid '+(isDark?'rgba(255,255,255,.2)':'rgba(0,0,0,.2)'):isFlt?'1px solid '+(isDark?'rgba(255,255,255,.1)':'rgba(0,0,0,.1)'):(fs>0?'1px solid '+(isDark?'rgba(255,255,255,.04)':'rgba(0,0,0,.05)'):'none');
      cb.style.cssText='flex:1;border-left:'+bdrL+';background:'+(isChk?'transparent':_uncBg)+';cursor:pointer;transition:background .12s;display:flex;align-items:center;justify-content:center;font-size:'+(fruitRH*0.7)+'px;line-height:1;overflow:hidden;';
      if(isChk)cb.textContent='\uD83C\uDF4E';
      cb.title=(isChk?'\u2705':'\u2B1C')+' '+Math.floor(fs/2)+':'+(fs%2===0?'00':'30');
      _cbEls.push(cb);
      frTL.appendChild(cb);
    })(fs);}
    // Drag-select support
    (function(frTL,_cbEls,_uncBg,dMs,_rfn){
      var dragging=false,dragMode=null,touched=[];
      frTL.addEventListener('mousedown',function(eD){
        eD.preventDefault();eD.stopPropagation();
        var tgt=eD.target;if(!tgt._fs&&tgt._fs!==0)return;
        dragging=true;dragMode=tgt._isChk?'remove':'add';touched=[tgt._fs];
        tgt.style.background=dragMode==='add'?'rgba(16,185,129,.5)':'rgba(239,68,68,.4)';
      });
      frTL.addEventListener('mousemove',function(eM){
        if(!dragging)return;
        var tgt=eM.target;if(!tgt._fs&&tgt._fs!==0)return;
        if(touched.indexOf(tgt._fs)===-1){
          touched.push(tgt._fs);
          tgt.style.background=dragMode==='add'?'rgba(16,185,129,.5)':'rgba(239,68,68,.4)';
        }
      });
      var onUp=function(){
        if(!dragging)return;
        dragging=false;
        if(touched.length===0)return;
        if(dragMode==='add'){
          getCalendarList().then(function(cals){
            var frCal=cals.find(function(c){return c.summary.toLowerCase()==="!40's fruit";});
            if(!frCal){showToast('\u274C Fruit calendar not found');return;}
            var p=[];
            touched.forEach(function(fs){
              var cb=_cbEls[fs];
              if(!cb._isChk){
                p.push(createCalendarEvent(frCal.id,"!40's Fruit",new Date(dMs+fs*1800000),new Date(dMs+(fs+1)*1800000),''));
              }
            });
            if(p.length===0)return;
            Promise.all(p).then(function(){showToast('\u2705 '+p.length+' fruit logged');_rfn();}).catch(function(er){showToast('\u274C '+er.message);_rfn();});
          });
        } else {
          var p2=[];
          touched.forEach(function(fs){
            var cb=_cbEls[fs];
            if(cb._isChk&&cb._slotEvs.length>0){
              p2.push(deleteCalendarEvent(cb._slotEvs[0].calendarId,cb._slotEvs[0].id));
            }
          });
          if(p2.length===0)return;
          Promise.all(p2).then(function(){showToast('\u2705 '+p2.length+' fruit removed');_rfn();}).catch(function(er){showToast('\u274C '+er.message);_rfn();});
        }
      };
      frTL.addEventListener('mouseup',onUp);
      document.addEventListener('mouseup',function(){if(dragging)onUp();});
    })(frTL,_cbEls,_uncBg,dMs,_rfn);
    frRow.appendChild(frTL);
    var frAd=document.createElement('div');
    frAd.style.cssText='width:'+adW+'px;flex-shrink:0;border-left:1px solid '+ln+';';
    frRow.appendChild(frAd);
    wrap.appendChild(frRow);
  })(d); }
  body.appendChild(wrap);
}



window.renderZooperDayCard = function(container, dayDate, options) {
  options = options || {};
  var isDk = options.theme !== 'light';
  var txt = isDk ? '#ddd' : '#222';
  var bg2 = isDk ? 'rgba(255,255,255,.03)' : 'rgba(0,0,0,.02)';
  var bdr = isDk ? 'rgba(255,255,255,.08)' : 'rgba(0,0,0,.08)';
  var CS = options.CS || 14;
  var DW = options.DW || 2;
  var CSbig = options.CSbig || 28;
  
  var now = new Date();
  var todayD = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  var dayMs = new Date(dayDate.getFullYear(), dayDate.getMonth(), dayDate.getDate()).getTime();
  var dayEnd2 = dayMs + 86400000;
  var isToday = (dayDate.toDateString() === now.toDateString());
  var isFuture = dayMs > todayD.getTime();
  var cSize = isToday ? CSbig : CS;
  
  var dn = ['Su','Mo','Tu','We','Th','Fr','Sa'];
  var sessions = [{start:0},{start:4},{start:8},{start:12},{start:16},{start:20}];
  var sessTips = ['\u062b\u0644\u062b \u0627\u0644\u0644\u064a\u0644 \u0627\u0644\u0622\u062e\u0631','\u062b\u0644\u062b \u0627\u0644\u0646\u0647\u0627\u0631 \u0627\u0644\u0623\u0648\u0644 (\u0648\u0642\u0631\u0622\u0646 \u0627\u0644\u0641\u062c\u0631)','','','',''];
  var LAYOUT = [{slot:0,fl:1},{slot:1,fl:1},{slot:2,fl:1},{type:'gap',fl:1},{slot:3,fl:1},{type:'div'},{slot:4,fl:2},{type:'gap',fl:2},{slot:5,fl:2},{slot:6,fl:2},{slot:7,fl:2}];
  
  function hijriDay(d){try{return new Intl.DateTimeFormat('en-u-ca-islamic-umalqura',{day:'numeric'}).format(d);}catch(e){return '';}}
  function fmtTime(mn){var h=Math.floor(mn/60),m=mn%60;return((h%12)||12)+':'+(m<10?'0':'')+m+(h<12?'am':'pm');}
  
  var dayEvts = (options.evts || []).filter(function(e) {
    if (e.allDay) return false;
    var es = new Date(e.start).getTime();
    var ee = new Date(e.end || e.start).getTime();
    return es < dayEnd2 && ee > dayMs;
  });
  
  var frSlotMap = {};
  dayEvts.filter(function(e){return(e.calendarName||'').toLowerCase()==="!40's fruit";}).forEach(function(ev){var s2=new Date(ev.start).getTime(),e2=new Date(ev.end).getTime();var ss=Math.floor((s2-dayMs)/1800000),se=Math.ceil((e2-dayMs)/1800000);for(var x=ss;x<se&&x<48;x++){if(x>=0){if(!frSlotMap[x])frSlotMap[x]=[];frSlotMap[x].push(ev);}}});
  
  function hasZS(sess,slots){for(var fi=0;fi<slots.length;fi++){var sm=(sess.start*60)+(slots[fi]*30),sx=sm+30;for(var ei=0;ei<dayEvts.length;ei++){var cn=(dayEvts[ei].calendarName||'').toLowerCase();if(cn!=='03g'&&cn!=='04g2')continue;var esM=new Date(dayEvts[ei].start).getHours()*60+new Date(dayEvts[ei].start).getMinutes();var eeM=new Date(dayEvts[ei].end).getHours()*60+new Date(dayEvts[ei].end).getMinutes();if(eeM===0)eeM=1440;if(esM<sx&&eeM>sm)return true;}}return false;}
  
  var dayFruitCount=0;for(var fk=0;fk<48;fk++){if((frSlotMap[fk]||[]).length>0)dayFruitCount++;}
  var bananaCount=0;for(var bsi=0;bsi<6;bsi++){if(hasZS(sessions[bsi],[0,1,2,3]))bananaCount++;if(hasZS(sessions[bsi],[4,5,6,7]))bananaCount++;}
  
  var card=document.createElement('div');
  card.className = 'zooper-day-card';
  card.style.cssText='display:inline-flex;flex-direction:column;flex-shrink:0;border:1px solid '+(isToday?'#4285f4':bdr)+';border-radius:3px;'+(isToday?'box-shadow:0 0 6px rgba(66,133,244,.4);':'');
  
  var hdr=document.createElement('div');hdr.style.cssText='display:flex;align-items:center;justify-content:space-between;padding:0 1px;border-bottom:1px solid '+bdr+';height:'+(isToday?28:20)+'px;flex-shrink:0;gap:0;';
  var hL=document.createElement('span');hL.style.cssText='font-size:'+(isToday?'.7rem':'.55rem')+';font-weight:900;color:'+(isToday?'#4285f4':(isDk?'#ddd':'#111'))+';white-space:nowrap;line-height:1;';hL.textContent=dayDate.getDate()+dn[dayDate.getDay()];
  var hM=document.createElement('span');hM.style.cssText='font-size:'+(isToday?'.55rem':'.42rem')+';font-weight:700;display:flex;gap:2px;line-height:1;';
  var sa=document.createElement('span');sa.style.cssText='color:'+(dayFruitCount>0?'#e74c3c':'rgba(128,128,128,.3)')+';';sa.textContent='\uD83C\uDF4E'+dayFruitCount;
  var sb=document.createElement('span');sb.style.cssText='color:'+(bananaCount>0?'#f1c40f':'rgba(128,128,128,.3)')+';';sb.textContent='\uD83C\uDF4C'+bananaCount;
  hM.appendChild(sa);hM.appendChild(sb);
  var hR=document.createElement('span');hR.style.cssText='font-size:'+(isToday?'.6rem':'.48rem')+';font-weight:800;color:#27ae60;line-height:1;';hR.textContent=hijriDay(dayDate);
  hdr.appendChild(hL);hdr.appendChild(hM);hdr.appendChild(hR);card.appendChild(hdr);
  
  var allCells=[];
  var planSlotMap={};
  var dayPlanEvts=(options.planEvents||[]).filter(function(ev){
    var s=ev.start||ev._meta&&ev._meta.start;
    if(!s)return false;
    var e=ev.end||ev._meta&&ev._meta.end||s;
    var st=new Date(s).getTime();
    var et=new Date(e).getTime();
    return st<dayEnd2 && et>dayMs;
  });
  dayPlanEvts.forEach(function(ev){var s2=new Date(ev.start||ev._meta&&ev._meta.start).getTime(),e2=new Date(ev.end||ev._meta&&ev._meta.end||s2+1800000).getTime();var ss=Math.floor((s2-dayMs)/1800000),se=Math.ceil((e2-dayMs)/1800000);for(var x=ss;x<se&&x<48;x++){if(x>=0){if(!planSlotMap[x])planSlotMap[x]=[];planSlotMap[x].push(ev);}}});
  
  var fruitCalId = options.fruitCalId || '';
  var planCalId = options.planCalId || null;
  
  for(var si=0;si<6;si++){
    var sess=sessions[si],f1z=hasZS(sess,[0,1,2,3]),f2z=hasZS(sess,[4,5,6,7]),sessOK=f1z&&f2z,isSpec=(si===0||si===1);
    var sessClr=sessOK?'#27ae60':(isDk?'rgba(255,255,255,.12)':'rgba(0,0,0,.1)');
    var sr=document.createElement('div');sr.style.cssText='display:flex;align-items:stretch;height:'+cSize+'px;flex-shrink:0;outline:1px solid '+sessClr+';outline-offset:-1px;position:relative;'+(sessOK||isSpec?'background:rgba(39,174,96,'+(sessOK?'.06':'.08')+');':'');
    if(sessTips[si])sr.title=sessTips[si];
    
    LAYOUT.forEach(function(lc){
      if(lc.type==='div'){sr.appendChild(Object.assign(document.createElement('div'),{style:{cssText:'width:'+DW+'px;flex-shrink:0;background:'+(sessOK?'rgba(39,174,96,.2)':bdr)+';'}}));return;}
      if(lc.type==='gap'){var fz=lc.fl===1?f1z:f2z;var gp=document.createElement('div');gp.style.cssText='width:'+cSize+'px;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:'+(Math.max(6,cSize-4))+'px;pointer-events:none;';if(fz)gp.textContent='\uD83C\uDF4C';sr.appendChild(gp);return;}
      
      var sIS=lc.slot,absSlot=si*8+sIS,sMn=(sess.start*60)+(sIS*30),eMn=sMn+30;
      var sD=new Date(dayMs+sMn*60000),eD=new Date(dayMs+eMn*60000);
      var h1v=Math.floor(sMn/60),m1=sMn%60;
      var sEvts=dayEvts.filter(function(e2){
        if((e2.calendarName||'').toLowerCase()==="!40's fruit")return false;
        if((e2.calendarName||'').toLowerCase()==='00aplan')return false;
        var esM=new Date(e2.start).getHours()*60+new Date(e2.start).getMinutes();
        var eeM=new Date(e2.end).getHours()*60+new Date(e2.end).getMinutes();
        if(eeM===0)eeM=1440;
        return esM<eMn&&eeM>sMn;
      });
      var cBg=sEvts.length>0?(sEvts[0].color||'#4285f4'):'transparent';
      var isNow=false;if(isToday){var nM=now.getHours()*60+now.getMinutes();if(nM>=sMn&&nM<eMn)isNow=true;}
      var hFr=(frSlotMap[absSlot]||[]).length>0;var isBr=(lc.slot===3||lc.slot===4);
      var planCellEvts=planSlotMap[absSlot]||[];
      
      var tipText=isSpec?sessTips[si]:(fmtTime(sMn)+'-'+fmtTime(eMn));
      if(sEvts.length>0)tipText=sEvts.map(function(e2){return(e2.summary||'')+' '+fmtTime(sMn)+'-'+fmtTime(eMn);}).join('\n');
      if(hFr)tipText+=(' \uD83C\uDF4E');
      if(planCellEvts.length>0)tipText+=('\n\u2705 '+planCellEvts.map(function(pe){return pe.summary||'';}).join(', '));
      
      var ec=document.createElement('div');ec.className='pomo-ev';
      ec.title=tipText;
      ec.style.cssText='width:'+cSize+'px;flex-shrink:0;position:relative;background:'+(cBg!=='transparent'?cBg:(isBr?'rgba(128,128,128,.06)':bg2))+';cursor:pointer;border-right:1px solid '+(isDk?'rgba(255,255,255,.06)':'rgba(0,0,0,.06)')+';display:flex;flex-direction:column;align-items:center;justify-content:center;overflow:hidden;'+(isNow?'outline:2px solid #ff6b35;outline-offset:-1px;animation:pomoPulse 1.5s infinite;z-index:1;':'');
      
      if(hFr){var frS=document.createElement('span');frS.style.cssText='font-size:'+(Math.max(5,cSize-6))+'px;pointer-events:none;line-height:1;';frS.textContent='\uD83C\uDF4E';ec.appendChild(frS);}
      
      if(planCellEvts.length>0){
        planCellEvts.forEach(function(pev){
          var isDonePlan=pev.isDone||(pev.summary||'').toLowerCase().indexOf('done')!==-1;
          var pcb=document.createElement('span');
          pcb.style.cssText='font-size:'+(Math.max(5,Math.min(cSize-4,10)))+'px;line-height:1;cursor:pointer;z-index:2;';
          pcb.textContent=isDonePlan?'\u2611':'\u2610';
          pcb.title=(pev.summary||'(task)')+' '+(isDonePlan?'[DONE]':'');
          (function(pev,pcb,isDonePlan){
            pcb.addEventListener('click',function(ev3){
              ev3.stopPropagation();ev3.preventDefault();
              if(!planCalId)return;
              pcb.style.opacity='.4';
              togglePlanTaskDone(planCalId,pev.id,!isDonePlan).then(function(){
                showToast(isDonePlan?'\u23EA Unmarked':'\u2705 Done!');
                if (options.onRefresh) options.onRefresh();
              }).catch(function(er){showToast('\u274C '+er.message);pcb.style.opacity='1';});
            });
          })(pev,pcb,isDonePlan);
          ec.appendChild(pcb);
        });
      }
      else if(!hFr&&sEvts.length===0){var tl=document.createElement('span');tl.style.cssText='font-size:'+Math.min(cSize-2,10)+'px;color:'+(isDk?'rgba(255,255,255,.25)':'rgba(0,0,0,.2)')+';font-weight:'+(m1===0?'700':'400')+';pointer-events:none;';tl.textContent=m1===0?String((h1v%12)||12):'30';ec.appendChild(tl);}
      
      (function(ec,se,sd,ed,as,hf,fsm,fci,smn,emn){
        ec.addEventListener('click',function(ev2){ev2.stopPropagation();
          if(ev2.shiftKey){
            if(!planCalId){showToast('\u274C Tasks list "00aplan" not found');return;}
            var fi=document.createElement('input');fi.type='file';fi.accept='image/*';fi.style.display='none';
            fi.onchange=function(){var f=fi.files[0];if(!f)return;var rd=new FileReader();rd.onload=function(re){
              showToast('\u23F3 Uploading image...');
              uploadToImgBB(re.target.result).then(function(url){
                if(!url){showToast('\u274C Upload failed');return;}
                createPlanTask(planCalId,'\uD83D\uDDBC '+fmtTime(smn)+'-'+fmtTime(emn),sd,ed,{sticky:{x:10,y:10,w:200,h:150,color:'white'},imageUrl:url}).then(function(){
                  showToast('\u2705 Image added');if (options.onRefresh) options.onRefresh();
                }).catch(function(er){showToast('\u274C '+er.message);});
              });
            };rd.readAsDataURL(f);};fi.click();
            return;
          }
          if(ev2.altKey){
            if(!planCalId){showToast('\u274C Tasks list "00aplan" not found');return;}
            var defName=se.length>0?(se[0].summary||''):'';
            var taskName=prompt('Todo for '+fmtTime(smn)+'-'+fmtTime(emn)+':',defName);
            if(taskName&&taskName.trim()){
              createPlanTask(planCalId,taskName.trim(),sd,ed).then(function(created){
                if (options.planEvents) {
                  options.planEvents.push({id:created.id||'temp',summary:taskName.trim(),start:sd.toISOString(),end:ed.toISOString(),calendarName:'00aplan',taskListId:planCalId,isDone:false,_meta:{start:sd.toISOString(),end:ed.toISOString()}});
                }
                showToast('\u2705 Todo added');if (options.onRefresh) options.onRefresh();
              }).catch(function(er){showToast('\u274C '+er.message);});
            }
            return;
          }
          if(ev2.ctrlKey||ev2.metaKey){
            if(!fci)return;
            var fEvs=fsm[as]||[];
            if(hf&&fEvs.length>0){
              deleteCalendarEvent(fEvs[0].calendarId,fEvs[0].id).then(function(){if (options.onRefresh) options.onRefresh();});
            }else{
              createCalendarEvent(fci,"!40's Fruit",sd,ed,'').then(function(){if (options.onRefresh) options.onRefresh();});
            }
          }else{
            var pBody = options.popupBody || document.body;
            if(se.length>0){
              var e0=se[0];
              if (options.onClickEvent) {
                options.onClickEvent(e0);
              } else {
                showCalendarEventForm(pBody,pBody,null,{mode:'edit',calendarId:e0.calendarId,eventId:e0.id,summary:e0.summary,description:e0.description,startTime:new Date(e0.start),endTime:new Date(e0.end),onDone:options.onRefresh});
              }
            }else{
              if (options.onCreateEvent) {
                options.onCreateEvent(sd, ed);
              } else {
                showCalendarEventForm(pBody,pBody,null,{mode:'create',startTime:sd,endTime:ed,onDone:options.onRefresh});
              }
            }
          }
        });
      })(ec,sEvts,sD,eD,absSlot,hFr,frSlotMap,fruitCalId,sMn,eMn);
      
      sr.appendChild(ec);
      allCells.push({ev:ec,absSlot:absSlot,slotStartMin:sMn,slotEndMin:eMn,dayMs:dayMs});
      if (options.allGridCells) {
        options.allGridCells.push({ev:ec,slotStartMin:sMn,slotEndMin:eMn,dayMs:dayMs});
      }
    });
    card.appendChild(sr);
  }
  
  (function(ac,dm,fci,fsm){
    var mode=null,si2=-1,ei2=-1,isCtrl=false,isAlt=false,isShift=false,didDrag=false;
    function gCA(x,y){for(var i=0;i<ac.length;i++){var r=ac[i].ev.getBoundingClientRect();if(x>=r.left&&x<=r.right&&y>=r.top&&y<=r.bottom)return i;}return-1;}
    function hl(a,b){ac.forEach(function(c,i){c.ev.style.outline=(i>=a&&i<=b)?'2px solid '+(isCtrl?'#e74c3c':(isAlt?'#f59e0b':(isShift?'#9b59b6':'#4285f4'))):'none';});}
    function clr(){ac.forEach(function(c){c.ev.style.outline='none';});}
    function finishSel(){
      if(!mode)return;mode=null;var lo=Math.min(si2,ei2),hi=Math.max(si2,ei2);var sel=[];for(var ii=lo;ii<=hi;ii++){sel.push(ac[ii]);}clr();
      if(isShift&&sel.length>=2&&planCalId){
        var sMin2=Math.min.apply(null,sel.map(function(h){return h.slotStartMin;}));
        var eMin2=Math.max.apply(null,sel.map(function(h){return h.slotEndMin;}));
        var fi=document.createElement('input');fi.type='file';fi.accept='image/*';fi.style.display='none';
        fi.onchange=function(){var f=fi.files[0];if(!f)return;var rd=new FileReader();rd.onload=function(re){
          showToast('\u23F3 Uploading image...');
          uploadToImgBB(re.target.result).then(function(url){
            if(!url){showToast('\u274C Upload failed');return;}
            var metaStr2={sticky:{x:10,y:10,w:200,h:150,color:'white'},imageUrl:url};
            createPlanTask(planCalId,'\uD83D\uDDBC '+fmtTime(sMin2)+'-'+fmtTime(eMin2),new Date(dm+sMin2*60000),new Date(dm+eMin2*60000),metaStr2).then(function(){
              showToast('\u2705 Image added');if (options.onRefresh) options.onRefresh();
            }).catch(function(er){showToast('\u274C '+er.message);});
          });
        };rd.readAsDataURL(f);};fi.click();
      }else if(isAlt&&sel.length>=2&&planCalId){
        var sMin2=Math.min.apply(null,sel.map(function(h){return h.slotStartMin;}));
        var eMin2=Math.max.apply(null,sel.map(function(h){return h.slotEndMin;}));
        var taskName=prompt('Todo for '+fmtTime(sMin2)+' - '+fmtTime(eMin2)+':');
        if(taskName&&taskName.trim()){
          createPlanTask(planCalId,taskName.trim(),new Date(dm+sMin2*60000),new Date(dm+eMin2*60000)).then(function(created){
            if (options.planEvents) {
              options.planEvents.push({id:created.id||'temp',summary:taskName.trim(),start:new Date(dm+sMin2*60000).toISOString(),end:new Date(dm+eMin2*60000).toISOString(),calendarName:'00aplan',taskListId:planCalId,isDone:false,_meta:{start:new Date(dm+sMin2*60000).toISOString(),end:new Date(dm+eMin2*60000).toISOString()}});
            }
            showToast('\u2705 Todo added');if (options.onRefresh) options.onRefresh();
          }).catch(function(er){showToast('\u274C '+er.message);});
        }
      }else if(isCtrl&&sel.length>=1&&fci){
        var hc=sel.filter(function(c2){return(fsm[c2.absSlot]||[]).length>0;}).length;
        var doDelete=hc>sel.length/2;var ops=[];
        sel.forEach(function(c2){
          var fEvs=fsm[c2.absSlot]||[];
          if(doDelete&&fEvs.length>0)ops.push(deleteCalendarEvent(fEvs[0].calendarId,fEvs[0].id));
          else if(!doDelete&&fEvs.length===0)ops.push(createCalendarEvent(fci,"!40's Fruit",new Date(dm+c2.slotStartMin*60000),new Date(dm+c2.slotEndMin*60000),''));
        });
        if(ops.length)Promise.all(ops).then(function(){if (options.onRefresh) options.onRefresh();}).catch(function(){if (options.onRefresh) options.onRefresh();});
      }else if(!isCtrl&&!isAlt&&!isShift&&sel.length>=2){
        var sMin=Math.min.apply(null,sel.map(function(h){return h.slotStartMin;}));
        var eMin=Math.max.apply(null,sel.map(function(h){return h.slotEndMin;}));
        if (options.onCreateEvent) {
          options.onCreateEvent(new Date(dm+sMin*60000), new Date(dm+eMin*60000));
        } else {
          var pBody = options.popupBody || document.body;
          showCalendarEventForm(pBody,pBody,null,{mode:'create',startTime:new Date(dm+sMin*60000),endTime:new Date(dm+eMin*60000),onDone:options.onRefresh});
        }
      }
    }
    
    ac.forEach(function(c,i){
      c.ev.addEventListener('mousedown',function(e){
        if(e.button!==0)return;mode='ev';si2=i;ei2=i;isCtrl=e.ctrlKey||e.metaKey;isAlt=e.altKey;isShift=e.shiftKey;didDrag=false;hl(i,i);e.preventDefault();
      });
    });
    document.addEventListener('mousemove',function(e){if(!mode)return;var h=gCA(e.clientX,e.clientY);if(h<0)return;if(h!==ei2)didDrag=true;ei2=h;hl(Math.min(si2,h),Math.max(si2,h));});
    document.addEventListener('mouseup',function(){finishSel();});
    
    var _touchTimer=null;
    ac.forEach(function(c,i){
      c.ev.addEventListener('touchstart',function(e){
        _touchTimer=setTimeout(function(){
          mode='ev';si2=i;ei2=i;isCtrl=false;isAlt=false;isShift=false;didDrag=false;hl(i,i);
          c.ev.style.outline='2px solid #4285f4';
        },300);
      },{passive:true});
    });
    document.addEventListener('touchmove',function(e){
      if(_touchTimer){clearTimeout(_touchTimer);_touchTimer=null;}
      if(!mode)return;
      var t=e.touches[0];var h=gCA(t.clientX,t.clientY);if(h<0)return;
      if(h!==ei2)didDrag=true;ei2=h;hl(Math.min(si2,h),Math.max(si2,h));
      e.preventDefault();
    },{passive:false});
    document.addEventListener('touchend',function(){if(_touchTimer){clearTimeout(_touchTimer);_touchTimer=null;} finishSel();});
  })(allCells,dayMs,fruitCalId,frSlotMap);
  
  container.appendChild(card);
};

// ─── Full-Screen Gantt Overlay ───
(function initGanttOverlay() {
  const _state = { view: '2week', offset: 0, theme: 'light', page: 0 }; // page: 0=today, 1=gantt, 2=stats, 3=fruit
  let _overlayEl = null;
  let _overlayLifeCard = null;
  let _fsListener = null;
  var _updatePageDotsRef = function() {};
  var _renderPageRef = function() {};
  var _applyThRef = function() {};
  function openGanttOverlay(page, targetContainer) {
    if (typeof page === 'number') _state.page = page;
    if (_overlayEl) {
      const panel = _overlayEl.querySelector('.gantt-overlay-panel');
      const closeBtn = _overlayEl.querySelector('.gantt-overlay-close');
      const dots = _overlayEl.querySelector('.gantt-overlay-dots');
      if (targetContainer) {
        _overlayEl.style.cssText = 'position:relative; z-index:1; background:none; backdrop-filter:none; width:100%; height:100%; display:flex; animation:none; overflow:hidden;';
        if (panel) {
          panel.style.cssText = 'width:100%; height:100%; border-radius:0; border:none; box-shadow:none; display:flex; flex-direction:column; overflow:hidden;';
        }
        if (closeBtn) closeBtn.style.display = 'none';
        if (dots) dots.style.display = 'none';
        if (!targetContainer.contains(_overlayEl)) {
          targetContainer.appendChild(_overlayEl);
        }
      } else {
        _overlayEl.style.cssText = '';
        if (panel) {
          panel.style.cssText = '';
        }
        if (closeBtn) closeBtn.style.display = '';
        if (dots) dots.style.display = 'flex';
        if (!document.body.contains(_overlayEl)) {
          document.body.appendChild(_overlayEl);
        }
      }
      if (typeof _applyThRef === 'function') _applyThRef();
      _updatePageDotsRef();
      _renderPageRef();
      return;
    }
    // Skip Google auth popup for Life page (page 5) — it doesn't need calendar data
    // and popup would be blocked by browser since this isn't from a user gesture
    if (!_googleAccessToken && typeof manualGoogleReAuth === 'function' && _state.page !== 5) {
      manualGoogleReAuth().then(() => _buildOverlay(targetContainer)).catch(() => _buildOverlay(targetContainer));
      return;
    }
    _buildOverlay(targetContainer);
  }
  function closeGanttOverlay(preventRebuild) {
      if (_overlayEl && _overlayEl.querySelector('.gantt-overlay-panel')) {
        var p = _overlayEl.querySelector('.gantt-overlay-panel');
        if (p._autoTimer) clearInterval(p._autoTimer);
      }
      if (_fsListener) {
        document.removeEventListener('fullscreenchange', _fsListener);
        _fsListener = null;
      }
      if (_overlayEl) {
        _overlayEl.remove();
        _overlayEl = null;
      }
      if (preventRebuild !== true && window.D && window.D.cur && window.D.cur.startsWith('time_')) {
        if (typeof window.buildCols === 'function') {
          window.buildCols();
        }
      }
  }
  function _buildOverlay(targetContainer) {
    closeGanttOverlay(true);
    const overlay = document.createElement('div');
    overlay.className = 'gantt-overlay';
    if (!targetContainer) {
      overlay.addEventListener('mousedown', e => { if (e.target === overlay) closeGanttOverlay(); });
    }
    _overlayEl = overlay;
    const panel = document.createElement('div');
    panel.className = 'gantt-overlay-panel';
    const hdr = document.createElement('div');
    hdr.className = 'gantt-overlay-hdr';
    hdr.style.cssText = 'height:22px !important;min-height:22px !important;max-height:22px !important;padding:0 4px !important;overflow:hidden;';
    const title = document.createElement('span');
    title.style.cssText = 'color:#333;font-size:.65rem;font-weight:600;margin-right:8px;display:flex;gap:6px;align-items:center;';
    const _now = new Date();
    const _oneJan = new Date(_now.getFullYear(),0,1);
    const _wk = Math.ceil(((_now-_oneJan)/86400000+_oneJan.getDay()+1)/7);
    const _sp = Math.ceil(_wk/2);
    let _hij = ''; try { _hij = _now.toLocaleDateString('ar-SA-u-ca-islamic',{day:'numeric',month:'long'}); } catch(e){}
    const _greg = _now.toLocaleDateString('en-US',{month:'short',day:'numeric'});
    title.innerHTML = '\uD83D\uDCCA <span style="background:#6c8fff;color:#fff;padding:1px 5px;border-radius:4px;font-size:.55rem">W'+_wk+'</span><span style="background:#10b981;color:#fff;padding:1px 5px;border-radius:4px;font-size:.55rem">Sprint '+_sp+'</span><span style="opacity:.6;font-size:.55rem">'+_greg+'</span><span style="opacity:.5;font-size:.5rem;direction:rtl">'+_hij+'</span>';
    hdr.appendChild(title);
    // Week/Sprint progress bars
    const _wkBar = document.createElement('div');
    _wkBar.style.cssText = 'display:flex;gap:1px;align-items:center;margin-left:8px;';
    if (targetContainer) _wkBar.style.display = 'none';
    for (let w=1;w<=52;w++) {
      const d = document.createElement('div');
      const isPast = w < _wk;
      const isCur = w === _wk;
      d.style.cssText = 'width:3px;height:'+(isCur?'14':'8')+'px;border-radius:1px;background:'+(isPast?'#111':(isCur?'#6c8fff':'rgba(0,0,0,.1)'))+';'+(isCur?'box-shadow:0 0 4px #6c8fff;':'')+'transition:height .15s;cursor:pointer;';
      d.title = 'W'+w;
      d.onmouseenter=function(){d.style.height='14px';};
      d.onmouseleave=function(){d.style.height=isCur?'14px':'8px';};
      (function(wn){d.onclick=function(e){e.stopPropagation();_state.offset=(wn-_wk)*7;_state.page=4;_renderPage();_buildOverlay(targetContainer);};})(w);
      _wkBar.appendChild(d);
    }
    hdr.appendChild(_wkBar);
    const _spBar = document.createElement('div');
    _spBar.style.cssText = 'display:flex;gap:1px;align-items:center;margin-left:4px;';
    if (targetContainer) _spBar.style.display = 'none';
    for (let s=1;s<=26;s++) {
      const d = document.createElement('div');
      const isPast = s < _sp;
      const isCur = s === _sp;
      d.style.cssText = 'width:5px;height:'+(isCur?'14':'6')+'px;border-radius:1px;background:'+(isPast?'#111':(isCur?'#10b981':'rgba(0,0,0,.08)'))+';'+(isCur?'box-shadow:0 0 4px #10b981;':'')+'transition:height .15s;cursor:pointer;';
      d.title = 'Sprint '+s;
      d.onmouseenter=function(){d.style.height='14px';};
      d.onmouseleave=function(){d.style.height=isCur?'14px':'6px';};
      (function(sn){d.onclick=function(e){e.stopPropagation();_state.offset=(sn-_sp)*14;if(_state.page!==5)_state.page=4;_updatePageDots();_renderPage();};})(s);
      _spBar.appendChild(d);
    }
    hdr.appendChild(_spBar);
    const _days = () => _state.view === 'month' ? 30 : _state.view === '2week' ? 14 : 7;
    const mkBtn = (txt, tip, fn) => { const b = document.createElement('button'); b.textContent = txt; b.title = tip; b.onclick = e => { e.stopPropagation(); fn(); }; return b; };
    hdr.appendChild(mkBtn('\u25C0', 'Prev period', () => { _state.offset -= _days(); _renderPage(); }));
    hdr.appendChild(mkBtn('\u2039', 'Prev day', () => { _state.offset--; _renderPage(); }));
    hdr.appendChild(mkBtn('Today', 'Today', () => { _state.offset = 0; _renderPage(); }));
    hdr.appendChild(mkBtn('\u203A', 'Next day', () => { _state.offset++; _renderPage(); }));
    hdr.appendChild(mkBtn('\u25B6', 'Next period', () => { _state.offset += _days(); _renderPage(); }));
    const viewLabels = { week: 'Wk', '2week': '2W', month: 'Mo' };
    const viewCycle = ['week', '2week', 'month'];
    const viewBtn = mkBtn(viewLabels[_state.view], 'View', () => {
      const i = viewCycle.indexOf(_state.view);
      _state.view = viewCycle[(i + 1) % viewCycle.length]; _state.offset = 0;
      viewBtn.textContent = viewLabels[_state.view]; _renderPage();
    });
    hdr.appendChild(viewBtn);
    const themes = ['dark', 'light', 'transparent'];
    const thIcons = { dark: '\uD83C\uDF19', light: '\u2600\uFE0F', transparent: '\uD83D\uDC41' };
    const thBtn = mkBtn(thIcons[_state.theme], 'Theme', () => {
      const i = themes.indexOf(_state.theme);
      _state.theme = themes[(i + 1) % themes.length]; thBtn.textContent = thIcons[_state.theme]; _applyTh(); _renderPage();
    });
    hdr.appendChild(thBtn);
    var _scrollBtn = mkBtn(_state.scroll ? '\u2195' : '\u2194', _state.scroll ? 'Fit to screen' : 'Allow scroll', () => {
      _state.scroll = !_state.scroll;
      _scrollBtn.textContent = _state.scroll ? '\u2195' : '\u2194';
      _scrollBtn.title = _state.scroll ? 'Fit to screen' : 'Allow scroll';
      _renderPage();
    });
    hdr.appendChild(_scrollBtn);
    hdr.appendChild(mkBtn('\uD83D\uDD04', 'Refresh', () => { if (typeof window._clearCalendarCache === 'function') window._clearCalendarCache(); _renderPage(); }));
    let fsBtn = null;
    fsBtn = mkBtn('\u26F6', 'Fullscreen', () => {
      if (!document.fullscreenElement) {
        panel.requestFullscreen().catch(err => {
          console.error(`Error attempting to enable fullscreen: ${err.message}`);
        });
      } else {
        document.exitFullscreen();
      }
    });
    const updateFsIcon = () => {
      const isFs = !!document.fullscreenElement;
      fsBtn.textContent = isFs ? '\uD83D\uDCFA' : '\u26F6';
      fsBtn.title = isFs ? 'Exit Fullscreen' : 'Fullscreen';
      if (isFs) {
        fsBtn.style.background = '#6c8fff';
        fsBtn.style.color = '#fff';
        fsBtn.style.borderColor = '#6c8fff';
      } else {
        fsBtn.style.background = '';
        fsBtn.style.color = '';
        fsBtn.style.borderColor = '';
      }
    };
    _fsListener = updateFsIcon;
    document.addEventListener('fullscreenchange', _fsListener);
    hdr.appendChild(fsBtn);
    const closeBtn = mkBtn('\u2715', 'Close (Esc)', closeGanttOverlay);
    closeBtn.className = 'gantt-overlay-close';
    if (targetContainer) {
      closeBtn.style.display = 'none';
    }
    hdr.appendChild(closeBtn);
    panel.appendChild(hdr);
    let body = document.createElement('div');
    body.className = 'gantt-overlay-body';
    panel.appendChild(body);
    overlay.appendChild(panel);
    if (targetContainer) {
      overlay.style.cssText = 'position:relative; z-index:1; background:none; backdrop-filter:none; width:100%; height:100%; display:flex; animation:none; overflow:hidden;';
      panel.style.cssText = 'width:100%; height:100%; border-radius:0; border:none; box-shadow:none; display:flex; flex-direction:column; overflow:hidden;';
      targetContainer.appendChild(overlay);
    } else {
      document.body.appendChild(overlay);
    }
    function _applyTh() {
      const t = _state.theme;
      if (t === 'light') { panel.style.background='#f5f6fa'; panel.style.border='1px solid #ddd'; hdr.style.background='rgba(0,0,0,.04)'; title.style.color='#333'; }
      else if (t === 'transparent') { panel.style.background='rgba(20,20,30,.85)'; panel.style.border='1px solid rgba(255,255,255,.08)'; hdr.style.background='transparent'; title.style.color='#aaa'; }
      else { panel.style.background='#1a1c2e'; panel.style.border='1px solid rgba(108,143,255,.2)'; hdr.style.background='rgba(108,143,255,.08)'; title.style.color='#ccc'; }
      if (_overlayLifeCard) {
        _overlayLifeCard.calTheme = t;
      }
    }
    _applyThRef = _applyTh;
    _applyTh();
    const _fc = { calTheme: _state.theme };
    // Page navigation dots
    const _pageDots = document.createElement('div');
    _pageDots.className = 'gantt-overlay-dots';
    if (targetContainer) {
      _pageDots.style.display = 'none';
    } else {
      _pageDots.style.cssText = 'display:flex;gap:4px;align-items:center;margin-left:auto;margin-right:8px;';
    }
    const _pageNames = ['\u2600\uFE0F', '\uD83D\uDCCA', '\uD83D\uDCC8', '\uD83C\uDF4E', '\uD83D\uDCC5', '\uD83E\uDDEC'];
    const _pageTitles = ['Today', 'Gantt Chart', 'Statistics', 'Fruit Tracker', 'Zooper', 'Life'];
    _pageNames.forEach((p, i) => {
      const d = document.createElement('button');
      d.textContent = p;
      d.title = _pageTitles[i];
      d.style.cssText = 'border:none;background:'+(i===_state.page?'#6c8fff':'transparent')+';color:'+(i===_state.page?'#fff':'#888')+';border-radius:4px;padding:2px 8px;font-size:.65rem;cursor:pointer;';
      d.onclick = (e) => { e.stopPropagation(); _state.page = i; _updatePageDots(); _renderPage(); };
      _pageDots.appendChild(d);
    });
    hdr.appendChild(_pageDots);

    function _updatePageDots() {
      var btns = _pageDots.querySelectorAll('button');
      btns.forEach((b, i) => {
        b.style.background = i===_state.page?'#6c8fff':'transparent';
        b.style.color = i===_state.page?'#fff':'#888';
      });
    }

    // Mouse wheel page switching
    body.addEventListener('wheel', function(e) {
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY) && Math.abs(e.deltaX) > 50) {
        e.preventDefault();
        if (e.deltaX > 0 && _state.page < 5) { _state.page++; _updatePageDots(); _renderPage(); }
        else if (e.deltaX < 0 && _state.page > 0) { _state.page--; _updatePageDots(); _renderPage(); }
      }
    }, {passive: false});

    function _renderPage() {
      if (_state.page === 0) _renderToday();
      else if (_state.page === 1) _render();
      else if (_state.page === 2) _renderStats();
      else if (_state.page === 3) _renderFruit();
      else if (_state.page === 4) _renderGantt2();
      else {
        /* Life page — embed the real Life Widget with zoom/LOD */
        var existingLife = body.querySelector('.miro-life[data-cid="life_overlay_page"]');
        if (existingLife && existingLife._destroyed) {
          existingLife.remove();
          existingLife = null;
        }
        if (existingLife) {
          if (_overlayLifeCard) {
            _overlayLifeCard.w = body.clientWidth || 900;
            _overlayLifeCard.h = body.clientHeight || 500;
          }
          return;
        }
        /* Capture height BEFORE clearing (flex:1 collapses to 0 after innerHTML='') */
        var savedW = body.clientWidth || 900;
        var savedH = body.clientHeight || 500;
        body.innerHTML = '';
        /* Use flex column layout so the Life widget fills the body via flex:1
           instead of position:absolute (which needs a non-zero parent height) */
        body.style.cssText = 'position:relative;overflow:hidden;display:flex;flex-direction:column;';
        if (!_overlayLifeCard) {
          _overlayLifeCard = {
            id: 'life_overlay_page',
            type: 'life',
            x: 0, y: 0,
            w: savedW,
            h: savedH,
            _overlayMode: true,
            calTheme: _state.theme,
            life: { ov: [], cam: { z: 1.0, x: 0, y: 0 }, calEvents: [], _calTS: 0, sel: null }
          };
        } else {
          _overlayLifeCard.w = savedW;
          _overlayLifeCard.h = savedH;
          _overlayLifeCard.calTheme = _state.theme;
        }
        if (typeof window.buildMiroLifeWidget === 'function') {
          var lifeEl = window.buildMiroLifeWidget(_overlayLifeCard);
          /* Use flex:1 instead of absolute positioning to fill the body */
          lifeEl.style.cssText = 'position:relative;width:100%;flex:1;min-height:0;overflow:hidden;display:flex;flex-direction:column;';
          var delBtn2 = lifeEl.querySelector('.mc-del');
          if (delBtn2) delBtn2.style.display = 'none';
          var lockBtn2 = lifeEl.querySelector('.mc-lock');
          if (lockBtn2) lockBtn2.style.display = 'none';
          body.appendChild(lifeEl);
        } else {
          body.textContent = 'Life widget not loaded';
        }
        return;
      }
    }

    function getContrastColor(hexColor) {
      if (!hexColor || hexColor.length < 7) return '#fff';
      var r = parseInt(hexColor.slice(1,3), 16);
      var g = parseInt(hexColor.slice(3,5), 16);
      var b = parseInt(hexColor.slice(5,7), 16);
      var luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      return luminance > 0.5 ? '#222' : '#fff';
    }

    async function _renderToday() {
      body.innerHTML = '<div style=""text-align:center;padding:10px;color:#888;font-size:.55rem;"">Loading 2Days...</div>';
      // Inject pulse animation if not exists
      if (!document.getElementById('pomo-pulse-css')) {
        var sty = document.createElement('style'); sty.id = 'pomo-pulse-css';
        sty.textContent = '@keyframes pomoPulse { 0%,100%{box-shadow:0 0 4px rgba(255,107,53,.4)} 50%{box-shadow:0 0 10px rgba(255,107,53,.8)} }';
        document.head.appendChild(sty);
      }
      var now = new Date();
      var isDk = _state.theme !== 'light';
      var txt = isDk ? '#ddd' : '#222';
      var bg2 = isDk ? 'rgba(255,255,255,.03)' : 'rgba(0,0,0,.025)';
      var bdr = isDk ? 'rgba(255,255,255,.1)' : 'rgba(0,0,0,.1)';
      var SZ = 22;

      var pairIdx = _state.offset || 0;
      if (pairIdx === 0) { pairIdx = Math.floor((now.getDate() - 1) / 2); }
      var monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      var day1 = new Date(monthStart); day1.setDate(1 + pairIdx * 2);
      var day2 = new Date(day1); day2.setDate(day1.getDate() + 1);
      var fetchStart = new Date(day1); fetchStart.setHours(0,0,0,0);
      var fetchEnd = new Date(day2.getTime() + 86400000);

      var sessions = [
        {name:'S1',emoji:'\uD83C\uDF19',start:0,end:4,label:'12a\u20134a'},
        {name:'S2',emoji:'\uD83C\uDF05',start:4,end:8,label:'4a\u20138a'},
        {name:'S3',emoji:'\u2600\uFE0F',start:8,end:12,label:'8a\u201312p'},
        {name:'S4',emoji:'\uD83D\uDD25',start:12,end:16,label:'12p\u20134p'},
        {name:'S5',emoji:'\uD83C\uDF06',start:16,end:20,label:'4p\u20138p'},
        {name:'S6',emoji:'\uD83C\uDF19',start:20,end:24,label:'8p\u201312a'}
      ];

      try {
        var allEv = await fetchCalendarEvents(fetchStart, fetchEnd);
        var evts = (allEv || []).filter(function(e) { return !e.allDay; });
        var fruitCalId = '';
        try {
          var cals = await getCalendarList();
          var frCal = cals.find(function(c2) { return c2.summary.toLowerCase() === "!40's fruit"; });
          if (frCal) fruitCalId = frCal.id;
        } catch(e) {}

        body._ganttRender = function() { _renderToday(); };

        var container = document.createElement('div');
        container.style.cssText = 'display:flex;flex-direction:column;gap:4px;padding:4px;height:100%;box-sizing:border-box;overflow-y:auto;font-family:var(--font);';

        // Determine current session for today
        var curH = now.getHours();
        var curSessIdx = Math.min(5, Math.max(0, Math.floor(curH / 4)));
        var isToday1 = (day1.getDate() === now.getDate() && day1.getMonth() === now.getMonth());
        var isToday2 = (day2.getDate() === now.getDate() && day2.getMonth() === now.getMonth());

        function buildSession(sess, sIdx, dayMs, dayEvts, frSlotMap, fruitCalId, isCurrent) {
          var SZ = 22;
          // Check if flights have 03G/04G2 events
          function hasZakat(flightSlots) {
            for (var fi = 0; fi < flightSlots.length; fi++) {
              var slotStartMin = (sess.start * 60) + (flightSlots[fi] * 30);
              var slotEndMin = slotStartMin + 30;
              for (var ei2 = 0; ei2 < dayEvts.length; ei2++) {
                var ev = dayEvts[ei2];
                var cn = (ev.calendarName||'').toLowerCase();
                if (cn !== '03g' && cn !== '04g2') continue;
                var esM = new Date(ev.start).getHours() * 60 + new Date(ev.start).getMinutes();
                var eeM = new Date(ev.end).getHours() * 60 + new Date(ev.end).getMinutes();
                if (eeM === 0) eeM = 1440;
                if (esM < slotEndMin && eeM > slotStartMin) return true;
              }
            }
            return false;
          }

          var flight1Slots = [0,1,2,3];
          var flight2Slots = [4,5,6,7];
          var f1Zakat = hasZakat(flight1Slots);
          var f2Zakat = hasZakat(flight2Slots);
          var sessionSuccess = f1Zakat && f2Zakat;

          var sp = document.createElement('div');
          var sessBdr = sessionSuccess ? '#27ae60' : (isCurrent ? '#4285f4' : bdr);
          var sessBg = sessionSuccess ? (isDk ? 'rgba(39,174,96,.08)' : 'rgba(39,174,96,.06)') : bg2;
          sp.style.cssText = 'display:inline-flex;flex-direction:column;gap:2px;padding:3px;background:'+sessBg+';border-radius:6px;border:2px solid '+sessBdr+';'+(isCurrent?'box-shadow:0 0 8px rgba(66,133,244,.3);':'')+(sessionSuccess?'box-shadow:0 0 8px rgba(39,174,96,.3);':'');

          // Combined header + flights container
          var fc = document.createElement('div');
          fc.style.cssText = 'display:flex;gap:4px;';

          // Build each flight
          [flight1Slots, flight2Slots].forEach(function(flightSlots, flIdx) {
            var fZakat = flIdx === 0 ? f1Zakat : f2Zakat;
            var fd = document.createElement('div');
            var fBdr = fZakat ? '#27ae60' : bdr;
            var fBdrW = fZakat ? '3px' : '1px';
            fd.style.cssText = 'display:flex;flex-direction:column;gap:1px;padding:2px;border:'+fBdrW+' solid '+fBdr+';border-radius:4px;background:'+(fZakat?(isDk?'rgba(39,174,96,.06)':'rgba(39,174,96,.04)'):'transparent')+';';

            // Combined header: session label (on first flight) + zakat + badge
            var fh = document.createElement('div');
            fh.style.cssText = 'display:flex;align-items:center;gap:3px;min-height:16px;';
            if (flIdx === 0) {
              var se2 = document.createElement('span'); se2.style.cssText = 'font-size:14px;line-height:1;'; se2.textContent = sess.emoji;
              fh.appendChild(se2);
              var sn2 = document.createElement('span'); sn2.style.cssText = 'font-size:.55rem;font-weight:700;color:'+txt+';'; sn2.textContent = sess.name;
              fh.appendChild(sn2);
            }
            if (fZakat) {
              var fb = document.createElement('span');
              fb.style.cssText = 'font-size:12px;'; fb.textContent = '\uD83C\uDF4C\u2705';
              fb.title = 'Flight '+((flIdx+1))+' has zakat!';
              fh.appendChild(fb);
            }
            if (flIdx === 0 && sessionSuccess) {
              var badge = document.createElement('span');
              badge.style.cssText = 'font-size:14px;';
              badge.textContent = '\uD83C\uDF49\u2705';
              badge.title = 'Session Success!';
              fh.appendChild(badge);
            }
            var spacer = document.createElement('span');
            spacer.style.cssText = 'flex:1;';
            fh.appendChild(spacer);
            var zl = document.createElement('span');
            if (fZakat) {
              zl.style.cssText = 'font-size:.5rem;color:#27ae60;font-weight:900;text-shadow:0 0 6px rgba(39,174,96,.6);letter-spacing:.5px;';
              zl.textContent = '\u0630\u0643\u0631 \u0627\u0644\u0644\u0647';
            } else {
              zl.style.cssText = 'font-size:.5rem;color:'+txt+';opacity:.7;font-weight:600;';
              zl.textContent = '\u0632\u0643\u0627\u0629 \u0627\u0644\u0648\u0642\u062A';
            }
            fh.appendChild(zl);
            fd.appendChild(fh);

            // Pomodoro cells row: 3 work + gap + 1 break
            var pr = document.createElement('div');
            pr.style.cssText = 'display:flex;align-items:flex-start;gap:1px;';

            var cellElements = [];
            flightSlots.forEach(function(slotInSess, localIdx) {
              var isBreak = (localIdx === 3);
              if (isBreak) {
                var gap = document.createElement('div');
                gap.style.cssText = 'width:3px;align-self:stretch;';
                pr.appendChild(gap);
              }

              var absSlotIdx = sIdx * 8 + slotInSess;
              var slotStartMin = (sess.start * 60) + (slotInSess * 30);
              var slotEndMin = slotStartMin + 30;
              var slotStartDate = new Date(dayMs + slotStartMin * 60000);
              var slotEndDate = new Date(dayMs + slotEndMin * 60000);

              var slotEvts = dayEvts.filter(function(e2) {
                if ((e2.calendarName||'').toLowerCase() === "!40's fruit") return false;
                var esM = new Date(e2.start).getHours() * 60 + new Date(e2.start).getMinutes();
                var eeM = new Date(e2.end).getHours() * 60 + new Date(e2.end).getMinutes();
                if (eeM === 0) eeM = 1440;
                return esM < slotEndMin && eeM > slotStartMin;
              });

              var cellBg = 'transparent';
              var cellTitle = '';
              if (slotEvts.length > 0) {
                cellBg = slotEvts[0].color || '#4285f4';
                cellTitle = slotEvts.map(function(e2) { return (e2.summary||'') + ' \u2022 ' + (e2.calendarName||''); }).join('\n');
              }

              var hasFruit = (frSlotMap[absSlotIdx] || []).length > 0;

              var cw = document.createElement('div');
              cw.style.cssText = 'display:flex;flex-direction:column;gap:1px;';
              cw.setAttribute('data-cell-idx', slotInSess);

              // Event cell
              var ec = document.createElement('div');
              ec.className = 'pomo-ev';
              var textCol = cellBg !== 'transparent' ? getContrastColor(cellBg) : txt;
              var isNowSlot = false;
              var nowDate = new Date();
              var nowDayMs2 = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate()).getTime();
              if (dayMs === nowDayMs2) {
                var nowTotalMin = nowDate.getHours() * 60 + nowDate.getMinutes();
                if (nowTotalMin >= slotStartMin && nowTotalMin < slotEndMin) isNowSlot = true;
              }
              ec.style.cssText = 'width:'+SZ+'px;height:'+SZ+'px;border:'+(isNowSlot?'2px solid #ff6b35':'1px solid '+bdr)+';border-radius:3px;background:'+(cellBg!=='transparent'?cellBg:(isBreak?'rgba(128,128,128,.05)':bg2))+';cursor:pointer;display:flex;align-items:center;justify-content:center;overflow:hidden;font-size:.3rem;color:'+textCol+';box-sizing:border-box;user-select:none;'+(isNowSlot?'box-shadow:0 0 6px rgba(255,107,53,.6);animation:pomoPulse 1.5s ease-in-out infinite;':'');
              if (cellTitle) ec.title = cellTitle;
              else {
                var th2 = Math.floor(slotStartMin/60), tm2 = slotStartMin%60;
                ec.title = ((th2%12)||12)+':'+(tm2<10?'0':'')+tm2+(th2<12?'am':'pm')+(isBreak?' (Break)':'');
              }
              if (isBreak && !cellTitle) ec.textContent = '\u23F8';

              (function(ec, slotEvts, slotStartDate, slotEndDate, pg2) {
                ec.addEventListener('click', function(ev2) {
                  if (pg2 && pg2._didDrag) return;
                  ev2.stopPropagation();
                  if (slotEvts.length > 0) {
                    var e0 = slotEvts[0];
                    showCalendarEventForm(body, body, null, { mode:'edit', calendarId:e0.calendarId, eventId:e0.id, summary:e0.summary, description:e0.description, startTime:new Date(e0.start), endTime:new Date(e0.end) });
                  } else {
                    showCalendarEventForm(body, body, null, { mode:'create', startTime:slotStartDate, endTime:slotEndDate });
                  }
                });
              })(ec, slotEvts, slotStartDate, slotEndDate, pr);

              cw.appendChild(ec);

              // Fruit cell
              var frc = document.createElement('div');
              frc.className = 'pomo-fr';
              frc.style.cssText = 'width:'+SZ+'px;height:'+SZ+'px;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:'+(SZ-6)+'px;border-radius:3px;background:'+(hasFruit?'rgba(231,76,60,.1)':'transparent')+';box-sizing:border-box;user-select:none;';
              frc.textContent = hasFruit ? '\uD83C\uDF4E' : '';
              frc.title = hasFruit ? '\u2714 Fruit' : 'Add fruit';

              (function(frc, absSlotIdx, hasFruit, frSlotMap, fruitCalId, slotStartDate, slotEndDate, pg2) {
                frc.addEventListener('click', function(ev2) {
                  if (pg2 && pg2._didDragFr) return;
                  ev2.stopPropagation();
                  if (!fruitCalId) { showToast('\u274C No fruit calendar'); return; }
                  var fEvs = frSlotMap[absSlotIdx] || [];
                  if (hasFruit && fEvs.length > 0) {
                    deleteCalendarEvent(fEvs[0].calendarId, fEvs[0].id).then(function() { showToast('\uD83D\uDDD1'); _renderToday(); }).catch(function(er) { showToast('\u274C ' + er.message); });
                  } else {
                    createCalendarEvent(fruitCalId, "!40's Fruit", slotStartDate, slotEndDate, '').then(function() { showToast('\u2705'); _renderToday(); }).catch(function(er) { showToast('\u274C ' + er.message); });
                  }
                });
              })(frc, absSlotIdx, hasFruit, frSlotMap, fruitCalId, slotStartDate, slotEndDate, pr);

              cw.appendChild(frc);
              pr.appendChild(cw);
              cellElements.push({ el: cw, slot: slotInSess, absSlot: absSlotIdx, startMin: slotStartMin, endMin: slotEndMin, dayMs: dayMs });
            });

            fd.appendChild(pr);

            // Drag-to-select for this flight
            (function(cellElements, sess, dayMs, fruitCalId, frSlotMap, pr) {
              var mode = null, startSlot = -1;
              function getCellAt(x, y) {
                for (var i = 0; i < cellElements.length; i++) {
                  var r = cellElements[i].el.getBoundingClientRect();
                  if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return cellElements[i];
                }
                return null;
              }
              function hl(mn, mx) {
                cellElements.forEach(function(ce) {
                  var tgt = mode === 'ev' ? ce.el.querySelector('.pomo-ev') : ce.el.querySelector('.pomo-fr');
                  tgt.style.outline = (ce.slot >= mn && ce.slot <= mx) ? '2px solid '+(mode==='ev'?'#4285f4':'#e74c3c') : 'none';
                });
              }
              function clr() { cellElements.forEach(function(ce) { ce.el.querySelector('.pomo-ev').style.outline='none'; ce.el.querySelector('.pomo-fr').style.outline='none'; }); }
              cellElements.forEach(function(ce) {
                ce.el.querySelector('.pomo-ev').addEventListener('mousedown', function(e) { if(e.button!==0)return; mode='ev';startSlot=ce.slot;pr._didDrag=false;hl(ce.slot,ce.slot);e.preventDefault(); });
                ce.el.querySelector('.pomo-fr').addEventListener('mousedown', function(e) { if(e.button!==0)return; mode='fr';startSlot=ce.slot;pr._didDragFr=false;hl(ce.slot,ce.slot);e.preventDefault(); });
              });
              document.addEventListener('mousemove', function(e) { if(!mode)return; var h=getCellAt(e.clientX,e.clientY); if(!h)return; hl(Math.min(startSlot,h.slot),Math.max(startSlot,h.slot)); });
              document.addEventListener('mouseup', function() {
                if(!mode) return;
                var cm = mode; mode = null;
                var sel = [];
                cellElements.forEach(function(ce) {
                  var tgt = cm==='ev' ? ce.el.querySelector('.pomo-ev') : ce.el.querySelector('.pomo-fr');
                  if (tgt.style.outline && tgt.style.outline !== 'none') sel.push(ce);
                });
                clr();
                if (cm === 'ev' && sel.length >= 2) {
                  pr._didDrag = true; setTimeout(function(){pr._didDrag=false;},300);
                  var sMin = Math.min.apply(null,sel.map(function(h){return h.startMin;}));
                  var eMin = Math.max.apply(null,sel.map(function(h){return h.endMin;}));
                  showCalendarEventForm(body, body, null, {mode:'create',startTime:new Date(dayMs+sMin*60000),endTime:new Date(dayMs+eMin*60000)});
                } else if (cm === 'fr' && sel.length >= 2 && fruitCalId) {
                  pr._didDragFr = true; setTimeout(function(){pr._didDragFr=false;},300);
                  var hc = sel.filter(function(c2){return(frSlotMap[c2.absSlot]||[]).length>0;}).length;
                  var dl = hc > sel.length/2;
                  var ops = [];
                  sel.forEach(function(c2) {
                    var fEvs=frSlotMap[c2.absSlot]||[];
                    var sM=(sess.start*60)+(c2.slot*30);
                    var sd2=new Date(dayMs+sM*60000),ed2=new Date(dayMs+(sM+30)*60000);
                    if(dl&&fEvs.length>0) ops.push(deleteCalendarEvent(fEvs[0].calendarId,fEvs[0].id));
                    else if(!dl&&fEvs.length===0) ops.push(createCalendarEvent(fruitCalId,"!40's Fruit",sd2,ed2,''));
                  });
                  if(ops.length) Promise.all(ops).then(function(){_renderToday();}).catch(function(){_renderToday();});
                }
              });
            })(cellElements, sess, dayMs, fruitCalId, frSlotMap, pr);

            fc.appendChild(fd);
          });

          sp.appendChild(fc);
          return sp;
        }

        // Identify today and prepare data for both days
        var dayDataArr = [day1, day2].map(function(dayDate) {
          var dayMs = new Date(dayDate.getFullYear(), dayDate.getMonth(), dayDate.getDate()).getTime();
          var dayEnd = dayMs + 86400000;
          var isToday = (dayDate.getDate() === now.getDate() && dayDate.getMonth() === now.getMonth() && dayDate.getFullYear() === now.getFullYear());
          var dayEvts = evts.filter(function(e) {
            var es = new Date(e.start).getTime(), ee = new Date(e.end).getTime();
            return es < dayEnd && ee > dayMs;
          });
          var frSlotMap = {};
          dayEvts.filter(function(e) { return (e.calendarName||'').toLowerCase() === "!40's fruit"; }).forEach(function(ev) {
            var s2 = new Date(ev.start).getTime(), e2 = new Date(ev.end).getTime();
            var ss = Math.floor((s2 - dayMs) / 1800000), se = Math.ceil((e2 - dayMs) / 1800000);
            for (var x = ss; x < se && x < 48; x++) { if (x >= 0) { if (!frSlotMap[x]) frSlotMap[x] = []; frSlotMap[x].push(ev); } }
          });
          return { date: dayDate, dayMs: dayMs, isToday: isToday, dayEvts: dayEvts, frSlotMap: frSlotMap };
        });

        var dn = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

        // Current session at VERY TOP of page (above both days)
        var todayData = dayDataArr.find(function(d) { return d.isToday; });
        if (todayData) {
          var curSess = sessions[curSessIdx];
          var curPanel = buildSession(curSess, curSessIdx, todayData.dayMs, todayData.dayEvts, todayData.frSlotMap, fruitCalId, true);
          var curWrap = document.createElement('div');
          curWrap.style.cssText = 'display:flex;justify-content:center;width:100%;';
          curWrap.appendChild(curPanel);
          container.appendChild(curWrap);
        }

        // Render each day
        dayDataArr.forEach(function(dd, dayIdx) {
          var dh = document.createElement('div');
          dh.style.cssText = 'font-size:.6rem;font-weight:700;color:'+txt+';padding:2px 0;'+(dayIdx>0?'margin-top:4px;border-top:1px solid '+bdr+';padding-top:3px;':'');
          dh.textContent = dn[dd.date.getDay()] + ' ' + dd.date.getDate() + '/' + (dd.date.getMonth()+1);
          container.appendChild(dh);

          var sg = document.createElement('div');
          sg.style.cssText = 'display:grid;grid-template-columns:repeat(2,auto);gap:3px;justify-content:center;';

          sessions.forEach(function(sess, sIdx) {
            if (dd.isToday && sIdx === curSessIdx) {
              // Placeholder gap for current session's original position
              var ph = document.createElement('div');
              ph.style.cssText = 'display:inline-flex;align-items:center;padding:2px 3px;border-radius:4px;border:1px dashed rgba(66,133,244,.3);opacity:.4;';
              var phl = document.createElement('span');
              phl.style.cssText = 'font-size:14px;'; phl.textContent = sess.emoji;
              var phn = document.createElement('span');
              phn.style.cssText = 'font-size:.5rem;color:'+txt+';opacity:.5;margin-left:2px;'; phn.textContent = sess.name+' \u2191';
              ph.appendChild(phl); ph.appendChild(phn);
              sg.appendChild(ph);
              return;
            }
            var panel = buildSession(sess, sIdx, dd.dayMs, dd.dayEvts, dd.frSlotMap, fruitCalId, false);
            sg.appendChild(panel);
          });

          container.appendChild(sg);
        });

        body.innerHTML = '';
        body.appendChild(container);
      } catch(err) {
        body.innerHTML = '<div style="text-align:center;padding:20px;color:#e55;font-size:.6rem;">\u26A0\uFE0F '+err.message+'</div>';
      }
    }
    async function _renderGantt2() {
      if(!body.querySelector('.zooper-day-card')){
        body.innerHTML='<div style="text-align:center;padding:10px;color:#888;font-size:.5rem">Loading Zooper...</div>';
      }
      if(!document.getElementById('pomo-pulse-css')){var sty=document.createElement('style');sty.id='pomo-pulse-css';sty.textContent='@keyframes pomoPulse{0%,100%{box-shadow:0 0 3px rgba(255,107,53,.4)}50%{box-shadow:0 0 8px rgba(255,107,53,.8)}}';document.head.appendChild(sty);}
      var now=new Date(),isDk=_state.theme!=='light';
      var txt=isDk?'#ddd':'#222',bg2=isDk?'rgba(255,255,255,.03)':'rgba(0,0,0,.02)',bdr=isDk?'rgba(255,255,255,.08)':'rgba(0,0,0,.08)';
      var todayD=new Date(now.getFullYear(),now.getMonth(),now.getDate());
      var off=_state.offset||0;
      var bM=now.getMonth(),bY=now.getFullYear(),bH=now.getDate()<=15?0:1;
      var tH=bM*2+bH+off;var spY=bY+Math.floor(tH/24);tH=((tH%24)+24)%24;
      var spM=Math.floor(tH/2),spHf=tH%2;
      var sprintStart,spDays;
      if(spHf===0){sprintStart=new Date(spY,spM,1);spDays=15;}
      else{sprintStart=new Date(spY,spM,16);spDays=new Date(spY,spM+1,0).getDate()-15;}
      var sprintEnd=new Date(sprintStart);sprintEnd.setDate(sprintStart.getDate()+spDays);
      var sessTips=['\u062b\u0644\u062b \u0627\u0644\u0644\u064a\u0644 \u0627\u0644\u0622\u062e\u0631','\u062b\u0644\u062b \u0627\u0644\u0646\u0647\u0627\u0631 \u0627\u0644\u0623\u0648\u0644 (\u0648\u0642\u0631\u0622\u0646 \u0627\u0644\u0641\u062c\u0631)','','','',''];
      var sessions=[{start:0},{start:4},{start:8},{start:12},{start:16},{start:20}];
      var LAYOUT=[{slot:0,fl:1},{slot:1,fl:1},{slot:2,fl:1},{type:'gap',fl:1},{slot:3,fl:1},{type:'div'},{slot:4,fl:2},{type:'gap',fl:2},{slot:5,fl:2},{slot:6,fl:2},{slot:7,fl:2}];
      function hijriDay(d){try{return new Intl.DateTimeFormat('en-u-ca-islamic-umalqura',{day:'numeric'}).format(d);}catch(e){return '';}}
      var oneJan=new Date(now.getFullYear(),0,1);var wkNum=Math.ceil(((now-oneJan)/86400000+oneJan.getDay()+1)/7);var spNum=Math.ceil(wkNum/2);
      var epoch=new Date(2025,9,28);epoch.setHours(0,0,0,0);
      function fmtTime(mn){var h=Math.floor(mn/60),m=mn%60;return((h%12)||12)+':'+(m<10?'0':'')+m+(h<12?'am':'pm');}
      try{
        var allEv=await fetchCalendarEvents(sprintStart,sprintEnd);
        var evts=(allEv||[]).filter(function(e){return !e.allDay;});
        var fruitCalId='',planCalId=null;
        try{var cals=await getCalendarList();var frCal=cals.find(function(c){return c.summary.toLowerCase()==="!40's fruit";});if(frCal)fruitCalId=frCal.id;}catch(e){}
        // Use Google Tasks for plan (instead of calendar)
        var planEvents=[];
        try{
          var _allTaskLists=await getAllTaskLists();
          if(_allTaskLists.length>0){
            // Use first list as default (no hardcoded name dependency)
            planCalId=_allTaskLists[0].id;
            var allTasks=await fetchPlanTasks(planCalId);
            planEvents=allTasks;
          }
        }catch(e){console.warn('Tasks API error:',e.message);}
        body._ganttRender=function(){_renderGantt2();};
        var CS=14,DW=2,CSbig=28;
        var dn=['Su','Mo','Tu','We','Th','Fr','Sa'];
        if(typeof window._zooperFHD==='undefined') window._zooperFHD=false;
        var root=document.createElement('div');
        if(window._zooperFHD){
          root.style.cssText='display:flex;flex-direction:column;width:1920px;min-height:1080px;box-sizing:border-box;font-family:var(--font);overflow:visible;';
          body.style.overflow='auto';body.style.webkitOverflowScrolling='touch';
        }else{
          root.style.cssText='display:flex;flex-direction:column;height:100%;box-sizing:border-box;font-family:var(--font);overflow:hidden;';
          body.style.overflow='hidden';
        }
        var fhdBtn=document.createElement('button');
        fhdBtn.style.cssText='position:absolute;top:4px;right:40px;z-index:20;padding:2px 8px;border-radius:12px;border:1px solid '+(isDk?'rgba(255,255,255,.2)':'rgba(0,0,0,.2)')+';background:'+(isDk?'rgba(0,0,0,.4)':'rgba(255,255,255,.8)')+';color:'+txt+';font-size:.5rem;font-weight:700;cursor:pointer;font-family:var(--font);backdrop-filter:blur(4px);';
        fhdBtn.textContent=window._zooperFHD?'\uD83D\uDCF1 Adaptive':'\uD83D\uDDA5\uFE0F FHD';
        fhdBtn.title=window._zooperFHD?'Switch to adaptive':'Switch to FHD (1920x1080)';
        fhdBtn.onclick=function(e){e.stopPropagation();window._zooperFHD=!window._zooperFHD;_renderGantt2();};
        body.style.position='relative';root.style.position='relative';root.appendChild(fhdBtn);
        // â”€â”€â”€ TOP HALF: DAY CARDS (50%) â”€â”€â”€
        var topHalf=document.createElement('div');
        topHalf.style.cssText='flex:1;display:flex;flex-direction:column;justify-content:center;align-items:center;gap:2px;overflow:hidden;padding:2px;';
        var _allGridCells=[];
        function makeCardRow(startIdx,count){
          var row=document.createElement('div');
          row.style.cssText='display:flex;flex-direction:row-reverse;gap:3px;justify-content:center;flex-shrink:0;align-items:flex-start;';
          for(var d=startIdx;d<startIdx+count&&d<spDays;d++){
            var dayDate=new Date(sprintStart);dayDate.setDate(sprintStart.getDate()+d);
            window.renderZooperDayCard(row, dayDate, {
              theme: _state.theme,
              evts: evts,
              fruitCalId: fruitCalId,
              planEvents: planEvents,
              planCalId: planCalId,
              allGridCells: _allGridCells,
              popupBody: body,
              onRefresh: function() { _renderGantt2(); }
            });
          }
          return row;
        }
        topHalf.appendChild(makeCardRow(0,7));
        if(spDays>7) topHalf.appendChild(makeCardRow(7,spDays-7));
        root.appendChild(topHalf);
        // --- Highlight helpers for time slot linking ---
        var _hlActive=null;
        function highlightCellsForEvent(ev){
          clearCellHighlight();
          var evS=new Date(ev.start).getTime(),evE=new Date(ev.end).getTime();
          _allGridCells.forEach(function(c){
            var cS=c.dayMs+c.slotStartMin*60000,cE=c.dayMs+c.slotEndMin*60000;
            if(cS>=evS&&cE<=evE){
              c._origBg=c.ev.style.background;c._origOutline=c.ev.style.outline;
              c.ev.style.outline='2px solid #f59e0b';c.ev.style.background='rgba(245,158,11,.25)';
              c._hl=true;
            }
          });
          _hlActive=ev.id;
        }
        function clearCellHighlight(){
          _allGridCells.forEach(function(c){
            if(c._hl){c.ev.style.outline=c._origOutline||'';c.ev.style.background=c._origBg||'';c._hl=false;}
          });
          _hlActive=null;
          // Also clear sticky outlines
          document.querySelectorAll('.zooper-sticky').forEach(function(s){s.style.outline='';});
        }
        // Click on empty space clears highlight
        root.addEventListener('click',function(e){
          if(!_hlActive)return;
          if(e.target.closest('.zooper-sticky')||e.target.closest('[data-todo-item]'))return;
          clearCellHighlight();
        });
        // â”€â”€â”€ BOTTOM HALF: STATS (50%) â”€â”€â”€
        var allEvS=await fetchCalendarEvents(epoch,new Date(now.getFullYear(),now.getMonth(),now.getDate()+1));
        var excl=['phases of the moon','holidays in egypt','muslim holidays',"!40's fruit"];
        allEvS=(allEvS||[]).filter(function(e){return excl.indexOf((e.calendarName||'').toLowerCase())===-1&&!e.allDay;});
        var cMap={};allEvS.forEach(function(e){if(e.calendarName)cMap[e.calendarName]=e.color||'#4285f4';});
        var plan={'01R':3,'02W':1,'02xO':2,'03G':2,'04G2':1,'05B':0,'06C':0,'07J':0,'08M':1,'09N':1,'10Y':1,'11L':0.5,'12k':0.5,'13S':7};
        var cRows=[{type:'plan',label:'Pln:Wrk',cals:['01R','02W','02xO']},{type:'actual',label:'Sleep',cals:['13S']},{type:'actual',label:'Work',cals:['01R','02W','02xO']},{type:'sep'},{type:'plan',label:'Pln:Dev',cals:['08M','09N','10Y','03G','04G2']},{type:'actual',label:'Family',cals:['06C','07J']},{type:'actual',label:'Dev',cals:['08M','09N','10Y','03G','04G2']},{type:'sep'},{type:'plan',label:'Pln:Lsr',cals:['11L','12k']},{type:'actual',label:'Maint',cals:['05B']},{type:'actual',label:'Leisure',cals:['11L','12k']}];
        var mn=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        var spNum2=Math.ceil((new Date(sprintStart).getDate()<=15?1:2)/1);
        var sprintIdx=((sprintStart.getMonth())*2+(sprintStart.getDate()>15?2:1));
        var ranges=[
          {id:'all',label:'All',isTotal:true,s:function(){return new Date(epoch);},e:function(){return new Date(now.getFullYear(),now.getMonth(),now.getDate()+1);}},
          {id:'sprint',label:'Sprint ('+sprintIdx+'/26)',s:function(){return new Date(sprintStart);},e:function(){return new Date(sprintEnd);}},
          {id:'quarter',label:'Q'+Math.ceil((now.getMonth()+1)/3),s:function(){var q=Math.floor(now.getMonth()/3);return new Date(now.getFullYear(),q*3,1);},e:function(){var q=Math.floor(now.getMonth()/3);return new Date(now.getFullYear(),q*3+3,1);}},
          {id:'year',label:''+now.getFullYear(),s:function(){return new Date(now.getFullYear(),0,1);},e:function(){return new Date(now.getFullYear()+1,0,1);}}
        ];
        var botHalf=document.createElement('div');
        botHalf.style.cssText='flex:1;display:flex;flex-direction:column;gap:3px;padding:2px 4px;overflow:hidden;min-height:0;border-top:1px solid '+bdr+';';
        function makeStatsRow(rangeSlice){
          var sr=document.createElement('div');sr.style.cssText='display:flex;gap:4px;flex:1;min-height:0;';
          rangeSlice.forEach(function(rng){
            var sd=rng.s(),ed=rng.e();
            var dE=Math.max(1,Math.floor((Math.min(now.getTime(),ed.getTime())-sd.getTime())/86400000)+1);
            var sEvts=allEvS.filter(function(e){var es=new Date(e.start).getTime();return es>=sd.getTime()&&es<ed.getTime();});
            var aM={};sEvts.forEach(function(e){var cn=e.calendarName||'Other';if(!aM[cn])aM[cn]=0;aM[cn]+=(new Date(e.end).getTime()-new Date(e.start).getTime())/3600000;});
            var mx=1;cRows.forEach(function(r){if(r.type==='sep')return;var v=0;r.cals.forEach(function(cn){if(r.type==='plan')v+=(plan[cn]||0)*dE;else v+=(aM[cn]||0);});if(v>mx)mx=v;});
            var sc=document.createElement('div');sc.style.cssText='flex:1;background:'+bg2+';border-radius:4px;padding:3px 2px;display:flex;flex-direction:column;overflow:hidden;min-width:0;';
            var lb=document.createElement('div');lb.style.cssText='font-size:.5rem;font-weight:700;color:'+txt+';margin-bottom:1px;text-align:center;flex-shrink:0;';lb.textContent=rng.label+' ('+dE+'d)';sc.appendChild(lb);
            var rowsWrap=document.createElement('div');rowsWrap.style.cssText='flex:1;display:flex;flex-direction:column;justify-content:space-evenly;min-height:0;gap:1px;';
            cRows.forEach(function(r){
              if(r.type==='sep'){var sp=document.createElement('div');sp.style.cssText='height:2px;flex-shrink:0;border-bottom:1px solid '+(isDk?'rgba(255,255,255,.08)':'rgba(0,0,0,.06)')+';';rowsWrap.appendChild(sp);return;}
              var row=document.createElement('div');row.style.cssText='display:flex;align-items:center;gap:0;flex:1;min-height:0;';
              var bar=document.createElement('div');bar.style.cssText='flex:1;height:100%;background:'+(isDk?'rgba(255,255,255,.05)':'rgba(0,0,0,.05)')+';border-radius:3px;overflow:hidden;display:flex;box-shadow:inset 0 -1px 2px rgba(0,0,0,.1);';
              var tot=0;r.cals.forEach(function(cn){
                var v=r.type==='plan'?(plan[cn]||0)*dE:(aM[cn]||0);
                if(v<=0)return;tot+=v;var w=(v/mx*100);
                var sg=document.createElement('div');
                sg.style.cssText='height:100%;width:'+w+'%;background:linear-gradient(180deg,'+(cMap[cn]||(r.type==='plan'?'#888':'#4285f4'))+' 55%,rgba(0,0,0,.25) 100%);display:flex;align-items:center;justify-content:center;overflow:hidden;min-width:0;';
                sg.title=cn+': '+v.toFixed(1)+'h';
                if(w>2){var num=document.createElement('span');num.style.cssText='font-size:.6rem;color:#fff;font-weight:800;text-shadow:0 1px 2px rgba(0,0,0,.6);white-space:nowrap;';num.textContent=v.toFixed(0);sg.appendChild(num);}
                bar.appendChild(sg);
              });
              row.appendChild(bar);rowsWrap.appendChild(row);
            });
            sc.appendChild(rowsWrap);sr.appendChild(sc);
          });
          return sr;
        }
        botHalf.appendChild(makeStatsRow(ranges.slice(0,2)));
        botHalf.appendChild(makeStatsRow(ranges.slice(2)));

        // ─── TODO CHECKLIST PANEL (Multi-list Google Tasks with tabs) ───
        var todoPanel=document.createElement('div');
        todoPanel.style.cssText='flex:0 0 240px;display:flex;flex-direction:column;border-left:1px solid '+bdr+';overflow:hidden;background:'+(isDk?'rgba(0,0,0,.15)':'rgba(0,0,0,.02)')+';';
        // Tab bar
        var tabBar=document.createElement('div');
        tabBar.style.cssText='display:flex;overflow-x:auto;border-bottom:1px solid '+bdr+';flex-shrink:0;min-height:22px;scrollbar-width:none;';
        tabBar.style.setProperty('-ms-overflow-style','none');
        todoPanel.appendChild(tabBar);
        // Add input row
        var todoAddRow=document.createElement('div');
        todoAddRow.style.cssText='display:flex;gap:3px;padding:4px 6px;border-bottom:1px solid '+bdr+';flex-shrink:0;';
        var todoInput=document.createElement('input');
        todoInput.type='text';todoInput.placeholder='Add task...';
        todoInput.style.cssText='flex:1;background:'+(isDk?'rgba(255,255,255,.08)':'rgba(0,0,0,.05)')+';border:1px solid '+bdr+';border-radius:4px;color:'+txt+';font-size:.55rem;padding:3px 6px;outline:none;font-family:var(--font);';
        var todoAddBtn=document.createElement('button');
        todoAddBtn.textContent='+';
        todoAddBtn.style.cssText='background:#6c8fff;color:#fff;border:none;border-radius:4px;font-size:.65rem;padding:2px 8px;cursor:pointer;font-weight:700;';
        todoAddRow.appendChild(todoInput);todoAddRow.appendChild(todoAddBtn);
        todoPanel.appendChild(todoAddRow);
        // List container
        var todoList=document.createElement('div');
        todoList.style.cssText='flex:1;overflow-y:auto;padding:4px 6px;display:flex;flex-direction:column;gap:2px;';
        todoPanel.appendChild(todoList);

        // ─── Multi-list state ───
        var _allLists=[];
        var _activeListId=planCalId||null;
        var _activeListTasks=planEvents;
        var _tabEls={};

        function renderTodoItems(tasks,listId){
          todoList.innerHTML='';
          // Filter by sprint date range
          var filtered=tasks.filter(function(ev){
            var s=ev.start||ev._meta&&ev._meta.start;
            if(!s)return true; // show tasks without time
            var st=new Date(s).getTime();
            return st>=sprintStart.getTime()&&st<sprintEnd.getTime();
          });
          // Sort by time
          filtered.sort(function(a,b){
            var as=a.start||a._meta&&a._meta.start||'';
            var bs=b.start||b._meta&&b._meta.start||'';
            return new Date(as)-new Date(bs);
          });
          if(filtered.length===0){
            var empty=document.createElement('div');
            empty.style.cssText='text-align:center;padding:12px;color:'+(isDk?'#555':'#aaa')+';font-size:.5rem;';
            empty.textContent='No tasks in this sprint';
            todoList.appendChild(empty);
            return;
          }
          filtered.forEach(function(ev){
            var isDone=ev.isDone||(ev.status==='completed')||(ev.summary||'').toLowerCase().indexOf('done')!==-1;
            var displayName=(ev.summary||'(untitled)').replace(/\s*done\s*/gi,'').trim()||'(untitled)';
            var evMeta=ev._meta||{};
            var imgUrl=evMeta.imageUrl||ev.imageUrl||null;
            var isImg=imgUrl&&imgUrl.length>10;
            var item=document.createElement('div');
            item.style.cssText='display:flex;align-items:flex-start;gap:4px;padding:3px 4px;border-radius:4px;background:'+(isDone?(isDk?'rgba(39,174,96,.08)':'rgba(39,174,96,.06)'):'transparent')+';cursor:pointer;transition:background .15s;';
            item.onmouseenter=function(){item.style.background=isDk?'rgba(255,255,255,.06)':'rgba(0,0,0,.04)';};
            item.onmouseleave=function(){item.style.background=isDone?(isDk?'rgba(39,174,96,.08)':'rgba(39,174,96,.06)'):'transparent';};
            // Checkbox
            var cb=document.createElement('div');
            cb.style.cssText='width:14px;height:14px;flex-shrink:0;border:2px solid '+(isDone?'#27ae60':(isDk?'#555':'#bbb'))+';border-radius:3px;display:flex;align-items:center;justify-content:center;font-size:10px;cursor:pointer;margin-top:1px;background:'+(isDone?'#27ae60':'transparent')+';color:#fff;transition:all .15s;';
            cb.textContent=isDone?'\u2713':'';
            cb.title=isDone?'Mark as not done':'Mark as done';
            (function(ev,cb,isDone,listId){
              cb.onclick=function(e2){
                e2.stopPropagation();
                cb.style.opacity='.4';
                togglePlanTaskDone(listId,ev.id,!isDone).then(function(){
                  ev.isDone=!isDone;ev.status=!isDone?'completed':'needsAction';
                  showToast(isDone?'\u23EA Unmarked':'\u2705 Done!');
                  _renderGantt2();
                }).catch(function(er){showToast('\u274C '+er.message);cb.style.opacity='1';});
              };
            })(ev,cb,isDone,listId);
            // Label
            var lb;
            if(isImg){
              lb=document.createElement('div');
              lb.style.cssText='display:flex;flex-direction:column;gap:2px;flex:1;min-width:0;';
              var thumb=document.createElement('img');
              thumb.src=imgUrl;
              thumb.style.cssText='width:100%;max-height:36px;object-fit:cover;border-radius:3px;cursor:pointer;';
              thumb.onclick=function(e2){e2.stopPropagation();window.open(imgUrl,'_blank');};
              var urlTxt=document.createElement('a');
              urlTxt.href=imgUrl;urlTxt.target='_blank';
              urlTxt.style.cssText='font-size:.4rem;color:'+(isDk?'#6c8fff':'#4285f4')+';text-decoration:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:block;max-width:140px;';
              urlTxt.textContent=imgUrl.length>35?imgUrl.substring(0,35)+'...':imgUrl;
              lb.appendChild(thumb);lb.appendChild(urlTxt);
            }else{
              lb=document.createElement('span');
              lb.style.cssText='font-size:.5rem;color:'+txt+';line-height:1.3;word-break:break-word;'+(isDone?'text-decoration:line-through;opacity:.5;':'');
              lb.textContent=displayName;
            }
            // Time badge
            var tb=document.createElement('span');
            var sTime=ev.start||evMeta.start,eTime=ev.end||evMeta.end;
            tb.style.cssText='font-size:.4rem;color:'+(isDk?'#666':'#aaa')+';flex-shrink:0;margin-left:auto;white-space:nowrap;margin-top:2px;';
            if(sTime&&eTime){
              var evStart=new Date(sTime),evEnd=new Date(eTime);
              tb.textContent=evStart.getDate()+'/'+(evStart.getMonth()+1)+' '+fmtTime(evStart.getHours()*60+evStart.getMinutes())+'-'+fmtTime(evEnd.getHours()*60+evEnd.getMinutes());
            }else{tb.textContent='';}
            // Delete button
            var del=document.createElement('span');
            del.style.cssText='font-size:.6rem;cursor:pointer;opacity:.6;flex-shrink:0;margin-top:0px;color:'+(isDk?'#f66':'#c44')+';font-weight:700;';
            del.textContent='\u2715';del.title='Delete task';
            del.onmouseenter=function(){del.style.opacity='1';del.style.color='#e74c3c';};
            del.onmouseleave=function(){del.style.opacity='.3';del.style.color='';};
            (function(ev,del,listId){
              del.onclick=function(e2){
                e2.stopPropagation();
                del.style.opacity='.2';
                deletePlanTask(listId,ev.id).then(function(){
                  _activeListTasks=_activeListTasks.filter(function(x){return x.id!==ev.id;});
                  if(listId===planCalId)planEvents=planEvents.filter(function(x){return x.id!==ev.id;});
                  showToast('\uD83D\uDDD1 Deleted');
                  renderTodoItems(_activeListTasks,listId);
                }).catch(function(er){showToast('\u274C '+er.message);del.style.opacity='.3';});
              };
            })(ev,del,listId);
            item.appendChild(cb);item.appendChild(lb);item.appendChild(tb);item.appendChild(del);
            todoList.appendChild(item);
          });
        }

        function switchTab(listId,listTitle){
          _activeListId=listId;
          // Update tab styles
          Object.keys(_tabEls).forEach(function(k){
            _tabEls[k].style.background=k===listId?(isDk?'rgba(108,143,255,.2)':'rgba(108,143,255,.1)'):'transparent';
            _tabEls[k].style.borderBottom=k===listId?'2px solid #6c8fff':'2px solid transparent';
            _tabEls[k].style.fontWeight=k===listId?'700':'400';
          });
          // If it's the plan list, reuse cached planEvents
          if(listId===planCalId){
            _activeListTasks=planEvents;
            renderTodoItems(_activeListTasks,listId);
            renderAllStickyNotes();
            return;
          }
          // Fetch tasks for this list
          todoList.innerHTML='<div style="text-align:center;padding:12px;color:'+(isDk?'#555':'#aaa')+';font-size:.5rem;">Loading...</div>';
          fetchPlanTasks(listId).then(function(tasks){
            _activeListTasks=tasks;
            renderTodoItems(tasks,listId);
            renderAllStickyNotes();
          }).catch(function(er){
            todoList.innerHTML='<div style="text-align:center;padding:12px;color:#e74c3c;font-size:.5rem;">\u274C '+er.message+'</div>';
          });
        }

        // Build tabs from all task lists
        (async function(){
          try{
            _allLists=await getAllTaskLists();
          }catch(e){_allLists=[];}
          // Ensure 00aplan is first
          var sorted=_allLists.slice().sort(function(a,b){
            if((a.title||'').toLowerCase()==='00aplan')return -1;
            if((b.title||'').toLowerCase()==='00aplan')return 1;
            return (a.title||'').localeCompare(b.title||'');
          });
          tabBar.innerHTML='';
          sorted.forEach(function(list){
            var tab=document.createElement('div');
            tab.style.cssText='padding:3px 8px;font-size:.5rem;cursor:pointer;white-space:nowrap;color:'+txt+';border-bottom:2px solid transparent;transition:all .15s;flex-shrink:0;';
            tab.textContent=list.title||'Untitled';
            tab.title='Click: switch | Double-click: rename';
            _tabEls[list.id]=tab;
            tab.onclick=function(){switchTab(list.id,list.title);};
            // Double-click to rename
            (function(list,tab){
              tab.ondblclick=function(e){
                e.stopPropagation();
                var inp=document.createElement('input');
                inp.type='text';inp.value=list.title||'';
                inp.style.cssText='width:80px;font-size:.5rem;padding:1px 4px;border:1px solid #6c8fff;border-radius:3px;background:'+(isDk?'#1a1a2e':'#fff')+';color:'+txt+';outline:none;font-family:var(--font);';
                tab.innerHTML='';tab.appendChild(inp);inp.focus();inp.select();
                function doRename(){
                  var nv=inp.value.trim();
                  if(!nv||nv===list.title){tab.textContent=list.title||'Untitled';return;}
                  tab.textContent='...';
                  renameTaskList(list.id,nv).then(function(){
                    list.title=nv;tab.textContent=nv;
                    showToast('\u2705 Renamed to "'+nv+'"');
                  }).catch(function(er){tab.textContent=list.title||'Untitled';showToast('\u274C '+er.message);});
                }
                inp.onblur=doRename;
                inp.onkeydown=function(ek){if(ek.key==='Enter'){ek.preventDefault();inp.blur();}if(ek.key==='Escape'){tab.textContent=list.title||'Untitled';}};
              };
            })(list,tab);
            tabBar.appendChild(tab);
          });
          // Auto-select 00aplan or first list
          var defaultList=sorted.find(function(l){return(l.title||'').toLowerCase()==='00aplan';});
          if(defaultList){
            switchTab(defaultList.id,defaultList.title);
          }else if(sorted.length>0){
            switchTab(sorted[0].id,sorted[0].title);
          }
        })();

        // Add task handler
        function addTodoItem(){
          var val=todoInput.value.trim();
          if(!val)return;
          if(!_activeListId){showToast('\u274C No task list selected.');return;}
          todoAddBtn.disabled=true;todoAddBtn.textContent='...';
          var now2=new Date();
          var curMin=now2.getHours()*60+now2.getMinutes();
          var snapMin=Math.round(curMin/30)*30;
          var startT=new Date(now2.getFullYear(),now2.getMonth(),now2.getDate(),Math.floor(snapMin/60),snapMin%60,0);
          var endT=new Date(startT.getTime()+1800000);
          // Detect image URL
          var isImgUrl=/^https?:\/\/.+\.(jpg|jpeg|png|gif|webp|bmp|svg)/i.test(val)||/imgbb\.com|imgur\.com|i\.ibb\.co/i.test(val);
          if(isImgUrl){
            createPlanTask(_activeListId,'\uD83D\uDDBC '+fmtTime(curMin),startT,endT,{sticky:{x:10,y:10,w:200,h:150,color:'white'},imageUrl:val}).then(function(){
              todoInput.value='';
              showToast('\u2705 Image added');
              switchTab(_activeListId);
            }).catch(function(er){showToast('\u274C '+er.message);}).finally(function(){todoAddBtn.disabled=false;todoAddBtn.textContent='+';});
          }else{
            createPlanTask(_activeListId,val,startT,endT).then(function(created){
              var newTask={id:created.id||'temp',summary:val,title:val,start:startT.toISOString(),end:endT.toISOString(),taskListId:_activeListId,isDone:false,status:'needsAction',_meta:{start:startT.toISOString(),end:endT.toISOString()}};
              _activeListTasks.push(newTask);
              if(_activeListId===planCalId)planEvents.push(newTask);
              todoInput.value='';
              showToast('\u2705 Task added');
              renderTodoItems(_activeListTasks,_activeListId);
            }).catch(function(er){showToast('\u274C '+er.message);}).finally(function(){todoAddBtn.disabled=false;todoAddBtn.textContent='+';});
          }
        }
        todoAddBtn.onclick=addTodoItem;
        todoInput.addEventListener('keydown',function(e){if(e.key==='Enter'){e.preventDefault();addTodoItem();}});

        // ─── LEFT TODO PANEL (عادات تحت الإنشاء) ───
        var leftPanel=document.createElement('div');
        leftPanel.style.cssText='flex:0 0 220px;display:flex;flex-direction:column;border-right:1px solid '+bdr+';overflow:hidden;background:'+(isDk?'rgba(0,0,0,.15)':'rgba(0,0,0,.02)')+';';
        // Left header
        var leftHdr=document.createElement('div');
        leftHdr.style.cssText='display:flex;align-items:center;gap:4px;padding:4px 8px;border-bottom:1px solid '+bdr+';flex-shrink:0;';
        var leftTitle=document.createElement('span');
        leftTitle.style.cssText='font-size:.55rem;font-weight:700;color:'+txt+';';
        leftTitle.textContent='\uD83C\uDFAF \u0639\u0627\u062F\u0627\u062A \u062A\u062D\u062A \u0627\u0644\u0625\u0646\u0634\u0627\u0621';
        leftHdr.appendChild(leftTitle);
        leftPanel.appendChild(leftHdr);
        // Left add row
        var leftAddRow=document.createElement('div');
        leftAddRow.style.cssText='display:flex;gap:3px;padding:4px 6px;border-bottom:1px solid '+bdr+';flex-shrink:0;';
        var leftInput=document.createElement('input');
        leftInput.type='text';leftInput.placeholder='Add habit...';
        leftInput.style.cssText='flex:1;background:'+(isDk?'rgba(255,255,255,.08)':'rgba(0,0,0,.05)')+';border:1px solid '+bdr+';border-radius:4px;color:'+txt+';font-size:.55rem;padding:3px 6px;outline:none;font-family:var(--font);';
        var leftAddBtn=document.createElement('button');
        leftAddBtn.textContent='+';
        leftAddBtn.style.cssText='background:#e8a838;color:#fff;border:none;border-radius:4px;font-size:.65rem;padding:2px 8px;cursor:pointer;font-weight:700;';
        leftAddRow.appendChild(leftInput);leftAddRow.appendChild(leftAddBtn);
        leftPanel.appendChild(leftAddRow);
        // Left list
        var leftList=document.createElement('div');
        leftList.style.cssText='flex:1;overflow-y:auto;padding:4px 6px;display:flex;flex-direction:column;gap:2px;';
        leftPanel.appendChild(leftList);
        // Left panel state
        var _leftListId=null;
        var _leftTasks=[];

        function renderLeftItems(tasks,listId){
          leftList.innerHTML='';
          var filtered=tasks.filter(function(ev){
            var s=ev.start||ev._meta&&ev._meta.start;
            if(!s)return true;
            var st=new Date(s).getTime();
            return st>=sprintStart.getTime()&&st<sprintEnd.getTime();
          });
          filtered.sort(function(a,b){
            var as=a.start||a._meta&&a._meta.start||'';
            var bs=b.start||b._meta&&b._meta.start||'';
            return new Date(as)-new Date(bs);
          });
          if(filtered.length===0){
            var empty=document.createElement('div');
            empty.style.cssText='text-align:center;padding:12px;color:'+(isDk?'#555':'#aaa')+';font-size:.5rem;';
            empty.textContent='No habits in this sprint';
            leftList.appendChild(empty);
            return;
          }
          filtered.forEach(function(ev){
            var isDone=ev.isDone||(ev.status==='completed');
            var displayName=(ev.summary||ev.title||'(untitled)').replace(/\s*done\s*/gi,'').trim()||'(untitled)';
            var item=document.createElement('div');
            item.style.cssText='display:flex;align-items:center;gap:4px;padding:3px 4px;border-radius:4px;background:'+(isDone?(isDk?'rgba(232,168,56,.08)':'rgba(232,168,56,.06)'):'transparent')+';transition:background .15s;';
            item.onmouseenter=function(){item.style.background=isDk?'rgba(255,255,255,.06)':'rgba(0,0,0,.04)';};
            item.onmouseleave=function(){item.style.background=isDone?(isDk?'rgba(232,168,56,.08)':'rgba(232,168,56,.06)'):'transparent';};
            var cb=document.createElement('div');
            cb.style.cssText='width:14px;height:14px;flex-shrink:0;border:2px solid '+(isDone?'#e8a838':(isDk?'#555':'#bbb'))+';border-radius:3px;display:flex;align-items:center;justify-content:center;font-size:10px;cursor:pointer;background:'+(isDone?'#e8a838':'transparent')+';color:#fff;transition:all .15s;';
            cb.textContent=isDone?'\u2713':'';
            (function(ev,cb,isDone){
              cb.onclick=function(){
                cb.style.opacity='.4';
                togglePlanTaskDone(listId,ev.id,!isDone).then(function(){
                  ev.isDone=!isDone;ev.status=!isDone?'completed':'needsAction';
                  renderLeftItems(_leftTasks,listId);
                }).catch(function(er){showToast('\u274C '+er.message);cb.style.opacity='1';});
              };
            })(ev,cb,isDone);
            var lb=document.createElement('span');
            lb.style.cssText='font-size:.5rem;color:'+txt+';line-height:1.3;word-break:break-word;flex:1;'+(isDone?'text-decoration:line-through;opacity:.5;':'');
            lb.textContent=displayName;
            var tb=document.createElement('span');
            var sTime=ev.start||ev._meta&&ev._meta.start;
            tb.style.cssText='font-size:.4rem;color:'+(isDk?'#666':'#aaa')+';flex-shrink:0;white-space:nowrap;';
            if(sTime){var evS=new Date(sTime);tb.textContent=fmtTime(evS.getHours()*60+evS.getMinutes());}
            var del=document.createElement('span');
            del.style.cssText='font-size:.55rem;cursor:pointer;opacity:.4;flex-shrink:0;color:'+(isDk?'#f66':'#c44')+';font-weight:700;';
            del.textContent='\u2715';
            del.onmouseenter=function(){del.style.opacity='1';};
            del.onmouseleave=function(){del.style.opacity='.4';};
            (function(ev,del){
              del.onclick=function(){
                del.style.opacity='.2';
                deletePlanTask(listId,ev.id).then(function(){
                  _leftTasks=_leftTasks.filter(function(x){return x.id!==ev.id;});
                  renderLeftItems(_leftTasks,listId);
                  showToast('\uD83D\uDDD1 Deleted');
                }).catch(function(er){showToast('\u274C '+er.message);del.style.opacity='.4';});
              };
            })(ev,del);
            item.appendChild(cb);item.appendChild(lb);item.appendChild(tb);item.appendChild(del);
            leftList.appendChild(item);
          });
        }

        // Load left panel list
        (async function(){
          try{
            var lists=await getAllTaskLists();
            var habList=lists.find(function(l){return(l.title||'').indexOf('\u0639\u0627\u062F\u0627\u062A')!==-1;});
            if(!habList){
              // Create the list if it doesn't exist
              if(typeof ensureGoogleToken==='function')await ensureGoogleToken();
              var res=await fetch('https://tasks.googleapis.com/tasks/v1/users/@me/lists',{
                method:'POST',
                headers:{'Authorization':'Bearer '+_googleAccessToken,'Content-Type':'application/json'},
                body:JSON.stringify({title:'\u0639\u0627\u062F\u0627\u062A \u062A\u062D\u062A \u0627\u0644\u0625\u0646\u0634\u0627\u0621'})
              });
              if(res.ok)habList=await res.json();
            }
            if(habList){
              _leftListId=habList.id;
              _leftTasks=await fetchPlanTasks(_leftListId);
              renderLeftItems(_leftTasks,_leftListId);
              renderAllStickyNotes();
            }
          }catch(e){
            leftList.innerHTML='<div style="text-align:center;padding:12px;color:#e74c3c;font-size:.5rem;">\u274C '+e.message+'</div>';
          }
        })();

        // Left add handler
        function addLeftItem(){
          var val=leftInput.value.trim();
          if(!val||!_leftListId)return;
          leftAddBtn.disabled=true;leftAddBtn.textContent='...';
          var now2=new Date();
          var curMin=now2.getHours()*60+now2.getMinutes();
          var snapMin=Math.round(curMin/30)*30;
          var startT=new Date(now2.getFullYear(),now2.getMonth(),now2.getDate(),Math.floor(snapMin/60),snapMin%60,0);
          var endT=new Date(startT.getTime()+1800000);
          createPlanTask(_leftListId,val,startT,endT).then(function(created){
            _leftTasks.push({id:created.id||'temp',summary:val,title:val,start:startT.toISOString(),end:endT.toISOString(),taskListId:_leftListId,isDone:false,status:'needsAction',_meta:{start:startT.toISOString(),end:endT.toISOString()}});
            leftInput.value='';
            showToast('\u2705 Habit added');
            renderLeftItems(_leftTasks,_leftListId);
          }).catch(function(er){showToast('\u274C '+er.message);}).finally(function(){leftAddBtn.disabled=false;leftAddBtn.textContent='+';});
        }
        leftAddBtn.onclick=addLeftItem;
        leftInput.addEventListener('keydown',function(e){if(e.key==='Enter'){e.preventDefault();addLeftItem();}});

        // Wrap leftPanel + botHalf + todoPanel in a flex row
        var botRow=document.createElement('div');
        botRow.style.cssText='flex:1;display:flex;min-height:0;overflow:hidden;border-top:1px solid '+bdr+';';
        botHalf.style.borderTop='none';
        botRow.appendChild(leftPanel);botRow.appendChild(botHalf);botRow.appendChild(todoPanel);
        root.appendChild(botRow);
        root.style.position='relative';

        // ─── Sticky Notes Toggle Button ───
        var _stickyVisible=true;
        var stickyToggle=document.createElement('div');
        stickyToggle.style.cssText='position:absolute;top:4px;right:248px;z-index:25;padding:2px 6px;font-size:.5rem;cursor:pointer;border-radius:4px;background:'+(isDk?'rgba(255,255,255,.08)':'rgba(0,0,0,.06)')+';color:'+txt+';opacity:.7;transition:opacity .15s;user-select:none;';
        stickyToggle.textContent='\uD83D\uDCCC Hide Notes';
        stickyToggle.title='Toggle sticky notes visibility';
        stickyToggle.onmouseenter=function(){stickyToggle.style.opacity='1';};
        stickyToggle.onmouseleave=function(){stickyToggle.style.opacity='.7';};
        stickyToggle.onclick=function(){
          _stickyVisible=!_stickyVisible;
          stickyLayer.style.display=_stickyVisible?'':'none';
          stickyToggle.textContent=_stickyVisible?'\uD83D\uDCCC Hide Notes':'\uD83D\uDCCC Show Notes';
        };
        root.appendChild(stickyToggle);
        body.innerHTML='';body.appendChild(root);

        // ═══════════════════════════════════════════════════════════════
        // ═══  STICKY NOTES LAYER (synced with Google Tasks)  ═══
        // ═══════════════════════════════════════════════════════════════

        // --- Utility: parse/serialize sticky metadata from event description ---
        function parseStickyMeta(desc){
          if(!desc)return null;
          try{
            var m=desc.match(/<!--STICKYMETA:(.*?)-->/);
            if(m)return JSON.parse(m[1]);
          }catch(e){}
          return null;
        }
        function serializeStickyMeta(meta){
          return '<!--STICKYMETA:'+JSON.stringify(meta)+'-->';
        }
        function getDescWithoutMeta(desc){
          if(!desc)return '';
          return desc.replace(/<!--STICKYMETA:.*?-->/g,'').trim();
        }

        // --- Sticky note container (overlays entire root) ---
        var stickyLayer=document.createElement('div');
        stickyLayer.style.cssText='position:absolute;top:0;left:0;right:0;bottom:0;pointer-events:none;z-index:10;overflow:hidden;';
        root.appendChild(stickyLayer);

        // --- Sticky note color palette ---
        var snColors={
          yellow:'#f9e96b',pink:'#f4a4c0',green:'#a6d89b',blue:'#84c6e8',
          purple:'#c9a6e8',orange:'#f5b971',red:'#ff6b6b',cyan:'#66d9e8',
          white:'#f1f3f5',gray:'#adb5bd',dark:'#495057',magenta:'#e64980'
        };
        function snTextColor(bg){
          if(!bg)return '#333';
          var hex=bg.replace('#','');
          if(hex.length===3)hex=hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];
          var r=parseInt(hex.substr(0,2),16),g=parseInt(hex.substr(2,2),16),b=parseInt(hex.substr(4,2),16);
          return(r*0.299+g*0.587+b*0.114)>150?'#333':'#fff';
        }

        // --- Auto-layout calculator ---
        function autoLayoutPositions(count,containerW,containerH){
          var cols=Math.max(1,Math.floor(containerW/180));
          var positions=[];
          for(var i=0;i<count;i++){
            var col=i%cols,row=Math.floor(i/cols);
            positions.push({x:10+col*175,y:10+row*110,w:160,h:96});
          }
          return positions;
        }

        // --- Save sticky meta back to Tasks (DEBOUNCED) ---
        var _saveTimers={};
        function saveStickyMeta(ev,meta){
          var lid=ev.taskListId||ev._listId||planCalId;
          if(!lid||!ev.id||ev.id==='temp')return;
          if(_saveTimers[ev.id])clearTimeout(_saveTimers[ev.id]);
          _saveTimers[ev.id]=setTimeout(function(){
            var existingMeta=ev._meta||{};
            Object.assign(existingMeta,{sticky:meta});
            if(meta.imageUrl)existingMeta.imageUrl=meta.imageUrl;
            updatePlanTask(lid,ev.id,{notes:serializeTaskNotes(existingMeta)}).catch(function(er){
              console.warn('[StickyMeta] Save failed:',er.message);
            });
          },1500);
        }

        // --- Helper: detect image URL ---
        function isImageUrl(str){
          if(!str)return false;
          return /^https?:\/\/.+\.(jpg|jpeg|png|gif|webp|bmp|svg)/i.test(str)||/imgbb\.com|imgur\.com|i\.ibb\.co/i.test(str);
        }

        // --- Build & render all sticky notes from ALL lists ---
        var _stickyRendered=false;
        var _asyncLoaders=0; // count completed async loaders
        function renderAllStickyNotes(){
          stickyLayer.innerHTML=''; // clear previous
          var rootRect2=root.getBoundingClientRect();
          var cW=rootRect2.width,cH=rootRect2.height;
          // Collect all tasks from all loaded lists
          var _allStickyTasks=[];
          // Right panel tasks
          if(_activeListTasks&&_activeListTasks.length){
            _activeListTasks.forEach(function(t){t._listId=_activeListId;_allStickyTasks.push(t);});
          }
          // Left panel tasks (avoid duplicates)
          if(_leftTasks&&_leftTasks.length){
            _leftTasks.forEach(function(t){
              if(!_allStickyTasks.find(function(x){return x.id===t.id;})){t._listId=_leftListId;_allStickyTasks.push(t);}
            });
          }
          // Also include planEvents if they aren't already included
          if(planEvents&&planEvents.length){
            planEvents.forEach(function(t){
              if(!_allStickyTasks.find(function(x){return x.id===t.id;})){t._listId=planCalId;_allStickyTasks.push(t);}
            });
          }
          // Filter to sprint range
          _allStickyTasks=_allStickyTasks.filter(function(ev){
            var s=ev.start||ev._meta&&ev._meta.start;
            if(!s)return true;
            var st=new Date(s).getTime();
            return st>=sprintStart.getTime()&&st<sprintEnd.getTime();
          });
          if(_allStickyTasks.length===0)return;
          var autoPos=autoLayoutPositions(_allStickyTasks.length,cW,cH);

        _allStickyTasks.forEach(function(ev,idx){
          var meta=ev.sticky||ev._meta&&ev._meta.sticky||parseStickyMeta(ev.description||'');
          if(!meta){
            var ap=autoPos[idx]||{x:10+idx*40,y:cH*0.55+10,w:160,h:96};
            meta={x:ap.x,y:ap.y,w:ap.w,h:ap.h,color:'yellow',bgHex:null,richText:null};
            if(ev._meta&&ev._meta.imageUrl)meta.imageUrl=ev._meta.imageUrl;
            if(ev.imageUrl)meta.imageUrl=ev.imageUrl;
          }
          // Ensure minimum size
          if(!meta.w||meta.w<80)meta.w=160;
          if(!meta.h||meta.h<60)meta.h=96;

          var isDonePlan=ev.isDone||(ev.summary||'').toLowerCase().indexOf('done')!==-1;
          var displayName=(ev.summary||'(untitled)').replace(/\s*done\s*/gi,'').trim()||'(untitled)';
          var bgColor=meta.bgHex||(snColors[meta.color]||snColors.yellow);
          var txtClr=snTextColor(bgColor);

          // --- Sticky note element ---
          var sn=document.createElement('div');
          sn.className='zooper-sticky';
          sn.style.cssText='position:absolute;pointer-events:auto;left:'+meta.x+'px;top:'+meta.y+'px;width:'+meta.w+'px;height:'+meta.h+'px;min-height:'+meta.h+'px;'
            +'background:'+bgColor+';color:'+txtClr+';border-radius:6px;'
            +'box-shadow:0 2px 12px rgba(0,0,0,.18),0 1px 3px rgba(0,0,0,.12);'
            +'font-family:var(--font);cursor:grab;user-select:none;display:flex;flex-direction:column;'
            +'transition:box-shadow .15s;overflow:hidden;z-index:11;';
          sn.addEventListener('mouseenter',function(){sn.style.boxShadow='0 4px 20px rgba(0,0,0,.25),0 2px 6px rgba(0,0,0,.15)';sn.style.zIndex='20';});
          sn.addEventListener('mouseleave',function(){sn.style.boxShadow='0 2px 12px rgba(0,0,0,.18),0 1px 3px rgba(0,0,0,.12)';sn.style.zIndex='11';});

          // --- Header bar (time badge + controls) ---
          var snHdr=document.createElement('div');
          snHdr.style.cssText='display:flex;align-items:center;gap:3px;padding:4px 6px;font-size:.45rem;opacity:.8;flex-shrink:0;border-bottom:1px solid rgba(0,0,0,.08);';

          // Checkbox
          var snCb=document.createElement('div');
          snCb.style.cssText='width:14px;height:14px;flex-shrink:0;border:2px solid '+(isDonePlan?'rgba(0,0,0,.3)':'rgba(0,0,0,.25)')+';border-radius:3px;'
            +'display:flex;align-items:center;justify-content:center;font-size:9px;cursor:pointer;'
            +'background:'+(isDonePlan?'rgba(39,174,96,.7)':'transparent')+';color:#fff;transition:all .15s;';
          snCb.textContent=isDonePlan?'\u2713':'';
          snCb.title=isDonePlan?'Mark undone':'Mark done';
          (function(ev,snCb,isDonePlan,sn){
            var lid=ev.taskListId||ev._listId||planCalId;
            snCb.addEventListener('click',function(e2){
              e2.stopPropagation();
              if(!lid)return;
              snCb.style.opacity='.4';
              togglePlanTaskDone(lid,ev.id,!isDonePlan).then(function(){
                ev.isDone=!isDonePlan;ev.status=!isDonePlan?'completed':'needsAction';
                showToast(isDonePlan?'\u23EA Unmarked':'\u2705 Done!');
                if(_activeListId)renderTodoItems(_activeListTasks,_activeListId);
                if(_leftListId)renderLeftItems(_leftTasks,_leftListId);
              }).catch(function(er){showToast('\u274C '+er.message);snCb.style.opacity='1';});
            });
          })(ev,snCb,isDonePlan,sn);
          snHdr.appendChild(snCb);

          // Time badge
          var evStart=new Date(ev.start),evEnd=new Date(ev.end);
          var snTime=document.createElement('span');
          snTime.style.cssText='font-weight:600;white-space:nowrap;margin-left:2px;';
          snTime.textContent=fmtTime(evStart.getHours()*60+evStart.getMinutes())+'-'+fmtTime(evEnd.getHours()*60+evEnd.getMinutes());
          snHdr.appendChild(snTime);

          // Date badge (if not today)
          var evDay=new Date(evStart.getFullYear(),evStart.getMonth(),evStart.getDate());
          if(evDay.getTime()!==todayD.getTime()){
            var snDate=document.createElement('span');
            snDate.style.cssText='opacity:.6;font-size:.4rem;';
            snDate.textContent=evStart.getDate()+'/'+(evStart.getMonth()+1);
            snHdr.appendChild(snDate);
          }

          // Spacer
          var snSpacer=document.createElement('div');snSpacer.style.cssText='flex:1;';
          snHdr.appendChild(snSpacer);

          // Color picker button
          var snColorBtn=document.createElement('div');
          snColorBtn.style.cssText='width:12px;height:12px;border-radius:50%;background:'+bgColor+';border:2px solid rgba(0,0,0,.2);cursor:pointer;flex-shrink:0;';
          snColorBtn.title='Change color';
          var snColorPopup=document.createElement('div');
          snColorPopup.style.cssText='display:none;position:absolute;top:24px;right:4px;background:'+(isDk?'#2a2a3a':'#fff')+';border-radius:8px;padding:6px;'
            +'box-shadow:0 4px 20px rgba(0,0,0,.3);z-index:50;pointer-events:auto;';
          var snColorGrid=document.createElement('div');
          snColorGrid.style.cssText='display:grid;grid-template-columns:repeat(4,1fr);gap:4px;';
          Object.keys(snColors).forEach(function(cn){
            var dot=document.createElement('div');
            dot.style.cssText='width:18px;height:18px;border-radius:50%;background:'+snColors[cn]+';cursor:pointer;border:2px solid '+(cn===meta.color?'rgba(0,0,0,.5)':'transparent')+';transition:transform .1s;';
            dot.title=cn;
            dot.addEventListener('mouseenter',function(){dot.style.transform='scale(1.2)';});
            dot.addEventListener('mouseleave',function(){dot.style.transform='scale(1)';});
            (function(cn,dot){
              dot.addEventListener('click',function(e3){
                e3.stopPropagation();
                meta.color=cn;meta.bgHex=null;
                var newBg=snColors[cn];
                sn.style.background=newBg;
                sn.style.color=snTextColor(newBg);
                snColorBtn.style.background=newBg;
                snColorPopup.style.display='none';
                saveStickyMeta(ev,meta);
              });
            })(cn,dot);
            snColorGrid.appendChild(dot);
          });
          snColorPopup.appendChild(snColorGrid);
          snColorBtn.addEventListener('click',function(e3){
            e3.stopPropagation();
            snColorPopup.style.display=snColorPopup.style.display==='none'?'block':'none';
          });
          // Close popup on outside click
          document.addEventListener('click',function(e3){
            if(!snColorBtn.contains(e3.target)&&!snColorPopup.contains(e3.target))
              snColorPopup.style.display='none';
          });
          snHdr.appendChild(snColorBtn);

          // Delete button
          var snDel=document.createElement('div');
          snDel.style.cssText='font-size:.55rem;cursor:pointer;opacity:.4;flex-shrink:0;font-weight:700;transition:opacity .15s;margin-left:2px;';
          snDel.textContent='\u2715';snDel.title='Delete task';
          snDel.addEventListener('mouseenter',function(){snDel.style.opacity='1';snDel.style.color='#e74c3c';});
          snDel.addEventListener('mouseleave',function(){snDel.style.opacity='.4';snDel.style.color='';});
          (function(ev,sn){
            var lid=ev.taskListId||ev._listId||planCalId;
            snDel.addEventListener('click',function(e2){
              e2.stopPropagation();
              if(!lid)return;
              sn.style.opacity='.3';
              deletePlanTask(lid,ev.id).then(function(){
                // Remove from all local arrays
                planEvents=planEvents.filter(function(x){return x.id!==ev.id;});
                _activeListTasks=_activeListTasks.filter(function(x){return x.id!==ev.id;});
                _leftTasks=_leftTasks.filter(function(x){return x.id!==ev.id;});
                sn.remove();
                showToast('\uD83D\uDDD1 Deleted');
                // Refresh the todo lists
                if(_activeListId)renderTodoItems(_activeListTasks,_activeListId);
                if(_leftListId)renderLeftItems(_leftTasks,_leftListId);
              }).catch(function(er){showToast('\u274C '+er.message);sn.style.opacity='1';});
            });
          })(ev,sn);
          snHdr.appendChild(snDel);

          sn.appendChild(snHdr);
          sn.appendChild(snColorPopup);

          // --- Body: image or text ---
          var hasImage=meta.imageUrl&&meta.imageUrl.length>10;
          if(hasImage){
            sn.style.padding='0';sn.style.overflow='hidden';sn.style.borderRadius='4px';
            var snImg=document.createElement('img');
            snImg.src=meta.imageUrl;
            snImg.style.cssText='width:100%;display:block;object-fit:cover;min-height:40px;cursor:grab;pointer-events:auto;flex:1;';
            snImg.draggable=false;
            snImg.ondblclick=function(e2){e2.stopPropagation();window.open(meta.imageUrl,'_blank');};
            sn.appendChild(snImg);
            // Show title if meta.title exists
            if(meta.title){
              var snTitle=document.createElement('div');
              snTitle.style.cssText='padding:3px 6px;font-size:.5rem;font-weight:600;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;background:'+bgColor+';color:'+txtClr+';';
              snTitle.textContent=meta.title;
              sn.appendChild(snTitle);
            }
            // Right-click to add/edit title
            (function(sn,meta,ev){
              sn.addEventListener('contextmenu',function(e6){
                e6.preventDefault();e6.stopPropagation();
                var t=prompt('Image title:',meta.title||'');
                if(t!==null){
                  meta.title=t.trim()||'';
                  saveStickyMeta(ev,meta);
                  _renderGantt2();
                }
              });
            })(sn,meta,ev);
          }else{
            var snBody=document.createElement('div');
            snBody.className='zs-autofit';
            snBody.style.cssText='flex:1;padding:6px 8px;font-weight:600;line-height:1.3;word-break:break-word;overflow:hidden;'
              +(isDonePlan?'text-decoration:line-through;opacity:.5;':'');
            snBody.textContent=meta.richText||displayName;
            snBody.contentEditable=false;
            snBody.addEventListener('dblclick',function(e2){
              e2.stopPropagation();
              snBody.contentEditable=true;
              snBody.style.cursor='text';
              sn.style.cursor='text';
              snBody.focus();
            });
            snBody.addEventListener('blur',function(){
              snBody.contentEditable=false;
              snBody.style.cursor='';
              sn.style.cursor='grab';
              var newText=snBody.textContent.trim();
              if(newText&&newText!==displayName){
                meta.richText=snBody.innerHTML;
                var newSummary=newText+(isDonePlan?' done':'');
                var lid2=ev.taskListId||ev._listId||planCalId;
                updatePlanTask(lid2,ev.id,{title:newSummary}).then(function(){
                  ev.summary=newSummary;
                  saveStickyMeta(ev,meta);
                  showToast('\u2705 Updated');
                }).catch(function(er){showToast('\u274C '+er.message);});
              }else{
                saveStickyMeta(ev,meta);
              }
            });
            snBody.addEventListener('mousedown',function(e2){
              if(snBody.contentEditable==='true')e2.stopPropagation();
            });
            snBody.addEventListener('keydown',function(e2){
              if(e2.key==='Escape'){snBody.blur();}
              e2.stopPropagation();
            });
            sn.appendChild(snBody);
          }

          // --- Click to highlight time slots ---
          (function(sn,ev){
            sn.addEventListener('click',function(e5){
              if(e5.target.closest('[contenteditable="true"]'))return;
              if(_hlActive===ev.id){clearCellHighlight();sn.style.outline='';}
              else{clearCellHighlight();highlightCellsForEvent(ev);sn.style.outline='2px solid #f59e0b';}
            });
          })(sn,ev);

          // --- Resize handle (bottom-right corner) ---
          var snResize=document.createElement('div');
          snResize.style.cssText='position:absolute;bottom:0;right:0;width:14px;height:14px;cursor:nwse-resize;opacity:.3;font-size:8px;line-height:14px;text-align:center;';
          snResize.textContent='\u25E2';
          (function(sn,meta,ev,snResize){
            snResize.addEventListener('mousedown',function(e4){
              e4.stopPropagation();e4.preventDefault();
              var sx=e4.clientX,sy=e4.clientY,ow=meta.w,oh=meta.h;
              function onM(mv){
                var nw=Math.max(100,ow+(mv.clientX-sx));
                var nh=Math.max(60,oh+(mv.clientY-sy));
                meta.w=nw;meta.h=nh;
                sn.style.width=nw+'px';sn.style.minHeight=nh+'px';sn.style.height=nh+'px';
                var af=sn.querySelector('.zs-autofit');
                if(af)autoSizeText(af,sn);
              }
              function onU(){
                document.removeEventListener('mousemove',onM);
                document.removeEventListener('mouseup',onU);
                var af=sn.querySelector('.zs-autofit');
                if(af)autoSizeText(af,sn);
                saveStickyMeta(ev,meta);
              }
              document.addEventListener('mousemove',onM);
              document.addEventListener('mouseup',onU);
            });
          })(sn,meta,ev,snResize);
          sn.appendChild(snResize);

          // --- Drag handling (no forbidden zones) ---
          (function(sn,meta,ev){
            var dragging=false,sx,sy,ox,oy;
            function startDrag(cx,cy){
              dragging=true;sx=cx;sy=cy;ox=meta.x;oy=meta.y;
              sn.style.cursor='grabbing';sn.style.opacity='.85';sn.style.zIndex='30';
            }
            function moveDrag(cx,cy){
              if(!dragging)return;
              var nx=ox+(cx-sx),ny=oy+(cy-sy);
              var maxX=cW-meta.w,maxY=cH-20;
              nx=Math.max(0,Math.min(nx,maxX));ny=Math.max(0,Math.min(ny,maxY));
              meta.x=nx;meta.y=ny;sn.style.left=nx+'px';sn.style.top=ny+'px';
            }
            function endDrag(){
              if(!dragging)return;dragging=false;
              sn.style.cursor='grab';sn.style.opacity='1';sn.style.zIndex='11';
              saveStickyMeta(ev,meta);
            }
            // Mouse events
            sn.addEventListener('mousedown',function(e3){
              if(e3.target.closest('.zooper-sticky div[contenteditable="true"]'))return;
              if(e3.button!==0)return;e3.preventDefault();
              startDrag(e3.clientX,e3.clientY);
            });
            document.addEventListener('mousemove',function(mv){moveDrag(mv.clientX,mv.clientY);});
            document.addEventListener('mouseup',function(){endDrag();});
            // Touch events for Android
            sn.addEventListener('touchstart',function(e3){
              if(e3.target.closest('.zooper-sticky div[contenteditable="true"]'))return;
              var t=e3.touches[0];startDrag(t.clientX,t.clientY);
            },{passive:true});
            document.addEventListener('touchmove',function(mv){
              if(!dragging)return;var t=mv.touches[0];moveDrag(t.clientX,t.clientY);
              mv.preventDefault();
            },{passive:false});
            document.addEventListener('touchend',function(){endDrag();});
          })(sn,meta,ev);

          stickyLayer.appendChild(sn);
          // Autofit text using the existing global autoSizeText function
          var afEl=sn.querySelector('.zs-autofit');
          if(afEl){
            setTimeout(function(){autoSizeText(afEl,sn);},20);
          }
        });
        } // end renderAllStickyNotes

        // Call renderAllStickyNotes after initial planEvents are loaded
        setTimeout(function(){renderAllStickyNotes();},100);
        // ─── PASTE IMAGE handler (Ctrl+V with image in clipboard) ───
        root.addEventListener('paste',function(pe){
          if(!planCalId)return;
          var items=pe.clipboardData&&pe.clipboardData.items;
          if(!items)return;
          for(var i=0;i<items.length;i++){
            if(items[i].type.indexOf('image')!==-1){
              pe.preventDefault();
              var blob=items[i].getAsFile();
              var rd=new FileReader();
              rd.onload=function(re){
                showToast('\u23F3 Uploading pasted image...');
                uploadToImgBB(re.target.result).then(function(url){
                  if(!url){showToast('\u274C Upload failed');return;}
                  var now2=new Date();var curMin=now2.getHours()*60+now2.getMinutes();
                  var snapMin=Math.round(curMin/30)*30;
                  var startT=new Date(now2.getFullYear(),now2.getMonth(),now2.getDate(),Math.floor(snapMin/60),snapMin%60,0);
                  var endT=new Date(startT.getTime()+1800000);
                  var metaStr='<!--STICKYMETA:'+JSON.stringify({x:10,y:10,w:200,h:150,color:'white',imageUrl:url})+'-->';
                  createCalendarEvent(planCalId,'\uD83D\uDDBC '+fmtTime(curMin),startT,endT,metaStr).then(function(){
                    showToast('\u2705 Image pasted!');_renderGantt2();
                  }).catch(function(er){showToast('\u274C '+er.message);});
                });
              };
              rd.readAsDataURL(blob);
              break;
            }
          }
        });

      }catch(err){body.innerHTML='<div style="text-align:center;padding:10px;color:#e55;font-size:.5rem">\u26A0\uFE0F '+err.message+'</div>';}
    }


    async function _renderFruit() {
      body.innerHTML = '<div style="text-align:center;padding:40px;color:#888;font-size:.7rem;">Loading fruit data...</div>';
      var now = new Date();
      var isDk = _state.theme !== 'light';
      var txt = isDk ? '#ddd' : '#222';
      var bg2 = isDk ? 'rgba(255,255,255,.04)' : 'rgba(0,0,0,.03)';
      var fruitStart = new Date(2026,0,14); fruitStart.setHours(0,0,0,0);

      function getLocalDateStr(dtObj) {
        var y = dtObj.getFullYear();
        var m = String(dtObj.getMonth() + 1).padStart(2, '0');
        var dVal = String(dtObj.getDate()).padStart(2, '0');
        return y + '-' + m + '-' + dVal;
      }

      // Inject hover styles
      if (!document.getElementById('fruit-tracker-box-css')) {
        var sty = document.createElement('style'); sty.id = 'fruit-tracker-box-css';
        sty.textContent = '.fruit-tracker-box:hover { border-color: #6c8fff !important; background: rgba(108,143,255,0.15) !important; transform: scale(1.15); }';
        document.head.appendChild(sty);
      }

      try {
        var allEv = await fetchCalendarEvents(fruitStart, new Date(now.getFullYear(),now.getMonth(),now.getDate()+1));
        var fruitEv = (allEv||[]).filter(function(e){ return (e.calendarName||'').toLowerCase()==="!40's fruit" && !e.allDay; });
        
        // Group by local date
        var dayMap = {};
        fruitEv.forEach(function(e){
          var d = getLocalDateStr(new Date(e.start));
          if(!dayMap[d]) dayMap[d] = 0;
          dayMap[d]++;
        });
        
        var days = [];
        var d = new Date(fruitStart);
        var todayStr = getLocalDateStr(now);
        while(d <= now) {
          var k = getLocalDateStr(d);
          days.push({date:k, count: dayMap[k]||0, dow: d.getDay()});
          d = new Date(d.getTime()+86400000);
        }
        days.reverse();
        
        var totalSlots = days.length * 16;
        var totalChecked = days.reduce(function(s,d){return s+d.count;},0);
        var pct = totalSlots>0 ? Math.round(totalChecked/totalSlots*100) : 0;
        var dn = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
        var mn = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

        var html = '<div style="padding:16px;color:'+txt+';font-family:var(--font);overflow-y:auto;height:100%;">';
        html += '<div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;flex-wrap:wrap;">';
        html += '<h2 style="margin:0;font-size:1rem;">\uD83C\uDF4E !40s Fruit Tracker</h2>';
        html += '<span style="background:#10b981;color:#fff;padding:2px 8px;border-radius:4px;font-size:.55rem;font-weight:600;">'+pct+'% ('+totalChecked+'/'+totalSlots+')</span>';
        html += '<span style="opacity:.5;font-size:.55rem;">5 min each \u2022 16/day \u2022 80 min target</span>';
        html += '</div>';

        // Grid: each day = row with 16 boxes
        html += '<div style="font-size:.5rem;display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:0 16px;">';        var curMonth = '';
        days.forEach(function(dy){
          var dt = new Date(dy.date+'T12:00:00');
          var mLabel = mn[dt.getMonth()]+' '+dt.getFullYear();
          if(mLabel !== curMonth) {
            curMonth = mLabel;
            html += '<div style="font-weight:700;font-size:.6rem;margin:8px 0 4px;opacity:.6;">'+mLabel+'</div>';
          }
          var isToday = dy.date === todayStr;
          var isFri = dy.dow === 5;
          html += '<div style="display:flex;align-items:center;gap:2px;margin-bottom:1px;padding:1px 2px;border-radius:3px;'+(isToday?'border:1px solid #4285f4;box-shadow:0 0 6px rgba(66,133,244,.4);':'border:1px solid transparent;')+(isFri?'opacity:.5;':'')+'">';
          html += '<span style="width:24px;font-size:.4rem;opacity:.6;">'+dn[dy.dow].slice(0,2)+'</span>';
          html += '<span style="width:16px;font-size:.4rem;opacity:.5;">'+dt.getDate()+'</span>';
          
          // Get events for this day
          var dayEvts = fruitEv.filter(function(e) {
            return getLocalDateStr(new Date(e.start)) === dy.date;
          });
          dayEvts.sort(function(a, b) {
            return new Date(a.start).getTime() - new Date(b.start).getTime();
          });
          
          for(var i=0;i<16;i++){
            var ev = dayEvts[i];
            var checked = !!ev;
            var timeStr = ev ? new Date(ev.start).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '';
            var titleStr = ev ? (ev.summary + ' (' + timeStr + ')') : 'Add fruit entry';
            var safeSummary = ev ? (typeof esc === 'function' ? esc(ev.summary) : ev.summary.replace(/"/g, '&quot;')) : '';
            var safeTitle = typeof esc === 'function' ? esc(titleStr) : titleStr.replace(/"/g, '&quot;');
            
            html += '<div class="fruit-tracker-box" data-date="' + dy.date + '" data-idx="' + i + '"' +
              (ev ? ' data-ev-id="' + ev.id + '" data-cal-id="' + ev.calendarId + '" data-summary="' + safeSummary + '"' : '') +
              ' title="' + safeTitle + '"' +
              ' style="width:12px;height:12px;cursor:pointer;border-radius:2px;border:1px solid '+(isDk?'rgba(255,255,255,.15)':'rgba(0,0,0,.12)')+';background:transparent;display:flex;align-items:center;justify-content:center;font-size:10px;line-height:1;transition:all .15s;">' +
              (checked?'\uD83C\uDF4E':'') +
              '</div>';
          }
          html += '<span style="font-size:.4rem;margin-left:4px;opacity:.6;">'+dayEvts.length+'/16</span>';
          html += '</div>';
        });
        html += '</div></div>';
        body.innerHTML = html;
        
        // Attach drag selection handlers to the boxes
        var isDragging = false;
        var dragMode = null;
        var draggedBoxes = [];
        var clickTimeout = null;
        var pendingSaveFn = null;
        var pendingBox = null;

        var onMouseUp = async function() {
          if (!isDragging) return;
          isDragging = false;
          document.removeEventListener('mouseup', onMouseUp);

          if (draggedBoxes.length === 0) return;

          var executeSave = async function() {
            if (typeof ensureGoogleToken === 'function') await ensureGoogleToken();

            showToast("⏳ Saving " + draggedBoxes.length + " changes...");

            try {
              if (dragMode === 'check') {
                var additionsByDate = {};
                draggedBoxes.forEach(function(box) {
                  var dDate = box.getAttribute('data-date');
                  if (!additionsByDate[dDate]) additionsByDate[dDate] = 0;
                  additionsByDate[dDate]++;
                });

                var fruitCalId = '';
                try {
                  var cals = await getCalendarList();
                  var fCal = cals.find(function(c) { return (c.summary||'').toLowerCase() === "!40's fruit"; });
                  if (fCal) fruitCalId = fCal.id;
                } catch(e) {}

                if (!fruitCalId) {
                  showToast("❌ Could not find '!40's Fruit' calendar!");
                  _renderFruit();
                  return;
                }

                var promises = [];
                var dates = Object.keys(additionsByDate);
                for (var i = 0; i < dates.length; i++) {
                  var dyDate = dates[i];
                  var count = additionsByDate[dyDate];

                  var parts = dyDate.split('-');
                  var dayDate = new Date(parseInt(parts[0]), parseInt(parts[1])-1, parseInt(parts[2]));
                  var dayMs = dayDate.getTime();

                  var dayEvtsForClick = fruitEv.filter(function(e) {
                    return getLocalDateStr(new Date(e.start)) === dyDate;
                  });

                  var occupiedSlots = {};
                  dayEvtsForClick.forEach(function(e) {
                    var startMs = new Date(e.start).getTime();
                    var slotIdx = Math.floor((startMs - dayMs) / 1800000);
                    if (slotIdx >= 0 && slotIdx < 48) {
                      occupiedSlots[slotIdx] = true;
                    }
                  });

                  var preferred = [12, 13, 14, 33, 34, 35];
                  var allSlots = [];
                  preferred.forEach(function(s) { allSlots.push(s); });
                  for (var s = 0; s < 48; s++) {
                    if (preferred.indexOf(s) === -1) {
                      allSlots.push(s);
                    }
                  }

                  for (var c = 0; c < count; c++) {
                    var targetSlot = -1;
                    for (var j = 0; j < allSlots.length; j++) {
                      var slotCandidate = allSlots[j];
                      if (!occupiedSlots[slotCandidate]) {
                        targetSlot = slotCandidate;
                        break;
                      }
                    }

                    if (targetSlot === -1) {
                      showToast("⚠️ No empty slots left on " + dyDate);
                      break;
                    }

                    occupiedSlots[targetSlot] = true;

                    var slotStartMs = dayMs + targetSlot * 1800000;
                    var slotEndMs = dayMs + (targetSlot + 1) * 1800000;
                    var startD = new Date(slotStartMs);
                    var endD = new Date(slotEndMs);

                    promises.push(createCalendarEvent(fruitCalId, "!40's Fruit", startD, endD, ''));
                  }
                }
                await Promise.all(promises);
              } else {
                // Deletions
                var promises = [];
                for (var i = 0; i < draggedBoxes.length; i++) {
                  var box = draggedBoxes[i];
                  var evId = box.getAttribute('data-ev-id');
                  var calId = box.getAttribute('data-cal-id');
                  if (evId && calId) {
                    promises.push(deleteCalendarEvent(calId, evId));
                  }
                }
                await Promise.all(promises);
              }
              showToast("✅ Changes saved!");
            } catch (e) {
              showToast("❌ " + e.message);
            }
            _renderFruit();
          };

          if (draggedBoxes.length === 1) {
            pendingBox = draggedBoxes[0];
            pendingSaveFn = executeSave;
            clickTimeout = setTimeout(function() {
              if (pendingSaveFn) {
                pendingSaveFn();
                pendingSaveFn = null;
                clickTimeout = null;
                pendingBox = null;
              }
            }, 220);
          } else {
            await executeSave();
          }
        };

        var boxes = body.querySelectorAll('.fruit-tracker-box');
        boxes.forEach(function(box) {
          box.addEventListener('mousedown', function(e) {
            if (e.button !== 0) return;

            // Clear any active clickTimeout (single click pending save)
            if (clickTimeout) {
              clearTimeout(clickTimeout);
              clickTimeout = null;
              if (pendingBox && pendingBox !== box && pendingSaveFn) {
                // If it's a different box, execute its pending save immediately
                pendingSaveFn();
              }
              pendingSaveFn = null;
              pendingBox = null;
            }

            isDragging = true;
            var isBoxChecked = !!box.getAttribute('data-ev-id');
            dragMode = isBoxChecked ? 'uncheck' : 'check';
            draggedBoxes = [box];

            if (dragMode === 'check') {
              box.innerHTML = '🍎';
            } else {
              box.innerHTML = '';
            }
            box.style.opacity = '0.5';

            document.addEventListener('mouseup', onMouseUp);
            e.preventDefault();
          });

          box.addEventListener('mouseenter', function() {
            if (!isDragging) return;
            if (draggedBoxes.indexOf(box) !== -1) return;

            var isBoxChecked = !!box.getAttribute('data-ev-id');
            if (dragMode === 'check' && !isBoxChecked) {
              draggedBoxes.push(box);
              box.innerHTML = '🍎';
              box.style.opacity = '0.5';
            } else if (dragMode === 'uncheck' && isBoxChecked) {
              draggedBoxes.push(box);
              box.innerHTML = '';
              box.style.opacity = '0.5';
            }
          });

          box.addEventListener('dblclick', async function(e) {
            e.preventDefault();
            e.stopPropagation();

            if (clickTimeout) {
              clearTimeout(clickTimeout);
              clickTimeout = null;
            }
            pendingSaveFn = null;
            pendingBox = null;

            var evId = box.getAttribute('data-ev-id');
            var calId = box.getAttribute('data-cal-id');
            var currentSummary = box.getAttribute('data-summary') || '';
            var dyDate = box.getAttribute('data-date');

            // Restore visual state
            if (evId) {
              box.innerHTML = '🍎';
            } else {
              box.innerHTML = '';
            }
            box.style.opacity = '1';

            if (typeof ensureGoogleToken === 'function') await ensureGoogleToken();

            if (evId) {
              var newSummary = prompt("Edit text for this fruit entry:", currentSummary);
              if (newSummary === null) return; // user cancelled
              newSummary = newSummary.trim();
              if (newSummary === "") {
                // Delete
                showToast("⏳ Deleting entry...");
                try {
                  await deleteCalendarEvent(calId, evId);
                  showToast("✅ Entry deleted!");
                } catch(err) {
                  showToast("❌ " + err.message);
                }
              } else {
                // Update
                showToast("⏳ Updating entry...");
                try {
                  await updateCalendarEvent(calId, evId, { summary: newSummary });
                  showToast("✅ Entry updated!");
                } catch(err) {
                  showToast("❌ " + err.message);
                }
              }
            } else {
              var newSummary = prompt("Enter text for new fruit entry:", "!40's Fruit");
              if (newSummary === null) return; // user cancelled
              newSummary = newSummary.trim();
              if (newSummary === "") return;

              showToast("⏳ Creating entry...");
              try {
                var fruitCalId = '';
                try {
                  var cals = await getCalendarList();
                  var fCal = cals.find(function(c) { return (c.summary||'').toLowerCase() === "!40's fruit"; });
                  if (fCal) fruitCalId = fCal.id;
                } catch(e) {}

                if (!fruitCalId) {
                  showToast("❌ Could not find '!40's Fruit' calendar!");
                  _renderFruit();
                  return;
                }

                // Find slot following priority
                var parts = dyDate.split('-');
                var dayDate = new Date(parseInt(parts[0]), parseInt(parts[1])-1, parseInt(parts[2]));
                var dayMs = dayDate.getTime();

                var dayEvtsForClick = fruitEv.filter(function(evObj) {
                  return getLocalDateStr(new Date(evObj.start)) === dyDate;
                });

                var occupiedSlots = {};
                dayEvtsForClick.forEach(function(evObj) {
                  var startMs = new Date(evObj.start).getTime();
                  var slotIdx = Math.floor((startMs - dayMs) / 1800000);
                  if (slotIdx >= 0 && slotIdx < 48) {
                    occupiedSlots[slotIdx] = true;
                  }
                });

                var preferred = [12, 13, 14, 33, 34, 35];
                var allSlots = [];
                preferred.forEach(function(s) { allSlots.push(s); });
                for (var s = 0; s < 48; s++) {
                  if (preferred.indexOf(s) === -1) {
                    allSlots.push(s);
                  }
                }

                var targetSlot = -1;
                for (var j = 0; j < allSlots.length; j++) {
                  var slotCandidate = allSlots[j];
                  if (!occupiedSlots[slotCandidate]) {
                    targetSlot = slotCandidate;
                    break;
                  }
                }

                if (targetSlot === -1) {
                  showToast("⚠️ No empty slots left on " + dyDate);
                  _renderFruit();
                  return;
                }

                var slotStartMs = dayMs + targetSlot * 1800000;
                var slotEndMs = dayMs + (targetSlot + 1) * 1800000;
                var startD = new Date(slotStartMs);
                var endD = new Date(slotEndMs);

                await createCalendarEvent(fruitCalId, newSummary, startD, endD, '');
                showToast("✅ Entry created!");
              } catch(err) {
                showToast("❌ " + err.message);
              }
            }
            _renderFruit();
          });
        });
      } catch(err) {
        body.innerHTML = '<div style="text-align:center;padding:40px;color:#888;">\u26A0\uFE0F '+err.message+'</div>';
      }
    }
    async function _renderStats() {
      body.innerHTML = '<div style="text-align:center;padding:40px;color:#888;font-size:.7rem;">Loading stats...</div>';
      var now = new Date();
      var isDk = _state.theme !== 'light';
      var txt = isDk ? '#ddd' : '#222';
      var bg2 = isDk ? 'rgba(255,255,255,.04)' : 'rgba(0,0,0,.03)';
      var oneJan = new Date(now.getFullYear(),0,1);
      var wkNum = Math.ceil(((now-oneJan)/86400000+oneJan.getDay()+1)/7);
      var sprintNum = Math.ceil(wkNum/2);
      var exclude = ['phases of the moon','holidays in egypt','muslim holidays',"!40's fruit"];
      var planned = {'01R':3,'02W':1,'02xO':2,'03G':2,'04G2':1,'05B':0,'06C':0,'07J':0,'08M':1,'09N':1,'10Y':1,'11L':0.5,'12k':0.5,'13S':7};
      var chartRows = [
        {type:'plan',label:'Plan: Work',cals:['01R','02W','02xO']},
        {type:'actual',label:'Sleep (Actual)',cals:['13S']},
        {type:'actual',label:'Work (Actual)',cals:['01R','02W','02xO']},
        {type:'sep'},
        {type:'plan',label:'Plan: Dev',cals:['08M','09N','10Y','03G','04G2']},
        {type:'actual',label:'Family (Actual)',cals:['06C','07J']},
        {type:'actual',label:'Dev (Actual)',cals:['08M','09N','10Y','03G','04G2']},
        {type:'sep'},
        {type:'plan',label:'Plan: Leisure',cals:['11L','12k']},
        {type:'actual',label:'Maintenance',cals:['05B']},
        {type:'actual',label:'Leisure (Actual)',cals:['11L','12k']}
      ];
      var epoch = new Date(2025,9,28); epoch.setHours(0,0,0,0);
      var spStart = (function(){var d=now.getDate()>15?new Date(now.getFullYear(),now.getMonth(),16):new Date(now.getFullYear(),now.getMonth(),1);d.setHours(0,0,0,0);return d;})();
      var spEnd = (function(){return now.getDate()>15?new Date(now.getFullYear(),now.getMonth()+1,1):new Date(now.getFullYear(),now.getMonth(),16);})();
      var ranges = [
        {id:'week',label:'This Week',s:function(){var d=new Date(now);d.setDate(d.getDate()-d.getDay());d.setHours(0,0,0,0);return d;},e:function(){var d=new Date(now);d.setDate(d.getDate()-d.getDay()+7);d.setHours(0,0,0,0);return d;}},
        {id:'sprint',label:'Sprint '+sprintNum,s:function(){return new Date(spStart);},e:function(){return new Date(spEnd);}},
        {id:'month',label:'This Month',s:function(){return new Date(now.getFullYear(),now.getMonth(),1);},e:function(){return new Date(now.getFullYear(),now.getMonth()+1,1);}},
        {id:'quarter',label:'Q'+Math.ceil((now.getMonth()+1)/3),s:function(){var q=Math.floor(now.getMonth()/3);return new Date(now.getFullYear(),q*3,1);},e:function(){var q=Math.floor(now.getMonth()/3);return new Date(now.getFullYear(),q*3+3,1);}},
        {id:'year',label:''+now.getFullYear(),s:function(){return new Date(now.getFullYear(),0,1);},e:function(){return new Date(now.getFullYear()+1,0,1);}},
        {id:'all',label:'All (Oct 28)',isTotal:true,s:function(){return new Date(epoch);},e:function(){return new Date(now.getFullYear(),now.getMonth(),now.getDate()+1);}},
        {id:'avg',label:'Avg/Day',isAvg:true,s:function(){return new Date(epoch);},e:function(){return new Date(now.getFullYear(),now.getMonth(),now.getDate()+1);}}
      ];
      try {
        var allEv = await fetchCalendarEvents(epoch, new Date(now.getFullYear(),now.getMonth(),now.getDate()+1));
        if (!allEv) allEv = [];
        allEv = allEv.filter(function(e){ return exclude.indexOf((e.calendarName||'').toLowerCase()) === -1; });
        // Debug: log per-calendar event counts
        var _dbg = {};
        allEv.forEach(function(e){ var cn=e.calendarName||'?'; if(!_dbg[cn])_dbg[cn]={count:0,hours:0}; _dbg[cn].count++; _dbg[cn].hours+=(new Date(e.end).getTime()-new Date(e.start).getTime())/3600000; });
        console.table(_dbg);
        // Also filter out all-day events from hour calculations
        allEv = allEv.filter(function(e){ return !e.allDay; });
        // Build color map
        var colorMap = {};
        allEv.forEach(function(e){ if(e.calendarName) colorMap[e.calendarName] = e.color||'#4285f4'; });

        var html = '<div style="padding:16px;color:'+txt+';font-family:var(--font);overflow-y:auto;height:100%;">';
        html += '<div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;flex-wrap:wrap;">';
        html += '<h2 style="margin:0;font-size:1rem;">\uD83D\uDCC8 Statistics</h2>';
        html += '<span style="background:#10b981;color:#fff;padding:2px 6px;border-radius:4px;font-size:.55rem;font-weight:600;">Sprint '+sprintNum+'</span>';
        html += '<span style="background:#6c8fff;color:#fff;padding:2px 6px;border-radius:4px;font-size:.55rem;font-weight:600;">W'+wkNum+'</span></div>';

        html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(360px,1fr));gap:12px;">';
        ranges.forEach(function(rng) {
          var sd = rng.s(), ed = rng.e();
          var daysElapsed = Math.max(1, Math.floor((Math.min(now.getTime(),ed.getTime()) - sd.getTime()) / 86400000) + 1);
          var evts = allEv.filter(function(e){ var es=new Date(e.start).getTime(); return es>=sd.getTime() && es<ed.getTime(); });
          // Actual hours per calendar
          var actMap = {};
          evts.forEach(function(e){
            var cn = e.calendarName||'Other';
            if(!actMap[cn]) actMap[cn]=0;
            actMap[cn] += (new Date(e.end).getTime()-new Date(e.start).getTime())/3600000;
          });
          // Find max value across all rows for scaling
          var maxVal = 1;
          chartRows.forEach(function(r){
            if(r.type==='sep') return;
            var v = 0;
            r.cals.forEach(function(cn){
              if(r.type==='plan') v += rng.isAvg?(planned[cn]||0):(planned[cn]||0)*daysElapsed;
              else v += rng.isAvg?(actMap[cn]||0)/daysElapsed:(actMap[cn]||0);
            });
            if(v>maxVal) maxVal=v;
          });

          html += '<div style="margin-bottom:16px;background:'+bg2+';border-radius:8px;padding:10px;">';
          html += '<div style="font-weight:700;font-size:.7rem;margin-bottom:8px;">'+rng.label+' <span style="font-weight:400;opacity:.5;font-size:.55rem;">('+daysElapsed+' days)</span></div>';

          chartRows.forEach(function(r){
            if(r.type==='sep'){
              html += '<div style="height:6px;"></div>';
              return;
            }
            var segs = [];
            var total = 0;
            r.cals.forEach(function(cn){
              var v = r.type==='plan' ? (rng.isAvg?(planned[cn]||0):(planned[cn]||0)*daysElapsed) : (rng.isAvg?(actMap[cn]||0)/daysElapsed:(actMap[cn]||0));
              segs.push({name:cn,val:v,color:colorMap[cn]||(r.type==='plan'?'#888':'#4285f4')});
              total += v;
            });
            var barPct = Math.min(100, total/maxVal*100);
            html += '<div style="display:flex;align-items:center;gap:4px;margin-bottom:3px;height:22px;">';
            html += '<div style="width:90px;font-size:.5rem;text-align:right;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex-shrink:0;opacity:.7;">'+r.label+'</div>';
            html += '<div style="flex:1;height:18px;background:'+(isDk?'rgba(255,255,255,.05)':'rgba(0,0,0,.05)')+';border-radius:4px;overflow:hidden;display:flex;box-shadow:inset 0 -2px 3px rgba(0,0,0,.1),0 1px 2px rgba(0,0,0,.12);border:1px solid rgba(0,0,0,.06);">';
            segs.forEach(function(sg){
              if(sg.val<=0) return;
              var w = (sg.val/maxVal*100);
              html += '<div title="'+sg.name+': '+sg.val.toFixed(1)+'h" style="width:'+w+'%;height:100%;background:linear-gradient(180deg,'+sg.color+' 55%,rgba(0,0,0,.3) 100%);box-shadow:inset 0 1px 0 rgba(255,255,255,.35);display:flex;align-items:center;justify-content:center;font-size:.4rem;color:#fff;font-weight:600;text-shadow:0 1px 1px rgba(0,0,0,.5);overflow:hidden;white-space:nowrap;min-width:0;">';
              if(w>4) html += sg.val.toFixed(0)+'.';
              html += '</div>';
            });
            html += '</div>';
            html += '<div style="font-size:.5rem;width:35px;text-align:left;opacity:.6;">'+total.toFixed(1)+'</div>';
            html += '</div>';
          });
          html += '</div>';
        });

        html += '</div>';
        body.innerHTML = html;
        // Custom range handler
        // custom range placeholder
      } catch(err) {
        body.innerHTML = '<div style="text-align:center;padding:40px;color:#888;font-size:.7rem;">\u26A0\uFE0F '+err.message+'</div>';
      }
    }
        async function _render() {
      _fc.calTheme = _state.theme; _fc.w = body.clientWidth; _fc.h = body.clientHeight;
      const now = new Date(), days = _days();
      var sd, oDays = days; if (_state.view==='2week'){var hm2=now.getMonth()*2+(now.getDate()>15?1:0)+_state.offset;var hY2=now.getFullYear()+Math.floor(hm2/24);hm2=((hm2%24)+24)%24;var hM2=Math.floor(hm2/2),hH2=hm2%2;if(hH2===1){sd=new Date(hY2,hM2,16);oDays=new Date(hY2,hM2+1,0).getDate()-15;}else{sd=new Date(hY2,hM2,1);oDays=15;}}else{sd=new Date(now);sd.setDate(now.getDate()-now.getDay()+_state.offset);}sd.setHours(0,0,0,0);
      const ed = new Date(sd); ed.setDate(sd.getDate() + oDays);
      body.innerHTML = '<div style="text-align:center;padding:40px;color:#888;font-size:.7rem;">Loading...</div>';
      try {
        const ev = await fetchCalendarEvents(sd, ed);
        if (ev && ev.length > 0) _drawGantt(body, panel, _fc, ev, sd, oDays, now, 50, _state.theme);
        else body.innerHTML = '<div style="text-align:center;padding:40px;color:#888;font-size:.7rem;">No events</div>';
      } catch (err) {
        body.innerHTML = '<div style="text-align:center;padding:40px;color:#888;font-size:.7rem;">\u26A0\uFE0F ' + (err.message||'Error') + '</div>';
      }
    }
    let lastW = panel.clientWidth, lastH = panel.clientHeight;
    const ro = new ResizeObserver(() => {
      const w = panel.clientWidth;
      const h = panel.clientHeight;
      const dw = Math.abs(w - lastW);
      const dh = Math.abs(h - lastH);
      if (dw > 20 || dh > 20) {
        lastW = w;
        lastH = h;
        clearTimeout(ro._t);
        ro._t = setTimeout(_renderPage, 400);
      } else {
        lastW = w;
        lastH = h;
      }
    });
    ro.observe(panel);
    panel._ganttRender = _renderPage;
    var _autoTimer = setInterval(_renderPage, 15*60*1000);
    panel._autoTimer = _autoTimer;
    _updatePageDotsRef = _updatePageDots;
    _renderPageRef = _renderPage;
    _renderPage();
    // Expose rendering API for canvas widgets
    window._overlayAPI = {
      renderInto: function(targetBody, pageIdx, offset, theme, view) {
        var origBody = body;
        var origPage = _state.page, origOff = _state.offset, origTh = _state.theme, origV = _state.view;
        body = targetBody;
        _state.page = pageIdx; _state.offset = offset||0; _state.theme = theme||'light'; _state.view = view||'2week';
        _renderPage();
        setTimeout(function() {
          if (body === targetBody) { body = origBody; }
          _state.page = origPage; _state.offset = origOff; _state.theme = origTh; _state.view = origV;
        }, 30000);
      }
    };
  }
  // Expose open/close globally for widget bootstrap
  window._openGanttOverlay = openGanttOverlay;
  window._closeGanttOverlay = closeGanttOverlay;
  function handleOverlayAction(pageIdx) {
    const cw = document.getElementById('cw');
    const isEmbedded = _overlayEl && cw && cw.contains(_overlayEl);
    if (_overlayEl && _state.page === pageIdx && !isEmbedded) {
      closeGanttOverlay();
    } else {
      if (isEmbedded) {
        closeGanttOverlay(true);
      }
      openGanttOverlay(pageIdx);
    }
  }

  // Bind 5 top toolbar buttons (overlay mode)
  var _tbBtns = [
    {id:'overlay-today-btn', page:0},
    {id:'overlay-gantt-btn', page:1},
    {id:'overlay-stats-btn', page:2},
    {id:'overlay-fruit-btn', page:3},
    {id:'overlay-gantt2-btn', page:4},
    {id:'overlay-life-btn', page:5}
  ];
  _tbBtns.forEach(function(cfg) {
    var b = document.getElementById(cfg.id);
    if (b) b.onclick = function() {
      handleOverlayAction(cfg.page);
    };
  });
  // Bind 4 vertical toolbar buttons (widget placement mode)
  var _vtbBtns = [
    {id:'mtb-today', page:0},
    {id:'mtb-gantt-overlay', page:1},
    {id:'mtb-stats', page:2},
    {id:'mtb-fruits', page:3},
    {id:'mtb-gantt2', page:4}
  ];
  _vtbBtns.forEach(function(cfg) {
    var b = document.getElementById(cfg.id);
    if (b) b.onclick = function() {
      placeOverlayPageWidget(cfg.page);
    };
  });
  var mtbLife = document.getElementById('mtb-life');
  if (mtbLife) mtbLife.onclick = function() {
    if (typeof window.createLifeWidget === 'function') window.createLifeWidget();
  };
  document.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.contentEditable === 'true') {
      var pageMap = {'1':0, '2':1, '3':2, '4':3, '5':4, '6':5};
      var isShortcutKey = !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && 
                          (pageMap[e.key] !== undefined || e.key === 'h' || e.key === 'H' || e.key === '\u0623' || e.key === '\u0627');
      if (isShortcutKey && (e.target.id === 'si' || e.target.id === 'qi')) {
        e.preventDefault();
        e.target.blur();
      } else {
        return;
      }
    }
    if (e.key === 'Escape' && _overlayEl) { closeGanttOverlay(); e.preventDefault(); return; }
    // Plain 1-6 to open overlay pages
    if (!e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
      var pageMap = {'1':0, '2':1, '3':2, '4':3, '5':4, '6':5};
      if (pageMap[e.key] !== undefined) {
        handleOverlayAction(pageMap[e.key]);
        e.preventDefault(); return;
      }
    }
    // Shift+1-6 to place widget on canvas
    if (e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
      var widgetMap = {'!':0, '@':1, '#':2, '$':3, '%':4, '^':5, '1':0, '2':1, '3':2, '4':3, '5':4, '6':5};
      if (widgetMap[e.key] !== undefined) {
        placeOverlayPageWidget(widgetMap[e.key]);
        e.preventDefault(); return;
      }
    }
    if ((e.key === 'h' || e.key === 'H' || e.key === '\u0623' || e.key === '\u0627') && !e.ctrlKey && !e.metaKey && !e.altKey) {
      handleOverlayAction(4);
      e.preventDefault();
    }
  });
})();

// ─── Embed Web View Widget ───

// ── Place Overlay Page as Canvas Widget ──
var _overlayPageNames = ['2Days','Gantt Chart','Statistics','Fruit Tracker','Zooper','Life'];
var _overlayPageEmojis = ['\uD83D\uDCC5','\uD83D\uDCCA','\uD83D\uDCC8','\uD83C\uDF4E','\uD83C\uDFC3','\uD83E\uDDEC'];
async function placeOverlayPageWidget(pageIdx) {
  if (!_googleAccessToken) {
    if (window._authPopupInProgress) return;
    try {
      window._authPopupInProgress = true;
      if (typeof manualGoogleReAuth === 'function') { await manualGoogleReAuth(); }
      else { var result = await auth.signInWithPopup(provider); if (result.credential) cacheGoogleToken(result.credential.accessToken); }
    } catch(e) { /* widget will show sign-in button */ }
    finally { window._authPopupInProgress = false; }
  }
  var page = cp(); if (!page) return;
  var zoom = (page.zoom || 100) / 100;
  var panX = page.panX || 0, panY = page.panY || 0;
  var board = document.getElementById('miro-board');
  var rect = board.getBoundingClientRect();
  var cx = (-panX + (window.innerWidth / 2 - rect.left) / zoom);
  var cy = (-panY + (window.innerHeight / 2 - rect.top) / zoom);
  var card = { id: 'ovpage_' + Date.now(), type: 'overlay-page', overlayPage: pageIdx,
    x: cx - 450, y: cy - 250, w: 900, h: 500,
    calView: '2week', calOffset: 0, calTheme: 'light', ganttView: '2week', ganttRowHeight: 50 };
  if (!page.miroCards) page.miroCards = [];
  pushUndo(); page.miroCards.push(card); sv(); buildMiroCanvas();
  showToast(_overlayPageEmojis[pageIdx] + ' ' + _overlayPageNames[pageIdx] + ' widget added');
}


document.getElementById('mtb-embed').onclick = () => setActiveTool('embed');

// ─── Calendar List (cached) ───
async function getCalendarList() {
  if (_cachedCalendarList && (Date.now() - _cachedCalendarListTs < CALENDAR_LIST_CACHE_MS)) {
    return _cachedCalendarList;
  }
  if (typeof ensureGoogleToken === 'function') await ensureGoogleToken();
  if (!_googleAccessToken) { const e = new Error('NEEDS_AUTH'); e.needsAuth = true; throw e; }
  const res = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList', {
    headers: { 'Authorization': 'Bearer ' + _googleAccessToken }
  });
  if (res.status === 401) {
    // Token expired — clear it and throw NEEDS_AUTH
    // The calendar widget will show a "🔑 Sign in" button for user-triggered re-auth
    _googleAccessToken = null;
    try { localStorage.removeItem('sm_google_token'); localStorage.removeItem('sm_google_token_expiry'); } catch (e) {}
    const e = new Error('NEEDS_AUTH'); e.needsAuth = true; throw e;
  }
  if (!res.ok) throw new Error('Calendar list failed: ' + res.status);
  const data = await res.json();
  _cachedCalendarList = (data.items || []);
  _cachedCalendarListTs = Date.now();
  return _cachedCalendarList;
}

// ─── Fetch Events (With Caching) ───
window._eventsCache = {};
window._taskListsCache = null;
window._taskListsCacheTs = 0;
window._planTasksCache = {};
window._clearCalendarCache = function() {
  window._eventsCache = {};
  window._taskListsCache = null;
  window._taskListsCacheTs = 0;
  window._planTasksCache = {};
  console.log('[Cache] All caches cleared.');
};

async function fetchCalendarEvents(timeMin, timeMax) {
  if (typeof ensureGoogleToken === 'function') await ensureGoogleToken();
  if (!_googleAccessToken) { const e = new Error('NEEDS_AUTH'); e.needsAuth = true; throw e; }

  const key = timeMin.toISOString() + '_' + timeMax.toISOString();
  const cached = window._eventsCache[key];
  if (cached && (Date.now() - cached.ts < 60000)) {
    console.log('[Calendar Cache] Returning cached events for', key);
    return JSON.parse(JSON.stringify(cached.data));
  }

  const calendars = await getCalendarList();
  if (!calendars.length) return [];

  const allEvents = [];
  const tMin = timeMin.toISOString();
  const tMax = timeMax.toISOString();

  await Promise.all(calendars.map(async cal => {
    try {
      let pageToken = '';
      let page = 0;
      do {
        let url = 'https://www.googleapis.com/calendar/v3/calendars/' + encodeURIComponent(cal.id) + '/events?timeMin=' + tMin + '&timeMax=' + tMax + '&singleEvents=true&orderBy=startTime&maxResults=2500';
        if (pageToken) url += '&pageToken=' + encodeURIComponent(pageToken);
        const res = await fetch(url, { headers: { 'Authorization': 'Bearer ' + _googleAccessToken } });
        if (res.status === 401 || !res.ok) break;
        const data = await res.json();
        (data.items || []).forEach(ev => {
          allEvents.push({
            id: ev.id,
            calendarId: cal.id,
            summary: ev.summary || '(No title)',
            description: ev.description || '',
            start: ev.start.dateTime || ev.start.date,
            end: ev.end.dateTime || ev.end.date,
            color: ev.colorId ? null : (cal.backgroundColor || '#4285f4'),
            calendarName: cal.summary,
            allDay: !ev.start.dateTime,
          });
        });
        pageToken = data.nextPageToken || '';
        page++;
      } while (pageToken && page < 10);
    } catch (e) { /* skip individual calendar */ }
  }));

  console.log('[Stats] Fetched', allEvents.length, 'events from', calendars.length, 'calendars for', tMin.slice(0,10), 'to', tMax.slice(0,10));
  
  window._eventsCache[key] = {
    ts: Date.now(),
    data: JSON.parse(JSON.stringify(allEvents))
  };
  
  return allEvents;
}

// ═══════════════════════════════════════════════════════════════
// ─── Google Tasks API Layer ───
// ═══════════════════════════════════════════════════════════════
var _tasksListId = null;
var _tasksListIdPromise = null;
var _tasksCache = null;
var _tasksCacheTs = 0;
var TASKS_CACHE_MS = 30000; // 30 sec cache

async function getOrCreateTaskList(name) {
  if (_tasksListId) return _tasksListId;
  if (_tasksListIdPromise) return _tasksListIdPromise;
  _tasksListIdPromise = (async function() {
    if (typeof ensureGoogleToken === 'function') await ensureGoogleToken();
    if (!_googleAccessToken) throw new Error('Not authenticated');
    // List all task lists
    var res = await fetch('https://tasks.googleapis.com/tasks/v1/users/@me/lists', {
      headers: { 'Authorization': 'Bearer ' + _googleAccessToken }
    });
    if (!res.ok) throw new Error('Tasks list fetch failed: ' + res.status);
    var data = await res.json();
    var lists = data.items || [];
    var found = lists.find(function(l) { return (l.title || '').toLowerCase() === name.toLowerCase(); });
    if (found) { _tasksListId = found.id; return found.id; }
    // Create the list
    var cres = await fetch('https://tasks.googleapis.com/tasks/v1/users/@me/lists', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + _googleAccessToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: name })
    });
    if (!cres.ok) throw new Error('Tasks list create failed: ' + cres.status);
    var created = await cres.json();
    _tasksListId = created.id;
    return created.id;
  })();
  try { var id = await _tasksListIdPromise; return id; }
  finally { _tasksListIdPromise = null; }
}

// Parse task notes JSON → { start, end, sticky, imageUrl, ... }
function parseTaskNotes(notes) {
  if (!notes) return {};
  try {
    var m = notes.match(/<!--TASKMETA:(.*?)-->/);
    if (m) return JSON.parse(m[1]);
    // Try raw JSON
    if (notes.trim().startsWith('{')) return JSON.parse(notes);
  } catch(e) {}
  return {};
}

function serializeTaskNotes(meta) {
  return '<!--TASKMETA:' + JSON.stringify(meta) + '-->';
}

async function fetchPlanTasks(listId, dateFilter) {
  if (typeof ensureGoogleToken === 'function') await ensureGoogleToken();
  if (!_googleAccessToken) throw new Error('Not authenticated');

  const key = listId;
  const cached = window._planTasksCache[key];
  if (cached && (Date.now() - cached.ts < 60000)) {
    return JSON.parse(JSON.stringify(cached.data));
  }

  // Fetch all non-deleted tasks (including completed)
  var url = 'https://tasks.googleapis.com/tasks/v1/lists/' + encodeURIComponent(listId) + '/tasks?maxResults=100&showCompleted=true&showHidden=true';
  var res = await fetch(url, {
    headers: { 'Authorization': 'Bearer ' + _googleAccessToken }
  });
  if (!res.ok) throw new Error('Tasks fetch failed: ' + res.status);
  var data = await res.json();
  var tasks = (data.items || []).filter(function(t) { return t.title && t.title.trim(); });
  // Parse notes meta and convert to unified format
  const mappedTasks = tasks.map(function(t) {
    var meta = parseTaskNotes(t.notes || '');
    return {
      id: t.id,
      taskListId: listId,
      title: t.title || '',
      summary: t.title || '',
      notes: t.notes || '',
      status: t.status, // 'needsAction' or 'completed'
      isDone: t.status === 'completed',
      start: meta.start || null,
      end: meta.end || null,
      sticky: meta.sticky || null,
      imageUrl: meta.imageUrl || null,
      calendarName: '00aplan', // compatibility
      description: t.notes || '',
      _meta: meta,
      _raw: t
    };
  });

  window._planTasksCache[key] = {
    ts: Date.now(),
    data: JSON.parse(JSON.stringify(mappedTasks))
  };

  return mappedTasks;
}

var _createTaskDedup = {};
async function createPlanTask(listId, title, startDt, endDt, extraMeta) {
  if (typeof ensureGoogleToken === 'function') await ensureGoogleToken();
  if (!_googleAccessToken) throw new Error('Not authenticated');
  // Dedup guard
  var dedupKey = listId + '|' + (startDt ? startDt.toISOString() : '') + '|' + (endDt ? endDt.toISOString() : '') + '|' + (title || '');
  var now = Date.now();
  if (_createTaskDedup[dedupKey] && (now - _createTaskDedup[dedupKey]) < 15000) {
    console.warn('[DEDUP] Skipping duplicate task creation:', title);
    return { id: 'dedup_' + now, title: title };
  }
  _createTaskDedup[dedupKey] = now;
  Object.keys(_createTaskDedup).forEach(function(k) { if (now - _createTaskDedup[k] > 60000) delete _createTaskDedup[k]; });

  var meta = extraMeta || {};
  if (startDt) meta.start = startDt.toISOString();
  if (endDt) meta.end = endDt.toISOString();
  var taskBody = {
    title: title,
    notes: serializeTaskNotes(meta)
  };
  if (startDt) taskBody.due = startDt.toISOString();
  var res = await fetch('https://tasks.googleapis.com/tasks/v1/lists/' + encodeURIComponent(listId) + '/tasks', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + _googleAccessToken, 'Content-Type': 'application/json' },
    body: JSON.stringify(taskBody)
  });
  if (!res.ok) { var err = await res.text(); throw new Error('Task create failed: ' + err); }
  _tasksCache = null; // invalidate cache
  return await res.json();
}

async function updatePlanTask(listId, taskId, updates) {
  if (typeof ensureGoogleToken === 'function') await ensureGoogleToken();
  if (!_googleAccessToken) throw new Error('Not authenticated');
  var body = {};
  if (updates.title !== undefined) body.title = updates.title;
  if (updates.notes !== undefined) body.notes = updates.notes;
  if (updates.status !== undefined) body.status = updates.status;
  if (updates.due !== undefined) body.due = updates.due;
  var res = await fetch('https://tasks.googleapis.com/tasks/v1/lists/' + encodeURIComponent(listId) + '/tasks/' + encodeURIComponent(taskId), {
    method: 'PATCH',
    headers: { 'Authorization': 'Bearer ' + _googleAccessToken, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) { var err = await res.text(); throw new Error('Task update failed: ' + err); }
  _tasksCache = null;
  return await res.json();
}

async function deletePlanTask(listId, taskId) {
  // Skip API call for temporary/dedup IDs
  if (!taskId || taskId === 'temp' || taskId.startsWith('dedup_')) {
    _tasksCache = null;
    return;
  }
  if (typeof ensureGoogleToken === 'function') await ensureGoogleToken();
  if (!_googleAccessToken) throw new Error('Not authenticated');
  var res = await fetch('https://tasks.googleapis.com/tasks/v1/lists/' + encodeURIComponent(listId) + '/tasks/' + encodeURIComponent(taskId), {
    method: 'DELETE',
    headers: { 'Authorization': 'Bearer ' + _googleAccessToken }
  });
  // Treat 404 as success (task already deleted)
  if (!res.ok && res.status !== 204 && res.status !== 404) { var err = await res.text(); throw new Error('Task delete failed: ' + err); }
  _tasksCache = null;
}

async function togglePlanTaskDone(listId, taskId, isDone) {
  return updatePlanTask(listId, taskId, { status: isDone ? 'completed' : 'needsAction' });
}

// ─── Get all task lists ───
async function getAllTaskLists() {
  if (typeof ensureGoogleToken === 'function') await ensureGoogleToken();
  if (!_googleAccessToken) throw new Error('Not authenticated');

  if (window._taskListsCache && (Date.now() - window._taskListsCacheTs < 60000)) {
    return JSON.parse(JSON.stringify(window._taskListsCache));
  }

  var res = await fetch('https://tasks.googleapis.com/tasks/v1/users/@me/lists', {
    headers: { 'Authorization': 'Bearer ' + _googleAccessToken }
  });
  if (!res.ok) throw new Error('Task lists fetch failed: ' + res.status);
  var data = await res.json();
  window._taskListsCache = (data.items || []);
  window._taskListsCacheTs = Date.now();
  return window._taskListsCache;
}

// ─── Rename task list ───
async function renameTaskList(listId, newTitle) {
  if (typeof ensureGoogleToken === 'function') await ensureGoogleToken();
  if (!_googleAccessToken) throw new Error('Not authenticated');
  var res = await fetch('https://tasks.googleapis.com/tasks/v1/users/@me/lists/' + encodeURIComponent(listId), {
    method: 'PATCH',
    headers: { 'Authorization': 'Bearer ' + _googleAccessToken, 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: newTitle })
  });
  if (!res.ok) { var err = await res.text(); throw new Error('List rename failed: ' + err); }
  return await res.json();
}

// ─── Migration: Calendar 00aplan → Tasks ───
async function migratePlanCalToTasks() {
  showToast('⏳ Migrating 00aplan to Tasks...');
  try {
    var cals = await getCalendarList();
    var planCal = cals.find(function(c) { return (c.summary || '').toLowerCase() === '00aplan'; });
    if (!planCal) { showToast('❌ No 00aplan calendar found'); return; }
    var listId = await getOrCreateTaskList('00aplan');
    // Fetch all events from 00aplan (last 90 days + next 30 days)
    var sd = new Date(); sd.setDate(sd.getDate() - 90);
    var ed = new Date(); ed.setDate(ed.getDate() + 30);
    var events = await fetchCalendarEvents(sd, ed);
    var planEvts = events.filter(function(e) { return (e.calendarName || '').toLowerCase() === '00aplan'; });
    var created = 0, skipped = 0;
    for (var i = 0; i < planEvts.length; i++) {
      var ev = planEvts[i];
      var title = ev.summary || '';
      if (!title.trim()) { skipped++; continue; }
      var meta = {};
      var stickyMeta = null;
      if (ev.description) {
        var sm = ev.description.match(/<!--STICKYMETA:(.*?)-->/);
        if (sm) { try { stickyMeta = JSON.parse(sm[1]); } catch(e) {} }
      }
      meta.start = new Date(ev.start).toISOString();
      meta.end = new Date(ev.end).toISOString();
      if (stickyMeta) {
        if (stickyMeta.imageUrl) meta.imageUrl = stickyMeta.imageUrl;
        meta.sticky = stickyMeta;
      }
      var taskBody = {
        title: title,
        notes: serializeTaskNotes(meta),
        due: new Date(ev.start).toISOString()
      };
      if (title.toLowerCase().indexOf('done') !== -1) taskBody.status = 'completed';
      await fetch('https://tasks.googleapis.com/tasks/v1/lists/' + encodeURIComponent(listId) + '/tasks', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + _googleAccessToken, 'Content-Type': 'application/json' },
        body: JSON.stringify(taskBody)
      });
      created++;
      if (created % 10 === 0) showToast('⏳ Migrated ' + created + '/' + planEvts.length + '...');
    }
    showToast('✅ Migration done! ' + created + ' tasks, ' + skipped + ' skipped');
  } catch (err) {
    showToast('❌ Migration error: ' + err.message);
  }
}

// ─── Create Event ───
var _createEventDedup={};
async function createCalendarEvent(calendarId, summary, startDateTime, endDateTime, description) {
  if (!_googleAccessToken) throw new Error('Not authenticated');
  // Dedup guard: prevent creating identical events within 15 seconds
  var dedupKey=calendarId+'|'+startDateTime.toISOString()+'|'+endDateTime.toISOString()+'|'+(summary||'');
  var now=Date.now();
  if(_createEventDedup[dedupKey]&&(now-_createEventDedup[dedupKey])<15000){
    console.warn('[DEDUP] Skipping duplicate event creation:',summary);
    return {id:'dedup_'+now,summary:summary};
  }
  _createEventDedup[dedupKey]=now;
  // Clean old dedup entries
  Object.keys(_createEventDedup).forEach(function(k){if(now-_createEventDedup[k]>60000)delete _createEventDedup[k];});
  const body = {
    summary,
    description: description || '',
    start: { dateTime: startDateTime.toISOString(), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
    end: { dateTime: endDateTime.toISOString(), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
  };
  const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`, {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + _googleAccessToken, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) { const err = await res.text(); throw new Error('Create failed: ' + err); }
  if (typeof window._clearCalendarCache === 'function') window._clearCalendarCache();
  return await res.json();
}

// ─── Update Event ───
async function updateCalendarEvent(calendarId, eventId, updates) {
  if (!_googleAccessToken) throw new Error('Not authenticated');
  const body = {};
  if (updates.summary !== undefined) body.summary = updates.summary;
  if (updates.description !== undefined) body.description = updates.description;
  if (updates.start) body.start = { dateTime: updates.start.toISOString(), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone };
  if (updates.end) body.end = { dateTime: updates.end.toISOString(), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone };
  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`;
  const doFetch = async (token) => fetch(url, {
    method: 'PATCH',
    headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  let res = await doFetch(_googleAccessToken);
  // Auto-retry once on 401 with fresh token
  if (res.status === 401 && typeof ensureGoogleTokenFresh === 'function') {
    const freshToken = await ensureGoogleTokenFresh();
    if (freshToken) {
      _googleAccessToken = freshToken;
      res = await doFetch(freshToken);
    }
  }
  if (!res.ok) { const err = await res.text(); throw new Error('Update failed: ' + err); }
  if (typeof window._clearCalendarCache === 'function') window._clearCalendarCache();
  return await res.json();
}

// ─── Delete Event ───
async function deleteCalendarEvent(calendarId, eventId) {
  if (!_googleAccessToken) throw new Error('Not authenticated');
  const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`, {
    method: 'DELETE',
    headers: { 'Authorization': 'Bearer ' + _googleAccessToken }
  });
  if (!res.ok && res.status !== 204) { const err = await res.text(); throw new Error('Delete failed: ' + err); }
  if (typeof window._clearCalendarCache === 'function') window._clearCalendarCache();
}

// ─── Event Form (in-widget popup) ───
function showCalendarEventForm(container, el, card, opts) {
  // opts: { mode:'create'|'edit', startTime, endTime, calendarId, eventId, summary, description, onDone }
  // Smart refresh: detect gantt vs calendar context
  const _isGantt = !!(el && (el.querySelector('.gantt-body') || el.querySelector('.gantt-overlay-body') || el.classList.contains('gantt-overlay-panel')));
  const _refresh = () => {
    if (typeof opts.onDone === 'function') { opts.onDone(); }
    if (typeof el._ganttRender === 'function') { el._ganttRender(); } else if (_isGantt && el.querySelector('.gantt-body')) { renderGanttContent(el, card); }
    
    else { renderCalendarContent(el, card); }
  };
  // Remove any existing form overlay
  const oldOverlay = document.querySelector('.cal-event-form')?.closest('[style*="position:fixed"]');
  if (oldOverlay) oldOverlay.remove();

  const form = document.createElement('div');
  form.className = 'cal-event-form';

  // Title (optional)
  const titleLabel = document.createElement('label');
  titleLabel.textContent = 'Event Title (optional)';
  titleLabel.style.cssText = 'font-size:.65rem;margin-bottom:2px;';
  const titleInp = document.createElement('input');
  titleInp.type = 'text';
  titleInp.className = 'cal-form-input';
  titleInp.placeholder = 'Timelog / Event name...';
  titleInp.value = opts.summary || '';

  // Calendar selector — buttons instead of dropdown
  const calLabel = document.createElement('label');
  calLabel.textContent = 'Calendar';
  calLabel.style.cssText = 'font-size:.65rem;margin-bottom:2px;margin-top:6px;';
  const calBtnRow = document.createElement('div');
  calBtnRow.className = 'cal-selector-row';
  calBtnRow.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;margin-top:2px;';
  let _selectedCalId = opts.calendarId || '';

  getCalendarList().then(calendars => {
    var _exCals = ['phases of the moon','holidays in egypt','muslim holidays'];
    calendars = calendars.filter(c => _exCals.indexOf(c.summary.toLowerCase()) === -1);
    calendars.forEach((cal, i) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'cal-selector-btn';
      const bgColor = cal.backgroundColor || '#4285f4';
      btn.style.cssText = `background:${bgColor}12;border:1.5px solid ${bgColor};border-radius:6px;color:#475569;font-size:.58rem;padding:3px 8px;cursor:pointer;font-family:var(--font);transition:all .15s;white-space:nowrap;font-weight:600;`;
      btn.textContent = cal.summary.length > 18 ? cal.summary.substring(0, 16) + '…' : cal.summary;
      btn.title = cal.summary;
      btn.dataset.calId = cal.id;

      const isActive = cal.id === _selectedCalId || (!_selectedCalId && i === 0);
      if (isActive) {
        _selectedCalId = cal.id;
        btn.style.background = bgColor;
        btn.style.color = '#fff';
        btn.style.fontWeight = '700';
      }

      btn.onclick = (e) => {
        e.stopPropagation();
        _selectedCalId = cal.id;
        calBtnRow.querySelectorAll('.cal-selector-btn').forEach(b => {
          const c = calendars.find(cc => cc.id === b.dataset.calId);
          const bc = c ? (c.backgroundColor || '#4285f4') : '#4285f4';
          b.style.background = bc + '12';
          b.style.color = '#475569';
          b.style.fontWeight = '600';
        });
        btn.style.background = bgColor;
        btn.style.color = '#fff';
        btn.style.fontWeight = '700';
      };
      calBtnRow.appendChild(btn);
    });
    if (!_selectedCalId && calendars.length > 0) _selectedCalId = calendars[0].id;
  });

  // Time pickers row
  const timeRow = document.createElement('div');
  timeRow.style.cssText = 'display:flex;gap:8px;margin-top:6px;align-items:flex-end;';

  const startTime = opts.startTime || new Date();
  const endTime = opts.endTime || new Date(startTime.getTime() + 30 * 60000);

  // Start time picker
  const startWrap = document.createElement('div');
  startWrap.style.cssText = 'flex:1;';
  startWrap.innerHTML = '<label style="font-size:.65rem;">Start</label>';
  const startPicker = _buildAnalogTimePicker(startTime);
  startWrap.appendChild(startPicker.el);
  timeRow.appendChild(startWrap);

  // End time picker
  const endWrap = document.createElement('div');
  endWrap.style.cssText = 'flex:1;';
  endWrap.innerHTML = '<label style="font-size:.65rem;">End</label>';
  const endPicker = _buildAnalogTimePicker(endTime);
  endWrap.appendChild(endPicker.el);
  timeRow.appendChild(endWrap);

  // Date display
  const dateRow = document.createElement('div');
  dateRow.style.cssText = 'display:flex;gap:6px;margin-top:4px;';
  const startDateInp = document.createElement('input');
  startDateInp.type = 'date';
  startDateInp.className = 'cal-form-input';
  startDateInp.style.cssText = 'flex:1;font-size:.65rem;';
  startDateInp.value = _toDateStr(startTime);
  const endDateInp = document.createElement('input');
  endDateInp.type = 'date';
  endDateInp.className = 'cal-form-input';
  endDateInp.style.cssText = 'flex:1;font-size:.65rem;';
  endDateInp.value = _toDateStr(endTime);
  dateRow.appendChild(startDateInp);
  dateRow.appendChild(endDateInp);

  // Description (optional)
  const descLabel = document.createElement('label');
  descLabel.textContent = 'Description (optional)';
  descLabel.style.cssText = 'font-size:.65rem;margin-top:6px;margin-bottom:2px;';
  const descInp = document.createElement('textarea');
  descInp.className = 'cal-form-input';
  descInp.style.cssText = 'height:32px;resize:vertical;';
  descInp.placeholder = 'Notes...';
  descInp.value = opts.description || '';

  // Buttons
  const btnRow = document.createElement('div');
  btnRow.style.cssText = 'display:flex;gap:6px;margin-top:8px;justify-content:flex-end;';

  if (opts.mode === 'edit') {
    const delBtn = document.createElement('button');
    delBtn.className = 'cal-form-btn cal-form-btn-danger';
    delBtn.textContent = '🗑 Delete';
    delBtn.onclick = async (e) => {
      e.stopPropagation();
      if (!confirm('Delete this event?')) return;
      delBtn.disabled = true;
      delBtn.textContent = '...';
      try {
        await deleteCalendarEvent(opts.calendarId, opts.eventId);
        form.remove();
        showToast('🗑 Event deleted');
        _refresh();
      } catch (err) {
        showToast('❌ ' + err.message);
        delBtn.disabled = false;
        delBtn.textContent = '🗑 Delete';
      }
    };
    btnRow.appendChild(delBtn);
  }

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'cal-form-btn';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.onclick = (e) => { e.stopPropagation(); form.remove(); };

  const saveBtn = document.createElement('button');
  saveBtn.className = 'cal-form-btn cal-form-btn-primary';
  saveBtn.textContent = opts.mode === 'edit' ? '💾 Update' : '✅ Create';
  saveBtn.onclick = async (e) => {
    e.stopPropagation();
    const title = titleInp.value.trim() || '(No title)';
    const calId = _selectedCalId;
    if (!calId) { showToast('❌ Select a calendar'); return; }

    const startD = new Date(startDateInp.value + 'T' + startPicker.getTime());
    const endD = new Date(endDateInp.value + 'T' + endPicker.getTime());
    if (isNaN(startD.getTime()) || isNaN(endD.getTime())) { showToast('❌ Invalid date'); return; }
    if (endD <= startD) { showToast('❌ End must be after start'); return; }

    saveBtn.disabled = true;
    saveBtn.textContent = '⏳...';
    try {
        if (opts.mode === 'edit' && opts.calendarId && calId !== opts.calendarId) {
          await deleteCalendarEvent(opts.calendarId, opts.eventId);
          await createCalendarEvent(calId, title, startD, endD, descInp.value);
          showToast('\u2705 Event moved');
        } else if (opts.mode === 'edit') {
          await updateCalendarEvent(opts.calendarId || calId, opts.eventId, {
            summary: title,
            description: descInp.value,
            start: startD, end: endD
          });
          showToast('\u2705 Event updated');
        } else {
          await createCalendarEvent(calId, title, startD, endD, descInp.value);
          showToast('\u2705 Event created');
        }
      form.remove();
      _refresh();
    } catch (err) {
      showToast('❌ ' + err.message);
      saveBtn.disabled = false;
      saveBtn.textContent = opts.mode === 'edit' ? '💾 Update' : '✅ Create';
    }
  };

  btnRow.appendChild(cancelBtn);
  btnRow.appendChild(saveBtn);

  // ─── Quick-action icons for mobile (simulate modifier keys) ───
  const qaRow = document.createElement('div');
  qaRow.style.cssText = 'display:flex;gap:6px;margin-top:6px;justify-content:center;border-top:1px solid rgba(255,255,255,.08);padding-top:8px;';
  const qaActions = [
    {icon:'🍎',label:'Fruit',color:'#e74c3c',key:'ctrl'},
    {icon:'☑️',label:'Todo',color:'#f59e0b',key:'alt'},
    {icon:'🖼️',label:'Image',color:'#9b59b6',key:'shift'}
  ];
  qaActions.forEach(function(qa){
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:2px;padding:6px 12px;border-radius:8px;border:1px solid '+qa.color+'44;background:'+qa.color+'15;color:'+qa.color+';cursor:pointer;font-family:var(--font);transition:all .15s;';
    btn.innerHTML = '<span style="font-size:1.2rem;">'+qa.icon+'</span><span style="font-size:.5rem;font-weight:600;">'+qa.label+'</span>';
    btn.title = qa.label+' ('+qa.key+'+click)';
    btn.onmouseenter = function(){btn.style.background=qa.color+'30';};
    btn.onmouseleave = function(){btn.style.background=qa.color+'15';};
    btn.onclick = function(e){
      e.stopPropagation();
      if(btn.disabled)return;
      btn.disabled=true;btn.style.opacity='.4';btn.style.pointerEvents='none';
      setTimeout(function(){btn.disabled=false;btn.style.opacity='1';btn.style.pointerEvents='';},5000);
      const calId = _selectedCalId;
      const startD = new Date(startDateInp.value + 'T' + startPicker.getTime());
      const endD = new Date(endDateInp.value + 'T' + endPicker.getTime());
      if(isNaN(startD.getTime())||isNaN(endD.getTime())){showToast('❌ Invalid date');btn.disabled=false;btn.style.opacity='1';btn.style.pointerEvents='';return;}
      if(endD<=startD){showToast('❌ End must be after start');btn.disabled=false;btn.style.opacity='1';btn.style.pointerEvents='';return;}
      if(qa.key==='ctrl'){
        // Fruit toggle
        getCalendarList().then(function(cals){
          var fCal=cals.find(function(c){return(c.summary||'').toLowerCase()==="!40's fruit";});
          if(!fCal){showToast('❌ No fruit calendar');return;}
          createCalendarEvent(fCal.id,"!40's Fruit",startD,endD,'').then(function(){
            showToast('🍎 Fruit added');var _ov=form.parentElement;if(_ov)_ov.remove();_refresh();
          }).catch(function(er){showToast('❌ '+er.message);});
        });
      } else if(qa.key==='alt'){
        // Todo via Tasks API
        getOrCreateTaskList('00aplan').then(function(listId){
          var title=titleInp.value.trim()||prompt('Todo name:');
          if(!title||!title.trim())return;
          createPlanTask(listId,title.trim(),startD,endD).then(function(){
            showToast('☑️ Todo added');var _ov=form.parentElement;if(_ov)_ov.remove();_refresh();
          }).catch(function(er){showToast('❌ '+er.message);});
        }).catch(function(er){showToast('❌ '+er.message);});
      } else if(qa.key==='shift'){
        // Image upload via Tasks API
        getOrCreateTaskList('00aplan').then(function(listId){
          var fi=document.createElement('input');fi.type='file';fi.accept='image/*';fi.style.display='none';
          fi.onchange=function(){var f=fi.files[0];if(!f)return;var rd=new FileReader();rd.onload=function(re){
            showToast('⏳ Uploading image...');
            uploadToImgBB(re.target.result).then(function(url){
              if(!url){showToast('❌ Upload failed');return;}
              var h2=startD.getHours()*60+startD.getMinutes(),h3=endD.getHours()*60+endD.getMinutes();
              createPlanTask(listId,'\uD83D\uDDBC '+fmtTime(h2)+'-'+fmtTime(h3),startD,endD,{sticky:{x:10,y:10,w:200,h:150,color:'white'},imageUrl:url}).then(function(){
                showToast('🖼️ Image added');var _ov=form.parentElement;if(_ov)_ov.remove();_refresh();
              }).catch(function(er){showToast('❌ '+er.message);});
            });
          };rd.readAsDataURL(f);};fi.click();
        });
      }
    };
    qaRow.appendChild(btn);
  });

  form.appendChild(titleLabel);
  form.appendChild(titleInp);
  form.appendChild(calLabel);
  form.appendChild(calBtnRow);
  form.appendChild(timeRow);
  form.appendChild(dateRow);
  form.appendChild(descLabel);
  form.appendChild(descInp);
  form.appendChild(btnRow);
  form.appendChild(qaRow);

  // ─── Render as fixed overlay (centered on screen, unaffected by zoom) ───
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.45);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);';
  overlay.addEventListener('mousedown', (e) => {
    if (e.target === overlay) { overlay.remove(); document.removeEventListener('keydown', _onEscForm); }
  });

  form.style.cssText = 'border-radius:14px;padding:18px 22px;min-width:340px;max-width:420px;width:90vw;display:flex;flex-direction:column;gap:4px;font-family:var(--font,Inter,sans-serif);';
  form.addEventListener('mousedown', e => { if (e.button === 0) e.stopPropagation(); });
  form.addEventListener('click', e => e.stopPropagation());
  form.addEventListener('wheel', e => e.stopPropagation());

  // ESC closes the form
  const _onEscForm = (e) => {
    if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', _onEscForm); }
  };
  document.addEventListener('keydown', _onEscForm);

  // Override cancel to remove overlay
  cancelBtn.onclick = (e) => { e.stopPropagation(); overlay.remove(); document.removeEventListener('keydown', _onEscForm); };

  // Override form.remove in save/delete to remove overlay
  const _origFormRemove = form.remove.bind(form);
  form.remove = () => { overlay.remove(); document.removeEventListener('keydown', _onEscForm); };

  overlay.appendChild(form);
  document.body.appendChild(overlay);
  titleInp.focus();
}

// ─── Analog Clock Time Picker ───
function _buildAnalogTimePicker(initialDate) {
  let hours = initialDate.getHours();
  let minutes = initialDate.getMinutes();

  const wrap = document.createElement('div');
  wrap.style.cssText = 'display:flex;align-items:center;gap:4px;';

  // AM/PM helper
  function to12(h) { const hr = h % 12; return hr === 0 ? 12 : hr; }
  function ampm(h) { return h < 12 ? 'AM' : 'PM'; }

  // Digital display
  const display = document.createElement('div');
  display.style.cssText = 'display:flex;align-items:center;gap:2px;cursor:pointer;user-select:none;';

  const hDisp = document.createElement('span');
  hDisp.className = 'cal-time-digit';
  hDisp.contentEditable = true;
  hDisp.style.cssText += 'min-width:20px;text-align:center;outline:none;';
  hDisp.addEventListener('blur', () => { var v = parseInt(hDisp.textContent); if(!isNaN(v) && v>=1 && v<=12) { var isPM = hours>=12; hours = v%12 + (isPM?12:0); updateDisplay(); } else { updateDisplay(); } });
  hDisp.addEventListener('keydown', (e) => { if(e.key==='Enter'){e.preventDefault();hDisp.blur();} });
  const sep = document.createElement('span');
  sep.textContent = ':';
  sep.className = 'cal-time-sep';
  sep.style.cssText = 'font-size:.8rem;font-weight:700;';
  const mDisp = document.createElement('span');
  mDisp.className = 'cal-time-digit';
  mDisp.contentEditable = true;
  mDisp.style.cssText += 'min-width:20px;text-align:center;outline:none;';
  mDisp.addEventListener('blur', () => { var v = parseInt(mDisp.textContent); if(!isNaN(v) && v>=0 && v<=59) { minutes = v; updateDisplay(); } else { updateDisplay(); } });
  mDisp.addEventListener('keydown', (e) => { if(e.key==='Enter'){e.preventDefault();mDisp.blur();} });
  const ampmDisp = document.createElement('span');
  ampmDisp.style.cssText = 'color:#6c8fff;font-size:.55rem;font-weight:700;cursor:pointer;margin-left:2px;user-select:none;';
  ampmDisp.title = 'Toggle AM/PM';

  function updateDisplay() {
    hDisp.textContent = String(to12(hours));
    mDisp.textContent = String(minutes).padStart(2, '0');
    ampmDisp.textContent = ampm(hours);
  }
  updateDisplay();

  // Toggle AM/PM on click
  ampmDisp.onclick = (e) => { e.stopPropagation(); hours = (hours + 12) % 24; updateDisplay(); };

  display.appendChild(hDisp);
  display.appendChild(sep);
  display.appendChild(mDisp);
  display.appendChild(ampmDisp);

  // Up/Down arrows for hours
  const hCol = document.createElement('div');
  hCol.style.cssText = 'display:flex;flex-direction:column;gap:1px;';
  const hUp = document.createElement('button');
  hUp.type = 'button';
  hUp.className = 'cal-time-arrow';
  hUp.textContent = '▲';
  hUp.onclick = (e) => { e.stopPropagation(); hours = (hours + 1) % 24; updateDisplay(); };
  const hDn = document.createElement('button');
  hDn.type = 'button';
  hDn.className = 'cal-time-arrow';
  hDn.textContent = '▼';
  hDn.onclick = (e) => { e.stopPropagation(); hours = (hours - 1 + 24) % 24; updateDisplay(); };
  hCol.appendChild(hUp);
  hCol.appendChild(hDn);

  // Up/Down arrows for minutes (step 1 for precision)
  const mCol = document.createElement('div');
  mCol.style.cssText = 'display:flex;flex-direction:column;gap:1px;';
  const mUp = document.createElement('button');
  mUp.type = 'button';
  mUp.className = 'cal-time-arrow';
  mUp.textContent = '▲';
  mUp.onclick = (e) => { e.stopPropagation(); minutes = (minutes + 1) % 60; updateDisplay(); };
  const mDn = document.createElement('button');
  mDn.type = 'button';
  mDn.className = 'cal-time-arrow';
  mDn.textContent = '▼';
  mDn.onclick = (e) => { e.stopPropagation(); minutes = (minutes - 1 + 60) % 60; updateDisplay(); };
  mCol.appendChild(mUp);
  mCol.appendChild(mDn);

  // Scroll on digits
  hDisp.addEventListener('wheel', (e) => {
    e.preventDefault(); e.stopPropagation();
    hours = (hours + (e.deltaY < 0 ? 1 : -1) + 24) % 24;
    updateDisplay();
  });
  mDisp.addEventListener('wheel', (e) => {
    e.preventDefault(); e.stopPropagation();
    minutes = (minutes + (e.deltaY < 0 ? 1 : -1) + 60) % 60;
    updateDisplay();
  });

  wrap.appendChild(hCol);
  wrap.appendChild(display);
  wrap.appendChild(mCol);

  return {
    el: wrap,
    getTime: () => `${String(hours).padStart(2,'0')}:${String(minutes).padStart(2,'0')}:00`,
    getHours: () => hours,
    getMinutes: () => minutes,
  };
}

function _toLocalDateTimeStr(d) {
  const pad = v => String(v).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function _toDateStr(d) {
  const pad = v => String(v).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// ─── Render Calendar Content (Interactive) ───
async function renderCalendarContent(el, card) {
  const container = el.querySelector('.cal-body');
  if (!container) return;

  // Don't show "Loading..." if we have cached events — they'll render instantly

  const now = new Date();
  const days = card.calView === '3day' ? 3 : 7;
  const offset = card.calOffset || 0; // now in DAYS

  // Start of viewing period (offset is in days)
  let startDate;
  if (card.calView === 'week') {
    startDate = new Date(now);
    startDate.setDate(now.getDate() - now.getDay() + offset);
  } else {
    startDate = new Date(now);
    startDate.setDate(now.getDate() + offset);
  }
  startDate.setHours(0, 0, 0, 0);

  const endDate = new Date(startDate);
  endDate.setDate(startDate.getDate() + days);

  // ─── Local Cache for events ───
  const cacheKey = `sm_cal_${startDate.toISOString().slice(0,10)}_${days}`;
  function _cacheCalEvents(evts) {
    try { localStorage.setItem(cacheKey, JSON.stringify(evts)); } catch(e) {}
  }
  function _getCachedCalEvents() {
    try { const d = localStorage.getItem(cacheKey); return d ? JSON.parse(d) : null; } catch(e) { return null; }
  }

  // Get cached events to show IMMEDIATELY (never show empty calendar)
  const cachedEvents = _getCachedCalEvents();

  // If we have cached events, render them right away (no "Loading..." screen)
  if (cachedEvents && cachedEvents.length > 0) {
    _renderCalGrid(container, el, card, cachedEvents, startDate, days, now);
  }

  // Try to fetch fresh events in background
  let freshEvents = null;
  let fetchError = null;
  try {
    freshEvents = await fetchCalendarEvents(startDate, endDate);
  } catch (err) {
    fetchError = err;
  }

  if (freshEvents) {
    // Got fresh data — cache it and re-render
    _cacheCalEvents(freshEvents);
    _renderCalGrid(container, el, card, freshEvents, startDate, days, now);
  } else if (!cachedEvents || cachedEvents.length === 0) {
    // No fresh data AND no cache — show error/sign-in
    container.innerHTML = '';
    const errDiv = document.createElement('div');
    errDiv.style.cssText = 'text-align:center;padding:40px 20px;color:#aaa;font-size:.75rem;';

    if (fetchError && fetchError.needsAuth) {
      errDiv.innerHTML = '🔑 Sign in to load calendar<br><span style="color:#666;font-size:.6rem;">One-time setup</span>';
      const signBtn = document.createElement('button');
      signBtn.className = 'cal-form-btn cal-form-btn-primary';
      signBtn.style.cssText = 'margin-top:12px;font-size:.7rem;padding:6px 14px;';
      signBtn.textContent = '🔐 Sign in to Google';
      signBtn.onclick = async (e) => {
        e.stopPropagation();
        try { await manualGoogleReAuth(); renderCalendarContent(el, card); } catch (err) {}
      };
      errDiv.appendChild(document.createElement('br'));
      errDiv.appendChild(signBtn);
    } else {
      errDiv.innerHTML = `⚠️ No events found<br><span style="color:#666;font-size:.6rem;">${(fetchError && fetchError.message) || 'Try refreshing'}</span>`;
      const retryBtn = document.createElement('button');
      retryBtn.className = 'cal-form-btn cal-form-btn-primary';
      retryBtn.style.cssText = 'margin-top:12px;';
      retryBtn.textContent = '🔄 Retry';
      retryBtn.onclick = (e) => { e.stopPropagation(); renderCalendarContent(el, card); };
      errDiv.appendChild(document.createElement('br'));
      errDiv.appendChild(retryBtn);
    }
    container.appendChild(errDiv);
    return;
  } else if (fetchError && fetchError.needsAuth) {
    // Have cached data but token expired — show small sign-in indicator overlay
    const indicator = document.createElement('div');
    indicator.style.cssText = 'position:absolute;top:2px;right:4px;z-index:15;cursor:pointer;font-size:.55rem;color:#f90;opacity:.7;transition:opacity .15s;';
    indicator.textContent = '🔑';
    indicator.title = 'Session expired — click to reconnect';
    indicator.onmouseenter = () => { indicator.style.opacity = '1'; };
    indicator.onmouseleave = () => { indicator.style.opacity = '.7'; };
    indicator.onclick = async (e) => {
      e.stopPropagation();
      try { await manualGoogleReAuth(); renderCalendarContent(el, card); } catch (err) {}
    };
    container.style.position = 'relative';
    container.appendChild(indicator);
  }

  card._weekStart = startDate.getTime();
}

// ─── Pure UI render (no fetch) ───
function _renderCalGrid(container, el, card, events, startDate, days, now) {
  const START_HOUR = 0, END_HOUR = 24;
  const theme = card.calTheme || 'light';
  const isLight = theme === 'light';
  const dayNameColor = isLight ? '#555' : '#aaa';
  const hourColor = isLight ? '#888' : '#666';
  const gridBorder = isLight ? 'rgba(0,0,0,.08)' : 'rgba(255,255,255,.04)';
  const headerBorder = isLight ? 'rgba(0,0,0,.12)' : 'rgba(255,255,255,.1)';
  const todayBg = isLight ? 'rgba(66,133,244,.05)' : 'rgba(74,122,255,.03)';
  const colBorder = isLight ? 'rgba(0,0,0,.06)' : 'rgba(255,255,255,.05)';

  // Dynamic HOUR_H — fit 24h into available body height (NO scrollbars)
  const headerHeight = 24;
  const widgetH = card.h || el.offsetHeight || 800;
  const availableH = Math.max(200, widgetH - 40 - headerHeight);
  const HOUR_H = Math.max(6, availableH / 24);

  container.innerHTML = '';

  // ─── Day Header Row ───
  const headerRow = document.createElement('div');
  headerRow.className = 'cal-header';
  headerRow.style.cssText = `display:flex;border-bottom:1px solid ${headerBorder};flex-shrink:0;height:${headerHeight}px;overflow:hidden;`;
  const timeCorner = document.createElement('div');
  timeCorner.style.cssText = 'width:30px;flex-shrink:0;';
  headerRow.appendChild(timeCorner);

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  for (let d = 0; d < days; d++) {
    const day = new Date(startDate);
    day.setDate(startDate.getDate() + d);
    const isToday = day.toDateString() === now.toDateString();
    const hdr = document.createElement('div');
    hdr.style.cssText = `flex:1;text-align:center;padding:3px 0;font-size:.58rem;font-weight:600;color:${isToday ? '#4a7aff' : dayNameColor};`;
    const dateSpan = document.createElement('span');
    dateSpan.style.cssText = `font-size:.65rem;${isToday ? 'background:#4a7aff;color:#fff;border-radius:50%;padding:1px 4px;' : ''}`;
    dateSpan.textContent = day.getDate();
    hdr.textContent = dayNames[day.getDay()] + ' ';
    hdr.appendChild(dateSpan);
    headerRow.appendChild(hdr);
  }
  container.appendChild(headerRow);

  // ─── Grid (NO scroll, NO overflow, fixed height) ───
  const grid = document.createElement('div');
  grid.style.cssText = `display:flex;height:${HOUR_H * 24}px;overflow:hidden;position:relative;`;

  // AM/PM time labels
  const timesCol = document.createElement('div');
  timesCol.style.cssText = 'width:30px;flex-shrink:0;border-right:1px solid rgba(255,255,255,.08);overflow:hidden;';
  for (let h = 0; h < 24; h++) {
    let label = '';
    if (h === 0) label = '12a';
    else if (h < 12) label = h + 'a';
    else if (h === 12) label = '12p';
    else label = (h - 12) + 'p';
    const cell = document.createElement('div');
    cell.style.cssText = `height:${HOUR_H}px;font-size:.42rem;color:${hourColor};text-align:right;padding-right:2px;box-sizing:border-box;border-top:1px solid ${gridBorder};line-height:${HOUR_H}px;overflow:hidden;`;
    cell.textContent = label;
    timesCol.appendChild(cell);
  }
  grid.appendChild(timesCol);

  // Day columns container
  const daysContainer = document.createElement('div');
  daysContainer.style.cssText = 'display:flex;flex:1;position:relative;overflow:hidden;';
  // Helper: contentY -> minute
  function contentYToMin(cy) { return Math.max(0, Math.min(24 * 60, Math.round((cy / (HOUR_H * 24)) * 24 * 60))); }

  // ─── Drag-to-select state ───
  let _dragState = null;
  let _dragOverlay = null;

  for (let d = 0; d < days; d++) {
    const day = new Date(startDate);
    day.setDate(startDate.getDate() + d);
    const isToday = day.toDateString() === now.toDateString();
    const dayCol = document.createElement('div');
    dayCol.style.cssText = `flex:1;min-width:0;border-right:1px solid ${colBorder};position:relative;cursor:crosshair;overflow:hidden;${isToday ? 'background:'+todayBg+';' : ''}`;
    dayCol.className = 'cal-day-col';
    dayCol.dataset.dayIdx = d;

    // Hour cells
    for (let h = START_HOUR; h < END_HOUR; h++) {
      const slot = document.createElement('div');
      slot.className = 'cal-slot';
      slot.style.cssText = `height:${HOUR_H}px;border-top:1px solid ${gridBorder};box-sizing:border-box;`;
      slot.dataset.hour = h;
      slot.dataset.day = d;
      dayCol.appendChild(slot);
    }

    // ─── Drag-to-select on day column (zoom-aware) ───
    // Snap: default=30min, Ctrl=15min, Alt=free(1min)
    dayCol.addEventListener('mousedown', (e) => {
      if (e.target.closest('.cal-event-block')) return;
      if (e.target.closest('.cal-resize-handle')) return;
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();

      const colRect = dayCol.getBoundingClientRect();
      const totalH = HOUR_H * 24;
      const s2c = totalH / colRect.height;

      function snapMin(rawMin, ev) {
        const step = ev.altKey ? 1 : ev.ctrlKey ? 15 : 30;
        return Math.round(rawMin / step) * step;
      }
      function rawMinFromY(cy) { return Math.max(0, Math.min(24*60, Math.floor((cy / totalH)*24*60))); }

      const screenY = e.clientY - colRect.top;
      const contentY = screenY * s2c;
      const startMinute = snapMin(rawMinFromY(contentY), e);
      const startContentY = (startMinute / (24*60)) * totalH;

      // Create drag overlay
      _dragOverlay = document.createElement('div');
      _dragOverlay.className = 'cal-drag-overlay';
      _dragOverlay.style.cssText = `position:absolute;left:2px;right:2px;top:${startContentY}px;height:0px;background:rgba(74,122,255,.25);border:1px solid rgba(74,122,255,.5);border-radius:3px;z-index:8;pointer-events:none;`;
      dayCol.appendChild(_dragOverlay);

      // Tooltip
      const _dragTip = document.createElement('div');
      _dragTip.style.cssText = 'position:fixed;background:#222;color:#6c8fff;font-size:.65rem;padding:3px 8px;border-radius:4px;pointer-events:none;z-index:9999;font-weight:600;white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,.5);';
      document.body.appendChild(_dragTip);
      function _fmtM(m) { const h=Math.floor(m/60)%24,mm=m%60,hr=h%12===0?12:h%12; return `${hr}:${String(mm).padStart(2,'0')} ${h<12?'AM':'PM'}`; }
      _dragTip.textContent = _fmtM(startMinute);
      _dragTip.style.left = (e.clientX+12)+'px'; _dragTip.style.top = (e.clientY-10)+'px';

      _dragState = { dayCol, day: new Date(day), startMinute, colRect, s2c, totalH };

      const onMouseMove = (ev) => {
        if (!_dragState || !_dragOverlay) return;
        const curContentY = (ev.clientY - _dragState.colRect.top) * _dragState.s2c;
        const curSnapped = snapMin(rawMinFromY(curContentY), ev);
        const startCY = (_dragState.startMinute / (24*60)) * _dragState.totalH;
        const endCY = (curSnapped / (24*60)) * _dragState.totalH;
        const top = Math.min(startCY, endCY);
        const bottom = Math.max(startCY, endCY);
        _dragOverlay.style.top = top + 'px';
        _dragOverlay.style.height = (bottom - top) + 'px';
        const lo = Math.min(_dragState.startMinute, curSnapped), hi = Math.max(_dragState.startMinute, curSnapped);
        _dragTip.textContent = `${_fmtM(lo)} → ${_fmtM(hi)}`;
        _dragTip.style.left = (ev.clientX+12)+'px'; _dragTip.style.top = (ev.clientY-10)+'px';
      };

      const onMouseUp = (ev) => {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        _dragTip.remove();
        if (!_dragState || !_dragOverlay) return;

        const curContentY = (ev.clientY - _dragState.colRect.top) * _dragState.s2c;
        const endSnapped = snapMin(rawMinFromY(curContentY), ev);

        _dragOverlay.remove();
        _dragOverlay = null;

        let slotStartM = Math.min(_dragState.startMinute, endSnapped);
        let slotEndM = Math.max(_dragState.startMinute, endSnapped);

        // If drag was tiny (click), create 30-min slot at clicked position
        if (slotEndM - slotStartM < 10) {
          slotStartM = snapMin(_dragState.startMinute, { altKey: false, ctrlKey: false }); // force 30-min snap
          slotEndM = slotStartM + 30;
        }

        const slotStart = new Date(_dragState.day);
        slotStart.setHours(Math.floor(slotStartM / 60), slotStartM % 60, 0, 0);
        const slotEnd = new Date(_dragState.day);
        slotEnd.setHours(Math.floor(slotEndM / 60), slotEndM % 60, 0, 0);

        _dragState = null;

        showCalendarEventForm(container, el, card, {
          mode: 'create',
          startTime: slotStart,
          endTime: slotEnd,
        });
      };

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });

    // ─── Render events with overlap columns ───
    const dayStart = new Date(day); dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(day); dayEnd.setHours(23, 59, 59, 999);

    const dayEvents = events.filter(ev => {
      if (ev.allDay) return false;
      const evStart = new Date(ev.start);
      return evStart >= dayStart && evStart <= dayEnd;
    }).map(ev => {
      const evStart = new Date(ev.start);
      const evEnd = new Date(ev.end);
      return { ...ev, _start: evStart, _end: evEnd, _startMin: evStart.getHours() * 60 + evStart.getMinutes(), _endMin: evEnd.getHours() * 60 + evEnd.getMinutes() };
    }).sort((a, b) => a._startMin - b._startMin || (b._endMin - b._startMin) - (a._endMin - a._startMin));

    // Assign columns for overlapping events
    const columns = [];
    dayEvents.forEach(ev => {
      let placed = false;
      for (let c = 0; c < columns.length; c++) {
        const lastInCol = columns[c][columns[c].length - 1];
        if (ev._startMin >= lastInCol._endMin) {
          columns[c].push(ev);
          ev._col = c;
          placed = true;
          break;
        }
      }
      if (!placed) {
        ev._col = columns.length;
        columns.push([ev]);
      }
    });
    const totalCols = Math.max(1, columns.length);

    dayEvents.forEach(ev => {
      const topMin = ev._startMin;
      const durMin = Math.max(15, (ev._end - ev._start) / 60000);
      const top = (topMin / 60) * HOUR_H;
      const height = (durMin / 60) * HOUR_H;
      const color = ev.color || '#4285f4';
      const col = ev._col || 0;

      // Position: each column gets an equal share of the width
      const colW = 100 / totalCols;
      const leftPct = col * colW;
      const widthPct = colW - 1; // 1% gap

      const evEl = document.createElement('div');
      evEl.className = 'cal-event-block';
      const displayH = Math.max(HOUR_H * 0.35, height);
      // Auto-contrast text color based on background luminance
      function _textColor(bg) {
        const m = bg.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i);
        if (!m) return '#fff';
        const lum = (parseInt(m[1],16)*299 + parseInt(m[2],16)*587 + parseInt(m[3],16)*114) / 1000;
        return lum > 160 ? '#1a1a1a' : '#fff';
      }
      const txtColor = _textColor(color);
      evEl.style.cssText = `position:absolute;top:${top}px;left:${leftPct}%;width:${widthPct}%;height:${displayH}px;background:${color};border-radius:3px;padding:1px 3px;font-size:.42rem;color:${txtColor};overflow:hidden;cursor:pointer;z-index:2;opacity:.9;line-height:1.15;box-sizing:border-box;font-weight:600;text-shadow:${txtColor==='#fff'?'0 1px 2px rgba(0,0,0,.4)':'none'};`;
      evEl.title = `${ev.summary}
${ev.calendarName}
${ev._start.toLocaleTimeString([], {hour:'numeric',minute:'2-digit',hour12:true})} - ${ev._end.toLocaleTimeString([], {hour:'numeric',minute:'2-digit',hour12:true})}`;
      evEl.textContent = ev.summary;

      evEl.addEventListener('mouseenter', () => { evEl.style.opacity = '1'; evEl.style.boxShadow = '0 0 6px rgba(255,255,255,.3)'; });
      evEl.addEventListener('mouseleave', () => { evEl.style.opacity = '.85'; evEl.style.boxShadow = 'none'; });

      evEl.addEventListener('click', (e) => {
        e.stopPropagation();
        showCalendarEventForm(container, el, card, {
          mode: 'edit',
          eventId: ev.id,
          calendarId: ev.calendarId,
          summary: ev.summary,
          description: ev.description,
          startTime: ev._start,
          endTime: ev._end,
        });
      });
      evEl.addEventListener('mousedown', e => { if (e.button === 0 && !e.target.closest('.cal-resize-handle')) e.stopPropagation(); });

      // ─── Bottom resize handle ───
      const resizeHandle = document.createElement('div');
      resizeHandle.className = 'cal-resize-handle';
      resizeHandle.style.cssText = 'position:absolute;bottom:0;left:0;right:0;height:5px;cursor:ns-resize;background:rgba(255,255,255,.15);border-radius:0 0 3px 3px;opacity:0;transition:opacity .12s;';
      evEl.addEventListener('mouseenter', () => { resizeHandle.style.opacity = '1'; });
      evEl.addEventListener('mouseleave', () => { resizeHandle.style.opacity = '0'; });

      resizeHandle.addEventListener('mousedown', (re) => {
        re.preventDefault();
        re.stopPropagation();
        const colRect = dayCol.getBoundingClientRect();
        const s2c = (HOUR_H * 24) / colRect.height;
        const origH = displayH;

        // Tooltip for resize feedback
        const tip = document.createElement('div');
        tip.style.cssText = 'position:fixed;background:#222;color:#6c8fff;font-size:.65rem;padding:3px 8px;border-radius:4px;pointer-events:none;z-index:9999;font-weight:600;white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,.5);';
        document.body.appendChild(tip);
        function fmtMin(m) {
          const h = Math.floor(m / 60) % 24;
          const mm = m % 60;
          const hr = h % 12 === 0 ? 12 : h % 12;
          return `${hr}:${String(mm).padStart(2,'0')} ${h < 12 ? 'AM' : 'PM'}`;
        }

        const onRMove = (ev2) => {
          const curY = (ev2.clientY - colRect.top) * s2c;
          let rawEndMin = Math.max(ev._startMin + 15, contentYToMin(curY));
          // Snap to 15 minutes
          rawEndMin = Math.round(rawEndMin / 15) * 15;
          const newH = Math.max(HOUR_H * 0.35, ((rawEndMin - ev._startMin) / 60) * HOUR_H);
          evEl.style.height = newH + 'px';
          // Update tooltip
          tip.textContent = `${fmtMin(ev._startMin)} → ${fmtMin(rawEndMin)}`;
          tip.style.left = (ev2.clientX + 12) + 'px';
          tip.style.top = (ev2.clientY - 10) + 'px';
        };
        const onRUp = async (ev2) => {
          document.removeEventListener('mousemove', onRMove);
          document.removeEventListener('mouseup', onRUp);
          tip.remove();
          const curY = (ev2.clientY - colRect.top) * s2c;
          let rawEndMin = Math.max(ev._startMin + 15, contentYToMin(curY));
          rawEndMin = Math.round(rawEndMin / 15) * 15;
          const newEnd = new Date(day);
          newEnd.setHours(Math.floor(rawEndMin / 60), rawEndMin % 60, 0, 0);
          try {
            await updateCalendarEvent(ev.calendarId, ev.id, { summary: ev.summary, start: ev._start, end: newEnd });
            showToast('✅ Resized');
            renderCalendarContent(el, card);
          } catch (err) {
            showToast('❌ ' + err.message);
            evEl.style.height = origH + 'px';
          }
        };
        document.addEventListener('mousemove', onRMove);
        document.addEventListener('mouseup', onRUp);
      });

      evEl.appendChild(resizeHandle);
      dayCol.appendChild(evEl);
    });

    // ─── Now-line ───
    if (isToday) {
      const nowMin = now.getHours() * 60 + now.getMinutes();
      const nowTop = (nowMin / 60) * HOUR_H;
      const nowLine = document.createElement('div');
      nowLine.className = 'cal-now-line';
      nowLine.style.cssText = `position:absolute;top:${nowTop}px;left:0;right:0;height:2px;background:#e53935;z-index:5;pointer-events:none;`;
      const nowDot = document.createElement('div');
      nowDot.style.cssText = 'position:absolute;left:-3px;top:-3px;width:8px;height:8px;background:#e53935;border-radius:50%;';
      nowLine.appendChild(nowDot);
      dayCol.appendChild(nowLine);
    }

    daysContainer.appendChild(dayCol);
  }

  grid.appendChild(daysContainer);
  container.appendChild(grid);

  card._weekStart = startDate.getTime();
}

// ══════════════════════════════════════════════════════════
// ─── Toolbar Customization (Right-Click Hide/Show) ───
// ══════════════════════════════════════════════════════════
(function initToolbarCustomization() {
  const LS_KEY = 'sm_toolbar_hidden';
  const PROTECTED = ['mtb-select', 'mtb-more']; // Cannot be hidden
  const toolbar = document.getElementById('miro-toolbar');
  const moreGrid = toolbar ? toolbar.querySelector('.mtb-more-grid') : null;
  if (!toolbar || !moreGrid) return;

  // Restore hidden state
  function getHidden() {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch(e) { return []; }
  }
  function saveHidden(arr) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(arr)); } catch(e) {}
  }

  function applyHiddenState() {
    const hidden = getHidden();
    hidden.forEach(id => {
      const btn = document.getElementById(id);
      if (!btn || PROTECTED.includes(id)) return;
      // Move to more panel if not already there
      if (!moreGrid.contains(btn)) {
        moreGrid.appendChild(btn);
      }
    });
  }

  function hideButton(id) {
    const hidden = getHidden();
    if (!hidden.includes(id)) hidden.push(id);
    saveHidden(hidden);
    const btn = document.getElementById(id);
    if (btn && !moreGrid.contains(btn)) {
      moreGrid.appendChild(btn);
    }
  }

  function showButton(id) {
    let hidden = getHidden();
    hidden = hidden.filter(h => h !== id);
    saveHidden(hidden);
    const btn = document.getElementById(id);
    if (!btn) return;
    // Move back to main toolbar (before the separator/more button)
    const sep = toolbar.querySelector('div[style*="height:1px"]');
    if (sep) {
      toolbar.insertBefore(btn, sep);
    } else {
      const moreBtn = document.getElementById('mtb-more');
      if (moreBtn) toolbar.insertBefore(btn, moreBtn);
      else toolbar.appendChild(btn);
    }
  }

  // Create context menu
  let ctxMenu = null;
  function showCtxMenu(x, y, btnId, isInMorePanel) {
    removeCtxMenu();
    ctxMenu = document.createElement('div');
    ctxMenu.className = 'mtb-ctx-menu';
    ctxMenu.style.left = x + 'px';
    ctxMenu.style.top = y + 'px';

    if (isInMorePanel) {
      const showItem = document.createElement('div');
      showItem.className = 'mtb-ctx-item';
      showItem.innerHTML = '📌 Show on toolbar';
      showItem.onclick = () => { showButton(btnId); removeCtxMenu(); };
      ctxMenu.appendChild(showItem);
    } else {
      const hideItem = document.createElement('div');
      hideItem.className = 'mtb-ctx-item';
      hideItem.innerHTML = '👁‍🗨 Hide to + panel';
      hideItem.onclick = () => { hideButton(btnId); removeCtxMenu(); };
      ctxMenu.appendChild(hideItem);
    }

    document.body.appendChild(ctxMenu);

    // Adjust position if overflow
    const rect = ctxMenu.getBoundingClientRect();
    if (rect.right > window.innerWidth) ctxMenu.style.left = (window.innerWidth - rect.width - 8) + 'px';
    if (rect.bottom > window.innerHeight) ctxMenu.style.top = (window.innerHeight - rect.height - 8) + 'px';

    // Close on click outside
    setTimeout(() => {
      document.addEventListener('mousedown', _closeCtxOnClick);
      document.addEventListener('contextmenu', _closeCtxOnClick);
    }, 0);
  }

  function removeCtxMenu() {
    if (ctxMenu && ctxMenu.parentNode) ctxMenu.parentNode.removeChild(ctxMenu);
    ctxMenu = null;
    document.removeEventListener('mousedown', _closeCtxOnClick);
    document.removeEventListener('contextmenu', _closeCtxOnClick);
  }

  function _closeCtxOnClick(e) {
    if (ctxMenu && !ctxMenu.contains(e.target)) {
      removeCtxMenu();
    }
  }

  // Attach contextmenu to all toolbar buttons
  function attachContextMenu(btn) {
    if (!btn.id || PROTECTED.includes(btn.id)) return;
    btn.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const isInMore = moreGrid.contains(btn);
      showCtxMenu(e.clientX, e.clientY, btn.id, isInMore);
    });
  }

  // Attach to all existing buttons
  toolbar.querySelectorAll('.mtb-btn').forEach(attachContextMenu);
  moreGrid.querySelectorAll('.mtb-btn').forEach(attachContextMenu);

  // Apply saved state on load
  applyHiddenState();

  // --- Custom Freeform Cells Drawing Initialization ---
  window._customCellDrawMode = false;
  window._drawingCustomCell = false;
  window._drawCellStartX = 0;
  window._drawCellStartY = 0;

  window._exitCustomCellDrawMode = function _exitCustomCellDrawMode() {
    window._customCellDrawMode = false;
    window._drawingCustomCell = false;
    const btn = document.getElementById('mz-custom-cell-btn');
    if (btn) {
      btn.style.background = '';
      btn.style.color = '';
    }
    const canvas = document.getElementById('miro-canvas');
    if (canvas) canvas.style.cursor = 'grab';
    const tempDraw = document.getElementById('miro-temp-cell-draw');
    if (tempDraw) tempDraw.remove();
  };

  const drawCellBtn = document.getElementById('mz-custom-cell-btn');
  if (drawCellBtn) {
    drawCellBtn.onclick = (e) => {
      e.stopPropagation();
      const page = cp();
      if (page && !page._guidesMode) {
        showToast('⚠️ Please enable Slices Mode (📐) to draw custom cells!', 3000);
        return;
      }
      window._customCellDrawMode = !window._customCellDrawMode;
      if (window._customCellDrawMode) {
        drawCellBtn.style.background = 'var(--ac)';
        drawCellBtn.style.color = '#fff';
        document.getElementById('miro-canvas').style.cursor = 'crosshair';
        showToast('📺 Custom Cell drawing mode active. Click and drag on canvas to draw a screen!', 3500);
        if (typeof setActiveTool === 'function') setActiveTool('select');
      } else {
        window._exitCustomCellDrawMode();
      }
    };
  }

SM.miro.engine = SM.miro.engine || {};
SM.miro.engine.setActiveTool = typeof setActiveTool !== 'undefined' ? setActiveTool : window.setActiveTool;
SM.miro.engine.deleteMiroCard = typeof deleteMiroCard !== 'undefined' ? deleteMiroCard : window.deleteMiroCard;
SM.miro.engine.performUndo = typeof performUndo !== 'undefined' ? performUndo : window.performUndo;
SM.miro.engine.unpinAll = typeof unpinAll !== 'undefined' ? unpinAll : window.unpinAll;
SM.miro.engine.createWidgetFromSelection = typeof createWidgetFromSelection !== 'undefined' ? createWidgetFromSelection : window.createWidgetFromSelection;

window.setActiveTool = SM.miro.engine.setActiveTool;
window.deleteMiroCard = SM.miro.engine.deleteMiroCard;
window.performUndo = SM.miro.engine.performUndo;
window.unpinAll = SM.miro.engine.unpinAll;
window.createWidgetFromSelection = SM.miro.engine.createWidgetFromSelection;
})();
