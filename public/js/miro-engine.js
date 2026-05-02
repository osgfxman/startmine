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
  // Clear pinned layer (elements from previous page)
  const _pl = document.getElementById('miro-pinned-layer');
  if (_pl) _pl.innerHTML = '';
  // Remove only card elements, preserve selection overlays
  board.querySelectorAll('.miro-card, .miro-sticky, .miro-image, .miro-text, .miro-shape, .miro-pen, .miro-grid, .miro-mindmap, .miro-trello, .miro-widget, .miro-array, .miro-calendar, .miro-gantt, .miro-embed, .miro-overlay-widget').forEach((el) => el.remove());
  // Clean up grid toolbars that live in document.body
  document.querySelectorAll('.mg-toolbar[data-grid-id]').forEach(t => t.remove());
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
    else if (card.type === 'calendar' || card.type === 'gantt') board.appendChild(buildMiroGantt(card));
    else if (card.type === 'embed') board.appendChild(buildMiroEmbed(card));
    else if (card.type === 'overlay-page') board.appendChild(buildMiroOverlayWidget(card));
    else board.appendChild(buildMiroCard(card));
    } catch (err) { console.error('[RENDER ERROR]', card.type, card.id, err); }
  });
  updateMiroGrid();
  updateMiroScrollbars();
  // Auto-fix any base64 images on this page
  if (typeof _fixBase64ImagesOnPage === 'function') setTimeout(_fixBase64ImagesOnPage, 1000);
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

// ─── Video URL Detection ───
function detectVideoUrl(url) {
  if (!url) return null;
  // YouTube (watch, shorts, youtu.be, embed)
  let m = url.match(/(?:youtube\.com\/(?:watch\?.*v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{11})/);
  if (m) return { platform: 'YouTube', videoId: m[1], embedUrl: `https://www.youtube.com/embed/${m[1]}?autoplay=1&rel=0` };
  // TikTok (video IDs are numeric)
  m = url.match(/tiktok\.com\/@[^/]+\/video\/(\d+)/);
  if (m) return { platform: 'TikTok', videoId: m[1], embedUrl: `https://www.tiktok.com/embed/v2/${m[1]}` };
  // TikTok short URLs (vm.tiktok.com)
  if (/vm\.tiktok\.com|vt\.tiktok\.com/.test(url)) return { platform: 'TikTok', videoId: '', embedUrl: '' , shortUrl: url };
  // Facebook video
  m = url.match(/facebook\.com.*\/(?:videos?|watch|reel)[\/?]/);
  if (m) return { platform: 'Facebook', videoId: '', embedUrl: `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(url)}&show_text=false&autoplay=true&width=560` };
  // Facebook reel
  if (/facebook\.com\/reel\//.test(url)) return { platform: 'Facebook', videoId: '', embedUrl: `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(url)}&show_text=false&autoplay=true&width=560` };
  return null;
}

// Resolve TikTok short URLs to full URLs
async function resolveTikTokShortUrl(shortUrl) {
  try {
    // Use a HEAD request to follow redirects
    const resp = await fetch(`https://jsonlink.io/api/extract?url=${encodeURIComponent(shortUrl)}`, { signal: AbortSignal.timeout(5000) });
    if (resp.ok) {
      const data = await resp.json();
      if (data.url) {
        const m = data.url.match(/tiktok\.com\/@[^/]+\/video\/(\d+)/);
        if (m) return { platform: 'TikTok', videoId: m[1], embedUrl: `https://www.tiktok.com/embed/v2/${m[1]}` };
      }
    }
  } catch (e) { /* timeout */ }
  return null;
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

  // Helper: replace thumb content without destroying overlays on el
  function setThumbImage(src) {
    // Remove any existing img or placeholder inside thumb
    const oldImg = thumb.querySelector('img');
    if (oldImg) oldImg.remove();
    const oldPh = thumb.querySelector('.mc-placeholder');
    if (oldPh) oldPh.remove();
    // Remove any iframe too (from video stop)
    const oldIframe = thumb.querySelector('iframe');
    if (oldIframe) oldIframe.remove();

    const img = document.createElement('img');
    img.src = src;
    img.alt = card.label || '';
    img.loading = 'lazy';
    img.onerror = () => {
      img.remove();
      if (!thumb.querySelector('.mc-placeholder')) {
        thumb.appendChild(buildMiroPlaceholder(card, true));
      }
    };
    thumb.insertBefore(img, thumb.firstChild);
  }

  function setThumbPlaceholder(showSpinner) {
    const oldImg = thumb.querySelector('img');
    if (oldImg) oldImg.remove();
    const oldPh = thumb.querySelector('.mc-placeholder');
    if (oldPh) oldPh.remove();
    thumb.insertBefore(buildMiroPlaceholder(card, showSpinner), thumb.firstChild);
  }

  if (card.thumbUrl) {
    // Show placeholder first, then load from IDB cache
    setThumbPlaceholder(false);
    if (typeof loadThumbCached === 'function') {
      loadThumbCached(card.thumbUrl).then(blobUrl => {
        if (blobUrl) {
          setThumbImage(blobUrl);
        } else {
          setThumbImage(card.thumbUrl);
        }
      });
    } else {
      setThumbImage(card.thumbUrl);
    }
  } else {
    setThumbPlaceholder(true);
    queueCardFetch(card);
  }

  // ─── Click-to-open / Click-to-play detection ───
  // Track mousedown position to distinguish click from drag
  let _mdX = 0, _mdY = 0, _mdTime = 0;
  thumb.addEventListener('mousedown', (e) => {
    _mdX = e.clientX; _mdY = e.clientY; _mdTime = Date.now();
  });
  thumb.addEventListener('click', (e) => {
    // Ignore clicks on buttons/links/controls
    if (e.target.closest('.mc-del, .mc-open, .mc-play-btn, .mc-video-close, .mc-lock')) return;
    // Check if this was a click (not a drag): short time + small distance
    const dt = Date.now() - _mdTime;
    const dist = Math.hypot(e.clientX - _mdX, e.clientY - _mdY);
    if (dt > 350 || dist > 8) return; // It was a drag, ignore

    e.stopPropagation();
    const videoInfo = detectVideoUrl(card.url);
    if (videoInfo) {
      _playVideoInCard(el, thumb, card, videoInfo);
    } else {
      window.open(card.url, '_blank', 'noopener');
    }
  });

  // Drag logic
  if (typeof miroSetupCardDrag === 'function') {
    miroSetupCardDrag(thumb, card, ['.mc-del', '.mc-open', '.mc-resize', '.mc-lock', '.mc-play-btn', '.mc-video-close']);
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

  // Lock UI
  if (typeof attachLockUI === 'function') {
    attachLockUI(el, card);
  }

  el.appendChild(del);
  el.appendChild(openBtn);
  el.appendChild(thumb);
  el.appendChild(meta);

  // ─── Video badge + play button (on card el, NOT inside thumb) ───
  const videoInfo = detectVideoUrl(card.url);
  if (videoInfo) {
    const badge = document.createElement('div');
    badge.className = 'mc-video-badge';
    badge.textContent = videoInfo.platform === 'YouTube' ? '▶ YouTube' : videoInfo.platform === 'TikTok' ? '♪ TikTok' : '▶ Facebook';
    el.appendChild(badge);

    const playBtn = document.createElement('div');
    playBtn.className = 'mc-play-btn';
    playBtn.title = 'Play video';
    playBtn.onclick = (e) => {
      e.stopPropagation();
      e.preventDefault();
      _playVideoInCard(el, thumb, card, videoInfo);
    };
    el.appendChild(playBtn);
  }

  return el;
}

// ─── Play video inside card ───
async function _playVideoInCard(el, thumb, card, videoInfo) {
  let embedUrl = videoInfo.embedUrl;

  // Handle TikTok short URLs
  if (videoInfo.shortUrl && !embedUrl) {
    if (typeof showToast === 'function') showToast('Resolving TikTok link…', 2000);
    const resolved = await resolveTikTokShortUrl(videoInfo.shortUrl);
    if (resolved) {
      embedUrl = resolved.embedUrl;
    } else {
      window.open(card.url, '_blank');
      return;
    }
  }

  if (!embedUrl) {
    window.open(card.url, '_blank');
    return;
  }

  el.classList.add('mc-video-active');

  // Hide badge + play btn
  const badge = el.querySelector('.mc-video-badge');
  const playBtn = el.querySelector('.mc-play-btn');
  if (badge) badge.style.display = 'none';
  if (playBtn) playBtn.style.display = 'none';

  // Clear thumb content and insert iframe
  thumb.innerHTML = '';
  const iframe = document.createElement('iframe');
  iframe.src = embedUrl;
  iframe.allow = 'autoplay; encrypted-media; fullscreen; picture-in-picture';
  iframe.allowFullscreen = true;
  iframe.style.cssText = 'width:100%;height:100%;border:none;';
  thumb.appendChild(iframe);

  // Add close/stop button
  let closeBtn = el.querySelector('.mc-video-close');
  if (!closeBtn) {
    closeBtn = document.createElement('button');
    closeBtn.className = 'mc-video-close';
    closeBtn.textContent = '■';
    closeBtn.title = 'Stop video';
    closeBtn.onclick = (ev) => {
      ev.stopPropagation();
      el.classList.remove('mc-video-active');

      // Remove iframe
      thumb.innerHTML = '';

      // Restore thumbnail
      if (card.thumbUrl) {
        const img = document.createElement('img');
        img.src = card.thumbUrl;
        img.alt = card.label || '';
        img.loading = 'lazy';
        img.onerror = () => { img.remove(); thumb.appendChild(buildMiroPlaceholder(card, false)); };
        thumb.appendChild(img);
        if (typeof loadThumbCached === 'function') {
          loadThumbCached(card.thumbUrl).then(blobUrl => {
            if (blobUrl) img.src = blobUrl;
          });
        }
      } else {
        thumb.appendChild(buildMiroPlaceholder(card, false));
      }

      // Restore badge + play btn
      if (badge) badge.style.display = '';
      if (playBtn) playBtn.style.display = '';
      closeBtn.remove();
    };
    el.appendChild(closeBtn);
  }
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
  let _lastTouchCount = 0;
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
let _activeTool = 'select';
let _penMode = false;
let _shapeMode = false;
let _activeShapeType = 'rect';
let _penPoints = [];
let _penDrawing = false;

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

let _textCreateMode = false;
let _gridCreateMode = false;
let _mindmapCreateMode = false;
let _widgetCreateMode = false;
let _trelloCreateMode = false;
let _embedCreateMode = false;
let _overlayPageCreateMode = false;
let _overlayPageCreateIdx = 0;

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
    } else if (_overlayPageCreateMode) {
      var opIdx = _overlayPageCreateIdx;
      page.miroCards.push({ id: uid(), type: 'overlay-page', overlayPage: opIdx, x: bx - Math.floor(window.innerWidth*0.42), y: by - Math.floor(window.innerHeight*0.4), w: Math.floor(window.innerWidth*0.85), h: Math.floor(window.innerHeight*0.8), calOffset: 0, calTheme: 'light', ganttView: '2week', ganttRowHeight: 50 });
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
/* ─── Grid Size Picker ─── */
let _gridPickerRows = 3, _gridPickerCols = 3;
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
    const cards = page.cards || [];
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
  if (!pinnedLayer) return;
  const board = document.getElementById('miro-board');
  const page = typeof cp === 'function' ? cp() : {};
  const cards = page.cards || [];
  // Move all children back to board
  while (pinnedLayer.firstChild) {
    const el = pinnedLayer.firstChild;
    const cid = el.dataset && el.dataset.cid;
    if (cid) {
      const cardData = cards.find(c => c.id === cid);
      if (cardData) {
        const origX = cardData._savedX != null ? cardData._savedX : (cardData.x || 0);
        const origY = cardData._savedY != null ? cardData._savedY : (cardData.y || 0);
        const origW = cardData._savedW != null ? cardData._savedW : (cardData.w || 200);
        const origH = cardData._savedH != null ? cardData._savedH : (cardData.h || 150);
        cardData.pinned = false;
        cardData.x = origX;
        cardData.y = origY;
        cardData.w = origW;
        cardData.h = origH;
        delete cardData._pinScreenX; delete cardData._pinScreenY;
        delete cardData._pinScreenW; delete cardData._pinScreenH;
        delete cardData._savedX; delete cardData._savedY;
        delete cardData._savedW; delete cardData._savedH;
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
  if (typeof sv === 'function') sv();
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
let _calendarCreateMode = false;
let _cachedCalendarList = null;
let _cachedCalendarListTs = 0;
const CALENDAR_LIST_CACHE_MS = 5 * 60 * 1000; // 5 min cache

document.getElementById('mtb-calendar').onclick = async () => {
  // If no token, get one via popup (this is a direct user click, so popup won't be blocked)
  if (!_googleAccessToken) {
    try {
      if (typeof manualGoogleReAuth === 'function') {
        await manualGoogleReAuth();
      } else {
        const result = await auth.signInWithPopup(provider);
        if (result.credential) cacheGoogleToken(result.credential.accessToken);
      }
    } catch (e) {
      // Auth failed or cancelled — still place the widget, it will show "Sign in" button
    }
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
    try {
      if (typeof manualGoogleReAuth === 'function') {
        await manualGoogleReAuth();
      } else {
        const result = await auth.signInWithPopup(provider);
        if (result.credential) cacheGoogleToken(result.credential.accessToken);
      }
    } catch (e) { /* widget will show sign-in button */ }
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
    calTheme: 'dark',
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
  const theme = card.calTheme || 'dark';

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


// ─── Full-Screen Gantt Overlay ───
(function initGanttOverlay() {
  const _state = { view: '2week', offset: 0, theme: 'light', page: 0 }; // page: 0=today, 1=gantt, 2=stats, 3=fruit
  let _overlayEl = null;
  var _updatePageDotsRef = function() {};
  var _renderPageRef = function() {};
  function openGanttOverlay(page) {
    if (typeof page === 'number') _state.page = page;
    if (_overlayEl) { _updatePageDotsRef(); _renderPageRef(); return; }
    if (!_googleAccessToken && typeof manualGoogleReAuth === 'function') {
      manualGoogleReAuth().then(() => _buildOverlay()).catch(() => _buildOverlay());
      return;
    }
    _buildOverlay();
  }
  function closeGanttOverlay() {
      if (_overlayEl && _overlayEl.querySelector('.gantt-overlay-panel')) { var p = _overlayEl.querySelector('.gantt-overlay-panel'); if(p._autoTimer) clearInterval(p._autoTimer); } if (_overlayEl) { _overlayEl.remove(); _overlayEl = null; } }
  function _buildOverlay() {
    closeGanttOverlay();
    const overlay = document.createElement('div');
    overlay.className = 'gantt-overlay';
    overlay.addEventListener('mousedown', e => { if (e.target === overlay) closeGanttOverlay(); });
    _overlayEl = overlay;
    const panel = document.createElement('div');
    panel.className = 'gantt-overlay-panel';
    const hdr = document.createElement('div');
    hdr.className = 'gantt-overlay-hdr';
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
    hdr.appendChild(mkBtn('\uD83D\uDD04', 'Refresh', () => _renderPage()));
    const closeBtn = mkBtn('\u2715', 'Close (Esc)', closeGanttOverlay);
    closeBtn.className = 'gantt-overlay-close';
    hdr.appendChild(closeBtn);
    panel.appendChild(hdr);
    let body = document.createElement('div');
    body.className = 'gantt-overlay-body';
    panel.appendChild(body);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);
    function _applyTh() {
      const t = _state.theme;
      if (t === 'light') { panel.style.background='#f5f6fa'; panel.style.border='1px solid #ddd'; hdr.style.background='rgba(0,0,0,.04)'; title.style.color='#333'; }
      else if (t === 'transparent') { panel.style.background='rgba(20,20,30,.85)'; panel.style.border='1px solid rgba(255,255,255,.08)'; hdr.style.background='transparent'; title.style.color='#aaa'; }
      else { panel.style.background='#1a1c2e'; panel.style.border='1px solid rgba(108,143,255,.2)'; hdr.style.background='rgba(108,143,255,.08)'; title.style.color='#ccc'; }
    }
    _applyTh();
    const _fc = { calTheme: _state.theme };
        // Page navigation dots
    const _pageDots = document.createElement('div');
    _pageDots.style.cssText = 'display:flex;gap:4px;align-items:center;margin-left:auto;margin-right:8px;';
    const _pageNames = ['\u2600\uFE0F', '\uD83D\uDCCA', '\uD83D\uDCC8', '\uD83C\uDF4E'];
    const _pageTitles = ['Today', 'Gantt Chart', 'Statistics', 'Fruit Tracker'];
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
        if (e.deltaX > 0 && _state.page < 3) { _state.page++; _updatePageDots(); _renderPage(); }
        else if (e.deltaX < 0 && _state.page > 0) { _state.page--; _updatePageDots(); _renderPage(); }
      }
    }, {passive: false});

    function _renderPage() {
      if (_state.page === 0) _renderToday(); else if (_state.page === 1) _render(); else if (_state.page === 2) _renderStats(); else _renderFruit();
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
      body.innerHTML = '<div style="text-align:center;padding:10px;color:#888;font-size:.55rem;">Loading 2Days...</div>';
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
          var sp = document.createElement('div');
          sp.style.cssText = 'display:inline-flex;align-items:center;gap:2px;padding:2px 3px;background:'+bg2+';border-radius:4px;border:1px solid '+(isCurrent?'#4285f4':bdr)+';'+(isCurrent?'box-shadow:0 0 6px rgba(66,133,244,.3);':'');

          // Session label
          var sl = document.createElement('div');
          sl.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:0;margin-right:2px;';
          var se = document.createElement('span'); se.style.cssText = 'font-size:14px;line-height:1;'; se.textContent = sess.emoji;
          var sn = document.createElement('span'); sn.style.cssText = 'font-size:.55rem;font-weight:700;color:'+txt+';line-height:1;'; sn.textContent = sess.name;
          sl.appendChild(se); sl.appendChild(sn);
          sp.appendChild(sl);

          // Pomodoro cells container with drag support
          var pg = document.createElement('div');
          pg.style.cssText = 'display:flex;align-items:flex-start;gap:1px;';
          pg.dataset.sessIdx = sIdx;

          var groups = [[0,1,2],[3,4],[5,6,7]];
          var cellElements = [];

          groups.forEach(function(grp, gi) {
            if (gi > 0) {
              var gap = document.createElement('div');
              gap.style.cssText = 'width:4px;align-self:stretch;flex-shrink:0;';
              pg.appendChild(gap);
            }

            grp.forEach(function(slotInSess) {
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
              cw.dataset.cellIdx = slotInSess;
              cw.dataset.absSlot = absSlotIdx;

              // Event cell
              var ec = document.createElement('div');
              ec.className = 'pomo-ev';
              ec.style.cssText = 'width:'+SZ+'px;height:'+SZ+'px;border:1px solid '+bdr+';border-radius:3px;background:'+(cellBg!=='transparent'?cellBg:bg2)+';cursor:pointer;display:flex;align-items:center;justify-content:center;overflow:hidden;font-size:.3rem;color:'+(cellBg!=='transparent'?getContrastColor(cellBg):txt)+';box-sizing:border-box;user-select:none;';
              if (cellTitle) ec.title = cellTitle;
              else {
                var th2 = Math.floor(slotStartMin/60), tm2 = slotStartMin%60;
                ec.title = ((th2%12)||12)+':'+(tm2<10?'0':'')+tm2+(th2<12?'am':'pm');
              }

              (function(ec, slotEvts, slotStartDate, slotEndDate) {
                ec.addEventListener('click', function(ev2) {
                  if (pg._didDrag) return;
                  ev2.stopPropagation();
                  if (slotEvts.length > 0) {
                    var e0 = slotEvts[0];
                    showCalendarEventForm(body, body, null, { mode:'edit', calendarId:e0.calendarId, eventId:e0.id, summary:e0.summary, description:e0.description, startTime:new Date(e0.start), endTime:new Date(e0.end) });
                  } else {
                    showCalendarEventForm(body, body, null, { mode:'create', startTime:slotStartDate, endTime:slotEndDate });
                  }
                });
              })(ec, slotEvts, slotStartDate, slotEndDate);

              cw.appendChild(ec);

              // Fruit cell
              var fc = document.createElement('div');
              fc.className = 'pomo-fr';
              fc.style.cssText = 'width:'+SZ+'px;height:'+SZ+'px;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:'+(SZ-6)+'px;border-radius:3px;background:'+(hasFruit?'rgba(231,76,60,.1)':'transparent')+';box-sizing:border-box;user-select:none;';
              fc.textContent = hasFruit ? '\uD83C\uDF4E' : '';
              fc.title = hasFruit ? '\u2714 Fruit' : 'Add fruit';
              fc.dataset.absSlot = absSlotIdx;
              fc.dataset.hasFruit = hasFruit ? '1' : '0';

              (function(fc, absSlotIdx, hasFruit, frSlotMap, fruitCalId, slotStartDate, slotEndDate) {
                fc.addEventListener('click', function(ev2) {
                  if (pg._didDragFr) return;
                  ev2.stopPropagation();
                  if (!fruitCalId) { showToast('\u274C No fruit calendar'); return; }
                  var fEvs = frSlotMap[absSlotIdx] || [];
                  if (hasFruit && fEvs.length > 0) {
                    deleteCalendarEvent(fEvs[0].calendarId, fEvs[0].id).then(function() { showToast('\uD83D\uDDD1'); _renderToday(); }).catch(function(er) { showToast('\u274C ' + er.message); });
                  } else {
                    createCalendarEvent(fruitCalId, "!40's Fruit", slotStartDate, slotEndDate, '').then(function() { showToast('\u2705'); _renderToday(); }).catch(function(er) { showToast('\u274C ' + er.message); });
                  }
                });
              })(fc, absSlotIdx, hasFruit, frSlotMap, fruitCalId, slotStartDate, slotEndDate);

              cw.appendChild(fc);
              cw.setAttribute('data-cell-idx', slotInSess);
              pg.appendChild(cw);
              cellElements.push({ el: cw, slot: slotInSess, absSlot: absSlotIdx, startMin: slotStartMin, endMin: slotEndMin, dayMs: dayMs });
            });
          });

          // Drag-to-select (document-level with bounding rect hit testing)
          (function(cellElements, sess, dayMs, fruitCalId, frSlotMap, pg) {
            var mode = null;
            var startSlot = -1;

            function getCellAt(x, y) {
              for (var i = 0; i < cellElements.length; i++) {
                var r = cellElements[i].el.getBoundingClientRect();
                if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return cellElements[i];
              }
              return null;
            }

            function highlightRange(mn, mx) {
              cellElements.forEach(function(ce) {
                var tgt = mode === 'ev' ? ce.el.querySelector('.pomo-ev') : ce.el.querySelector('.pomo-fr');
                var clr = mode === 'ev' ? '#4285f4' : '#e74c3c';
                if (ce.slot >= mn && ce.slot <= mx) {
                  tgt.style.outline = '2px solid ' + clr;
                } else {
                  tgt.style.outline = 'none';
                }
              });
            }

            function clearAll() {
              cellElements.forEach(function(ce) {
                ce.el.querySelector('.pomo-ev').style.outline = 'none';
                ce.el.querySelector('.pomo-fr').style.outline = 'none';
              });
            }

            cellElements.forEach(function(ce) {
              ce.el.querySelector('.pomo-ev').addEventListener('mousedown', function(e) {
                if (e.button !== 0) return;
                mode = 'ev'; startSlot = ce.slot; pg._didDrag = false;
                highlightRange(ce.slot, ce.slot);
                e.preventDefault();
              });
              ce.el.querySelector('.pomo-fr').addEventListener('mousedown', function(e) {
                if (e.button !== 0) return;
                mode = 'fr'; startSlot = ce.slot; pg._didDragFr = false;
                highlightRange(ce.slot, ce.slot);
                e.preventDefault();
              });
            });

            document.addEventListener('mousemove', function(e) {
              if (!mode) return;
              var hit = getCellAt(e.clientX, e.clientY);
              if (!hit) return;
              highlightRange(Math.min(startSlot, hit.slot), Math.max(startSlot, hit.slot));
            });

            document.addEventListener('mouseup', function() {
              if (!mode) return;
              var curMode = mode; mode = null;
              var sel = [];
              cellElements.forEach(function(ce) {
                var tgt = curMode === 'ev' ? ce.el.querySelector('.pomo-ev') : ce.el.querySelector('.pomo-fr');
                if (tgt.style.outline && tgt.style.outline !== 'none') sel.push(ce);
              });
              clearAll();
              if (curMode === 'ev') {
                if (sel.length < 2) return;
                pg._didDrag = true; setTimeout(function(){ pg._didDrag = false; }, 300);
                var sMin = Math.min.apply(null, sel.map(function(h){return h.startMin;}));
                var eMin = Math.max.apply(null, sel.map(function(h){return h.endMin;}));
                showCalendarEventForm(body, body, null, { mode:'create', startTime:new Date(dayMs+sMin*60000), endTime:new Date(dayMs+eMin*60000) });
              } else if (curMode === 'fr') {
                if (sel.length < 2) return;
                pg._didDragFr = true; setTimeout(function(){ pg._didDragFr = false; }, 300);
                if (!fruitCalId) return;
                var hasC = sel.filter(function(c2) { return (frSlotMap[c2.absSlot]||[]).length > 0; }).length;
                var del2 = hasC > sel.length / 2;
                var ops = [];
                sel.forEach(function(c2) {
                  var fEvs = frSlotMap[c2.absSlot] || [];
                  var sM = (sess.start * 60) + (c2.slot * 30);
                  var sd2 = new Date(dayMs + sM * 60000), ed2 = new Date(dayMs + (sM+30) * 60000);
                  if (del2 && fEvs.length > 0) ops.push(deleteCalendarEvent(fEvs[0].calendarId, fEvs[0].id));
                  else if (!del2 && fEvs.length === 0) ops.push(createCalendarEvent(fruitCalId, "!40's Fruit", sd2, ed2, ''));
                });
                if (ops.length) Promise.all(ops).then(function() { _renderToday(); }).catch(function() { _renderToday(); });
              }
            });
          })(cellElements, sess, dayMs, fruitCalId, frSlotMap, pg);

          sp.appendChild(pg);
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
    async function _renderFruit() {
      body.innerHTML = '<div style="text-align:center;padding:40px;color:#888;font-size:.7rem;">Loading fruit data...</div>';
      var now = new Date();
      var isDk = _state.theme !== 'light';
      var txt = isDk ? '#ddd' : '#222';
      var bg2 = isDk ? 'rgba(255,255,255,.04)' : 'rgba(0,0,0,.03)';
      var fruitStart = new Date(2026,0,14); fruitStart.setHours(0,0,0,0);
      try {
        var allEv = await fetchCalendarEvents(fruitStart, new Date(now.getFullYear(),now.getMonth(),now.getDate()+1));
        var fruitEv = (allEv||[]).filter(function(e){ return (e.calendarName||'').toLowerCase()==="!40's fruit" && !e.allDay; });
        // Group by date
        var dayMap = {};
        fruitEv.forEach(function(e){
          var d = new Date(e.start).toISOString().slice(0,10);
          if(!dayMap[d]) dayMap[d] = 0;
          dayMap[d]++;
        });
        var days = [];
        var d = new Date(fruitStart);
        while(d <= now) {
          var k = d.toISOString().slice(0,10);
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
          var isToday = dy.date === now.toISOString().slice(0,10);
          var isFri = dy.dow === 5;
          html += '<div style="display:flex;align-items:center;gap:2px;margin-bottom:1px;'+(isToday?'background:rgba(108,143,255,.1);border-radius:3px;padding:1px 2px;':'')+(isFri?'opacity:.5;':'')+'">';
          html += '<span style="width:24px;font-size:.4rem;opacity:.6;">'+dn[dy.dow].slice(0,2)+'</span>';
          html += '<span style="width:16px;font-size:.4rem;opacity:.5;">'+dt.getDate()+'</span>';
          for(var i=0;i<16;i++){
            var checked = i < dy.count;
            html += '<div style="width:12px;height:12px;border-radius:2px;border:1px solid '+(isDk?'rgba(255,255,255,.15)':'rgba(0,0,0,.12)')+';background:transparent;display:flex;align-items:center;justify-content:center;font-size:10px;line-height:1;">'+(checked?'\uD83C\uDF4E':'')+'</div>';
          }
          html += '<span style="font-size:.4rem;margin-left:4px;opacity:.6;">'+dy.count+'/16</span>';
          html += '</div>';
        });
        html += '</div></div>';
        body.innerHTML = html;
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
    const ro = new ResizeObserver(() => { clearTimeout(ro._t); ro._t = setTimeout(_renderPage, 400); });
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
        }, 5000);
      }
    };
  }
  // Expose open/close globally for widget bootstrap
  window._openGanttOverlay = openGanttOverlay;
  window._closeGanttOverlay = closeGanttOverlay;
  // Bind 4 top toolbar buttons (overlay mode)
  var _tbBtns = [
    {id:'overlay-today-btn', page:0},
    {id:'overlay-gantt-btn', page:1},
    {id:'overlay-stats-btn', page:2},
    {id:'overlay-fruit-btn', page:3}
  ];
  _tbBtns.forEach(function(cfg) {
    var b = document.getElementById(cfg.id);
    if (b) b.onclick = function() {
      if (_overlayEl && _state.page === cfg.page) { closeGanttOverlay(); }
      else { openGanttOverlay(cfg.page); }
    };
  });
  // Bind 4 vertical toolbar buttons (widget placement mode)
  var _vtbBtns = [
    {id:'mtb-today', page:0},
    {id:'mtb-gantt-overlay', page:1},
    {id:'mtb-stats', page:2},
    {id:'mtb-fruits', page:3}
  ];
  _vtbBtns.forEach(function(cfg) {
    var b = document.getElementById(cfg.id);
    if (b) b.onclick = function() {
      placeOverlayPageWidget(cfg.page);
    };
  });
  document.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.contentEditable === 'true') return;
    if (e.key === 'Escape' && _overlayEl) { closeGanttOverlay(); e.preventDefault(); return; }
    // Plain 1-4 to open overlay pages
    if (!e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
      var pageMap = {'1':0, '2':1, '3':2, '4':3};
      if (pageMap[e.key] !== undefined) {
        if (_overlayEl && _state.page === pageMap[e.key]) { closeGanttOverlay(); }
        else { openGanttOverlay(pageMap[e.key]); }
        e.preventDefault(); return;
      }
    }
    // Shift+1-4 to place widget on canvas
    if (e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
      var widgetMap = {'!':0, '@':1, '#':2, '$':3, '1':0, '2':1, '3':2, '4':3};
      if (widgetMap[e.key] !== undefined) {
        placeOverlayPageWidget(widgetMap[e.key]);
        e.preventDefault(); return;
      }
    }
    if ((e.key === 'h' || e.key === 'H' || e.key === '\u0623' || e.key === '\u0627') && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if (_overlayEl) closeGanttOverlay(); else openGanttOverlay(); e.preventDefault();
    }
  });
})();

// ─── Embed Web View Widget ───

// ── Place Overlay Page as Canvas Widget ──
var _overlayPageNames = ['2Days','Gantt Chart','Statistics','Fruit Tracker'];
var _overlayPageEmojis = ['\uD83D\uDCC5','\uD83D\uDCCA','\uD83D\uDCC8','\uD83C\uDF4E'];
async function placeOverlayPageWidget(pageIdx) {
  if (!_googleAccessToken) {
    try {
      if (typeof manualGoogleReAuth === 'function') { await manualGoogleReAuth(); }
      else { var result = await auth.signInWithPopup(provider); if (result.credential) cacheGoogleToken(result.credential.accessToken); }
    } catch(e) { /* widget will show sign-in button */ }
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

function buildMiroOverlayWidget(card) {
  var pIdx = card.overlayPage || 0;
  // Default to near-fullscreen size if not set
  if (!card.w || card.w < 100) card.w = Math.max(900, window.innerWidth * 0.85);
  if (!card.h || card.h < 100) card.h = Math.max(500, window.innerHeight * 0.8);

  var el = document.createElement('div');
  el.className = 'miro-overlay-widget';
  el.dataset.cid = card.id;
  el.style.left = (card.x||0)+'px';
  el.style.top = (card.y||0)+'px';
  el.style.width = card.w+'px';
  el.style.height = card.h+'px';

  // â”€â”€ Header (identical to overlay) â”€â”€
  var hdr = document.createElement('div');
  hdr.className = 'ow-hdr';

  // Page switch buttons
  var pageEmojis = ['\u2600\uFE0F','\uD83D\uDCCA','\uD83D\uDCC8','\uD83C\uDF4E'];
  var pageNames = ['Today','Gantt','Stats','Fruit'];
  var pageBtns = [];
  pageEmojis.forEach(function(emoji, i) {
    var pb = document.createElement('button');
    pb.textContent = emoji;
    pb.title = pageNames[i];
    pb.className = 'ow-page-btn' + (i === pIdx ? ' active' : '');
    pb.onclick = function(e) {
      e.stopPropagation();
      card.overlayPage = i; pIdx = i; card.calOffset = 0;
      pageBtns.forEach(function(b,j){ b.className = 'ow-page-btn' + (j===i?' active':''); });
      sv(); _rw();
    };
    pageBtns.push(pb);
    hdr.appendChild(pb);
  });

  // Separator
  var sep = document.createElement('div');
  sep.style.cssText = 'width:1px;height:16px;background:rgba(128,128,128,.3);margin:0 4px;';
  hdr.appendChild(sep);

  // Nav buttons
  var _cb = function(txt,tip,fn){
    var b = document.createElement('button'); b.textContent = txt; b.title = tip;
    b.onclick = function(e){ e.stopPropagation(); fn(); }; return b;
  };
  var _days = function(){ return card.ganttView==='month'?30:card.ganttView==='2week'?14:7; };
  hdr.appendChild(_cb('\u25C0','Prev',function(){card.calOffset=(card.calOffset||0)-_days();sv();_rw();}));
  hdr.appendChild(_cb('\u2039','Prev day',function(){card.calOffset=(card.calOffset||0)-1;sv();_rw();}));
  hdr.appendChild(_cb('Today','Reset',function(){card.calOffset=0;sv();_rw();}));
  hdr.appendChild(_cb('\u203A','Next day',function(){card.calOffset=(card.calOffset||0)+1;sv();_rw();}));
  hdr.appendChild(_cb('\u25B6','Next',function(){card.calOffset=(card.calOffset||0)+_days();sv();_rw();}));

  // View toggle
  var vl = {week:'Wk','2week':'2W',month:'Mo'}, vc = ['week','2week','month'];
  var vb = _cb(vl[card.ganttView||'2week'],'View',function(){
    var i = vc.indexOf(card.ganttView||'2week');
    card.ganttView = vc[(i+1)%vc.length]; card.calOffset=0;
    vb.textContent = vl[card.ganttView]; sv(); _rw();
  });
  hdr.appendChild(vb);

  // Theme toggle
  var ths = ['light','dark','transparent'];
  var thI = {light:'\u2600\uFE0F',dark:'\uD83C\uDF19',transparent:'\uD83D\uDC41'};
  var thB = _cb(thI[card.calTheme||'light'],'Theme',function(){
    var i = ths.indexOf(card.calTheme||'light');
    card.calTheme = ths[(i+1)%ths.length]; thB.textContent = thI[card.calTheme];
    _applyTheme(); sv(); _rw();
  });
  hdr.appendChild(thB);
  hdr.appendChild(_cb('\uD83D\uDD04','Refresh',function(){ _rw(); }));

  // Spacer + delete
  var spacer = document.createElement('div');
  spacer.style.flex = '1';
  hdr.appendChild(spacer);

  var lockBtn = document.createElement('button');
  lockBtn.textContent = card.locked ? '\uD83D\uDD12' : '\uD83D\uDD13';
  lockBtn.title = 'Lock/Unlock';
  lockBtn.className = 'ow-lock-btn';
  lockBtn.onclick = function(e) {
    e.stopPropagation();
    card.locked = !card.locked;
    lockBtn.textContent = card.locked ? '\uD83D\uDD12' : '\uD83D\uDD13';
    el.classList.toggle('is-locked', card.locked);
    sv();
  };
  hdr.appendChild(lockBtn);

  var del = _cb('\u2715','Delete',function(){ deleteMiroCard(card.id); });
  hdr.appendChild(del);

  // â”€â”€ Body â”€â”€
  var body = document.createElement('div');
  body.className = 'ow-body';
  el.appendChild(hdr);
  el.appendChild(body);

  // â”€â”€ Theme â”€â”€
  function _applyTheme() {
    var t = card.calTheme || 'light';
    el.classList.remove('ow-light','ow-dark','ow-transparent');
    el.classList.add('ow-' + t);
  }
  _applyTheme();

  // â”€â”€ Render (uses overlay API for identical content) â”€â”€
  var _rendering = false;
  async function _rw() {
    if (_rendering) return;
    _rendering = true;
    try {
      // Try to use overlay's exact render functions
      if (window._overlayAPI && typeof window._overlayAPI.renderInto === 'function') {
        window._overlayAPI.renderInto(body, pIdx, card.calOffset||0, card.calTheme||'light', card.ganttView||'2week');
      } else {
        // Bootstrap: silently open overlay to initialize API, then retry
        if (typeof window._openGanttOverlay === 'function') {
          window._openGanttOverlay(0);
          await new Promise(function(r){ setTimeout(r, 300); });
          if (typeof window._closeGanttOverlay === 'function') window._closeGanttOverlay();
          // Now try again
          if (window._overlayAPI && typeof window._overlayAPI.renderInto === 'function') {
            window._overlayAPI.renderInto(body, pIdx, card.calOffset||0, card.calTheme||'light', card.ganttView||'2week');
          } else {
            body.innerHTML = '<div style="text-align:center;padding:40px;color:#888;">Initializing...</div>';
            setTimeout(function(){ _rendering = false; _rw(); }, 1500);
            return;
          }
        }
      }
    } catch(err) {
      body.innerHTML = '<div style="text-align:center;padding:40px;color:#e55;">' + err.message + '</div>';
    }
    _rendering = false;
  }

  // â”€â”€ Drag (from header) â”€â”€
  miroSetupCardDrag(el, card, ['.ow-body','button','.mc-resize-br','.mc-resize-bl','.mc-resize-tr','.mc-resize-tl','.mc-resize-t','.mc-resize-b','.mc-resize-l','.mc-resize-r']);

  // â”€â”€ 8-way Resize â”€â”€
  attach8WayResize(el, card, 400, 300);

  // â”€â”€ Auto-fit on resize â”€â”€
  var _rt = null, _lw = 0, _lh = 0;
  var ro = new ResizeObserver(function() {
    clearTimeout(_rt);
    _rt = setTimeout(function() {
      var w = el.offsetWidth, h = el.offsetHeight;
      if (w < 50 || h < 50) return;
      if (Math.abs(w-_lw) < 5 && Math.abs(h-_lh) < 5) return;
      _lw = w; _lh = h;
      card.w = w; card.h = h;
      _rw();
    }, 600);
  });
  ro.observe(el);

  // Initial render
  requestAnimationFrame(function() { _rw(); });
  return el;
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
  // Smart refresh: detect gantt vs calendar context
  const _isGantt = !!(el && (el.querySelector('.gantt-body') || el.querySelector('.gantt-overlay-body') || el.classList.contains('gantt-overlay-panel')));
  const _refresh = () => {
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
    var _exCals = ['phases of the moon','holidays in egypt','muslim holidays'];
    calendars = calendars.filter(c => _exCals.indexOf(c.summary.toLowerCase()) === -1);
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

  form.appendChild(titleLabel);
  form.appendChild(titleInp);
  form.appendChild(calLabel);
  form.appendChild(calBtnRow);
  form.appendChild(timeRow);
  form.appendChild(dateRow);
  form.appendChild(descLabel);
  form.appendChild(descInp);
  form.appendChild(btnRow);

  // ─── Render as fixed overlay (centered on screen, unaffected by zoom) ───
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.45);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);';
  overlay.addEventListener('mousedown', (e) => {
    if (e.target === overlay) { overlay.remove(); document.removeEventListener('keydown', _onEscForm); }
  });

  form.style.cssText = 'background:var(--s2,#1e1e2e);border:1px solid var(--bd,#333);border-radius:14px;padding:18px 22px;min-width:340px;max-width:420px;width:90vw;box-shadow:0 12px 48px rgba(0,0,0,.7);display:flex;flex-direction:column;gap:4px;color:var(--tx,#eee);font-family:var(--font,Inter,sans-serif);';
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
  sep.style.cssText = 'color:#aaa;font-size:.8rem;font-weight:700;';
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
})();
