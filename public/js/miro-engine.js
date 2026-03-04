/* ─── Miro Page Engine ─── */
let _miroMode = false;
let _miroPanning = false,
  _miroPanStartX = 0,
  _miroPanStartY = 0;
let _miroCardDrag = null,
  _miroCardResize = null;
const _miroSelected = new Set();
let _alignDragging = false;
let _justRubberBanded = false;
let _stickyCreateMode = false;

document.getElementById('miro-toggle').onclick = () => {
  _miroMode = !_miroMode;
  document.getElementById('miro-toggle').classList.toggle('miro-on', _miroMode);
};

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
  board.querySelectorAll('.miro-card, .miro-sticky, .miro-image, .miro-text, .miro-shape, .miro-pen, .miro-grid, .miro-mindmap').forEach((el) => el.remove());
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
    if (card.type === 'sticky') board.appendChild(buildMiroSticky(card));
    else if (card.type === 'image') board.appendChild(buildMiroImage(card));
    else if (card.type === 'text') board.appendChild(buildMiroText(card));
    else if (card.type === 'shape') board.appendChild(buildMiroShape(card));
    else if (card.type === 'pen') board.appendChild(buildMiroPen(card));
    else if (card.type === 'grid') board.appendChild(buildMiroGridCard(card));
    else if (card.type === 'mindmap') board.appendChild(buildMiroMindMap(card));
    else board.appendChild(buildMiroCard(card));
  });
  updateMiroGrid();
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
  thumb.addEventListener('mousedown', (e) => {
    if (
      e.target.closest('.mc-del') ||
      e.target.closest('.mc-open') ||
      e.target.closest('.mc-resize')
    )
      return;
    e.stopPropagation();
    // Ctrl+Click toggle selection
    if (e.ctrlKey || e.metaKey) {
      toggleMiroSelect(card.id);
      return;
    }
    // If card is not selected, select only this card (unless part of multi-select)
    if (!_miroSelected.has(card.id)) {
      clearMiroSelection();
      addMiroSelect(card.id);
    }
    const page = cp();
    const zoom = (page.zoom || 100) / 100;
    const startX = e.clientX,
      startY = e.clientY;
    // Store original positions for all selected cards
    const origPositions = new Map();
    _miroSelected.forEach((cid) => {
      const c = (page.miroCards || []).find((x) => x.id === cid);
      if (c) origPositions.set(cid, { x: c.x || 0, y: c.y || 0 });
    });
    let moved = false;
    function onMove(ev) {
      moved = true;
      const dx = (ev.clientX - startX) / zoom;
      const dy = (ev.clientY - startY) / zoom;
      origPositions.forEach((orig, cid) => {
        const c = (page.miroCards || []).find((x) => x.id === cid);
        if (!c) return;
        c.x = orig.x + dx;
        c.y = orig.y + dy;
        const cardEl = document.querySelector(`[data-cid="${cid}"]`);
        if (cardEl) {
          cardEl.style.left = c.x + 'px';
          cardEl.style.top = c.y + 'px';
        }
      });
      updateMiroSelFrame();
    }
    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      if (moved) sv();
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });

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
  attachCornerResize(el, card, 160, 100);

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
    if (e.target !== canvas && e.target.id !== 'miro-board') return;
    e.preventDefault();

    const page = cp();
    const isMiro = page.pageType === 'miro';

    // Right-click or middle-click: always pan
    if (e.button !== 0) {
      _miroPanning = true;
      _miroPanStartX = e.clientX - (page.panX || 0);
      _miroPanStartY = e.clientY - (page.panY || 0);
      canvas.style.cursor = 'grabbing';
      return;
    }

    // Space held: pan mode (future enhancement)
    // If in a creation/drawing mode, don't start rubber-band — let click handlers handle it
    if (isMiro && (_stickyCreateMode || _textCreateMode || _penMode || _shapeMode)) {
      return;
    }

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
      let z = page.zoom || 100;
      const rect = canvas.getBoundingClientRect();
      const cursorX = e.clientX - rect.left;
      const cursorY = e.clientY - rect.top;
      const oldZoom = z / 100;

      // Both trackpad pinch and regular scroll → zoom at cursor
      const delta = e.ctrlKey ? (-e.deltaY * 0.8) : (e.deltaY > 0 ? -5 : 5);
      z = Math.max(10, Math.min(400, z + delta));
      const newZoom = z / 100;

      // Adjust pan so cursor stays over the same board point
      page.panX = cursorX - (cursorX - (page.panX || 0)) * (newZoom / oldZoom);
      page.panY = cursorY - (cursorY - (page.panY || 0)) * (newZoom / oldZoom);

      page.zoom = z;
      applyZoomPan(page);
      // Debounced save so zoom state persists
      clearTimeout(_wheelSvTimer);
      _wheelSvTimer = setTimeout(() => sv(), 300);
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
      const newZoom = Math.max(10, Math.min(400, Math.round(_touchStartZoom * scale)));
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
    const newZoom = Math.max(10, Math.min(400, _dblDragStartZoom + dragDelta * 0.8));
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
  page.zoom = Math.max(10, (page.zoom || 100) - 10);
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
  page.zoom = Math.max(10, Math.min(400, Math.round(zoom)));
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
  const btnMap = { select: 'mtb-select', sticky: 'mtb-sticky', text: 'mtb-text', shape: 'mtb-shape', pen: 'mtb-pen', grid: 'mtb-grid', mindmap: 'mtb-mindmap', image: 'mtb-image', card: 'mtb-card' };
  const btn = document.getElementById(btnMap[tool]);
  if (btn) btn.classList.add('sel');
  _penMode = tool === 'pen';
  _shapeMode = tool === 'shape';
  _stickyCreateMode = tool === 'sticky';
  _textCreateMode = tool === 'text';
  _gridCreateMode = tool === 'grid';
  _mindmapCreateMode = tool === 'mindmap';

  const hint = document.getElementById('sn-create-hint');
  if (_stickyCreateMode) { hint.textContent = '📝 Click anywhere to place a sticky note • Press Esc to cancel'; hint.style.display = 'block'; }
  else if (_textCreateMode) { hint.textContent = '✏️ Click anywhere to place text • Press Esc to cancel'; hint.style.display = 'block'; }
  else if (_gridCreateMode) { hint.textContent = '📊 Click anywhere to place a table • Press Esc to cancel'; hint.style.display = 'block'; }
  else if (_mindmapCreateMode) { hint.textContent = '🧠 Click anywhere to place a mind map • Press Esc to cancel'; hint.style.display = 'block'; }
  else { hint.style.display = 'none'; }

  document.getElementById('miro-pen-toolbar').classList.toggle('show', _penMode);
  const cursor = (_penMode || _shapeMode || _stickyCreateMode || _textCreateMode || _gridCreateMode || _mindmapCreateMode) ? 'crosshair' : 'grab';
  document.getElementById('miro-canvas').style.cursor = cursor;
  if (!_shapeMode) document.getElementById('miro-shape-panel').classList.remove('show');
}

let _textCreateMode = false;
let _gridCreateMode = false;
let _mindmapCreateMode = false;

document.getElementById('mtb-select').onclick = () => setActiveTool('select');
document.getElementById('mtb-sticky').onclick = () => setActiveTool('sticky');
document.getElementById('mtb-text').onclick = () => setActiveTool('text');

// Canvas click handler for click-to-place modes
document.getElementById('miro-canvas').addEventListener('click', (e) => {
  if (!_stickyCreateMode && !_textCreateMode && !_gridCreateMode && !_mindmapCreateMode) return;
  if (e.target.closest('.miro-card, .miro-sticky, .miro-image, .miro-text, .miro-shape, .miro-pen, .miro-grid, .miro-mindmap, #miro-toolbar, .mc-del')) return;
  const page = cp();
  if (!page.miroCards) page.miroCards = [];
  const zoom = (page.zoom || 100) / 100;
  const rect = document.getElementById('miro-canvas').getBoundingClientRect();
  const bx = (e.clientX - rect.left - (page.panX || 0)) / zoom;
  const by = (e.clientY - rect.top - (page.panY || 0)) / zoom;

  if (_stickyCreateMode) {
    const newId = uid();
    page.miroCards.push({ id: newId, type: 'sticky', text: '', color: 'yellow', shape: 'rect', x: bx - 140, y: by - 80, w: 280, h: 160 });
    setTimeout(() => {
      const el = document.querySelector(`.miro-sticky[data-cid="${newId}"] .ms-text`);
      if (el) el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    }, 50);
  } else if (_textCreateMode) {
    const newId = uid();
    page.miroCards.push({ id: newId, type: 'text', text: '', x: bx - 60, y: by - 15, w: 120, h: 30, fontSize: 24, fontFamily: 'Inter', color: '#ffffff' });
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
  }

  sv(); buildMiroCanvas(); buildOutline();
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
  // Don't trigger during text input
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT' || e.target.contentEditable === 'true') return;
  const page = cp();
  if (page.pageType !== 'miro') return;

  const key = e.key.toLowerCase();
  const isCmd = e.ctrlKey || e.metaKey;

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
      console.log(`Copied ${copiedCards.length} items.`);
    }
  }

  // Paste (Cmd/Ctrl + V) native event will handle everything now to prevent race conditions.
  // Blur any focused input to prevent typing in search box
  if (document.activeElement && document.activeElement.tagName === 'INPUT') document.activeElement.blur();

  // Explicit text-paste fallback for Arabic keyboard (Ctrl+ر) because it won't trigger native OS "paste" event.
  if (isCmd && key === 'ر') {
    navigator.clipboard.readText().then(text => {
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

  let imagePasted = false;

  // 1. Check for images first
  if (e.clipboardData && e.clipboardData.items) {
    for (let i = 0; i < e.clipboardData.items.length; i++) {
      if (e.clipboardData.items[i].type.indexOf('image') !== -1) {
        const blob = e.clipboardData.items[i].getAsFile();
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
      }
    }
  }

  // If an image was handled, don't try to process text fallback for this paste event.
  if (imagePasted) return;

  // 2. Fallback to Text Handling
  const text = (e.clipboardData || window.clipboardData).getData('text');

  // If there's no text (and no image was pasted), check if we explicitly have an old localstorage clipboard as an absolute deepest fallback.
  // Note: Usually Ctrl+C writes to OS clipboard, so this is rarely needed, but good for cross-tab if native clipboard fails.
  if (!text) {
    const ls = localStorage.getItem('miro_clipboard');
    if (ls) handleMiroPasting(ls);
    return;
  }

  // 3. Is it a STARTMINE internal paste string?
  if (text.startsWith('STARTMINE_MIRO:')) {
    handleMiroPasting(text.replace('STARTMINE_MIRO:', ''));
    return;
  }

  // 4. It's external Text or URL
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
  } else {
    // Normal text -> Sticky
    const w = 200, h = 200;
    const card = { id: uid(), type: 'sticky', text: text, bg: '#ffe599', x: cx - w / 2, y: cy - h / 2, w, h };
    page.miroCards.push(card);
    sv(); buildMiroCanvas(); buildOutline();
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
