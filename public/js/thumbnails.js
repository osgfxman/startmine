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
    const resp = await fetch(url, { cache: 'force-cache', referrerPolicy: 'no-referrer' });
    if (!resp.ok) return null;
    const ct = resp.headers.get('content-type') || '';
    if (!ct.startsWith('image/')) return null;
    const blob = await resp.blob();
    if (blob.size < 500) return null;
    if (!(await isValidImageBlob(blob, url))) return null;
    await cacheThumbBlob(url, blob);
    return URL.createObjectURL(blob);
  } catch (e) { return null; }
}

// Load a thumbnail: try IDB cache first, then network
async function loadThumbCached(url) {
  // 1. IDB cache
  const cached = await getCachedThumb(url);
  if (cached && cached.blob) {
    if (await isValidImageBlob(cached.blob, url)) {
      return URL.createObjectURL(cached.blob);
    } else {
      await deleteImageVaultKey(thumbKey(url));
    }
  }
  // 2. Network → cache
  return await fetchAndCacheThumb(url);
}

// ─── ImgBB Placeholder Detection & Local/Cloud Image Vault ───
function isImgBBErrorPlaceholder(wOrImg, h) {
  let width = wOrImg;
  let height = h;
  if (wOrImg && typeof wOrImg === 'object') {
    width = wOrImg.naturalWidth || wOrImg.width || 0;
    height = wOrImg.naturalHeight || wOrImg.height || 0;
  }
  // ImgBB "service unavailable" banner is 172x96 (or 180x100 maintenance banner)
  return (width === 172 && height === 96) || (width === 180 && height === 100);
}

async function isValidImageBlob(blob, sourceUrl = '') {
  if (!blob || !(blob instanceof Blob) || blob.size < 100) return false;
  // ImgBB's 172x96 error PNG is ~1.5KB - 2.8KB. Verify dimensions if suspiciously small:
  if (blob.size < 4500) {
    return new Promise((resolve) => {
      const objUrl = URL.createObjectURL(blob);
      const testImg = new Image();
      testImg.onload = () => {
        URL.revokeObjectURL(objUrl);
        if (isImgBBErrorPlaceholder(testImg.naturalWidth, testImg.naturalHeight)) {
          resolve(false);
        } else {
          resolve(testImg.naturalWidth > 0 && testImg.naturalHeight > 0);
        }
      };
      testImg.onerror = () => {
        URL.revokeObjectURL(objUrl);
        resolve(false);
      };
      testImg.src = objUrl;
    });
  }
  return true;
}

function dataUrlToBlob(dataUrl) {
  try {
    if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) return null;
    const parts = dataUrl.split(',');
    if (parts.length < 2) return null;
    const mimeMatch = parts[0].match(/:(.*?);/);
    const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
    const bstr = atob(parts[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) u8arr[n] = bstr.charCodeAt(n);
    return new Blob([u8arr], { type: mime });
  } catch (e) {
    return null;
  }
}

function blobToDataUrl(blob) {
  return new Promise((resolve) => {
    if (!blob) return resolve(null);
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result || null);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(blob);
  });
}

function createMicroPreview(base64OrUrl, maxDim = 80, quality = 0.45) {
  return new Promise((resolve) => {
    if (!base64OrUrl) return resolve(null);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        if (isImgBBErrorPlaceholder(img)) return resolve(null);
        let w = img.naturalWidth || img.width;
        let h = img.naturalHeight || img.height;
        if (!w || !h) return resolve(null);
        if (w > maxDim || h > maxDim) {
          if (w > h) { h = Math.max(1, Math.round(h * maxDim / w)); w = maxDim; }
          else { w = Math.max(1, Math.round(w * maxDim / h)); h = maxDim; }
        }
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        resolve(c.toDataURL('image/jpeg', quality));
      } catch (e) { resolve(null); }
    };
    img.onerror = () => resolve(null);
    img.src = base64OrUrl;
  });
}

async function deleteImageVaultKey(key) {
  if (!key) return false;
  try {
    const db = await openThumbIDB();
    return new Promise((resolve) => {
      const tx = db.transaction(THUMB_IDB_STORE, 'readwrite');
      tx.objectStore(THUMB_IDB_STORE).delete(key);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  } catch (e) { return false; }
}

function _normalizeVaultKey(k) {
  if (!k || typeof k !== 'string') return null;
  if (k.startsWith('img_cid_') || k.startsWith('img_drv_') || k.startsWith('th_')) return k;
  if (k.startsWith('http://') || k.startsWith('https://')) return thumbKey(k);
  return k;
}

async function saveImageVaultBlob(keys, blobOrDataUrl) {
  try {
    const blob = typeof blobOrDataUrl === 'string' ? dataUrlToBlob(blobOrDataUrl) : blobOrDataUrl;
    if (!blob || !(await isValidImageBlob(blob))) return false;
    const keyList = (Array.isArray(keys) ? keys : [keys]).map(_normalizeVaultKey).filter(Boolean);
    if (!keyList.length) return false;
    const db = await openThumbIDB();
    return new Promise((resolve) => {
      const tx = db.transaction(THUMB_IDB_STORE, 'readwrite');
      const store = tx.objectStore(THUMB_IDB_STORE);
      const ts = Date.now();
      for (const k of keyList) {
        store.put({ blob, url: k, ts }, k);
      }
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  } catch (e) { return false; }
}

async function getImageVaultBlob(keys) {
  try {
    const keyList = (Array.isArray(keys) ? keys : [keys]).map(_normalizeVaultKey).filter(Boolean);
    if (!keyList.length) return null;
    const db = await openThumbIDB();
    for (const k of keyList) {
      const entry = await new Promise((resolve) => {
        const tx = db.transaction(THUMB_IDB_STORE, 'readonly');
        const req = tx.objectStore(THUMB_IDB_STORE).get(k);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      });
      if (entry && entry.blob) {
        if (await isValidImageBlob(entry.blob, k)) {
          return entry.blob;
        } else {
          await deleteImageVaultKey(k);
        }
      }
    }
    return null;
  } catch (e) { return null; }
}

// ─── Google Drive Image Cloud Storage (Primary Reliable Host) ───
let _driveImgFolderPromise = null;

async function getGoogleDriveActiveToken(interactive = false) {
  let token = localStorage.getItem('gdrive_access_token');
  const expiry = parseInt(localStorage.getItem('gdrive_token_expiry') || '0', 10);
  if (token && expiry && Date.now() < expiry - 60000) {
    return token;
  }
  if (typeof window.requestGoogleDriveToken === 'function') {
    try {
      token = await window.requestGoogleDriveToken(interactive);
      if (token) return token;
    } catch (e) { /* ignore */ }
  }
  return localStorage.getItem('gdrive_access_token') || null;
}

async function getOrCreateDriveImagesFolder(token) {
  if (!token) return null;
  const cachedId = localStorage.getItem('sm_gdrive_img_folder_id');
  if (cachedId) return cachedId;
  if (_driveImgFolderPromise) return _driveImgFolderPromise;

  _driveImgFolderPromise = (async () => {
    try {
      // 1. Get or create root StartMe-Miro folder
      let rootFolderId = null;
      if (typeof window.getOrCreateDriveFolder === 'function') {
        rootFolderId = await window.getOrCreateDriveFolder(token);
      } else {
        const qRoot = encodeURIComponent(`name='StartMe-Miro' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
        const rRoot = await fetch(`https://www.googleapis.com/drive/v3/files?q=${qRoot}&fields=files(id)`, {
          headers: { 'Authorization': 'Bearer ' + token }
        });
        if (rRoot.ok) {
          const dRoot = await rRoot.json();
          if (dRoot.files && dRoot.files.length > 0) rootFolderId = dRoot.files[0].id;
        }
      }

      // 2. Look for 'Images' subfolder inside StartMe-Miro
      const parentClause = rootFolderId ? ` and '${rootFolderId}' in parents` : '';
      const qImg = encodeURIComponent(`name='Images' and mimeType='application/vnd.google-apps.folder' and trashed=false${parentClause}`);
      const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${qImg}&fields=files(id,name)`, {
        headers: { 'Authorization': 'Bearer ' + token }
      });
      if (res.ok) {
        const data = await res.json();
        if (data.files && data.files.length > 0) {
          localStorage.setItem('sm_gdrive_img_folder_id', data.files[0].id);
          return data.files[0].id;
        }
      }

      // 3. Create 'Images' folder
      const meta = {
        name: 'Images',
        mimeType: 'application/vnd.google-apps.folder'
      };
      if (rootFolderId) meta.parents = [rootFolderId];
      const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + token,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(meta)
      });
      if (createRes.ok) {
        const created = await createRes.json();
        if (created && created.id) {
          localStorage.setItem('sm_gdrive_img_folder_id', created.id);
          return created.id;
        }
      }
      return rootFolderId;
    } catch (e) {
      console.warn('[DriveImages] Folder check error:', e);
      return null;
    } finally {
      _driveImgFolderPromise = null;
    }
  })();

  return _driveImgFolderPromise;
}

async function uploadImageToGoogleDrive(base64OrBlob, label = '', opts = {}) {
  try {
    const token = await getGoogleDriveActiveToken(Boolean(opts.interactive));
    if (!token) return null;

    const blob = typeof base64OrBlob === 'string' ? dataUrlToBlob(base64OrBlob) : base64OrBlob;
    if (!blob || !(await isValidImageBlob(blob))) return null;

    let folderId = await getOrCreateDriveImagesFolder(token);
    const ext = (blob.type && blob.type.includes('png')) ? 'png' : 'jpg';
    const cleanLabel = (label || 'startmine_img').replace(/[^a-zA-Z0-9_\-\u0600-\u06FF]/g, '_').slice(0, 40);
    const fileName = `${cleanLabel}_${Date.now()}.${ext}`;

    const metadata = {
      name: fileName,
      mimeType: blob.type || 'image/jpeg'
    };
    if (folderId) metadata.parents = [folderId];

    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', blob);

    let res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,thumbnailLink,webContentLink', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token },
      body: form
    });

    // If cached folderId was deleted on Drive, clear cache and retry once
    if (res.status === 404 && folderId) {
      localStorage.removeItem('sm_gdrive_img_folder_id');
      folderId = await getOrCreateDriveImagesFolder(token);
      const retryMeta = { name: fileName, mimeType: blob.type || 'image/jpeg' };
      if (folderId) retryMeta.parents = [folderId];
      const retryForm = new FormData();
      retryForm.append('metadata', new Blob([JSON.stringify(retryMeta)], { type: 'application/json' }));
      retryForm.append('file', blob);
      res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,thumbnailLink,webContentLink', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + token },
        body: retryForm
      });
    }

    if (!res.ok) {
      console.warn('[DriveImages] Upload HTTP error:', res.status);
      return null;
    }

    const fileData = await res.json();
    if (!fileData || !fileData.id) return null;

    const driveFileId = fileData.id;
    const driveUrl = `https://lh3.googleusercontent.com/d/${driveFileId}`;

    // Make readable by link so <img> tags on any device can load it directly
    fetch(`https://www.googleapis.com/drive/v3/files/${driveFileId}/permissions`, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ role: 'reader', type: 'anyone' })
    }).catch(() => {});

    // Save to local IndexedDB Vault under Drive ID & URL
    const vaultKeys = [`img_drv_${driveFileId}`, driveUrl];
    if (opts.cardId) vaultKeys.push(`img_cid_${opts.cardId}`);
    await saveImageVaultBlob(vaultKeys, blob);

    console.log(`[DriveImages] ✅ Uploaded image to Google Drive: ${driveFileId}`);
    return {
      driveFileId,
      driveUrl,
      thumbnailLink: fileData.thumbnailLink || `https://drive.google.com/thumbnail?id=${driveFileId}&sz=w2000`,
      webContentLink: fileData.webContentLink || ''
    };
  } catch (e) {
    console.warn('[DriveImages] Upload error:', e);
    return null;
  }
}

async function fetchDriveImageBlob(driveFileId, interactive = false) {
  if (!driveFileId) return null;
  // 1. Check local vault first
  const cached = await getImageVaultBlob([`img_drv_${driveFileId}`, `https://lh3.googleusercontent.com/d/${driveFileId}`]);
  if (cached) return cached;

  // 2. Try authenticated Google Drive API download (CORS-friendly & 100% reliable)
  try {
    const token = await getGoogleDriveActiveToken(interactive);
    if (token) {
      const resp = await fetch(`https://www.googleapis.com/drive/v3/files/${driveFileId}?alt=media`, {
        headers: { 'Authorization': 'Bearer ' + token }
      });
      if (resp.ok) {
        const blob = await resp.blob();
        if (await isValidImageBlob(blob)) {
          await saveImageVaultBlob([`img_drv_${driveFileId}`, `https://lh3.googleusercontent.com/d/${driveFileId}`], blob);
          return blob;
        }
      }
    }
  } catch (e) {
    console.warn('[DriveImages] API media fetch failed, trying CDN:', e);
  }
  return null;
}

// ─── Silent Background Backup of Existing Images to Google Drive ───
const _silentDriveBackupQueue = [];
let _silentDriveBackupRunning = false;
const _silentDriveBackedUpIds = new Set();

function queueSilentDriveBackup(card, blobOrDataUrl) {
  if (!card || !card.id || card.driveFileId || _silentDriveBackedUpIds.has(card.id)) return;
  if (!localStorage.getItem('gdrive_access_token')) return;
  _silentDriveBackedUpIds.add(card.id);
  _silentDriveBackupQueue.push({ card, blobOrDataUrl });
  if (!_silentDriveBackupRunning) {
    _processSilentDriveBackupQueue();
  }
}

async function _processSilentDriveBackupQueue() {
  if (_silentDriveBackupRunning) return;
  _silentDriveBackupRunning = true;
  while (_silentDriveBackupQueue.length > 0) {
    const item = _silentDriveBackupQueue.shift();
    if (!item || !item.card || item.card.driveFileId) continue;
    try {
      const res = await uploadImageToGoogleDrive(item.blobOrDataUrl, item.card.label || item.card.id, { cardId: item.card.id, interactive: false });
      if (res && res.driveFileId) {
        item.card.driveFileId = res.driveFileId;
        item.card.driveUrl = res.driveUrl;
        if (item.card.imageUrl && (item.card.imageUrl.includes('ibb.co') || item.card.imageUrl.includes('imgbb.com'))) {
          item.card.imgbbUrl = item.card.imageUrl;
        }
        // Persist metadata quietly to Firebase & local storage if user is signed in
        if (typeof window.D !== 'undefined' && Array.isArray(D.pages)) {
          const pg = D.pages.find(p => p && Array.isArray(p.miroCards) && p.miroCards.some(c => c && c.id === item.card.id));
          if (pg) {
            const idx = pg.miroCards.findIndex(c => c && c.id === item.card.id);
            if (idx !== -1 && typeof USER_ID !== 'undefined' && USER_ID && typeof firebase !== 'undefined') {
              const baseRef = `users/${USER_ID}/startmine_pages/${pg.id}/miroCards/${idx}`;
              firebase.database().ref(baseRef).update({
                driveFileId: res.driveFileId,
                driveUrl: res.driveUrl,
                imgbbUrl: item.card.imgbbUrl || item.card.imageUrl
              }).catch(() => {});
            }
            if (typeof window.cachePageData === 'function') {
              window.cachePageData(pg.id, pg);
            }
          }
        }
      }
    } catch (e) { /* ignore silent backup error */ }
    await new Promise(r => setTimeout(r, 800));
  }
  _silentDriveBackupRunning = false;
}

// ─── Staggered Image Loader Queue (Prevents ImgBB Burst Rate-Limiting) ───
const _imgbbLoadQueue = [];
let _imgbbActiveLoads = 0;
const IMGBB_MAX_CONCURRENT = 3;
const IMGBB_STAGGER_MS = 180;

function enqueueStaggeredImgLoad(taskFn) {
  return new Promise((resolve) => {
    _imgbbLoadQueue.push({ taskFn, resolve });
    _pumpStaggeredImgQueue();
  });
}

function _pumpStaggeredImgQueue() {
  while (_imgbbActiveLoads < IMGBB_MAX_CONCURRENT && _imgbbLoadQueue.length > 0) {
    const item = _imgbbLoadQueue.shift();
    _imgbbActiveLoads++;
    Promise.resolve()
      .then(() => item.taskFn())
      .then((res) => item.resolve(res))
      .catch(() => item.resolve(false))
      .finally(() => {
        setTimeout(() => {
          _imgbbActiveLoads = Math.max(0, _imgbbActiveLoads - 1);
          _pumpStaggeredImgQueue();
        }, IMGBB_STAGGER_MS);
      });
  }
}

function _extractDriveFileIdFromUrl(url) {
  if (!url || typeof url !== 'string') return null;
  const m1 = url.match(/googleusercontent\.com\/d\/([a-zA-Z0-9_-]{15,})/);
  if (m1) return m1[1];
  const m2 = url.match(/[?&]id=([a-zA-Z0-9_-]{15,})/);
  if (m2 && url.includes('drive.google.com')) return m2[1];
  const m3 = url.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]{15,})/);
  if (m3) return m3[1];
  return null;
}

async function loadMiroCardImage(card, imgEl, containerEl) {
  if (!card || !imgEl) return;
  imgEl.referrerPolicy = 'no-referrer';

  const rawUrl = card.imageUrl || card.driveUrl || card.imgbbUrl || '';
  const detectedDriveId = card.driveFileId || _extractDriveFileIdFromUrl(rawUrl) || _extractDriveFileIdFromUrl(card.driveUrl);
  if (detectedDriveId && !card.driveFileId) card.driveFileId = detectedDriveId;

  const vaultKeys = [
    card.id ? `img_cid_${card.id}` : null,
    card.driveFileId ? `img_drv_${card.driveFileId}` : null,
    card.driveUrl || null,
    card.imageUrl || null,
    card.imgbbUrl || null
  ].filter(Boolean);

  // Helper to remove any existing error/wake overlay
  const clearOverlay = () => {
    if (!containerEl) return;
    const oldPh = containerEl.querySelector('.mi-placeholder');
    if (oldPh) oldPh.remove();
    imgEl.style.display = '';
    imgEl.style.filter = '';
  };

  // 1. Instant Local IndexedDB Vault (0ms, works 100% offline!)
  const localBlob = await getImageVaultBlob(vaultKeys);
  if (localBlob) {
    clearOverlay();
    const objUrl = URL.createObjectURL(localBlob);
    imgEl.onload = () => {
      imgEl.style.filter = '';
    };
    imgEl.src = objUrl;
    if (!card.driveFileId) queueSilentDriveBackup(card, localBlob);
    return;
  }

  // 2. If base64 data URL directly on card, display & store in vault + queue Drive backup
  if (rawUrl.startsWith('data:image')) {
    clearOverlay();
    imgEl.src = rawUrl;
    const b = dataUrlToBlob(rawUrl);
    if (b) {
      await saveImageVaultBlob(vaultKeys, b);
      if (!card.driveFileId) queueSilentDriveBackup(card, b);
    }
    return;
  }

  // Show micro-preview while loading from cloud if available
  if (card.thumbPreview && card.thumbPreview.startsWith('data:image')) {
    imgEl.src = card.thumbPreview;
    imgEl.style.filter = 'blur(4px)';
  }

  // 3. Google Drive Primary Cloud (via authenticated API blob or lh3 CDN)
  if (card.driveFileId) {
    const driveBlob = await fetchDriveImageBlob(card.driveFileId, false);
    if (driveBlob) {
      clearOverlay();
      await saveImageVaultBlob(vaultKeys, driveBlob);
      imgEl.onload = () => { imgEl.style.filter = ''; };
      imgEl.src = URL.createObjectURL(driveBlob);
      return;
    }

    // Try direct Google Drive public CDN links before falling back to ImgBB
    const driveUrls = [
      `https://lh3.googleusercontent.com/d/${card.driveFileId}`,
      `https://drive.google.com/thumbnail?id=${card.driveFileId}&sz=w2000`
    ];
    for (const dUrl of driveUrls) {
      const loaded = await new Promise((resolve) => {
        const probe = new Image();
        probe.referrerPolicy = 'no-referrer';
        probe.crossOrigin = 'anonymous';
        const t = setTimeout(() => resolve(false), 8000);
        probe.onload = async () => {
          clearTimeout(t);
          if (probe.naturalWidth > 0 && !isImgBBErrorPlaceholder(probe)) {
            clearOverlay();
            imgEl.style.filter = '';
            imgEl.src = dUrl;
            try {
              const c = document.createElement('canvas');
              c.width = probe.naturalWidth; c.height = probe.naturalHeight;
              c.getContext('2d').drawImage(probe, 0, 0);
              c.toBlob(b => { if (b) saveImageVaultBlob(vaultKeys, b); }, 'image/jpeg', 0.9);
            } catch (e) { /* CORS fallback */ }
            resolve(true);
          } else {
            resolve(false);
          }
        };
        probe.onerror = () => { clearTimeout(t); resolve(false); };
        probe.src = dUrl;
      });
      if (loaded) return;
    }
  }

  // 4. Staggered ImgBB / External URL Loader with Cold-Storage Wake & Anti-172x96 Filter
  const targetUrl = card.imgbbUrl || card.imageUrl;
  if (!targetUrl) return;

  const isImgBB = /ibb\.co|imgbb\.com/i.test(targetUrl);

  const attemptNetworkLoad = async (maxAttempts = isImgBB ? 3 : 1) => {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const success = await enqueueStaggeredImgLoad(() => new Promise((resolve) => {
        const bustUrl = attempt === 1
          ? targetUrl
          : targetUrl + (targetUrl.includes('?') ? '&' : '?') + `_wake=${Date.now()}_${attempt}`;

        const probe = new Image();
        probe.referrerPolicy = 'no-referrer';
        if (!targetUrl.includes('miro.com/api')) {
          probe.crossOrigin = 'anonymous';
        }
        const timer = setTimeout(() => resolve(false), 12000);

        probe.onload = async () => {
          clearTimeout(timer);
          // Check if ImgBB returned its 172x96 "service unavailable" banner!
          if (isImgBB && isImgBBErrorPlaceholder(probe.naturalWidth, probe.naturalHeight)) {
            console.warn(`[ImgVault] ⚠️ Detected ImgBB 172x96 'service unavailable' placeholder on attempt ${attempt} for:`, targetUrl);
            await deleteImageVaultKey(thumbKey(targetUrl));
            resolve(false);
            return;
          }

          clearOverlay();
          imgEl.style.filter = '';
          imgEl.src = probe.src;

          // Cache valid image into Local IndexedDB Vault + queue silent Google Drive backup!
          try {
            const c = document.createElement('canvas');
            c.width = probe.naturalWidth || probe.width;
            c.height = probe.naturalHeight || probe.height;
            c.getContext('2d').drawImage(probe, 0, 0);
            c.toBlob(async (blob) => {
              if (blob && (await isValidImageBlob(blob, targetUrl))) {
                await saveImageVaultBlob(vaultKeys, blob);
                if (!card.thumbPreview) {
                  const micro = await createMicroPreview(c.toDataURL('image/jpeg', 0.5));
                  if (micro) card.thumbPreview = micro;
                }
                if (!card.driveFileId) {
                  queueSilentDriveBackup(card, blob);
                }
              }
            }, 'image/jpeg', 0.9);
          } catch (corsErr) {
            // If canvas tainted without CORS, fallback to non-anonymous display
          }
          resolve(true);
        };

        probe.onerror = () => {
          clearTimeout(timer);
          // If anonymous CORS failed on a server that blocks CORS headers, try once without crossOrigin
          if (probe.crossOrigin) {
            const fallbackProbe = new Image();
            fallbackProbe.referrerPolicy = 'no-referrer';
            const t2 = setTimeout(() => resolve(false), 10000);
            fallbackProbe.onload = () => {
              clearTimeout(t2);
              if (isImgBB && isImgBBErrorPlaceholder(fallbackProbe.naturalWidth, fallbackProbe.naturalHeight)) {
                resolve(false);
                return;
              }
              clearOverlay();
              imgEl.style.filter = '';
              imgEl.src = fallbackProbe.src;
              resolve(true);
            };
            fallbackProbe.onerror = () => { clearTimeout(t2); resolve(false); };
            fallbackProbe.src = bustUrl;
            return;
          }
          resolve(false);
        };

        probe.src = bustUrl;
      }));

      if (success) return true;
      if (attempt < maxAttempts) {
        await new Promise(r => setTimeout(r, 900 * attempt));
      }
    }
    return false;
  };

  const loadedOk = await attemptNetworkLoad();
  if (!loadedOk && containerEl) {
    // Show clean interactive Rescue / Wake UI instead of the ugly 172x96 ImgBB banner
    if (!card.thumbPreview) {
      imgEl.style.display = 'none';
    }
    const oldPh = containerEl.querySelector('.mi-placeholder');
    if (oldPh) oldPh.remove();

    const ph = document.createElement('div');
    ph.className = 'mi-placeholder';
    ph.style.cssText = 'display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;padding:10px;text-align:center;direction:rtl;background:rgba(20,24,38,0.92);color:#e4e4e4;width:100%;height:100%;box-sizing:border-box;border:1px dashed rgba(108,143,255,0.4);border-radius:8px;';

    if (targetUrl.includes('miro.com/api')) {
      ph.innerHTML = '<span style="font-size: 1.8rem;">⚠️</span><span style="font-size: 0.78rem; font-weight: 600;">صورة ميرو الأصلية (انسخ كصورة)</span>';
    } else {
      ph.innerHTML = `
        <span style="font-size:1.4rem;">☁️</span>
        <span style="font-size:0.72rem;font-weight:600;color:#aab8ff;line-height:1.3;">خادم ImgBB في وضع الخمول المؤقت</span>
        <div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:center;margin-top:2px;">
          <button type="button" class="mi-wake-btn" style="background:#4f6ef7;color:#fff;border:none;border-radius:5px;padding:4px 8px;font-size:0.68rem;cursor:pointer;font-weight:600;">🔄 تنشيط وتحميل</button>
          <button type="button" class="mi-open-btn" style="background:rgba(255,255,255,0.12);color:#ddd;border:1px solid rgba(255,255,255,0.2);border-radius:5px;padding:4px 8px;font-size:0.68rem;cursor:pointer;">🌐 فتح الرابط</button>
        </div>
      `;
      const wakeBtn = ph.querySelector('.mi-wake-btn');
      const openBtn = ph.querySelector('.mi-open-btn');
      if (wakeBtn) {
        wakeBtn.onclick = async (ev) => {
          ev.stopPropagation();
          wakeBtn.textContent = '⏳ جاري التنشيط...';
          wakeBtn.disabled = true;
          const ok = await attemptNetworkLoad(3);
          if (!ok) {
            wakeBtn.textContent = '🔄 إعادة المحاولة';
            wakeBtn.disabled = false;
          }
        };
      }
      if (openBtn) {
        openBtn.onclick = (ev) => {
          ev.stopPropagation();
          window.open(targetUrl, '_blank', 'noopener,noreferrer');
        };
      }
    }
    containerEl.insertBefore(ph, imgEl);
  }
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
SM.ui.isImgBBErrorPlaceholder = isImgBBErrorPlaceholder;
SM.ui.isValidImageBlob = isValidImageBlob;
SM.ui.dataUrlToBlob = dataUrlToBlob;
SM.ui.blobToDataUrl = blobToDataUrl;
SM.ui.createMicroPreview = createMicroPreview;
SM.ui.saveImageVaultBlob = saveImageVaultBlob;
SM.ui.getImageVaultBlob = getImageVaultBlob;
SM.ui.deleteImageVaultKey = deleteImageVaultKey;
SM.ui.getOrCreateDriveImagesFolder = getOrCreateDriveImagesFolder;
SM.ui.uploadImageToGoogleDrive = uploadImageToGoogleDrive;
SM.ui.fetchDriveImageBlob = fetchDriveImageBlob;
SM.ui.loadMiroCardImage = loadMiroCardImage;
SM.ui.queueSilentDriveBackup = queueSilentDriveBackup;

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
window.isImgBBErrorPlaceholder = isImgBBErrorPlaceholder;
window.isValidImageBlob = isValidImageBlob;
window.dataUrlToBlob = dataUrlToBlob;
window.blobToDataUrl = blobToDataUrl;
window.createMicroPreview = createMicroPreview;
window.saveImageVaultBlob = saveImageVaultBlob;
window.getImageVaultBlob = getImageVaultBlob;
window.deleteImageVaultKey = deleteImageVaultKey;
window.getOrCreateDriveImagesFolder = getOrCreateDriveImagesFolder;
window.uploadImageToGoogleDrive = uploadImageToGoogleDrive;
window.fetchDriveImageBlob = fetchDriveImageBlob;
window.loadMiroCardImage = loadMiroCardImage;
window.queueSilentDriveBackup = queueSilentDriveBackup;
