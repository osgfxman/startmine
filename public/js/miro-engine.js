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

/* ─── Edge Auto-Pan: pan canvas when mouse is near screen edge during drag ─── */
let _edgePanRAF = null;
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
  board.querySelectorAll('.miro-card, .miro-sticky, .miro-image, .miro-text, .miro-shape, .miro-pen, .miro-grid, .miro-mindmap, .miro-trello, .miro-widget, .miro-array, .miro-calendar').forEach((el) => el.remove());
  // Clear selection state
  _miroSelected.clear();
  document.getElementById('miro-sel-frame').style.display = 'none';
  document.getElementById('miro-sel-box').style.display = 'none';
  const zoom = (page.zoom || 100) / 100;
  const px = page.panX || 0,
    py = page.panY || 0;
  board.style.transform = `translate(${px}px,${py}px) scale(${zoom})`;
  // Set inverse zoom so floating UI (toolbars, delete buttons) stays constant screen size
  board.style.setProperty('--inv-zoom', Math.min(3, Math.max(0.25, 1 / zoom)));
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
    else if (card.type === 'trello') board.appendChild(buildMiroTrello(card));
    else if (card.type === 'bwidget') board.appendChild(buildMiroBookmarkWidget(card));
    else if (card.type === 'array') board.appendChild(buildMiroArray(card));
    else if (card.type === 'calendar') board.appendChild(buildMiroCalendar(card));
    else if (card.type === 'embed') board.appendChild(buildMiroEmbed(card));
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
    if (e.target !== canvas && e.target.id !== 'miro-board') {
      const cardEl = e.target.closest('[data-cid]');
      if (cardEl) {
        const cid = cardEl.dataset.cid;
        const card = (page.miroCards || []).find(c => c.id === cid);
        if (!card || !card.locked) return; // Non-locked card: let card's own handler deal with it
        // Locked card: fall through to rubber-band logic below
      } else {
        return; // Not a card element, not canvas
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
          if (c.locked) return; // Locked elements are invisible to selection
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
      e.preventDefault();
      const page = cp();

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
  const board = document.getElementById('miro-board');
  board.style.transform =
    `translate(${page.panX || 0}px,${page.panY || 0}px) scale(${zoom})`;
  // Keep floating UI at constant screen size
  board.style.setProperty('--inv-zoom', Math.min(3, Math.max(0.25, 1 / zoom)));
  document.getElementById('mz-slider').value = page.zoom || 100;
  document.getElementById('mz-pct').textContent = (page.zoom || 100) + '%';
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
  // Handle dropped image files from desktop/explorer
  if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
    const file = e.dataTransfer.files[0];
    if (file.type.startsWith('image/')) {
      e.preventDefault();
      const reader = new FileReader();
      reader.onload = function(event) {
        const dataUrl = event.target.result;
        const img = new Image();
        img.onload = function() {
          const page = cp();
          if (!page.miroCards) page.miroCards = [];
          const zoom = (page.zoom || 100) / 100;
          const rect = document.getElementById('miro-canvas').getBoundingClientRect();
          const x = (e.clientX - rect.left - (page.panX || 0)) / zoom;
          const y = (e.clientY - rect.top - (page.panY || 0)) / zoom;
          let w = img.width, h = img.height;
          if (w > 800) { h = Math.round(800 * (h / w)); w = 800; }
          const card = { id: uid(), type: 'image', w, h, x: x - w / 2, y: y - h / 2, imageUrl: dataUrl };
          page.miroCards.push(card);
          sv(); buildMiroCanvas(); buildOutline();
        };
        img.src = dataUrl;
      };
      reader.readAsDataURL(file);
      return;
    }
  }

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
  const btnMap = { select: 'mtb-select', sticky: 'mtb-sticky', text: 'mtb-text', shape: 'mtb-shape', pen: 'mtb-pen', grid: 'mtb-grid', mindmap: 'mtb-mindmap', image: 'mtb-image', card: 'mtb-card', widget: 'mtb-widget', trello: 'mtb-trello', embed: 'mtb-embed' };
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

  const hint = document.getElementById('sn-create-hint');
  if (_stickyCreateMode) { hint.textContent = '📝 Click anywhere to place a sticky note • Press Esc to cancel'; hint.style.display = 'block'; }
  else if (_textCreateMode) { hint.textContent = '✏️ Click anywhere to place text • Press Esc to cancel'; hint.style.display = 'block'; }
  else if (_gridCreateMode) { hint.textContent = '📊 Click anywhere to place a table • Press Esc to cancel'; hint.style.display = 'block'; }
  else if (_mindmapCreateMode) { hint.textContent = '🧠 Click anywhere to place a mind map • Press Esc to cancel'; hint.style.display = 'block'; }
  else if (_widgetCreateMode) { hint.textContent = '🗂️ Click anywhere to place a bookmark widget • Press Esc to cancel'; hint.style.display = 'block'; }
  else if (_trelloCreateMode) { hint.textContent = '📋 Click anywhere to place Trello lists • Press Esc to cancel'; hint.style.display = 'block'; }
  else if (_embedCreateMode) { hint.textContent = '🌐 Click anywhere to place an embed web view • Press Esc to cancel'; hint.style.display = 'block'; }
  else { hint.style.display = 'none'; }

  document.getElementById('miro-pen-toolbar').classList.toggle('show', _penMode);
  const cursor = (_penMode || _shapeMode || _stickyCreateMode || _textCreateMode || _gridCreateMode || _mindmapCreateMode || _widgetCreateMode || _trelloCreateMode || _embedCreateMode) ? 'crosshair' : 'grab';
  document.getElementById('miro-canvas').style.cursor = cursor;
  if (!_shapeMode) document.getElementById('miro-shape-panel').classList.remove('show');
}

let _textCreateMode = false;
let _gridCreateMode = false;
let _mindmapCreateMode = false;
let _widgetCreateMode = false;
let _trelloCreateMode = false;
let _embedCreateMode = false;

document.getElementById('mtb-select').onclick = () => setActiveTool('select');
document.getElementById('mtb-sticky').onclick = () => setActiveTool('sticky');
document.getElementById('mtb-text').onclick = () => setActiveTool('text');
document.getElementById('mtb-widget').onclick = () => setActiveTool('widget');
document.getElementById('mtb-trello').onclick = () => setActiveTool('trello');

// Canvas click handler for click-to-place modes
document.getElementById('miro-canvas').addEventListener('mousedown', (e) => {
  if (e.button !== 0 && e.type !== 'touchstart') return;

  // Check if ANY creation mode is active
  const anyCreateMode = _stickyCreateMode || _textCreateMode || _gridCreateMode || _mindmapCreateMode || _widgetCreateMode || _trelloCreateMode || _embedCreateMode;
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
      sv(); buildMiroCanvas(); buildOutline();
    } else if (_embedCreateMode) {
      const url = prompt('🌐 Enter published URL (Google Sheets chart, web page, etc.):');
      if (url && url.trim()) {
        page.miroCards.push({ id: uid(), type: 'embed', embedUrl: url.trim(), cropRect: null, refreshMin: 15, x: bx - 300, y: by - 200, w: 600, h: 400 });
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
      case 'k': case 'ن': e.preventDefault(); document.getElementById('mtb-trello').click(); break;
      case 'i': case 'ه': e.preventDefault(); document.getElementById('mtb-image').click(); break;
      case 'b': case 'لا': e.preventDefault(); document.getElementById('mtb-card').click(); break;
      case 'e': case 'ث': e.preventDefault(); document.getElementById('mtb-embed').click(); break;
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
      case 'f': case 'ب':
        e.preventDefault();
        zoomToFitSelection();
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
              // Miro stores coords as CENTER of the widget, and uses multiple formats
              // KEY INSIGHT: jd.size.width/height = BASE dimension (before scaling)
              //              jd.width/height = VISUAL dimension (may already be scaled)
              //              scale = per-item multiplier
              // Visual size = base * scale  OR  jd.width/height if available
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

                // ── Scale factor — try EVERY possible location ──
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

                // ── Base dimensions (from jd.size) ──
                let baseW, baseH;
                if (jd.size) {
                  if (typeof jd.size.width === 'number') baseW = jd.size.width;
                  else if (typeof jd.size.w === 'number') baseW = jd.size.w;
                  if (typeof jd.size.height === 'number') baseH = jd.size.height;
                  else if (typeof jd.size.h === 'number') baseH = jd.size.h;
                }

                // ── Visual dimensions (from jd.width/height — may already be scaled) ──
                let visW, visH;
                if (typeof jd.width === 'number') visW = jd.width;
                if (typeof jd.height === 'number') visH = jd.height;
                // Also check widgetData-level
                if (visW === undefined && widgetData && typeof widgetData.width === 'number') visW = widgetData.width;
                if (visH === undefined && widgetData && typeof widgetData.height === 'number') visH = widgetData.height;

                // ── Derive scale from ratio if not explicitly found ──
                if (scale === undefined && baseW && visW && baseW > 0) {
                  scale = visW / baseW;
                }

                // ── Compute final visual dimensions ──
                if (baseW && scale) {
                  // We have both base and scale → compute visual
                  opts.w = baseW * scale;
                  opts.h = (baseH || baseW) * scale;
                } else if (visW) {
                  // Only visual dimensions available
                  opts.w = visW;
                  opts.h = visH || visW;
                } else if (baseW) {
                  // Only base dimensions, no scale
                  opts.w = baseW;
                  opts.h = baseH || baseW;
                }
                // If width comes from jd.width AND it differs from base, it's already visual
                // But if they're the same and scale exists, multiply
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
                  else if (miroShapeType.includes('triangle') || miroShapeType.includes('wedge')) smShape = 'triangle';
                  else if (miroShapeType.includes('diamond') || miroShapeType.includes('rhombus') || miroShapeType.includes('flowchart_decision')) smShape = 'diamond';
                  else if (miroShapeType.includes('star')) smShape = 'star';
                  else if (miroShapeType.includes('hexagon')) smShape = 'hexagon';
                  else if (miroShapeType.includes('pentagon')) smShape = 'pentagon';
                  else if (miroShapeType.includes('cross') || miroShapeType.includes('plus')) smShape = 'cross';
                  else if (miroShapeType.includes('arrow') && !miroShapeType.includes('line')) smShape = 'arrow-shape';
                  else if (miroShapeType.includes('round') || miroShapeType.includes('pill')) smShape = 'rounded-rect';
                  else smShape = 'rect';

                  // Extract colors from style - improved color parser
                  let fillColor = 'none';
                  let strokeColor = '#333';
                  let strokeWidth = 2;
                  let textColor = '#333333';

                  // Helper: robustly parse Miro color values
                  const parseMiroColor = (val) => {
                    if (val === undefined || val === null || val === '' || val === 'transparent') return null;
                    const s = String(val).trim();
                    // Already a hex color
                    if (s.startsWith('#')) return s.length >= 7 ? s : '#' + s.slice(1).padStart(6, '0');
                    // rgb/rgba string
                    if (s.startsWith('rgb')) {
                      const m = s.match(/\d+/g);
                      if (m && m.length >= 3) {
                        return '#' + [m[0], m[1], m[2]].map(n => parseInt(n).toString(16).padStart(2, '0')).join('');
                      }
                      return null;
                    }
                    // Numeric (Miro's decimal color encoding)
                    const num = parseInt(s);
                    if (isNaN(num) || num === 0) return null; // 0 = transparent in Miro
                    const hex = num.toString(16).padStart(6, '0').slice(-6);
                    return '#' + hex;
                  };

                  if (styleObj) {
                    // Fill: sbc (shape background color), bc, backgroundColor, fillColor
                    let fillHex = parseMiroColor(styleObj.sbc) ||
                                  parseMiroColor(styleObj.bc) ||
                                  parseMiroColor(styleObj.backgroundColor) ||
                                  parseMiroColor(styleObj.fillColor) ||
                                  parseMiroColor(jd.fillColor) ||
                                  parseMiroColor(jd.backgroundColor);
                    if (fillHex) fillColor = fillHex;

                    // Stroke: lc (line color), borderColor
                    let strokeHex = parseMiroColor(styleObj.lc) ||
                                   parseMiroColor(styleObj.borderColor) ||
                                   parseMiroColor(jd.borderColor);
                    if (strokeHex) strokeColor = strokeHex;

                    // Text color: fc (font color)
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
                  // Default size for shapes if not extracted
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

                  // Fix Miro "square" sticker aspect ratio:
                  // Miro stores square stickies as 199×228 internally but RENDERS them as 1:1 squares
                  if (type === 'sticker' && cardOpts._baseW && cardOpts._baseW <= 200) {
                    cardOpts.h = cardOpts.w; // Force 1:1 aspect ratio
                  }

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
        // POSITION, SIZE & FONT — FAITHFUL 1:1 MIRO REPRODUCTION
        // Miro clipboard coordinates (offsetPx) are CENTER-ORIGIN in a
        // unified coordinate space. Visual sizes = w * scale.
        // We use them AS-IS with NO rescaling, so pasted elements
        // match their Miro.com appearance exactly.
        // ═══════════════════════════════════════════════════════════════

        // Step 1: Use visual sizes from extractPosition (already scaled)
        // extractPosition now computes w/h as visual dimensions (base * scale)
        // so we just apply defaults where missing, NO additional scale multiply
        extracted.forEach(item => {
          // Apply defaults if extractPosition didn't find any size
          if (!item.w && !item.h) {
            if (item.type === 'sticky') { item.w = 350; item.h = 228; }
            else if (item.type === 'text') { item.w = 260; item.h = 100; }
            else { item.w = 200; item.h = 200; }
          }

          item._vw = item.w || 200;   // visual width (already scaled)
          item._vh = item.h || 200;   // visual height (already scaled)
          // Font size was set during extraction — scale it if _scale > 1
          if (item.fontSize && item._scale && item._scale !== 1) {
            item._vfs = item.fontSize * item._scale;
          } else {
            item._vfs = item.fontSize;
          }
        });

        // Step 2: Zero-base the CENTER coordinates (keep as centers!)
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

        // Step 3: Determine scale factor using MEDIAN visual width → 280px
        // Now that visual dims correctly include per-item scale, median-based
        // normalization produces accurate relative sizes AND readable absolute sizes.
        const vWidths = extracted.map(i => i._vw || 200).sort((a, b) => a - b);
        const medianVW = vWidths[Math.floor(vWidths.length / 2)];
        let globalFactor = medianVW / 280;
        if (globalFactor < 0.5) globalFactor = 0.5;  // Don't enlarge too much
        // Safety: ensure layout fits in reasonable bounds
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

        // Step 4: Create cards — position from CENTER coords, size from visual dims
        extracted.forEach(item => {
          const newId = uid();
          const card = { id: newId, ...item };

          // Screen dimensions from visual sizes
          const screenW = Math.max(item._vw / globalFactor, 30);
          const screenH = Math.max(item._vh / globalFactor, 20);
          const screenFS = item._vfs ? (item._vfs / globalFactor) : 14;

          card.w = screenW;
          card.h = screenH;
          card.fontSize = Math.max(screenFS, 8);

          if (item._ox !== undefined) {
            // Convert normalized center → top-left using SCREEN-PIXEL sizes
            const screenCX = px + (item._ox / globalFactor);
            const screenCY = py + (item._oy / globalFactor);
            card.x = screenCX - screenW / 2;
            card.y = screenCY - screenH / 2;
          } else {
            // Fallback: sequential layout
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
          delete card._vfs;
          delete card._baseW;
          delete card._baseH;
          delete card._miroLeft;
          delete card._miroTop;

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
            card.w = Math.min(Math.max(100, item.text.length * (card.fontSize / 2)), 400);
            card.h = Math.max(card.fontSize * 1.5, 40);
            card.font = 'Inter';
            card.fontColor = card.fontColor || '#333333';
            card.align = 'right';
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

/* ─── Z-Order System (Context Menu) ─── */
let _ctxTargetCid = null;

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
document.getElementById('miro-canvas').addEventListener('contextmenu', (e) => {
  // Find the closest miro card element
  const cardEl = e.target.closest('.miro-card, .miro-sticky, .miro-image, .miro-text, .miro-shape, .miro-pen, .miro-grid, .miro-mindmap, .miro-widget, .miro-array, .miro-calendar');
  if (!cardEl) {
    hideCtxMenu();
    return; // Allow default context menu on empty canvas
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

  showCtxMenu(e.clientX, e.clientY);
});

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
let _calendarCreateMode = false;
let _cachedCalendarList = null;
let _cachedCalendarListTs = 0;
const CALENDAR_LIST_CACHE_MS = 5 * 60 * 1000; // 5 min cache

document.getElementById('mtb-calendar').onclick = () => {
  if (!_googleAccessToken) {
    auth.signInWithPopup(provider).then(result => {
      if (result.credential) {
        cacheGoogleToken(result.credential.accessToken);
      }
      placeCalendarWidget();
    }).catch(e => showToast('❌ Auth failed: ' + e.message));
    return;
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

// ─── Embed Web View Widget ───
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
    _googleAccessToken = null;
    try { localStorage.removeItem('sm_google_token'); } catch (e) {}
    const e = new Error('NEEDS_AUTH'); e.needsAuth = true; throw e;
  }
  if (!res.ok) throw new Error('Calendar list failed: ' + res.status);
  const data = await res.json();
  _cachedCalendarList = (data.items || []).filter(c => c.selected !== false);
  _cachedCalendarListTs = Date.now();
  return _cachedCalendarList;
}

// ─── Fetch Events ───
async function fetchCalendarEvents(timeMin, timeMax) {
  if (typeof ensureGoogleToken === 'function') await ensureGoogleToken();
  if (!_googleAccessToken) { const e = new Error('NEEDS_AUTH'); e.needsAuth = true; throw e; }

  const calendars = await getCalendarList();
  if (!calendars.length) return [];

  const allEvents = [];
  const tMin = timeMin.toISOString();
  const tMax = timeMax.toISOString();

  await Promise.all(calendars.map(async cal => {
    try {
      const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(cal.id)}/events?timeMin=${tMin}&timeMax=${tMax}&singleEvents=true&orderBy=startTime&maxResults=200`;
      const res = await fetch(url, { headers: { 'Authorization': 'Bearer ' + _googleAccessToken } });
      if (res.status === 401) return; // will be caught by getCalendarList on next call
      if (!res.ok) return;
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
    } catch (e) { /* skip individual calendar */ }
  }));

  return allEvents;
}

// ─── Create Event ───
async function createCalendarEvent(calendarId, summary, startDateTime, endDateTime, description) {
  if (!_googleAccessToken) throw new Error('Not authenticated');
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
  const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`, {
    method: 'PATCH',
    headers: { 'Authorization': 'Bearer ' + _googleAccessToken, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) { const err = await res.text(); throw new Error('Update failed: ' + err); }
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
}

// ─── Event Form (in-widget popup) ───
function showCalendarEventForm(container, el, card, opts) {
  // opts: { mode:'create'|'edit', startTime, endTime, calendarId, eventId, summary, description, onDone }
  const oldForm = el.querySelector('.cal-event-form');
  if (oldForm) oldForm.remove();

  const form = document.createElement('div');
  form.className = 'cal-event-form';

  // Title (optional)
  const titleLabel = document.createElement('label');
  titleLabel.textContent = 'Event Title (optional)';
  titleLabel.style.cssText = 'font-size:.65rem;color:#aaa;margin-bottom:2px;';
  const titleInp = document.createElement('input');
  titleInp.type = 'text';
  titleInp.className = 'cal-form-input';
  titleInp.placeholder = 'Timelog / Event name...';
  titleInp.value = opts.summary || '';

  // Calendar selector — buttons instead of dropdown
  const calLabel = document.createElement('label');
  calLabel.textContent = 'Calendar';
  calLabel.style.cssText = 'font-size:.65rem;color:#aaa;margin-bottom:2px;margin-top:6px;';
  const calBtnRow = document.createElement('div');
  calBtnRow.className = 'cal-selector-row';
  calBtnRow.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;margin-top:2px;';
  let _selectedCalId = opts.calendarId || '';

  getCalendarList().then(calendars => {
    calendars.forEach((cal, i) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'cal-selector-btn';
      const bgColor = cal.backgroundColor || '#4285f4';
      btn.style.cssText = `background:${bgColor}22;border:2px solid ${bgColor};border-radius:6px;color:#ddd;font-size:.58rem;padding:3px 8px;cursor:pointer;font-family:var(--font);transition:all .15s;white-space:nowrap;`;
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
          b.style.background = bc + '22';
          b.style.color = '#ddd';
          b.style.fontWeight = '400';
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
  startWrap.innerHTML = '<label style="font-size:.65rem;color:#aaa;">Start</label>';
  const startPicker = _buildAnalogTimePicker(startTime);
  startWrap.appendChild(startPicker.el);
  timeRow.appendChild(startWrap);

  // End time picker
  const endWrap = document.createElement('div');
  endWrap.style.cssText = 'flex:1;';
  endWrap.innerHTML = '<label style="font-size:.65rem;color:#aaa;">End</label>';
  const endPicker = _buildAnalogTimePicker(endTime);
  endWrap.appendChild(endPicker.el);
  timeRow.appendChild(endWrap);

  // Date display
  const dateRow = document.createElement('div');
  dateRow.style.cssText = 'display:flex;gap:6px;margin-top:4px;';
  const startDateInp = document.createElement('input');
  startDateInp.type = 'date';
  startDateInp.className = 'cal-form-input';
  startDateInp.style.cssText = 'flex:1;color-scheme:dark;font-size:.65rem;';
  startDateInp.value = _toDateStr(startTime);
  const endDateInp = document.createElement('input');
  endDateInp.type = 'date';
  endDateInp.className = 'cal-form-input';
  endDateInp.style.cssText = 'flex:1;color-scheme:dark;font-size:.65rem;';
  endDateInp.value = _toDateStr(endTime);
  dateRow.appendChild(startDateInp);
  dateRow.appendChild(endDateInp);

  // Description (optional)
  const descLabel = document.createElement('label');
  descLabel.textContent = 'Description (optional)';
  descLabel.style.cssText = 'font-size:.65rem;color:#aaa;margin-top:6px;margin-bottom:2px;';
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
        renderCalendarContent(el, card);
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
      if (opts.mode === 'edit') {
        await updateCalendarEvent(opts.calendarId, opts.eventId, {
          summary: title,
          description: descInp.value,
          start: startD, end: endD
        });
        showToast('✅ Event updated');
      } else {
        await createCalendarEvent(calId, title, startD, endD, descInp.value);
        showToast('✅ Event created');
      }
      form.remove();
      renderCalendarContent(el, card);
    } catch (err) {
      showToast('❌ ' + err.message);
      saveBtn.disabled = false;
      saveBtn.textContent = opts.mode === 'edit' ? '💾 Update' : '✅ Create';
    }
  };

  btnRow.appendChild(cancelBtn);
  btnRow.appendChild(saveBtn);

  form.appendChild(titleLabel);
  form.appendChild(titleInp);
  form.appendChild(calLabel);
  form.appendChild(calBtnRow);
  form.appendChild(timeRow);
  form.appendChild(dateRow);
  form.appendChild(descLabel);
  form.appendChild(descInp);
  form.appendChild(btnRow);

  // Stop propagation only for left-click interactions (not middle button = pan, not wheel = zoom)
  form.addEventListener('mousedown', e => { if (e.button === 0) e.stopPropagation(); });
  form.addEventListener('click', e => e.stopPropagation());

  // ESC closes the form
  const _onEscForm = (e) => { if (e.key === 'Escape') { form.remove(); document.removeEventListener('keydown', _onEscForm); } };
  document.addEventListener('keydown', _onEscForm);

  el.appendChild(form);
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
  const sep = document.createElement('span');
  sep.textContent = ':';
  sep.style.cssText = 'color:#aaa;font-size:.8rem;font-weight:700;';
  const mDisp = document.createElement('span');
  mDisp.className = 'cal-time-digit';
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
  const theme = card.calTheme || 'dark';
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
      evEl.title = `${ev.summary}\n${ev.calendarName}\n${ev._start.toLocaleTimeString([], {hour:'numeric',minute:'2-digit',hour12:true})} - ${ev._end.toLocaleTimeString([], {hour:'numeric',minute:'2-digit',hour12:true})}`;
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
