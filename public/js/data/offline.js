/**
 * @module Offline
 * @description Manages offline mode toggles and local caching fallback
 * @namespace SM.data
 * @depends namespace.js
 * @provides window.toggleOfflineMode, window.setOfflineMode, window.updateOfflineUI, window.markDirtyOffline
 * @safety Do not trigger live DB reads while in offline mode
 */
// js/data/offline.js
(function() {
  /* ─── Synchronization Mode (default 'realtime') ─── */
  window._syncMode = 'realtime'; // 'realtime', 'saveUpload', 'offline'
  window._offlineMode = false;
  window._dirtyOffline = false;
  window._lastSvTs = 0; // Timestamp of last successful sv() for beacon dedup
  window._dirtyPages = {};

  try {
    const dpStored = localStorage.getItem('sm_dirty_pages');
    if (dpStored) window._dirtyPages = JSON.parse(dpStored);
  } catch(e) {}

  try {
    const stored = localStorage.getItem('sm_sync_mode');
    if (stored !== null) {
      window._syncMode = stored;
    } else {
      const oldOffline = localStorage.getItem('sm_offline_mode');
      if (oldOffline === '1') {
        window._syncMode = 'offline';
      } else {
        window._syncMode = 'realtime';
      }
    }
  } catch(e) {}
  window._offlineMode = (window._syncMode === 'offline');

  function setOfflineMode(val) {
    changeSyncMode(val ? 'offline' : 'realtime');
  }

  function changeSyncMode(newMode) {
    const prevMode = window._syncMode;
    window._syncMode = newMode;
    window._offlineMode = (newMode === 'offline');
    try { localStorage.setItem('sm_sync_mode', newMode); } catch(e) {}
    if (window.SM && window.SM.events) {
      window.SM.events.emit('sync:mode', { mode: newMode, offline: window._offlineMode, prevMode });
    }

    const select = document.getElementById('sync-mode-select');
    if (select && select.value !== newMode) select.value = newMode;

    if (newMode === 'offline') {
      detachAllListeners();
      updateOfflineUI();
      if (typeof showToast === 'function') showToast('✈️ Offline Mode — changes saved locally');
    } else {
      if (prevMode === 'offline' && window._dirtyOffline) {
        if (typeof syncNow === 'function') {
          syncNow().then(() => {
            window._dirtyOffline = false;
            if (typeof setupShardedListeners === 'function') setupShardedListeners();
            if (window.D && window.D.cur && typeof switchActivePage === 'function') {
              switchActivePage(window.D.cur);
            }
            updateOfflineUI();
          }).catch(err => {
            if (typeof showToast === 'function') showToast('❌ Sync failed: ' + (err.message || err));
            changeSyncMode('offline');
          });
          return;
        }
      }
      if (typeof setupShardedListeners === 'function') setupShardedListeners();
      if (window.D && window.D.cur && typeof switchActivePage === 'function') {
        switchActivePage(window.D.cur);
      }
      updateOfflineUI();
    }
  }

  function updateOfflineUI() {
    const select = document.getElementById('sync-mode-select');
    const syncBtn = document.getElementById('sync-now-btn');
    if (select) select.value = window._syncMode;
    
    if (syncBtn) {
      if (window._syncMode === 'realtime') {
        syncBtn.disabled = true;
        syncBtn.title = 'Realtime Sync Active';
        syncBtn.textContent = '🔄';
      } else if (window._syncMode === 'saveUpload') {
        const activePg = typeof cp === 'function' ? cp() : null;
        const isDirty = activePg && window._dirtyPages && window._dirtyPages[activePg.id];
        syncBtn.disabled = false;
        syncBtn.title = isDirty ? 'Save changes to Cloud * (Ctrl+S)' : 'Save changes to Cloud (Ctrl+S)';
        syncBtn.textContent = isDirty ? '💾' : '☁️';
      } else if (window._syncMode === 'offline') {
        syncBtn.disabled = false;
        syncBtn.title = 'Sync to Cloud';
        syncBtn.textContent = '🔄';
      }
    }

    if (typeof setSyncStatus === 'function') {
      if (window._syncMode === 'offline') {
        setSyncStatus('loading', window._dirtyOffline ? '✈️ Offline Mode *' : '✈️ Offline Mode');
      } else if (window._syncMode === 'saveUpload') {
        const activePg = typeof cp === 'function' ? cp() : null;
        const isDirty = activePg && window._dirtyPages && window._dirtyPages[activePg.id];
        setSyncStatus('ok', isDirty ? '☁️ SaveUpload (Unsaved *)' : '☁️ SaveUpload (Synced)');
      } else {
        setSyncStatus('ok', 'Realtime Sync Active ✓');
      }
    }
  }

  function updateDirtyStatus(pageId, isDirty) {
    if (!window._dirtyPages) window._dirtyPages = {};
    window._dirtyPages[pageId] = !!isDirty;
    try {
      localStorage.setItem('sm_dirty_pages', JSON.stringify(window._dirtyPages));
    } catch(e) {}

    if (window.D && window.D.cur === pageId && typeof cp === 'function') {
      const activePg = cp();
      if (activePg) {
        document.title = `${activePg.name}${isDirty ? ' *' : ''} - QuranGFX Backyard`;
      }
    }

    const tabEl = document.querySelector(`.ptab[data-pid="${pageId}"]`);
    if (tabEl) {
      const nmEl = tabEl.querySelector('.ptnm');
      if (nmEl && nmEl.contentEditable !== 'true') {
        const pg = window.D && window.D.pages.find(p => p && p.id === pageId);
        if (pg) {
          nmEl.textContent = pg.name + (isDirty ? ' *' : '');
        }
      }
    }
    
    updateOfflineUI();
  }

  function markDirtyOffline() {
    if (window._syncMode === 'offline' && !window._dirtyOffline) {
      window._dirtyOffline = true;
      updateOfflineUI();
    }
  }

  function toggleOfflineMode() {
    if (window._syncMode === 'offline') {
      changeSyncMode('realtime');
    } else {
      changeSyncMode('offline');
    }
  }

  function detachAllListeners() {
    if (!window.USER_ID) return;
    const metaRef = `users/${window.USER_ID}/startmine_meta`;
    const pagesMetaRef = `users/${window.USER_ID}/startmine_pages_meta`;
    if (window.db) {
      window.db.ref(metaRef).off();
      window.db.ref(pagesMetaRef).off();
      window.db.ref('.info/connected').off();
      if (window._activePageListener) {
        window.db.ref(window._activePageListener).off();
      }
      if (window._activeSubPageListeners) {
        window._activeSubPageListeners.forEach(item => {
          try {
            window.db.ref(item.path).off('value', item.callback);
          } catch(e) {}
        });
        window._activeSubPageListeners = [];
      }
    }
  }

  /* ─── LocalStorage + IndexedDB + In-Memory Cache ─── */
  const LS_META = 'sm_meta';
  const LS_PAGES_META = 'sm_pages_meta';
  const LS_CUR_PAGE = 'sm_cur_page';
  window._memoryPageCache = window._memoryPageCache || new Map();
  const _memoryPageCache = window._memoryPageCache;

  function lsPageKey(pid) { return 'sm_page_' + pid; }
  function cacheMeta(meta) { try { localStorage.setItem(LS_META, JSON.stringify(meta)); } catch (e) { } }
  function cachePagesMeta(pm) { try { localStorage.setItem(LS_PAGES_META, JSON.stringify(pm)); } catch (e) { } }
  function getCachedMeta() { try { return JSON.parse(localStorage.getItem(LS_META)); } catch (e) { return null; } }
  function getCachedPagesMeta() { try { return JSON.parse(localStorage.getItem(LS_PAGES_META)); } catch (e) { return null; } }

  let _idb = null;
  const IDB_NAME = 'startmine_cache';
  const IDB_STORE = 'pages';
  function openIDB() {
    return new Promise((resolve, reject) => {
      if (_idb) return resolve(_idb);
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => { req.result.createObjectStore(IDB_STORE); };
      req.onsuccess = () => { _idb = req.result; resolve(_idb); };
      req.onerror = () => reject(req.error);
    });
  }
  async function idbSet(key, val) {
    try {
      const db = await openIDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).put(val, key);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => reject(tx.error);
      });
    } catch (e) { return false; }
  }
  async function idbGet(key) {
    try {
      const db = await openIDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, 'readonly');
        const req = tx.objectStore(IDB_STORE).get(key);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      });
    } catch (e) { return null; }
  }

  function pruneLocalStorageCache(force) {
    try {
      const usage = getLsUsage();
      const threshold = force ? 1.5 * 1024 * 1024 : 3.2 * 1024 * 1024;
      if (usage > threshold) {
        const curPageId = (window.D && window.D.cur) || localStorage.getItem(LS_CUR_PAGE) || '';
        const curPageKey = curPageId ? lsPageKey(curPageId) : '';
        const pageKeys = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.startsWith('sm_page_') && k !== curPageKey) {
            pageKeys.push(k);
          }
        }
        for (const k of pageKeys) {
          try { localStorage.removeItem(k); } catch(e) {}
          if (getLsUsage() < 2.2 * 1024 * 1024) break;
        }
      }
    } catch(e) {}
  }

  function cachePageDataSafe(pid, data) {
    if (typeof pid === 'object' && pid !== null && !data) {
      data = pid;
      pid = data.id;
    }
    if (pid && data) {
      _memoryPageCache.set(pid, data);
      if (window.D && window.D.pages) {
        const livePg = window.D.pages.find(p => p && p.id === pid);
        if (livePg) {
          if ((data.widgets || []).length > 0) livePg.widgets = data.widgets;
          if ((data.miroCards || []).length > 0) livePg.miroCards = data.miroCards;
          if (data.vGuides !== undefined) livePg.vGuides = data.vGuides;
          if (data.hGuides !== undefined) livePg.hGuides = data.hGuides;
          if (data.customCells !== undefined) livePg.customCells = data.customCells;
          if (data.cols !== undefined) livePg.cols = data.cols;
          if (data.pageType !== undefined) livePg.pageType = data.pageType;
        }
      }
      // Always persist to IndexedDB asynchronously (unlimited quota, non-blocking)
      idbSet('page_' + pid, data).catch(() => {});
    }

    if (!pid || !data) return false;

    // Manage localStorage safely: only write small pages (< 120KB) to avoid quota errors
    let lsOk = false;
    try {
      const json = JSON.stringify(data);
      if (json.length < 120000) {
        try {
          localStorage.setItem(lsPageKey(pid), json);
          lsOk = true;
        } catch (quotaErr) {
          pruneLocalStorageCache(true);
          try {
            localStorage.setItem(lsPageKey(pid), json);
            lsOk = true;
          } catch(e2) {
            lsOk = false;
          }
        }
      } else {
        // Large page payload: intentionally delegate to IndexedDB + RAM
        try { localStorage.removeItem(lsPageKey(pid)); } catch(e) {}
        lsOk = true;
      }
    } catch (e) {
      lsOk = false;
    }
    return lsOk;
  }

  function cachePageData(pid, data) {
    cachePageDataSafe(pid, data);
  }

  async function getCachedPageDataAsync(pid) {
    // 1. Check in-memory sync first
    const syncData = getCachedPageDataSync(pid);
    if (syncData && (((syncData.widgets || []).length > 0) || ((syncData.miroCards || []).length > 0) || (syncData.pageType === 'slicer'))) {
      return syncData;
    }
    // 2. Check IndexedDB (larger, persistent storage)
    const idbData = await idbGet('page_' + pid);
    if (idbData) {
      _memoryPageCache.set(pid, idbData);
      if (window.D && window.D.pages) {
        const livePg = window.D.pages.find(p => p && p.id === pid);
        if (livePg) {
          if (!livePg.widgets || livePg.widgets.length === 0) livePg.widgets = idbData.widgets || [];
          if (!livePg.miroCards || livePg.miroCards.length === 0) livePg.miroCards = idbData.miroCards || [];
          if (idbData.cols !== undefined) livePg.cols = idbData.cols;
        }
      }
      return idbData;
    }
    return syncData;
  }
  function getCachedPageDataSync(pid) {
    // 1. Check active D.pages in RAM
    if (window.D && window.D.pages) {
      const livePg = window.D.pages.find(p => p && p.id === pid);
      if (livePg && (((livePg.widgets || []).length > 0) || ((livePg.miroCards || []).length > 0) || (livePg.pageType === 'slicer'))) {
        return {
          widgets: livePg.widgets || [],
          miroCards: livePg.miroCards || [],
          vGuides: livePg.vGuides || [],
          hGuides: livePg.hGuides || [],
          _guidesMode: livePg._guidesMode || false,
          lockedGuides: livePg.lockedGuides || [],
          cellStates: livePg.cellStates || {},
          mergedCells: livePg.mergedCells || [],
          customCells: livePg.customCells || [],
          cellGuides: livePg.cellGuides || {},
          _layoutGuidesMode: livePg._layoutGuidesMode || false,
          gridRows: livePg.gridRows || null,
          gridCols: livePg.gridCols || null,
          cellPages: livePg.cellPages || null,
          slicerColSizes: livePg.slicerColSizes || null,
          slicerRowSizes: livePg.slicerRowSizes || null,
          cols: livePg.cols !== undefined ? livePg.cols : 3,
          ts: livePg.ts || Date.now()
        };
      }
    }
    // 2. Check memory map
    if (_memoryPageCache.has(pid)) return _memoryPageCache.get(pid);
    // 3. Check localStorage
    try {
      const item = localStorage.getItem(lsPageKey(pid));
      if (!item) return null;
      const parsed = JSON.parse(item);
      if (parsed) _memoryPageCache.set(pid, parsed);
      return parsed;
    } catch (e) { return null; }
  }
  function getCachedPageData(pid) { return getCachedPageDataSync(pid); }

  function getLsUsage() {
    let total = 0;
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        total += key.length + (localStorage.getItem(key) || '').length;
      }
    } catch(e) {}
    return total;
  }
  function getLsCapacity() {
    let used = getLsUsage();
    const max = 5 * 1024 * 1024;
    if (used > 3.2 * 1024 * 1024) {
      pruneLocalStorageCache(false);
      used = getLsUsage();
    }
    return { used, max, pct: Math.round(used / max * 100) };
  }

  // Export to SM.data
  window.SM.data.pruneLocalStorageCache = pruneLocalStorageCache;
  window.SM.data.setOfflineMode = setOfflineMode;
  window.SM.data.changeSyncMode = changeSyncMode;
  window.SM.data.updateOfflineUI = updateOfflineUI;
  window.SM.data.updateDirtyStatus = updateDirtyStatus;
  window.SM.data.markDirtyOffline = markDirtyOffline;
  window.SM.data.toggleOfflineMode = toggleOfflineMode;
  window.SM.data.detachAllListeners = detachAllListeners;
  window.SM.data.lsPageKey = lsPageKey;
  window.SM.data.cacheMeta = cacheMeta;
  window.SM.data.cachePagesMeta = cachePagesMeta;
  window.SM.data.getCachedMeta = getCachedMeta;
  window.SM.data.getCachedPagesMeta = getCachedPagesMeta;
  window.SM.data.openIDB = openIDB;
  window.SM.data.idbSet = idbSet;
  window.SM.data.idbGet = idbGet;
  window.SM.data.cachePageDataSafe = cachePageDataSafe;
  window.SM.data.cachePageData = cachePageData;
  window.SM.data.getCachedPageDataAsync = getCachedPageDataAsync;
  window.SM.data.getCachedPageDataSync = getCachedPageDataSync;
  window.SM.data.getCachedPageData = getCachedPageData;
  window.SM.data.getLsUsage = getLsUsage;
  window.SM.data.getLsCapacity = getLsCapacity;

  // Expose to window directly for HTML handlers and existing code
  window.SM.core.expose('setOfflineMode', setOfflineMode);
  window.SM.core.expose('changeSyncMode', changeSyncMode);
  window.SM.core.expose('updateOfflineUI', updateOfflineUI);
  window.SM.core.expose('updateDirtyStatus', updateDirtyStatus);
  window.SM.core.expose('markDirtyOffline', markDirtyOffline);
  window.SM.core.expose('toggleOfflineMode', toggleOfflineMode);
  window.SM.core.expose('detachAllListeners', detachAllListeners);
  window.SM.core.expose('lsPageKey', lsPageKey);
  window.SM.core.expose('cacheMeta', cacheMeta);
  window.SM.core.expose('cachePagesMeta', cachePagesMeta);
  window.SM.core.expose('getCachedMeta', getCachedMeta);
  window.SM.core.expose('getCachedPagesMeta', getCachedPagesMeta);
  window.SM.core.expose('openIDB', openIDB);
  window.SM.core.expose('idbSet', idbSet);
  window.SM.core.expose('idbGet', idbGet);
  window.SM.core.expose('cachePageDataSafe', cachePageDataSafe);
  window.SM.core.expose('cachePageData', cachePageData);
  window.SM.core.expose('getCachedPageDataAsync', getCachedPageDataAsync);
  window.SM.core.expose('getCachedPageDataSync', getCachedPageDataSync);
  window.SM.core.expose('getCachedPageData', getCachedPageData);
  window.SM.core.expose('getLsUsage', getLsUsage);
  window.SM.core.expose('getLsCapacity', getLsCapacity);
  window.SM.core.expose('pruneLocalStorageCache', pruneLocalStorageCache);

  SM.data.toggleOfflineMode = typeof toggleOfflineMode !== 'undefined' ? toggleOfflineMode : window.toggleOfflineMode;
  SM.data.setOfflineMode = typeof setOfflineMode !== 'undefined' ? setOfflineMode : window.setOfflineMode;
  SM.data.changeSyncMode = typeof changeSyncMode !== 'undefined' ? changeSyncMode : window.changeSyncMode;
  SM.data.updateOfflineUI = typeof updateOfflineUI !== 'undefined' ? updateOfflineUI : window.updateOfflineUI;
  SM.data.updateDirtyStatus = typeof updateDirtyStatus !== 'undefined' ? updateDirtyStatus : window.updateDirtyStatus;
  SM.data.markDirtyOffline = typeof markDirtyOffline !== 'undefined' ? markDirtyOffline : window.markDirtyOffline;

  window.toggleOfflineMode = SM.data.toggleOfflineMode;
  window.setOfflineMode = SM.data.setOfflineMode;
  window.changeSyncMode = SM.data.changeSyncMode;
  window.updateOfflineUI = SM.data.updateOfflineUI;
  window.updateDirtyStatus = SM.data.updateDirtyStatus;
  window.markDirtyOffline = SM.data.markDirtyOffline;
})();
