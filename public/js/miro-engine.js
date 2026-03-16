/* ─── Miro Page Engine ─── */
let _miroMode = true;
let _miroPanning = false,
  _miroPanStartX = 0,
  _miroPanStartY = 0;
let _miroCardDrag = null,
  _miroCardResize = null;
const _miroSelected = new Set();
let _alignDragging = false;
let _justRubberBanded = false;
let _stickyCreateMode = false;

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
  if (_undoStack.length === 0) return;
  const page = cp();
  if (!page) return;
  const snapshot = _undoStack.pop();
  try {
    _undoInProgress = true;
    page.miroCards = JSON.parse(snapshot);
    sv(); buildMiroCanvas(); buildOutline();
    _undoInProgress = false;
  } catch (e) { _undoInProgress = false; console.error('[UNDO ERROR]', e); }
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
    if (el) el.classList.remove('miro-selected');
  });
  _miroSelected.clear();
  document.getElementById('miro-sel-frame').style.display = 'none';
}
function getSelectedCardsBBox() {
  const page = cp();
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  _miroSelected.forEach((cid) => {
    const c = (page.miroCards || []).find((x) => x.id === cid);
    if (!c) return;
    minX = Math.min(minX, c.x || 0);
    minY = Math.min(minY, c.y || 0);
    maxX = Math.max(maxX, (c.x || 0) + (c.w || 280));
    maxY = Math.max(maxY, (c.y || 0) + (c.h || 240));
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
}

/* ─── Miro Infinite Zoom Grid ─── */
function updateMiroGrid() {
  const page = cp();
  const zoom = (page.zoom || 100) / 100;
  const panX = page.panX || 0;
  const panY = page.panY || 0;
  const canvas = document.getElementById('miro-canvas');

  // Base board-space grid unit
  const BASE = 10;
  const FACTOR = 5;

  // Find the fine grid level: scale BASE until fine * zoom is in [8, 200) px range
  let fine = BASE;
  while (fine * zoom < 8) fine *= FACTOR;
  while (fine * zoom > 200) fine /= FACTOR;

  const medium = fine * FACTOR;
  const coarse = medium * FACTOR;

  // Screen-space pixel sizes
  const fineScreen = fine * zoom;
  const medScreen = medium * zoom;
  const coarseScreen = coarse * zoom;

  // Opacity: fade in based on screen pixel spacing — tuned to match Miro.com
  const fineAlpha = clamp((fineScreen - 6) / 25, 0, 1) * 0.05;
  const medAlpha = clamp((medScreen - 6) / 40, 0, 1) * 0.10;
  const coarseAlpha = clamp((coarseScreen - 6) / 60, 0, 1) * 0.16;

  // Build CSS background layers (horizontal + vertical lines per level)
  const layers = [];
  const sizes = [];
  const positions = [];

  function addLevel(screenSize, alpha) {
    if (alpha < 0.002) return;
    const c = `rgba(0,0,0,${alpha.toFixed(4)})`;
    layers.push(
      `linear-gradient(${c} 1px, transparent 1px)`,
      `linear-gradient(90deg, ${c} 1px, transparent 1px)`,
    );
    const s = `${screenSize}px ${screenSize}px`;
    sizes.push(s, s);
    const ox = panX % screenSize;
    const oy = panY % screenSize;
    const p = `${ox}px ${oy}px`;
    positions.push(p, p);
  }

  addLevel(fineScreen, fineAlpha);
  addLevel(medScreen, medAlpha);
  addLevel(coarseScreen, coarseAlpha);

  if (layers.length) {
    canvas.style.backgroundImage = layers.join(',');
    canvas.style.backgroundSize = sizes.join(',');
    canvas.style.backgroundPosition = positions.join(',');
  }
}

function buildMiroCanvas() {
  const page = cp();
  if (!page.miroCards) page.miroCards = [];
  const board = document.getElementById('miro-board');
  // Remove only card elements, preserve selection overlays
  board.querySelectorAll('.miro-card, .miro-sticky, .miro-image, .miro-text, .miro-shape, .miro-pen, .miro-grid, .miro-mindmap, .miro-widget').forEach((el) => el.remove());
  // Clear selection state
  _miroSelected.clear();
  document.getElementById('miro-sel-frame').style.display = 'none';
  document.getElementById('miro-sel-box').style.display = 'none';
  const zoom = (page.zoom || 100) / 100;
  const px = page.panX || 0,
    py = page.panY || 0;
  board.style.transform = `translate(${px}px,${py}px) scale(${zoom})`;
  document.getElementById('mz-slider').value = page.zoom || 100;
  document.getElementById('mz-pct').textContent = (page.zoom || 100) + '%';

  page.miroCards.forEach((card) => {
    try {
    if (card.type === 'sticky') board.appendChild(buildMiroSticky(card));
    else if (card.type === 'image') board.appendChild(buildMiroImage(card));
    else if (card.type === 'text') board.appendChild(buildMiroText(card));
    else if (card.type === 'shape') board.appendChild(buildMiroShape(card));
    else if (card.type === 'pen') board.appendChild(buildMiroPen(card));
    else if (card.type === 'grid') board.appendChild(buildMiroGridCard(card));
    else if (card.type === 'mindmap') board.appendChild(buildMiroMindMap(card));
    else if (card.type === 'bwidget') board.appendChild(buildMiroBookmarkWidget(card));
    else board.appendChild(buildMiroCard(card));
    } catch (err) { console.error('[RENDER ERROR]', card.type, card.id, err); }
  });
  updateMiroGrid();
  updateMiroScrollbars();
}

function updateMiroScrollbars() {
  const page = cp();
  if (page.pageType !== 'miro') return;
  const canvas = document.getElementById('miro-canvas');
  if (!canvas) return;

  // Remove existing
  canvas.querySelectorAll('.miro-sb').forEach(el => el.remove());

  if (!page.miroCards || page.miroCards.length === 0) return;

  // Find canvas content bounds
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  page.miroCards.forEach(c => {
    minX = Math.min(minX, c.x || 0);
    minY = Math.min(minY, c.y || 0);
    maxX = Math.max(maxX, (c.x || 0) + (c.w || 280));
    maxY = Math.max(maxY, (c.y || 0) + (c.h || 240));
  });

  if (minX === Infinity) return;

  // Add 500px padding around content bounds
  minX -= 500; minY -= 500;
  maxX += 500; maxY += 500;
  const contentW = maxX - minX;
  const contentH = maxY - minY;

  const zoom = (page.zoom || 100) / 100;
  const vw = canvas.clientWidth / zoom;
  const vh = canvas.clientHeight / zoom;

  const panX = (page.panX || 0) / zoom;
  const panY = (page.panY || 0) / zoom;

  // Visible rect in world coordinates
  const visX = -panX;
  const visY = -panY;

  // If content is smaller than viewport, no scrollbars needed
  const needX = contentW > vw;
  const needY = contentH > vh;

  if (needX) {
    const sb = document.createElement('div');
    sb.className = 'miro-sb miro-sb-x';
    const thumb = document.createElement('div');
    thumb.className = 'miro-sb-thumb';

    const thumbW = Math.max(20, (vw / contentW) * canvas.clientWidth);
    const scrollPct = clamp((visX - minX) / (contentW - vw), 0, 1);
    const thumbLeft = scrollPct * (canvas.clientWidth - 8 - thumbW);

    thumb.style.width = thumbW + 'px';
    thumb.style.transform = `translateX(${thumbLeft}px)`;

    thumb.onmousedown = (e) => {
      e.stopPropagation(); e.preventDefault();
      const startX = e.clientX;
      const startPan = page.panX || 0;
      const trackW = canvas.clientWidth - 8 - thumbW;

      const onMove = (me) => {
        const dx = me.clientX - startX;
        const scrollDelta = dx / trackW;
        const worldDelta = scrollDelta * (contentW - vw) * zoom;
        page.panX = startPan - worldDelta;
        sv(); buildMiroCanvas();
      };
      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    };

    sb.appendChild(thumb);
    canvas.appendChild(sb);
  }

  if (needY) {
    const sb = document.createElement('div');
    sb.className = 'miro-sb miro-sb-y';
    const thumb = document.createElement('div');
    thumb.className = 'miro-sb-thumb';

    const thumbH = Math.max(20, (vh / contentH) * canvas.clientHeight);
    const scrollPct = clamp((visY - minY) / (contentH - vh), 0, 1);
    const thumbTop = scrollPct * (canvas.clientHeight - 8 - thumbH);

    thumb.style.height = thumbH + 'px';
    thumb.style.transform = `translateY(${thumbTop}px)`;

    thumb.onmousedown = (e) => {
      e.stopPropagation(); e.preventDefault();
      const startY = e.clientY;
      const startPan = page.panY || 0;
      const trackH = canvas.clientHeight - 8 - thumbH;

      const onMove = (me) => {
        const dy = me.clientY - startY;
        const scrollDelta = dy / trackH;
        const worldDelta = scrollDelta * (contentH - vh) * zoom;
        page.panY = startPan - worldDelta;
        sv(); buildMiroCanvas();
      };
      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    };

    sb.appendChild(thumb);
    canvas.appendChild(sb);
  }
}

function buildMiroCard(card) {
  const el = document.createElement('div');
  el.className = 'miro-card';
  el.dataset.cid = card.id;
  el.style.left = (card.x || 0) + 'px';
  el.style.top = (card.y || 0) + 'px';
  el.style.width = (card.w || 280) + 'px';
  el.style.height = (card.h || 240) + 'px';

  // Delete button (overlaid)
  const del = document.createElement('button');
  del.className = 'mc-del';
  del.textContent = '✕';
  del.onclick = (e) => {
    e.stopPropagation();
    deleteMiroCard(card.id);
  };

  // Open link button
  const openBtn = document.createElement('a');
  openBtn.className = 'mc-open';
  openBtn.href = card.url;
  openBtn.target = '_blank';
  openBtn.rel = 'noopener noreferrer';
  openBtn.textContent = '↗';
  openBtn.onclick = (e) => e.stopPropagation();

  // Thumbnail
  const thumb = document.createElement('div');
  thumb.className = 'mc-thumb';

  if (card.thumbUrl) {
    const thumbImg = document.createElement('img');
    thumbImg.src = card.thumbUrl;
    thumbImg.alt = card.label || '';
    thumbImg.loading = 'lazy';
    thumbImg.onerror = () => {
      thumb.innerHTML = '';
      thumb.appendChild(buildMiroPlaceholder(card, true));
    };
    thumb.appendChild(thumbImg);
  } else {
    thumb.appendChild(buildMiroPlaceholder(card, true));
    queueCardFetch(card);
  }

  // Drag logic — drag from thumbnail area (supports multi-select group drag)
  // We use the new global Alt-Drag duplication helper from thumbnails.js
  if (typeof miroSetupCardDrag === 'function') {
    miroSetupCardDrag(thumb, card, ['.mc-del', '.mc-open', '.mc-resize', '.mc-lock']);
  }

  // Metadata footer
  const meta = document.createElement('div');
  meta.className = 'mc-meta';
  const favicon = document.createElement('img');
  favicon.src = getFav(card.url);
  favicon.onerror = () => {
    favicon.style.display = 'none';
  };
  const info = document.createElement('div');
  info.className = 'mc-meta-info';
  const title = document.createElement('div');
  title.className = 'mc-title';
  title.textContent = card.label || domainOf(card.url);
  const domain = document.createElement('div');
  domain.className = 'mc-domain';
  domain.textContent = domainOf(card.url);
  info.appendChild(title);
  info.appendChild(domain);
  meta.appendChild(favicon);
  meta.appendChild(info);

  // 4-corner resize handles
  attach8WayResize(el, card, 160, 100);

  // Lock UI (using the function from thumbnails.js)
  if (typeof attachLockUI === 'function') {
    attachLockUI(el, card);
  }

  el.appendChild(del);
  el.appendChild(openBtn);
  el.appendChild(thumb);
  el.appendChild(meta);
  return el;
}

function deleteMiroCard(cid) {
  const page = cp();
  if (!page.miroCards) return;
  page.miroCards = page.miroCards.filter((c) => c.id !== cid);
  sv();
  buildMiroCanvas();
  buildOutline();
}

// Canvas Pan + Rubber-band selection
(function () {
  const canvas = document.getElementById('miro-canvas');
  let _rubberBanding = false;
  let _rbStartX = 0,
    _rbStartY = 0;
  let _wheelSvTimer = null;

  canvas.addEventListener('mousedown', (e) => {
    const page = cp();
    const isMiro = page.pageType === 'miro';

    // FIRST: if in a creation/drawing mode, pass through immediately
    // so the click-to-place handler can handle it.
    // This MUST be checked BEFORE the target guard to avoid swallowing clicks.
    if (isMiro && (_stickyCreateMode || _textCreateMode || _gridCreateMode || _mindmapCreateMode || _widgetCreateMode || _penMode || _shapeMode)) {
      return; // Let the click-to-place handler handle it
    }

    // Only handle pan/rubberband if clicking on empty canvas or board
    if (e.target !== canvas && e.target.id !== 'miro-board') return;

    // Right-click or middle-click: always pan
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
      const zoom = (page.zoom || 100) / 100;
      const canvasRect = canvas.getBoundingClientRect();
      _rbStartX = (e.clientX - canvasRect.left - (page.panX || 0)) / zoom;
      _rbStartY = (e.clientY - canvasRect.top - (page.panY || 0)) / zoom;
      const box = document.getElementById('miro-sel-box');
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
    // Rubber-band drag
    if (_rubberBanding) {
      const page = cp();
      const zoom = (page.zoom || 100) / 100;
      const canvasRect = canvas.getBoundingClientRect();
      const curX = (e.clientX - canvasRect.left - (page.panX || 0)) / zoom;
      const curY = (e.clientY - canvasRect.top - (page.panY || 0)) / zoom;
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
        (page2.miroCards || []).forEach((c) => {
          const cx = c.x || 0,
            cy = c.y || 0,
            cw = c.w || 280,
            ch2 = c.h || 240;
          const intersects = !(cx + cw < x || cx > x + w || cy + ch2 < y || cy > y + h);
          if (intersects) addMiroSelect(c.id);
          else if (!e.ctrlKey && !e.metaKey) removeMiroSelect(c.id);
        });
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
    if (_rubberBanding) {
      _rubberBanding = false;
      _justRubberBanded = true;
      setTimeout(() => {
        _justRubberBanded = false;
      }, 50);
      document.getElementById('miro-sel-box').style.display = 'none';
      document.getElementById('miro-canvas').style.cursor = 'grab';
      updateMiroSelFrame();
      return;
    }
    if (_miroPanning) {
      _miroPanning = false;
      document.getElementById('miro-canvas').style.cursor = 'grab';
      sv();
    }
  });

  // ─── Wheel: ALWAYS zoom at cursor position (like Miro.com) ───
  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      const page = cp();

      const rect = canvas.getBoundingClientRect();
      const cursorX = e.clientX - rect.left;
      const cursorY = e.clientY - rect.top;

      const oldZoom = (page.zoom || 100) / 100;

      // Calculate cursor position RELATIVE to the unscaled board origin
      const boardPointX = (cursorX - (page.panX || 0)) / oldZoom;
      const boardPointY = (cursorY - (page.panY || 0)) / oldZoom;

      // Both trackpad pinch and regular scroll → zoom at cursor
      const delta = e.ctrlKey ? (-e.deltaY * 0.8) : (e.deltaY > 0 ? -5 : 5);
      let newZoomNum = Math.max(1, Math.min(400, (page.zoom || 100) + delta));
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
  let _touchPanStartX = 0;
  let _touchPanStartY = 0;

  canvas.addEventListener('touchstart', (e) => {
    if (e.target !== canvas && e.target.id !== 'miro-board') return;
    const page = cp();

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
    } else if (e.touches.length === 1) {
      // Single finger pan
      _touchPanning = true;
      _touchPanStartX = e.touches[0].clientX - (page.panX || 0);
      _touchPanStartY = e.touches[0].clientY - (page.panY || 0);
    }
  }, { passive: false });

  canvas.addEventListener('touchmove', (e) => {
    const page = cp();

    if (e.touches.length === 2) {
      e.preventDefault();
      const t0 = e.touches[0], t1 = e.touches[1];
      const dist = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY);
      const midX = (t0.clientX + t1.clientX) / 2;
      const midY = (t0.clientY + t1.clientY) / 2;

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
    }
  }, { passive: false });

  canvas.addEventListener('touchend', (e) => {
    if (e.touches.length === 0) {
      _touchPanning = false;
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
  const zoom = (page.zoom || 100) / 100;
  document.getElementById('miro-board').style.transform =
    `translate(${page.panX || 0}px,${page.panY || 0}px) scale(${zoom})`;
  document.getElementById('mz-slider').value = page.zoom || 100;
  document.getElementById('mz-pct').textContent = (page.zoom || 100) + '%';
  updateMiroGrid();
}

// Zoom controls
document.getElementById('mz-slider').oninput = function () {
  const page = cp();
  page.zoom = +this.value;
  const zoom = page.zoom / 100;
  document.getElementById('miro-board').style.transform =
    `translate(${page.panX || 0}px,${page.panY || 0}px) scale(${zoom})`;
  document.getElementById('mz-pct').textContent = page.zoom + '%';
  updateMiroGrid();
  sv();
};
document.getElementById('mz-in').onclick = () => {
  const page = cp();
  page.zoom = Math.min(400, (page.zoom || 100) + 10);
  document.getElementById('mz-slider').value = page.zoom;
  document.getElementById('mz-slider').oninput();
};
document.getElementById('mz-out').onclick = () => {
  const page = cp();
  page.zoom = Math.max(1, (page.zoom || 100) - 10);
  document.getElementById('mz-slider').value = page.zoom;
  document.getElementById('mz-slider').oninput();
};
document.getElementById('mz-reset').onclick = () => {
  const page = cp();
  page.zoom = 100;
  document.getElementById('mz-slider').value = 100;
  document.getElementById('mz-slider').oninput();
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
let _miroImgData = null; // { imgbbUrl, naturalW, naturalH }

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

      // Upload to ImgBB
      const btn = document.getElementById('ok-miro-image');
      btn.textContent = 'Uploading…';
      btn.disabled = true;
      const fd = new FormData();
      fd.append('image', base64.split(',')[1]);
      fetch('https://api.imgbb.com/1/upload?key=c2a058a30580ce5e21608e3ec431b9c0', {
        method: 'POST',
        body: fd,
      })
        .then((r) => r.json())
        .then((data) => {
          if (data.success) {
            _miroImgData = { imgbbUrl: data.data.url, naturalW: natW, naturalH: natH };
          } else {
            _miroImgData = { imgbbUrl: base64, naturalW: natW, naturalH: natH }; // fallback
          }
          btn.textContent = 'Add Image';
          btn.disabled = false;
        })
        .catch(() => {
          _miroImgData = { imgbbUrl: base64, naturalW: natW, naturalH: natH }; // fallback
          btn.textContent = 'Add Image';
          btn.disabled = false;
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
let _activeTool = 'select';
let _penMode = false;
let _shapeMode = false;
let _activeShapeType = 'rect';
let _penPoints = [];
let _penDrawing = false;

function setActiveTool(tool) {
  _activeTool = tool;
  document.querySelectorAll('.mtb-btn').forEach(b => b.classList.remove('sel'));
  const btnMap = { select: 'mtb-select', sticky: 'mtb-sticky', text: 'mtb-text', shape: 'mtb-shape', pen: 'mtb-pen', grid: 'mtb-grid', mindmap: 'mtb-mindmap', image: 'mtb-image', card: 'mtb-card', widget: 'mtb-widget' };
  const btn = document.getElementById(btnMap[tool]);
  if (btn) btn.classList.add('sel');
  _penMode = tool === 'pen';
  _shapeMode = tool === 'shape';
  _stickyCreateMode = tool === 'sticky';
  _textCreateMode = tool === 'text';
  _gridCreateMode = tool === 'grid';
  _mindmapCreateMode = tool === 'mindmap';
  _widgetCreateMode = tool === 'widget';

  const hint = document.getElementById('sn-create-hint');
  if (_stickyCreateMode) { hint.textContent = '📝 Click anywhere to place a sticky note • Press Esc to cancel'; hint.style.display = 'block'; }
  else if (_textCreateMode) { hint.textContent = '✏️ Click anywhere to place text • Press Esc to cancel'; hint.style.display = 'block'; }
  else if (_gridCreateMode) { hint.textContent = '📊 Click anywhere to place a table • Press Esc to cancel'; hint.style.display = 'block'; }
  else if (_mindmapCreateMode) { hint.textContent = '🧠 Click anywhere to place a mind map • Press Esc to cancel'; hint.style.display = 'block'; }
  else if (_widgetCreateMode) { hint.textContent = '🗂️ Click anywhere to place a bookmark widget • Press Esc to cancel'; hint.style.display = 'block'; }
  else { hint.style.display = 'none'; }

  document.getElementById('miro-pen-toolbar').classList.toggle('show', _penMode);
  const cursor = (_penMode || _shapeMode || _stickyCreateMode || _textCreateMode || _gridCreateMode || _mindmapCreateMode || _widgetCreateMode) ? 'crosshair' : 'grab';
  document.getElementById('miro-canvas').style.cursor = cursor;
  if (!_shapeMode) document.getElementById('miro-shape-panel').classList.remove('show');
}

let _textCreateMode = false;
let _gridCreateMode = false;
let _mindmapCreateMode = false;
let _widgetCreateMode = false;

document.getElementById('mtb-select').onclick = () => setActiveTool('select');
document.getElementById('mtb-sticky').onclick = () => setActiveTool('sticky');
document.getElementById('mtb-text').onclick = () => setActiveTool('text');
document.getElementById('mtb-widget').onclick = () => setActiveTool('widget');

// Canvas click handler for click-to-place modes
document.getElementById('miro-canvas').addEventListener('mousedown', (e) => {
  if (e.button !== 0 && e.type !== 'touchstart') return;

  // Check if ANY creation mode is active
  const anyCreateMode = _stickyCreateMode || _textCreateMode || _gridCreateMode || _mindmapCreateMode || _widgetCreateMode;
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
    const bx = (e.clientX - rect.left - (page.panX || 0)) / zoom;
    const by = (e.clientY - rect.top - (page.panY || 0)) / zoom;

    if (_stickyCreateMode) {
      const newId = uid();
      page.miroCards.push({ id: newId, type: 'sticky', text: '', color: 'yellow', shape: 'rect', x: bx - 140, y: by - 80, w: 280, h: 160 });
      sv(); buildMiroCanvas(); buildOutline();
      setTimeout(() => {
        const el = document.querySelector(`.miro-sticky[data-cid="${newId}"] .ms-text`);
        if (el) el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      }, 50);
    } else if (_textCreateMode) {
      const newId = uid();
      page.miroCards.push({ id: newId, type: 'text', text: '', x: bx - 60, y: by - 15, w: 120, h: 30, fontSize: 24, fontFamily: 'Inter', color: '#ffffff' });
      sv(); buildMiroCanvas(); buildOutline();
      setTimeout(() => {
        const el = document.querySelector(`.miro-text[data-cid="${newId}"] .mt-text`);
        if (el) el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      }, 50);
    } else if (_gridCreateMode) {
      const rows = 3, cols = 3;
      const cells = [];
      for (let r = 0; r < rows; r++) { const row = []; for (let c = 0; c < cols; c++) row.push(''); cells.push(row); }
      const w = cols * 120, h = rows * 40;
      page.miroCards.push({ id: uid(), type: 'grid', rows, cols, cells, x: bx - w / 2, y: by - h / 2, w, h, headerColor: 'none', borderColor: '#555' });
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
      sv(); buildMiroCanvas(); buildOutline();
    } else if (_widgetCreateMode) {
      page.miroCards.push({ id: uid(), type: 'bwidget', title: 'Bookmarks', emoji: '🗂️', items: [], x: bx - 160, y: by - 200, w: 320, h: 400, color: { r: 255, g: 255, b: 255, a: 1 } });
      sv(); buildMiroCanvas(); buildOutline();
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
document.getElementById('mtb-grid').onclick = () => {
  setActiveTool('grid');
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
let _mouseX = 0, _mouseY = 0;
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

  // Undo: Ctrl+Z / Ctrl+ض
  if (isCmd && (key === 'z' || key === 'ض')) {
    e.preventDefault();
    performUndo();
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
              const zoom = (page.zoom || 100) / 100;
              const px = (_mouseX - (page.panX || 0)) / zoom;
              const py = (_mouseY - (page.panY || 0)) / zoom;
              let minX = Infinity, minY = Infinity;
              cards.forEach(c => { if (c.x < minX) minX = c.x; if (c.y < minY) minY = c.y; });
              clearMiroSelection();
              cards.forEach(c => {
                const newId = uid(); c.id = newId;
                c.x = px + (c.x - minX) - (c.w || 100) / 2;
                c.y = py + (c.y - minY) - (c.h || 100) / 2;
                page.miroCards.push(c); _miroSelected.add(c.id);
              });
              sv(); buildMiroCanvas(); buildOutline(); return;
            }
          } catch (e) { }
        }

        // Literal text fallback
        if (!page.miroCards) page.miroCards = [];
        const canvas = document.getElementById('miro-canvas');
        const zoom = (page.zoom || 100) / 100;
        const cx = _mouseX ? (_mouseX - (page.panX || 0)) / zoom : (canvas.clientWidth / 2 - (page.panX || 0)) / zoom;
        const cy = _mouseY ? (_mouseY - (page.panY || 0)) / zoom : (canvas.clientHeight / 2 - (page.panY || 0)) / zoom;

        let url = text.trim();
        if (/^(https?:\/\/[^\s]+)$/i.test(url) || /^(www\.[^\s]+)$/i.test(url)) {
          if (!url.startsWith('http')) url = 'https://' + url;
          page.miroCards.push({ id: uid(), type: 'card', url, label: domainOf(url), x: cx - 140, y: cy - 120, w: 280, h: 240 });
        } else {
          page.miroCards.push({ id: uid(), type: 'sticky', text: text, bg: '#ffe599', x: cx - 100, y: cy - 100, w: 200, h: 200 });
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
      case 'i': case 'ه': e.preventDefault(); document.getElementById('mtb-image').click(); break;
      case 'b': case 'لا': e.preventDefault(); document.getElementById('mtb-card').click(); break;
      case 'escape':
        setActiveTool('select');
        document.getElementById('miro-shape-panel').classList.remove('show');
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
    }
  }
});

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
        const zoom = (page.zoom || 100) / 100;
        const px = (_mouseX - (page.panX || 0)) / zoom;
        const py = (_mouseY - (page.panY || 0)) / zoom;
        let minX = Infinity, minY = Infinity;
        cards.forEach(c => {
          if (c.x < minX) minX = c.x;
          if (c.y < minY) minY = c.y;
        });
        clearMiroSelection();
        cards.forEach(c => {
          const newId = uid();
          c.id = newId;
          c.x = px + (c.x - minX) - (c.w || 100) / 2;
          c.y = py + (c.y - minY) - (c.h || 100) / 2;
          if (c.t === 'sticky') c.contentEditable = false;
          page.miroCards.push(c);
          _miroSelected.add(c.id);
        });
        sv(); buildMiroCanvas(); buildOutline();
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

  // Check for HTML from Miro or other rich text sources
  const html = (e.clipboardData || window.clipboardData).getData('text/html');
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
          const match = rawMeta.match(/<--\(miro-data-v1\)([\s\S]*?)\(\/miro-data-v1\)-->/);
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

              // Debug: dump raw Miro object data for analysis
              console.log('[PASTE] Miro object:', type, JSON.stringify({
                x: jd.x, y: jd.y, width: jd.width, height: jd.height,
                size: jd.size, scale: jd.scale, _position: jd._position,
                shape: jd.shape, shapeType: jd.shapeType,
                wdX: obj.widgetData.x, wdY: obj.widgetData.y,
                wdW: obj.widgetData.width, wdH: obj.widgetData.height
              }));

              // Helper: extract position and size from Miro JSON data
              // Miro stores coords as CENTER of the widget, and uses multiple formats
              const extractPosition = (jd, opts, widgetData) => {
                // 1. Try _position.offsetPx (internal scaled coords)
                if (jd._position && jd._position.offsetPx) {
                  opts._ox = jd._position.offsetPx.x;
                  opts._oy = jd._position.offsetPx.y;
                } else if (jd._position && typeof jd._position.x === 'number') {
                  opts._ox = jd._position.x;
                  opts._oy = jd._position.y;
                }
                // 2. Try direct x/y on jd (Miro center-origin coordinates)
                if (opts._ox === undefined && typeof jd.x === 'number') {
                  opts._ox = jd.x;
                  opts._oy = jd.y;
                }
                // 3. Fallback to widgetData-level x/y
                if (opts._ox === undefined && widgetData && typeof widgetData.x === 'number') {
                  opts._ox = widgetData.x;
                  opts._oy = widgetData.y;
                }
                // Capture scale factor for coordinate normalization
                if (jd.scale && typeof jd.scale === 'object' && jd.scale.scale) {
                  opts._scale = jd.scale.scale;
                } else if (typeof jd.scale === 'number') {
                  opts._scale = jd.scale;
                }
                // Size: try multiple sources
                if (jd.size) {
                  if (jd.size.width) opts.w = jd.size.width;
                  if (jd.size.height) opts.h = jd.size.height;
                }
                if (!opts.w && typeof jd.width === 'number') opts.w = jd.width;
                if (!opts.h && typeof jd.height === 'number') opts.h = jd.height;
                // Also check widgetData-level width/height
                if (!opts.w && widgetData && typeof widgetData.width === 'number') opts.w = widgetData.width;
                if (!opts.h && widgetData && typeof widgetData.height === 'number') opts.h = widgetData.height;
                // Mark that positions are center-origin (Miro standard)
                opts._centerOrigin = true;

                console.log('[PASTE] extractPosition:', { type: opts.type, _ox: opts._ox, _oy: opts._oy, w: opts.w, h: opts.h, _scale: opts._scale });
              };

              if (type === 'sticker' || type === 'shape' || type === 'text') {
                let textHTML = jd.text || jd.content || '';
                textHTML = textHTML.replace(/^<p[^>]*>/i, '').replace(/<\/p>$/i, '');

                // Fix Garbled Arabic UTF-8 (when decoded via String.fromCharCode)
                try {
                  textHTML = decodeURIComponent(escape(textHTML));
                } catch (err) {
                  // Fallback if already valid or not escapeable
                }

                let styleObj = jd.style;
                if (typeof styleObj === 'string') {
                  try { styleObj = JSON.parse(styleObj); } catch (e) { }
                }

                // --- Handle Miro SHAPE → Startmine shape ---
                if (type === 'shape') {
                  // Map Miro shape types to Startmine shape types
                  const miroShapeType = (jd.shape || jd.shapeType || 'rectangle').toLowerCase();
                  let smShape = 'rect';
                  if (miroShapeType.includes('circle') || miroShapeType.includes('ellipse') || miroShapeType.includes('oval')) smShape = 'ellipse';
                  else if (miroShapeType.includes('triangle') || miroShapeType.includes('wedge_round_rectangle_callout')) smShape = 'triangle';
                  else if (miroShapeType.includes('diamond') || miroShapeType.includes('rhombus')) smShape = 'diamond';
                  else if (miroShapeType.includes('round') || miroShapeType.includes('pill') || miroShapeType.includes('flowchart_decision')) smShape = 'diamond';
                  else smShape = 'rect';

                  // Extract colors from style
                  let fillColor = '#6c8fff'; // Default fill
                  let strokeColor = '#333';  // Default stroke
                  let strokeWidth = 2;
                  if (styleObj) {
                    // Helper to convert Miro's numeric color to 6-char hex
                    const parseMiroColor = (val) => {
                      if (val === undefined || val === null) return null;
                      const numStr = parseInt(val).toString(16);
                      // Miro's decimal sometimes creates >6 char hex (e.g. 15877926 -> f24526)
                      // We pad and take the last 6 chars for standard CSS hex
                      return '#' + numStr.padStart(6, '0').slice(-6);
                    };

                    // Fill: sbc (shape background color) or bc/backgroundColor
                    let fillHex = parseMiroColor(styleObj.sbc) ||
                                  (styleObj.backgroundColor || styleObj.bc || null);
                    if (fillHex) {
                      fillHex = String(fillHex);
                      if (!fillHex.startsWith('#')) fillHex = '#' + fillHex;
                      fillColor = fillHex;
                    }

                    // Stroke: lc (line color) or borderColor
                    let strokeHex = parseMiroColor(styleObj.lc) ||
                                   (styleObj.borderColor || null);
                    if (strokeHex) {
                      strokeHex = String(strokeHex);
                      if (!strokeHex.startsWith('#')) strokeHex = '#' + strokeHex;
                      strokeColor = strokeHex;
                    }

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
                    fontSize: styleObj && styleObj.fs ? parseInt(styleObj.fs) : (styleObj && styleObj.fontSize ? parseInt(styleObj.fontSize) : 14)
                  };
                  extractPosition(jd, cardOpts, obj.widgetData);
                  // Default size for shapes if not extracted
                  if (!cardOpts.w) cardOpts.w = 160;
                  if (!cardOpts.h) cardOpts.h = 120;
                  extracted.push(cardOpts);
                  console.log('[PASTE] Miro shape →', smShape, 'fill:', fillColor, 'size:', cardOpts.w, 'x', cardOpts.h);
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
                      hex = String(hex); // Ensure hex is a string (could be a number)
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

                  extracted.push(cardOpts);
                }
              } else if (type === 'image') {
                // Miro images: construct API URL from resource.id + boardId, then try to download
                const res = jd.resource;
                const boardId = (res && res.boardId) || miroJson.boardId || '';
                const resourceId = res && res.id;
                const imgW = (res && res.width) || (jd.crop && jd.crop.width) || 300;
                const imgH = (res && res.height) || (jd.crop && jd.crop.height) || 200;
                const imgName = (res && res.name) || 'image';

                // Create a placeholder card immediately (will be upgraded to real image if fetch succeeds)
                let cardOpts = {
                  type: 'sticky',
                  text: `⏳ Loading ${imgName}...`,
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
              } else if (type === 'embed') {
                // Miro embed = bookmark/link card with metadata
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
                // Skip connectors/lines - they don't translate to cards
              } else if (type === 'imagewidget') {
                // Alternative image type
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

      // (Removed legacy bulletproof fallback here as it was causing duplicate/merged root DIV stickies if JSON parsing failed slightly, but actually JSON parsing in startmine is reliable now)

      if (extracted.length > 0) {
        if (!page.miroCards) page.miroCards = [];
        const canvas = document.getElementById('miro-canvas');
        const zoom = (page.zoom || 100) / 100;
        const panX = page.panX || 0;
        const panY = page.panY || 0;

        let px = _mouseX ? (_mouseX - panX) / zoom : (canvas.clientWidth / 2 - panX) / zoom;
        let py = _mouseY ? (_mouseY - panY) / zoom : (canvas.clientHeight / 2 - panY) / zoom;

        let curX = px;
        let curY = py;

        clearMiroSelection();

        // ═══════════════════════════════════════════════════════════════
        // POSITION, SIZE & FONT NORMALIZATION
        // Miro clipboard coordinates (offsetPx) are CENTER-ORIGIN and 
        // in a unified internal coordinate space. Visual sizes in this 
        // space are (width * scale). We find a Global Normalization 
        // Factor mapping the median item width to 280px to guarantee 
        // perfect proportional pasted layouts regardless of selection size.
        // ═══════════════════════════════════════════════════════════════

        // Step 1: Calculate visual sizes and convert center to top-left
        extracted.forEach(item => {
          const sc = item._scale || 1;
          item._vw = (item.w || 200) * sc;  // visual width in Miro space
          item._vh = (item.h || 200) * sc;  // visual height in Miro space
          
          // Track visual font size if available
          if (item.fontSize) item._vfs = item.fontSize * sc;

          if (item._ox !== undefined) {
            item._miroLeft = item._ox - (item._vw / 2);
            item._miroTop = item._oy - (item._vh / 2);
          }
        });

        // Step 2: Zero-base the top-left coordinates
        let minX = Infinity, minY = Infinity;
        extracted.forEach(item => {
          if (item._miroLeft !== undefined) {
            minX = Math.min(minX, item._miroLeft);
            minY = Math.min(minY, item._miroTop);
          }
        });

        extracted.forEach(item => {
          if (item._miroLeft !== undefined) {
            item._miroLeft -= minX;
            item._miroTop -= minY;
          }
        });

        // Step 3: Calculate global normalization factor based on median width
        let globalFactor = 33.125; // Good default for exact Miro mapping
        const vWidths = extracted.map(i => i._vw || 0).filter(w => w > 0).sort((a,b) => a - b);
        if (vWidths.length > 0) {
          // Map the median visual width to Startmine's default 280px
          const medianVW = vWidths[Math.floor(vWidths.length / 2)];
          if (medianVW > 10) globalFactor = medianVW / 280;
        }

        console.log('[PASTE] Normalization Factor:', globalFactor, 'Items:', extracted.length);

        // Step 4: Create cards with normalized positions, sizes, and fonts
        extracted.forEach(item => {
          const newId = uid();
          const card = { id: newId, ...item };

          // Normalized dimensions (from Miro internal space to screen pixels)
          const screenW = item._vw / globalFactor;
          const screenH = item._vh / globalFactor;
          const screenFS = item._vfs ? (item._vfs / globalFactor) : 14;

          // Apply type-specific minimums so text isn't microscopic
          card.fontSize = Math.max(screenFS, 8);

          if (item.type === 'sticky') {
            card.w = Math.max(screenW, 60);
            card.h = Math.max(screenH, 40);
          } else if (item.type === 'text') {
            card.w = Math.max(screenW, 60);
            card.h = Math.max(screenH, card.fontSize * 1.5);
            card.fontFamily = 'Inter';
          } else if (item.type === 'image') {
            card.w = Math.max(screenW, 60);
            card.h = Math.max(screenH, 40);
          } else if (item.type === 'shape') {
            card.w = Math.max(screenW, 30);
            card.h = Math.max(screenH, 20);
          } else {
            card.w = Math.max(screenW, 60);
            card.h = Math.max(screenH, 40);
          }

          if (item._miroLeft !== undefined) {
            card.x = px + (item._miroLeft / globalFactor);
            card.y = py + (item._miroTop / globalFactor);
          } else {
            // Fallback: sequential layout for items without valid position data
            card.x = curX - 100;
            card.y = curY - 100;
            curX += (card.w || 280) + 40;
            if (curX > px + 950) {
              curX = px;
              curY += (card.h || 160) + 40;
            }
          }

          // Clean up internal temp properties
          delete card._ox;
          delete card._oy;
          delete card._scale;
          delete card._centerOrigin;
          delete card._vw;
          delete card._vh;

          page.miroCards.push(card);
          _miroSelected.add(newId);
        });
        sv(); buildMiroCanvas(); buildOutline();

        // Upgrade Miro image placeholders: set API URL as imageUrl
        // The <img> tag in buildMiroCanvas will load directly (no CORS for display)
        // as long as user is logged into Miro in the same browser.
        page.miroCards.forEach(card => {
          if (card._miroResourceId && card._miroBoardId) {
            const apiUrl = `https://miro.com/api/v1/boards/${card._miroBoardId}/resources/${card._miroResourceId}/files/original`;
            console.log('[PASTE] Miro image URL:', apiUrl);
            // Upgrade from placeholder sticky to real image card
            card.type = 'image';
            card.imageUrl = apiUrl;
            delete card.text;
            delete card.color;
            const tmpImg = new Image();
            tmpImg.onload = function () {
              // Image loaded successfully — update dimensions and re-render
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
              // Keep it as image type — user will see broken img indicator but can right-click → Open in Miro
              delete card._miroResourceId;
              delete card._miroBoardId;
            };
            tmpImg.src = apiUrl;
          }
        });
        sv(); buildMiroCanvas();
        return;
      }

      // Miro JSON decode failed or produced no extractable items — fallback to HTML div parsing
      // Miro clipboard includes <div> elements with text content after the <span data-meta=...>
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
        const canvas = document.getElementById('miro-canvas');
        const zoom = (page.zoom || 100) / 100;
        const panX = page.panX || 0;
        const panY = page.panY || 0;
        let px = _mouseX ? (_mouseX - panX) / zoom : (canvas.clientWidth / 2 - panX) / zoom;
        let py = _mouseY ? (_mouseY - panY) / zoom : (canvas.clientHeight / 2 - panY) / zoom;
        let curX = px, curY = py;
        clearMiroSelection();
        extracted.forEach(item => {
          const newId = uid();
          const card = { id: newId, ...item, w: item.w || 280, h: item.h || 160 };
          card.x = curX - 100;
          card.y = curY - 100;
          curX += (card.w || 280) + 40;
          if (curX > px + 950) { curX = px; curY += (card.h || 160) + 40; }
          page.miroCards.push(card);
          _miroSelected.add(newId);
        });
        sv(); buildMiroCanvas(); buildOutline();
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
        const canvas = document.getElementById('miro-canvas');
        const zoom = (page.zoom || 100) / 100;
        const px = _mouseX ? (_mouseX - (page.panX || 0)) / zoom : (canvas.clientWidth / 2 - (page.panX || 0)) / zoom;
        const py = _mouseY ? (_mouseY - (page.panY || 0)) / zoom : (canvas.clientHeight / 2 - (page.panY || 0)) / zoom;

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
            card.w = item.w || 280; // Native startmine sticky dimensions
            card.h = item.h || 160;
          } else if (item.type === 'text') {
            card.w = Math.max(100, item.text.length * (card.fontSize / 2));
            card.h = card.fontSize * 1.5;
            card.fontFamily = 'Inter';
          }

          // Apply spatial positioning
          if (item._ox !== undefined && minOX !== Infinity) {
            card.x = px + (item._ox - minOX);
            card.y = py + (item._oy - minOY);
          } else {
            // Fallback sequential formatting
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
        sv(); buildMiroCanvas(); buildOutline();
        console.log('[PASTE DEBUG] Generic HTML parsed cards rendered, returning!');
        return;
      }
    }
    // Explicitly return here to completely prevent Miro items from collapsing into the Step 4 Generic Text handler if something went wrong!
    if (isMiroData) {
      window._lastMiroPasteTime = Date.now();
      console.log('[PASTE DEBUG] isMiroData was true but extracted was empty! Returning early.');
      return;
    }
  }

  console.log('[PASTE DEBUG] Reached Image/Text checking block');
  let imagePasted = false;

  // 3. Check for images natively copied (Lower Priority than Widgets)
  if (e.clipboardData && e.clipboardData.items) {
    for (let i = 0; i < e.clipboardData.items.length; i++) {
      const item = e.clipboardData.items[i];
      if (item.type.indexOf('image') !== -1) {
        const blob = item.getAsFile();
        if (!blob) continue;
        imagePasted = true;

        const reader = new FileReader();
        reader.onload = function (event) {
          const dataUrl = event.target.result;
          const img = new Image();
          img.onload = function () {
            const canvas = document.getElementById('miro-canvas');
            const zoom = (page.zoom || 100) / 100;
            const cx = _mouseX ? (_mouseX - (page.panX || 0)) / zoom : (canvas.clientWidth / 2 - (page.panX || 0)) / zoom;
            const cy = _mouseY ? (_mouseY - (page.panY || 0)) / zoom : (canvas.clientHeight / 2 - (page.panY || 0)) / zoom;

            if (!page.miroCards) page.miroCards = [];
            let w = 300;
            let h = Math.round(300 * (img.height / img.width));
            if (img.width > 800) { w = 800; h = Math.round(800 * (img.height / img.width)); }

            const card = { id: uid(), type: 'image', w, h, x: cx - w / 2, y: cy - h / 2, imageUrl: dataUrl };
            page.miroCards.push(card);
            sv(); buildMiroCanvas(); buildOutline();
          };
          img.src = dataUrl;
        };
        reader.readAsDataURL(blob);
        break; // Process only the first image
      }
    }
  }

  // If an image was handled, don't try to process text fallback.
  if (imagePasted) { console.log('[PASTE DEBUG] Image handled, returning.'); return; }

  // If Miro data was handled, don't create a fallback text sticky
  // (We check this just in case the early return above didn't catch something complex)
  // Note: we can't easily check `miroHandled` here if it's block-scoped to `if (html)`, 
  // so let's check `isMiroData` instead... wait, `isMiroData` is scoped inside `if (html)`.
  // Let's rely on checking if `text` is populated and if we just did a Miro paste. 
  // Actually, the `if (isMiroData) return;` inside the HTML block *should* stop execution before we even get here.
  // WHY did it reach here? 
  // Ah! `const isMiroData = miroSpans.length > 0;` is only defined INSIDE `if (html)`. 
  // If we `return` inside `if (html)`, we NEVER reach `if (!text) return;`.
  // Therefore, the extra sticky MUST be coming from somewhere else, OR `isMiroData` was false?
  // Let's add a global-ish flag to ensure we aren't double pasting.
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
        const canvas = document.getElementById('miro-canvas');
        const zoom = (page.zoom || 100) / 100;
        const cx = _mouseX ? (_mouseX - (page.panX || 0)) / zoom : (canvas.clientWidth / 2 - (page.panX || 0)) / zoom;
        const cy = _mouseY ? (_mouseY - (page.panY || 0)) / zoom : (canvas.clientHeight / 2 - (page.panY || 0)) / zoom;

        let minX = Infinity, minY = Infinity;
        cards.forEach(c => { if (c.x < minX) minX = c.x; if (c.y < minY) minY = c.y; });
        clearMiroSelection();
        cards.forEach(c => {
          const newId = uid(); c.id = newId;
          c.x = cx + (c.x - minX) - (c.w || 100) / 2;
          c.y = cy + (c.y - minY) - (c.h || 100) / 2;
          page.miroCards.push(c); _miroSelected.add(c.id);
        });
        sv(); buildMiroCanvas(); buildOutline();
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
  const canvas = document.getElementById('miro-canvas');
  const zoom = (page.zoom || 100) / 100;
  const cx = _mouseX ? (_mouseX - (page.panX || 0)) / zoom : (canvas.clientWidth / 2 - (page.panX || 0)) / zoom;
  const cy = _mouseY ? (_mouseY - (page.panY || 0)) / zoom : (canvas.clientHeight / 2 - (page.panY || 0)) / zoom;

  let url = text.trim();
  if (/^(https?:\/\/[^\s]+)$/i.test(url) || /^(www\.[^\s]+)$/i.test(url)) {
    if (!url.startsWith('http')) url = 'https://' + url;
    const label = domainOf(url);
    // Explicitly set type to 'card' (bookmark)
    const card = { id: uid(), type: 'card', url, label, x: cx - 140, y: cy - 120, w: 280, h: 240 };
    page.miroCards.push(card);
    sv(); buildMiroCanvas(); buildOutline();
    if (typeof queueCardFetch !== 'undefined') queueCardFetch(card.id, url);
    console.log('[PASTE DEBUG] Created URL Bookmark card!');
  } else {
    // Normal text -> Sticky
    const w = 200, h = 200;
    const card = { id: uid(), type: 'sticky', text: text, bg: '#ffe599', x: cx - w / 2, y: cy - h / 2, w, h };
    page.miroCards.push(card);
    sv(); buildMiroCanvas(); buildOutline();
    console.log('[PASTE DEBUG] Created Plain Text Sticky card!');
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
