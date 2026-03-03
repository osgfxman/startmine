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

function buildMiroCanvas() {
  const page = cp();
  if (!page.miroCards) page.miroCards = [];
  const board = document.getElementById('miro-board');
  // Remove only card elements, preserve selection overlays
  board.querySelectorAll('.miro-card, .miro-sticky').forEach((el) => el.remove());
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
    else board.appendChild(buildMiroCard(card));
  });
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
        const cardEl = document.querySelector(`.miro-card[data-cid="${cid}"]`);
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

  // Mouse wheel zoom
  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      const page = cp();
      let z = page.zoom || 100;
      const delta = e.deltaY > 0 ? -5 : 5;
      z = Math.max(10, Math.min(400, z + delta));
      page.zoom = z;
      const zoom = z / 100;
      document.getElementById('miro-board').style.transform =
        `translate(${page.panX || 0}px,${page.panY || 0}px) scale(${zoom})`;
      document.getElementById('mz-slider').value = z;
      document.getElementById('mz-pct').textContent = z + '%';
      sv();
    },
    { passive: false },
  );
})();

// Zoom controls
document.getElementById('mz-slider').oninput = function () {
  const page = cp();
  page.zoom = +this.value;
  const zoom = page.zoom / 100;
  document.getElementById('miro-board').style.transform =
    `translate(${page.panX || 0}px,${page.panY || 0}px) scale(${zoom})`;
  document.getElementById('mz-pct').textContent = page.zoom + '%';
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
    } catch (e4) {}
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
