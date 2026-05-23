/**
 * @module Slices
 * @description Handles Miro page slicing, nested viewport rendering, cell zoom/pan states, Photoshop-style guides, and local card constraints.
 * @namespace SM.miro.layout
 * @depends namespace.js, app.js, miro-state.js, utils.js
 * @provides window.initMiroSlices, window.renderMiroSlices, window.autofitAllMiroSlices, window.partitionMiroCardsIntoCells, window.mergeMiroCellsIntoCards, window.getMiroCardDragZoom, window.clampMiroCardDrag, window.createMiroGrid
 * @safety Protect calculations against NaN. Clamp zoom between 1% and 400%.
 */
(function() {
  let _activeGuideDrag = null; // { type: 'v'|'h', idx: number, startPct: number, startClient: number }
  let _wheelSvTimer = null;
  let _activeCellKey = null;
  let _cellPanning = false;
  let _cellPanStartX = 0, _cellPanStartY = 0;

  // Initialize Slices Mode UI, event listeners, and rulers
  window.initMiroSlices = function initMiroSlices() {
    // Add css styles for rulers, guide handles, cell viewports, and lock badges
    if (!document.getElementById('miro-slices-css')) {
      const style = document.createElement('style');
      style.id = 'miro-slices-css';
      style.textContent = `
        .miro-ruler {
          position: absolute;
          background: #1a1d2e;
          border: 1px solid rgba(255, 255, 255, 0.12);
          z-index: 1000;
          box-sizing: border-box;
          user-select: none;
        }
        .miro-ruler-top {
          left: 20px; top: 0; right: 0; height: 20px;
          border-bottom: 2px solid #6c8fff;
          background-image: linear-gradient(90deg, rgba(255, 255, 255, 0.1) 1px, transparent 1px);
          background-size: 10px 100%;
        }
        .miro-ruler-left {
          left: 0; top: 20px; bottom: 0; width: 20px;
          border-right: 2px solid #6c8fff;
          background-image: linear-gradient(rgba(255, 255, 255, 0.1) 1px, transparent 1px);
          background-size: 100% 10px;
        }
        .miro-ruler-corner {
          left: 0; top: 0; width: 20px; height: 20px;
          background: #121420;
          border: 1px solid rgba(255, 255, 255, 0.12);
        }
        .miro-guide-v {
          position: absolute;
          top: 0; bottom: 0;
          width: 9px;
          margin-left: -4px;
          cursor: col-resize;
          z-index: 999;
        }
        .miro-guide-h {
          position: absolute;
          left: 0; right: 0;
          height: 9px;
          margin-top: -4px;
          cursor: row-resize;
          z-index: 999;
        }
        .miro-guide-line {
          position: absolute;
          pointer-events: none;
        }
        .miro-guide-line.miro-guide-line-v {
          top: 0; bottom: 0; left: 3px; width: 3px;
          background: #6c8fff;
          box-shadow: 0 0 8px rgba(108, 143, 255, 0.8);
        }
        .miro-guide-line.miro-guide-line-h {
          left: 0; right: 0; top: 3px; height: 3px;
          background: #6c8fff;
          box-shadow: 0 0 8px rgba(108, 143, 255, 0.8);
        }
        .miro-guide-line.is-locked {
          background: #ff6b35 !important;
          box-shadow: 0 0 8px rgba(255, 107, 53, 0.8) !important;
        }
        .miro-cell-viewport {
          position: absolute;
          box-sizing: border-box;
          background: transparent;
          border: 3px solid rgba(108, 143, 255, 0.45);
          border-radius: 12px;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5), inset 0 0 10px rgba(108, 143, 255, 0.15);
          overflow: hidden;
        }
        .miro-cell-label {
          position: absolute;
          top: 8px;
          left: 8px;
          font-size: 0.65rem;
          color: rgba(255, 255, 255, 0.35);
          background: rgba(0, 0, 0, 0.6);
          padding: 2px 6px;
          border-radius: 4px;
          pointer-events: none;
          z-index: 10;
          font-weight: bold;
          font-family: var(--font);
        }
        /* Custom Context Menu */
        .miro-slices-menu {
          position: fixed;
          background: #ffffff;
          border: 1px solid #dcdfe6;
          border-radius: 4px;
          box-shadow: 0 2px 10px rgba(0,0,0,0.15);
          z-index: 2000;
          font-family: var(--font);
          font-size: 0.7rem;
          padding: 4px 0;
          min-width: 100px;
        }
        .miro-slices-menu-item {
          padding: 6px 12px;
          cursor: pointer;
          color: #333;
        }
        .miro-slices-menu-item:hover {
          background: #f5f7fa;
          color: var(--ac);
        }
      `;
      document.head.appendChild(style);
    }

    const canvas = document.getElementById('miro-canvas');
    if (!canvas) return;

    // Remove existing rulers
    document.querySelectorAll('.miro-ruler').forEach(el => el.remove());

    const page = cp();
    if (!page || page.pageType !== 'miro' || !page._guidesMode) return;

    // Append Rulers
    const rTop = document.createElement('div');
    rTop.className = 'miro-ruler miro-ruler-top';
    const rLeft = document.createElement('div');
    rLeft.className = 'miro-ruler miro-ruler-left';
    const rCorner = document.createElement('div');
    rCorner.className = 'miro-ruler miro-ruler-corner';

    // Drag from rulers to create new guide
    rTop.onmousedown = (e) => {
      e.stopPropagation(); e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const pct = (e.clientX - rect.left) / rect.width;
      if (!page.vGuides) page.vGuides = [];
      page.vGuides.push(pct);
      sv();
      partitionMiroCardsIntoCells(page, rect.width, rect.height);
      buildMiroCanvas();
      // Start dragging immediately
      const idx = page.vGuides.length - 1;
      _activeGuideDrag = { type: 'v', idx, startPct: pct, startClient: e.clientX };
    };

    rLeft.onmousedown = (e) => {
      e.stopPropagation(); e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const pct = (e.clientY - rect.top) / rect.height;
      if (!page.hGuides) page.hGuides = [];
      page.hGuides.push(pct);
      sv();
      partitionMiroCardsIntoCells(page, rect.width, rect.height);
      buildMiroCanvas();
      // Start dragging immediately
      const idx = page.hGuides.length - 1;
      _activeGuideDrag = { type: 'h', idx, startPct: pct, startClient: e.clientY };
    };

    canvas.appendChild(rCorner);
    canvas.appendChild(rTop);
    canvas.appendChild(rLeft);
  };

  // Add event listeners for guide dragging globally
  document.addEventListener('mousemove', (e) => {
    if (!_activeGuideDrag) return;
    const page = cp();
    if (!page) return;
    const canvas = document.getElementById('miro-canvas');
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();

    if (_activeGuideDrag.type === 'v') {
      const delta = e.clientX - _activeGuideDrag.startClient;
      let newPct = _activeGuideDrag.startPct + (delta / rect.width);
      newPct = Math.max(0.02, Math.min(0.98, newPct)); // limit range
      
      // Update guide percentage
      page.vGuides[_activeGuideDrag.idx] = newPct;
      
      // Live visual update of guides elements (cheap)
      const guideEl = document.querySelector(`.miro-guide-v[data-idx="${_activeGuideDrag.idx}"]`);
      if (guideEl) {
        guideEl.style.left = (newPct * 100) + '%';
      }
    } else {
      const delta = e.clientY - _activeGuideDrag.startClient;
      let newPct = _activeGuideDrag.startPct + (delta / rect.height);
      newPct = Math.max(0.02, Math.min(0.98, newPct)); // limit range
      
      // Update guide percentage
      page.hGuides[_activeGuideDrag.idx] = newPct;
      
      // Live visual update of guides elements (cheap)
      const guideEl = document.querySelector(`.miro-guide-h[data-idx="${_activeGuideDrag.idx}"]`);
      if (guideEl) {
        guideEl.style.top = (newPct * 100) + '%';
      }
    }
  });

  document.addEventListener('mouseup', () => {
    if (!_activeGuideDrag) return;
    const page = cp();
    if (page) {
      // Re-partition cards on release to assign to new boundaries
      const canvas = document.getElementById('miro-canvas');
      const rect = canvas.getBoundingClientRect();
      partitionMiroCardsIntoCells(page, rect.width, rect.height);
      sv();
      buildMiroCanvas();
    }
    _activeGuideDrag = null;
  });

  // Render sliced cell viewports inside #miro-board
  window.renderMiroSlices = function renderMiroSlices(page) {
    const board = document.getElementById('miro-board');
    if (!board) return;

    // Reset board transforms so cell containers scale properly
    board.style.transform = 'none';

    const canvas = document.getElementById('miro-canvas');
    const W = canvas.clientWidth, H = canvas.clientHeight;

    // Set board width/height to canvas size so child percentages resolve correctly
    board.style.width = W + 'px';
    board.style.height = H + 'px';

    // Automatically partition any new/unpartitioned cards
    if (typeof window.partitionMiroCardsIntoCells === 'function') {
      window.partitionMiroCardsIntoCells(page, W, H);
    }

    const vg = [0, ...(page.vGuides || []).sort((a,b)=>a-b), 1];
    const hg = [0, ...(page.hGuides || []).sort((a,b)=>a-b), 1];
    const cols = vg.length - 1;
    const rows = hg.length - 1;

    // Ensure cellStates is initialized
    if (!page.cellStates) page.cellStates = {};

    // Render cell viewports
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cellKey = c + "_" + r;
        const cellDiv = document.createElement('div');
        cellDiv.className = 'miro-cell-viewport';
        cellDiv.dataset.col = c;
        cellDiv.dataset.row = r;
        cellDiv.dataset.cellKey = cellKey;

        // Position cell viewport with percentages
        cellDiv.style.left = (vg[c] * 100) + '%';
        cellDiv.style.width = ((vg[c+1] - vg[c]) * 100) + '%';
        cellDiv.style.top = (hg[r] * 100) + '%';
        cellDiv.style.height = ((hg[r+1] - hg[r]) * 100) + '%';
        cellDiv.style.border = '1px dashed rgba(108, 143, 255, 0.35)';

        // Debug cell label
        const lbl = document.createElement('div');
        lbl.className = 'miro-cell-label';
        lbl.textContent = `Cell [${c+1}, ${r+1}]`;
        cellDiv.appendChild(lbl);

        // Internal cell board
        const cellBoard = document.createElement('div');
        cellBoard.className = 'miro-cell-board';
        cellBoard.style.position = 'absolute';
        cellBoard.style.left = '0';
        cellBoard.style.top = '0';
        cellBoard.style.width = '100%';
        cellBoard.style.height = '100%';
        cellBoard.style.transformOrigin = '0 0';

        // Retrieve or initialize cell zoom & pan state
        if (!page.cellStates[cellKey]) {
          page.cellStates[cellKey] = { zoom: 100, panX: 0, panY: 0 };
        }
        const state = page.cellStates[cellKey];
        
        // Clamp and apply transforms
        const cw = W * (vg[c+1] - vg[c]);
        const ch = H * (hg[r+1] - hg[r]);
        clampCellState(cellKey, cw, ch);
        const z = state.zoom / 100;
        cellBoard.style.transform = `translate(${state.panX}px, ${state.panY}px) scale(${z})`;

        // Render card child elements
        const cellCards = (page.miroCards || []).filter(card => card.cell === cellKey);
        const buildersMap = {
          sticky: 'buildMiroSticky',
          image: 'buildMiroImage',
          text: 'buildMiroText',
          shape: 'buildMiroShape',
          pen: 'buildMiroPen',
          grid: 'buildMiroGridCard',
          mindmap: 'buildMiroMindMap',
          trello: 'buildMiroTrello',
          bwidget: 'buildMiroBookmarkWidget',
          array: 'buildMiroArray',
          calendar: 'buildMiroGantt',
          gantt: 'buildMiroGantt',
          embed: 'buildMiroEmbed',
          'overlay-page': 'buildMiroOverlayWidget',
          life: 'buildMiroLifeWidget',
        };

        cellCards.forEach((card) => {
          try {
            const fnName = buildersMap[card.type];
            const fn = fnName ? window[fnName] : null;
            const fallback = window.buildMiroCard;
            let el;
            if (typeof fn === 'function') el = fn(card);
            else if (typeof fallback === 'function') el = fallback(card);
            
            if (el) {
              // Hide delete/lock buttons if the widget is inside grid layout (cleaner)
              const delBtn = el.querySelector('.mc-del');
              const lockBtn = el.querySelector('.mc-lock');
              if (delBtn) delBtn.style.setProperty('--inv-zoom', '1');
              if (lockBtn) lockBtn.style.setProperty('--inv-zoom', '1');
              cellBoard.appendChild(el);
            }
          } catch (err) {
            console.error('[CELL RENDER ERROR]', card && card.type, card && card.id, err);
          }
        });

        cellDiv.appendChild(cellBoard);
        board.appendChild(cellDiv);
      }
    }

    // Render draggable guide overlays if _guidesMode is active
    if (page._guidesMode) {
      // Render Vertical Guides
      (page.vGuides || []).forEach((pct, idx) => {
        const line = document.createElement('div');
        line.className = 'miro-guide-v';
        line.dataset.idx = idx;
        line.style.left = (pct * 100) + '%';

        const lineVisual = document.createElement('div');
        lineVisual.className = 'miro-guide-line miro-guide-line-v';
        if (page.lockedGuides && page.lockedGuides.indexOf('v_' + idx) !== -1) {
          lineVisual.classList.add('is-locked');
        }
        line.appendChild(lineVisual);

        // Events
        line.onmousedown = (e) => {
          if (page.lockedGuides && page.lockedGuides.indexOf('v_' + idx) !== -1) return;
          e.stopPropagation(); e.preventDefault();
          _activeGuideDrag = { type: 'v', idx, startPct: pct, startClient: e.clientX };
        };

        line.oncontextmenu = (e) => {
          e.preventDefault(); e.stopPropagation();
          showSlicesContextMenu(e, 'v', idx);
        };

        board.appendChild(line);
      });

      // Render Horizontal Guides
      (page.hGuides || []).forEach((pct, idx) => {
        const line = document.createElement('div');
        line.className = 'miro-guide-h';
        line.dataset.idx = idx;
        line.style.top = (pct * 100) + '%';

        const lineVisual = document.createElement('div');
        lineVisual.className = 'miro-guide-line miro-guide-line-h';
        if (page.lockedGuides && page.lockedGuides.indexOf('h_' + idx) !== -1) {
          lineVisual.classList.add('is-locked');
        }
        line.appendChild(lineVisual);

        // Events
        line.onmousedown = (e) => {
          if (page.lockedGuides && page.lockedGuides.indexOf('h_' + idx) !== -1) return;
          e.stopPropagation(); e.preventDefault();
          _activeGuideDrag = { type: 'h', idx, startPct: pct, startClient: e.clientY };
        };

        line.oncontextmenu = (e) => {
          e.preventDefault(); e.stopPropagation();
          showSlicesContextMenu(e, 'h', idx);
        };

        board.appendChild(line);
      });
    }
  };

  // Show custom context menu for locking or deleting guides
  function showSlicesContextMenu(e, type, idx) {
    document.querySelectorAll('.miro-slices-menu').forEach(el => el.remove());
    const menu = document.createElement('div');
    menu.className = 'miro-slices-menu';
    menu.style.left = e.clientX + 'px';
    menu.style.top = e.clientY + 'px';

    const page = cp();
    if (!page.lockedGuides) page.lockedGuides = [];
    const guideKey = type + '_' + idx;
    const isLocked = page.lockedGuides.indexOf(guideKey) !== -1;

    // Lock Item
    const lockItem = document.createElement('div');
    lockItem.className = 'miro-slices-menu-item';
    lockItem.textContent = isLocked ? '🔓 Unlock Guide' : '🔒 Lock Guide';
    lockItem.onclick = () => {
      if (isLocked) {
        page.lockedGuides = page.lockedGuides.filter(k => k !== guideKey);
      } else {
        page.lockedGuides.push(guideKey);
      }
      menu.remove();
      sv();
      buildMiroCanvas();
    };
    menu.appendChild(lockItem);

    // Delete Item
    const delItem = document.createElement('div');
    delItem.className = 'miro-slices-menu-item';
    delItem.textContent = '🗑️ Delete Guide';
    delItem.onclick = () => {
      const canvas = document.getElementById('miro-canvas');
      const W = canvas.clientWidth, H = canvas.clientHeight;
      
      // Merge cells first to prevent card deletion
      mergeMiroCellsIntoCards(page, W, H);
      
      if (type === 'v') {
        page.vGuides.splice(idx, 1);
      } else {
        page.hGuides.splice(idx, 1);
      }
      
      // Re-partition with new guides list
      partitionMiroCardsIntoCells(page, W, H);
      menu.remove();
      sv();
      buildMiroCanvas();
    };
    menu.appendChild(delItem);

    document.body.appendChild(menu);
    const closeMenu = () => { menu.remove(); document.removeEventListener('click', closeMenu); };
    setTimeout(() => document.addEventListener('click', closeMenu), 100);
  }

  // Constrain cell panX and panY so that card bounds don't disappear
  window.clampCellState = function clampCellState(cellKey, cellW, cellH) {
    const page = cp();
    if (!page || !page.cellStates || !page.cellStates[cellKey]) return;
    const state = page.cellStates[cellKey];
    const zoom = state.zoom / 100;

    const cards = (page.miroCards || []).filter(c => c.cell === cellKey);
    if (cards.length === 0) return;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    cards.forEach(c => {
      minX = Math.min(minX, c.x || 0);
      minY = Math.min(minY, c.y || 0);
      maxX = Math.max(maxX, (c.x || 0) + (c.w || 280));
      maxY = Math.max(maxY, (c.y || 0) + (c.h || 240));
    });

    const contentW = (maxX - minX) * zoom;
    if (contentW <= cellW) {
      const minPan = -minX * zoom;
      const maxPan = cellW - maxX * zoom;
      state.panX = Math.max(minPan, Math.min(maxPan, state.panX));
    } else {
      const minPan = cellW - maxX * zoom;
      const maxPan = -minX * zoom;
      state.panX = Math.max(minPan, Math.min(maxPan, state.panX));
    }

    const contentH = (maxY - minY) * zoom;
    if (contentH <= cellH) {
      const minPan = -minY * zoom;
      const maxPan = cellH - maxY * zoom;
      state.panY = Math.max(minPan, Math.min(maxPan, state.panY));
    } else {
      const minPan = cellH - maxY * zoom;
      const maxPan = -minY * zoom;
      state.panY = Math.max(minPan, Math.min(maxPan, state.panY));
    }
  };

  // Convert absolute coordinates to cell-local coordinates based on guide percentages
  window.partitionMiroCardsIntoCells = function partitionMiroCardsIntoCells(page, canvasW, canvasH) {
    if (!page.vGuides) page.vGuides = [];
    if (!page.hGuides) page.hGuides = [];
    if (page.vGuides.length === 0 && page.hGuides.length === 0) return;

    const vg = [0, ...[...page.vGuides].sort((a,b)=>a-b), 1];
    const hg = [0, ...[...page.hGuides].sort((a,b)=>a-b), 1];

    (page.miroCards || []).forEach(card => {
      // Calculate absolute center coords in board space
      const cx = (card.x || 0) + (card.w || 280) / 2;
      const cy = (card.y || 0) + (card.h || 240) / 2;

      // Find viewport col/row that contains center
      const pctX = cx / canvasW;
      const pctY = cy / canvasH;

      let col = vg.length - 2;
      for (let i = 0; i < vg.length - 1; i++) {
        if (pctX >= vg[i] && pctX < vg[i+1]) { col = i; break; }
      }

      let row = hg.length - 2;
      for (let i = 0; i < hg.length - 1; i++) {
        if (pctY >= hg[i] && pctY < hg[i+1]) { row = i; break; }
      }

      // If the card is already in this cell, don't adjust local coordinates
      const targetCell = col + "_" + row;
      if (card.cell === targetCell) return;

      const cellLeft = vg[col] * canvasW;
      const cellTop = hg[row] * canvasH;

      // If it was already in another cell, translate back to absolute first
      if (card.cell) {
        const oldParts = card.cell.split('_');
        const oc = parseInt(oldParts[0]), or = parseInt(oldParts[1]);
        const oldLeft = vg[oc] * canvasW;
        const oldTop = hg[or] * canvasH;
        card.x = oldLeft + (card.x || 0);
        card.y = oldTop + (card.y || 0);
      }

      // Convert absolute to local cell coordinates
      card.cell = targetCell;
      card.x = (card.x || 0) - cellLeft;
      card.y = (card.y || 0) - cellTop;
    });
  };

  // Convert cell-local coordinates back to absolute coordinates
  window.mergeMiroCellsIntoCards = function mergeMiroCellsIntoCards(page, canvasW, canvasH) {
    if (!page.vGuides) page.vGuides = [];
    if (!page.hGuides) page.hGuides = [];
    
    const vg = [0, ...[...page.vGuides].sort((a,b)=>a-b), 1];
    const hg = [0, ...[...page.hGuides].sort((a,b)=>a-b), 1];

    (page.miroCards || []).forEach(card => {
      if (card.cell) {
        const parts = card.cell.split('_');
        const c = parseInt(parts[0]), r = parseInt(parts[1]);
        const cellLeft = vg[c] * canvasW;
        const cellTop = hg[r] * canvasH;

        card.x = cellLeft + (card.x || 0);
        card.y = cellTop + (card.y || 0);
        delete card.cell;
      }
    });
  };

  // Calculate local zoom level for card dragging
  window.getMiroCardDragZoom = function getMiroCardDragZoom(card) {
    const page = cp();
    if (page && page.vGuides && (page.vGuides.length > 0 || (page.hGuides && page.hGuides.length > 0))) {
      if (card.cell && page.cellStates && page.cellStates[card.cell]) {
        return page.cellStates[card.cell].zoom / 100;
      }
    }
    return (page.zoom || 100) / 100;
  };

  // Clamps card x/y coords to keep it inside cell boundaries
  window.clampMiroCardDrag = function clampMiroCardDrag(card, x, y) {
    const page = cp();
    if (!page || !card.cell || !page.cellStates || !page.cellStates[card.cell]) return { x, y };

    const parts = card.cell.split('_');
    const col = parseInt(parts[0]), row = parseInt(parts[1]);
    const cellEl = document.querySelector(`.miro-cell-viewport[data-col="${col}"][data-row="${row}"]`);
    if (!cellEl) return { x, y };

    const cellW = cellEl.clientWidth;
    const cellH = cellEl.clientHeight;
    const state = page.cellStates[card.cell];
    const zoom = state.zoom / 100;

    // Local coordinates limits
    const minX = -state.panX / zoom;
    const maxX = (cellW - state.panX) / zoom - (card.w || 280);
    const minY = -state.panY / zoom;
    const maxY = (cellH - state.panY) / zoom - (card.h || 240);

    const clampedX = maxX >= minX ? Math.max(minX, Math.min(maxX, x)) : minX;
    const clampedY = maxY >= minY ? Math.max(minY, Math.min(maxY, y)) : minY;
    return { x: clampedX, y: clampedY };
  };

  // Automatically fit zoom and pan for all cells in sliced mode
  window.autofitAllMiroSlices = function autofitAllMiroSlices() {
    const page = cp();
    if (!page || page.pageType !== 'miro') return;
    if (!page.vGuides) page.vGuides = [];
    if (!page.hGuides) page.hGuides = [];
    if (page.vGuides.length === 0 && page.hGuides.length === 0) return;

    const canvas = document.getElementById('miro-canvas');
    const W = canvas.clientWidth, H = canvas.clientHeight;

    const vg = [0, ...[...page.vGuides].sort((a,b)=>a-b), 1];
    const hg = [0, ...[...page.hGuides].sort((a,b)=>a-b), 1];
    const cols = vg.length - 1;
    const rows = hg.length - 1;

    if (!page.cellStates) page.cellStates = {};

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cellKey = c + "_" + r;
        const cellW = W * (vg[c+1] - vg[c]);
        const cellH = H * (hg[r+1] - hg[r]);

        const cards = (page.miroCards || []).filter(card => card.cell === cellKey);
        if (cards.length === 0) {
          page.cellStates[cellKey] = { zoom: 100, panX: 0, panY: 0 };
          continue;
        }

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        cards.forEach(card => {
          minX = Math.min(minX, card.x || 0);
          minY = Math.min(minY, card.y || 0);
          maxX = Math.max(maxX, (card.x || 0) + (card.w || 280));
          maxY = Math.max(maxY, (card.y || 0) + (card.h || 240));
        });

        const contentW = maxX - minX;
        const contentH = maxY - minY;

        // Add 15px padding
        const zoomW = (cellW - 30) / contentW;
        const zoomH = (cellH - 30) / contentH;
        let fitZoom = Math.min(zoomW, zoomH);
        fitZoom = Math.max(0.1, Math.min(4.0, fitZoom)); // clamp between 10% and 400%

        const zPercent = Math.round(fitZoom * 100);
        const panX = (cellW - (minX + maxX) * fitZoom) / 2;
        const panY = (cellH - (minY + maxY) * fitZoom) / 2;

        page.cellStates[cellKey] = { zoom: zPercent, panX, panY };
        clampCellState(cellKey, cellW, cellH);
      }
    }

    sv();
    buildMiroCanvas();
    if (typeof showToast === 'function') showToast('🔍 Auto-fit all slices complete');
  };

  // Helper to quickly create an equal/unequal grid layout up to 20x20
  window.createMiroGrid = function createMiroGrid(cols, rows) {
    const page = cp();
    if (!page || page.pageType !== 'miro') return;
    cols = Math.max(1, Math.min(20, cols));
    rows = Math.max(1, Math.min(20, rows));

    const canvas = document.getElementById('miro-canvas');
    const W = canvas.clientWidth, H = canvas.clientHeight;

    // Reset current cells back to absolute cards first
    mergeMiroCellsIntoCards(page, W, H);

    page.vGuides = [];
    page.hGuides = [];
    page.lockedGuides = [];

    // equal vertical divisions
    for (let i = 1; i < cols; i++) {
      page.vGuides.push(i / cols);
    }

    // equal horizontal divisions
    for (let i = 1; i < rows; i++) {
      page.hGuides.push(i / rows);
    }

    // Partition cards
    partitionMiroCardsIntoCells(page, W, H);
    page.cellStates = {};
    page._guidesMode = true; // turn on guides mode
    
    // Auto-fit immediately for best fit
    autofitAllMiroSlices();
    
    initMiroSlices();
    sv();
    buildMiroCanvas();
  };

  // Handle cell-local drag panning (used by miro-engine.js)
  window.handleMiroCellPanStart = function handleMiroCellPanStart(e) {
    const page = cp();
    if (!page || page.pageType !== 'miro') return false;
    if (!page.vGuides || (page.vGuides.length === 0 && (!page.hGuides || page.hGuides.length === 0))) return false;

    const cellViewport = e.target.closest('.miro-cell-viewport');
    if (!cellViewport) return false;

    _activeCellKey = cellViewport.dataset.cellKey;
    const state = page.cellStates[_activeCellKey] || { zoom: 100, panX: 0, panY: 0 };
    _cellPanning = true;
    _cellPanStartX = e.clientX - state.panX;
    _cellPanStartY = e.clientY - state.panY;

    cellViewport.style.cursor = 'grabbing';
    return true;
  };

  window.handleMiroCellPanMove = function handleMiroCellPanMove(e) {
    if (!_cellPanning || !_activeCellKey) return false;
    const page = cp();
    if (!page || !page.cellStates || !page.cellStates[_activeCellKey]) return false;

    const state = page.cellStates[_activeCellKey];
    state.panX = e.clientX - _cellPanStartX;
    state.panY = e.clientY - _cellPanStartY;

    // Get cell element dimensions
    const parts = _activeCellKey.split('_');
    const col = parseInt(parts[0]), row = parseInt(parts[1]);
    const cellEl = document.querySelector(`.miro-cell-viewport[data-col="${col}"][data-row="${row}"]`);
    if (cellEl) {
      clampCellState(_activeCellKey, cellEl.clientWidth, cellEl.clientHeight);
      const cellBoard = cellEl.querySelector('.miro-cell-board');
      if (cellBoard) {
        const z = state.zoom / 100;
        cellBoard.style.transform = `translate(${state.panX}px, ${state.panY}px) scale(${z})`;
      }
    }
    return true;
  };

  window.handleMiroCellPanEnd = function handleMiroCellPanEnd() {
    if (!_cellPanning) return false;
    _cellPanning = false;
    
    // Restore cursors
    document.querySelectorAll('.miro-cell-viewport').forEach(el => { el.style.cursor = ''; });
    _activeCellKey = null;
    sv();
    return true;
  };

  // Handle cell-local wheel zooming (used by miro-engine.js)
  window.handleMiroCellWheel = function handleMiroCellWheel(e) {
    const page = cp();
    if (!page || page.pageType !== 'miro') return false;
    if (!page.vGuides || (page.vGuides.length === 0 && (!page.hGuides || page.hGuides.length === 0))) return false;

    const cellViewport = e.target.closest('.miro-cell-viewport');
    if (!cellViewport) return false;

    e.preventDefault();
    const cellKey = cellViewport.dataset.cellKey;
    const parts = cellKey.split('_');
    const col = parseInt(parts[0]), row = parseInt(parts[1]);

    const cellW = cellViewport.clientWidth;
    const cellH = cellViewport.clientHeight;
    const cellState = page.cellStates[cellKey] || { zoom: 100, panX: 0, panY: 0 };

    const rect = cellViewport.getBoundingClientRect();
    const cursorX = e.clientX - rect.left;
    const cursorY = e.clientY - rect.top;

    const oldZoom = cellState.zoom / 100;
    const boardPointX = (cursorX - cellState.panX) / oldZoom;
    const boardPointY = (cursorY - cellState.panY) / oldZoom;

    // Predefined levels zoom helper
    const zoomLevels = [
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
      12, 14, 16, 18, 20, 22,
      25, 28, 31, 35, 39, 44, 49, 55, 62, 69, 77, 86, 97, 108,
      121, 136, 152, 171, 191, 214, 240, 268, 301, 337, 377, 400
    ];

    function getNextLocalZoom(current, direction) {
      if (direction > 0) {
        for (let i = 0; i < zoomLevels.length; i++) {
          if (zoomLevels[i] > current) return zoomLevels[i];
        }
        return zoomLevels[zoomLevels.length - 1];
      } else {
        for (let i = zoomLevels.length - 1; i >= 0; i--) {
          if (zoomLevels[i] < current) return zoomLevels[i];
        }
        return zoomLevels[0];
      }
    }

    const direction = e.deltaY > 0 ? -1 : 1;

    // CHECK: Ctrl key zoom syncs zoom levels across ALL cells!
    if (e.ctrlKey) {
      const newZoomNum = getNextLocalZoom(cellState.zoom, direction);
      const newZoom = newZoomNum / 100;
      
      // Update ALL cells
      for (const k in page.cellStates) {
        const cState = page.cellStates[k];
        const oldZ = cState.zoom / 100;
        cState.zoom = newZoomNum;
        
        // Adjust pan relative to cell center so it stays centered
        const cParts = k.split('_');
        const cc = parseInt(cParts[0]), cr = parseInt(cParts[1]);
        const cEl = document.querySelector(`.miro-cell-viewport[data-col="${cc}"][data-row="${cr}"]`);
        if (cEl) {
          const cx = cEl.clientWidth / 2;
          const cy = cEl.clientHeight / 2;
          const bpX = (cx - cState.panX) / oldZ;
          const bpY = (cy - cState.panY) / oldZ;
          cState.panX = cx - (bpX * newZoom);
          cState.panY = cy - (bpY * newZoom);
          clampCellState(k, cEl.clientWidth, cEl.clientHeight);
        }
      }
    } else {
      // Single cell zoom
      const newZoomNum = getNextLocalZoom(cellState.zoom, direction);
      cellState.zoom = newZoomNum;
      const newZoom = newZoomNum / 100;

      cellState.panX = cursorX - (boardPointX * newZoom);
      cellState.panY = cursorY - (boardPointY * newZoom);
      clampCellState(cellKey, cellW, cellH);
    }

    // Live update board style transforms
    document.querySelectorAll('.miro-cell-viewport').forEach(cvEl => {
      const k = cvEl.dataset.cellKey;
      const cState = page.cellStates[k];
      if (cState) {
        const cellBoard = cvEl.querySelector('.miro-cell-board');
        if (cellBoard) {
          const z = cState.zoom / 100;
          cellBoard.style.transform = `translate(${cState.panX}px, ${cState.panY}px) scale(${z})`;
        }
      }
    });

    clearTimeout(_wheelSvTimer);
    _wheelSvTimer = setTimeout(() => sv(), 1000);

    return true;
  };

  // Register namespace
  SM.miro.layout = SM.miro.layout || {};
  SM.miro.layout.initMiroSlices = window.initMiroSlices;
  SM.miro.layout.renderMiroSlices = window.renderMiroSlices;
  SM.miro.layout.autofitAllMiroSlices = window.autofitAllMiroSlices;
  SM.miro.layout.partitionMiroCardsIntoCells = window.partitionMiroCardsIntoCells;
  SM.miro.layout.mergeMiroCellsIntoCards = window.mergeMiroCellsIntoCards;
  SM.miro.layout.getMiroCardDragZoom = window.getMiroCardDragZoom;
  SM.miro.layout.clampMiroCardDrag = window.clampMiroCardDrag;
  SM.miro.layout.createMiroGrid = window.createMiroGrid;

  // Run init on startup
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => window.initMiroSlices());
  } else {
    window.initMiroSlices();
  }
})();
