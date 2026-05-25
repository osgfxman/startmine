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

  function parseTitleAndIcon(titleStr) {
    if (!titleStr) return { title: '', icon: null };
    // Match http/https URLs or base64 data URIs
    const imgRegex = /(https?:\/\/[^\s]+|data:image\/[a-zA-Z0-9+/=]*;base64,[^\s]+)/i;
    const match = titleStr.match(imgRegex);
    if (match) {
      const icon = match[1];
      const title = titleStr.replace(icon, '').trim();
      return { title, icon };
    }
    return { title: titleStr, icon: null };
  }

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
          color: rgba(255, 255, 255, 0.55);
          background: rgba(0, 0, 0, 0.6);
          padding: 3px 8px;
          border-radius: 6px;
          pointer-events: auto;
          cursor: pointer;
          z-index: 10;
          font-weight: bold;
          font-family: var(--font);
          display: flex;
          align-items: center;
          gap: 5px;
          transition: background .15s, color .15s;
          user-select: none;
        }
        .miro-cell-label:hover {
          background: rgba(108, 143, 255, 0.35);
          color: rgba(255, 255, 255, 0.85);
        }
        .miro-cell-color-tag {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          flex-shrink: 0;
        }
        .miro-cell-zoom-text {
          opacity: 0.6;
          font-weight: 400;
          font-size: 0.6rem;
        }
        .miro-cell-bg-overlay {
          position: absolute;
          top: 0; left: 0; right: 0; bottom: 0;
          pointer-events: none;
          border-radius: 12px;
          z-index: 0;
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
        /* Cell Settings Modal */
        .miro-cell-modal-overlay {
          position: fixed;
          top: 0; left: 0; right: 0; bottom: 0;
          background: rgba(0,0,0,0.55);
          z-index: 3000;
          display: flex;
          align-items: center;
          justify-content: center;
          backdrop-filter: blur(4px);
        }
        .miro-cell-modal {
          background: #1a1d2e;
          border: 1px solid rgba(108, 143, 255, 0.3);
          border-radius: 16px;
          padding: 20px 24px;
          min-width: 300px;
          max-width: 380px;
          box-shadow: 0 12px 48px rgba(0,0,0,0.6);
          font-family: var(--font);
          color: #e8eaf6;
        }
        .miro-cell-modal h3 {
          margin: 0 0 16px 0;
          font-size: 0.9rem;
          color: #fff;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .miro-cell-modal .mcm-row {
          margin-bottom: 12px;
        }
        .miro-cell-modal .mcm-row label {
          display: block;
          font-size: 0.65rem;
          color: rgba(255,255,255,0.5);
          margin-bottom: 4px;
        }
        .miro-cell-modal .mcm-row input[type="text"] {
          width: 100%;
          background: rgba(255,255,255,0.08);
          border: 1px solid rgba(255,255,255,0.15);
          border-radius: 8px;
          padding: 6px 10px;
          color: #fff;
          font-size: 0.75rem;
          outline: none;
          box-sizing: border-box;
        }
        .miro-cell-modal .mcm-row input[type="text"]:focus {
          border-color: #6c8fff;
        }
        .miro-cell-modal .mcm-colors {
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
        }
        .miro-cell-modal .mcm-csw {
          width: 24px;
          height: 24px;
          border-radius: 50%;
          cursor: pointer;
          border: 2px solid transparent;
          transition: border-color .12s, transform .12s;
        }
        .miro-cell-modal .mcm-csw:hover {
          transform: scale(1.15);
        }
        .miro-cell-modal .mcm-csw.sel {
          border-color: #fff;
        }
        .miro-cell-modal .mcm-bg-row {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .miro-cell-modal .mcm-bg-row input[type="color"] {
          width: 36px;
          height: 28px;
          border: none;
          background: none;
          cursor: pointer;
          border-radius: 6px;
        }
        .miro-cell-modal .mcm-bg-row input[type="range"] {
          flex: 1;
          accent-color: #6c8fff;
        }
        .miro-cell-modal .mcm-bg-row .mcm-opacity-val {
          font-size: 0.65rem;
          color: rgba(255,255,255,0.5);
          min-width: 30px;
          text-align: right;
        }
        .miro-cell-modal .mcm-actions {
          display: flex;
          justify-content: flex-end;
          gap: 8px;
          margin-top: 16px;
        }
        .miro-cell-modal .mcm-btn {
          padding: 6px 16px;
          border-radius: 8px;
          border: none;
          cursor: pointer;
          font-size: 0.7rem;
          font-weight: 600;
          transition: background .12s;
        }
        .miro-cell-modal .mcm-btn-cancel {
          background: rgba(255,255,255,0.1);
          color: rgba(255,255,255,0.6);
        }
        .miro-cell-modal .mcm-btn-cancel:hover {
          background: rgba(255,255,255,0.15);
        }
        .miro-cell-modal .mcm-btn-save {
          background: #6c8fff;
          color: #fff;
        }
        .miro-cell-modal .mcm-btn-save:hover {
          background: #5a7de8;
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

        // Apply custom background color if set
        if (page.cellStates[cellKey] && page.cellStates[cellKey].bgColor) {
          const bg = page.cellStates[cellKey].bgColor;
          const opacity = page.cellStates[cellKey].bgOpacity != null ? page.cellStates[cellKey].bgOpacity : 0.15;
          const overlay = document.createElement('div');
          overlay.className = 'miro-cell-bg-overlay';
          overlay.style.background = bg;
          overlay.style.opacity = opacity;
          cellDiv.appendChild(overlay);
        }

        // Interactive cell label with title, color tag, and zoom
        const lbl = document.createElement('div');
        lbl.className = 'miro-cell-label';

        // Color tag dot
        const cellState = page.cellStates[cellKey] || {};
        if (cellState.colorTag) {
          const dot = document.createElement('span');
          dot.className = 'miro-cell-color-tag';
          dot.style.background = cellState.colorTag;
          lbl.appendChild(dot);
        }

        // Determine icon and title
        let displayTitle = cellState.title || '';
        let displayIcon = cellState.icon || '';
        let iconSize = cellState.iconSize || 20;

        // Fallback parser if icon is not set but title contains one
        if (!displayIcon && displayTitle) {
          const parsed = parseTitleAndIcon(displayTitle);
          displayTitle = parsed.title;
          displayIcon = parsed.icon;
        }

        // Icon element
        if (displayIcon) {
          const img = document.createElement('img');
          img.src = displayIcon;
          img.style.width = iconSize + 'px';
          img.style.height = iconSize + 'px';
          img.style.objectFit = 'contain';
          img.style.borderRadius = '4px';
          img.style.flexShrink = '0';
          img.style.verticalAlign = 'middle';
          lbl.appendChild(img);
        }

        // Title text
        const titleSpan = document.createElement('span');
        titleSpan.textContent = displayTitle || (displayIcon ? '' : `Cell [${c+1}, ${r+1}]`);
        if (displayTitle || !displayIcon) {
          lbl.appendChild(titleSpan);
        }

        // Zoom percentage
        const zoomSpan = document.createElement('span');
        zoomSpan.className = 'miro-cell-zoom-text';
        zoomSpan.textContent = `(${cellState.zoom || 100}%)`;
        lbl.appendChild(zoomSpan);

        // Click to open settings modal
        lbl.addEventListener('click', (ev) => {
          ev.stopPropagation();
          ev.preventDefault();
          showCellSettingsModal(cellKey);
        });

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
              
              if (card.pinned) {
                cellDiv.appendChild(el);
                el.style.position = 'absolute';
                el.style.left = (card._pinCellX || 0) + 'px';
                el.style.top = (card._pinCellY || 0) + 'px';
                el.style.width = (card._pinCellW || card.w || 200) + 'px';
                el.style.height = (card._pinCellH || card.h || 150) + 'px';
                el.style.zIndex = '20';
                el.style.transform = 'none';
              } else {
                cellBoard.appendChild(el);
              }
            }
          } catch (err) {
            console.error('[CELL RENDER ERROR]', card && card.type, card && card.id, err);
          }
        });

        cellDiv.appendChild(cellBoard);
        board.appendChild(cellDiv);
      }
    }

    // Render draggable guide overlays if guides exist
    const hasGuides = page.vGuides && (page.vGuides.length > 0 || (page.hGuides && page.hGuides.length > 0));
    if (hasGuides) {
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
      let absX = card.x || 0;
      let absY = card.y || 0;
      if (card.cell) {
        const parts = card.cell.split('_');
        const c = parseInt(parts[0]), r = parseInt(parts[1]);
        const cellLeft = vg[c] * canvasW;
        const cellTop = hg[r] * canvasH;
        absX = cellLeft + absX;
        absY = cellTop + absY;
      }

      const cx = absX + (card.w || 280) / 2;
      const cy = absY + (card.h || 240) / 2;

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

      // Convert absolute to local cell coordinates
      card.cell = targetCell;
      card.x = absX - cellLeft;
      card.y = absY - cellTop;
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

    // Partition cards first to ensure correct coordinates mapping
    partitionMiroCardsIntoCells(page, W, H);

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
      if (!e.altKey) clampCellState(_activeCellKey, cellEl.clientWidth, cellEl.clientHeight);
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

    // Single cell zoom only (no global sync to avoid trackpad pinch conflict)
    const newZoomNum = getNextLocalZoom(cellState.zoom, direction);
    cellState.zoom = newZoomNum;
    const newZoom = newZoomNum / 100;

    cellState.panX = cursorX - (boardPointX * newZoom);
    cellState.panY = cursorY - (boardPointY * newZoom);
    clampCellState(cellKey, cellW, cellH);

    // Live update board style transforms and zoom text for this cell only
    const cellBoard = cellViewport.querySelector('.miro-cell-board');
    if (cellBoard) {
      const z = cellState.zoom / 100;
      cellBoard.style.transform = `translate(${cellState.panX}px, ${cellState.panY}px) scale(${z})`;
    }
    const zoomText = cellViewport.querySelector('.miro-cell-zoom-text');
    if (zoomText) zoomText.textContent = `(${cellState.zoom}%)`;

    clearTimeout(_wheelSvTimer);
    _wheelSvTimer = setTimeout(() => sv(), 1000);

    return true;
  };

  // ─── Cell Settings Modal ───
  const _colorTagPalette = [
    '#ff4444', '#ff8a65', '#ffca28', '#66bb6a', '#42a5f5',
    '#7e57c2', '#ec407a', '#26c6da', '#8d6e63', '#78909c'
  ];

  function showCellSettingsModal(cellKey) {
    // Remove any existing modal
    document.querySelectorAll('.miro-cell-modal-overlay').forEach(el => el.remove());

    const page = cp();
    if (!page || !page.cellStates) return;
    if (!page.cellStates[cellKey]) page.cellStates[cellKey] = { zoom: 100, panX: 0, panY: 0 };
    const state = page.cellStates[cellKey];
    const parts = cellKey.split('_');
    const c = parseInt(parts[0]), r = parseInt(parts[1]);

    const overlay = document.createElement('div');
    overlay.className = 'miro-cell-modal-overlay';

    const modal = document.createElement('div');
    modal.className = 'miro-cell-modal';

    // Title
    const h3 = document.createElement('h3');
    h3.textContent = `⚙️ Cell [${c+1}, ${r+1}] Settings`;
    modal.appendChild(h3);

    // Row: Title input
    const titleRow = document.createElement('div');
    titleRow.className = 'mcm-row';
    const titleLabel = document.createElement('label');
    titleLabel.textContent = 'Title';
    const titleInput = document.createElement('input');
    titleInput.type = 'text';
    titleInput.value = state.title || '';
    titleInput.placeholder = `Cell [${c+1}, ${r+1}]`;
    titleRow.appendChild(titleLabel);
    titleRow.appendChild(titleInput);
    modal.appendChild(titleRow);

    // Row: Icon Image (Upload/Selection)
    const iconRow = document.createElement('div');
    iconRow.className = 'mcm-row';
    const iconLabel = document.createElement('label');
    iconLabel.textContent = 'Icon Image';
    iconRow.appendChild(iconLabel);

    const iconContainer = document.createElement('div');
    iconContainer.style.cssText = 'display:flex;align-items:center;gap:12px;margin-top:4px;';

    // File Input (Hidden)
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.style.display = 'none';

    // Upload Button
    const uploadBtn = document.createElement('button');
    uploadBtn.type = 'button';
    uploadBtn.className = 'mcm-btn mcm-btn-cancel';
    uploadBtn.style.cssText = 'padding:6px 12px;font-size:0.65rem;';
    uploadBtn.textContent = state.icon ? 'Change Image' : 'Choose Image…';

    // Preview thumbnail
    const prevImg = document.createElement('img');
    prevImg.style.cssText = 'width:32px;height:32px;object-fit:contain;border-radius:4px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);display:none;';
    if (state.icon) {
      prevImg.src = state.icon;
      prevImg.style.display = 'block';
    }

    // Clear Button
    const clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.className = 'mcm-btn mcm-btn-cancel';
    clearBtn.style.cssText = 'padding:6px 12px;font-size:0.65rem;color:#ff4444;background:rgba(255,68,68,0.1);display: ' + (state.icon ? 'block' : 'none') + ';';
    clearBtn.textContent = 'Remove';

    let currentIconUrl = state.icon || '';

    // File selection handler
    fileInput.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (ev) => {
        const base64 = ev.target.result;
        prevImg.src = base64;
        prevImg.style.display = 'block';
        uploadBtn.textContent = 'Uploading…';
        uploadBtn.disabled = true;

        if (typeof window.uploadToImgBB === 'function') {
          window.uploadToImgBB(base64).then(url => {
            uploadBtn.disabled = false;
            if (url) {
              currentIconUrl = url;
              uploadBtn.textContent = 'Uploaded ✓';
              clearBtn.style.display = 'block';
              if (typeof showToast === 'function') showToast('✅ Icon uploaded to ImgBB!');
            } else {
              uploadBtn.textContent = '⚠️ Upload Failed';
              prevImg.style.display = currentIconUrl ? 'block' : 'none';
              prevImg.src = currentIconUrl || '';
              if (typeof showToast === 'function') showToast('❌ Upload failed.');
            }
          });
        } else {
          fetch('https://api.imgbb.com/1/upload?key=129f1b49da234235959ee4405ac9ebb1', {
            method: 'POST',
            body: new URLSearchParams({ image: base64.split(',')[1] })
          })
          .then(res => res.json())
          .then(data => {
            uploadBtn.disabled = false;
            if (data.success) {
              currentIconUrl = data.data.url;
              uploadBtn.textContent = 'Uploaded ✓';
              clearBtn.style.display = 'block';
              if (typeof showToast === 'function') showToast('✅ Icon uploaded to ImgBB!');
            } else {
              uploadBtn.textContent = '⚠️ Upload Failed';
              prevImg.style.display = currentIconUrl ? 'block' : 'none';
              prevImg.src = currentIconUrl || '';
              if (typeof showToast === 'function') showToast('❌ Upload failed.');
            }
          })
          .catch(() => {
            uploadBtn.disabled = false;
            uploadBtn.textContent = '⚠️ Upload Failed';
            prevImg.style.display = currentIconUrl ? 'block' : 'none';
            prevImg.src = currentIconUrl || '';
          });
        }
      };
      reader.readAsDataURL(file);
      fileInput.value = '';
    };

    uploadBtn.onclick = () => fileInput.click();

    clearBtn.onclick = () => {
      currentIconUrl = '';
      prevImg.style.display = 'none';
      prevImg.src = '';
      clearBtn.style.display = 'none';
      uploadBtn.textContent = 'Choose Image…';
    };

    iconContainer.appendChild(fileInput);
    iconContainer.appendChild(uploadBtn);
    iconContainer.appendChild(clearBtn);
    iconContainer.appendChild(prevImg);
    iconRow.appendChild(iconContainer);
    modal.appendChild(iconRow);

    // Row: Icon Size slider
    const sizeRow = document.createElement('div');
    sizeRow.className = 'mcm-row';
    const sizeLabel = document.createElement('label');
    sizeLabel.textContent = 'Icon Size (pixels)';
    sizeRow.appendChild(sizeLabel);
    const sizeContainer = document.createElement('div');
    sizeContainer.className = 'mcm-bg-row';

    const sizeSlider = document.createElement('input');
    sizeSlider.type = 'range';
    sizeSlider.min = '8';
    sizeSlider.max = '120';
    sizeSlider.value = state.iconSize || 20;

    const sizeVal = document.createElement('span');
    sizeVal.className = 'mcm-opacity-val';
    sizeVal.textContent = sizeSlider.value + 'px';
    sizeSlider.oninput = () => { sizeVal.textContent = sizeSlider.value + 'px'; };

    sizeContainer.appendChild(sizeSlider);
    sizeContainer.appendChild(sizeVal);
    sizeRow.appendChild(sizeContainer);
    modal.appendChild(sizeRow);

    // Row: Color Tag
    const colorRow = document.createElement('div');
    colorRow.className = 'mcm-row';
    const colorLabel = document.createElement('label');
    colorLabel.textContent = 'Color Tag';
    colorRow.appendChild(colorLabel);
    const colorContainer = document.createElement('div');
    colorContainer.className = 'mcm-colors';
    let selectedColor = state.colorTag || '';

    // "None" swatch
    const noneSw = document.createElement('div');
    noneSw.className = 'mcm-csw' + (!selectedColor ? ' sel' : '');
    noneSw.style.background = 'rgba(255,255,255,0.1)';
    noneSw.title = 'None';
    noneSw.textContent = '✕';
    noneSw.style.display = 'flex';
    noneSw.style.alignItems = 'center';
    noneSw.style.justifyContent = 'center';
    noneSw.style.fontSize = '0.55rem';
    noneSw.style.color = 'rgba(255,255,255,0.4)';
    noneSw.onclick = () => {
      selectedColor = '';
      colorContainer.querySelectorAll('.mcm-csw').forEach(s => s.classList.remove('sel'));
      noneSw.classList.add('sel');
    };
    colorContainer.appendChild(noneSw);

    _colorTagPalette.forEach(hex => {
      const sw = document.createElement('div');
      sw.className = 'mcm-csw' + (selectedColor === hex ? ' sel' : '');
      sw.style.background = hex;
      sw.onclick = () => {
        selectedColor = hex;
        colorContainer.querySelectorAll('.mcm-csw').forEach(s => s.classList.remove('sel'));
        sw.classList.add('sel');
      };
      colorContainer.appendChild(sw);
    });
    colorRow.appendChild(colorContainer);
    modal.appendChild(colorRow);

    // Row: Background Color & Opacity
    const bgRow = document.createElement('div');
    bgRow.className = 'mcm-row';
    const bgLabel = document.createElement('label');
    bgLabel.textContent = 'Background Color & Opacity';
    bgRow.appendChild(bgLabel);
    const bgContainer = document.createElement('div');
    bgContainer.className = 'mcm-bg-row';

    const bgColorInput = document.createElement('input');
    bgColorInput.type = 'color';
    bgColorInput.value = state.bgColor || '#6c8fff';

    const opacitySlider = document.createElement('input');
    opacitySlider.type = 'range';
    opacitySlider.min = '0';
    opacitySlider.max = '100';
    opacitySlider.value = Math.round((state.bgOpacity != null ? state.bgOpacity : 0) * 100);

    const opacityVal = document.createElement('span');
    opacityVal.className = 'mcm-opacity-val';
    opacityVal.textContent = opacitySlider.value + '%';
    opacitySlider.oninput = () => { opacityVal.textContent = opacitySlider.value + '%'; };

    bgContainer.appendChild(bgColorInput);
    bgContainer.appendChild(opacitySlider);
    bgContainer.appendChild(opacityVal);
    bgRow.appendChild(bgContainer);
    modal.appendChild(bgRow);

    // Actions
    const actions = document.createElement('div');
    actions.className = 'mcm-actions';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'mcm-btn mcm-btn-cancel';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.onclick = () => overlay.remove();

    const saveBtn = document.createElement('button');
    saveBtn.className = 'mcm-btn mcm-btn-save';
    saveBtn.textContent = 'Save';
    saveBtn.onclick = () => {
      state.title = titleInput.value.trim() || '';
      state.icon = currentIconUrl;
      state.iconSize = parseInt(sizeSlider.value) || 20;
      state.colorTag = selectedColor;
      const oVal = parseInt(opacitySlider.value);
      if (oVal > 0) {
        state.bgColor = bgColorInput.value;
        state.bgOpacity = oVal / 100;
      } else {
        delete state.bgColor;
        delete state.bgOpacity;
      }
      overlay.remove();
      sv();
      buildMiroCanvas();
    };

    actions.appendChild(cancelBtn);
    actions.appendChild(saveBtn);
    modal.appendChild(actions);

    overlay.appendChild(modal);
    // Close on overlay click (outside modal)
    overlay.addEventListener('click', (ev) => {
      if (ev.target === overlay) overlay.remove();
    });

    document.body.appendChild(overlay);
    titleInput.focus();
  }

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
