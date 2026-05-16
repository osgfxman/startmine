// js/data/offline.js
(function() {
  /* ─── Offline Mode (default ON) ─── */
  window._offlineMode = true;
  window._dirtyOffline = false;
  window._lastSvTs = 0; // Timestamp of last successful sv() for beacon dedup
  try {
    const stored = localStorage.getItem('sm_offline_mode');
    if (stored !== null) window._offlineMode = stored === '1';
    else localStorage.setItem('sm_offline_mode', '1'); // First visit: default to offline
  } catch(e) {}

  function setOfflineMode(val) {
    window._offlineMode = val;
    try { localStorage.setItem('sm_offline_mode', val ? '1' : '0'); } catch(e) {}
    if (typeof updateOfflineUI === 'function') updateOfflineUI();
  }

  function updateOfflineUI() {
    const cb = document.getElementById('offline-toggle-cb');
    const lbl = document.getElementById('offline-label');
    const syncBtn = document.getElementById('sync-now-btn');
    if (cb) cb.checked = window._offlineMode;
    if (lbl) lbl.textContent = window._offlineMode ? '✈️ Offline' : '⚡ Realtime';
    if (syncBtn) syncBtn.disabled = !window._offlineMode;
    // Update sync status display
    if (window._offlineMode) {
      if (typeof setSyncStatus === 'function') {
        setSyncStatus('loading', window._dirtyOffline ? '✈️ Offline Mode *' : '✈️ Offline Mode');
      }
    }
  }

  function markDirtyOffline() {
    if (window._offlineMode && !window._dirtyOffline) {
      window._dirtyOffline = true;
      updateOfflineUI();
    }
  }

  function toggleOfflineMode() {
    if (window._offlineMode) {
      // Switching to Realtime: sync first if dirty, then re-attach listeners
      if (window._dirtyOffline) {
        if (typeof syncNow === 'function') {
          syncNow().then(() => {
            setOfflineMode(false);
            window._dirtyOffline = false;
            if (typeof setupShardedListeners === 'function') setupShardedListeners();
            if (typeof setSyncStatus === 'function') setSyncStatus('ok', 'Realtime Sync Active ✓');
          }).catch(err => {
            if (typeof showToast === 'function') showToast('❌ Sync failed: ' + (err.message || err));
          });
        }
      } else {
        setOfflineMode(false);
        if (typeof setupShardedListeners === 'function') setupShardedListeners();
        if (typeof setSyncStatus === 'function') setSyncStatus('ok', 'Realtime Sync Active ✓');
      }
    } else {
      // Switching to Offline: detach listeners
      detachAllListeners();
      setOfflineMode(true);
      if (typeof setSyncStatus === 'function') setSyncStatus('loading', '✈️ Offline Mode');
      if (typeof showToast === 'function') showToast('✈️ Offline Mode — changes saved locally');
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
  window.SM.data.updateOfflineUI = updateOfflineUI;
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
  window.SM.core.expose('updateOfflineUI', updateOfflineUI);
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
})();
