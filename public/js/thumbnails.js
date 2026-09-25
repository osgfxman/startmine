/**
 * @module Thumbnails
 * @description Handles fetching, caching, and generating thumbnail previews for URLs
 * @namespace SM.ui
 * @depends namespace.js, utils.js, offline.js
 * @provides window.buildMiroPlaceholder, window.loadThumbCached, window.queueCardFetch, window.updateCardThumb
 * @safety Do not overload external thumbnail services (use caching headers)
 */
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

// Register on SM.ui and window
SM.ui = SM.ui || {};
SM.ui.buildMiroPlaceholder = typeof buildMiroPlaceholder !== 'undefined' ? buildMiroPlaceholder : window.buildMiroPlaceholder;
SM.ui.loadThumbCached = typeof loadThumbCached !== 'undefined' ? loadThumbCached : window.loadThumbCached;
SM.ui.queueCardFetch = typeof queueCardFetch !== 'undefined' ? queueCardFetch : window.queueCardFetch;
SM.ui.fetchCardMeta = typeof fetchCardMeta !== 'undefined' ? fetchCardMeta : window.fetchCardMeta;
SM.ui.updateCardThumb = typeof updateCardThumb !== 'undefined' ? updateCardThumb : window.updateCardThumb;
SM.ui.updateCardThumbDirect = typeof updateCardThumbDirect !== 'undefined' ? updateCardThumbDirect : window.updateCardThumbDirect;
SM.ui.getCachedThumb = typeof getCachedThumb !== 'undefined' ? getCachedThumb : window.getCachedThumb;
SM.ui.cacheThumbBlob = typeof cacheThumbBlob !== 'undefined' ? cacheThumbBlob : window.cacheThumbBlob;
SM.ui.fetchAndCacheThumb = typeof fetchAndCacheThumb !== 'undefined' ? fetchAndCacheThumb : window.fetchAndCacheThumb;
SM.ui.openThumbIDB = typeof openThumbIDB !== 'undefined' ? openThumbIDB : window.openThumbIDB;

SM.ui.updateImageDimensions = typeof updateImageDimensions !== 'undefined' ? updateImageDimensions : window.updateImageDimensions;
SM.ui.refreshThumbnails = typeof refreshThumbnails !== 'undefined' ? refreshThumbnails : window.refreshThumbnails;
SM.ui.generateThumbnailsForSelection = typeof generateThumbnailsForSelection !== 'undefined' ? generateThumbnailsForSelection : window.generateThumbnailsForSelection;

window.buildMiroPlaceholder = SM.ui.buildMiroPlaceholder;
window.loadThumbCached = SM.ui.loadThumbCached;
window.queueCardFetch = SM.ui.queueCardFetch;
window.fetchCardMeta = SM.ui.fetchCardMeta;
window.updateCardThumb = SM.ui.updateCardThumb;
window.updateCardThumbDirect = SM.ui.updateCardThumbDirect;
window.getCachedThumb = SM.ui.getCachedThumb;
window.cacheThumbBlob = SM.ui.cacheThumbBlob;
window.fetchAndCacheThumb = SM.ui.fetchAndCacheThumb;
window.openThumbIDB = SM.ui.openThumbIDB;

window.updateImageDimensions = SM.ui.updateImageDimensions;
window.refreshThumbnails = SM.ui.refreshThumbnails;
window.generateThumbnailsForSelection = SM.ui.generateThumbnailsForSelection;
