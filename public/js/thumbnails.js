/* ─── Fast Thumbnail Cache Engine ─── */

// ─── Thumbnail IndexedDB Cache (separate DB to avoid version conflicts) ───
let _thumbIdb = null;
const THUMB_IDB_NAME = 'startmine_thumbs';
const THUMB_IDB_STORE = 'thumbs';

function openThumbIDB() {
  return new Promise((resolve, reject) => {
    if (_thumbIdb) return resolve(_thumbIdb);
    const req = indexedDB.open(THUMB_IDB_NAME, 1);
    req.onupgradeneeded = () => { req.result.createObjectStore(THUMB_IDB_STORE); };
    req.onsuccess = () => { _thumbIdb = req.result; resolve(_thumbIdb); };
    req.onerror = () => reject(req.error);
  });
}

function thumbKey(url) {
  // Simple hash to create a short key from URL
  let h = 0;
  for (let i = 0; i < url.length; i++) {
    h = ((h << 5) - h + url.charCodeAt(i)) | 0;
  }
  return 'th_' + (h >>> 0).toString(36);
}

async function getCachedThumb(url) {
  try {
    const db = await openThumbIDB();
    return new Promise((resolve) => {
      const tx = db.transaction(THUMB_IDB_STORE, 'readonly');
      const req = tx.objectStore(THUMB_IDB_STORE).get(thumbKey(url));
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch (e) { return null; }
}

async function cacheThumbBlob(url, blob) {
  try {
    const db = await openThumbIDB();
    return new Promise((resolve) => {
      const tx = db.transaction(THUMB_IDB_STORE, 'readwrite');
      tx.objectStore(THUMB_IDB_STORE).put({ blob, url, ts: Date.now() }, thumbKey(url));
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  } catch (e) { return false; }
}

// Download an image URL as a blob and cache it
async function fetchAndCacheThumb(url) {
  try {
    const resp = await fetch(url, { cache: 'force-cache' });
    if (!resp.ok) return null;
    const ct = resp.headers.get('content-type') || '';
    if (!ct.startsWith('image/')) return null;
    const blob = await resp.blob();
    if (blob.size < 500) return null;
    await cacheThumbBlob(url, blob);
    return URL.createObjectURL(blob);
  } catch (e) { return null; }
}

// Load a thumbnail: try IDB cache first, then network
async function loadThumbCached(url) {
  // 1. IDB cache
  const cached = await getCachedThumb(url);
  if (cached && cached.blob) {
    return URL.createObjectURL(cached.blob);
  }
  // 2. Network → cache
  return await fetchAndCacheThumb(url);
}

const THUMB_GRADIENTS = [
  'linear-gradient(135deg,#667eea,#764ba2)',
  'linear-gradient(135deg,#f093fb,#f5576c)',
  'linear-gradient(135deg,#4facfe,#00f2fe)',
  'linear-gradient(135deg,#43e97b,#38f9d7)',
  'linear-gradient(135deg,#fa709a,#fee140)',
  'linear-gradient(135deg,#a18cd1,#fbc2eb)',
  'linear-gradient(135deg,#fccb90,#d57eeb)',
  'linear-gradient(135deg,#e0c3fc,#8ec5fc)',
  'linear-gradient(135deg,#f6d365,#fda085)',
  'linear-gradient(135deg,#96fbc4,#f9f586)',
];

function buildMiroPlaceholder(card, showSpinner) {
  const ph = document.createElement('div');
  ph.className = 'mc-placeholder';
  const letter = (card.label || card.url || 'U')[0].toUpperCase();
  const hash = (card.url || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  ph.style.background = THUMB_GRADIENTS[hash % THUMB_GRADIENTS.length];
  ph.textContent = letter;
  if (showSpinner && !card.thumbUrl) {
    const sp = document.createElement('div');
    sp.className = 'mc-ph-spinner';
    ph.appendChild(sp);
  }
  return ph;
}

// Concurrent fetch queue
const _fetchQueue = [];
let _fetchActive = 0;
const MAX_CONCURRENT = 6;

function queueCardFetch(card) {
  _fetchQueue.push(card);
  processFetchQueue();
}

function processFetchQueue() {
  while (_fetchActive < MAX_CONCURRENT && _fetchQueue.length) {
    const card = _fetchQueue.shift();
    _fetchActive++;
    fetchCardMeta(card).finally(() => {
      _fetchActive--;
      processFetchQueue();
    });
  }
}

const _fetchedThisSession = new Set();

async function fetchCardMeta(card) {
  // Skip if already fetched this session
  if (_fetchedThisSession.has(card.id)) return;
  _fetchedThisSession.add(card.id);

  // ─── IDB Cache Check: if thumbUrl exists, try loading from local cache ───
  if (card.thumbUrl) {
    const cachedBlobUrl = await loadThumbCached(card.thumbUrl);
    if (cachedBlobUrl) {
      updateCardThumbDirect(card, cachedBlobUrl);
      return;
    }
    // Cache miss but thumbUrl exists — fetch from network and cache
    fetchAndCacheThumb(card.thumbUrl).then(blobUrl => {
      if (blobUrl) updateCardThumbDirect(card, blobUrl);
    });
    return;
  }

  // Step 1: Try jsonlink.io for OG metadata + image
  let ogImage = null;
  try {
    const ctrl = new AbortController();
    const tmr = setTimeout(() => ctrl.abort(), 5000);
    const resp = await fetch(
      `https://jsonlink.io/api/extract?url=${encodeURIComponent(card.url)}`,
      { signal: ctrl.signal },
    );
    clearTimeout(tmr);
    if (resp.ok) {
      const data = await resp.json();
      if (data.images && data.images.length) ogImage = data.images[0];
      if (data.title && (!card.label || card.label === domainOf(card.url))) {
        card.label = data.title;
      }
      if (data.description) card.desc = data.description;
    }
  } catch (e) {
    /* timeout or network error */
  }

  // Update label/desc immediately if we got them
  if (card.label || card.desc) {
    sv();
    buildOutline();
    updateCardMeta(card);
  }

  // Step 2: If we got an OG image, verify it actually loads
  if (ogImage) {
    const ok = await testImageLoad(ogImage, 6000);
    if (ok) {
      card.thumbUrl = ogImage;
      sv();
      // Cache to IDB then display
      fetchAndCacheThumb(ogImage).then(blobUrl => {
        if (blobUrl) updateCardThumbDirect(card, blobUrl);
        else updateCardThumb(card);
      });
      return;
    }
  }

  // Step 3: WordPress mshots — pre-warm then poll with forced cache bypass
  const wpBase = `https://s0.wp.com/mshots/v1/${encodeURIComponent(card.url)}?w=600`;
  // Pre-warm: triggers screenshot generation on their server
  try {
    await fetch(wpBase, { mode: 'no-cors' });
  } catch (e) { }
  await delay(5000);
  // Poll: try 4 times with 3-second intervals, bypass browser cache via fetch+blob
  for (let attempt = 0; attempt < 4; attempt++) {
    const blobUrl = await fetchImageNoCache(wpBase);
    if (blobUrl) {
      card.thumbUrl = wpBase;
      sv();
      // Also cache the blob to IDB for future loads
      fetch(wpBase, { cache: 'force-cache' }).then(r => r.blob()).then(b => cacheThumbBlob(wpBase, b)).catch(() => {});
      updateCardThumbDirect(card, blobUrl);
      return;
    }
    if (attempt < 3) await delay(3000);
  }

  // Step 4: image.thum.io — same approach
  const thumBase = 'https://image.thum.io/get/width/600/' + card.url;
  try {
    await fetch(thumBase, { mode: 'no-cors' });
  } catch (e) { }
  await delay(5000);
  for (let attempt = 0; attempt < 3; attempt++) {
    const blobUrl = await fetchImageNoCache(thumBase);
    if (blobUrl) {
      card.thumbUrl = thumBase;
      sv();
      // Also cache the blob to IDB
      fetch(thumBase, { cache: 'force-cache' }).then(r => r.blob()).then(b => cacheThumbBlob(thumBase, b)).catch(() => {});
      updateCardThumbDirect(card, blobUrl);
      return;
    }
    if (attempt < 2) await delay(3000);
  }

  // All failed — remove spinner
  const spinner = document.querySelector(`.miro-card[data-cid="${card.id}"] .mc-ph-spinner`);
  if (spinner) spinner.remove();
}

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// Fetch image bypassing browser cache, return blob URL or null
async function fetchImageNoCache(url) {
  try {
    const resp = await fetch(url, { cache: 'reload' });
    if (!resp.ok) return null;
    const ct = resp.headers.get('content-type') || '';
    if (!ct.startsWith('image/')) return null;
    const blob = await resp.blob();
    if (blob.size < 1000) return null; // too small, likely placeholder
    // Create a temporary image to check dimensions
    const blobUrl = URL.createObjectURL(blob);
    const ok = await new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        // Reject WordPress placeholder (typically 400x300 or very small)
        if (img.naturalWidth === 400 && img.naturalHeight === 300) resolve(false);
        else if (img.naturalWidth <= 10) resolve(false);
        else resolve(true);
      };
      img.onerror = () => resolve(false);
      img.src = blobUrl;
    });
    if (ok) return blobUrl;
    URL.revokeObjectURL(blobUrl);
    return null;
  } catch (e) {
    return null;
  }
}

// Show a blob URL directly in the card thumbnail
function updateCardThumbDirect(card, blobUrl) {
  const el = document.querySelector(`.miro-card[data-cid="${card.id}"]`);
  if (!el) {
    URL.revokeObjectURL(blobUrl);
    return;
  }
  const thumb = el.querySelector('.mc-thumb');
  if (!thumb) {
    URL.revokeObjectURL(blobUrl);
    return;
  }
  const img = document.createElement('img');
  img.src = blobUrl;
  img.alt = card.label || '';
  img.onload = () => {
    thumb.innerHTML = '';
    thumb.appendChild(img);
  };
  img.onerror = () => URL.revokeObjectURL(blobUrl);
  updateCardMeta(card);
}

// Same as testRealScreenshot but accepts any valid image (for OG images)
function testImageLoad(url, timeout) {
  return new Promise((resolve) => {
    const img = new Image();
    const tmr = setTimeout(() => {
      img.src = '';
      resolve(false);
    }, timeout);
    img.onload = () => {
      clearTimeout(tmr);
      resolve(img.naturalWidth > 2);
    };
    img.onerror = () => {
      clearTimeout(tmr);
      resolve(false);
    };
    img.src = url;
  });
}

function updateCardMeta(card) {
  const el = document.querySelector(`.miro-card[data-cid="${card.id}"]`);
  if (!el) return;
  const titleEl = el.querySelector('.mc-title');
  if (titleEl && card.label) titleEl.textContent = card.label;
}

function updateCardThumb(card) {
  const el = document.querySelector(`.miro-card[data-cid="${card.id}"]`);
  if (!el) return;
  const thumb = el.querySelector('.mc-thumb');
  if (!thumb || !card.thumbUrl) return;

  const img = document.createElement('img');
  img.src = card.thumbUrl;
  img.alt = card.label || '';
  img.loading = 'lazy';
  img.onload = () => {
    if (img.naturalWidth <= 2) return; // WordPress mshots placeholder
    thumb.innerHTML = '';
    thumb.appendChild(img);
  };
  img.onerror = () => {
    // Remove spinner, keep placeholder
    const sp = thumb.querySelector('.mc-ph-spinner');
    if (sp) sp.remove();
  };

  // Update title in metadata
  const titleEl = el.querySelector('.mc-title');
  if (titleEl && card.label) titleEl.textContent = card.label;
}

/* ─── Global Card DragHelper ─── */
// Track which group is "opened" for individual editing (double-click to open, Esc to close)
let _openGroupId = null;

function closeOpenGroup() {
  if (_openGroupId) {
    // Remove visual indicator from open group members
    document.querySelectorAll('.miro-group-open').forEach(el => el.classList.remove('miro-group-open'));
    _openGroupId = null;
  }
}

// Esc closes the open group
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && _openGroupId) {
    closeOpenGroup();
  }
});

function miroSetupCardDrag(el, card, ignoreSelectors = ['.mc-del']) {
  // Double-click → open group for individual editing
  el.addEventListener('dblclick', (e) => {
    if (typeof findGroupOfCard !== 'function' || typeof getOutlineGroups !== 'function') return;
    const groups = getOutlineGroups();
    const group = findGroupOfCard(card.id, groups);
    if (!group) return;
    // Open this group
    _openGroupId = group.id;
    // Add visual class to all group members
    const allIds = collectGroupCardIds(group);
    allIds.forEach(cid => {
      const cardEl = document.querySelector(`[data-cid="${cid}"]`);
      if (cardEl) cardEl.classList.add('miro-group-open');
    });
  });

  el.addEventListener('mousedown', (e) => {
    // Middle mouse button: always let it bubble for panning
    if (e.button === 1) return;
    if (card.locked) return; // Prevent drag if locked
    if (e.target.contentEditable === 'true') return;
    for (const sel of ignoreSelectors) {
      if (e.target.closest(sel)) return;
    }
    if (card.type === 'grid' && e.target.closest('td') && e.target.closest('td').contentEditable === 'true') return;

    e.stopPropagation();
    if (e.ctrlKey || e.metaKey) { toggleMiroSelect(card.id); return; }

    // Group-aware selection: auto-select all group siblings unless group is "open"
    // If the card is ALREADY selected, keep the current selection (for multi-drag)
    if (!_miroSelected.has(card.id)) {
      clearMiroSelection();
      addMiroSelect(card.id);

      if (typeof findGroupOfCard === 'function' && typeof getOutlineGroups === 'function') {
        const groups = getOutlineGroups();
        const group = findGroupOfCard(card.id, groups);
        if (group && group.id !== _openGroupId) {
          // Close any previously open group
          closeOpenGroup();
          // Select ALL siblings in this group (move as unit)
          const allIds = collectGroupCardIds(group);
          allIds.forEach(cid => { if (!_miroSelected.has(cid)) addMiroSelect(cid); });
        } else if (!group) {
          // Not in any group — close any open group
          closeOpenGroup();
        }
        // If group.id === _openGroupId → group is open, only the clicked card selected (individual mode)
      }
    }
    updateMiroSelFrame();

    const page = cp();
    const zoom = (page.zoom || 100) / 100;
    const startX = e.clientX, startY = e.clientY;

    // Original positions of what we are currently dragging
    let origPositions = new Map();
    _miroSelected.forEach(cid => {
      const c = (page.miroCards || []).find(x => x.id === cid);
      if (c) origPositions.set(cid, { x: c.x || 0, y: c.y || 0 });
    });

    let moved = false;
    let hasCloned = false;

    function onMove(ev) {
      moved = true;
      const dx = (ev.clientX - startX) / zoom;
      const dy = (ev.clientY - startY) / zoom;

      // On first movement with Alt key, drop clones at the ORIGINAL starting positions.
      // We continue dragging the elements we originally clicked on, which conceptually "become" the clones.
      if (ev.altKey && !hasCloned) {
        hasCloned = true;
        const droppedClones = [];

        origPositions.forEach((orig, cid) => {
          const originalCard = (page.miroCards || []).find(x => x.id === cid);
          if (!originalCard) return;

          // Deep clone the card to leave behind
          const droppedCard = JSON.parse(JSON.stringify(originalCard));
          droppedCard.id = uid();

          // Reassign structural IDs for complex elements
          if (droppedCard.type === 'grid') {
            droppedCard.rows.forEach(r => { r.id = uid(); });
            droppedCard.cols.forEach(c => { c.id = uid(); });
          } else if (droppedCard.type === 'mindmap' && droppedCard.root) {
            const resetIds = (node) => { node.id = uid(); if (node.children) node.children.forEach(resetIds); };
            resetIds(droppedCard.root);
          }

          // Reset its coordinates to exactly where the drag started
          droppedCard.x = orig.x;
          droppedCard.y = orig.y;
          droppedClones.push(droppedCard);
        });

        // Insert the clones into the page silently (without selecting them)
        droppedClones.forEach(c => {
          page.miroCards.unshift(c); // Unshift so they render beneath the currently dragged items
        });

        // Render ONLY the cloned cards (not a full rebuild!) for performance
        const board = document.getElementById('miro-board');
        droppedClones.forEach(c => {
          try {
            let el;
            if (c.type === 'sticky') el = buildMiroSticky(c);
            else if (c.type === 'image') el = buildMiroImage(c);
            else if (c.type === 'text') el = buildMiroText(c);
            else if (c.type === 'shape') el = buildMiroShape(c);
            else if (c.type === 'pen') el = buildMiroPen(c);
            else if (c.type === 'grid') el = buildMiroGridCard(c);
            else if (c.type === 'mindmap') el = buildMiroMindMap(c);
            else if (c.type === 'trello') el = buildMiroTrello(c);
            else if (c.type === 'bwidget') el = buildMiroBookmarkWidget(c);
            else if (c.type === 'array') el = buildMiroArray(c);
            else if (c.type === 'calendar') el = buildMiroCalendar(c);
            else if (c.type === 'embed') el = buildMiroEmbed(c);
            else el = buildMiroCard(c);
            if (el) board.appendChild(el);
          } catch (err) { console.error('[CLONE RENDER]', err); }
        });
        // Defer outline rebuild to avoid blocking the drag
        setTimeout(() => { if (typeof buildOutline === 'function') buildOutline(); }, 100);

        // Important: Ensure the elements we are currently dragging remain visible on top
        origPositions.forEach((orig, cid) => {
          const cardEl = document.querySelector(`[data-cid="${cid}"]`);
          if (cardEl) cardEl.style.zIndex = '999999';
        });
      }

      // Perform the ongoing move step with smart alignment snapping
      const SNAP_THRESHOLD = 5; // px in board-space
      const snapSvg = document.getElementById('snap-guides');
      snapSvg.innerHTML = '';

      // Calculate the bounding box of all dragged items at their NEW position
      let dragMinX = Infinity, dragMinY = Infinity, dragMaxX = -Infinity, dragMaxY = -Infinity;
      origPositions.forEach((orig, cid) => {
        const c = (page.miroCards || []).find(x => x.id === cid);
        if (!c) return;
        const nx = orig.x + dx, ny = orig.y + dy;
        const w = c.w || 280, h = c.h || 240;
        dragMinX = Math.min(dragMinX, nx);
        dragMinY = Math.min(dragMinY, ny);
        dragMaxX = Math.max(dragMaxX, nx + w);
        dragMaxY = Math.max(dragMaxY, ny + h);
      });
      const dragCX = (dragMinX + dragMaxX) / 2;
      const dragCY = (dragMinY + dragMaxY) / 2;

      // Gather reference edges from all NON-dragged cards
      const refCards = [];
      (page.miroCards || []).forEach(c => {
        if (_miroSelected.has(c.id)) return;
        const x = c.x || 0, y = c.y || 0, w = c.w || 280, h = c.h || 240;
        refCards.push({ x, y, w, h, r: x + w, b: y + h, cx: x + w / 2, cy: y + h / 2 });
      });

      let snapDx = 0, snapDy = 0;
      const guides = [];

      if (!(ev.ctrlKey || ev.metaKey) && refCards.length > 0) {
        // ── Horizontal snap (X-axis) ──
        let bestXDist = SNAP_THRESHOLD + 1;
        const xEdges = [
          { val: dragMinX, label: 'l' },
          { val: dragMaxX, label: 'r' },
          { val: dragCX, label: 'cx' }
        ];
        for (const edge of xEdges) {
          for (const ref of refCards) {
            const targets = [ref.x, ref.r, ref.cx];
            for (const t of targets) {
              const dist = Math.abs(edge.val - t);
              if (dist < bestXDist) {
                bestXDist = dist;
                snapDx = t - edge.val;
                guides.push({ axis: 'v', pos: t,
                  min: Math.min(dragMinY + snapDy, ref.y) - 20,
                  max: Math.max(dragMaxY + snapDy, ref.b) + 20
                });
              }
            }
          }
        }
        if (bestXDist > SNAP_THRESHOLD) snapDx = 0;

        // ── Vertical snap (Y-axis) ──
        let bestYDist = SNAP_THRESHOLD + 1;
        const yEdges = [
          { val: dragMinY, label: 't' },
          { val: dragMaxY, label: 'b' },
          { val: dragCY, label: 'cy' }
        ];
        for (const edge of yEdges) {
          for (const ref of refCards) {
            const targets = [ref.y, ref.b, ref.cy];
            for (const t of targets) {
              const dist = Math.abs(edge.val - t);
              if (dist < bestYDist) {
                bestYDist = dist;
                snapDy = t - edge.val;
                guides.push({ axis: 'h', pos: t,
                  min: Math.min(dragMinX + snapDx, ref.x) - 20,
                  max: Math.max(dragMaxX + snapDx, ref.r) + 20
                });
              }
            }
          }
        }
        if (bestYDist > SNAP_THRESHOLD) snapDy = 0;

        // ── Equal spacing detection ──
        // Sort reference cards by x and y for spacing checks
        const sortedByX = [...refCards].sort((a, b) => a.cx - b.cx);
        const sortedByY = [...refCards].sort((a, b) => a.cy - b.cy);
        const snappedDragL = dragMinX + snapDx, snappedDragR = dragMaxX + snapDx;
        const snappedDragT = dragMinY + snapDy, snappedDragB = dragMaxY + snapDy;
        const snappedDragCX = dragCX + snapDx, snappedDragCY = dragCY + snapDy;

        // Check horizontal equal spacing
        for (let i = 0; i < sortedByX.length - 1; i++) {
          const gap = sortedByX[i + 1].x - sortedByX[i].r;
          if (gap < 5) continue;
          // Check gap from last ref to dragged or from dragged to first ref
          const gapToDragFromRight = snappedDragL - sortedByX[sortedByX.length - 1].r;
          const gapToDragFromLeft = sortedByX[0].x - snappedDragR;
          if (Math.abs(gapToDragFromRight - gap) < SNAP_THRESHOLD) {
            const correctX = sortedByX[sortedByX.length - 1].r + gap;
            snapDx += correctX - snappedDragL;
            const midY = (snappedDragCY + sortedByX[sortedByX.length - 1].cy) / 2;
            guides.push({ axis: 'spacing-h', x1: sortedByX[sortedByX.length - 1].r, x2: correctX,
              y: midY, gap: Math.round(gap) });
            break;
          }
          if (Math.abs(gapToDragFromLeft - gap) < SNAP_THRESHOLD) {
            const correctX = sortedByX[0].x - gap - (dragMaxX - dragMinX);
            snapDx += correctX - snappedDragL;
            const midY = (snappedDragCY + sortedByX[0].cy) / 2;
            guides.push({ axis: 'spacing-h', x1: correctX + (dragMaxX - dragMinX), x2: sortedByX[0].x,
              y: midY, gap: Math.round(gap) });
            break;
          }
        }

        // Check vertical equal spacing
        for (let i = 0; i < sortedByY.length - 1; i++) {
          const gap = sortedByY[i + 1].y - sortedByY[i].b;
          if (gap < 5) continue;
          const gapFromBottom = snappedDragT - sortedByY[sortedByY.length - 1].b;
          const gapFromTop = sortedByY[0].y - snappedDragB;
          if (Math.abs(gapFromBottom - gap) < SNAP_THRESHOLD) {
            const correctY = sortedByY[sortedByY.length - 1].b + gap;
            snapDy += correctY - snappedDragT;
            const midX = (snappedDragCX + sortedByY[sortedByY.length - 1].cx) / 2;
            guides.push({ axis: 'spacing-v', y1: sortedByY[sortedByY.length - 1].b, y2: correctY,
              x: midX, gap: Math.round(gap) });
            break;
          }
          if (Math.abs(gapFromTop - gap) < SNAP_THRESHOLD) {
            const correctY = sortedByY[0].y - gap - (dragMaxY - dragMinY);
            snapDy += correctY - snappedDragT;
            const midX = (snappedDragCX + sortedByY[0].cx) / 2;
            guides.push({ axis: 'spacing-v', y1: correctY + (dragMaxY - dragMinY), y2: sortedByY[0].y,
              x: midX, gap: Math.round(gap) });
            break;
          }
        }

        // ── Draw guide lines ──
        guides.forEach(g => {
          if (g.axis === 'v') {
            // Vertical guide line
            const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line.setAttribute('x1', g.pos); line.setAttribute('x2', g.pos);
            line.setAttribute('y1', g.min); line.setAttribute('y2', g.max);
            line.setAttribute('stroke', '#ff4081'); line.setAttribute('stroke-width', '0.8');
            line.setAttribute('stroke-dasharray', '4,3');
            snapSvg.appendChild(line);
          } else if (g.axis === 'h') {
            // Horizontal guide line
            const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line.setAttribute('x1', g.min); line.setAttribute('x2', g.max);
            line.setAttribute('y1', g.pos); line.setAttribute('y2', g.pos);
            line.setAttribute('stroke', '#ff4081'); line.setAttribute('stroke-width', '0.8');
            line.setAttribute('stroke-dasharray', '4,3');
            snapSvg.appendChild(line);
          } else if (g.axis === 'spacing-h') {
            // Horizontal spacing indicator
            const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line.setAttribute('x1', g.x1); line.setAttribute('x2', g.x2);
            line.setAttribute('y1', g.y); line.setAttribute('y2', g.y);
            line.setAttribute('stroke', '#2196f3'); line.setAttribute('stroke-width', '1');
            line.setAttribute('stroke-dasharray', '3,2');
            snapSvg.appendChild(line);
            // Gap label
            const txt = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            txt.setAttribute('x', (g.x1 + g.x2) / 2); txt.setAttribute('y', g.y - 6);
            txt.setAttribute('text-anchor', 'middle');
            txt.setAttribute('fill', '#2196f3'); txt.setAttribute('font-size', '10');
            txt.setAttribute('font-family', 'Inter, sans-serif');
            txt.textContent = g.gap + 'px';
            snapSvg.appendChild(txt);
          } else if (g.axis === 'spacing-v') {
            // Vertical spacing indicator
            const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line.setAttribute('x1', g.x); line.setAttribute('x2', g.x);
            line.setAttribute('y1', g.y1); line.setAttribute('y2', g.y2);
            line.setAttribute('stroke', '#2196f3'); line.setAttribute('stroke-width', '1');
            line.setAttribute('stroke-dasharray', '3,2');
            snapSvg.appendChild(line);
            const txt = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            txt.setAttribute('x', g.x + 8); txt.setAttribute('y', (g.y1 + g.y2) / 2 + 3);
            txt.setAttribute('fill', '#2196f3'); txt.setAttribute('font-size', '10');
            txt.setAttribute('font-family', 'Inter, sans-serif');
            txt.textContent = g.gap + 'px';
            snapSvg.appendChild(txt);
          }
        });
      }

      // Apply snapped position
      const finalDx = dx + snapDx;
      const finalDy = dy + snapDy;
      origPositions.forEach((orig, cid) => {
        const c = (page.miroCards || []).find(x => x.id === cid);
        if (!c) return;
        c.x = orig.x + finalDx;
        c.y = orig.y + finalDy;
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

      // Clear snap guides
      const snapSvg = document.getElementById('snap-guides');
      if (snapSvg) snapSvg.innerHTML = '';
      // Cleanup z-indexes
      origPositions.forEach((orig, cid) => {
        const cardEl = document.querySelector(`[data-cid="${cid}"]`);
        if (cardEl) cardEl.style.zIndex = '';
      });

      if (moved || hasCloned) sv();
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}

/* ─── 4-Corner Resize + Sticky Notes ─── */

function attach8WayResize(el, card, minW, minH) {
  ['br', 'bl', 'tr', 'tl', 't', 'b', 'l', 'r'].forEach((handleType) => {
    const handle = document.createElement('div');
    handle.className = 'mc-resize-' + handleType;
    handle.addEventListener('mousedown', (e) => {
      if (card.locked) return; // Prevent resize if locked
      e.stopPropagation();
      const page = cp();
      const zoom = (page.zoom || 100) / 100;
      const sx = e.clientX,
        sy = e.clientY;
      const oX = card.x || 0,
        oY = card.y || 0,
        oW = card.w || 280,
        oH = card.h || 240;
      function onMove(ev) {
        const dx = (ev.clientX - sx) / zoom;
        const dy = (ev.clientY - sy) / zoom;
        let nw = oW,
          nh = oH,
          nx = oX,
          ny = oY;

        // Corners
        if (handleType === 'br') {
          nw = oW + dx;
          nh = oH + dy;
        } else if (handleType === 'bl') {
          nw = oW - dx;
          nx = oX + dx;
          nh = oH + dy;
        } else if (handleType === 'tr') {
          nw = oW + dx;
          nh = oH - dy;
          ny = oY + dy;
        } else if (handleType === 'tl') {
          nw = oW - dx;
          nx = oX + dx;
          nh = oH - dy;
          ny = oY + dy;
        }
        // Edges
        else if (handleType === 'r') {
          nw = oW + dx;
        } else if (handleType === 'l') {
          nw = oW - dx;
          nx = oX + dx;
        } else if (handleType === 'b') {
          nh = oH + dy;
        } else if (handleType === 't') {
          nh = oH - dy;
          ny = oY + dy;
        }

        // Shift = lock aspect ratio (corners only)
        if (ev.shiftKey && ['br','bl','tr','tl'].includes(handleType)) {
          const aspect = oW / oH;
          if (Math.abs(nw - oW) / oW >= Math.abs(nh - oH) / oH) {
            // Width changed more — adjust height to match
            const newH = nw / aspect;
            if (handleType === 'tr' || handleType === 'tl') ny = oY + oH - newH;
            nh = newH;
          } else {
            // Height changed more — adjust width to match
            const newW = nh * aspect;
            if (handleType === 'bl' || handleType === 'tl') nx = oX + oW - newW;
            nw = newW;
          }
        }

        // Enforce min size
        const cMinW = typeof minW === 'function' ? minW() : minW;
        if (nw < cMinW) {
          if (handleType === 'bl' || handleType === 'tl' || handleType === 'l') nx = oX + oW - cMinW;
          nw = cMinW;
        }

        // Apply width first so that minH() can compute the wrapped height correctly
        el.style.width = nw + 'px';
        card.w = nw;

        const cMinH = typeof minH === 'function' ? minH() : minH;
        if (nh < cMinH) {
          if (handleType === 'tr' || handleType === 'tl' || handleType === 't') ny = oY + oH - cMinH;
          nh = cMinH;
        }

        card.x = nx;
        card.y = ny;
        card.h = nh;
        el.style.left = nx + 'px';
        el.style.top = ny + 'px';
        el.style.height = nh + 'px';

        // Auto-size text for sticky notes (only in auto mode)
        const textEl = el.querySelector('.ms-text');
        if (textEl && card.fontSizeMode === 'auto') autoSizeText(textEl, el);
        updateMiroSelFrame();
      }
      function onUp() {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        // Auto-fit height for text widgets after resize (both grow AND shrink)
        const mtText = el.querySelector('.mt-text');
        if (mtText) {
          const sh = mtText.scrollHeight + 8;
          const fitH = Math.max(sh, 30);
          card.h = fitH;
          el.style.height = fitH + 'px';
          el.style.minHeight = fitH + 'px';
        }
        sv();
      }
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
    el.appendChild(handle);
  });
}

/* ─── Lock Feature UI ─── */
function attachLockUI(el, card) {
  const btn = document.createElement('button');
  btn.className = 'mc-lock';
  btn.title = card.locked ? 'Hold to unlock' : 'Lock element';

  // Progress bar for long press
  const progress = document.createElement('div');
  progress.className = 'lock-progress';
  btn.appendChild(progress);

  // Lock Icon (using text for simplicity, or SVG could be used if preferred)
  const icon = document.createElement('span');
  icon.textContent = '🔒';
  btn.appendChild(icon);

  // Apply initial state
  if (card.locked) {
    el.classList.add('is-locked');
  } else {
    el.classList.remove('is-locked');
  }

  let pressTimer = null;
  let animFrame = null;
  let startTime = 0;
  let justUnlocked = false;
  const HOLD_DURATION = 500; // 0.5 seconds

  const startHold = (e) => {
    e.stopPropagation();
    if (e.button !== undefined && e.button !== 0) return; // Only left click

    if (!card.locked) {
      // If unlocked, a simple mousedown is enough to lock it (handled in click/mouseup, or here for instant feedback)
      return;
    }

    // If locked, start the timer
    startTime = performance.now();
    btn.classList.add('active');

    const updateProgress = (currentTime) => {
      const elapsed = currentTime - startTime;
      let pct = Math.min((elapsed / HOLD_DURATION) * 100, 100);
      progress.style.width = `${pct}%`;

      if (elapsed < HOLD_DURATION) {
        animFrame = requestAnimationFrame(updateProgress);
      }
    };
    animFrame = requestAnimationFrame(updateProgress);

    pressTimer = setTimeout(() => {
      // Completed hold
      progress.style.width = '0%';
      card.locked = false;
      el.classList.remove('is-locked');
      btn.title = 'Lock element';
      justUnlocked = true; // Prevent the subsequent click event from relocking
      sv();
    }, HOLD_DURATION);
  };

  const cancelHold = (e) => {
    if (e) e.stopPropagation();
    if (pressTimer) {
      clearTimeout(pressTimer);
      pressTimer = null;
    }
    if (animFrame) {
      cancelAnimationFrame(animFrame);
      animFrame = null;
    }
    progress.style.width = '0%';
    btn.classList.remove('active');
  };

  const onClick = (e) => {
    e.stopPropagation();
    if (justUnlocked) {
      // It was just unlocked by a long press, ignore this click
      justUnlocked = false;
      return;
    }
    if (!card.locked) {
      // Lock it
      card.locked = true;
      el.classList.add('is-locked');
      btn.title = 'Hold to unlock';
      clearMiroSelection();
      sv();
    }
  };

  // Prevent drag helper from firing when interacting with lock button
  btn.addEventListener('mousedown', startHold);
  btn.addEventListener('touchstart', startHold, { passive: false });

  btn.addEventListener('mouseup', cancelHold);
  btn.addEventListener('mouseleave', cancelHold);
  btn.addEventListener('touchend', cancelHold);

  btn.addEventListener('click', onClick);

  el.appendChild(btn);

  // ─── Pin/Unpin Button (bottom-right, separate from lock at top-left) ───
  const pinBtn = document.createElement('button');
  pinBtn.className = 'mc-pin';
  pinBtn.style.cssText = 'position:absolute;bottom:4px;right:4px;z-index:9;background:rgba(0,0,0,.55);border:none;width:22px;height:22px;border-radius:6px;display:flex;align-items:center;justify-content:center;color:#fff;cursor:pointer;font-size:0.7rem;opacity:0;transition:opacity .12s;';
  pinBtn.title = card.pinned ? 'Unpin from screen' : 'Pin to screen';
  const pinIcon = document.createElement('span');
  pinIcon.textContent = card.pinned ? '📌' : '📍';
  pinBtn.appendChild(pinIcon);

  // Pin indicator badge
  let pinBadge = null;
  function showPinBadge() {
    if (pinBadge) return;
    pinBadge = document.createElement('div');
    pinBadge.className = 'miro-pinned-indicator';
    pinBadge.textContent = '📌 Pinned';
    el.appendChild(pinBadge);
  }
  function hidePinBadge() {
    if (pinBadge) { pinBadge.remove(); pinBadge = null; }
  }

  function pinElement() {
    const pinnedLayer = document.getElementById('miro-pinned-layer');
    if (!pinnedLayer) return;
    // Save original canvas position & size for restore on unpin
    card._savedX = card.x;
    card._savedY = card.y;
    card._savedW = card.w;
    card._savedH = card.h;
    // Get EXACT screen-rendered position & size (includes zoom effect)
    const rect = el.getBoundingClientRect();
    card.pinned = true;
    card._pinScreenX = rect.left;
    card._pinScreenY = rect.top;
    card._pinScreenW = rect.width;
    card._pinScreenH = rect.height;
    // Move to pinned layer — set BOTH position AND size to screen values
    // This ensures ZERO visual change
    pinnedLayer.appendChild(el);
    el.style.position = 'fixed';
    el.style.left = rect.left + 'px';
    el.style.top = rect.top + 'px';
    el.style.width = rect.width + 'px';
    el.style.height = rect.height + 'px';
    pinIcon.textContent = '📌';
    pinBtn.title = 'Unpin from screen';
    pinBtn.style.background = 'rgba(255,107,53,.6)';
    pinBtn.style.opacity = '1';
    showPinBadge();
    sv();
    if (typeof showToast === 'function') showToast('📌 Pinned');
  }

  function unpinElement() {
    const board = document.getElementById('miro-board');
    if (!board) return;
    // Restore EXACT original canvas position & size
    const origX = card._savedX != null ? card._savedX : (card.x || 0);
    const origY = card._savedY != null ? card._savedY : (card.y || 0);
    const origW = card._savedW != null ? card._savedW : (card.w || 200);
    const origH = card._savedH != null ? card._savedH : (card.h || 150);
    card.pinned = false;
    card.x = origX;
    card.y = origY;
    card.w = origW;
    card.h = origH;
    delete card._pinScreenX;
    delete card._pinScreenY;
    delete card._pinScreenW;
    delete card._pinScreenH;
    delete card._savedX;
    delete card._savedY;
    delete card._savedW;
    delete card._savedH;
    // Move back to board at original canvas coords & size
    board.appendChild(el);
    el.style.position = 'absolute';
    el.style.left = origX + 'px';
    el.style.top = origY + 'px';
    el.style.width = origW + 'px';
    el.style.height = origH + 'px';
    pinIcon.textContent = '📍';
    pinBtn.title = 'Pin to screen';
    pinBtn.style.background = 'rgba(0,0,0,.55)';
    pinBtn.style.opacity = '0';
    hidePinBadge();
    sv();
    if (typeof showToast === 'function') showToast('📍 Unpinned');
  }

  // Store toggle function on el for global access
  el._togglePin = () => {
    if (card.pinned) unpinElement();
    else pinElement();
  };

  pinBtn.addEventListener('mousedown', e => e.stopPropagation());
  pinBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    el._togglePin();
  });

  el.appendChild(pinBtn);

  // Show pin button on hover (like lock button)
  el.addEventListener('mouseenter', () => { pinBtn.style.opacity = '1'; });
  el.addEventListener('mouseleave', () => { if (!card.pinned) pinBtn.style.opacity = '0'; });
  // If already pinned, keep it visible
  if (card.pinned) pinBtn.style.opacity = '1';

  // If card was saved as pinned, re-apply on load
  if (card.pinned) {
    requestAnimationFrame(() => {
      const pinnedLayer = document.getElementById('miro-pinned-layer');
      if (pinnedLayer) {
        pinnedLayer.appendChild(el);
        el.style.position = 'fixed';
        el.style.left = (card._pinScreenX || 100) + 'px';
        el.style.top = (card._pinScreenY || 100) + 'px';
        el.style.width = (card._pinScreenW || card.w || 200) + 'px';
        el.style.height = (card._pinScreenH || card.h || 150) + 'px';
        pinBtn.style.background = 'rgba(255,107,53,.6)';
        showPinBadge();
      }
    });
  }
}

// ─── Global Pin Toggle (called from context menu) ───
function togglePinElement(cid) {
  // Find the DOM element by card ID
  const el = document.querySelector(`[data-cid="${cid}"]`);
  if (el && el._togglePin) {
    el._togglePin();
  }
}

function buildMiroSticky(card) {
  const el = document.createElement('div');
  el.className = 'miro-sticky sn-' + (card.color || 'yellow');
  el.dataset.cid = card.id;
  el.style.left = (card.x || 0) + 'px';
  el.style.top = (card.y || 0) + 'px';
  el.style.width = (card.w || 280) + 'px';
  el.style.height = (card.h || 160) + 'px';
  if (card.bgHex) {
    el.style.backgroundColor = card.bgHex;
  }
  // Initialize fontSizeMode if not set
  if (card.fontSizeMode === undefined) card.fontSizeMode = 'auto';

  // Delete button
  const del = document.createElement('button');
  del.className = 'mc-del';
  del.textContent = '✕';
  del.onclick = (e) => {
    e.stopPropagation();
    deleteMiroCard(card.id);
  };

  // ─── Unified Toolbar (merged color + size + rich text) ───
  const toolbar = document.createElement('div');
  toolbar.className = 'sn-toolbar';

  // Helper to restore selection inside contentEditable after clicking toolbar buttons
  let _savedRange = null;
  function saveSelection() {
    const sel = window.getSelection();
    if (sel.rangeCount > 0 && text.contains(sel.anchorNode)) {
      _savedRange = sel.getRangeAt(0).cloneRange();
    }
  }
  function restoreSelection() {
    if (_savedRange) {
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(_savedRange);
    }
  }

  // ── Color dropdown button ──
  const colorBtnWrap = document.createElement('div');
  colorBtnWrap.className = 'sn-color-dropdown';
  const colorBtn = document.createElement('button');
  colorBtn.className = 'sn-tb-color-btn';
  colorBtn.title = 'Note Color';
  const snColorHex = {
    yellow: '#f9e96b', pink: '#f4a4c0', green: '#a6d89b', blue: '#84c6e8',
    purple: '#c9a6e8', orange: '#f5b971', red: '#ff6b6b', cyan: '#66d9e8',
    white: '#f1f3f5', gray: '#adb5bd', dark: '#495057', magenta: '#e64980',
  };
  const colorDot = document.createElement('span');
  colorDot.className = 'sn-color-dot';
  colorDot.style.background = snColorHex[card.color] || snColorHex.yellow;
  colorBtn.appendChild(colorDot);
  colorBtn.onmousedown = (e) => { e.preventDefault(); };
  colorBtn.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    colorPopup.classList.toggle('show');
  };
  // Color popup
  const colorPopup = document.createElement('div');
  colorPopup.className = 'sn-color-popup';

  // Row 1: RGB & CMYK
  const row1Label = document.createElement('div');
  row1Label.className = 'sn-cpop-label';
  row1Label.textContent = 'RGB / CMYK';
  colorPopup.appendChild(row1Label);
  const row1 = document.createElement('div');
  row1.className = 'sn-cpop-row';
  const rgbCmykColors = [
    { name: 'Red', hex: '#ff0000' }, { name: 'Green', hex: '#00ff00' }, { name: 'Blue', hex: '#0000ff' },
    { name: 'Cyan', hex: '#00ffff' }, { name: 'Magenta', hex: '#ff00ff' }, { name: 'Yellow', hex: '#ffff00' },
  ];
  rgbCmykColors.forEach(c => {
    const dot = document.createElement('div');
    dot.className = 'sn-cpop-color';
    dot.style.background = c.hex;
    dot.title = c.name;
    dot.onclick = (ev) => {
      ev.stopPropagation();
      card.color = null;
      card.bgHex = c.hex;
      el.className = 'miro-sticky' + (el.classList.contains('miro-selected') ? ' miro-selected' : '');
      el.style.backgroundColor = c.hex;
      colorDot.style.background = c.hex;
      colorPopup.classList.remove('show');
      // Propagate custom color to all other selected stickies
      if (typeof _miroSelected !== 'undefined') {
        const page = cp();
        _miroSelected.forEach(cid => {
          if (cid === card.id) return;
          const sc = (page.miroCards || []).find(x => x.id === cid);
          if (sc && sc.type === 'sticky') {
            sc.color = null; sc.bgHex = c.hex;
            const sEl = document.querySelector(`[data-cid="${cid}"]`);
            if (sEl) {
              sEl.className = 'miro-sticky' + (sEl.classList.contains('miro-selected') ? ' miro-selected' : '');
              sEl.style.backgroundColor = c.hex;
            }
          }
        });
      }
      sv();
    };
    row1.appendChild(dot);
  });
  colorPopup.appendChild(row1);

  // Row 2: Miro preset colors
  const row2Label = document.createElement('div');
  row2Label.className = 'sn-cpop-label';
  row2Label.textContent = 'Miro Colors';
  colorPopup.appendChild(row2Label);
  const row2 = document.createElement('div');
  row2.className = 'sn-cpop-row';
  const miroColors = ['yellow', 'pink', 'green', 'blue', 'purple', 'orange', 'red', 'cyan', 'white', 'gray', 'dark', 'magenta'];
  miroColors.forEach(c => {
    const dot = document.createElement('div');
    dot.className = 'sn-cpop-color' + (c === card.color ? ' sel' : '');
    dot.style.background = snColorHex[c];
    dot.title = c.charAt(0).toUpperCase() + c.slice(1);
    dot.onclick = (ev) => {
      ev.stopPropagation();
      card.color = c;
      card.bgHex = null;
      el.style.backgroundColor = '';
      el.className = 'miro-sticky sn-' + c + (el.classList.contains('miro-selected') ? ' miro-selected' : '');
      colorDot.style.background = snColorHex[c];
      colorPopup.querySelectorAll('.sn-cpop-color').forEach(d => d.classList.remove('sel'));
      dot.classList.add('sel');
      colorPopup.classList.remove('show');
      // Propagate color to all other selected stickies
      if (typeof _miroSelected !== 'undefined') {
        const page = cp();
        _miroSelected.forEach(cid => {
          if (cid === card.id) return;
          const sc = (page.miroCards || []).find(x => x.id === cid);
          if (sc && sc.type === 'sticky') {
            sc.color = c; sc.bgHex = null;
            const sEl = document.querySelector(`[data-cid="${cid}"]`);
            if (sEl) {
              sEl.style.backgroundColor = '';
              sEl.className = 'miro-sticky sn-' + c + (sEl.classList.contains('miro-selected') ? ' miro-selected' : '');
            }
          }
        });
      }
      sv();
    };
    row2.appendChild(dot);
  });
  colorPopup.appendChild(row2);

  colorBtnWrap.appendChild(colorBtn);
  colorBtnWrap.appendChild(colorPopup);
  toolbar.appendChild(colorBtnWrap);

  // Close color popup when clicking outside
  document.addEventListener('click', (e) => {
    if (!colorBtnWrap.contains(e.target)) {
      colorPopup.classList.remove('show');
    }
  });

  // ── Separator ──
  const sepA = document.createElement('div');
  sepA.className = 'sn-tb-sep';
  toolbar.appendChild(sepA);

  // ── Size buttons (S, M, L) ──
  const sizes = { S: { w: 140, h: 80 }, M: { w: 280, h: 160 }, L: { w: 420, h: 240 } };
  Object.entries(sizes).forEach(([label, sz]) => {
    const btn = document.createElement('button');
    btn.className = 'sn-tb-size';
    btn.textContent = label;
    if (Math.abs((card.w || 280) - sz.w) < 30 && Math.abs((card.h || 160) - sz.h) < 30)
      btn.classList.add('sel');
    btn.onclick = (ev) => {
      ev.stopPropagation();
      card.w = sz.w;
      card.h = sz.h;
      el.style.width = sz.w + 'px';
      el.style.height = sz.h + 'px';
      toolbar.querySelectorAll('.sn-tb-size').forEach((b) => b.classList.remove('sel'));
      btn.classList.add('sel');
      if (card.fontSizeMode === 'auto') autoSizeText(text, el);
      // Propagate size to all other selected stickies
      if (typeof _miroSelected !== 'undefined') {
        const page = cp();
        _miroSelected.forEach(cid => {
          if (cid === card.id) return;
          const sc = (page.miroCards || []).find(c => c.id === cid);
          if (sc && sc.type === 'sticky') {
            sc.w = sz.w; sc.h = sz.h;
            const sEl = document.querySelector(`[data-cid="${cid}"]`);
            if (sEl) {
              sEl.style.width = sz.w + 'px'; sEl.style.height = sz.h + 'px';
              if (sc.fontSizeMode === 'auto') {
                const sTxt = sEl.querySelector('.ms-text');
                if (sTxt) autoSizeText(sTxt, sEl);
              }
            }
          }
        });
      }
      updateMiroSelFrame();
      sv();
    };
    toolbar.appendChild(btn);
  });

  // ── Separator ──
  const sepB = document.createElement('div');
  sepB.className = 'sn-tb-sep';
  toolbar.appendChild(sepB);

  // ── Format button helper ──
  function mkFmtBtn(label, title, cmd, cssClass) {
    const b = document.createElement('button');
    b.className = 'sn-rb-btn' + (cssClass ? ' ' + cssClass : '');
    b.innerHTML = label;
    b.title = title;
    b.onmousedown = (e) => { e.preventDefault(); saveSelection(); };
    b.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      restoreSelection();
      document.execCommand(cmd, false, null);
      card.text = text.innerHTML;
      sv();
    };
    return b;
  }

  // Bold, Italic, Underline, Strikethrough
  toolbar.appendChild(mkFmtBtn('<b>B</b>', 'Bold (Ctrl+B)', 'bold'));
  toolbar.appendChild(mkFmtBtn('<i>I</i>', 'Italic (Ctrl+I)', 'italic'));
  toolbar.appendChild(mkFmtBtn('<u>U</u>', 'Underline (Ctrl+U)', 'underline'));
  toolbar.appendChild(mkFmtBtn('<s>S</s>', 'Strikethrough', 'strikeThrough'));

  // ── Separator ──
  const sepC = document.createElement('div');
  sepC.className = 'sn-tb-sep';
  toolbar.appendChild(sepC);

  // ── Alignment dropdown button ──
  const alignWrap = document.createElement('div');
  alignWrap.className = 'sn-color-dropdown';
  const alignBtn = document.createElement('button');
  alignBtn.className = 'sn-rb-btn';
  alignBtn.title = 'Alignment';
  alignBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 14 14"><line x1="1" y1="2" x2="13" y2="2" stroke="currentColor" stroke-width="1.5"/><line x1="1" y1="7" x2="9" y2="7" stroke="currentColor" stroke-width="1.5"/><line x1="1" y1="12" x2="11" y2="12" stroke="currentColor" stroke-width="1.5"/></svg>';
  alignBtn.onmousedown = (e) => { e.preventDefault(); saveSelection(); };
  alignBtn.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    alignPopup.classList.toggle('show');
  };
  const alignPopup = document.createElement('div');
  alignPopup.className = 'sn-color-popup sn-align-popup';

  // Horizontal alignment row
  const hLabel = document.createElement('div');
  hLabel.className = 'sn-cpop-label';
  hLabel.textContent = 'Horizontal';
  alignPopup.appendChild(hLabel);
  const hRow = document.createElement('div');
  hRow.className = 'sn-cpop-row';
  const hAligns = [
    { icon: '<svg width="16" height="16" viewBox="0 0 16 16"><line x1="2" y1="3" x2="14" y2="3" stroke="currentColor" stroke-width="1.5"/><line x1="2" y1="8" x2="10" y2="8" stroke="currentColor" stroke-width="1.5"/><line x1="2" y1="13" x2="12" y2="13" stroke="currentColor" stroke-width="1.5"/></svg>', title: 'Align Left', cmd: 'justifyLeft' },
    { icon: '<svg width="16" height="16" viewBox="0 0 16 16"><line x1="1" y1="3" x2="15" y2="3" stroke="currentColor" stroke-width="1.5"/><line x1="3" y1="8" x2="13" y2="8" stroke="currentColor" stroke-width="1.5"/><line x1="2" y1="13" x2="14" y2="13" stroke="currentColor" stroke-width="1.5"/></svg>', title: 'Align Center', cmd: 'justifyCenter' },
    { icon: '<svg width="16" height="16" viewBox="0 0 16 16"><line x1="2" y1="3" x2="14" y2="3" stroke="currentColor" stroke-width="1.5"/><line x1="6" y1="8" x2="14" y2="8" stroke="currentColor" stroke-width="1.5"/><line x1="4" y1="13" x2="14" y2="13" stroke="currentColor" stroke-width="1.5"/></svg>', title: 'Align Right', cmd: 'justifyRight' },
  ];
  hAligns.forEach(a => {
    const b = document.createElement('button');
    b.className = 'sn-rb-btn';
    b.innerHTML = a.icon;
    b.title = a.title;
    b.onmousedown = (e) => { e.preventDefault(); saveSelection(); };
    b.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      restoreSelection();
      document.execCommand(a.cmd, false, null);
      card.text = text.innerHTML;
      sv();
    };
    hRow.appendChild(b);
  });
  alignPopup.appendChild(hRow);

  // Vertical alignment row
  const vLabel = document.createElement('div');
  vLabel.className = 'sn-cpop-label';
  vLabel.textContent = 'Vertical';
  alignPopup.appendChild(vLabel);
  const vRow = document.createElement('div');
  vRow.className = 'sn-cpop-row';
  const vAligns = [
    { icon: '<svg width="16" height="16" viewBox="0 0 16 16"><line x1="2" y1="2" x2="14" y2="2" stroke="currentColor" stroke-width="2"/><rect x="5" y="4" width="6" height="5" rx="1" fill="currentColor" opacity=".5"/></svg>', title: 'Align Top', value: 'flex-start' },
    { icon: '<svg width="16" height="16" viewBox="0 0 16 16"><rect x="5" y="5" width="6" height="6" rx="1" fill="currentColor" opacity=".5"/><line x1="2" y1="8" x2="4" y2="8" stroke="currentColor" stroke-width="1"/><line x1="12" y1="8" x2="14" y2="8" stroke="currentColor" stroke-width="1"/></svg>', title: 'Align Middle', value: 'center' },
    { icon: '<svg width="16" height="16" viewBox="0 0 16 16"><line x1="2" y1="14" x2="14" y2="14" stroke="currentColor" stroke-width="2"/><rect x="5" y="7" width="6" height="5" rx="1" fill="currentColor" opacity=".5"/></svg>', title: 'Align Bottom', value: 'flex-end' },
  ];
  vAligns.forEach(a => {
    const b = document.createElement('button');
    b.className = 'sn-rb-btn';
    b.innerHTML = a.icon;
    b.title = a.title;
    b.onmousedown = (e) => { e.preventDefault(); };
    b.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      card.valign = a.value;
      text.style.justifyContent = a.value;
      el.style.display = 'flex';
      el.style.flexDirection = 'column';
      text.style.display = 'flex';
      text.style.flexDirection = 'column';
      text.style.justifyContent = a.value;
      sv();
    };
    vRow.appendChild(b);
  });
  alignPopup.appendChild(vRow);

  alignWrap.appendChild(alignBtn);
  alignWrap.appendChild(alignPopup);
  toolbar.appendChild(alignWrap);

  // Close align popup when clicking outside
  document.addEventListener('click', (e) => {
    if (!alignWrap.contains(e.target)) {
      alignPopup.classList.remove('show');
    }
  });

  // ── Separator ──
  const sepD = document.createElement('div');
  sepD.className = 'sn-tb-sep';
  toolbar.appendChild(sepD);

  // ── Link button ──
  const linkBtn = document.createElement('button');
  linkBtn.className = 'sn-rb-btn';
  linkBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 14 14"><path d="M6 8a3 3 0 004 .5l2-2a3 3 0 00-4.24-4.24L6.5 3.5" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><path d="M8 6a3 3 0 00-4-.5l-2 2a3 3 0 004.24 4.24L7.5 10.5" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>';
  linkBtn.title = 'Insert Link';
  linkBtn.onmousedown = (e) => { e.preventDefault(); saveSelection(); };
  linkBtn.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    restoreSelection();
    const url = prompt('Enter URL:');
    if (url) {
      document.execCommand('createLink', false, url);
      text.querySelectorAll('a').forEach(a => {
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
      });
      card.text = text.innerHTML;
      sv();
    }
  };
  toolbar.appendChild(linkBtn);

  // ── Separator ──
  const sepE = document.createElement('div');
  sepE.className = 'sn-tb-sep';
  toolbar.appendChild(sepE);

  // ── Font size control ──
  const fsWrap = document.createElement('div');
  fsWrap.className = 'sn-rb-fs-wrap';
  const fsSelect = document.createElement('select');
  fsSelect.className = 'sn-rb-fs';
  fsSelect.title = 'Font Size';
  const fsSizes = ['Auto', '8', '10', '12', '14', '18', '24', '32', '48', '64', '72'];
  fsSizes.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s === 'Auto' ? 'auto' : s;
    opt.textContent = s;
    if (s === 'Auto' && card.fontSizeMode === 'auto') opt.selected = true;
    else if (s !== 'Auto' && card.fontSizeMode !== 'auto' && +s === +card.fontSizeMode) opt.selected = true;
    fsSelect.appendChild(opt);
  });
  fsSelect.onmousedown = (e) => { saveSelection(); };
  fsSelect.onchange = (e) => {
    e.stopPropagation();
    const val = fsSelect.value;
    if (val === 'auto') {
      card.fontSizeMode = 'auto';
      autoSizeText(text, el);
      card.text = text.innerHTML;
      // Also apply to all other selected sticky notes
      if (typeof _miroSelected !== 'undefined') {
        const page = cp();
        _miroSelected.forEach(cid => {
          if (cid === card.id) return;
          const sc = (page.miroCards || []).find(c => c.id === cid);
          if (sc && sc.type === 'sticky') {
            sc.fontSizeMode = 'auto';
            const sEl = document.querySelector(`[data-cid="${cid}"]`);
            if (sEl) {
              const sTxt = sEl.querySelector('.ms-text');
              if (sTxt) { autoSizeText(sTxt, sEl); sc.text = sTxt.innerHTML; }
            }
          }
        });
      }
    } else {
      card.fontSizeMode = +val;
      restoreSelection();
      const sel = window.getSelection();
      if (sel.rangeCount > 0 && !sel.isCollapsed && text.contains(sel.anchorNode)) {
        document.execCommand('fontSize', false, '7');
        text.querySelectorAll('font[size="7"]').forEach(f => {
          const span = document.createElement('span');
          span.style.fontSize = val + 'px';
          span.innerHTML = f.innerHTML;
          f.replaceWith(span);
        });
      } else {
        text.style.fontSize = val + 'px';
      }
      // Propagate fixed font size to all other selected stickies
      if (typeof _miroSelected !== 'undefined') {
        const page = cp();
        _miroSelected.forEach(cid => {
          if (cid === card.id) return;
          const sc = (page.miroCards || []).find(c => c.id === cid);
          if (sc && sc.type === 'sticky') {
            sc.fontSizeMode = +val;
            const sEl = document.querySelector(`[data-cid="${cid}"]`);
            if (sEl) {
              const sTxt = sEl.querySelector('.ms-text');
              if (sTxt) { sTxt.style.fontSize = val + 'px'; sc.text = sTxt.innerHTML; }
            }
          }
        });
      }
    }
    card.text = text.innerHTML;
    sv();
  };
  fsWrap.appendChild(fsSelect);
  toolbar.appendChild(fsWrap);

  // ── Separator ──
  const sepF = document.createElement('div');
  sepF.className = 'sn-tb-sep';
  toolbar.appendChild(sepF);

  // ── Text color picker ──
  const tcLabel = document.createElement('label');
  tcLabel.className = 'sn-rb-color-wrap';
  tcLabel.title = 'Text Color';
  const tcIcon = document.createElement('span');
  tcIcon.className = 'sn-rb-color-icon';
  tcIcon.textContent = 'A';
  const tcInput = document.createElement('input');
  tcInput.type = 'color';
  tcInput.className = 'sn-rb-color-input';
  tcInput.value = '#000000';
  tcInput.onmousedown = (e) => { saveSelection(); };
  tcInput.oninput = (e) => {
    e.stopPropagation();
    restoreSelection();
    document.execCommand('foreColor', false, tcInput.value);
    tcIcon.style.borderBottomColor = tcInput.value;
    card.text = text.innerHTML;
    sv();
  };
  tcLabel.appendChild(tcIcon);
  tcLabel.appendChild(tcInput);
  toolbar.appendChild(tcLabel);

  // ── Separator ──
  const sepFontFam = document.createElement('div');
  sepFontFam.className = 'sn-tb-sep';
  toolbar.appendChild(sepFontFam);

  // ── Font Family selector ──
  const snFontWrap = document.createElement('div');
  snFontWrap.className = 'sn-rb-fs-wrap';
  const snFontSelect = document.createElement('select');
  snFontSelect.className = 'sn-rb-fs';
  snFontSelect.title = 'Font Family';
  snFontSelect.style.maxWidth = '90px';
  const _snFonts = ['Default', 'Inter', 'DM Sans', 'Georgia', 'Courier New', 'serif', 'KFGQPC Uthmanic Script HAFS'];
  _snFonts.forEach(f => {
    const opt = document.createElement('option');
    opt.value = f === 'Default' ? '' : f;
    opt.textContent = f === 'KFGQPC Uthmanic Script HAFS' ? 'KFGQPC Uthmanic' : f;
    opt.style.fontFamily = f === 'Default' ? 'inherit' : f;
    if ((card.fontFamily || '') === (f === 'Default' ? '' : f)) opt.selected = true;
    snFontSelect.appendChild(opt);
  });
  snFontSelect.onmousedown = () => { saveSelection(); };
  snFontSelect.onchange = (e) => {
    e.stopPropagation();
    card.fontFamily = snFontSelect.value;
    restoreSelection();
    if (snFontSelect.value) {
      const sel = window.getSelection();
      if (sel.rangeCount > 0 && !sel.isCollapsed && text.contains(sel.anchorNode)) {
        document.execCommand('fontName', false, snFontSelect.value);
      } else {
        text.style.fontFamily = snFontSelect.value;
      }
    } else {
      text.style.fontFamily = '';
    }
    card.text = text.innerHTML;
    sv();
  };
  snFontWrap.appendChild(snFontSelect);
  toolbar.appendChild(snFontWrap);

  // ── Separator ──
  const sepG = document.createElement('div');
  sepG.className = 'sn-tb-sep';
  toolbar.appendChild(sepG);

  // ── Copy Style button ──
  const copyStyleBtn = document.createElement('button');
  copyStyleBtn.className = 'sn-rb-btn';
  copyStyleBtn.title = 'Copy Style';
  copyStyleBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 14 14"><rect x="1" y="1" width="8" height="8" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M5 5h7a1 1 0 011 1v6a1 1 0 01-1 1H6a1 1 0 01-1-1V5z" fill="none" stroke="currentColor" stroke-width="1.3"/><line x1="7" y1="8" x2="11" y2="8" stroke="currentColor" stroke-width="1"/><line x1="7" y1="10" x2="10" y2="10" stroke="currentColor" stroke-width="1"/></svg>';
  copyStyleBtn.onmousedown = (e) => { e.preventDefault(); };
  copyStyleBtn.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    window._stickyStyleClipboard = {
      color: card.color,
      bgHex: card.bgHex,
      fontSizeMode: card.fontSizeMode,
      valign: card.valign,
    };
    copyStyleBtn.innerHTML = '✓';
    setTimeout(() => {
      copyStyleBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 14 14"><rect x="1" y="1" width="8" height="8" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M5 5h7a1 1 0 011 1v6a1 1 0 01-1 1H6a1 1 0 01-1-1V5z" fill="none" stroke="currentColor" stroke-width="1.3"/><line x1="7" y1="8" x2="11" y2="8" stroke="currentColor" stroke-width="1"/><line x1="7" y1="10" x2="10" y2="10" stroke="currentColor" stroke-width="1"/></svg>';
    }, 800);
  };
  toolbar.appendChild(copyStyleBtn);

  // ── Paste Style button ──
  const pasteStyleBtn = document.createElement('button');
  pasteStyleBtn.className = 'sn-rb-btn';
  pasteStyleBtn.title = 'Paste Style';
  pasteStyleBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 14 14"><rect x="3" y="1" width="8" height="12" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.3"/><rect x="5" y="0" width="4" height="2" rx="0.5" fill="currentColor" opacity=".6"/><line x1="5" y1="5" x2="9" y2="5" stroke="currentColor" stroke-width="1"/><line x1="5" y1="7.5" x2="9" y2="7.5" stroke="currentColor" stroke-width="1"/><line x1="5" y1="10" x2="8" y2="10" stroke="currentColor" stroke-width="1"/></svg>';
  pasteStyleBtn.onmousedown = (e) => { e.preventDefault(); };
  pasteStyleBtn.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const st = window._stickyStyleClipboard;
    if (!st) return;
    if (st.bgHex) {
      card.color = null;
      card.bgHex = st.bgHex;
      el.style.backgroundColor = st.bgHex;
      el.className = 'miro-sticky' + (el.classList.contains('miro-selected') ? ' miro-selected' : '');
      colorDot.style.background = st.bgHex;
    } else if (st.color) {
      card.color = st.color;
      card.bgHex = null;
      el.style.backgroundColor = '';
      el.className = 'miro-sticky sn-' + st.color + (el.classList.contains('miro-selected') ? ' miro-selected' : '');
      colorDot.style.background = snColorHex[st.color] || snColorHex.yellow;
    }
    if (st.fontSizeMode !== undefined) card.fontSizeMode = st.fontSizeMode;
    if (st.valign) {
      card.valign = st.valign;
      text.style.display = 'flex';
      text.style.flexDirection = 'column';
      text.style.justifyContent = st.valign;
    }
    sv(); buildMiroCanvas(); buildOutline();
  };
  toolbar.appendChild(pasteStyleBtn);

  // ── Separator ──
  const sepH = document.createElement('div');
  sepH.className = 'sn-tb-sep';
  toolbar.appendChild(sepH);

  // ── Duplicate button ──
  const dupBtn = document.createElement('button');
  dupBtn.className = 'sn-rb-btn';
  dupBtn.title = 'Duplicate';
  dupBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 14 14"><rect x="1" y="3" width="8" height="8" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.3"/><rect x="5" y="1" width="8" height="8" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>';
  dupBtn.onmousedown = (e) => { e.preventDefault(); };
  dupBtn.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const page = cp();
    if (!page.miroCards) page.miroCards = [];
    const clone = JSON.parse(JSON.stringify(card));
    clone.id = uid();
    clone.x = (card.x || 0) + 30;
    clone.y = (card.y || 0) + 30;
    page.miroCards.push(clone);
    sv(); buildMiroCanvas(); buildOutline();
  };
  toolbar.appendChild(dupBtn);

  // ── Separator ──
  const sepI = document.createElement('div');
  sepI.className = 'sn-tb-sep';
  toolbar.appendChild(sepI);

  // ── Tag button ──
  const tagBtnWrap = document.createElement('div');
  tagBtnWrap.className = 'sn-color-dropdown';
  const tagBtn = document.createElement('button');
  tagBtn.className = 'sn-rb-btn';
  tagBtn.title = 'Tags';
  tagBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 14 14"><path d="M1 1h5.5L13 7.5 7.5 13 1 6.5V1z" fill="none" stroke="currentColor" stroke-width="1.3"/><circle cx="4" cy="4" r="1.2" fill="currentColor"/></svg>';
  tagBtn.onmousedown = (e) => { e.preventDefault(); };
  tagBtn.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    tagPopup.classList.toggle('show');
  };
  
  // Tag popup
  const tagPopup = document.createElement('div');
  tagPopup.className = 'sn-color-popup sn-tag-popup';
  
  // Tag color selector
  const tagColorRow = document.createElement('div');
  tagColorRow.className = 'sn-cpop-row';
  const tagColors = [
    { name: 'Red', hex: '#ff6b6b' }, { name: 'Green', hex: '#51cf66' },
    { name: 'Blue', hex: '#339af0' }, { name: 'Yellow', hex: '#fcc419' },
    { name: 'Purple', hex: '#cc5de8' }, { name: 'Orange', hex: '#ff922b' },
    { name: 'Cyan', hex: '#22b8cf' }, { name: 'Pink', hex: '#f06595' },
  ];
  let _selectedTagColor = tagColors[0].hex;
  tagColors.forEach((tc, i) => {
    const dot = document.createElement('div');
    dot.className = 'sn-cpop-color' + (i === 0 ? ' sel' : '');
    dot.style.background = tc.hex;
    dot.title = tc.name;
    dot.onclick = (ev) => {
      ev.stopPropagation();
      _selectedTagColor = tc.hex;
      tagColorRow.querySelectorAll('.sn-cpop-color').forEach(d => d.classList.remove('sel'));
      dot.classList.add('sel');
    };
    tagColorRow.appendChild(dot);
  });
  tagPopup.appendChild(tagColorRow);

  // Tag input
  const tagInputRow = document.createElement('div');
  tagInputRow.className = 'sn-tag-input-row';
  const tagInput = document.createElement('input');
  tagInput.type = 'text';
  tagInput.className = 'sn-tag-input';
  tagInput.placeholder = 'Enter tag...';
  tagInput.onkeydown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addTag();
    }
    e.stopPropagation();
  };
  tagInput.onclick = (e) => e.stopPropagation();

  function addTag() {
    const val = tagInput.value.trim();
    if (!val) return;
    if (!card.tags) card.tags = [];
    card.tags.push({ text: val, color: _selectedTagColor });
    tagInput.value = '';
    renderTags();
    renderTagStrip();
    sv();
  }

  tagInputRow.appendChild(tagInput);
  tagPopup.appendChild(tagInputRow);

  // Tag list
  const tagList = document.createElement('div');
  tagList.className = 'sn-tag-list';
  function renderTags() {
    tagList.innerHTML = '';
    (card.tags || []).forEach((t, i) => {
      const tag = document.createElement('span');
      tag.className = 'sn-tag-chip';
      tag.style.background = t.color;
      tag.style.color = '#fff';
      tag.textContent = t.text;
      const delTag = document.createElement('span');
      delTag.className = 'sn-tag-del';
      delTag.innerHTML = '<svg width="10" height="10" viewBox="0 0 10 10"><line x1="2" y1="2" x2="8" y2="8" stroke="currentColor" stroke-width="1.5"/><line x1="8" y1="2" x2="2" y2="8" stroke="currentColor" stroke-width="1.5"/></svg>';
      delTag.onclick = (ev) => {
        ev.stopPropagation();
        card.tags.splice(i, 1);
        renderTags();
        renderTagStrip();
        sv();
      };
      tag.appendChild(delTag);
      tagList.appendChild(tag);
    });
  }
  renderTags();
  tagPopup.appendChild(tagList);

  tagBtnWrap.appendChild(tagBtn);
  tagBtnWrap.appendChild(tagPopup);
  toolbar.appendChild(tagBtnWrap);

  // Close tag popup when clicking outside
  document.addEventListener('click', (e) => {
    if (!tagBtnWrap.contains(e.target)) {
      tagPopup.classList.remove('show');
    }
  });

  // ── Tag strip under sticky note ──
  const tagStrip = document.createElement('div');
  tagStrip.className = 'sn-tag-strip';
  function renderTagStrip() {
    tagStrip.innerHTML = '';
    (card.tags || []).forEach(t => {
      const chip = document.createElement('span');
      chip.className = 'sn-tag-strip-chip';
      chip.style.background = t.color;
      chip.style.color = '#fff';
      chip.textContent = t.text;
      tagStrip.appendChild(chip);
    });
  }
  renderTagStrip();

  // Text area — starts non-editable so click+drag moves the note
  const text = document.createElement('div');
  text.className = 'ms-text';
  text.contentEditable = false;
  // Use innerHTML to support rich text
  text.innerHTML = card.text || '';
  text.addEventListener('input', () => {
    card.text = text.innerHTML;
    if (card.fontSizeMode === 'auto') autoSizeText(text, el);
    sv();
  });
  // Double-click enters edit mode
  text.addEventListener('dblclick', (e) => {
    e.stopPropagation();
    text.contentEditable = true;
    text.focus();
    toolbar.classList.add('show');
  });
  // Single click/selection — show toolbar if this is the only selected item
  el.addEventListener('mouseup', () => {
    requestAnimationFrame(() => {
      if (_miroSelected.has(card.id)) {
        toolbar.classList.add('show');
      }
    });
  });
  text.addEventListener('blur', (e) => {
    // Don't exit edit mode if clicking inside toolbar
    if (toolbar.contains(e.relatedTarget)) return;
    text.contentEditable = false;
    card.text = text.innerHTML;
    sv();
  });
  // Prevent drag when editing
  text.addEventListener('mousedown', (e) => {
    if (text.contentEditable === 'true') e.stopPropagation();
  });
  // Handle Escape to exit edit mode
  text.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      text.contentEditable = false;
      toolbar.classList.remove('show');
      card.text = text.innerHTML;
      text.blur();
      sv();
    }
  });

  // Shape toggle handle
  const toggle = document.createElement('div');
  toggle.className = 'ms-shape-toggle';
  toggle.textContent = (card.w || 280) > (card.h || 160) ? '■' : '▬';
  toggle.title = 'Toggle shape';
  toggle.onclick = (e) => {
    e.stopPropagation();
    if ((card.w || 280) >= (card.h || 160)) {
      const side = Math.max(card.w || 280, card.h || 160);
      card.w = side;
      card.h = side;
    } else {
      card.w = Math.max(card.w || 280, 280);
      card.h = Math.round(card.w / 1.75);
    }
    sv();
    buildMiroCanvas();
  };

  // Show/hide toolbar on click
  el.addEventListener('click', (e) => {
    if (
      e.target.closest('.mc-del') ||
      e.target.closest('.mc-lock') ||
      e.target.closest('.ms-shape-toggle') ||
      e.target.closest('.sn-toolbar')
    )
      return;
    document.querySelectorAll('.sn-toolbar.show').forEach((t) => {
      if (t !== toolbar) t.classList.remove('show');
    });
    toolbar.classList.toggle('show');
  });
  document.addEventListener('click', (e) => {
    if (!el.contains(e.target)) {
      toolbar.classList.remove('show');
      // Also exit edit mode if clicking outside
      if (text.contentEditable === 'true' && !toolbar.contains(e.target)) {
        text.contentEditable = false;
        card.text = text.innerHTML;
        sv();
      }
    }
  });

  // Drag (via global helper)
  miroSetupCardDrag(el, card, ['.mc-del', '.mc-resize-br', '.mc-resize-bl', '.mc-resize-tr', '.mc-resize-tl', '.ms-shape-toggle', '.sn-toolbar', '.mc-lock']);

  // 4-corner resize
  attach8WayResize(el, card, 1, 1);

  // Lock UI
  attachLockUI(el, card);

  el.appendChild(del);
  el.appendChild(toolbar);
  el.appendChild(toggle);
  el.appendChild(text);
  el.appendChild(tagStrip);

  // Apply vertical alignment (default: center)
  if (!card.valign) card.valign = 'center';
  text.style.display = 'flex';
  text.style.flexDirection = 'column';
  text.style.justifyContent = card.valign;

  // Apply saved font family
  if (card.fontFamily) {
    text.style.fontFamily = card.fontFamily;
  }

  // Auto-size text after render (only if in auto mode)
  if (card.fontSizeMode === 'auto') {
    requestAnimationFrame(() => autoSizeText(text, el));
  } else {
    text.style.fontSize = card.fontSizeMode + 'px';
  }
  return el;
}

function autoSizeText(textEl, containerEl) {
  if (!textEl.textContent.trim()) {
    textEl.style.fontSize = '18px';
    return;
  }
  // Strip ALL inline styles from children that could interfere with auto-sizing
  textEl.querySelectorAll('[style]').forEach(child => {
    child.style.removeProperty('font-size');
    child.style.removeProperty('line-height');
    child.style.removeProperty('letter-spacing');
  });
  // Normalize <p> margins (Miro paste adds <p> with default browser margins)
  textEl.querySelectorAll('p').forEach(p => {
    p.style.margin = '0';
    p.style.padding = '0';
  });

  // Calculate available height (from container if available, minus toolbar/padding)
  let maxH = textEl.clientHeight;
  if (!maxH && containerEl) {
    const cs = getComputedStyle(textEl);
    const pt = parseFloat(cs.paddingTop) || 0;
    const pb = parseFloat(cs.paddingBottom) || 0;
    maxH = (containerEl.clientHeight || parseFloat(containerEl.style.height) || 10) - pt - pb;
  }
  if (maxH < 10) maxH = 10; // minimal fallback

  // Calculate available width for word-aware sizing
  let maxW = textEl.clientWidth;
  if (!maxW && containerEl) {
    const cs = getComputedStyle(textEl);
    const pl = parseFloat(cs.paddingLeft) || 0;
    const pr = parseFloat(cs.paddingRight) || 0;
    maxW = (containerEl.clientWidth || parseFloat(containerEl.style.width) || 10) - pl - pr;
  }
  if (maxW < 10) maxW = 10; // minimal fallback

  // Enforce word-break CSS: never break mid-word
  textEl.style.wordBreak = 'normal';
  textEl.style.overflowWrap = 'break-word';

  // Binary search for largest font that fits — check BOTH height and width
  const maxFont = Math.min(500, Math.max(120, Math.floor(maxH * 1.2)));
  let lo = 6, hi = maxFont, best = 6;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    textEl.style.fontSize = mid + 'px';
    if (textEl.scrollHeight <= maxH + 2 && textEl.scrollWidth <= maxW + 2) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  textEl.style.fontSize = best + 'px';
}

// Update selection queries to include sticky notes
function addMiroSelectEl(cid) {
  const el = document.querySelector(`[data-cid="${cid}"]`);
  if (el) el.classList.add('miro-selected');
}
function removeMiroSelectEl(cid) {
  const el = document.querySelector(`[data-cid="${cid}"]`);
  if (el) el.classList.remove('miro-selected');
}

/* ─── Caption Toolbar ─── */
function _showCaptionToolbar(captionEl, card) {
  _hideCaptionToolbar();
  const tb = document.createElement('div');
  tb.id = 'mi-caption-toolbar';
  tb.innerHTML = `
    <label title="Background"><input type="color" data-prop="bg" value="${card.caption.bg || '#1a1d2e'}"></label>
    <label title="Text Color"><input type="color" data-prop="color" value="${card.caption.color || '#e4e4e4'}"></label>
    <select data-prop="fontSize" title="Font Size">
      <option value="10" ${card.caption.fontSize==10?'selected':''}>10</option>
      <option value="12" ${card.caption.fontSize==12?'selected':''}>12</option>
      <option value="14" ${card.caption.fontSize==14||!card.caption.fontSize?'selected':''}>14</option>
      <option value="16" ${card.caption.fontSize==16?'selected':''}>16</option>
      <option value="18" ${card.caption.fontSize==18?'selected':''}>18</option>
      <option value="20" ${card.caption.fontSize==20?'selected':''}>20</option>
      <option value="24" ${card.caption.fontSize==24?'selected':''}>24</option>
    </select>
    <button data-prop="fontWeight" data-val="toggle" title="Bold" style="font-weight:bold;${card.caption.fontWeight==='bold'?'background:rgba(108,143,255,.4)':''}">B</button>
    <button data-prop="textAlign" data-val="left" title="Left">⫷</button>
    <button data-prop="textAlign" data-val="center" title="Center">☰</button>
    <button data-prop="textAlign" data-val="right" title="Right">⫸</button>
  `;
  // Position near caption
  const rect = captionEl.getBoundingClientRect();
  tb.style.position = 'fixed';
  tb.style.left = rect.left + 'px';
  tb.style.top = (rect.top - 38) + 'px';
  tb.style.zIndex = '99999';

  tb.addEventListener('mousedown', (e) => e.preventDefault()); // prevent blur
  tb.addEventListener('change', (e) => {
    const prop = e.target.dataset.prop;
    if (!prop) return;
    card.caption[prop] = prop === 'fontSize' ? +e.target.value : e.target.value;
    captionEl.style[prop] = prop === 'fontSize' ? e.target.value + 'px' : e.target.value;
    sv();
  });
  tb.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-prop]');
    if (!btn) return;
    const prop = btn.dataset.prop;
    if (prop === 'fontWeight') {
      const newVal = card.caption.fontWeight === 'bold' ? 'normal' : 'bold';
      card.caption.fontWeight = newVal;
      captionEl.style.fontWeight = newVal;
      btn.style.background = newVal === 'bold' ? 'rgba(108,143,255,.4)' : '';
    } else if (prop === 'textAlign') {
      card.caption.textAlign = btn.dataset.val;
      captionEl.style.textAlign = btn.dataset.val;
    }
    sv();
  });

  document.body.appendChild(tb);
}

function _hideCaptionToolbar() {
  const tb = document.getElementById('mi-caption-toolbar');
  if (tb) tb.remove();
}

/* ─── Image Card ─── */
function buildMiroImage(card) {
  const el = document.createElement('div');
  el.className = 'miro-image';
  el.dataset.cid = card.id;
  el.style.left = (card.x || 0) + 'px';
  el.style.top = (card.y || 0) + 'px';
  el.style.width = (card.w || 300) + 'px';

  const cap = card.caption;
  const capH = cap ? (cap.height || 36) : 0;
  const totalH = (card.h || 200) + capH;
  el.style.height = totalH + 'px';

  // Delete button
  const del = document.createElement('button');
  del.className = 'mc-del';
  del.textContent = '✕';
  del.onclick = (e) => { e.stopPropagation(); deleteMiroCard(card.id); };

  // Image element
  const img = document.createElement('img');
  img.className = 'mi-img';
  img.src = card.imageUrl;
  img.alt = card.label || 'Image';
  img.draggable = false;
  img.style.height = (card.h || 200) + 'px';
  if (cap && cap.position === 'above') img.style.order = '2';
  img.onerror = () => {
    img.style.display = 'none';
    const ph = document.createElement('div');
    ph.className = 'mi-placeholder';
    ph.textContent = '🖼️';
    ph.style.height = (card.h || 200) + 'px';
    el.insertBefore(ph, img);
  };

  // Download button
  const dlBtn = document.createElement('button');
  dlBtn.className = 'mc-download';
  dlBtn.title = 'Download image';
  dlBtn.innerHTML = '⤓';
  dlBtn.onclick = (e) => {
    e.stopPropagation();
    const url = card.imageUrl;
    if (!url) return;
    const fileName = (card.label || 'image') + (url.includes('.png') ? '.png' : '.jpg');
    if (url.startsWith('http')) {
      fetch(url, { mode: 'cors' })
        .then(r => r.blob())
        .then(blob => {
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = fileName;
          a.click();
          setTimeout(() => URL.revokeObjectURL(a.href), 5000);
        })
        .catch(() => { window.open(url, '_blank'); });
    } else {
      const a = document.createElement('a');
      a.href = url; a.download = fileName; a.click();
    }
  };

  // ─── Caption element ───
  let captionEl = null;
  if (cap) {
    captionEl = document.createElement('div');
    captionEl.className = 'mi-caption';
    captionEl.style.height = capH + 'px';
    captionEl.style.background = cap.bg || '#1a1d2e';
    captionEl.style.color = cap.color || '#e4e4e4';
    captionEl.style.fontSize = (cap.fontSize || 14) + 'px';
    captionEl.style.fontWeight = cap.fontWeight || 'normal';
    captionEl.style.textAlign = cap.textAlign || 'center';
    captionEl.style.order = cap.position === 'above' ? '1' : '3';
    captionEl.textContent = cap.text || '';

    // Double-click to edit
    captionEl.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      captionEl.contentEditable = 'true';
      captionEl.focus();
      // Select all text
      const range = document.createRange();
      range.selectNodeContents(captionEl);
      const sel = window.getSelection();
      sel.removeAllRanges(); sel.addRange(range);

      // Show caption toolbar
      _showCaptionToolbar(captionEl, card);
    });

    captionEl.addEventListener('blur', () => {
      captionEl.contentEditable = 'false';
      card.caption.text = captionEl.textContent;
      sv();
      _hideCaptionToolbar();
    });

    captionEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        captionEl.blur();
      }
      e.stopPropagation();
    });

    captionEl.addEventListener('input', (e) => { e.stopPropagation(); });

    // Caption height resize handle
    const capResize = document.createElement('div');
    capResize.className = 'mi-cap-resize';
    capResize.style.cursor = cap.position === 'above' ? 'n-resize' : 's-resize';
    let capStartY, capStartH;
    capResize.addEventListener('mousedown', (re) => {
      re.stopPropagation(); re.preventDefault();
      capStartY = re.clientY;
      capStartH = cap.height || 36;
      const onMove = (me) => {
        const dy = cap.position === 'above' ? (capStartY - me.clientY) : (me.clientY - capStartY);
        const newH = Math.max(24, Math.min(200, capStartH + dy));
        cap.height = newH;
        captionEl.style.height = newH + 'px';
        el.style.height = ((card.h || 200) + newH) + 'px';
      };
      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        sv();
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
    captionEl.appendChild(capResize);
  }

  // Drag (via global helper)
  miroSetupCardDrag(el, card, ['.mc-del', '.mc-download', '.mi-caption', '.mi-cap-resize', '.mc-resize-br', '.mc-resize-bl', '.mc-resize-tr', '.mc-resize-tl', '.mc-lock']);

  // 4-corner resize
  attach8WayResize(el, card, 20, 20);

  // Lock UI
  attachLockUI(el, card);

  el.appendChild(del);
  el.appendChild(dlBtn);
  if (captionEl && cap.position === 'above') el.appendChild(captionEl);
  el.appendChild(img);
  if (captionEl && cap.position !== 'above') el.appendChild(captionEl);
  return el;
}

/* ─── Text Widget ─── */
function buildMiroText(card) {
  const el = document.createElement('div');
  el.className = 'miro-text';
  el.dataset.cid = card.id;
  el.style.left = (card.x || 0) + 'px';
  el.style.top = (card.y || 0) + 'px';
  el.style.width = (card.w || 200) + 'px';
  el.style.minHeight = (card.h || 40) + 'px';

  // Initialize fontSizeMode if not set
  if (card.fontSizeMode === undefined) card.fontSizeMode = card.fontSize || 24;

  // Delete button
  const del = document.createElement('button');
  del.className = 'mc-del';
  del.textContent = '✕';
  del.onclick = (e) => { e.stopPropagation(); deleteMiroCard(card.id); };

  // ─── Rich Toolbar (matching sticky note style) ───
  const toolbar = document.createElement('div');
  toolbar.className = 'mt-toolbar';

  // Helper to save/restore selection inside contentEditable
  let _savedRange = null;
  function saveSelection() {
    const sel = window.getSelection();
    if (sel.rangeCount > 0 && text.contains(sel.anchorNode)) {
      _savedRange = sel.getRangeAt(0).cloneRange();
    }
  }
  function restoreSelection() {
    if (_savedRange) {
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(_savedRange);
    }
  }

  // ── Font Family selector ──
  const fontFamilySelect = document.createElement('select');
  fontFamilySelect.className = 'mt-font';
  fontFamilySelect.title = 'Font Family';
  const _mtFonts = ['Inter', 'DM Sans', 'Georgia', 'Courier New', 'serif', 'KFGQPC Uthmanic Script HAFS'];
  _mtFonts.forEach(f => {
    const opt = document.createElement('option');
    opt.value = f;
    opt.textContent = f === 'KFGQPC Uthmanic Script HAFS' ? 'KFGQPC Uthmanic' : f;
    opt.style.fontFamily = f;
    fontFamilySelect.appendChild(opt);
  });
  fontFamilySelect.value = card.font || 'Inter';
  fontFamilySelect.onmousedown = () => { saveSelection(); };
  fontFamilySelect.onchange = (e) => {
    e.stopPropagation();
    card.font = fontFamilySelect.value;
    restoreSelection();
    const sel = window.getSelection();
    if (sel.rangeCount > 0 && !sel.isCollapsed && text.contains(sel.anchorNode)) {
      document.execCommand('fontName', false, card.font);
    } else {
      text.style.fontFamily = card.font;
    }
    card.text = text.innerHTML;
    sv();
  };
  toolbar.appendChild(fontFamilySelect);

  // ── Separator ──
  const sepA = document.createElement('div');
  sepA.className = 'sn-tb-sep';
  toolbar.appendChild(sepA);

  // ── Format button helper ──
  function mkFmtBtn(label, title, cmd, cssClass) {
    const b = document.createElement('button');
    b.className = 'sn-rb-btn' + (cssClass ? ' ' + cssClass : '');
    b.innerHTML = label;
    b.title = title;
    b.onmousedown = (e) => { e.preventDefault(); saveSelection(); };
    b.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      restoreSelection();
      document.execCommand(cmd, false, null);
      card.text = text.innerHTML;
      sv();
    };
    return b;
  }

  // Bold, Italic, Underline, Strikethrough
  toolbar.appendChild(mkFmtBtn('<b>B</b>', 'Bold (Ctrl+B)', 'bold'));
  toolbar.appendChild(mkFmtBtn('<i>I</i>', 'Italic (Ctrl+I)', 'italic'));
  toolbar.appendChild(mkFmtBtn('<u>U</u>', 'Underline (Ctrl+U)', 'underline'));
  toolbar.appendChild(mkFmtBtn('<s>S</s>', 'Strikethrough', 'strikeThrough'));

  // ── Separator ──
  const sepB = document.createElement('div');
  sepB.className = 'sn-tb-sep';
  toolbar.appendChild(sepB);

  // ── Alignment dropdown button ──
  const alignWrap = document.createElement('div');
  alignWrap.className = 'sn-color-dropdown';
  const alignBtn = document.createElement('button');
  alignBtn.className = 'sn-rb-btn';
  alignBtn.title = 'Alignment';
  alignBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 14 14"><line x1="1" y1="2" x2="13" y2="2" stroke="currentColor" stroke-width="1.5"/><line x1="1" y1="7" x2="9" y2="7" stroke="currentColor" stroke-width="1.5"/><line x1="1" y1="12" x2="11" y2="12" stroke="currentColor" stroke-width="1.5"/></svg>';
  alignBtn.onmousedown = (e) => { e.preventDefault(); saveSelection(); };
  alignBtn.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    alignPopup.classList.toggle('show');
  };
  const alignPopup = document.createElement('div');
  alignPopup.className = 'sn-color-popup sn-align-popup';

  const hLabel = document.createElement('div');
  hLabel.className = 'sn-cpop-label';
  hLabel.textContent = 'Horizontal';
  alignPopup.appendChild(hLabel);
  const hRow = document.createElement('div');
  hRow.className = 'sn-cpop-row';
  const hAligns = [
    { icon: '<svg width="16" height="16" viewBox="0 0 16 16"><line x1="2" y1="3" x2="14" y2="3" stroke="currentColor" stroke-width="1.5"/><line x1="2" y1="8" x2="10" y2="8" stroke="currentColor" stroke-width="1.5"/><line x1="2" y1="13" x2="12" y2="13" stroke="currentColor" stroke-width="1.5"/></svg>', title: 'Align Left', cmd: 'justifyLeft' },
    { icon: '<svg width="16" height="16" viewBox="0 0 16 16"><line x1="1" y1="3" x2="15" y2="3" stroke="currentColor" stroke-width="1.5"/><line x1="3" y1="8" x2="13" y2="8" stroke="currentColor" stroke-width="1.5"/><line x1="2" y1="13" x2="14" y2="13" stroke="currentColor" stroke-width="1.5"/></svg>', title: 'Align Center', cmd: 'justifyCenter' },
    { icon: '<svg width="16" height="16" viewBox="0 0 16 16"><line x1="2" y1="3" x2="14" y2="3" stroke="currentColor" stroke-width="1.5"/><line x1="6" y1="8" x2="14" y2="8" stroke="currentColor" stroke-width="1.5"/><line x1="4" y1="13" x2="14" y2="13" stroke="currentColor" stroke-width="1.5"/></svg>', title: 'Align Right', cmd: 'justifyRight' },
  ];
  hAligns.forEach(a => {
    const b = document.createElement('button');
    b.className = 'sn-rb-btn';
    b.innerHTML = a.icon;
    b.title = a.title;
    b.onmousedown = (e) => { e.preventDefault(); saveSelection(); };
    b.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      restoreSelection();
      document.execCommand(a.cmd, false, null);
      card.text = text.innerHTML;
      sv();
    };
    hRow.appendChild(b);
  });
  alignPopup.appendChild(hRow);

  alignWrap.appendChild(alignBtn);
  alignWrap.appendChild(alignPopup);
  toolbar.appendChild(alignWrap);

  document.addEventListener('click', (e) => {
    if (!alignWrap.contains(e.target)) alignPopup.classList.remove('show');
  });

  // ── Separator ──
  const sepC = document.createElement('div');
  sepC.className = 'sn-tb-sep';
  toolbar.appendChild(sepC);

  // ── Link button ──
  const linkBtn = document.createElement('button');
  linkBtn.className = 'sn-rb-btn';
  linkBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 14 14"><path d="M6 8a3 3 0 004 .5l2-2a3 3 0 00-4.24-4.24L6.5 3.5" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><path d="M8 6a3 3 0 00-4-.5l-2 2a3 3 0 004.24 4.24L7.5 10.5" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>';
  linkBtn.title = 'Insert Link';
  linkBtn.onmousedown = (e) => { e.preventDefault(); saveSelection(); };
  linkBtn.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    restoreSelection();
    const url = prompt('Enter URL:');
    if (url) {
      document.execCommand('createLink', false, url);
      text.querySelectorAll('a').forEach(a => {
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
      });
      card.text = text.innerHTML;
      sv();
    }
  };
  toolbar.appendChild(linkBtn);

  // ── Separator ──
  const sepD = document.createElement('div');
  sepD.className = 'sn-tb-sep';
  toolbar.appendChild(sepD);

  // ── Font size control ──
  const fsWrap = document.createElement('div');
  fsWrap.className = 'sn-rb-fs-wrap';
  const fsSelect = document.createElement('select');
  fsSelect.className = 'sn-rb-fs';
  fsSelect.title = 'Font Size';
  const fsSizes = ['8', '10', '12', '14', '18', '24', '32', '48', '64', '72', '96', '120'];
  fsSizes.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s;
    opt.textContent = s;
    if (+s === +(card.fontSizeMode || 24)) opt.selected = true;
    fsSelect.appendChild(opt);
  });
  fsSelect.onmousedown = () => { saveSelection(); };
  fsSelect.onchange = (e) => {
    e.stopPropagation();
    const val = +fsSelect.value;
    card.fontSizeMode = val;
    card.fontSize = val;
    restoreSelection();
    const sel = window.getSelection();
    if (sel.rangeCount > 0 && !sel.isCollapsed && text.contains(sel.anchorNode)) {
      document.execCommand('fontSize', false, '7');
      text.querySelectorAll('font[size="7"]').forEach(f => {
        const span = document.createElement('span');
        span.style.fontSize = val + 'px';
        span.innerHTML = f.innerHTML;
        f.replaceWith(span);
      });
    } else {
      text.style.fontSize = val + 'px';
    }
    card.text = text.innerHTML;
    // Auto-fit height
    requestAnimationFrame(() => {
      const sh = text.scrollHeight + 8;
      if (sh > (card.h || 40)) { card.h = sh; el.style.minHeight = sh + 'px'; }
    });
    sv();
  };
  fsWrap.appendChild(fsSelect);
  toolbar.appendChild(fsWrap);

  // ── Separator ──
  const sepE = document.createElement('div');
  sepE.className = 'sn-tb-sep';
  toolbar.appendChild(sepE);

  // ── Text color picker ──
  const tcLabel = document.createElement('label');
  tcLabel.className = 'sn-rb-color-wrap';
  tcLabel.title = 'Text Color';
  const tcIcon = document.createElement('span');
  tcIcon.className = 'sn-rb-color-icon';
  tcIcon.textContent = 'A';
  const tcInput = document.createElement('input');
  tcInput.type = 'color';
  tcInput.className = 'sn-rb-color-input';
  tcInput.value = card.fontColor || '#333333';
  tcInput.onmousedown = () => { saveSelection(); };
  tcInput.oninput = (e) => {
    e.stopPropagation();
    restoreSelection();
    document.execCommand('foreColor', false, tcInput.value);
    tcIcon.style.borderBottomColor = tcInput.value;
    card.fontColor = tcInput.value;
    card.text = text.innerHTML;
    sv();
  };
  tcLabel.appendChild(tcIcon);
  tcLabel.appendChild(tcInput);
  toolbar.appendChild(tcLabel);

  // ── Separator ──
  const sepF = document.createElement('div');
  sepF.className = 'sn-tb-sep';
  toolbar.appendChild(sepF);

  // ── Duplicate button ──
  const dupBtn = document.createElement('button');
  dupBtn.className = 'sn-rb-btn';
  dupBtn.title = 'Duplicate';
  dupBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 14 14"><rect x="1" y="3" width="8" height="8" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.3"/><rect x="5" y="1" width="8" height="8" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>';
  dupBtn.onmousedown = (e) => { e.preventDefault(); };
  dupBtn.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const page = cp();
    if (!page.miroCards) page.miroCards = [];
    const clone = JSON.parse(JSON.stringify(card));
    clone.id = uid();
    clone.x = (card.x || 0) + 30;
    clone.y = (card.y || 0) + 30;
    page.miroCards.push(clone);
    sv(); buildMiroCanvas(); buildOutline();
  };
  toolbar.appendChild(dupBtn);

  // Text content
  const text = document.createElement('div');
  text.className = 'mt-text';
  text.contentEditable = false;
  text.dir = 'auto';
  text.style.direction = 'rtl';
  text.style.textAlign = card.align || 'right';
  text.innerHTML = card.text ?? '';
  text.style.fontFamily = card.font || 'Inter';
  text.style.fontSize = (card.fontSize || 24) + 'px';
  text.style.color = card.fontColor || '#333333';

  // Double-click to edit
  text.addEventListener('dblclick', (e) => {
    e.stopPropagation();
    text.contentEditable = true;
    text.focus();
    toolbar.classList.add('show');
  });
  text.addEventListener('blur', (e) => {
    if (toolbar.contains(e.relatedTarget)) return;
    text.contentEditable = false;
    card.text = text.innerHTML;
    // Auto-fit height to content
    const sh = text.scrollHeight + 8;
    card.h = Math.max(sh, 30);
    el.style.minHeight = card.h + 'px';
    sv();
  });
  text.addEventListener('input', () => {
    card.text = text.innerHTML;
    // Auto-fit height on input
    const sh = text.scrollHeight + 8;
    if (sh > (card.h || 40)) { card.h = sh; el.style.minHeight = sh + 'px'; }
    sv();
  });
  text.addEventListener('mousedown', (e) => { if (text.contentEditable === 'true') e.stopPropagation(); });
  text.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      text.contentEditable = false;
      toolbar.classList.remove('show');
      card.text = text.innerHTML;
      text.blur();
      sv();
    }
  });

  // Show/hide toolbar on click (don't hide when clicking inside text area for selection)
  el.addEventListener('click', (e) => {
    if (e.target.closest('.mc-del') || e.target.closest('.mc-lock') || e.target.closest('.mt-toolbar')) return;
    // If text is in edit mode and click is inside the text, keep toolbar visible
    if (text.contentEditable === 'true' && (text.contains(e.target) || e.target === text)) return;
    document.querySelectorAll('.mt-toolbar.show, .msh-toolbar.show, .sn-toolbar.show').forEach(t => { if (t !== toolbar) t.classList.remove('show'); });
    toolbar.classList.toggle('show');
  });
  document.addEventListener('click', (e) => {
    if (!el.contains(e.target)) {
      toolbar.classList.remove('show');
      if (text.contentEditable === 'true' && !toolbar.contains(e.target)) {
        text.contentEditable = false;
        card.text = text.innerHTML;
        const sh = text.scrollHeight + 8;
        card.h = Math.max(sh, 30);
        el.style.minHeight = card.h + 'px';
        sv();
      }
    }
  });

  // Drag (via global helper)
  miroSetupCardDrag(el, card, ['.mc-del', '.mt-toolbar', '.mc-lock']);

  // Auto-fit min height function for resize
  const getAutoMinH = () => {
    return Math.max(text.scrollHeight + 8, 30);
  };
  attach8WayResize(el, card, 60, 30);

  // Lock UI
  attachLockUI(el, card);

  el.appendChild(del);
  el.appendChild(toolbar);
  el.appendChild(text);

  // Auto-fit height after initial render
  requestAnimationFrame(() => {
    const sh = text.scrollHeight + 8;
    if (sh > (card.h || 40)) {
      card.h = sh;
      el.style.minHeight = sh + 'px';
    }
  });

  return el;
}

/* ─── Shape Widget ─── */
function renderShapeSVG(card) {
  const w = card.w || 160, h = card.h || 120;
  const fill = card.fillColor || '#6c8fff';
  const stroke = card.strokeColor || '#333';
  const sw = card.strokeWidth ?? 2;
  const op = card.opacity ?? 1;
  let inner = '';
  switch (card.shape) {
    case 'rect': inner = `<rect x="${sw}" y="${sw}" width="${w - sw * 2}" height="${h - sw * 2}" rx="4" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`; break;
    case 'rounded-rect': inner = `<rect x="${sw}" y="${sw}" width="${w - sw * 2}" height="${h - sw * 2}" rx="${Math.min(w, h) / 4}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`; break;
    case 'ellipse': inner = `<ellipse cx="${w / 2}" cy="${h / 2}" rx="${w / 2 - sw}" ry="${h / 2 - sw}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`; break;
    case 'triangle': inner = `<polygon points="${w / 2},${sw} ${w - sw},${h - sw} ${sw},${h - sw}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`; break;
    case 'diamond': inner = `<polygon points="${w / 2},${sw} ${w - sw},${h / 2} ${w / 2},${h - sw} ${sw},${h / 2}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`; break;
    case 'star': {
      const cx = w / 2, cy = h / 2, or = Math.min(w, h) / 2 - sw, ir = or * 0.4;
      let pts = '';
      for (let i = 0; i < 10; i++) {
        const a = (Math.PI / 5) * i - Math.PI / 2;
        const r = i % 2 === 0 ? or : ir;
        pts += `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)} `;
      }
      inner = `<polygon points="${pts.trim()}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
      break;
    }
    case 'hexagon': {
      const cx = w / 2, cy = h / 2, r = Math.min(w, h) / 2 - sw;
      let pts = '';
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i - Math.PI / 6;
        pts += `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)} `;
      }
      inner = `<polygon points="${pts.trim()}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
      break;
    }
    case 'pentagon': {
      const cx = w / 2, cy = h / 2, r = Math.min(w, h) / 2 - sw;
      let pts = '';
      for (let i = 0; i < 5; i++) {
        const a = (2 * Math.PI / 5) * i - Math.PI / 2;
        pts += `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)} `;
      }
      inner = `<polygon points="${pts.trim()}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
      break;
    }
    case 'cross': {
      const t = Math.min(w, h) * 0.3;
      inner = `<polygon points="${w / 2 - t},${sw} ${w / 2 + t},${sw} ${w / 2 + t},${h / 2 - t} ${w - sw},${h / 2 - t} ${w - sw},${h / 2 + t} ${w / 2 + t},${h / 2 + t} ${w / 2 + t},${h - sw} ${w / 2 - t},${h - sw} ${w / 2 - t},${h / 2 + t} ${sw},${h / 2 + t} ${sw},${h / 2 - t} ${w / 2 - t},${h / 2 - t}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
      break;
    }
    case 'arrow-shape': {
      const aw = w * 0.35;
      inner = `<polygon points="${sw},${h / 2 - h * 0.2} ${w - aw},${h / 2 - h * 0.2} ${w - aw},${sw} ${w - sw},${h / 2} ${w - aw},${h - sw} ${w - aw},${h / 2 + h * 0.2} ${sw},${h / 2 + h * 0.2}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
      break;
    }
    case 'arrow': inner = `<line x1="${sw}" y1="${h / 2}" x2="${w - 14}" y2="${h / 2}" stroke="${stroke}" stroke-width="${sw}"/><polyline points="${w - 20},${h / 2 - 10} ${w - sw},${h / 2} ${w - 20},${h / 2 + 10}" fill="none" stroke="${stroke}" stroke-width="${sw}"/>`; break;
    case 'line': inner = `<line x1="${sw}" y1="${h - sw}" x2="${w - sw}" y2="${sw}" stroke="${stroke}" stroke-width="${sw}"/>`; break;
    default: inner = `<rect x="${sw}" y="${sw}" width="${w - sw * 2}" height="${h - sw * 2}" rx="4" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
  }
  return `<svg width="100%" height="100%" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" style="opacity:${op}">${inner}</svg>`;
}

function buildMiroShape(card) {
  const el = document.createElement('div');
  el.className = 'miro-shape';
  el.dataset.cid = card.id;
  el.style.left = (card.x || 0) + 'px';
  el.style.top = (card.y || 0) + 'px';
  el.style.width = (card.w || 160) + 'px';
  el.style.height = (card.h || 120) + 'px';

  // SVG content
  const svgWrap = document.createElement('div');
  svgWrap.className = 'msh-svg';
  svgWrap.innerHTML = renderShapeSVG(card);

  // Text overlay inside shape
  const textOverlay = document.createElement('div');
  textOverlay.className = 'msh-text';
  textOverlay.contentEditable = false;
  textOverlay.dir = 'auto';
  textOverlay.style.direction = 'rtl';
  textOverlay.style.textAlign = card.textAlign || 'center';
  textOverlay.innerHTML = card.text || '';
  textOverlay.style.fontSize = (card.fontSize || 14) + 'px';
  textOverlay.style.color = card.textColor || '#333333';
  textOverlay.style.fontFamily = card.fontFamily || 'Inter';

  // Delete button
  const del = document.createElement('button');
  del.className = 'mc-del';
  del.textContent = '✕';
  del.onclick = (e) => { e.stopPropagation(); deleteMiroCard(card.id); };

  // ─── Toolbar ───
  const toolbar = document.createElement('div');
  toolbar.className = 'msh-toolbar';

  // Selection save/restore for rich text inside shape
  let _savedRange = null;
  function saveSelection() {
    const sel = window.getSelection();
    if (sel.rangeCount > 0 && textOverlay.contains(sel.anchorNode)) {
      _savedRange = sel.getRangeAt(0).cloneRange();
    }
  }
  function restoreSelection() {
    if (_savedRange) {
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(_savedRange);
    }
  }

  // Fill color
  const fillLabel = document.createElement('label');
  fillLabel.title = 'Fill';
  fillLabel.innerHTML = '<span style="font-size:.65rem">Fill</span>';
  const fillInput = document.createElement('input');
  fillInput.type = 'color';
  fillInput.className = 'msh-fill';
  fillInput.value = card.fillColor === 'none' ? '#6c8fff' : (String(card.fillColor).startsWith('#') ? '#' + String(card.fillColor).replace('#', '').padStart(6, '0').slice(0, 6) : '#6c8fff');
  fillInput.oninput = function () { card.fillColor = this.value; noFillBtn.classList.remove('sel'); updateSVG(); sv(); };
  fillLabel.appendChild(fillInput);
  toolbar.appendChild(fillLabel);

  const noFillBtn = document.createElement('button');
  noFillBtn.className = 'mt-btn msh-nofill' + (card.fillColor === 'none' ? ' sel' : '');
  noFillBtn.title = 'No Fill';
  noFillBtn.textContent = '⊘';
  noFillBtn.onclick = function (e) { e.stopPropagation(); card.fillColor = card.fillColor === 'none' ? '#6c8fff' : 'none'; this.classList.toggle('sel', card.fillColor === 'none'); updateSVG(); sv(); };
  toolbar.appendChild(noFillBtn);

  // Stroke color
  const strokeLabel = document.createElement('label');
  strokeLabel.title = 'Stroke';
  strokeLabel.innerHTML = '<span style="font-size:.65rem">Stroke</span>';
  const strokeInput = document.createElement('input');
  strokeInput.type = 'color';
  strokeInput.className = 'msh-stroke';
  strokeInput.value = card.strokeColor === 'none' ? '#333333' : (String(card.strokeColor).startsWith('#') ? '#' + String(card.strokeColor).replace('#', '').padStart(6, '0').slice(0, 6) : '#333333');
  strokeInput.oninput = function () { card.strokeColor = this.value; noStrokeBtn.classList.remove('sel'); updateSVG(); sv(); };
  strokeLabel.appendChild(strokeInput);
  toolbar.appendChild(strokeLabel);

  const noStrokeBtn = document.createElement('button');
  noStrokeBtn.className = 'mt-btn msh-nostroke' + (card.strokeColor === 'none' ? ' sel' : '');
  noStrokeBtn.title = 'No Stroke';
  noStrokeBtn.textContent = '⊘';
  noStrokeBtn.onclick = function (e) { e.stopPropagation(); card.strokeColor = card.strokeColor === 'none' ? '#333' : 'none'; this.classList.toggle('sel', card.strokeColor === 'none'); updateSVG(); sv(); };
  toolbar.appendChild(noStrokeBtn);

  // Stroke width
  const swLabel = document.createElement('label');
  swLabel.title = 'Width';
  swLabel.innerHTML = '<span style="font-size:.65rem">W</span>';
  const swInput = document.createElement('input');
  swInput.type = 'number';
  swInput.className = 'msh-sw';
  swInput.value = card.strokeWidth ?? 2;
  swInput.min = 0;
  swInput.max = 20;
  swInput.onchange = function () { card.strokeWidth = +this.value; updateSVG(); sv(); };
  swLabel.appendChild(swInput);
  toolbar.appendChild(swLabel);

  // Opacity
  const opLabel = document.createElement('label');
  opLabel.title = 'Opacity';
  opLabel.innerHTML = '<span style="font-size:.65rem">Op</span>';
  const opInput = document.createElement('input');
  opInput.type = 'range';
  opInput.className = 'msh-op';
  opInput.value = Math.round((card.opacity ?? 1) * 100);
  opInput.min = 0;
  opInput.max = 100;
  opInput.oninput = function () { card.opacity = +this.value / 100; updateSVG(); sv(); };
  opLabel.appendChild(opInput);
  toolbar.appendChild(opLabel);

  // Separator before text controls
  const sepT = document.createElement('div');
  sepT.className = 'sn-tb-sep';
  toolbar.appendChild(sepT);

  // Text format buttons (B, I, U)
  function mkShapeFmtBtn(label, title, cmd) {
    const b = document.createElement('button');
    b.className = 'sn-rb-btn';
    b.innerHTML = label;
    b.title = title;
    b.onmousedown = (e) => { e.preventDefault(); saveSelection(); };
    b.onclick = (e) => {
      e.preventDefault(); e.stopPropagation();
      restoreSelection();
      document.execCommand(cmd, false, null);
      card.text = textOverlay.innerHTML;
      sv();
    };
    return b;
  }
  toolbar.appendChild(mkShapeFmtBtn('<b>B</b>', 'Bold', 'bold'));
  toolbar.appendChild(mkShapeFmtBtn('<i>I</i>', 'Italic', 'italic'));
  toolbar.appendChild(mkShapeFmtBtn('<u>U</u>', 'Underline', 'underline'));

  // Font size
  const fsSel = document.createElement('select');
  fsSel.className = 'sn-rb-fs';
  fsSel.title = 'Font Size';
  fsSel.style.maxWidth = '60px';
  // Add Auto option first
  const autoOpt = document.createElement('option');
  autoOpt.value = 'auto';
  autoOpt.textContent = 'Auto';
  if (card.fontSize === 'auto' || !card.fontSize) autoOpt.selected = true;
  fsSel.appendChild(autoOpt);
  ['8', '10', '12', '14', '18', '24', '32', '48'].forEach(s => {
    const o = document.createElement('option');
    o.value = s; o.textContent = s;
    if (String(card.fontSize) === s) o.selected = true;
    fsSel.appendChild(o);
  });
  fsSel.onmousedown = () => { saveSelection(); };
  fsSel.onchange = (e) => {
    e.stopPropagation();
    if (fsSel.value === 'auto') {
      card.fontSize = 'auto';
      autoFitShapeText();
    } else {
      card.fontSize = +fsSel.value;
      restoreSelection();
      const sel = window.getSelection();
      if (sel.rangeCount > 0 && !sel.isCollapsed && textOverlay.contains(sel.anchorNode)) {
        document.execCommand('fontSize', false, '7');
        textOverlay.querySelectorAll('font[size="7"]').forEach(f => {
          const span = document.createElement('span');
          span.style.fontSize = card.fontSize + 'px';
          span.innerHTML = f.innerHTML;
          f.replaceWith(span);
        });
      } else {
        textOverlay.style.fontSize = card.fontSize + 'px';
      }
    }
    card.text = textOverlay.innerHTML;
    sv();
  };
  toolbar.appendChild(fsSel);

  // Auto-fit text size to shape
  function autoFitShapeText() {
    if (card.fontSize !== 'auto') return;
    const maxW = (card.w || 160) - 24;
    const maxH = (card.h || 120) - 16;
    let lo = 6, hi = 72, best = 14;
    while (lo <= hi) {
      const mid = Math.floor((lo + hi) / 2);
      textOverlay.style.fontSize = mid + 'px';
      if (textOverlay.scrollWidth <= maxW + 2 && textOverlay.scrollHeight <= maxH + 2) {
        best = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    textOverlay.style.fontSize = best + 'px';
  }
  // Run auto-fit on initial render
  if (card.fontSize === 'auto' || !card.fontSize) {
    card.fontSize = 'auto';
    requestAnimationFrame(() => autoFitShapeText());
  }

  // Text color
  const tcWrap = document.createElement('label');
  tcWrap.className = 'sn-rb-color-wrap';
  tcWrap.title = 'Text Color';
  const tcIcon = document.createElement('span');
  tcIcon.className = 'sn-rb-color-icon';
  tcIcon.textContent = 'A';
  const tcIn = document.createElement('input');
  tcIn.type = 'color';
  tcIn.className = 'sn-rb-color-input';
  tcIn.value = card.textColor || '#333333';
  tcIn.onmousedown = () => { saveSelection(); };
  tcIn.oninput = (e) => {
    e.stopPropagation();
    restoreSelection();
    document.execCommand('foreColor', false, tcIn.value);
    tcIcon.style.borderBottomColor = tcIn.value;
    card.textColor = tcIn.value;
    card.text = textOverlay.innerHTML;
    sv();
  };
  tcWrap.appendChild(tcIcon);
  tcWrap.appendChild(tcIn);
  toolbar.appendChild(tcWrap);

  // Separator before convert
  const sepConv = document.createElement('div');
  sepConv.className = 'sn-tb-sep';
  toolbar.appendChild(sepConv);

  // Convert to Sticky Note button
  const convBtn = document.createElement('button');
  convBtn.className = 'sn-rb-btn';
  convBtn.innerHTML = '⇄ 📝';
  convBtn.title = 'Convert to Sticky Note';
  convBtn.style.fontSize = '11px';
  convBtn.onclick = (e) => {
    e.stopPropagation();
    if (!_miroSelected.has(card.id)) {
      clearMiroSelection();
      addMiroSelect(card.id);
    }
    convertSelectedTo('sticky');
  };
  toolbar.appendChild(convBtn);

  function updateSVG() { svgWrap.innerHTML = renderShapeSVG(card); }

  // Double-click text overlay to edit
  textOverlay.addEventListener('dblclick', (e) => {
    e.stopPropagation();
    textOverlay.contentEditable = true;
    textOverlay.focus();
    toolbar.classList.add('show');
  });
  textOverlay.addEventListener('blur', (e) => {
    if (toolbar.contains(e.relatedTarget)) return;
    textOverlay.contentEditable = false;
    card.text = textOverlay.innerHTML;
    sv();
  });
  textOverlay.addEventListener('input', () => {
    card.text = textOverlay.innerHTML;
    sv();
  });
  textOverlay.addEventListener('mousedown', (e) => {
    if (textOverlay.contentEditable === 'true') e.stopPropagation();
  });
  textOverlay.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      textOverlay.contentEditable = false;
      toolbar.classList.remove('show');
      card.text = textOverlay.innerHTML;
      textOverlay.blur();
      sv();
    }
  });

  // Show/hide toolbar on click
  el.addEventListener('click', (e) => {
    if (e.target.closest('.mc-del') || e.target.closest('.mc-lock') || e.target.closest('.msh-toolbar')) return;
    if (textOverlay.contentEditable === 'true' && (textOverlay.contains(e.target) || e.target === textOverlay)) return;
    document.querySelectorAll('.mt-toolbar.show, .msh-toolbar.show, .sn-toolbar.show').forEach(t => { if (t !== toolbar) t.classList.remove('show'); });
    toolbar.classList.toggle('show');
  });
  document.addEventListener('click', (e) => {
    if (!el.contains(e.target)) {
      toolbar.classList.remove('show');
      if (textOverlay.contentEditable === 'true') {
        textOverlay.contentEditable = false;
        card.text = textOverlay.innerHTML;
        sv();
      }
    }
  });

  // Drag (via global helper)
  miroSetupCardDrag(el, card, ['.mc-del', '.msh-toolbar', '.mc-resize-br', '.mc-resize-bl', '.mc-resize-tr', '.mc-resize-tl']);

  // Resize needs to re-render SVG
  const origAttach = attach8WayResize;
  attach8WayResize(el, card, 40, 40);
  // After resize, update SVG and auto-fit text
  el.addEventListener('mouseup', () => { updateSVG(); autoFitShapeText(); });

  // Lock UI
  attachLockUI(el, card);

  el.appendChild(del);
  el.appendChild(toolbar);
  el.appendChild(svgWrap);
  el.appendChild(textOverlay);
  return el;
}

/* ─── Pen (Freehand Drawing) Widget ─── */
function buildMiroPen(card) {
  const el = document.createElement('div');
  el.className = 'miro-pen';
  el.dataset.cid = card.id;
  el.style.left = (card.x || 0) + 'px';
  el.style.top = (card.y || 0) + 'px';
  el.style.width = (card.w || 100) + 'px';
  el.style.height = (card.h || 100) + 'px';

  const pts = card.points || [];
  let d = '';
  if (pts.length > 0) {
    d = `M${pts[0].x},${pts[0].y}`;
    for (let i = 1; i < pts.length; i++) d += ` L${pts[i].x},${pts[i].y}`;
  }
  el.innerHTML = `<svg width="100%" height="100%" viewBox="0 0 ${card.w || 100} ${card.h || 100}" preserveAspectRatio="none"><path d="${d}" fill="none" stroke="${card.penColor || '#333'}" stroke-width="${card.penWidth || 3}" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

  const del = document.createElement('button');
  del.className = 'mc-del'; del.textContent = '✕';
  del.onclick = (e) => { e.stopPropagation(); deleteMiroCard(card.id); };
  el.appendChild(del);

  // Drag (via global helper)
  miroSetupCardDrag(el, card, ['.mc-del']);

  return el;
}

/* ─── Grid/Table Widget (Modern) ─── */
function buildMiroGridCard(card) {
  const el = document.createElement('div');
  el.className = 'miro-grid';
  el.dataset.cid = card.id;
  el.style.left = (card.x || 0) + 'px';
  el.style.top = (card.y || 0) + 'px';
  el.style.width = (card.w || 360) + 'px';

  const del = document.createElement('button');
  del.className = 'mc-del'; del.textContent = '✕';
  del.onclick = (e) => { e.stopPropagation(); deleteMiroCard(card.id); };

  const table = document.createElement('table');
  table.className = 'mg-table';
  card.borderColor = card.borderColor || '#000000';
  card.borderWidth = card.borderWidth || 1;
  table.style.borderColor = card.borderColor;
  table.style.borderWidth = card.borderWidth + 'px';
  if (card.fillColor && card.fillColor !== 'none') table.style.background = card.fillColor;
  const rows = card.rows || 3, cols = card.cols || 3;
  if (!card.cells) {
    card.cells = [];
    for (let r = 0; r < rows; r++) { const row = []; for (let c = 0; c < cols; c++) row.push(''); card.cells.push(row); }
  }

  if (!card.colWidths || card.colWidths.length !== cols) card.colWidths = Array(cols).fill(120);
  if (!card.rowHeights || card.rowHeights.length !== rows) card.rowHeights = Array(rows).fill(40);

  card.w = card.colWidths.reduce((a, b) => a + b, 0);
  card.h = card.rowHeights.reduce((a, b) => a + b, 0);
  el.style.width = card.w + 'px';
  el.style.height = card.h + 'px';
  table.style.width = card.w + 'px';
  table.style.height = card.h + 'px';

  const colgroup = document.createElement('colgroup');
  for (let c = 0; c < cols; c++) {
    const col = document.createElement('col');
    col.style.width = card.colWidths[c] + 'px';
    colgroup.appendChild(col);
  }
  table.appendChild(colgroup);

  /* ── Selection State ── */
  const selectedCells = new Set();
  let lastSelectedCell = null;
  let _dragSelecting = false;
  let _dragStartCell = null;

  /* ── Floating Merge Button ── */
  const mergeFloat = document.createElement('div');
  mergeFloat.className = 'mg-merge-float';
  mergeFloat.innerHTML = `<svg viewBox="0 0 16 16"><rect x="1" y="1" width="6" height="6" rx="1" fill="none" stroke="currentColor" stroke-width="1.5"/><rect x="9" y="1" width="6" height="6" rx="1" fill="none" stroke="currentColor" stroke-width="1.5"/><rect x="1" y="9" width="6" height="6" rx="1" fill="none" stroke="currentColor" stroke-width="1.5"/><rect x="9" y="9" width="6" height="6" rx="1" fill="none" stroke="currentColor" stroke-width="1.5"/><line x1="4" y1="8" x2="12" y2="8" stroke="currentColor" stroke-width="1.5"/><line x1="8" y1="4" x2="8" y2="12" stroke="currentColor" stroke-width="1.5"/></svg> Merge`;
  mergeFloat.onclick = (e) => {
    e.stopPropagation();
    if (selectedCells.size < 2) return;
    const cells = [...selectedCells].map(s => { const [r, c] = s.split(',').map(Number); return { r, c }; });
    const minR = Math.min(...cells.map(c => c.r)), maxR = Math.max(...cells.map(c => c.r));
    const minC = Math.min(...cells.map(c => c.c)), maxC = Math.max(...cells.map(c => c.c));
    if (!card.merges) card.merges = [];
    card.merges = card.merges.filter(m => !(m.r >= minR && m.r <= maxR && m.c >= minC && m.c <= maxC));
    card.merges.push({ r: minR, c: minC, rs: maxR - minR + 1, cs: maxC - minC + 1 });
    sv(); buildMiroCanvas();
  };

  function updateMergeFloat(mouseX, mouseY) {
    // Auto-show toolbar when cells are selected
    if (selectedCells.size > 0) {
      toolbar.classList.add('show');
      // Use provided coords, or fallback to cell screen position
      let mx = mouseX || 0, my = mouseY || 0;
      if (!mx && !my) {
        const anyKey = [...selectedCells][0];
        const [ar, ac] = anyKey.split(',').map(Number);
        const tdF = el.querySelector(`td[data-row="${ar}"][data-col="${ac}"]`);
        if (tdF) { const rc = tdF.getBoundingClientRect(); mx = rc.left + rc.width / 2; my = rc.top; }
      }
      if (mx || my) positionToolbarAt(mx, my);
    } else {
      toolbar.classList.remove('show');
    }
    if (selectedCells.size < 2) { mergeFloat.classList.remove('show'); return; }
    const cells = [...selectedCells].map(s => { const [r, c] = s.split(',').map(Number); return { r, c }; });
    const minR = Math.min(...cells.map(c => c.r));
    const minC = Math.min(...cells.map(c => c.c));
    const maxC = Math.max(...cells.map(c => c.c));
    let yOff = 0;
    for (let rr = 0; rr < minR; rr++) yOff += card.rowHeights[rr] || 40;
    let xOff = 0;
    for (let cc = 0; cc < minC; cc++) xOff += card.colWidths[cc] || 120;
    let selW = 0;
    for (let cc = minC; cc <= maxC; cc++) selW += card.colWidths[cc] || 120;
    mergeFloat.style.left = (xOff + selW / 2) + 'px';
    mergeFloat.style.top = (yOff - 32) + 'px';
    mergeFloat.style.transform = 'translateX(-50%)';
    mergeFloat.classList.add('show');
  }

  function positionToolbarAt(mx, my) {
    const tbW = toolbar.offsetWidth || 400;
    const tbH = toolbar.offsetHeight || 36;
    let tx = mx - tbW / 2;
    let ty = my - tbH - 12;
    if (tx < 4) tx = 4;
    if (tx + tbW > window.innerWidth - 4) tx = window.innerWidth - 4 - tbW;
    if (ty < 4) ty = my + 20;
    toolbar.style.left = tx + 'px';
    toolbar.style.top = ty + 'px';
  }

  function selectRange(r1, c1, r2, c2, append, mouseX, mouseY) {
    if (!append) {
      selectedCells.clear();
      el.querySelectorAll('td.mg-sel').forEach(t => t.classList.remove('mg-sel'));
    }
    const minR = Math.min(r1, r2), maxR = Math.max(r1, r2);
    const minC = Math.min(c1, c2), maxC = Math.max(c1, c2);
    for (let rr = minR; rr <= maxR; rr++) {
      for (let cc = minC; cc <= maxC; cc++) {
        const k = `${rr},${cc}`;
        selectedCells.add(k);
        const cellEl = el.querySelector(`td[data-row="${rr}"][data-col="${cc}"]`);
        if (cellEl) cellEl.classList.add('mg-sel');
      }
    }
    updateMergeFloat(mouseX, mouseY);
  }

  /* ── Build Table Cells ── */
  for (let r = 0; r < rows; r++) {
    const tr = document.createElement('tr');
    tr.style.height = card.rowHeights[r] + 'px';
    for (let c = 0; c < cols; c++) {
      const merges = card.merges || [];
      const hiddenByMerge = merges.some(m => {
        if (r === m.r && c === m.c) return false;
        return r >= m.r && r < m.r + m.rs && c >= m.c && c < m.c + m.cs;
      });
      if (hiddenByMerge) continue;

      const td = document.createElement('td');
      td.dataset.row = r; td.dataset.col = c;
      let cellBg = card.cellColors ? card.cellColors[`${r},${c}`] : null;
      if (!cellBg && r === 0 && card.headerColor && card.headerColor !== 'none') cellBg = card.headerColor;
      if (cellBg) td.style.background = cellBg;
      else td.style.background = 'transparent';

      // Text color default black; apply saved cell style
      const cellKey = `${r},${c}`;
      const cStyle = (card.cellStyles && card.cellStyles[cellKey]) || {};
      td.style.color = cStyle.color || (r === 0 && card.headerColor && card.headerColor !== 'none' ? '#fff' : '#000');
      if (cStyle.textAlign) td.style.textAlign = cStyle.textAlign;
      if (cStyle.verticalAlign) td.style.verticalAlign = cStyle.verticalAlign;
      if (cStyle.fontSize) td.style.fontSize = cStyle.fontSize + 'px';
      if (cStyle.fontWeight) td.style.fontWeight = cStyle.fontWeight;

      td.textContent = card.cells[r]?.[c] || '';
      td.style.borderColor = card.borderColor;
      td.style.borderWidth = card.borderWidth + 'px';

      const merge = merges.find(m => m.r === r && m.c === c);
      if (merge) { td.rowSpan = merge.rs; td.colSpan = merge.cs; }

      // Double-click to edit
      td.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        td.contentEditable = true;
        td.style.userSelect = 'text';
        td.style.webkitUserSelect = 'text';
        td.focus();
        td.style.outline = '2px solid var(--ac)';
        const save = () => { td.contentEditable = false; td.style.outline = ''; td.style.userSelect = ''; td.style.webkitUserSelect = ''; card.cells[r][c] = td.textContent; sv(); };
        td.addEventListener('blur', save, { once: true });
      });

      // Mousedown: start drag-select
      td.addEventListener('mousedown', (e) => {
        if (e.button === 1) return; // middle-click: let it bubble for panning
        if (td.contentEditable === 'true') { e.stopPropagation(); return; }
        e.stopPropagation();
        _dragSelecting = true;
        _dragStartCell = { r, c };

        if (e.shiftKey && lastSelectedCell) {
          const [lr, lc] = lastSelectedCell.split(',').map(Number);
          selectRange(lr, lc, r, c, e.ctrlKey || e.metaKey, e.clientX, e.clientY);
        } else if (e.ctrlKey || e.metaKey) {
          const key = `${r},${c}`;
          if (selectedCells.has(key)) { selectedCells.delete(key); td.classList.remove('mg-sel'); }
          else { selectedCells.add(key); td.classList.add('mg-sel'); }
          lastSelectedCell = key;
          updateMergeFloat(e.clientX, e.clientY);
        } else {
          selectRange(r, c, r, c, false, e.clientX, e.clientY);
          lastSelectedCell = `${r},${c}`;
        }
      });

      // Mousemove: extend drag selection
      td.addEventListener('mouseenter', (e) => {
        if (!_dragSelecting || !_dragStartCell) return;
        selectRange(_dragStartCell.r, _dragStartCell.c, r, c, false, e.clientX, e.clientY);
        lastSelectedCell = `${r},${c}`;
      });

      tr.appendChild(td);
    }
    table.appendChild(tr);
  }

  // Global mouseup to end drag select
  const stopDragSelect = () => { _dragSelecting = false; };
  document.addEventListener('mouseup', stopDragSelect);
  // Cleanup when element removed
  const cleanupObserver = new MutationObserver(() => {
    if (!document.body.contains(el)) {
      document.removeEventListener('mouseup', stopDragSelect);
      cleanupObserver.disconnect();
    }
  });
  cleanupObserver.observe(document.body, { childList: true, subtree: true });

  /* ── Grid Keyboard Shortcuts ── */
  const gridKeyHandler = (e) => {
    if (!document.body.contains(el)) { document.removeEventListener('keydown', gridKeyHandler); return; }
    if (document.activeElement && (document.activeElement.contentEditable === 'true' || document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA')) return;

    // Ctrl+Space → select entire column of lastSelectedCell
    if (e.ctrlKey && e.key === ' ' && lastSelectedCell) {
      e.preventDefault();
      const [, lc] = lastSelectedCell.split(',').map(Number);
      selectedCells.clear(); el.querySelectorAll('td.mg-sel').forEach(t => t.classList.remove('mg-sel'));
      for (let rr = 0; rr < rows; rr++) { selectedCells.add(`${rr},${lc}`); const ce = el.querySelector(`td[data-row="${rr}"][data-col="${lc}"]`); if (ce) ce.classList.add('mg-sel'); }
      updateMergeFloat(); return;
    }
    // Shift+Space → select entire row of lastSelectedCell
    if (e.shiftKey && e.key === ' ' && lastSelectedCell) {
      e.preventDefault();
      const [lr] = lastSelectedCell.split(',').map(Number);
      selectedCells.clear(); el.querySelectorAll('td.mg-sel').forEach(t => t.classList.remove('mg-sel'));
      for (let cc = 0; cc < cols; cc++) { selectedCells.add(`${lr},${cc}`); const ce = el.querySelector(`td[data-row="${lr}"][data-col="${cc}"]`); if (ce) ce.classList.add('mg-sel'); }
      updateMergeFloat(); return;
    }
    // Ctrl++ → add row or column (row if row selected, col if col selected, else row)
    if (e.ctrlKey && (e.key === '+' || e.key === '=')) {
      e.preventDefault(); pushUndo();
      const selCells = [...selectedCells].map(s => { const [r2, c2] = s.split(',').map(Number); return { r: r2, c: c2 }; });
      const allSameCol = selCells.length > 0 && selCells.every(c2 => c2.c === selCells[0].c) && selCells.length === rows;
      if (allSameCol) { card.cols++; card.cells.forEach(r2 => r2.push('')); card.colWidths.push(card.colWidths[card.colWidths.length - 1] || 120); }
      else { card.rows++; card.cells.push(Array(card.cols).fill('')); card.rowHeights.push(card.rowHeights[card.rowHeights.length - 1] || 40); }
      sv(); buildMiroCanvas(); return;
    }
    // Ctrl+- → delete selected row or column
    if (e.ctrlKey && (e.key === '-' || e.key === '_')) {
      e.preventDefault();
      // Fall through to delete logic below
    } else if (e.key !== 'Delete' && e.key !== 'Backspace') {
      return;
    }

    if (selectedCells.size === 0) return;

    const cells = [...selectedCells].map(s => { const [r, c] = s.split(',').map(Number); return { r, c }; });
    const selRows = new Set(cells.map(c => c.r));
    const selCols = new Set(cells.map(c => c.c));

    const fullRows = [...selRows].filter(r => {
      for (let c = 0; c < cols; c++) { if (!selectedCells.has(`${r},${c}`)) return false; }
      return true;
    }).sort((a, b) => b - a);

    const fullCols = [...selCols].filter(c => {
      for (let r = 0; r < rows; r++) { if (!selectedCells.has(`${r},${c}`)) return false; }
      return true;
    }).sort((a, b) => b - a);

    if (fullRows.length > 0 && card.rows - fullRows.length >= 1) {
      e.preventDefault(); pushUndo();
      fullRows.forEach(r => { card.cells.splice(r, 1); card.rowHeights.splice(r, 1); card.rows--; });
      selectedCells.clear(); sv(); buildMiroCanvas(); return;
    }
    if (fullCols.length > 0 && card.cols - fullCols.length >= 1) {
      e.preventDefault(); pushUndo();
      fullCols.forEach(c => { card.cells.forEach(row => row.splice(c, 1)); card.colWidths.splice(c, 1); card.cols--; });
      selectedCells.clear(); sv(); buildMiroCanvas(); return;
    }
  };
  document.addEventListener('keydown', gridKeyHandler);

  /* ── Edge + Buttons (inherit neighbor size) ── */
  const addRowTop = document.createElement('button');
  addRowTop.className = 'mg-edge-btn mg-edge-top'; addRowTop.innerHTML = '+';
  addRowTop.onclick = (e) => { e.stopPropagation(); pushUndo(); card.rows++; card.cells.unshift(Array(card.cols).fill('')); card.rowHeights.unshift(card.rowHeights[0] || 40); sv(); buildMiroCanvas(); };
  const addRowBot = document.createElement('button');
  addRowBot.className = 'mg-edge-btn mg-edge-bot'; addRowBot.innerHTML = '+';
  addRowBot.onclick = (e) => { e.stopPropagation(); pushUndo(); card.rows++; card.cells.push(Array(card.cols).fill('')); card.rowHeights.push(card.rowHeights[card.rowHeights.length - 1] || 40); sv(); buildMiroCanvas(); };
  const addColLeft = document.createElement('button');
  addColLeft.className = 'mg-edge-btn mg-edge-left'; addColLeft.innerHTML = '+';
  addColLeft.onclick = (e) => { e.stopPropagation(); pushUndo(); card.cols++; card.cells.forEach(r => r.unshift('')); card.colWidths.unshift(card.colWidths[0] || 120); sv(); buildMiroCanvas(); };
  const addColRight = document.createElement('button');
  addColRight.className = 'mg-edge-btn mg-edge-right'; addColRight.innerHTML = '+';
  addColRight.onclick = (e) => { e.stopPropagation(); pushUndo(); card.cols++; card.cells.forEach(r => r.push('')); card.colWidths.push(card.colWidths[card.colWidths.length - 1] || 120); sv(); buildMiroCanvas(); };

  /* ── Per-Column Hover Controls (3 buttons at each internal col border) ── */
  const svgPlus = `<svg viewBox="0 0 12 12"><line x1="6" y1="2" x2="6" y2="10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><line x1="2" y1="6" x2="10" y2="6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`;
  const svgBar = `<svg viewBox="0 0 12 12"><rect x="3" y="1" width="6" height="10" rx="1.5" fill="currentColor" opacity=".5"/></svg>`;

  let colCtrlX = 0;
  for (let c = 0; c < cols; c++) {
    colCtrlX += card.colWidths[c];
    if (c < cols - 1) {
      const inheritW = card.colWidths[c] || 120;
      // Top controls
      const ctrlTop = document.createElement('div');
      ctrlTop.className = 'mg-col-ctrl mg-col-ctrl-top';
      ctrlTop.style.left = colCtrlX + 'px';
      ctrlTop.style.top = '-32px';
      const btnBeforeT = document.createElement('button');
      btnBeforeT.className = 'mg-ctrl-btn'; btnBeforeT.innerHTML = svgPlus; btnBeforeT.title = 'Insert column before';
      btnBeforeT.onclick = (ev) => { ev.stopPropagation(); pushUndo(); card.cols++; card.cells.forEach(r => r.splice(c + 1, 0, '')); card.colWidths.splice(c + 1, 0, inheritW); sv(); buildMiroCanvas(); };
      const btnSelectT = document.createElement('button');
      btnSelectT.className = 'mg-ctrl-btn mg-ctrl-select'; btnSelectT.innerHTML = svgBar; btnSelectT.title = 'Select column';
      btnSelectT.onclick = (ev) => {
        ev.stopPropagation(); selectedCells.clear(); el.querySelectorAll('td.mg-sel').forEach(t => t.classList.remove('mg-sel'));
        for (let rr = 0; rr < rows; rr++) { selectedCells.add(`${rr},${c}`); const ce = el.querySelector(`td[data-row="${rr}"][data-col="${c}"]`); if (ce) ce.classList.add('mg-sel'); }
        updateMergeFloat();
      };
      const btnAfterT = document.createElement('button');
      btnAfterT.className = 'mg-ctrl-btn'; btnAfterT.innerHTML = svgPlus; btnAfterT.title = 'Insert column after';
      btnAfterT.onclick = (ev) => { ev.stopPropagation(); pushUndo(); card.cols++; card.cells.forEach(r => r.splice(c + 2, 0, '')); card.colWidths.splice(c + 2, 0, inheritW); sv(); buildMiroCanvas(); };
      ctrlTop.appendChild(btnBeforeT); ctrlTop.appendChild(btnSelectT); ctrlTop.appendChild(btnAfterT);
      el.appendChild(ctrlTop);
      // Bottom controls
      const ctrlBot = document.createElement('div');
      ctrlBot.className = 'mg-col-ctrl mg-col-ctrl-bot';
      ctrlBot.style.left = colCtrlX + 'px';
      ctrlBot.style.top = 'auto'; ctrlBot.style.bottom = '-32px';
      ctrlBot.appendChild(btnBeforeT.cloneNode(true)); ctrlBot.appendChild(btnSelectT.cloneNode(true)); ctrlBot.appendChild(btnAfterT.cloneNode(true));
      ctrlBot.querySelectorAll('.mg-ctrl-btn').forEach((btn, i) => {
        if (i === 0) btn.onclick = btnBeforeT.onclick;
        else if (i === 1) btn.onclick = btnSelectT.onclick;
        else btn.onclick = btnAfterT.onclick;
      });
      el.appendChild(ctrlBot);
      // Hover zones top & bottom
      const zoneTop = document.createElement('div');
      zoneTop.style.cssText = `position:absolute;top:-36px;left:${colCtrlX - 15}px;width:30px;height:36px;z-index:7;`;
      zoneTop.addEventListener('mouseenter', () => ctrlTop.classList.add('visible'));
      zoneTop.addEventListener('mouseleave', (e) => { if (!ctrlTop.contains(e.relatedTarget)) ctrlTop.classList.remove('visible'); });
      ctrlTop.addEventListener('mouseleave', (e) => { if (!zoneTop.contains(e.relatedTarget)) ctrlTop.classList.remove('visible'); });
      el.appendChild(zoneTop);
      const zoneBot = document.createElement('div');
      zoneBot.style.cssText = `position:absolute;bottom:-36px;left:${colCtrlX - 15}px;width:30px;height:36px;z-index:7;`;
      zoneBot.addEventListener('mouseenter', () => ctrlBot.classList.add('visible'));
      zoneBot.addEventListener('mouseleave', (e) => { if (!ctrlBot.contains(e.relatedTarget)) ctrlBot.classList.remove('visible'); });
      ctrlBot.addEventListener('mouseleave', (e) => { if (!zoneBot.contains(e.relatedTarget)) ctrlBot.classList.remove('visible'); });
      el.appendChild(zoneBot);
    }
  }

  /* ── Per-Row Hover Controls (Left + Right) ── */
  let rowCtrlY = 0;
  for (let r = 0; r < rows; r++) {
    rowCtrlY += card.rowHeights[r];
    if (r < rows - 1) {
      const inheritH = card.rowHeights[r] || 40;
      const selRowFn = (ev) => {
        ev.stopPropagation(); selectedCells.clear(); el.querySelectorAll('td.mg-sel').forEach(t => t.classList.remove('mg-sel'));
        for (let cc = 0; cc < cols; cc++) { selectedCells.add(`${r},${cc}`); const ce = el.querySelector(`td[data-row="${r}"][data-col="${cc}"]`); if (ce) ce.classList.add('mg-sel'); }
        updateMergeFloat();
      };
      const insBeforeFn = (ev) => { ev.stopPropagation(); pushUndo(); card.rows++; card.cells.splice(r + 1, 0, Array(card.cols).fill('')); card.rowHeights.splice(r + 1, 0, inheritH); sv(); buildMiroCanvas(); };
      const insAfterFn = (ev) => { ev.stopPropagation(); pushUndo(); card.rows++; card.cells.splice(r + 2, 0, Array(card.cols).fill('')); card.rowHeights.splice(r + 2, 0, inheritH); sv(); buildMiroCanvas(); };
      // Left controls
      const ctrlL = document.createElement('div');
      ctrlL.className = 'mg-row-ctrl mg-row-ctrl-left';
      ctrlL.style.top = rowCtrlY + 'px'; ctrlL.style.left = '-32px';
      const b1L = document.createElement('button'); b1L.className = 'mg-ctrl-btn'; b1L.innerHTML = svgPlus; b1L.title = 'Insert row before'; b1L.onclick = insBeforeFn;
      const b2L = document.createElement('button'); b2L.className = 'mg-ctrl-btn mg-ctrl-select'; b2L.innerHTML = svgBar; b2L.title = 'Select row'; b2L.onclick = selRowFn;
      const b3L = document.createElement('button'); b3L.className = 'mg-ctrl-btn'; b3L.innerHTML = svgPlus; b3L.title = 'Insert row after'; b3L.onclick = insAfterFn;
      ctrlL.appendChild(b1L); ctrlL.appendChild(b2L); ctrlL.appendChild(b3L);
      el.appendChild(ctrlL);
      // Right controls
      const ctrlR = document.createElement('div');
      ctrlR.className = 'mg-row-ctrl mg-row-ctrl-right';
      ctrlR.style.top = rowCtrlY + 'px'; ctrlR.style.left = 'auto'; ctrlR.style.right = '-32px';
      const b1R = document.createElement('button'); b1R.className = 'mg-ctrl-btn'; b1R.innerHTML = svgPlus; b1R.title = 'Insert row before'; b1R.onclick = insBeforeFn;
      const b2R = document.createElement('button'); b2R.className = 'mg-ctrl-btn mg-ctrl-select'; b2R.innerHTML = svgBar; b2R.title = 'Select row'; b2R.onclick = selRowFn;
      const b3R = document.createElement('button'); b3R.className = 'mg-ctrl-btn'; b3R.innerHTML = svgPlus; b3R.title = 'Insert row after'; b3R.onclick = insAfterFn;
      ctrlR.appendChild(b1R); ctrlR.appendChild(b2R); ctrlR.appendChild(b3R);
      el.appendChild(ctrlR);
      // Hover zones
      const zoneL = document.createElement('div');
      zoneL.style.cssText = `position:absolute;left:-36px;top:${rowCtrlY - 15}px;width:36px;height:30px;z-index:7;`;
      zoneL.addEventListener('mouseenter', () => ctrlL.classList.add('visible'));
      zoneL.addEventListener('mouseleave', (e) => { if (!ctrlL.contains(e.relatedTarget)) ctrlL.classList.remove('visible'); });
      ctrlL.addEventListener('mouseleave', (e) => { if (!zoneL.contains(e.relatedTarget)) ctrlL.classList.remove('visible'); });
      el.appendChild(zoneL);
      const zoneR = document.createElement('div');
      zoneR.style.cssText = `position:absolute;right:-36px;top:${rowCtrlY - 15}px;width:36px;height:30px;z-index:7;`;
      zoneR.addEventListener('mouseenter', () => ctrlR.classList.add('visible'));
      zoneR.addEventListener('mouseleave', (e) => { if (!ctrlR.contains(e.relatedTarget)) ctrlR.classList.remove('visible'); });
      ctrlR.addEventListener('mouseleave', (e) => { if (!zoneR.contains(e.relatedTarget)) ctrlR.classList.remove('visible'); });
      el.appendChild(zoneR);
    }
  }

  /* ── Column/Row Resizers ── */
  let currentX = 0;
  for (let c = 0; c < cols - 1; c++) {
    currentX += card.colWidths[c];
    const resizer = document.createElement('div');
    resizer.className = 'mg-col-resizer';
    resizer.style.left = currentX + 'px';
    resizer.onmousedown = (e) => {
      e.stopPropagation();
      const startX = e.clientX;
      const startW = card.colWidths[c];
      const page = cp(); const zoom = (page.zoom || 100) / 100;
      function onMove(ev) {
        card.colWidths[c] = Math.max(30, startW + (ev.clientX - startX) / zoom);
        colgroup.children[c].style.width = card.colWidths[c] + 'px';
        card.w = card.colWidths.reduce((a, b) => a + b, 0);
        el.style.width = card.w + 'px';
        table.style.width = card.w + 'px';
        let cx2 = 0;
        el.querySelectorAll('.mg-col-resizer').forEach((r, i) => { cx2 += card.colWidths[i]; r.style.left = cx2 + 'px'; });
      }
      function onUp() { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); sv(); buildMiroCanvas(); }
      document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp);
    };
    el.appendChild(resizer);
  }

  let currentY = 0;
  for (let r = 0; r < rows - 1; r++) {
    currentY += card.rowHeights[r];
    const resizer = document.createElement('div');
    resizer.className = 'mg-row-resizer';
    resizer.style.top = currentY + 'px';
    resizer.onmousedown = (e) => {
      e.stopPropagation();
      const startY = e.clientY;
      const startH = card.rowHeights[r];
      const page = cp(); const zoom = (page.zoom || 100) / 100;
      function onMove(ev) {
        card.rowHeights[r] = Math.max(20, startH + (ev.clientY - startY) / zoom);
        if (table.rows[r]) table.rows[r].style.height = card.rowHeights[r] + 'px';
        card.h = card.rowHeights.reduce((a, b) => a + b, 0);
        el.style.height = card.h + 'px';
        table.style.height = card.h + 'px';
        let cy2 = 0;
        el.querySelectorAll('.mg-row-resizer').forEach((r2, i) => { cy2 += card.rowHeights[i]; r2.style.top = cy2 + 'px'; });
      }
      function onUp() { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); sv(); buildMiroCanvas(); }
      document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp);
    };
    el.appendChild(resizer);
  }

  /* ── Modern Toolbar ── */
  const toolbar = document.createElement('div');
  toolbar.className = 'mg-toolbar';
  toolbar.dataset.gridId = card.id;
  const noFillActive = !card.fillColor || card.fillColor === 'none';

  // SVG icons for toolbar buttons
  const icons = {
    addRow: `<svg viewBox="0 0 16 16"><rect x="1" y="1" width="14" height="5" rx="1" fill="none" stroke="currentColor" stroke-width="1.4"/><rect x="1" y="10" width="14" height="5" rx="1" fill="none" stroke="currentColor" stroke-width="1.4"/><line x1="8" y1="6" x2="8" y2="10" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><line x1="6" y1="8" x2="10" y2="8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>`,
    removeRow: `<svg viewBox="0 0 16 16"><rect x="1" y="1" width="14" height="5" rx="1" fill="none" stroke="currentColor" stroke-width="1.4"/><rect x="1" y="10" width="14" height="5" rx="1" fill="none" stroke="currentColor" stroke-width="1.4"/><line x1="5" y1="8" x2="11" y2="8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`,
    addCol: `<svg viewBox="0 0 16 16"><rect x="1" y="1" width="5" height="14" rx="1" fill="none" stroke="currentColor" stroke-width="1.4"/><rect x="10" y="1" width="5" height="14" rx="1" fill="none" stroke="currentColor" stroke-width="1.4"/><line x1="6" y1="8" x2="10" y2="8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><line x1="8" y1="6" x2="8" y2="10" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>`,
    removeCol: `<svg viewBox="0 0 16 16"><rect x="1" y="1" width="5" height="14" rx="1" fill="none" stroke="currentColor" stroke-width="1.4"/><rect x="10" y="1" width="5" height="14" rx="1" fill="none" stroke="currentColor" stroke-width="1.4"/><line x1="6" y1="8" x2="10" y2="8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`,
    merge: `<svg viewBox="0 0 16 16"><rect x="1" y="1" width="14" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="1.4"/><line x1="8" y1="1" x2="8" y2="15" stroke="currentColor" stroke-width="1" stroke-dasharray="2 2"/><line x1="1" y1="8" x2="15" y2="8" stroke="currentColor" stroke-width="1" stroke-dasharray="2 2"/></svg>`,
    unmerge: `<svg viewBox="0 0 16 16"><rect x="1" y="1" width="14" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="1.4"/><line x1="8" y1="1" x2="8" y2="15" stroke="currentColor" stroke-width="1.4"/><line x1="1" y1="8" x2="15" y2="8" stroke="currentColor" stroke-width="1.4"/></svg>`,
    noStroke: `<svg viewBox="0 0 16 16"><line x1="3" y1="3" x2="13" y2="13" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>`,
    noFill: `<svg viewBox="0 0 16 16"><line x1="3" y1="3" x2="13" y2="13" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>`,
    chevron: `<svg viewBox="0 0 8 5" style="width:8px;height:5px"><polyline points="1,1 4,4 7,1" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`
  };

  function mkBtn(icon, title, onClick, extraClass) {
    const b = document.createElement('button');
    b.className = 'mg-tb-btn' + (extraClass ? ' ' + extraClass : '');
    b.innerHTML = icon;
    b.title = title;
    b.onclick = (e) => { e.stopPropagation(); onClick(e); };
    return b;
  }
  function mkSep() {
    const s = document.createElement('div');
    s.className = 'mg-tb-sep';
    return s;
  }

  // Add Row (inherit last row height)
  toolbar.appendChild(mkBtn(icons.addRow, 'Add Row', () => { pushUndo(); card.rows++; card.cells.push(Array(card.cols).fill('')); card.rowHeights.push(card.rowHeights[card.rowHeights.length - 1] || 40); sv(); buildMiroCanvas(); }));
  // Remove Row
  toolbar.appendChild(mkBtn(icons.removeRow, 'Remove Row', () => { if (card.rows <= 1) return; pushUndo(); card.rows--; card.cells.pop(); card.rowHeights.pop(); sv(); buildMiroCanvas(); }));

  toolbar.appendChild(mkSep());

  // Add Col (inherit last col width)
  toolbar.appendChild(mkBtn(icons.addCol, 'Add Column', () => { pushUndo(); card.cols++; card.cells.forEach(r => r.push('')); card.colWidths.push(card.colWidths[card.colWidths.length - 1] || 120); sv(); buildMiroCanvas(); }));
  // Remove Col
  toolbar.appendChild(mkBtn(icons.removeCol, 'Remove Column', () => { if (card.cols <= 1) return; pushUndo(); card.cols--; card.cells.forEach(r => r.pop()); card.colWidths.pop(); sv(); buildMiroCanvas(); }));

  toolbar.appendChild(mkSep());

  // Merge
  toolbar.appendChild(mkBtn(icons.merge, 'Merge Cells', () => {
    if (selectedCells.size < 2) return;
    pushUndo();
    const cells = [...selectedCells].map(s => { const [r, c] = s.split(',').map(Number); return { r, c }; });
    const minR = Math.min(...cells.map(c => c.r)), maxR = Math.max(...cells.map(c => c.r));
    const minC = Math.min(...cells.map(c => c.c)), maxC = Math.max(...cells.map(c => c.c));
    if (!card.merges) card.merges = [];
    card.merges = card.merges.filter(m => !(m.r >= minR && m.r <= maxR && m.c >= minC && m.c <= maxC));
    card.merges.push({ r: minR, c: minC, rs: maxR - minR + 1, cs: maxC - minC + 1 });
    sv(); buildMiroCanvas();
  }));
  // Unmerge
  toolbar.appendChild(mkBtn(icons.unmerge, 'Unmerge All', () => { pushUndo(); card.merges = []; sv(); buildMiroCanvas(); }));

  toolbar.appendChild(mkSep());

  // Cell Resize dropdown
  const resizeWrap = document.createElement('div');
  resizeWrap.className = 'mg-resize-wrap';
  const resizeBtn = document.createElement('button');
  resizeBtn.className = 'mg-resize-btn';
  resizeBtn.innerHTML = `Cell resize <span style="margin-left:2px">${(card.cellResize || 'manual') === 'manual' ? 'Manual' : 'Auto'}</span> ${icons.chevron}`;
  const resizeDrop = document.createElement('div');
  resizeDrop.className = 'mg-resize-drop';
  ['Auto', 'Manual'].forEach(opt => {
    const b = document.createElement('button');
    b.className = 'mg-resize-opt' + (((card.cellResize || 'manual') === opt.toLowerCase()) ? ' sel' : '');
    b.textContent = opt;
    b.onclick = (e) => {
      e.stopPropagation();
      card.cellResize = opt.toLowerCase();
      if (opt === 'Auto') {
        // Auto-distribute column widths evenly
        const totalW = card.colWidths.reduce((a, b) => a + b, 0);
        const evenW = Math.round(totalW / card.cols);
        card.colWidths = Array(card.cols).fill(evenW);
        const totalH = card.rowHeights.reduce((a, b) => a + b, 0);
        const evenH = Math.round(totalH / card.rows);
        card.rowHeights = Array(card.rows).fill(evenH);
      }
      sv(); buildMiroCanvas();
    };
    resizeDrop.appendChild(b);
  });
  resizeBtn.onclick = (e) => { e.stopPropagation(); resizeDrop.classList.toggle('show'); };
  resizeWrap.appendChild(resizeBtn);
  resizeWrap.appendChild(resizeDrop);
  toolbar.appendChild(resizeWrap);

  toolbar.appendChild(mkSep());

  // Border Color
  const borderClr = document.createElement('input');
  borderClr.type = 'color';
  borderClr.className = 'mg-tb-clr';
  borderClr.value = card.borderColor === 'none' ? '#000000' : card.borderColor;
  borderClr.title = 'Border Color';
  borderClr.oninput = function() { card.borderColor = this.value; if (card.borderWidth === 0) card.borderWidth = 1; sv(); buildMiroCanvas(); };
  toolbar.appendChild(borderClr);

  // Border Width (number input)
  const bwInput = document.createElement('input');
  bwInput.type = 'number'; bwInput.min = 0; bwInput.max = 20; bwInput.value = card.borderWidth || 1;
  bwInput.className = 'mg-tb-num';
  bwInput.title = 'Border Width';
  bwInput.oninput = function() { card.borderWidth = parseInt(this.value) || 0; sv(); buildMiroCanvas(); };
  bwInput.onclick = (e) => e.stopPropagation();
  bwInput.onmousedown = (e) => e.stopPropagation();
  toolbar.appendChild(bwInput);

  // No Stroke
  toolbar.appendChild(mkBtn(icons.noStroke, 'No Border', () => { card.borderWidth = 0; card.borderColor = 'none'; sv(); buildMiroCanvas(); }, (card.borderWidth === 0 || card.borderColor === 'none') ? 'active' : ''));

  toolbar.appendChild(mkSep());

  // Cell Background (with alpha)
  const cellClrWrap = document.createElement('div');
  cellClrWrap.className = 'mg-clr-alpha-wrap';
  cellClrWrap.title = 'Cell Background';
  const cellClr = document.createElement('input');
  cellClr.type = 'color';
  cellClr.className = 'mg-tb-clr';
  cellClr.value = '#ffffff';
  const cellAlpha = document.createElement('input');
  cellAlpha.type = 'number'; cellAlpha.min = 0; cellAlpha.max = 100; cellAlpha.value = 100;
  cellAlpha.className = 'mg-tb-num mg-tb-alpha-num';
  cellAlpha.title = 'Opacity (0-100)';
  cellAlpha.style.width = '32px';
  function applyCellBg() {
    const hex = cellClr.value;
    const a = Math.min(100, Math.max(0, parseInt(cellAlpha.value) || 100)) / 100;
    const r2 = parseInt(hex.slice(1,3),16), g2 = parseInt(hex.slice(3,5),16), b2 = parseInt(hex.slice(5,7),16);
    const rgba = `rgba(${r2},${g2},${b2},${a})`;
    if (!card.cellColors) card.cellColors = {};
    selectedCells.forEach(key => { card.cellColors[key] = rgba; });
    sv(); buildMiroCanvas();
  }
  cellClr.oninput = applyCellBg;
  cellAlpha.oninput = applyCellBg;
  cellAlpha.onclick = (e) => e.stopPropagation();
  cellAlpha.onmousedown = (e) => e.stopPropagation();
  cellClrWrap.appendChild(cellClr);
  cellClrWrap.appendChild(cellAlpha);
  toolbar.appendChild(cellClrWrap);

  // Clear Cell Fill
  toolbar.appendChild(mkBtn(icons.noFill, 'Clear Cell Fill', () => {
    if (card.cellColors) { selectedCells.forEach(key => { delete card.cellColors[key]; }); }
    sv(); buildMiroCanvas();
  }));

  toolbar.appendChild(mkSep());

  // Table Background
  const tableClr = document.createElement('input');
  tableClr.type = 'color';
  tableClr.className = 'mg-tb-clr';
  tableClr.value = (card.fillColor && card.fillColor !== 'none') ? card.fillColor : '#ffffff';
  tableClr.title = 'Table Background';
  tableClr.oninput = function() { card.fillColor = this.value; sv(); buildMiroCanvas(); };
  toolbar.appendChild(tableClr);

  // No Table Fill
  toolbar.appendChild(mkBtn(icons.noFill, 'No Table Fill', () => { card.fillColor = card.fillColor === 'none' ? '#ffffff' : 'none'; sv(); buildMiroCanvas(); }, noFillActive ? 'active' : ''));

  toolbar.appendChild(mkSep());

  // Header Color (with alpha)
  const hdrClrWrap = document.createElement('div');
  hdrClrWrap.className = 'mg-clr-alpha-wrap';
  hdrClrWrap.title = 'Header Row Color';
  const hdrClr = document.createElement('input');
  hdrClr.type = 'color';
  hdrClr.className = 'mg-tb-clr';
  hdrClr.value = card.headerColor === 'none' ? '#6c8fff' : (card.headerColor || '#6c8fff').replace(/rgba?\([^)]+\)/, '#6c8fff');
  const hdrAlpha = document.createElement('input');
  hdrAlpha.type = 'number'; hdrAlpha.min = 0; hdrAlpha.max = 100; hdrAlpha.value = 100;
  hdrAlpha.className = 'mg-tb-num mg-tb-alpha-num';
  hdrAlpha.title = 'Header Opacity (0-100)';
  hdrAlpha.style.width = '32px';
  function applyHdrColor() {
    Object.keys(card.cellColors || {}).forEach(k => { if (k.startsWith('0,')) delete card.cellColors[k]; });
    const hex = hdrClr.value;
    const a = Math.min(100, Math.max(0, parseInt(hdrAlpha.value) || 100)) / 100;
    const r2 = parseInt(hex.slice(1,3),16), g2 = parseInt(hex.slice(3,5),16), b2 = parseInt(hex.slice(5,7),16);
    card.headerColor = `rgba(${r2},${g2},${b2},${a})`;
    sv(); buildMiroCanvas();
  }
  hdrClr.oninput = applyHdrColor;
  hdrAlpha.oninput = applyHdrColor;
  hdrAlpha.onclick = (e) => e.stopPropagation();
  hdrAlpha.onmousedown = (e) => e.stopPropagation();
  hdrClrWrap.appendChild(hdrClr);
  hdrClrWrap.appendChild(hdrAlpha);
  toolbar.appendChild(hdrClrWrap);

  toolbar.appendChild(mkSep());

  // ── Text Formatting Tools ──
  // Text Color
  const txtClr = document.createElement('input');
  txtClr.type = 'color';
  txtClr.className = 'mg-tb-clr';
  txtClr.value = '#000000';
  txtClr.title = 'Text Color';
  txtClr.oninput = function() {
    if (!card.cellStyles) card.cellStyles = {};
    selectedCells.forEach(key => {
      if (!card.cellStyles[key]) card.cellStyles[key] = {};
      card.cellStyles[key].color = this.value;
    });
    sv(); buildMiroCanvas();
  };
  toolbar.appendChild(txtClr);

  toolbar.appendChild(mkSep());

  // Font Size (per-cell)
  const fsInput = document.createElement('input');
  fsInput.type = 'number'; fsInput.min = 6; fsInput.max = 72; fsInput.value = 12;
  fsInput.className = 'mg-tb-num';
  fsInput.title = 'Font Size (px)';
  fsInput.style.width = '32px';
  fsInput.oninput = function() {
    if (!card.cellStyles) card.cellStyles = {};
    const sz = parseInt(this.value) || 12;
    selectedCells.forEach(key => {
      if (!card.cellStyles[key]) card.cellStyles[key] = {};
      card.cellStyles[key].fontSize = sz;
    });
    sv(); buildMiroCanvas();
  };
  fsInput.onclick = (e) => e.stopPropagation();
  fsInput.onmousedown = (e) => e.stopPropagation();
  toolbar.appendChild(fsInput);

  // Bold toggle
  const svgBold = `<svg viewBox="0 0 16 16"><text x="3" y="13" font-size="14" font-weight="900" font-family="Arial" fill="currentColor">B</text></svg>`;
  toolbar.appendChild(mkBtn(svgBold, 'Bold', () => {
    if (!card.cellStyles) card.cellStyles = {};
    selectedCells.forEach(key => {
      if (!card.cellStyles[key]) card.cellStyles[key] = {};
      card.cellStyles[key].fontWeight = card.cellStyles[key].fontWeight === 'bold' ? 'normal' : 'bold';
    });
    sv(); buildMiroCanvas();
  }));

  toolbar.appendChild(mkSep());

  // Horizontal Alignment icons
  const svgAlignL = `<svg viewBox="0 0 16 16"><line x1="2" y1="4" x2="14" y2="4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><line x1="2" y1="8" x2="10" y2="8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><line x1="2" y1="12" x2="12" y2="12" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`;
  const svgAlignC = `<svg viewBox="0 0 16 16"><line x1="2" y1="4" x2="14" y2="4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><line x1="4" y1="8" x2="12" y2="8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><line x1="3" y1="12" x2="13" y2="12" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`;
  const svgAlignR = `<svg viewBox="0 0 16 16"><line x1="2" y1="4" x2="14" y2="4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><line x1="6" y1="8" x2="14" y2="8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><line x1="4" y1="12" x2="14" y2="12" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`;
  const svgVTop = `<svg viewBox="0 0 16 16"><line x1="2" y1="2" x2="14" y2="2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><line x1="8" y1="5" x2="8" y2="14" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><polyline points="5,8 8,5 11,8" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const svgVMid = `<svg viewBox="0 0 16 16"><line x1="2" y1="8" x2="14" y2="8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><line x1="8" y1="2" x2="8" y2="6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><line x1="8" y1="10" x2="8" y2="14" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>`;
  const svgVBot = `<svg viewBox="0 0 16 16"><line x1="2" y1="14" x2="14" y2="14" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><line x1="8" y1="2" x2="8" y2="11" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><polyline points="5,8 8,11 11,8" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

  function setAlign(prop, val) {
    if (!card.cellStyles) card.cellStyles = {};
    selectedCells.forEach(key => {
      if (!card.cellStyles[key]) card.cellStyles[key] = {};
      card.cellStyles[key][prop] = val;
    });
    sv(); buildMiroCanvas();
  }
  // ── Alignment Dropdown (combines 6 icons in one) ──
  const alignWrap = document.createElement('div');
  alignWrap.className = 'mg-resize-wrap';
  const alignBtn = document.createElement('button');
  alignBtn.className = 'mg-tb-btn'; alignBtn.title = 'Alignment';
  alignBtn.innerHTML = svgAlignL;
  const alignDrop = document.createElement('div');
  alignDrop.className = 'mg-resize-drop mg-align-drop';
  alignDrop.style.minWidth = '100px';
  const alignGrid = document.createElement('div');
  alignGrid.style.cssText = 'display:grid;grid-template-columns:repeat(3,28px);gap:2px;padding:2px;';
  function mkAlignBtn(icon, title, prop, val) {
    const b = document.createElement('button');
    b.className = 'mg-tb-btn'; b.innerHTML = icon; b.title = title;
    b.onclick = (e) => { e.stopPropagation(); setAlign(prop, val); alignDrop.classList.remove('show'); };
    return b;
  }
  alignGrid.appendChild(mkAlignBtn(svgAlignL, 'Left', 'textAlign', 'left'));
  alignGrid.appendChild(mkAlignBtn(svgAlignC, 'Center', 'textAlign', 'center'));
  alignGrid.appendChild(mkAlignBtn(svgAlignR, 'Right', 'textAlign', 'right'));
  alignGrid.appendChild(mkAlignBtn(svgVTop, 'Top', 'verticalAlign', 'top'));
  alignGrid.appendChild(mkAlignBtn(svgVMid, 'Middle', 'verticalAlign', 'middle'));
  alignGrid.appendChild(mkAlignBtn(svgVBot, 'Bottom', 'verticalAlign', 'bottom'));
  alignDrop.appendChild(alignGrid);
  alignBtn.onclick = (e) => { e.stopPropagation(); alignDrop.classList.toggle('show'); };
  alignWrap.appendChild(alignBtn);
  alignWrap.appendChild(alignDrop);
  toolbar.appendChild(alignWrap);

  // Prevent toolbar clicks from bubbling to grid drag handlers
  toolbar.addEventListener('mousedown', (e) => e.stopPropagation());

  /* ── Toolbar Click Toggle ── */
  /* Toolbar stays open as long as table is clicked/selected; only hides when clicking outside */
  el.addEventListener('click', (e) => {
    if (e.target.closest('.mc-del') || e.target.closest('.mg-toolbar') || e.target.closest('.mg-merge-float')) return;
    document.querySelectorAll('.mg-toolbar.show').forEach(t => { if (t !== toolbar) t.classList.remove('show'); });
    toolbar.classList.add('show');
    positionToolbarAt(e.clientX, e.clientY);
  });
  const docClickHandler = (e) => {
    if (!document.body.contains(el)) { document.removeEventListener('click', docClickHandler); return; }
    if (!el.contains(e.target) && !toolbar.contains(e.target)) { toolbar.classList.remove('show'); resizeDrop.classList.remove('show'); alignDrop.classList.remove('show'); }
  };
  document.addEventListener('click', docClickHandler);

  /* ── Drag (grid body) ── */
  el.addEventListener('mousedown', (e) => {
    if (
      e.target.closest('.mc-del') ||
      e.target.closest('.mg-toolbar') ||
      e.target.closest('.mc-resize-br') ||
      e.target.closest('.mc-resize-bl') ||
      e.target.closest('.mc-resize-tr') ||
      e.target.closest('.mc-resize-tl') ||
      e.target.closest('.mg-edge-btn') ||
      e.target.closest('.mg-row-resizer') ||
      e.target.closest('.mg-col-resizer') ||
      e.target.closest('.mg-ctrl-btn') ||
      e.target.closest('.mg-merge-float') ||
      e.target.closest('.mc-edge-resize') ||
      e.target.closest('[class^="mc-resize-"]') ||
      e.target.closest('.mg-drag-handle') ||
      e.target.closest('td')
    ) return;

    if (e.button === 1) return; // middle-click: always let bubble for panning
    e.stopPropagation();
    if (e.ctrlKey || e.metaKey) { toggleMiroSelect(card.id); return; }
    if (!_miroSelected.has(card.id)) { clearMiroSelection(); addMiroSelect(card.id); }

    const page = cp(); const zoom = (page.zoom || 100) / 100;
    const startX = e.clientX, startY = e.clientY;

    const cGx = card.x || 0, cGy = card.y || 0, cGw = card.w || 360, cGh = card.h || 120;
    if (page.miroCards) {
      page.miroCards.forEach(c => {
        if (c.id === card.id) return;
        const cx = c.x || 0, cy = c.y || 0, cw = c.w || 280, ch = c.h || 240;
        const intersects = !(cx + cw < cGx || cx > cGx + cGw || cy + ch < cGy || cy > cGy + cGh);
        if (intersects && !_miroSelected.has(c.id)) addMiroSelect(c.id);
      });
    }

    const origPositions = new Map();
    _miroSelected.forEach(cid => { const c2 = (page.miroCards || []).find(x => x.id === cid); if (c2) origPositions.set(cid, { x: c2.x || 0, y: c2.y || 0 }); });
    let moved = false;
    function onMove(ev) {
      moved = true; const dx = (ev.clientX - startX) / zoom, dy = (ev.clientY - startY) / zoom;
      origPositions.forEach((orig, cid) => {
        const c2 = (page.miroCards || []).find(x => x.id === cid); if (!c2) return; c2.x = orig.x + dx; c2.y = orig.y + dy;
        const cardEl = document.querySelector(`[data-cid="${cid}"]`); if (cardEl) { cardEl.style.left = c2.x + 'px'; cardEl.style.top = c2.y + 'px'; }
      }); updateMiroSelFrame();
    }
    function onUp() { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); if (moved) sv(); }
    document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp);
  });

  miroSetupCardDrag(el, card, ['.mg-col-handle', '.mg-row-handle', '.mc-del', 'td', '.mg-ctrl-btn', '.mg-merge-float', '.mc-edge-resize', '[class^="mc-resize-"]', '.mg-edge-btn', '.mg-row-resizer', '.mg-col-resizer', '.mg-drag-handle', '.mg-toolbar']);

  // Lock UI
  attachLockUI(el, card);

  /* ── Drag Handle (move table + everything on top) ── */
  const dragHandle = document.createElement('div');
  dragHandle.className = 'mg-drag-handle';
  dragHandle.title = 'Drag to move table and elements on top';
  dragHandle.addEventListener('mousedown', (e) => {
    if (e.button === 1) return;
    e.stopPropagation();
    if (!_miroSelected.has(card.id)) { clearMiroSelection(); addMiroSelect(card.id); }

    const page = cp(); const zoom = (page.zoom || 100) / 100;
    const startX = e.clientX, startY = e.clientY;

    // Select all elements that overlap the table bounds
    const cGx = card.x || 0, cGy = card.y || 0, cGw = card.w || 360, cGh = card.h || 120;
    if (page.miroCards) {
      page.miroCards.forEach(c => {
        if (c.id === card.id) return;
        const cx = c.x || 0, cy = c.y || 0, cw = c.w || 280, ch = c.h || 240;
        const intersects = !(cx + cw < cGx || cx > cGx + cGw || cy + ch < cGy || cy > cGy + cGh);
        if (intersects && !_miroSelected.has(c.id)) addMiroSelect(c.id);
      });
    }

    const origPositions = new Map();
    _miroSelected.forEach(cid => { const c2 = (page.miroCards || []).find(x => x.id === cid); if (c2) origPositions.set(cid, { x: c2.x || 0, y: c2.y || 0 }); });
    let moved = false;
    function onMove(ev) {
      moved = true; const dx = (ev.clientX - startX) / zoom, dy = (ev.clientY - startY) / zoom;
      origPositions.forEach((orig, cid) => {
        const c2 = (page.miroCards || []).find(x => x.id === cid); if (!c2) return; c2.x = orig.x + dx; c2.y = orig.y + dy;
        const cardEl = document.querySelector(`[data-cid="${cid}"]`); if (cardEl) { cardEl.style.left = c2.x + 'px'; cardEl.style.top = c2.y + 'px'; }
      }); updateMiroSelFrame();
    }
    function onUp() { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); if (moved) sv(); }
    document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp);
  });
  el.appendChild(dragHandle);

  /* ── Corner Resize Handles (whole table) ── */
  ['br','bl','tr','tl'].forEach(corner => {
    const handle = document.createElement('div');
    handle.className = `mc-resize-${corner}`;
    handle.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      const startX = e.clientX, startY = e.clientY;
      const startW = card.w, startH = card.h;
      const startCardX = card.x || 0, startCardY = card.y || 0;
      const startColWidths = [...card.colWidths], startRowHeights = [...card.rowHeights];
      const pg = cp(); const zoom = (pg.zoom || 100) / 100;
      function onMove(ev) {
        let dx = (ev.clientX - startX) / zoom, dy = (ev.clientY - startY) / zoom;
        if (corner === 'tl' || corner === 'bl') dx = -dx;
        if (corner === 'tl' || corner === 'tr') dy = -dy;
        const scaleX = Math.max(0.2, (startW + dx) / startW);
        const scaleY = Math.max(0.2, (startH + dy) / startH);
        card.colWidths = startColWidths.map(w => Math.max(30, Math.round(w * scaleX)));
        card.rowHeights = startRowHeights.map(h => Math.max(20, Math.round(h * scaleY)));
        card.w = card.colWidths.reduce((a, b) => a + b, 0);
        card.h = card.rowHeights.reduce((a, b) => a + b, 0);
        if (corner === 'tl' || corner === 'bl') card.x = startCardX + startW - card.w;
        if (corner === 'tl' || corner === 'tr') card.y = startCardY + startH - card.h;
        el.style.left = card.x + 'px'; el.style.top = card.y + 'px';
        el.style.width = card.w + 'px'; el.style.height = card.h + 'px';
        table.style.width = card.w + 'px'; table.style.height = card.h + 'px';
      }
      function onUp() { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); sv(); buildMiroCanvas(); }
      document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp);
    });
    el.appendChild(handle);
  });

  /* ── Edge Resize Handles (sides) ── */
  ['top','bottom','left','right'].forEach(side => {
    const edge = document.createElement('div');
    edge.className = `mc-edge-resize mc-edge-resize-${side}`;
    edge.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      const startX = e.clientX, startY = e.clientY;
      const startW = card.w, startH = card.h;
      const startCardX2 = card.x || 0, startCardY2 = card.y || 0;
      const startColWidths = [...card.colWidths], startRowHeights = [...card.rowHeights];
      const pg = cp(); const zoom = (pg.zoom || 100) / 100;
      function onMove(ev) {
        if (side === 'right' || side === 'left') {
          let dx = (ev.clientX - startX) / zoom;
          if (side === 'left') dx = -dx;
          const scaleX = Math.max(0.2, (startW + dx) / startW);
          card.colWidths = startColWidths.map(w => Math.max(30, Math.round(w * scaleX)));
          card.w = card.colWidths.reduce((a, b) => a + b, 0);
          if (side === 'left') card.x = startCardX2 + startW - card.w;
        } else {
          let dy = (ev.clientY - startY) / zoom;
          if (side === 'top') dy = -dy;
          const scaleY = Math.max(0.2, (startH + dy) / startH);
          card.rowHeights = startRowHeights.map(h => Math.max(20, Math.round(h * scaleY)));
          card.h = card.rowHeights.reduce((a, b) => a + b, 0);
          if (side === 'top') card.y = startCardY2 + startH - card.h;
        }
        el.style.left = (card.x || 0) + 'px'; el.style.top = (card.y || 0) + 'px';
        el.style.width = card.w + 'px'; el.style.height = card.h + 'px';
        table.style.width = card.w + 'px'; table.style.height = card.h + 'px';
      }
      function onUp() { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); sv(); buildMiroCanvas(); }
      document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp);
    });
    el.appendChild(edge);
  });

  el.appendChild(del);
  // Toolbar lives in document.body to escape transform containing block
  document.body.appendChild(toolbar);
  el.appendChild(mergeFloat);
  el.appendChild(addRowTop);
  el.appendChild(addColLeft);
  el.appendChild(table);
  el.appendChild(addRowBot);
  el.appendChild(addColRight);
  return el;
}

/* ─── Mind Map Widget ─── */
function buildMiroMindMap(card) {
  const el = document.createElement('div');
  el.className = 'miro-mindmap';
  el.dataset.cid = card.id;
  el.style.left = (card.x || 0) + 'px';
  el.style.top = (card.y || 0) + 'px';
  el.style.width = (card.w || 600) + 'px';
  el.style.height = (card.h || 400) + 'px';

  const del = document.createElement('button');
  del.className = 'mc-del'; del.textContent = '✕';
  del.onclick = (e) => { e.stopPropagation(); deleteMiroCard(card.id); };

  // Render tree as SVG + HTML nodes
  const container = document.createElement('div');
  container.className = 'mm-container';
  container.style.cssText = 'position:relative;width:100%;height:100%;';

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;overflow:visible;';
  container.appendChild(svg);

  function layoutTree(node, depth, yOffset, maxH) {
    const nodeW = 120, nodeH = 32, hGap = 160, vGap = 12;
    const x = depth * hGap + 20;
    const children = node.children || [];
    let totalH = 0;

    if (children.length === 0) {
      totalH = nodeH;
    } else {
      children.forEach(child => {
        const childH = layoutTree(child, depth + 1, yOffset + totalH, maxH);
        totalH += childH + vGap;
      });
      totalH -= vGap;
    }

    const y = yOffset + totalH / 2 - nodeH / 2;
    node._x = x; node._y = y; node._w = nodeW; node._h = nodeH;

    // Draw connecting lines
    children.forEach(child => {
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      const x1 = x + nodeW, y1 = y + nodeH / 2;
      const x2 = child._x, y2 = child._y + nodeH / 2;
      const cx = (x1 + x2) / 2;
      line.setAttribute('d', `M${x1},${y1} C${cx},${y1} ${cx},${y2} ${x2},${y2}`);
      line.setAttribute('fill', 'none');
      line.setAttribute('stroke', node.color || '#6c8fff');
      line.setAttribute('stroke-width', '2');
      line.setAttribute('opacity', '0.6');
      svg.appendChild(line);
    });

    // Create node element
    const nodeEl = document.createElement('div');
    nodeEl.className = 'mm-node';
    nodeEl.tabIndex = 0; // make focusable
    const bgColor = node.color || '#6c8fff';
    // Auto-contrast text color
    const hex = bgColor.replace('#', '');
    const rr = parseInt(hex.substr(0, 2), 16) || 0, gg = parseInt(hex.substr(2, 2), 16) || 0, bb = parseInt(hex.substr(4, 2), 16) || 0;
    const luma = (rr * 299 + gg * 587 + bb * 114) / 1000;
    const textColor = luma > 140 ? '#1a1a2e' : '#ffffff';
    nodeEl.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:${nodeW}px;height:${nodeH}px;background:${bgColor};border-radius:16px;display:flex;align-items:center;justify-content:center;color:${textColor};font-size:.68rem;font-weight:600;cursor:pointer;user-select:none;padding:0 8px;outline:none;`;
    nodeEl.textContent = node.text || 'Topic';

    // Click to select node
    nodeEl.addEventListener('click', (e) => {
      e.stopPropagation();
      container.querySelectorAll('.mm-node').forEach(n => n.classList.remove('mm-selected'));
      nodeEl.classList.add('mm-selected');
      nodeEl.focus();
    });

    // Tab/Enter/Delete on focused/selected node
    nodeEl.addEventListener('keydown', (ke) => {
      if (nodeEl.contentEditable === 'true') {
        // In edit mode
        if (ke.key === 'Tab') {
          ke.preventDefault();
          node.text = nodeEl.textContent.trim() || 'Topic';
          nodeEl.contentEditable = false;
          if (!node.children) node.children = [];
          node.children.push({ id: uid(), text: 'New', color: node.color || '#6c8fff', children: [] });
          sv(); buildMiroCanvas();
        } else if (ke.key === 'Enter') {
          ke.preventDefault();
          node.text = nodeEl.textContent.trim() || 'Topic';
          nodeEl.contentEditable = false;
          function addSibEdit(parent) { if (!parent.children) return false; const idx = parent.children.findIndex(c => c.id === node.id); if (idx >= 0) { parent.children.splice(idx + 1, 0, { id: uid(), text: 'New', color: node.color || '#6c8fff', children: [] }); return true; } return parent.children.some(c => addSibEdit(c)); }
          addSibEdit(card.root);
          sv(); buildMiroCanvas();
        } else if (ke.key === 'Escape') { ke.preventDefault(); nodeEl.contentEditable = false; nodeEl.blur(); }
        return;
      }
      // Not in edit mode, just selected
      ke.preventDefault();
      if (ke.key === 'Tab') {
        if (!node.children) node.children = [];
        node.children.push({ id: uid(), text: 'New', color: node.color || '#6c8fff', children: [] });
        sv(); buildMiroCanvas();
      } else if (ke.key === 'Enter') {
        function addSib(parent) { if (!parent.children) return false; const idx = parent.children.findIndex(c => c.id === node.id); if (idx >= 0) { parent.children.splice(idx + 1, 0, { id: uid(), text: 'New', color: node.color || '#6c8fff', children: [] }); return true; } return parent.children.some(c => addSib(c)); }
        addSib(card.root);
        sv(); buildMiroCanvas();
      } else if (ke.key === 'Delete' || ke.key === 'Backspace') {
        if (depth > 0) { removeNodeById(card.root, node.id); sv(); buildMiroCanvas(); }
      }
    });

    // Double-click to edit text
    nodeEl.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      nodeEl.contentEditable = true;
      nodeEl.focus();
      nodeEl.style.outlineColor = '#fff';
    });

    // Color picker via right-click (contextmenu)
    const colors = ['#ff6b6b', '#ff922b', '#ffd43b', '#51cf66', '#339af0', '#6c8fff', '#cc5de8', '#f06595', '#ffffff', '#adb5bd', '#495057', '#212529'];
    nodeEl.addEventListener('contextmenu', (e) => {
      e.preventDefault(); e.stopPropagation();
      // Remove existing popups
      container.querySelectorAll('.mm-color-pop').forEach(p => p.remove());
      const pop = document.createElement('div');
      pop.className = 'mm-color-pop';
      pop.style.cssText = `position:absolute;left:${x + nodeW + 8}px;top:${y - 4}px;background:rgba(30,30,50,.95);border:1px solid rgba(255,255,255,.15);border-radius:10px;padding:6px;display:flex;flex-wrap:wrap;gap:4px;width:116px;z-index:20;`;
      colors.forEach(c => {
        const sw = document.createElement('div');
        sw.style.cssText = `width:20px;height:20px;border-radius:50%;cursor:pointer;background:${c};border:2px solid ${c === node.color ? '#fff' : 'transparent'};`;
        sw.onclick = (ev) => { ev.stopPropagation(); node.color = c; sv(); buildMiroCanvas(); };
        pop.appendChild(sw);
      });
      container.appendChild(pop);
      const closePopup = (ev) => { if (!pop.contains(ev.target)) { pop.remove(); document.removeEventListener('click', closePopup); } };
      setTimeout(() => document.addEventListener('click', closePopup), 10);
    });

    // Add child button
    const addBtn = document.createElement('button');
    addBtn.className = 'mm-add';
    addBtn.textContent = '+';
    addBtn.style.cssText = 'position:absolute;right:-22px;top:50%;transform:translateY(-50%);width:24px;height:24px;border-radius:50%;border:none;background:rgba(108,143,255,.8);color:#fff;font-size:.8rem;cursor:pointer;display:none;align-items:center;justify-content:center;line-height:1;';
    addBtn.onclick = (e) => {
      e.stopPropagation();
      if (!node.children) node.children = [];
      node.children.push({ id: uid(), text: 'New', color: node.color || '#6c8fff', children: [] });
      sv(); buildMiroCanvas();
    };
    nodeEl.appendChild(addBtn);
    nodeEl.addEventListener('mouseenter', () => { addBtn.style.display = 'flex'; });
    nodeEl.addEventListener('mouseleave', () => { if (!nodeEl.classList.contains('mm-selected')) addBtn.style.display = 'none'; });

    // Delete node (non-root)
    if (depth > 0) {
      const rmBtn = document.createElement('button');
      rmBtn.className = 'mm-rm';
      rmBtn.textContent = '×';
      rmBtn.style.cssText = 'position:absolute;left:-22px;top:50%;transform:translateY(-50%);width:24px;height:24px;border-radius:50%;border:none;background:rgba(255,60,60,.8);color:#fff;font-size:.85rem;cursor:pointer;display:none;align-items:center;justify-content:center;line-height:1;';
      rmBtn.onclick = (e) => {
        e.stopPropagation();
        removeNodeById(card.root, node.id);
        sv(); buildMiroCanvas();
      };
      nodeEl.appendChild(rmBtn);
      nodeEl.addEventListener('mouseenter', () => { rmBtn.style.display = 'flex'; });
      nodeEl.addEventListener('mouseleave', () => { rmBtn.style.display = 'none'; });
    }

    container.appendChild(nodeEl);
    return totalH;
  }

  function removeNodeById(parent, id) {
    if (!parent.children) return;
    parent.children = parent.children.filter(c => c.id !== id);
    parent.children.forEach(c => removeNodeById(c, id));
  }

  if (card.root) {
    layoutTree(card.root, 0, 20, card.h || 400);
  }

  // Drag (via global helper)
  miroSetupCardDrag(el, card, ['.mc-del', '.mm-add', '.mm-rm']);

  el.appendChild(del);
  el.appendChild(container);
  return el;
}

/* ─── Bookmark Widget ─── */
function buildMiroBookmarkWidget(card) {
  const el = document.createElement('div');
  el.className = 'miro-widget edit'; // re-uses normal widget styles plus absolute overrides
  el.dataset.cid = card.id;
  el.style.left = (card.x || 0) + 'px';
  el.style.top = (card.y || 0) + 'px';
  el.style.width = (card.w || 320) + 'px';
  el.style.height = (card.h || 400) + 'px';
  el.style.position = 'absolute';
  el.style.overflow = 'hidden';

  // Apply colors if any defaults specified (fallback to standard dark mode logic)
  const c = card.color || { r: 50, g: 50, b: 50, a: 0.8 };
  // Luma calculation copy-pasted for consistency
  const light = ((c.r * 299 + c.g * 587 + c.b * 114) / 1000) > 140;
  const txtCol = light ? '#111' : '#dde1ee';
  const muCol = light ? '#666' : 'rgba(255,255,255,.42)';
  const bdCol = light ? 'rgba(0,0,0,.1)' : `rgba(255,255,255,${Math.min(c.a * 0.13, 0.09)})`;
  el.style.cssText += `background:rgba(${c.r},${c.g},${c.b},${c.a});border:1px solid ${bdCol};color:${txtCol};--w-tx:${txtCol};--w-mu:${muCol};`;

  // Custom Header
  const hdr = document.createElement('div');
  hdr.className = 'wh';
  hdr.style.borderBottomColor = bdCol;

  // Widget Body wrapper
  const body = document.createElement('div');
  body.className = 'wb';
  body.style.height = 'calc(100% - 32px)';
  body.style.overflowY = card.display === 'stream' ? 'auto' : 'hidden';

  // Calculate minimum height dynamically to fit all links
  const getMinH = () => {
    // Make sure we have enough scroll room or height room
    // Use the inner wrapper to get the TRUE un-stretched content height
    const contentH = body.firstElementChild ? body.firstElementChild.scrollHeight : 60;
    return contentH + (hdr.offsetHeight || 32) + 2;
  };

  // Header Actions
  hdr.innerHTML = `
    <div class="wt" style="color:${muCol}">
      <span class="bm-emoji" title="Double click to edit" style="cursor:text">${card.emoji || '📌'}</span>
      <span class="bm-title" title="Double click to edit" style="cursor:text;flex:1">${card.title || 'Bookmarks'}</span>
    </div>
    <div class="wa">
      <button class="wab" data-cl="${card.id}" title="Change Color">🎨</button>
      ${card.wType === 'note' || card.wType === 'todo' ? '' : '<button class="wab" data-grid="' + card.id + '" title="Grid View">🔲</button><button class="wab" data-list="' + card.id + '" title="List View">📄</button><button class="wab" data-explode="' + card.id + '" title="Extract all links to canvas">🗃️</button>'}
      <button class="wab" data-dp="${card.id}" title="Display Settings">🖥️</button>
      <button class="wab d mc-del" title="Delete">🗑️</button>
    </div>
  `;

  // Grid/List toggle behavior
  hdr.querySelector('[data-grid]').onclick = (e) => {
    e.stopPropagation();
    card.display = 'spark';
    card.size = 'lg';
    body.style.overflowY = 'hidden';
    body.innerHTML = '';
    buildBmBody(body, card);
    // Explicitly shrink bounds to new content
    const bestH = getMinH();
    card.h = bestH;
    el.style.height = bestH + 'px';
    if (typeof sv === 'function') sv();
  };
  hdr.querySelector('[data-list]').onclick = (e) => {
    e.stopPropagation();
    card.display = 'stream';
    body.style.overflowY = 'auto';
    body.innerHTML = '';
    buildBmBody(body, card);
    // Explicitly shrink bounds to new content
    const bestH = getMinH();
    card.h = bestH;
    el.style.height = bestH + 'px';
    if (typeof sv === 'function') sv();
  };

  // Color picker
  const clBtn = hdr.querySelector('[data-cl]');
  if (clBtn) {
    clBtn.onclick = (e) => {
      e.stopPropagation();
      openColModal(card.id);
    };
  }

  // Inline Editing
  const emojiSpan = hdr.querySelector('.bm-emoji');
  if (emojiSpan) {
    emojiSpan.ondblclick = (e) => {
      e.stopPropagation();
      emojiSpan.contentEditable = true;
      emojiSpan.focus();
    };
    emojiSpan.onblur = () => {
      emojiSpan.contentEditable = false;
      card.emoji = emojiSpan.textContent;
      if (typeof sv === 'function') sv();
    };
    emojiSpan.onkeydown = (e) => { if (e.key === 'Enter') emojiSpan.blur(); };
  }

  const titleSpan = hdr.querySelector('.bm-title');
  if (titleSpan) {
    titleSpan.ondblclick = (e) => {
      e.stopPropagation();
      titleSpan.contentEditable = true;
      titleSpan.focus();
    };
    titleSpan.onblur = () => {
      titleSpan.contentEditable = false;
      card.title = titleSpan.textContent;
      if (typeof sv === 'function') sv();
    };
    titleSpan.onkeydown = (e) => { if (e.key === 'Enter') titleSpan.blur(); };
  }

  // Explode behavior
  const expBtn = hdr.querySelector('[data-explode]');
  if (expBtn) {
    expBtn.onclick = (e) => {
      e.stopPropagation();
      if (typeof explodeMiroWidget === 'function') explodeMiroWidget(card.id);
    };
  }

  // Apply Settings behavior
  const dpBtn = hdr.querySelector('[data-dp]');
  if (dpBtn) {
    dpBtn.onclick = (e) => {
      e.stopPropagation();
      openDisp(card.id);
    };
  }

  // Delete behavior
  const delBtn = hdr.querySelector('.mc-del');
  if (delBtn) {
    delBtn.onclick = (e) => {
      e.stopPropagation();
      deleteMiroCard(card.id);
    };
  }

  el.appendChild(hdr);

  // Use the existing dashboard bodies to populate items!
  if (card.wType === 'note') {
    const ta = document.createElement('textarea');
    ta.className = 'note-ta';
    ta.placeholder = 'Write notes…';
    ta.value = card.content || '';
    ta.style.color = txtCol;
    ta.style.width = '100%';
    ta.style.height = '100%';
    ta.style.resize = 'none';
    ta.style.background = 'transparent';
    ta.style.border = 'none';
    ta.style.outline = 'none';
    ta.style.fontFamily = 'inherit';
    ta.style.padding = '8px';
    ta.oninput = () => {
      card.content = ta.value;
      if (typeof sv === 'function') sv();
    };
    body.appendChild(ta);
  } else if (card.wType === 'todo') {
    if (typeof buildTodoBody === 'function') buildTodoBody(body, card);
  } else {
    if (typeof buildBmBody === 'function') buildBmBody(body, card);
  }

  el.appendChild(body);

  // Drag logic (bypass drag on links, delete buttons, add buttons, settings, options)
  const ignoreSelectors = ['.mc-del', '.mc-lock', '.rmb', '.add-i', '.wab', '.sp-it', '.st-it', '.cd-it', '.cl-it', '.mc-resize-br', '.mc-resize-bl', '.mc-resize-tr', '.mc-resize-tl', '.mc-resize-t', '.mc-resize-b', '.mc-resize-l', '.mc-resize-r', '.mg-toolbar', '.sn-toolbar', '.msh-toolbar', '.mt-toolbar'];
  if (typeof miroSetupCardDrag === 'function') {
    miroSetupCardDrag(el, card, ignoreSelectors);
  }

  // Handle dropping bookmarks into this Miro widget
  el.addEventListener('dragover', (e) => {
    if ((typeof _dragInboxId !== 'undefined' && _dragInboxId) ||
      (typeof _dragBmId !== 'undefined' && _dragBmId)) {
      e.preventDefault();
      el.style.outline = '2px solid var(--ac)';
    }
  });
  el.addEventListener('dragleave', () => {
    el.style.outline = '';
  });
  el.addEventListener('drop', (e) => {
    if (typeof _dragInboxId !== 'undefined' && _dragInboxId) {
      e.preventDefault();
      el.style.outline = '';
      const inboxItem = (typeof D !== 'undefined' && D.inbox || []).find((x) => x.id === _dragInboxId);
      if (inboxItem) {
        if (!card.items) card.items = [];
        card.items.push({ id: (typeof uid === 'function' ? uid() : Date.now().toString()), label: inboxItem.label, url: inboxItem.url, emoji: '' });
        D.inbox = D.inbox.filter((x) => x.id !== _dragInboxId);
        _dragInboxId = null;
        if (typeof sv === 'function') sv();
        if (typeof buildMiroCanvas === 'function') buildMiroCanvas();
        if (typeof buildInbox === 'function') buildInbox();
      }
    } else if (typeof _dragBmId !== 'undefined' && _dragBmId && typeof _dragBmSrcWid !== 'undefined') {
      e.preventDefault();
      el.style.outline = '';
      const page = typeof cp === 'function' ? cp() : null;
      if (!page) return;
      let srcW = (page.widgets || []).find(x => x.id === _dragBmSrcWid);
      if (!srcW && page.miroCards) srcW = page.miroCards.find(x => x.id === _dragBmSrcWid);
      if (!srcW) return;

      const bmItemIdx = (srcW.items || []).findIndex(x => x.id === _dragBmId);
      if (bmItemIdx >= 0) {
        const bmItem = srcW.items.splice(bmItemIdx, 1)[0];
        if (!card.items) card.items = [];
        card.items.push(bmItem);
        _dragBmId = null;
        _dragBmSrcWid = null;
        if (typeof sv === 'function') sv();
        if (typeof buildCols === 'function' && typeof _miroMode !== 'undefined' && !_miroMode) buildCols();
        if (typeof buildMiroCanvas === 'function') buildMiroCanvas();
      }
    }
  });

  // Dynamically determine the absolute minimum we allow the user to manually squish the widget.
  // In 'spark' (grid) mode, we rigidly lock it to the exact icons wrapper height.
  // In 'stream' (list) mode, we let them shrink it to 80px and the overflow scrollbar kicks in.
  const getManualMinH = () => card.display === 'stream' ? 80 : getMinH();

  // Sizing anchors
  attach8WayResize(el, card, 130, getManualMinH);

  // Ensure minimum height on load or when content might have changed
  setTimeout(() => {
    if (el.isConnected) {
      const bestH = getMinH();
      // Only force expand the widget if it is totally new (!card.h) 
      // OR if it's the rigid spark grid where we ignore how small the user tried to make it
      if (!card.h || (card.display !== 'stream' && card.h < bestH)) {
        card.h = bestH;
        el.style.height = bestH + 'px';
        if (typeof sv === 'function') sv();
      }
    }
  }, 10);

  // Lock UI
  attachLockUI(el, card);

  return el;
}

/* ─── Trello List Widget (single floating list) ─── */
// Global drag state for cross-list card dragging
let _trelloDragData = null;

function buildMiroTrello(card) {
  const el = document.createElement('div');
  el.className = 'miro-trello' + (card.taskMode ? ' task-mode' : '');
  el.dataset.cid = card.id;
  el.style.left = (card.x || 0) + 'px';
  el.style.top = (card.y || 0) + 'px';
  el.style.width = (card.w || 260) + 'px';
  if (card.autofit !== false) {
    el.style.height = 'auto';
  } else {
    el.style.height = (card.h || 380) + 'px';
  }

  // Init data
  if (!card.cards) card.cards = [];
  if (!card.archived) card.archived = [];
  if (!card.listColor) card.listColor = '#6c8fff';
  if (!card.title) card.title = 'List';
  if (card.bgColor === undefined) card.bgColor = 'transparent';

  el.style.background = card.bgColor;

  // ─── Color bar ───
  const colorBar = document.createElement('div');
  colorBar.className = 'tl-color-bar';
  colorBar.style.background = card.listColor;
  colorBar.style.cursor = 'pointer';
  colorBar.title = 'Change list color';
  colorBar.onclick = (e) => {
    e.stopPropagation();
    const inp = document.createElement('input');
    inp.type = 'color'; inp.value = card.listColor;
    inp.style.cssText = 'position:absolute;opacity:0;pointer-events:none;';
    el.appendChild(inp); inp.click();
    inp.oninput = () => { card.listColor = inp.value; colorBar.style.background = inp.value; sv(); };
    inp.onchange = () => inp.remove();
    inp.addEventListener('blur', () => inp.remove());
  };

  // ─── Header ───
  const header = document.createElement('div');
  header.className = 'tl-header';
  const titleEl = document.createElement('input');
  titleEl.className = 'tl-title';
  titleEl.type = 'text';
  titleEl.value = card.title;
  titleEl.spellcheck = false;
  titleEl.addEventListener('change', () => { card.title = titleEl.value; sv(); });
  titleEl.addEventListener('mousedown', (e) => e.stopPropagation());

  // Task mode toggle
  const taskToggle = document.createElement('label');
  taskToggle.className = 'tl-task-toggle';
  taskToggle.title = 'Task mode';
  const taskCb = document.createElement('input');
  taskCb.type = 'checkbox';
  taskCb.checked = !!card.taskMode;
  taskCb.onchange = () => {
    card.taskMode = taskCb.checked;
    el.classList.toggle('task-mode', card.taskMode);
    updateProgress();
    sv();
  };
  taskCb.addEventListener('mousedown', (e) => e.stopPropagation());
  taskToggle.appendChild(taskCb);
  taskToggle.appendChild(document.createTextNode('Tasks'));

  const countEl = document.createElement('span');
  countEl.className = 'tl-count';
  function updateCount() {
    countEl.textContent = card.cards.length;
  }
  updateCount();

  const del = document.createElement('button');
  del.className = 'mc-del';
  del.textContent = '✕';
  del.onclick = (e) => { e.stopPropagation(); deleteMiroCard(card.id); };

  header.appendChild(titleEl);
  header.appendChild(taskToggle);
  header.appendChild(countEl);
  header.appendChild(del);

  // ─── Progress Bar ───
  const progressWrap = document.createElement('div');
  progressWrap.className = 'tl-progress-wrap';
  const progressBar = document.createElement('div');
  progressBar.className = 'tl-progress-bar';
  const progressFill = document.createElement('div');
  progressFill.className = 'tl-progress-fill';
  progressBar.appendChild(progressFill);
  const progressLabel = document.createElement('div');
  progressLabel.className = 'tl-progress-label';
  progressWrap.appendChild(progressBar);
  progressWrap.appendChild(progressLabel);

  function updateProgress() {
    if (!card.taskMode) return;
    let totalWeight = 0, doneWeight = 0;
    card.cards.forEach(c => {
      const w = c.weight != null ? c.weight : 100;
      totalWeight += w;
      if (c.done) doneWeight += w;
    });
    const pct = totalWeight > 0 ? Math.round((doneWeight / totalWeight) * 100) : 0;
    progressFill.style.width = pct + '%';
    progressLabel.textContent = pct + '% (' + card.cards.filter(c => c.done).length + '/' + card.cards.length + ')';
  }
  updateProgress();

  // ─── Card Body ───
  const body = document.createElement('div');
  body.className = 'tl-body';

  // Drop zone
  body.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    body.classList.add('drag-over');
  });
  body.addEventListener('dragleave', (ev) => {
    if (!body.contains(ev.relatedTarget)) body.classList.remove('drag-over');
  });
  body.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    body.classList.remove('drag-over');
    if (!_trelloDragData) return;
    const { srcCardObj, srcListCards } = _trelloDragData;
    // Remove from source list
    const srcIdx = srcListCards.indexOf(srcCardObj);
    if (srcIdx >= 0) srcListCards.splice(srcIdx, 1);
    // Insert at drop position
    const afterEl = getTrelloDragAfter(body, e.clientY);
    if (afterEl) {
      const afterIdx = [...body.querySelectorAll('.tl-card')].indexOf(afterEl);
      if (afterIdx >= 0) card.cards.splice(afterIdx, 0, srcCardObj);
      else card.cards.push(srcCardObj);
    } else {
      card.cards.push(srcCardObj);
    }
    _trelloDragData = null;
    sv(); buildMiroCanvas(); buildOutline();
  });

  function linkify(text) {
    return text.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
  }

  function buildCardEl(c, ci, isArchived) {
    const cardEl = document.createElement('div');
    cardEl.className = 'tl-card' + (c.done ? ' done' : '');
    if (c.bgColor) cardEl.style.background = c.bgColor;
    if (c.textColor) { cardEl.style.color = c.textColor; }
    if (!isArchived) {
      cardEl.draggable = true;
      cardEl.addEventListener('dragstart', (e) => {
        e.stopPropagation();
        _trelloDragData = { srcCardObj: c, srcListCards: card.cards };
        cardEl.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', c.id);
      });
      cardEl.addEventListener('dragend', () => {
        cardEl.classList.remove('dragging');
        _trelloDragData = null;
      });
    }

    const check = document.createElement('input');
    check.type = 'checkbox';
    check.className = 'tl-check';
    check.checked = !!c.done;
    check.onchange = () => {
      c.done = check.checked;
      cardEl.classList.toggle('done', c.done);
      updateProgress();
      sv();
    };
    check.addEventListener('mousedown', (e) => e.stopPropagation());

    const txt = document.createElement('div');
    txt.className = 'tl-text';
    txt.contentEditable = !isArchived;
    txt.spellcheck = false;
    if (c.html) { txt.innerHTML = c.html; }
    else { txt.textContent = c.text || ''; }

    if (!isArchived) {
      // Image paste
      txt.addEventListener('paste', (e) => {
        const items = e.clipboardData?.items;
        if (!items) return;
        for (const item of items) {
          if (item.type.startsWith('image/')) {
            e.preventDefault();
            const file = item.getAsFile();
            const reader = new FileReader();
            reader.onload = () => {
              const img = document.createElement('img');
              img.src = reader.result;
              txt.appendChild(img);
              c.html = txt.innerHTML; sv();
            };
            reader.readAsDataURL(file);
            return;
          }
        }
      });
      // Image drop
      txt.addEventListener('drop', (e) => {
        const files = e.dataTransfer?.files;
        if (files && files.length > 0 && files[0].type.startsWith('image/')) {
          e.preventDefault(); e.stopPropagation();
          const reader = new FileReader();
          reader.onload = () => {
            const img = document.createElement('img');
            img.src = reader.result;
            txt.appendChild(img);
            c.html = txt.innerHTML; sv();
          };
          reader.readAsDataURL(files[0]);
        }
      });
      txt.addEventListener('blur', () => {
        const hasContent = txt.textContent.trim() || txt.querySelector('img');
        if (!hasContent) {
          card.cards.splice(ci, 1);
          sv(); renderCards(); updateCount(); updateProgress();
          return;
        }
        const html = txt.innerHTML;
        const linkified = linkify(html);
        txt.innerHTML = linkified;
        c.html = linkified;
        c.text = txt.textContent;
        sv();
      });
      txt.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          const hasContent = txt.textContent.trim() || txt.querySelector('img');
          if (hasContent) {
            c.html = txt.innerHTML; c.text = txt.textContent;
            const newCard = { id: uid(), text: '', done: false };
            card.cards.splice(ci + 1, 0, newCard);
            sv(); renderCards(); updateCount(); updateProgress();
            setTimeout(() => {
              const allTexts = body.querySelectorAll('.tl-text');
              if (allTexts[ci + 1]) allTexts[ci + 1].focus();
            }, 30);
          } else { txt.blur(); }
        }
        if (e.key === 'Escape') { txt.blur(); }
      });
      txt.addEventListener('mousedown', (e) => e.stopPropagation());
      txt.addEventListener('click', (e) => {
        if (e.target.tagName === 'A') { e.preventDefault(); window.open(e.target.href, '_blank'); }
      });
    }

    // Weight tag
    const weight = c.weight != null ? c.weight : 100;
    if (weight !== 100 && card.taskMode) {
      const wtag = document.createElement('span');
      wtag.className = 'tl-weight';
      wtag.textContent = weight + '%';
      wtag.title = 'Task weight';
      cardEl.appendChild(wtag);
    }

    // Card actions
    const actions = document.createElement('div');
    actions.className = 'tl-card-actions';

    if (!isArchived) {
      // Color picker
      const colorBtn = document.createElement('button');
      colorBtn.textContent = '🎨';
      colorBtn.title = 'Card color';
      colorBtn.onclick = (e) => {
        e.stopPropagation();
        const inp = document.createElement('input');
        inp.type = 'color'; inp.value = c.bgColor || '#ffffff';
        inp.style.cssText = 'position:absolute;opacity:0;pointer-events:none;';
        cardEl.appendChild(inp); inp.click();
        inp.oninput = () => { c.bgColor = inp.value; cardEl.style.background = inp.value; sv(); };
        inp.onchange = () => inp.remove();
        inp.addEventListener('blur', () => inp.remove());
      };
      actions.appendChild(colorBtn);

      // Weight button (only in task mode)
      if (card.taskMode) {
        const wBtn = document.createElement('button');
        wBtn.textContent = '⚖';
        wBtn.title = 'Set weight (%)';
        wBtn.onclick = (e) => {
          e.stopPropagation();
          const val = prompt('Card weight (%)', c.weight != null ? c.weight : 100);
          if (val !== null) {
            c.weight = Math.max(1, parseInt(val) || 100);
            sv(); renderCards(); updateCount(); updateProgress();
          }
        };
        actions.appendChild(wBtn);
      }

      // Archive button
      const archiveBtn = document.createElement('button');
      archiveBtn.textContent = '📥';
      archiveBtn.title = 'Archive card';
      archiveBtn.onclick = (e) => {
        e.stopPropagation();
        card.cards.splice(ci, 1);
        card.archived.push(c);
        sv(); renderCards(); renderArchive(); updateCount(); updateProgress();
      };
      actions.appendChild(archiveBtn);

      // Delete button
      const cdel = document.createElement('button');
      cdel.textContent = '✕';
      cdel.title = 'Delete card';
      cdel.style.color = '#e55';
      cdel.onclick = (e) => {
        e.stopPropagation();
        card.cards.splice(ci, 1);
        sv(); renderCards(); updateCount(); updateProgress();
      };
      actions.appendChild(cdel);
    } else {
      // Restore from archive
      const restoreBtn = document.createElement('button');
      restoreBtn.textContent = '↩';
      restoreBtn.title = 'Restore card';
      restoreBtn.onclick = (e) => {
        e.stopPropagation();
        const idx = card.archived.indexOf(c);
        if (idx >= 0) card.archived.splice(idx, 1);
        card.cards.push(c);
        sv(); renderCards(); renderArchive(); updateCount(); updateProgress();
      };
      actions.appendChild(restoreBtn);

      const permDel = document.createElement('button');
      permDel.textContent = '✕';
      permDel.title = 'Delete permanently';
      permDel.style.color = '#e55';
      permDel.onclick = (e) => {
        e.stopPropagation();
        const idx = card.archived.indexOf(c);
        if (idx >= 0) card.archived.splice(idx, 1);
        sv(); renderArchive();
      };
      actions.appendChild(permDel);
    }

    cardEl.appendChild(check);
    cardEl.appendChild(txt);
    cardEl.appendChild(actions);
    return cardEl;
  }

  function renderCards() {
    body.innerHTML = '';
    card.cards.forEach((c, ci) => {
      body.appendChild(buildCardEl(c, ci, false));
    });
  }
  renderCards();

  // ─── Archive Section ───
  const archiveToggle = document.createElement('button');
  archiveToggle.className = 'tl-archive-toggle';
  const archiveArrow = document.createElement('span');
  archiveArrow.className = 'tl-arrow';
  archiveArrow.textContent = '▶';
  const archiveLabel = document.createElement('span');
  archiveToggle.appendChild(archiveArrow);
  archiveToggle.appendChild(archiveLabel);

  const archiveBody = document.createElement('div');
  archiveBody.className = 'tl-archive-body';

  archiveToggle.onclick = (e) => {
    e.stopPropagation();
    archiveToggle.classList.toggle('open');
    archiveBody.classList.toggle('show');
  };

  function renderArchive() {
    archiveBody.innerHTML = '';
    archiveLabel.textContent = 'Archive (' + card.archived.length + ')';
    if (card.archived.length === 0) {
      archiveToggle.style.display = 'none';
    } else {
      archiveToggle.style.display = 'flex';
    }
    card.archived.forEach((c, ci) => {
      archiveBody.appendChild(buildCardEl(c, ci, true));
    });
  }
  renderArchive();

  // ─── Add Card Button ───
  const addBtn = document.createElement('button');
  addBtn.className = 'tl-add';
  addBtn.innerHTML = '+ Add card';
  addBtn.onclick = (e) => {
    e.stopPropagation();
    card.cards.push({ id: uid(), text: '', done: false });
    sv(); renderCards(); updateCount(); updateProgress();
    setTimeout(() => {
      const allTexts = body.querySelectorAll('.tl-text');
      const last = allTexts[allTexts.length - 1];
      if (last) last.focus();
    }, 30);
  };

  el.appendChild(colorBar);
  el.appendChild(header);
  el.appendChild(progressWrap);
  el.appendChild(body);
  el.appendChild(addBtn);
  el.appendChild(archiveToggle);
  el.appendChild(archiveBody);

  // Drag
  miroSetupCardDrag(el, card, ['.mc-del', '.mc-lock', '.tl-title', '.tl-card', '.tl-text', '.tl-check', '.tl-add', '.tl-del', '.tl-color-bar', '.tl-card-actions', '.tl-task-toggle', '.tl-archive-toggle', '.tl-archive-body', '.tl-weight']);

  // Resize
  attach8WayResize(el, card, 180, 100);

  // Lock UI
  attachLockUI(el, card);

  return el;
}

// Helper: find card element to insert before during drop
function getTrelloDragAfter(container, y) {
  const els = [...container.querySelectorAll('.tl-card:not(.dragging)')];
  let closest = null;
  let closestOffset = Number.NEGATIVE_INFINITY;
  els.forEach(child => {
    const box = child.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    if (offset < 0 && offset > closestOffset) {
      closestOffset = offset;
      closest = child;
    }
  });
  return closest;
}

// ─── Array Widget: Tile a single image at original size, supports 2D ───
function buildMiroArray(card) {
  if (!card.rows) card.rows = 1;
  if (!card.cols) card.cols = 1;
  if (card.gap === undefined) card.gap = 0;
  // Safety clamps to prevent corrupted data from freezing
  card.rows = Math.min(Math.max(1, card.rows), 100);
  card.cols = Math.min(Math.max(1, card.cols), 100);
  card.gap = Math.min(Math.max(0, card.gap), 200);
  // Compute and PERSIST tileW/tileH on first use to prevent feedback loop
  // (card.w gets overwritten to totalW each render, so we must NOT fallback to card.w)
  if (!card.tileW || !isFinite(card.tileW) || card.tileW > 5000) card.tileW = 300;
  if (!card.tileH || !isFinite(card.tileH) || card.tileH > 5000) card.tileH = 200;
  const tw = card.tileW;
  const th = card.tileH;

  // 2D support: outer grid (with safety clamps)
  const r2 = Math.min(Math.max(1, card.rows2 || 1), 50);
  const c2 = Math.min(Math.max(1, card.cols2 || 1), 50);
  const g2 = Math.min(Math.max(0, card.gap2 || 0), 200);

  // Inner block size
  const innerW = card.cols * tw + (card.cols - 1) * card.gap;
  const innerH = card.rows * th + (card.rows - 1) * card.gap;
  // Total container size
  const totalW = c2 * innerW + (c2 - 1) * g2;
  const totalH = r2 * innerH + (r2 - 1) * g2;

  const el = document.createElement('div');
  el.className = 'miro-array';
  el.dataset.cid = card.id;
  el.style.left = (card.x || 0) + 'px';
  el.style.top = (card.y || 0) + 'px';
  el.style.width = totalW + 'px';
  el.style.height = totalH + 'px';
  card.w = totalW;
  card.h = totalH;

  // Delete button
  const del = document.createElement('button');
  del.className = 'mc-del';
  del.textContent = '✕';
  del.onclick = (e) => { e.stopPropagation(); deleteMiroCard(card.id); };

  // Build one inner grid block
  function buildInnerGrid() {
    const grid = document.createElement('div');
    grid.className = 'ma-grid';
    grid.style.display = 'grid';
    grid.style.gridTemplateColumns = `repeat(${card.cols}, ${tw}px)`;
    grid.style.gridTemplateRows = `repeat(${card.rows}, ${th}px)`;
    grid.style.gap = card.gap + 'px';
    // S2 stroke around the inner grid block (applied at outer level)
    if (card.s2Width && card.s2Width > 0) {
      grid.style.border = `${card.s2Width}px solid ${card.s2Color || '#333'}`;
    }
    return grid;
  }

  // Create ONE source image (browser loads once)
  let srcImg = null;
  if (card.imageUrl) {
    srcImg = document.createElement('img');
    srcImg.src = card.imageUrl;
    srcImg.draggable = false;
    srcImg.style.width = tw + 'px';
    srcImg.style.height = th + 'px';
    srcImg.style.objectFit = 'fill';
    srcImg.style.display = 'block';
  }

  function fillGrid(grid) {
    const n = card.rows * card.cols;
    for (let i = 0; i < n; i++) {
      const tileWrap = document.createElement('div');
      tileWrap.style.width = tw + 'px';
      tileWrap.style.height = th + 'px';
      tileWrap.style.overflow = 'hidden';
      // S1 stroke around each individual tile
      if (card.s1Width && card.s1Width > 0) {
        tileWrap.style.border = `${card.s1Width}px solid ${card.s1Color || '#333'}`;
        tileWrap.style.boxSizing = 'border-box';
      }
      if (srcImg) {
        const img = srcImg.cloneNode(true);
        img.style.width = '100%';
        img.style.height = '100%';
        tileWrap.appendChild(img);
      } else {
        tileWrap.className = 'ma-tile ma-empty';
        tileWrap.textContent = '📎';
      }
      grid.appendChild(tileWrap);
    }
  }

  // Determine rendering: 1D or 2D
  let contentEl;
  const is2D = card.rows2 !== undefined || card.cols2 !== undefined;
  if (is2D) {
    // Outer grid of inner grids
    contentEl = document.createElement('div');
    contentEl.className = 'ma-outer-grid';
    contentEl.style.display = 'grid';
    contentEl.style.gridTemplateColumns = `repeat(${c2}, ${innerW + (card.s2Width || 0) * 2}px)`;
    contentEl.style.gridTemplateRows = `repeat(${r2}, ${innerH + (card.s2Width || 0) * 2}px)`;
    contentEl.style.gap = g2 + 'px';
    const outerCount = r2 * c2;
    for (let j = 0; j < outerCount; j++) {
      const ig = buildInnerGrid();
      fillGrid(ig);
      contentEl.appendChild(ig);
    }
  } else {
    contentEl = buildInnerGrid();
    fillGrid(contentEl);
  }

  // ─── Toolbar ───
  const toolbar = document.createElement('div');
  toolbar.className = 'ma-toolbar';

  // Helper: create a number input (NO auto-apply — deferred)
  function mkInput(labelText, value, min, step) {
    step = step || 1;
    const grp = document.createElement('span');
    grp.className = 'ma-num-group';
    const lbl = document.createElement('span');
    lbl.className = 'ma-lbl';
    lbl.textContent = labelText;
    const inp = document.createElement('input');
    inp.type = 'number';
    inp.className = 'ma-input';
    inp.value = value;
    inp.min = min;
    inp.step = step;
    inp.onmousedown = (e) => e.stopPropagation();
    inp.onclick = (e) => e.stopPropagation();
    grp.appendChild(lbl);
    grp.appendChild(inp);
    grp._inp = inp;
    return grp;
  }

  // Row 1: Inner array controls
  const row1 = document.createElement('div');
  row1.className = 'ma-toolbar-row';
  const r1Grp = mkInput('R1', card.rows, 1);
  const c1Grp = mkInput('C1', card.cols, 1);
  const g1Grp = mkInput('G1', card.gap, 0, 2);
  row1.appendChild(r1Grp);
  row1.appendChild(c1Grp);
  row1.appendChild(g1Grp);
  toolbar.appendChild(row1);

  // Row 2: 2D controls
  let r2Grp, c2Grp, g2Grp;
  if (is2D) {
    const row2 = document.createElement('div');
    row2.className = 'ma-toolbar-row';
    r2Grp = mkInput('R2', r2, 1);
    c2Grp = mkInput('C2', c2, 1);
    g2Grp = mkInput('G2', g2, 0, 2);
    row2.appendChild(r2Grp);
    row2.appendChild(c2Grp);
    row2.appendChild(g2Grp);
    toolbar.appendChild(row2);
  }

  // Row 3: Stroke controls
  const row3 = document.createElement('div');
  row3.className = 'ma-toolbar-row';

  // S1 — stroke around each tile
  const s1Lbl = document.createElement('span');
  s1Lbl.className = 'ma-lbl';
  s1Lbl.textContent = 'S1';
  row3.appendChild(s1Lbl);
  const s1WGrp = mkInput('W', card.s1Width || 0, 0);
  row3.appendChild(s1WGrp);
  const s1Color = document.createElement('input');
  s1Color.type = 'color';
  s1Color.value = card.s1Color || '#333333';
  s1Color.title = 'S1 Color';
  s1Color.className = 'ma-color-input';
  s1Color.onmousedown = (e) => e.stopPropagation();
  row3.appendChild(s1Color);

  // S2 — stroke around each inner grid block
  const s2Lbl = document.createElement('span');
  s2Lbl.className = 'ma-lbl';
  s2Lbl.textContent = 'S2';
  s2Lbl.style.marginLeft = '8px';
  row3.appendChild(s2Lbl);
  const s2WGrp = mkInput('W', card.s2Width || 0, 0);
  row3.appendChild(s2WGrp);
  const s2Color = document.createElement('input');
  s2Color.type = 'color';
  s2Color.value = card.s2Color || '#333333';
  s2Color.title = 'S2 Color';
  s2Color.className = 'ma-color-input';
  s2Color.onmousedown = (e) => e.stopPropagation();
  row3.appendChild(s2Color);

  toolbar.appendChild(row3);

  // Row 4: Execute button
  const row4 = document.createElement('div');
  row4.className = 'ma-toolbar-row';
  row4.style.justifyContent = 'center';
  const execBtn = document.createElement('button');
  execBtn.className = 'ma-exec-btn';
  execBtn.textContent = '▶ Execute';
  execBtn.title = 'Apply all changes';
  execBtn.onmousedown = (e) => e.preventDefault();
  execBtn.onclick = (e) => {
    e.stopPropagation();
    pushUndo();
    // Read all inputs and apply
    card.rows = Math.max(1, parseInt(r1Grp._inp.value) || 1);
    card.cols = Math.max(1, parseInt(c1Grp._inp.value) || 1);
    card.gap = Math.max(0, parseInt(g1Grp._inp.value) || 0);
    if (is2D && r2Grp && c2Grp && g2Grp) {
      card.rows2 = Math.max(1, parseInt(r2Grp._inp.value) || 1);
      card.cols2 = Math.max(1, parseInt(c2Grp._inp.value) || 1);
      card.gap2 = Math.max(0, parseInt(g2Grp._inp.value) || 0);
    }
    // Stroke values
    card.s1Width = Math.max(0, parseInt(s1WGrp._inp.value) || 0);
    card.s1Color = s1Color.value;
    card.s2Width = Math.max(0, parseInt(s2WGrp._inp.value) || 0);
    card.s2Color = s2Color.value;
    sv(); buildMiroCanvas();
  };
  row4.appendChild(execBtn);
  toolbar.appendChild(row4);

  // Drag + lock + resize
  miroSetupCardDrag(el, card, ['.mc-del', '.ma-toolbar', '.mc-lock', '.mc-resize-br', '.mc-resize-bl', '.mc-resize-tr', '.mc-resize-tl', '.mc-resize-t', '.mc-resize-b', '.mc-resize-l', '.mc-resize-r']);

  // Custom array resize: uses CSS transform scale on content for smooth live preview
  const origW = card.w, origH = card.h;
  ['br', 'bl', 'tr', 'tl'].forEach(corner => {
    const handle = document.createElement('div');
    handle.className = 'mc-resize-' + corner;
    handle.addEventListener('mousedown', (e) => {
      if (card.locked) return;
      e.stopPropagation();
      e.preventDefault();
      const page = cp();
      const zoom = (page.zoom || 100) / 100;
      const sx = e.clientX, sy = e.clientY;
      const startW = card.w, startH = card.h;
      const startX = card.x || 0, startY = card.y || 0;
      const startTW = card.tileW, startTH = card.tileH;
      const aspect = startW / startH;
      pushUndo();

      function onMove(ev) {
        const dx = (ev.clientX - sx) / zoom;
        const dy = (ev.clientY - sy) / zoom;
        let nw = startW, nh = startH, nx = startX, ny = startY;
        if (corner === 'br') { nw = startW + dx; nh = startH + dy; }
        else if (corner === 'bl') { nw = startW - dx; nh = startH + dy; nx = startX + dx; }
        else if (corner === 'tr') { nw = startW + dx; nh = startH - dy; ny = startY + dy; }
        else if (corner === 'tl') { nw = startW - dx; nh = startH - dy; nx = startX + dx; ny = startY + dy; }
        // Shift = lock aspect ratio
        if (ev.shiftKey) {
          const s = Math.max(nw / startW, nh / startH);
          nw = startW * s; nh = startH * s;
          if (corner === 'bl' || corner === 'tl') nx = startX + startW - nw;
          if (corner === 'tr' || corner === 'tl') ny = startY + startH - nh;
        }
        nw = Math.max(40, nw); nh = Math.max(40, nh);
        // Scale content visually
        const scaleX = nw / startW, scaleY = nh / startH;
        contentEl.style.transform = `scale(${scaleX}, ${scaleY})`;
        contentEl.style.transformOrigin = corner.includes('t') ? 'bottom' : 'top';
        if (corner.includes('l')) contentEl.style.transformOrigin += ' right';
        else contentEl.style.transformOrigin += ' left';
        // Update container position/size
        el.style.width = nw + 'px'; el.style.height = nh + 'px';
        el.style.left = nx + 'px'; el.style.top = ny + 'px';
        card.w = nw; card.h = nh; card.x = nx; card.y = ny;
        updateMiroSelFrame();
      }
      function onUp() {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        contentEl.style.transform = '';
        contentEl.style.transformOrigin = '';
        // Recalculate tileW/tileH from new size
        const scaleX = card.w / startW, scaleY = card.h / startH;
        card.tileW = Math.max(10, startTW * scaleX);
        card.tileH = Math.max(10, startTH * scaleY);
        sv(); buildMiroCanvas();
      }
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
    el.appendChild(handle);
  });

  attachLockUI(el, card);

  el.appendChild(del);
  el.appendChild(contentEl);
  el.appendChild(toolbar);
  return el;
}

// Convert an image card to a 1D Array
function convertImageToArray(cardId) {
  const page = cp();
  const card = (page.miroCards || []).find(c => c.id === cardId);
  if (!card) return;
  pushUndo();
  card.tileW = card.w || 300;
  card.tileH = card.h || 200;
  card.type = 'array';
  card.rows = 1; card.cols = 1; card.gap = 0;
  sv(); buildMiroCanvas();
}

// Convert an existing array to 2D Array (or directly from image)
function make2DArray(cardId) {
  const page = cp();
  const card = (page.miroCards || []).find(c => c.id === cardId);
  if (!card) return;
  pushUndo();
  // If it's still an image, convert to array first
  if (card.type === 'image') {
    card.tileW = card.w || 300;
    card.tileH = card.h || 200;
    card.type = 'array';
    card.rows = 1; card.cols = 1; card.gap = 0;
  }
  if (card.type !== 'array') return;
  card.rows2 = card.rows2 || 1;
  card.cols2 = card.cols2 || 1;
  card.gap2 = card.gap2 || 0;
  sv(); buildMiroCanvas();
}

/* ─── Google Calendar Widget ─── */
function buildMiroCalendar(card) {
  const el = document.createElement('div');
  el.className = 'miro-calendar';
  el.dataset.cid = card.id;
  el.style.left = (card.x || 0) + 'px';
  el.style.top = (card.y || 0) + 'px';
  el.style.width = (card.w || 700) + 'px';
  el.style.height = (card.h || 800) + 'px';
  el.style.position = 'absolute';
  el.style.background = '#1a1c2e';
  el.style.borderRadius = '10px';
  el.style.overflow = 'hidden';
  el.style.display = 'flex';
  el.style.flexDirection = 'column';
  el.style.border = '1px solid rgba(108,143,255,.2)';
  el.style.boxShadow = '0 4px 24px rgba(0,0,0,.4)';
  el.style.fontFamily = 'var(--font)';

  // Header — all buttons in one row, no overlap
  const hdr = document.createElement('div');
  hdr.style.cssText = 'display:flex;align-items:center;justify-content:center;padding:4px 6px;background:rgba(108,143,255,.08);border-bottom:1px solid rgba(255,255,255,.08);flex-shrink:0;gap:3px;flex-wrap:wrap;';

  const title = document.createElement('span');
  title.style.cssText = 'font-weight:700;font-size:.72rem;color:#ccc;white-space:nowrap;';
  title.textContent = '\u{1F4C5}';

  // ─── Btn helper ───
  const _cb = (text, tip, fn) => {
    const b = document.createElement('button');
    b.style.cssText = 'background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.12);border-radius:5px;color:#aaa;font-size:.55rem;padding:2px 5px;cursor:pointer;font-family:var(--font);';
    b.textContent = text; b.title = tip;
    b.onclick = (e) => { e.stopPropagation(); fn(); };
    return b;
  };
  const _days = () => card.calView === '3day' ? 3 : 7;

  // ◀ Prev period
  const prevBtn = _cb('◀', 'Previous period', () => {
    if (!card.calOffset) card.calOffset = 0;
    card.calOffset -= _days(); sv();
    if (typeof renderCalendarContent === 'function') renderCalendarContent(el, card);
  });

  // ‹ Prev day
  const prevDayBtn = _cb('‹', 'Previous day', () => {
    if (!card.calOffset) card.calOffset = 0;
    card.calOffset--; sv();
    if (typeof renderCalendarContent === 'function') renderCalendarContent(el, card);
  });

  // Today
  const todayBtn = _cb('Today', 'Go to today', () => {
    card.calOffset = 0; sv();
    if (typeof renderCalendarContent === 'function') renderCalendarContent(el, card);
  });

  // › Next day
  const nextDayBtn = _cb('›', 'Next day', () => {
    if (!card.calOffset) card.calOffset = 0;
    card.calOffset++; sv();
    if (typeof renderCalendarContent === 'function') renderCalendarContent(el, card);
  });

  // ▶ Next period
  const nextBtn = _cb('▶', 'Next period', () => {
    if (!card.calOffset) card.calOffset = 0;
    card.calOffset += _days(); sv();
    if (typeof renderCalendarContent === 'function') renderCalendarContent(el, card);
  });

  // View toggle (3-day / week)
  const viewBtn = document.createElement('button');
  viewBtn.style.cssText = 'background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.12);border-radius:5px;color:#aaa;font-size:.55rem;padding:2px 6px;cursor:pointer;font-family:var(--font);';
  viewBtn.textContent = card.calView === '3day' ? '3D' : 'Wk';
  viewBtn.title = 'Toggle Week / 3-Day';
  viewBtn.onclick = (e) => {
    e.stopPropagation();
    card.calView = card.calView === 'week' ? '3day' : 'week';
    card.calOffset = 0;
    viewBtn.textContent = card.calView === '3day' ? '3D' : 'Wk';
    sv();
    if (typeof renderCalendarContent === 'function') renderCalendarContent(el, card);
  };

  // Theme toggle (dark → light → transparent)
  const _themes = ['dark', 'light', 'transparent'];
  const _themeIcons = { dark: '🌙', light: '☀️', transparent: '👁' };
  const _themeTips = { dark: 'Dark theme', light: 'Light theme', transparent: 'Transparent' };
  if (!card.calTheme) card.calTheme = 'dark';
  const themeBtn = document.createElement('button');
  themeBtn.style.cssText = 'background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.12);border-radius:5px;color:#aaa;font-size:.55rem;padding:2px 5px;cursor:pointer;font-family:var(--font);';
  themeBtn.textContent = _themeIcons[card.calTheme] || '🌙';
  themeBtn.title = _themeTips[card.calTheme] || 'Theme';
  themeBtn.onclick = (e) => {
    e.stopPropagation();
    const idx = _themes.indexOf(card.calTheme);
    card.calTheme = _themes[(idx + 1) % _themes.length];
    themeBtn.textContent = _themeIcons[card.calTheme];
    themeBtn.title = _themeTips[card.calTheme];
    _applyCalTheme(el, card.calTheme);
    sv();
  };

  // Quick Log
  const logBtn = document.createElement('button');
  logBtn.style.cssText = 'background:rgba(74,122,255,.2);border:1px solid rgba(74,122,255,.4);border-radius:5px;color:#6c8fff;font-size:.55rem;padding:2px 6px;cursor:pointer;font-family:var(--font);font-weight:600;';
  logBtn.textContent = '+';
  logBtn.title = 'Quick timelog at current time';
  logBtn.onclick = (e) => {
    e.stopPropagation();
    const now = new Date();
    const start = new Date(now);
    start.setMinutes(now.getMinutes() >= 30 ? 30 : 0, 0, 0);
    const end = new Date(start.getTime() + 30 * 60000);
    if (typeof showCalendarEventForm === 'function') {
      showCalendarEventForm(el.querySelector('.cal-body'), el, card, { mode: 'create', startTime: start, endTime: end });
    }
  };

  // Refresh
  const refBtn = _cb('\u21BB', 'Refresh', () => {
    if (typeof renderCalendarContent === 'function') renderCalendarContent(el, card);
  });

  // Delete widget
  const del = document.createElement('button');
  del.style.cssText = 'background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);border-radius:5px;color:#888;font-size:.6rem;padding:2px 5px;cursor:pointer;opacity:.6;transition:opacity .12s,color .12s;';
  del.textContent = '\u2715';
  del.title = 'Delete widget';
  del.onmouseenter = () => { del.style.opacity = '1'; del.style.color = '#e55'; };
  del.onmouseleave = () => { del.style.opacity = '.6'; del.style.color = '#888'; };
  del.onclick = (e) => { e.stopPropagation(); deleteMiroCard(card.id); };

  // Assemble header — all centered
  hdr.appendChild(title);
  hdr.appendChild(prevBtn);
  hdr.appendChild(prevDayBtn);
  hdr.appendChild(todayBtn);
  hdr.appendChild(nextDayBtn);
  hdr.appendChild(nextBtn);
  hdr.appendChild(viewBtn);
  hdr.appendChild(themeBtn);
  hdr.appendChild(logBtn);
  hdr.appendChild(refBtn);
  hdr.appendChild(del);

  // Body
  const body = document.createElement('div');
  body.className = 'cal-body';
  body.style.cssText = 'flex:1;display:flex;flex-direction:column;overflow:hidden;font-family:var(--font);';

  el.appendChild(hdr);
  el.appendChild(body);

  // ─── Theme system ───
  function _applyCalTheme(el, theme) {
    const btns = hdr.querySelectorAll('button');
    if (theme === 'light') {
      el.style.background = '#f5f6fa';
      el.style.border = '1px solid #d0d5dd';
      el.style.boxShadow = '0 4px 16px rgba(0,0,0,.12)';
      el.style.color = '#222';
      hdr.style.background = 'rgba(66,133,244,.06)';
      hdr.style.borderBottom = '1px solid #d0d5dd';
      title.style.color = '#333';
      body.style.color = '#222';
      btns.forEach(b => { b.style.color = '#444'; b.style.background = 'rgba(0,0,0,.05)'; b.style.borderColor = '#ccc'; });
    } else if (theme === 'transparent') {
      el.style.background = 'transparent';
      el.style.border = '1px solid rgba(255,255,255,.08)';
      el.style.boxShadow = 'none';
      el.style.color = '#ddd';
      hdr.style.background = 'transparent';
      hdr.style.borderBottom = '1px solid rgba(255,255,255,.06)';
      title.style.color = '#aaa';
      body.style.color = '#ccc';
      btns.forEach(b => { b.style.color = '#aaa'; b.style.background = 'rgba(255,255,255,.05)'; b.style.borderColor = 'rgba(255,255,255,.1)'; });
    } else {
      // dark (default)
      el.style.background = '#1a1c2e';
      el.style.border = '1px solid rgba(108,143,255,.2)';
      el.style.boxShadow = '0 4px 24px rgba(0,0,0,.4)';
      el.style.color = '#eee';
      hdr.style.background = 'rgba(108,143,255,.08)';
      hdr.style.borderBottom = '1px solid rgba(255,255,255,.08)';
      title.style.color = '#ccc';
      body.style.color = '#eee';
      btns.forEach(b => { b.style.color = '#aaa'; b.style.background = 'rgba(255,255,255,.08)'; b.style.borderColor = 'rgba(255,255,255,.12)'; });
    }
  }
  _applyCalTheme(el, card.calTheme || 'dark');

  // Drag — exclude header buttons and body
  miroSetupCardDrag(el, card, ['.cal-body', 'button', 'input', 'select', 'textarea']);
  // Resize
  attach8WayResize(el, card, 200, 150);
  // Lock
  attachLockUI(el, card);

  // Re-render on resize (heavily debounced to avoid flicker during zoom)
  let _resizeTimer = null;
  let _lastW = el.offsetWidth, _lastH = el.offsetHeight;
  const resObs = new ResizeObserver(() => {
    clearTimeout(_resizeTimer);
    _resizeTimer = setTimeout(() => {
      const w = el.offsetWidth, h = el.offsetHeight;
      if (w < 50 || h < 50) return; // too small (mid-zoom), skip
      if (Math.abs(w - _lastW) < 5 && Math.abs(h - _lastH) < 5) return;
      _lastW = w; _lastH = h;
      card.h = h;
      card.w = w;
      if (typeof renderCalendarContent === 'function') renderCalendarContent(el, card);
    }, 500);
  });
  resObs.observe(el);

  // Load events after render
  requestAnimationFrame(() => {
    if (typeof renderCalendarContent === 'function') renderCalendarContent(el, card);
  });

  return el;
}

// ══════════════════════════════════════════════════════════
// ─── Embed Web View Widget ───
// ══════════════════════════════════════════════════════════
function buildMiroEmbed(card) {
  // Ensure origW/origH are set (full iframe dimensions before any crop)
  if (!card.origW) card.origW = card.w || 600;
  if (!card.origH) card.origH = card.h || 400;

  const el = document.createElement('div');
  el.className = 'miro-embed';
  el.dataset.cid = card.id;
  el.style.cssText = `position:absolute;left:${card.x||0}px;top:${card.y||0}px;width:${card.w||600}px;height:${card.h||400}px;overflow:hidden;background:transparent;border:none;box-shadow:none;z-index:${card.zIndex||1};`;

  // ─── Iframe container (clips the view) ───
  const iframeWrap = document.createElement('div');
  iframeWrap.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;overflow:hidden;';
  
  const iframe = document.createElement('iframe');
  iframe.src = card.embedUrl || '';
  iframe.setAttribute('frameborder', '0');
  iframe.setAttribute('allowfullscreen', 'true');
  iframe.setAttribute('loading', 'eager');
  iframe.setAttribute('allow', 'clipboard-write; autoplay; encrypted-media');
  iframe.style.cssText = 'border:none;background:transparent;pointer-events:auto;';

  // Loading placeholder — shows skeleton while iframe loads
  const loadingOverlay = document.createElement('div');
  loadingOverlay.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;z-index:4;display:flex;align-items:center;justify-content:center;background:rgba(13,15,24,.85);color:#6c8fff;font-size:.75rem;font-family:var(--font);flex-direction:column;gap:6px;';
  loadingOverlay.innerHTML = '<div style="width:24px;height:24px;border:2px solid rgba(108,143,255,.3);border-top-color:#6c8fff;border-radius:50%;animation:spin 1s linear infinite"></div><span>Loading...</span>';
  iframeWrap.appendChild(loadingOverlay);
  iframe.addEventListener('load', () => { loadingOverlay.remove(); }, { once: true });

  // ─── Scale-based rendering: iframe stays at origW×origH, CSS scale fills element ───
  function applyIframeTransform() {
    const origW = card.origW || 600;
    const origH = card.origH || 400;
    const elW = card.w || origW;
    const elH = card.h || origH;
    iframe.style.width = origW + 'px';
    iframe.style.height = origH + 'px';
    iframe.style.transformOrigin = '0 0';
    const cr = card.cropRect;
    if (cr && cr.w > 0 && cr.h > 0) {
      // Crop: scale so the crop region fills the element
      const cropW_px = origW * cr.w / 100;
      const cropH_px = origH * cr.h / 100;
      const cropX_px = origW * cr.x / 100;
      const cropY_px = origH * cr.y / 100;
      const sx = elW / cropW_px;
      const sy = elH / cropH_px;
      const tx = -cropX_px * sx;
      const ty = -cropY_px * sy;
      iframe.style.transform = `translate(${tx}px,${ty}px) scale(${sx},${sy})`;
    } else {
      // No crop: scale entire page to fit element
      const sx = elW / origW;
      const sy = elH / origH;
      iframe.style.transform = `scale(${sx},${sy})`;
    }
  }
  // Alias for crop mode compatibility
  function applyCrop() { applyIframeTransform(); }
  applyCrop();

  iframeWrap.appendChild(iframe);
  el.appendChild(iframeWrap);

  // ─── Glass overlay — shown by default (interact OFF) ───
  const glass = document.createElement('div');
  glass.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;z-index:5;cursor:grab;';
  el.appendChild(glass);

  // ─── Hover toolbar (appears on hover) ───
  const toolbar = document.createElement('div');
  toolbar.style.cssText = 'position:absolute;top:4px;right:4px;display:flex;gap:3px;opacity:0;transition:opacity .15s;z-index:10;';
  el.addEventListener('mouseenter', () => { toolbar.style.opacity = '1'; });
  el.addEventListener('mouseleave', () => { toolbar.style.opacity = '0'; });

  function _tbBtn(text, tip, fn) {
    const b = document.createElement('button');
    b.style.cssText = 'background:rgba(0,0,0,.6);border:1px solid rgba(255,255,255,.15);border-radius:4px;color:#fff;font-size:.55rem;padding:2px 5px;cursor:pointer;backdrop-filter:blur(4px);';
    b.textContent = text; b.title = tip;
    b.onclick = (e) => { e.stopPropagation(); fn(); };
    b.addEventListener('mousedown', e => e.stopPropagation());
    return b;
  }

  // Edit URL
  toolbar.appendChild(_tbBtn('🔗', 'Edit URL', () => {
    const newUrl = prompt('🌐 Enter new URL:', card.embedUrl || '');
    if (newUrl && newUrl.trim()) {
      card.embedUrl = newUrl.trim();
      iframe.src = card.embedUrl;
      sv();
    }
  }));

  // Crop mode
  toolbar.appendChild(_tbBtn('✂️', 'Crop visible area', () => {
    _startCropMode(el, card, iframe, iframeWrap, applyCrop, glass, resetCropBtn);
  }));

  // Clear crop (always present, hidden when no crop)
  const resetCropBtn = _tbBtn('↺', 'Reset crop', () => {
    card.cropRect = null;
    applyCrop();
    resetCropBtn.style.display = 'none';
    sv();
  });
  resetCropBtn.style.display = card.cropRect ? 'inline-block' : 'none';
  toolbar.appendChild(resetCropBtn);

  // Interact toggle (OFF by default)
  let _interacting = false;
  const interactBtn = _tbBtn('🖱️', 'Interact (click inside iframe)', () => {
    _interacting = !_interacting;
    glass.style.display = _interacting ? 'none' : 'block';
    interactBtn.style.background = _interacting ? 'rgba(74,122,255,.5)' : 'rgba(0,0,0,.6)';
    if (_interacting) {
      // Native mode: iframe matches element size, no scale → clicks work correctly
      iframe.style.width = el.offsetWidth + 'px';
      iframe.style.height = el.offsetHeight + 'px';
      iframe.style.transform = 'none';
      iframe.style.transformOrigin = '';
      iframe.setAttribute('scrolling', 'no');
    } else {
      // Scale mode: re-apply visual scaling
      iframe.removeAttribute('scrolling');
      applyIframeTransform();
    }
  });
  toolbar.appendChild(interactBtn);

  // Refresh this widget
  toolbar.appendChild(_tbBtn('🔄', 'Refresh', () => {
    iframe.src = card.embedUrl + (card.embedUrl.includes('?') ? '&' : '?') + '_t=' + Date.now();
  }));

  // Refresh ALL embed widgets on this page
  toolbar.appendChild(_tbBtn('🔄⭐', 'Refresh All Embeds', () => {
    document.querySelectorAll('.miro-embed iframe').forEach(f => {
      const src = f.src.split(/[?&]_t=/)[0];
      f.src = src + (src.includes('?') ? '&' : '?') + '_t=' + Date.now();
    });
    showToast('🔄 All embeds refreshed');
  }));

  // Delete
  toolbar.appendChild(_tbBtn('✕', 'Delete', () => {
    if (typeof deleteMiroCard === 'function') deleteMiroCard(card.id);
  }));

  el.appendChild(toolbar);

  // ─── Auto-refresh every N minutes ───
  const refreshMs = (card.refreshMin || 15) * 60 * 1000;
  const _refreshTimer = setInterval(() => {
    if (!document.body.contains(el)) { clearInterval(_refreshTimer); return; }
    iframe.src = card.embedUrl + (card.embedUrl.includes('?') ? '&' : '?') + '_t=' + Date.now();
  }, refreshMs);

  // ─── Miro integration ───
  miroSetupCardDrag(el, card, ['button', 'input', '.mc-resize-br', '.mc-resize-bl', '.mc-resize-tr', '.mc-resize-tl', '.mc-resize-t', '.mc-resize-b', '.mc-resize-l', '.mc-resize-r', '.mc-lock']);
  attach8WayResize(el, card, 100, 80);
  attachLockUI(el, card);
  // ─── Dual resize: Normal = scale content, Ctrl = change frame viewport ───
  let _embedCtrlHeld = false;
  const _ctrlDown = (e) => { if (e.key === 'Control') _embedCtrlHeld = true; };
  const _ctrlUp = (e) => { if (e.key === 'Control') _embedCtrlHeld = false; };
  document.addEventListener('keydown', _ctrlDown);
  document.addEventListener('keyup', _ctrlUp);

  // Re-apply transform when element is resized via handles
  const resObs = new ResizeObserver(() => {
    card.w = el.offsetWidth || card.w;
    card.h = el.offsetHeight || card.h;
    if (_embedCtrlHeld) {
      card.origW = card.w;
      card.origH = card.h;
    }
    if (_interacting) {
      // Native mode during interaction
      iframe.style.width = card.w + 'px';
      iframe.style.height = card.h + 'px';
      iframe.style.transform = 'none';
    } else {
      applyIframeTransform();
    }
  });
  resObs.observe(el);

  // Cleanup Ctrl listeners when element is removed
  const _cleanupObs = new MutationObserver(() => {
    if (!document.body.contains(el)) {
      document.removeEventListener('keydown', _ctrlDown);
      document.removeEventListener('keyup', _ctrlUp);
      _cleanupObs.disconnect();
      resObs.disconnect();
    }
  });
  _cleanupObs.observe(document.body, { childList: true, subtree: true });

  return el;
}

// ─── Crop Mode for Embed Widget ───
function _startCropMode(el, card, iframe, iframeWrap, applyCrop, glass, resetCropBtn) {
  // Save current crop for cancel
  const savedCrop = card.cropRect;
  const origW = card.origW || card.w || 600;
  const origH = card.origH || card.h || 400;

  // Temporarily expand element to full original size so user sees everything (1:1 scale)
  el.style.width = origW + 'px';
  el.style.height = origH + 'px';
  card.w = origW;
  card.h = origH;
  iframe.style.width = origW + 'px';
  iframe.style.height = origH + 'px';
  iframe.style.transform = 'scale(1,1)';
  iframe.style.transformOrigin = '0 0';
  iframe.style.pointerEvents = 'none';
  if (glass) glass.style.display = 'none';

  // Overlay for drawing crop rectangle
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;z-index:20;cursor:crosshair;background:rgba(0,0,0,.15);';

  const hint = document.createElement('div');
  hint.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);background:rgba(0,0,0,.7);color:#fff;font-size:.7rem;padding:8px 14px;border-radius:6px;pointer-events:none;text-align:center;white-space:nowrap;';
  hint.textContent = '✂️ Drag to select the visible area • ESC to cancel';
  overlay.appendChild(hint);

  const cropBox = document.createElement('div');
  cropBox.style.cssText = 'position:absolute;border:2px dashed #4a7aff;background:rgba(74,122,255,.1);display:none;pointer-events:none;z-index:21;';
  overlay.appendChild(cropBox);

  el.appendChild(overlay);

  let startX, startY, dragging = false;

  // Convert screen coords to overlay's local coords (accounts for board zoom)
  function screenToLocal(e) {
    const r = overlay.getBoundingClientRect();
    const sx = overlay.offsetWidth / r.width;   // = 1/zoom
    const sy = overlay.offsetHeight / r.height;
    return {
      x: (e.clientX - r.left) * sx,
      y: (e.clientY - r.top) * sy
    };
  }

  const onMouseDown = (e) => {
    if (e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    const p = screenToLocal(e);
    startX = p.x;
    startY = p.y;
    dragging = true;
    hint.style.display = 'none';
    cropBox.style.display = 'block';
    cropBox.style.left = startX + 'px';
    cropBox.style.top = startY + 'px';
    cropBox.style.width = '0px';
    cropBox.style.height = '0px';
  };

  const onMouseMove = (e) => {
    if (!dragging) return;
    const p = screenToLocal(e);
    const x = Math.min(startX, p.x), y = Math.min(startY, p.y);
    const w = Math.abs(p.x - startX), h = Math.abs(p.y - startY);
    cropBox.style.left = x + 'px'; cropBox.style.top = y + 'px';
    cropBox.style.width = w + 'px'; cropBox.style.height = h + 'px';
  };

  const onMouseUp = (e) => {
    if (!dragging) return;
    dragging = false;
    const p = screenToLocal(e);
    // Use LOCAL dimensions for percentage calculations
    const totalW = overlay.offsetWidth, totalH = overlay.offsetHeight;
    const x = Math.min(startX, p.x), y = Math.min(startY, p.y);
    const w = Math.abs(p.x - startX), h = Math.abs(p.y - startY);

    overlay.remove();
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
    document.removeEventListener('keydown', onEscape);

    // Min crop size: 20px
    if (w < 20 || h < 20) {
      card.cropRect = savedCrop;
      applyCrop();
      if (glass) glass.style.display = 'block';
      iframe.style.pointerEvents = '';
      return;
    }

    // Save as percentages of origW/origH
    card.cropRect = {
      x: (x / totalW) * 100,
      y: (y / totalH) * 100,
      w: (w / totalW) * 100,
      h: (h / totalH) * 100,
    };
    // Shrink element to match crop region (1:1 initial scale)
    const cropW = origW * (w / totalW);
    const cropH = origH * (h / totalH);
    card.w = cropW;
    card.h = cropH;
    el.style.width = cropW + 'px';
    el.style.height = cropH + 'px';
    applyCrop();
    if (glass) glass.style.display = 'block';
    iframe.style.pointerEvents = '';
    if (resetCropBtn) resetCropBtn.style.display = 'inline-block';
    sv();
    showToast('✂️ Crop applied');
  };

  const onEscape = (e) => {
    if (e.key === 'Escape') {
      overlay.remove();
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.removeEventListener('keydown', onEscape);
      card.cropRect = savedCrop;
      applyCrop();
      if (glass) glass.style.display = 'block';
      iframe.style.pointerEvents = '';
    }
  };

  overlay.addEventListener('mousedown', onMouseDown);
  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mouseup', onMouseUp);
  document.addEventListener('keydown', onEscape);
}

