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

  /* ─── LocalStorage + IndexedDB Cache ─── */
  const LS_META = 'sm_meta';
  const LS_PAGES_META = 'sm_pages_meta';
  const LS_CUR_PAGE = 'sm_cur_page';
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

  function cachePageDataSafe(pid, data) {
    const itemCount = (data.widgets || []).length + (data.miroCards || []).length;
    let lsOk = false;
    try {
      const json = JSON.stringify(data);
      localStorage.setItem(lsPageKey(pid), json);
      const verify = localStorage.getItem(lsPageKey(pid));
      lsOk = (verify && verify.length === json.length);
      if (!lsOk) console.error(`[CACHE LS VERIFY FAIL] Page ${pid}`);
    } catch (e) {
      console.error(`[CACHE LS FAIL] Page ${pid} — ${e.message}`);
      lsOk = false;
    }
    idbSet('page_' + pid, data).then(ok => {
      if (!ok) console.error(`[CACHE IDB FAIL] Page ${pid}`);
    });
    if (!lsOk && itemCount > 0) {
      console.warn(`[CACHE WARNING] Page ${pid} has ${itemCount} items but localStorage write FAILED.`);
      if (typeof showToast === 'function') showToast('⚠️ Storage nearly full — data safe in backup cache', 4000);
    }
    return lsOk;
  }

  function cachePageData(pid, data) {
    cachePageDataSafe(pid, data);
  }

  async function getCachedPageDataAsync(pid) {
    const idbData = await idbGet('page_' + pid);
    if (idbData) return idbData;
    return getCachedPageDataSync(pid);
  }
  function getCachedPageDataSync(pid) {
    try { return JSON.parse(localStorage.getItem(lsPageKey(pid))); } catch (e) { return null; }
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
    const used = getLsUsage();
    const max = 5 * 1024 * 1024;
    return { used, max, pct: Math.round(used / max * 100) };
  }

  // Export to SM.data
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
