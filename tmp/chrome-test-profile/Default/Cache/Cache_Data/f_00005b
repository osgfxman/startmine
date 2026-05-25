/**
 * @module Sync
 * @description Handles data synchronization between local cache and Firebase
 * @namespace SM.data
 * @depends namespace.js, firebase.js, offline.js
 * @provides window.syncNow, window.sv, window.setupShardedListeners, window.forceLocalSave, window.detachAllListeners
 * @safety Never write empty page data to Firebase. Always verify cache before push.
 */
// js/data/sync.js
(function() {
  const LS_CUR_PAGE = 'sm_cur_page';
  let _ownWrite = false;
  let _ownWriteTs = 0;
  const OWN_WRITE_TIMEOUT = 5000;
  let _lastSanitizeSvTs = 0;
  const SANITIZE_SV_COOLDOWN = 5000; // 5s cooldown between sanitize-triggered saves

  // Extracted syncNow
  window.syncNow = function () {
  if (!USER_ID) return Promise.resolve();
  showToast('🔄 Syncing to cloud...');
  setOwnWrite(true);

  const metaRef = `users/${USER_ID}/startmine_meta`;
  const pagesMetaRef = `users/${USER_ID}/startmine_pages_meta`;

  const meta = {
    settings: D.settings,
    curEnv: D.curEnv,
    curGroup: D.curGroup,
    environments: D.environments,
    groups: D.groups,
    inbox: D.inbox
  };

  const pagesMeta = D.pages.filter(p => p).map(p => ({
    id: p.id, groupId: p.groupId, name: p.name,
    pageType: p.pageType, zoom: p.zoom, panX: p.panX, panY: p.panY,
    bg: p.bg, bgType: p.bgType, tabColor: p.tabColor || ''
  }));

  const updates = {};
  updates[metaRef] = meta;
  updates[pagesMetaRef] = pagesMeta;

  // Push all page data (active page from memory, others from cache)
  D.pages.forEach(p => {
    if (!p) return;
    let widgets, miroCards, vGuides, hGuides, _guidesMode, lockedGuides, cellStates, ts;
    if (p.id === D.cur) {
      p.ts = Date.now();
      // Active page: use live in-memory data
      widgets = p.widgets || [];
      miroCards = p.miroCards || [];
      vGuides = p.vGuides || [];
      hGuides = p.hGuides || [];
      _guidesMode = p._guidesMode || false;
      lockedGuides = p.lockedGuides || [];
      cellStates = p.cellStates || {};
      ts = p.ts;
    } else {
      // Non-active page: always prefer cache (memory is evicted)
      const cached = getCachedPageData(p.id);
      const hasCachedData = cached && (
        (cached.widgets && cached.widgets.length > 0) ||
        (cached.miroCards && cached.miroCards.length > 0) ||
        (cached.vGuides && cached.vGuides.length > 0) ||
        (cached.hGuides && cached.hGuides.length > 0) ||
        cached._guidesMode
      );
      if (hasCachedData) {
        widgets = cached.widgets || [];
        miroCards = cached.miroCards || [];
        vGuides = cached.vGuides || [];
        hGuides = cached.hGuides || [];
        _guidesMode = cached._guidesMode || false;
        lockedGuides = cached.lockedGuides || [];
        cellStates = cached.cellStates || {};
        ts = cached.ts || p.ts || Date.now();
      } else if ((p.widgets && p.widgets.length > 0) || (p.miroCards && p.miroCards.length > 0) || (p.vGuides && p.vGuides.length > 0) || (p.hGuides && p.hGuides.length > 0) || p._guidesMode) {
        widgets = p.widgets || [];
        miroCards = p.miroCards || [];
        vGuides = p.vGuides || [];
        hGuides = p.hGuides || [];
        _guidesMode = p._guidesMode || false;
        lockedGuides = p.lockedGuides || [];
        cellStates = p.cellStates || {};
        ts = p.ts || Date.now();
      } else {
        // SAFETY: skip to avoid overwriting Firebase with empty data
        console.warn(`[SYNC GUARD] Skipping page "${p.name}" (${p.id}) — no data available`);
        return;
      }
    }
    updates[`users/${USER_ID}/startmine_pages/${p.id}`] = {
      widgets,
      miroCards,
      vGuides,
      hGuides,
      _guidesMode,
      lockedGuides,
      cellStates,
      ts
    };
  });

  return db.ref().update(updates)
    .then(() => {
      setOwnWrite(false);
      _dirtyOffline = false;
      _lastSyncedMetaStr = JSON.stringify(meta);
      _lastSyncedPagesMetaStr = JSON.stringify(pagesMeta);
      const activePg = cp();
      if (activePg) {
        _lastSyncedPageData = {
          widgets: JSON.stringify(activePg.widgets || []),
          miroCards: JSON.stringify(activePg.miroCards || [])
        };
      }
      updateOfflineUI();
      showToast('✅ Synced successfully!');
    })
    .catch(err => {
      setOwnWrite(false);
      throw err;
    });
};
  window.SM.data.syncNow = window.syncNow;
  window.SM.core.expose('syncNow', window.syncNow);

  // Extracted setupShardedListeners
window.setupShardedListeners = function () {
    console.log('[SYNC] setupShardedListeners called');
    if (!USER_ID || !db) return;
    if (_offlineMode) return;

    // Detach old listeners
    if (typeof detachAllListeners === 'function') detachAllListeners();

    const metaRef = `users/${USER_ID}/startmine_meta`;
    const pagesMetaRef = `users/${USER_ID}/startmine_pages_meta`;

    // ─── 0. INSTANT PAINT from cache (before Firebase responds) ───
    const cachedMeta = getCachedMeta();
    const cachedPagesMeta = getCachedPagesMeta();
    if (cachedMeta && cachedPagesMeta) {
        D.settings = cachedMeta.settings || D.settings;
        D.curEnv = cachedMeta.curEnv || D.curEnv;
        D.curGroup = cachedMeta.curGroup || D.curGroup;
        D.environments = cachedMeta.environments || D.environments;
        D.groups = cachedMeta.groups || D.groups;
        D.inbox = cachedMeta.inbox || D.inbox;
        D.pages = cachedPagesMeta;

        // Restore last page
        const dg = D.settings.defaultGroup || '**last**';
        const dp = D.settings.defaultPage || '**last**';
        if (dg !== '**last**' && D.groups.some(g => g.id === dg)) D.curGroup = dg;
        if (dp !== '**last**' && D.pages.some(p => p.id === dp)) D.cur = dp;
        else {
            try {
                const lastPid = localStorage.getItem('sm_cur_page');
                if (lastPid && D.pages.some(p => p.id === lastPid)) D.cur = lastPid;
            } catch(e) {}
        }
        if (!D.cur && D.pages.length > 0) D.cur = D.pages[0].id;

        // Ensure curGroup/curEnv match the restored page
        const restoredPage = D.pages.find(p => p.id === D.cur);
        if (restoredPage && restoredPage.groupId) {
            D.curGroup = restoredPage.groupId;
            const grp = D.groups.find(g => g.id === restoredPage.groupId);
            if (grp && grp.envId) D.curEnv = grp.envId;
        }

        sanitizeData(D);

        // Load active page data from cache
        const cachedPage = getCachedPageData(D.cur);
        const pg = cp();
        if (pg && cachedPage) {
            pg.widgets = cachedPage.widgets || [];
            pg.miroCards = cachedPage.miroCards || [];
            pg.vGuides = cachedPage.vGuides || [];
            pg.hGuides = cachedPage.hGuides || [];
            pg._guidesMode = cachedPage._guidesMode || false;
            pg.lockedGuides = cachedPage.lockedGuides || [];
            pg.cellStates = cachedPage.cellStates || {};
            pg.ts = cachedPage.ts || 0;
        }

        // Render immediately from cache
        isFirstLoad = false;
        renderMeta();
        buildCols();
        console.log('[SYNC] Instant paint from cache — page:', D.cur, 'pages:', D.pages.length);
    }

    // ─── 1. Connection status ───
    db.ref('.info/connected').on('value', snap => {
        if (typeof setSyncStatus === 'function') {
            setSyncStatus(snap.val() ? 'ok' : 'err',
                snap.val() ? 'Realtime Sync Active ✓' : 'Offline / disconnected');
        }
    });

    // ─── 2. Meta listener ───
    db.ref(metaRef).on('value', snap => {
        if (isOwnWrite()) return;
        const meta = snap.val();
        if (!meta) {
            // First time user — push current state to Firebase
            console.log('[SYNC] No meta in Firebase — pushing current state');
            sv(true, true);
            return;
        }
        D.settings = meta.settings || D.settings;
        D.curEnv = meta.curEnv || D.curEnv;
        D.curGroup = meta.curGroup || D.curGroup;
        D.environments = meta.environments || D.environments;
        D.groups = meta.groups || D.groups;
        D.inbox = meta.inbox || D.inbox;
        cacheMeta(meta);
        if (typeof renderMeta === 'function') renderMeta();
    });

    // ─── 3. Pages meta listener ───
    db.ref(pagesMetaRef).on('value', snap => {
        if (isOwnWrite()) return;
        const pagesMeta = snap.val();
        if (!pagesMeta || !Array.isArray(pagesMeta)) {
            if (!snap.val()) {
                console.log('[SYNC] No pagesMeta in Firebase — pushing current state');
                sv(true, true);
            }
            return;
        }

        // Merge: keep existing page content (memory + cache), update meta fields only
        const existingById = {};
        D.pages.forEach(p => { if (p) existingById[p.id] = p; });

        D.pages = pagesMeta.map(pm => {
            const existing = existingById[pm.id] || {};
            const cached = getCachedPageData(pm.id);
            const hasCached = cached && (
                (cached.widgets || []).length > 0 ||
                (cached.miroCards || []).length > 0 ||
                (cached.vGuides || []).length > 0 ||
                (cached.hGuides || []).length > 0 ||
                cached._guidesMode
            );
            const hasExisting = (
                (existing.widgets || []).length > 0 ||
                (existing.miroCards || []).length > 0
            );
            return {
                ...pm,
                widgets: hasExisting ? existing.widgets : (hasCached ? cached.widgets || [] : []),
                miroCards: hasExisting ? existing.miroCards : (hasCached ? cached.miroCards || [] : []),
                vGuides: hasExisting ? (existing.vGuides || []) : (hasCached ? cached.vGuides || [] : []),
                hGuides: hasExisting ? (existing.hGuides || []) : (hasCached ? cached.hGuides || [] : []),
                _guidesMode: hasExisting ? existing._guidesMode : (hasCached ? cached._guidesMode || false : false),
                lockedGuides: hasExisting ? (existing.lockedGuides || []) : (hasCached ? cached.lockedGuides || [] : []),
                cellStates: hasExisting ? (existing.cellStates || {}) : (hasCached ? cached.cellStates || {} : {})
            };
        });

        // Restore D.cur from localStorage
        try {
            const lastPid = localStorage.getItem('sm_cur_page');
            if (lastPid && D.pages.some(p => p.id === lastPid)) {
                D.cur = lastPid;
            }
        } catch(e) {}

        if (!D.cur || !D.pages.some(p => p.id === D.cur)) {
            D.cur = D.pages[0] ? D.pages[0].id : 'p0';
        }

        cachePagesMeta(pagesMeta);
        sanitizeData(D);

        if (typeof renderMeta === 'function') renderMeta();
        if (typeof buildCols === 'function') buildCols();
    });

    // ─── 4. Active page data listener ───
    const pageDataRef = `users/${USER_ID}/startmine_pages/${D.cur}`;
    window._activePageListener = pageDataRef;
    db.ref(pageDataRef).on('value', snap => {
        if (isOwnWrite()) return;
        const pData = snap.val();
        if (!pData) return;
        const pg = cp();
        if (!pg) return;
        // Regression guard
        const newCount = (pData.widgets || []).length + (pData.miroCards || []).length;
        const oldCount = (pg.widgets || []).length + (pg.miroCards || []).length;
        if (newCount === 0 && oldCount > 0) {
            console.warn('[LISTENER GUARD] Refusing empty overwrite from Firebase');
            return;
        }
        pg.widgets = pData.widgets || [];
        pg.miroCards = pData.miroCards || [];
        pg.vGuides = pData.vGuides || [];
        pg.hGuides = pData.hGuides || [];
        pg._guidesMode = pData._guidesMode || false;
        pg.lockedGuides = pData.lockedGuides || [];
        pg.cellStates = pData.cellStates || {};
        pg.ts = pData.ts || Date.now();
        cachePageData(pg.id, pData);
        if (typeof buildCols === 'function') buildCols();
    });

    console.log('[SYNC] All listeners attached for user:', USER_ID);
};
  window.SM.data.setupShardedListeners = window.setupShardedListeners;
  window.SM.core.expose('setupShardedListeners', window.setupShardedListeners);

  // Extracted sv
  window.sv = function (saveAll = false, immediate = false) {
  if (!USER_ID) return;
  // Capture undo snapshot before saving (for Miro pages)
  if (typeof pushUndo === 'function') { try { pushUndo(); } catch(e) {} }

  // ─── Offline Mode: save to localStorage only ───
  if (_offlineMode) {
    const activePg = cp();
    if (activePg) {
      cachePageData(activePg.id, {
        widgets: activePg.widgets || [],
        miroCards: activePg.miroCards || [],
        vGuides: activePg.vGuides || [],
        hGuides: activePg.hGuides || [],
        _guidesMode: activePg._guidesMode || false,
        lockedGuides: activePg.lockedGuides || [],
        cellStates: activePg.cellStates || {}
      });
    }
    const meta = {
      settings: D.settings, curEnv: D.curEnv, curGroup: D.curGroup,
      environments: D.environments, groups: D.groups, inbox: D.inbox
    };
    cacheMeta(meta);
    cachePagesMeta(D.pages.filter(p => p).map(p => ({
      id: p.id, groupId: p.groupId, name: p.name, pageType: p.pageType,
      zoom: p.zoom, panX: p.panX, panY: p.panY, bg: p.bg, bgType: p.bgType,
      tabColor: p.tabColor || ''
    })));
    markDirtyOffline();
    return;
  }

  const doSave = () => {
    setOwnWrite(true);
    // 1. Cache locally first (instant, synchronous)
    forceLocalSave();
    // 2. Build Firebase updates for active page + meta
    const metaRef = `users/${USER_ID}/startmine_meta`;
    const pagesMetaRef = `users/${USER_ID}/startmine_pages_meta`;
    const meta = {
        settings: D.settings, curEnv: D.curEnv, curGroup: D.curGroup,
        environments: D.environments, groups: D.groups, inbox: D.inbox
    };
    const pagesMeta = D.pages.filter(p => p).map(p => ({
        id: p.id, groupId: p.groupId, name: p.name,
        pageType: p.pageType, zoom: p.zoom, panX: p.panX, panY: p.panY,
        bg: p.bg, bgType: p.bgType, tabColor: p.tabColor || ''
    }));
    const updates = {};
    updates[metaRef] = meta;
    updates[pagesMetaRef] = pagesMeta;
    // Active page data
    const activePg = cp();
    if (activePg) {
        const hasData = (activePg.widgets || []).length > 0 ||
            (activePg.miroCards || []).length > 0 ||
            (activePg.vGuides || []).length > 0 ||
            (activePg.hGuides || []).length > 0 ||
            activePg._guidesMode;
        if (hasData) {
            activePg.ts = Date.now();
            updates[`users/${USER_ID}/startmine_pages/${activePg.id}`] = {
                widgets: activePg.widgets || [],
                miroCards: activePg.miroCards || [],
                vGuides: activePg.vGuides || [],
                hGuides: activePg.hGuides || [],
                _guidesMode: activePg._guidesMode || false,
                lockedGuides: activePg.lockedGuides || [],
                cellStates: activePg.cellStates || {},
                ts: activePg.ts
            };
        }
    }
    // If saveAll, include all pages (from cache for non-active)
    if (saveAll) {
        D.pages.forEach(p => {
            if (!p || p.id === (activePg && activePg.id)) return;
            const cached = getCachedPageData(p.id);
            const src = cached || p;
            const srcHasData = (src.widgets || []).length > 0 ||
                (src.miroCards || []).length > 0 ||
                (src.vGuides || []).length > 0 ||
                (src.hGuides || []).length > 0 ||
                src._guidesMode;
            if (srcHasData) {
                updates[`users/${USER_ID}/startmine_pages/${p.id}`] = {
                    widgets: src.widgets || [],
                    miroCards: src.miroCards || [],
                    vGuides: src.vGuides || [],
                    hGuides: src.hGuides || [],
                    _guidesMode: src._guidesMode || false,
                    lockedGuides: src.lockedGuides || [],
                    cellStates: src.cellStates || {},
                    ts: src.ts || Date.now()
                };
            }
        });
    }
    // Handle pending page deletions
    if (window._pendingDeletePageIds && _pendingDeletePageIds.length > 0) {
        _pendingDeletePageIds.forEach(pid => {
            updates[`users/${USER_ID}/startmine_pages/${pid}`] = null;
        });
        _pendingDeletePageIds.length = 0;
    }
    db.ref().update(updates).then(() => {
        setOwnWrite(false);
        _dirtyOffline = false;
        window._lastSvTs = Date.now();
        if (typeof updateOfflineUI === 'function') updateOfflineUI();
        if (typeof setSyncStatus === 'function') setSyncStatus('ok', 'Realtime Sync Active ✓');
    }).catch(err => {
        setOwnWrite(false);
        console.error('[SV SAVE ERROR]', err);
        if (typeof setSyncStatus === 'function') setSyncStatus('err', 'Sync error: ' + (err.message || err));
    });
  };

  clearTimeout(_svTimer);
  if (immediate) doSave();
  else _svTimer = setTimeout(doSave, 800);
};
  window.SM.data.sv = window.sv;
  window.SM.core.expose('sv', window.sv);

  // Extracted forceLocalSave
  window.forceLocalSave = function () {
  try {
    localStorage.setItem(LS_CUR_PAGE, D.cur);
    const activePg = cp();
    if (activePg) {
      cachePageData(activePg.id, {
        widgets: activePg.widgets || [],
        miroCards: activePg.miroCards || [],
        vGuides: activePg.vGuides || [],
        hGuides: activePg.hGuides || [],
        _guidesMode: activePg._guidesMode || false,
        lockedGuides: activePg.lockedGuides || [],
        cellStates: activePg.cellStates || {},
        ts: activePg.ts || Date.now()
      });
    }
    const meta = {
      settings: D.settings, curEnv: D.curEnv, curGroup: D.curGroup,
      environments: D.environments, groups: D.groups, inbox: D.inbox
    };
    cacheMeta(meta);
    cachePagesMeta(D.pages.filter(p => p).map(p => ({
      id: p.id, groupId: p.groupId, name: p.name, pageType: p.pageType,
      zoom: p.zoom, panX: p.panX, panY: p.panY, bg: p.bg, bgType: p.bgType,
      tabColor: p.tabColor || ''
    })));
  } catch(e) { console.warn('[FORCE SAVE]', e); }
};
  window.SM.data.forceLocalSave = window.forceLocalSave;
  window.SM.core.expose('forceLocalSave', window.forceLocalSave);

  // Extracted setOwnWrite
  window.setOwnWrite = function (val) {
  _ownWrite = val;
  if (val) _ownWriteTs = Date.now();
};
  window.SM.data.setOwnWrite = window.setOwnWrite;
  window.SM.core.expose('setOwnWrite', window.setOwnWrite);

  // Extracted isOwnWrite
  window.isOwnWrite = function () {
  if (!_ownWrite) return false;
  // Safety timeout: if _ownWrite has been true for too long, auto-reset
  if (Date.now() - _ownWriteTs > OWN_WRITE_TIMEOUT) {
    console.warn('[DATA GUARD] _ownWrite was stuck for >5s — auto-resetting');
    _ownWrite = false;
    return false;
  }
  return true;
};
  window.SM.data.isOwnWrite = window.isOwnWrite;
  window.SM.core.expose('isOwnWrite', window.isOwnWrite);


SM.data.syncNow = typeof syncNow !== 'undefined' ? syncNow : window.syncNow;
SM.data.sv = typeof sv !== 'undefined' ? sv : window.sv;
SM.data.setupShardedListeners = typeof setupShardedListeners !== 'undefined' ? setupShardedListeners : window.setupShardedListeners;
SM.data.forceLocalSave = typeof forceLocalSave !== 'undefined' ? forceLocalSave : window.forceLocalSave;
SM.data.detachAllListeners = typeof detachAllListeners !== 'undefined' ? detachAllListeners : window.detachAllListeners;

window.syncNow = SM.data.syncNow;
window.sv = SM.data.sv;
window.setupShardedListeners = SM.data.setupShardedListeners;
window.forceLocalSave = SM.data.forceLocalSave;
window.detachAllListeners = SM.data.detachAllListeners;
})();
