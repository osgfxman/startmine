/* ─── Fast Thumbnail Cache Engine ─── */
/* ─── Fast Thumbnail Cache Engine ─── */
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
  // Skip if already fetched this session or already has a thumbnail
  if (_fetchedThisSession.has(card.id)) return;
  if (card.thumbUrl) { _fetchedThisSession.add(card.id); return; }
  _fetchedThisSession.add(card.id);

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
      updateCardThumb(card);
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
function miroSetupCardDrag(el, card, ignoreSelectors = ['.mc-del']) {
  el.addEventListener('mousedown', (e) => {
    if (card.locked) return; // Prevent drag if locked
    if (e.target.contentEditable === 'true') return;
    for (const sel of ignoreSelectors) {
      if (e.target.closest(sel)) return;
    }
    if (card.type === 'grid' && e.target.closest('td') && e.target.closest('td').contentEditable === 'true') return;

    e.stopPropagation();
    if (e.ctrlKey || e.metaKey) { toggleMiroSelect(card.id); return; }

    if (!_miroSelected.has(card.id)) { clearMiroSelection(); addMiroSelect(card.id); }

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

        // Render the background clones instantly
        buildMiroCanvas(); buildOutline();

        // Important: Ensure the elements we are currently dragging remain visible on top
        origPositions.forEach((orig, cid) => {
          const cardEl = document.querySelector(`[data-cid="${cid}"]`);
          if (cardEl) cardEl.style.zIndex = '999999';
        });
      }

      // Perform the ongoing move step on our actively selected items
      origPositions.forEach((orig, cid) => {
        const c = (page.miroCards || []).find(x => x.id === cid);
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

        // Auto-size text for sticky notes
        const textEl = el.querySelector('.ms-text');
        if (textEl) autoSizeText(textEl, el);
        updateMiroSelFrame();
      }
      function onUp() {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
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

  // ── Alignment buttons ──
  function mkAlignBtn(icon, title, cmd) {
    const b = document.createElement('button');
    b.className = 'sn-rb-btn sn-rb-align';
    b.innerHTML = icon;
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
  toolbar.appendChild(mkAlignBtn('≡', 'Align Left', 'justifyLeft'));
  toolbar.appendChild(mkAlignBtn('≡', 'Align Center', 'justifyCenter'));
  toolbar.appendChild(mkAlignBtn('≡', 'Align Right', 'justifyRight'));

  // ── Separator ──
  const sepD = document.createElement('div');
  sepD.className = 'sn-tb-sep';
  toolbar.appendChild(sepD);

  // ── Link button ──
  const linkBtn = document.createElement('button');
  linkBtn.className = 'sn-rb-btn';
  linkBtn.innerHTML = '🔗';
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
  attach8WayResize(el, card, 100, 80);

  // Lock UI
  attachLockUI(el, card);

  el.appendChild(del);
  el.appendChild(toolbar);
  el.appendChild(toggle);
  el.appendChild(text);


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
  let lo = 8,
    hi = 120,
    best = 8;
  // Binary search for largest font that fits without overflow
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    textEl.style.fontSize = mid + 'px';
    if (textEl.scrollHeight <= textEl.clientHeight + 2) {
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

/* ─── Image Card ─── */
function buildMiroImage(card) {
  const el = document.createElement('div');
  el.className = 'miro-image';
  el.dataset.cid = card.id;
  el.style.left = (card.x || 0) + 'px';
  el.style.top = (card.y || 0) + 'px';
  el.style.width = (card.w || 300) + 'px';
  el.style.height = (card.h || 200) + 'px';

  // Delete button
  const del = document.createElement('button');
  del.className = 'mc-del';
  del.textContent = '✕';
  del.onclick = (e) => {
    e.stopPropagation();
    deleteMiroCard(card.id);
  };

  // Image element
  const img = document.createElement('img');
  img.className = 'mi-img';
  img.src = card.imageUrl;
  img.alt = card.label || 'Image';
  img.draggable = false;
  img.onerror = () => {
    img.style.display = 'none';
    const ph = document.createElement('div');
    ph.className = 'mi-placeholder';
    ph.textContent = '🖼️';
    el.insertBefore(ph, el.querySelector('.mi-label'));
  };

  // Optional label footer
  let labelEl = null;
  if (card.label) {
    labelEl = document.createElement('div');
    labelEl.className = 'mi-label';
    labelEl.textContent = card.label;
  }

  // Drag (via global helper)
  miroSetupCardDrag(el, card, ['.mc-del', '.mc-resize-br', '.mc-resize-bl', '.mc-resize-tr', '.mc-resize-tl', '.mc-lock']);

  // 4-corner resize
  attach8WayResize(el, card, 60, 60);

  // Lock UI
  attachLockUI(el, card);

  el.appendChild(del);
  el.appendChild(img);
  if (labelEl) el.appendChild(labelEl);
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

  // Delete button
  const del = document.createElement('button');
  del.className = 'mc-del';
  del.textContent = '✕';
  del.onclick = (e) => { e.stopPropagation(); deleteMiroCard(card.id); };

  // Toolbar
  const toolbar = document.createElement('div');
  toolbar.className = 'mt-toolbar';
  toolbar.innerHTML = `
    <select class="mt-font" title="Font">
      <option value="DM Sans">DM Sans</option>
      <option value="Inter">Inter</option>
      <option value="Georgia">Georgia</option>
      <option value="Courier New">Courier New</option>
      <option value="serif">Serif</option>
    </select>
    <input type="number" class="mt-size" value="${card.fontSize || 24}" min="8" max="200" title="Size">
    <input type="color" class="mt-color" value="${card.fontColor || '#333333'}" title="Color">
    <button class="mt-btn ${card.bold ? 'sel' : ''}" data-act="bold" title="Bold"><b>B</b></button>
    <button class="mt-btn ${card.italic ? 'sel' : ''}" data-act="italic" title="Italic"><i>I</i></button>
    <button class="mt-btn ${(card.align || 'left') === 'left' ? 'sel' : ''}" data-act="left" title="Left">≡</button>
    <button class="mt-btn ${card.align === 'center' ? 'sel' : ''}" data-act="center" title="Center">≡</button>
    <button class="mt-btn ${card.align === 'right' ? 'sel' : ''}" data-act="right" title="Right">≡</button>`;

  // Set font select value
  const fontSel = toolbar.querySelector('.mt-font');
  fontSel.value = card.font || 'DM Sans';

  // Text content
  const text = document.createElement('div');
  text.className = 'mt-text';
  text.contentEditable = false;
  text.textContent = card.text ?? '';
  text.style.fontFamily = card.font || 'DM Sans';
  text.style.fontSize = (card.fontSize || 24) + 'px';
  text.style.color = card.fontColor || '#333';
  text.style.fontWeight = card.bold ? '700' : '400';
  text.style.fontStyle = card.italic ? 'italic' : 'normal';
  text.style.textAlign = card.align || 'left';

  // Toolbar events
  fontSel.onchange = () => { card.font = fontSel.value; text.style.fontFamily = card.font; sv(); };
  toolbar.querySelector('.mt-size').onchange = function () { card.fontSize = +this.value; text.style.fontSize = card.fontSize + 'px'; sv(); };
  toolbar.querySelector('.mt-color').oninput = function () { card.fontColor = this.value; text.style.color = card.fontColor; sv(); };
  toolbar.querySelectorAll('.mt-btn').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const act = btn.dataset.act;
      if (act === 'bold') { card.bold = !card.bold; text.style.fontWeight = card.bold ? '700' : '400'; btn.classList.toggle('sel'); }
      else if (act === 'italic') { card.italic = !card.italic; text.style.fontStyle = card.italic ? 'italic' : 'normal'; btn.classList.toggle('sel'); }
      else if (['left', 'center', 'right'].includes(act)) {
        card.align = act; text.style.textAlign = act;
        toolbar.querySelectorAll('[data-act="left"],[data-act="center"],[data-act="right"]').forEach(b => b.classList.remove('sel'));
        btn.classList.add('sel');
      }
      sv();
    };
  });

  // Double-click to edit
  text.addEventListener('dblclick', (e) => { e.stopPropagation(); text.contentEditable = true; text.focus(); });
  text.addEventListener('blur', () => { text.contentEditable = false; card.text = text.textContent; card.h = el.offsetHeight; sv(); });
  text.addEventListener('input', () => { card.text = text.textContent; sv(); });
  text.addEventListener('mousedown', (e) => { if (text.contentEditable === 'true') e.stopPropagation(); });

  // Show/hide toolbar on click
  el.addEventListener('click', (e) => {
    if (e.target.closest('.mc-del') || e.target.closest('.mc-lock') || e.target.closest('.mt-toolbar')) return;
    document.querySelectorAll('.mt-toolbar.show, .msh-toolbar.show').forEach(t => { if (t !== toolbar) t.classList.remove('show'); });
    toolbar.classList.toggle('show');
  });
  document.addEventListener('click', (e) => { if (!el.contains(e.target)) toolbar.classList.remove('show'); });

  // Drag (via global helper)
  miroSetupCardDrag(el, card, ['.mc-del', '.mt-toolbar', '.mc-lock']);

  attach8WayResize(el, card, 60, 30);

  // Lock UI
  attachLockUI(el, card);

  el.appendChild(del);
  el.appendChild(toolbar);
  el.appendChild(text);
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
    case 'ellipse': inner = `<ellipse cx="${w / 2}" cy="${h / 2}" rx="${w / 2 - sw}" ry="${h / 2 - sw}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`; break;
    case 'triangle': inner = `<polygon points="${w / 2},${sw} ${w - sw},${h - sw} ${sw},${h - sw}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`; break;
    case 'diamond': inner = `<polygon points="${w / 2},${sw} ${w - sw},${h / 2} ${w / 2},${h - sw} ${sw},${h / 2}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`; break;
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

  // Delete button
  const del = document.createElement('button');
  del.className = 'mc-del';
  del.textContent = '✕';
  del.onclick = (e) => { e.stopPropagation(); deleteMiroCard(card.id); };

  // Toolbar
  const toolbar = document.createElement('div');
  toolbar.className = 'msh-toolbar';
  toolbar.innerHTML = `
    <label title="Fill"><span style="font-size:.65rem">Fill</span><input type="color" class="msh-fill" value="${card.fillColor === 'none' ? '#6c8fff' : (String(card.fillColor).startsWith('#') ? '#' + String(card.fillColor).replace('#', '').padStart(6, '0').slice(0, 6) : '#6c8fff')}"></label>
    <button class="mt-btn msh-nofill ${card.fillColor === 'none' ? 'sel' : ''}" title="No Fill">⊘</button>
    <label title="Stroke"><span style="font-size:.65rem">Stroke</span><input type="color" class="msh-stroke" value="${card.strokeColor === 'none' ? '#333333' : (String(card.strokeColor).startsWith('#') ? '#' + String(card.strokeColor).replace('#', '').padStart(6, '0').slice(0, 6) : '#333333')}"></label>
    <button class="mt-btn msh-nostroke ${card.strokeColor === 'none' ? 'sel' : ''}" title="No Stroke">⊘</button>
    <label title="Width"><span style="font-size:.65rem">W</span><input type="number" class="msh-sw" value="${card.strokeWidth ?? 2}" min="0" max="20"></label>
    <label title="Opacity"><span style="font-size:.65rem">Op</span><input type="range" class="msh-op" value="${Math.round((card.opacity ?? 1) * 100)}" min="0" max="100"></label>`;

  function updateSVG() { svgWrap.innerHTML = renderShapeSVG(card); }
  toolbar.querySelector('.msh-fill').oninput = function () { card.fillColor = this.value; toolbar.querySelector('.msh-nofill').classList.remove('sel'); updateSVG(); sv(); };
  toolbar.querySelector('.msh-nofill').onclick = function (e) { e.stopPropagation(); card.fillColor = card.fillColor === 'none' ? '#6c8fff' : 'none'; this.classList.toggle('sel', card.fillColor === 'none'); updateSVG(); sv(); };
  toolbar.querySelector('.msh-stroke').oninput = function () { card.strokeColor = this.value; toolbar.querySelector('.msh-nostroke').classList.remove('sel'); updateSVG(); sv(); };
  toolbar.querySelector('.msh-nostroke').onclick = function (e) { e.stopPropagation(); card.strokeColor = card.strokeColor === 'none' ? '#333' : 'none'; this.classList.toggle('sel', card.strokeColor === 'none'); updateSVG(); sv(); };
  toolbar.querySelector('.msh-sw').onchange = function () { card.strokeWidth = +this.value; updateSVG(); sv(); };
  toolbar.querySelector('.msh-op').oninput = function () { card.opacity = +this.value / 100; updateSVG(); sv(); };

  // Show/hide toolbar on click
  el.addEventListener('click', (e) => {
    if (e.target.closest('.mc-del') || e.target.closest('.mc-lock') || e.target.closest('.msh-toolbar')) return;
    document.querySelectorAll('.mt-toolbar.show, .msh-toolbar.show').forEach(t => { if (t !== toolbar) t.classList.remove('show'); });
    toolbar.classList.toggle('show');
  });
  document.addEventListener('click', (e) => { if (!el.contains(e.target)) toolbar.classList.remove('show'); });

  // Drag (via global helper)
  miroSetupCardDrag(el, card, ['.mc-del', '.msh-toolbar', '.mc-resize-br', '.mc-resize-bl', '.mc-resize-tr', '.mc-resize-tl']);

  // Resize needs to re-render SVG
  const origAttach = attach8WayResize;
  attach8WayResize(el, card, 40, 40);
  // After resize, update SVG
  el.addEventListener('mouseup', () => { updateSVG(); });

  // Lock UI
  attachLockUI(el, card);

  el.appendChild(del);
  el.appendChild(toolbar);
  el.appendChild(svgWrap);
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

/* ─── Grid/Table Widget ─── */
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

  // Exact sizing to avoid invisible hovering boundaries
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

  const selectedCells = new Set();
  let lastSelectedCell = null;

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
      // load cell specific background if it exists, otherwise fall back to header or transparent
      let cellBg = card.cellColors ? card.cellColors[`${r},${c}`] : null;
      if (!cellBg && r === 0 && card.headerColor && card.headerColor !== 'none') cellBg = card.headerColor;

      if (cellBg) td.style.background = cellBg;
      else td.style.background = 'transparent';

      td.textContent = card.cells[r]?.[c] || '';
      td.style.borderColor = card.borderColor;
      td.style.borderWidth = card.borderWidth + 'px';

      const merge = merges.find(m => m.r === r && m.c === c);
      if (merge) { td.rowSpan = merge.rs; td.colSpan = merge.cs; }

      // Double-click to enter edit mode (prevents grid drag)
      td.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        td.contentEditable = true;
        td.focus();
        td.style.outline = '2px solid var(--ac)';
        const save = () => { td.contentEditable = false; td.style.outline = ''; card.cells[r][c] = td.textContent; sv(); };
        td.addEventListener('blur', save, { once: true });
      });

      // Click = select cell (for merge/color) and allow drag unless editing
      td.onmousedown = (e) => {
        if (td.contentEditable === 'true') {
          e.stopPropagation();
          return;
        }

        const key = `${r},${c}`;

        if (e.shiftKey && lastSelectedCell) {
          // Select range
          const [lastR, lastC] = lastSelectedCell.split(',').map(Number);
          const minR = Math.min(r, lastR), maxR = Math.max(r, lastR);
          const minC = Math.min(c, lastC), maxC = Math.max(c, lastC);

          if (!e.ctrlKey && !e.metaKey) {
            selectedCells.clear();
            el.querySelectorAll('td.mg-sel').forEach(t => t.classList.remove('mg-sel'));
          }

          for (let rr = minR; rr <= maxR; rr++) {
            for (let cc = minC; cc <= maxC; cc++) {
              const k = `${rr},${cc}`;
              selectedCells.add(k);
              const cellEl = el.querySelector(`td[data-row="${rr}"][data-col="${cc}"]`);
              if (cellEl) cellEl.classList.add('mg-sel');
            }
          }
        } else if (e.ctrlKey || e.metaKey) {
          if (selectedCells.has(key)) { selectedCells.delete(key); td.classList.remove('mg-sel'); }
          else { selectedCells.add(key); td.classList.add('mg-sel'); lastSelectedCell = key; }
        } else {
          selectedCells.clear();
          el.querySelectorAll('td.mg-sel').forEach(t => t.classList.remove('mg-sel'));
          selectedCells.add(key);
          td.classList.add('mg-sel');
          lastSelectedCell = key;
        }
      };
      tr.appendChild(td);
    }
    table.appendChild(tr);
  }

  // Edge + buttons for adding rows/cols on hover
  const addRowTop = document.createElement('button');
  addRowTop.className = 'mg-edge-btn mg-edge-top'; addRowTop.innerHTML = '+';
  addRowTop.onclick = (e) => { e.stopPropagation(); card.rows++; card.cells.unshift(Array(card.cols).fill('')); card.rowHeights.unshift(40); sv(); buildMiroCanvas(); };
  const addRowBot = document.createElement('button');
  addRowBot.className = 'mg-edge-btn mg-edge-bot'; addRowBot.innerHTML = '+';
  addRowBot.onclick = (e) => { e.stopPropagation(); card.rows++; card.cells.push(Array(card.cols).fill('')); card.rowHeights.push(40); sv(); buildMiroCanvas(); };
  const addColLeft = document.createElement('button');
  addColLeft.className = 'mg-edge-btn mg-edge-left'; addColLeft.innerHTML = '+';
  addColLeft.onclick = (e) => { e.stopPropagation(); card.cols++; card.cells.forEach(r => r.unshift('')); card.colWidths.unshift(120); sv(); buildMiroCanvas(); };
  const addColRight = document.createElement('button');
  addColRight.className = 'mg-edge-btn mg-edge-right'; addColRight.innerHTML = '+';
  addColRight.onclick = (e) => { e.stopPropagation(); card.cols++; card.cells.forEach(r => r.push('')); card.colWidths.push(120); sv(); buildMiroCanvas(); };

  // Generate resizer handles
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
        // Update DOM directly without saving or full rebuild
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
        // Update DOM directly without saving or full rebuild
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

  const toolbar = document.createElement('div');
  toolbar.className = 'mg-toolbar';
  const noFillActive = !card.fillColor || card.fillColor === 'none';
  const noStrokeActive = card.borderColor === 'none';
  toolbar.innerHTML = `
    <button class="mt-btn" data-act="-row" title="Remove Row">➖ Row</button>
    <button class="mt-btn" data-act="-col" title="Remove Column">➖ Col</button>
    <button class="mt-btn" data-act="merge" title="Merge (Ctrl/Shift+Click)">⊞ Merge</button>
    <button class="mt-btn" data-act="unmerge" title="Unmerge">⊟ Split</button>
    <div style="width:1px;height:16px;background:var(--op);margin:0 4px;"></div>
    <label title="Stroke Color"><span style="font-size:.55rem">Border</span><input type="color" class="mg-stroke-clr" value="${card.borderColor === 'none' ? '#000000' : card.borderColor}"></label>
    <label title="Stroke Width"><input type="range" class="mg-stroke-w" min="0" max="10" value="${card.borderWidth || 1}" style="width:40px;"></label>
    <button class="mt-btn mg-toggle ${card.borderWidth === 0 || card.borderColor === 'none' ? 'active' : ''}" data-act="no-stroke" title="No Stroke">🚫</button>
    <label title="Cell Fill"><span style="font-size:.55rem">Cell Bg</span><input type="color" class="mg-fill-clr" value="#ffffff"></label>
    <button class="mt-btn mg-toggle" data-act="no-cell-fill" title="Clear Cell Fill">🚫</button>
    <label title="Table Fill"><span style="font-size:.55rem">Grid Bg</span><input type="color" class="mg-table-clr" value="${(card.fillColor && card.fillColor !== 'none') ? card.fillColor : '#ffffff'}"></label>
    <button class="mt-btn mg-toggle ${noFillActive ? 'active' : ''}" data-act="no-fill" title="No Bg Fill">🚫</button>
    <label title="Header Color"><span style="font-size:.55rem">Hdr</span><input type="color" class="mg-hdr-clr" value="${card.headerColor === 'none' ? '#6c8fff' : (card.headerColor || '#6c8fff')}"></label>`;

  toolbar.querySelector('[data-act="-row"]').onclick = (e) => { e.stopPropagation(); if (card.rows <= 1) return; card.rows--; card.cells.pop(); card.rowHeights.pop(); sv(); buildMiroCanvas(); };
  toolbar.querySelector('[data-act="-col"]').onclick = (e) => { e.stopPropagation(); if (card.cols <= 1) return; card.cols--; card.cells.forEach(r => r.pop()); card.colWidths.pop(); sv(); buildMiroCanvas(); };
  toolbar.querySelector('[data-act="merge"]').onclick = (e) => {
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
  toolbar.querySelector('[data-act="unmerge"]').onclick = (e) => { e.stopPropagation(); card.merges = []; sv(); buildMiroCanvas(); };
  toolbar.querySelector('.mg-stroke-clr').oninput = function () { card.borderColor = this.value; if (card.borderWidth === 0) card.borderWidth = 1; sv(); buildMiroCanvas(); };
  toolbar.querySelector('.mg-stroke-w').oninput = function () { card.borderWidth = parseInt(this.value); sv(); buildMiroCanvas(); };
  toolbar.querySelector('.mg-fill-clr').oninput = function () {
    if (!card.cellColors) card.cellColors = {};
    selectedCells.forEach(key => { card.cellColors[key] = this.value; });
    sv(); buildMiroCanvas();
  };
  toolbar.querySelector('[data-act="no-cell-fill"]').onclick = (e) => {
    e.stopPropagation();
    if (card.cellColors) {
      selectedCells.forEach(key => { delete card.cellColors[key]; });
    }
    sv(); buildMiroCanvas();
  };
  toolbar.querySelector('.mg-table-clr').oninput = function () { card.fillColor = this.value; sv(); buildMiroCanvas(); };
  toolbar.querySelector('[data-act="no-fill"]').onclick = (e) => { e.stopPropagation(); card.fillColor = card.fillColor === 'none' ? '#ffffff' : 'none'; sv(); buildMiroCanvas(); };
  toolbar.querySelector('[data-act="no-stroke"]').onclick = (e) => { e.stopPropagation(); card.borderWidth = 0; card.borderColor = 'none'; sv(); buildMiroCanvas(); };
  toolbar.querySelector('.mg-hdr-clr').oninput = function () { Object.keys(card.cellColors || {}).forEach(k => { if (k.startsWith('0,')) delete card.cellColors[k]; }); card.headerColor = this.value; sv(); buildMiroCanvas(); };

  el.addEventListener('click', (e) => {
    if (e.target.closest('.mc-del') || e.target.closest('.mg-toolbar')) return;
    document.querySelectorAll('.mg-toolbar.show').forEach(t => { if (t !== toolbar) t.classList.remove('show'); });
    toolbar.classList.toggle('show');
  });
  // Use a self-cleaning listener to avoid orphaned listeners when grid is rebuilt
  const docClickHandler = (e) => {
    if (!document.body.contains(el)) { document.removeEventListener('click', docClickHandler); return; }
    if (!el.contains(e.target)) toolbar.classList.remove('show');
  };
  document.addEventListener('click', docClickHandler);

  // Drag
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
      e.target.closest('.mg-col-resizer')
    ) return;

    e.stopPropagation();
    if (e.ctrlKey || e.metaKey) { toggleMiroSelect(card.id); return; }
    if (!_miroSelected.has(card.id)) { clearMiroSelection(); addMiroSelect(card.id); }

    const page = cp(); const zoom = (page.zoom || 100) / 100;
    const startX = e.clientX, startY = e.clientY;

    // Find implicitly intersecting elements to move alongside the grid
    const cGx = card.x || 0, cGy = card.y || 0, cGw = card.w || 360, cGh = card.h || 120;
    if (page.miroCards) {
      page.miroCards.forEach(c => {
        if (c.id === card.id) return;
        const cx = c.x || 0, cy = c.y || 0, cw = c.w || 280, ch = c.h || 240;
        // if another object is physically located ON TOP of this grid, pretend it's selected for dragging purposes
        const intersects = !(cx + cw < cGx || cx > cGx + cGw || cy + ch < cGy || cy > cGy + cGh);
        if (intersects && !_miroSelected.has(c.id)) {
          addMiroSelect(c.id);
        }
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

  // Grid layout is complete — no post-render update needed

  miroSetupCardDrag(el, card, ['.mg-col-handle', '.mg-row-handle', '.mc-del']);
  // Grid already has its own drag handling above; corner resize removed (function was undefined)

  // Lock UI
  attachLockUI(el, card);

  el.appendChild(del);
  el.appendChild(toolbar);
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
