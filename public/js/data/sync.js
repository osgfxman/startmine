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
    id: p.id || '',
    groupId: p.groupId || '',
    name: p.name || 'Untitled Page',
    pageType: p.pageType || 'miro',
    zoom: p.zoom !== undefined ? p.zoom : 100,
    panX: p.panX !== undefined ? p.panX : 0,
    panY: p.panY !== undefined ? p.panY : 0,
    bg: p.bg || '',
    bgType: p.bgType || 'none',
    tabColor: p.tabColor || ''
  }));

  const updates = {};
  updates[metaRef] = meta;
  updates[pagesMetaRef] = pagesMeta;

  D.pages.forEach(p => {
    if (!p) return;
    let widgets, miroCards, vGuides, hGuides, _guidesMode, lockedGuides, cellStates, mergedCells, customCells, ts, cellGuides, _layoutGuidesMode;
    let gridRows, gridCols, cellPages, slicerColSizes, slicerRowSizes;
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
      mergedCells = p.mergedCells || [];
      customCells = p.customCells || [];
      cellGuides = p.cellGuides || {};
      _layoutGuidesMode = p._layoutGuidesMode || false;
      gridRows = p.gridRows || null;
      gridCols = p.gridCols || null;
      cellPages = p.cellPages || null;
      slicerColSizes = p.slicerColSizes || null;
      slicerRowSizes = p.slicerRowSizes || null;
      ts = p.ts;
    } else {
      // Non-active page: always prefer cache (memory is evicted)
      const cached = getCachedPageData(p.id);
      const hasCachedData = cached && (
        (cached.widgets && cached.widgets.length > 0) ||
        (cached.miroCards && cached.miroCards.length > 0) ||
        (cached.vGuides && cached.vGuides.length > 0) ||
        (cached.hGuides && cached.hGuides.length > 0) ||
        cached._guidesMode ||
        (cached.customCells && cached.customCells.length > 0) ||
        cached._layoutGuidesMode ||
        cached.cellGuides
      );
      if (hasCachedData) {
        widgets = cached.widgets || [];
        miroCards = cached.miroCards || [];
        vGuides = cached.vGuides || [];
        hGuides = cached.hGuides || [];
        _guidesMode = cached._guidesMode || false;
        lockedGuides = cached.lockedGuides || [];
        cellStates = cached.cellStates || {};
        mergedCells = cached.mergedCells || [];
        customCells = cached.customCells || [];
        cellGuides = cached.cellGuides || {};
        _layoutGuidesMode = cached._layoutGuidesMode || false;
        gridRows = cached.gridRows || null;
        gridCols = cached.gridCols || null;
        cellPages = cached.cellPages || null;
        slicerColSizes = cached.slicerColSizes || null;
        slicerRowSizes = cached.slicerRowSizes || null;
        ts = cached.ts || p.ts || Date.now();
      } else if ((p.widgets && p.widgets.length > 0) || (p.miroCards && p.miroCards.length > 0) || (p.vGuides && p.vGuides.length > 0) || (p.hGuides && p.hGuides.length > 0) || p._guidesMode || (p.customCells && p.customCells.length > 0) || p._layoutGuidesMode || p.cellGuides) {
        widgets = p.widgets || [];
        miroCards = p.miroCards || [];
        vGuides = p.vGuides || [];
        hGuides = p.hGuides || [];
        _guidesMode = p._guidesMode || false;
        lockedGuides = p.lockedGuides || [];
        cellStates = p.cellStates || {};
        mergedCells = p.mergedCells || [];
        customCells = p.customCells || [];
        cellGuides = p.cellGuides || {};
        _layoutGuidesMode = p._layoutGuidesMode || false;
        gridRows = p.gridRows || null;
        gridCols = p.gridCols || null;
        cellPages = p.cellPages || null;
        slicerColSizes = p.slicerColSizes || null;
        slicerRowSizes = p.slicerRowSizes || null;
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
      mergedCells,
      customCells,
      cellGuides,
      _layoutGuidesMode,
      gridRows,
      gridCols,
      cellPages,
      slicerColSizes,
      slicerRowSizes,
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
    try {
      const metaRef = `users/${USER_ID}/startmine_meta`;
      const pagesMetaRef = `users/${USER_ID}/startmine_pages_meta`;

      // ─── Instant load from localStorage cache ───
      if (isFirstLoad) {
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
          
          if (window.sanitizeData) {
            window.sanitizeData(D);
             if (D.__modified) {
               delete D.__modified;
               if (Date.now() - _lastSanitizeSvTs > SANITIZE_SV_COOLDOWN) {
                 _lastSanitizeSvTs = Date.now();
                 setTimeout(() => { window.sv(true, true); }, 100);
               }
             }
          }
          const dg = D.settings.defaultGroup || '__last__';
          const dp = D.settings.defaultPage || '__last__';
          if (dg !== '__last__' && D.groups.some((g) => g.id === dg)) D.curGroup = dg;
          if (dp !== '__last__' && D.pages.some((p) => p.id === dp)) D.cur = dp;
          else {
            try {
              const lastPid = localStorage.getItem(LS_CUR_PAGE);
              if (lastPid && D.pages.some(p => p.id === lastPid)) D.cur = lastPid;
            } catch(e) {}
          }
          if (!D.cur && D.pages.length > 0) D.cur = D.pages[0].id;
          // Ensure curGroup and curEnv match the restored page
          const rp2 = D.pages.find(p => p.id === D.cur);
          if (rp2 && rp2.groupId) {
            D.curGroup = rp2.groupId;
            const rg2 = D.groups.find(g => g.id === rp2.groupId);
            if (rg2 && rg2.envId) D.curEnv = rg2.envId;
          }
          // Load cached page data for instant render
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
            pg.mergedCells = cachedPage.mergedCells || [];
            pg.customCells = cachedPage.customCells || [];
            pg.cellGuides = cachedPage.cellGuides || {};
            pg._layoutGuidesMode = cachedPage._layoutGuidesMode || false;
            _lastSyncedPageData = {
              widgets: JSON.stringify(pg.widgets),
              miroCards: JSON.stringify(pg.miroCards)
            };
          }
          renderMeta();
          buildCols();
          setSyncStatus('ok', 'Loaded from cache — syncing…');
        }
      }

      // Listen to Metadata (settings, environments, groups, inbox, active selections)
      db.ref(metaRef).on('value', (snap) => {
        if (isOwnWrite()) return;
        const meta = snap.val() || {
          settings: { engine: 'bm', accent: '#6c8fff' },
          curEnv: 'e0',
          curGroup: 'g0',
          environments: [{ id: 'e0', name: 'Main Env' }],
          groups: [{ id: 'g0', name: 'Main Group', envId: 'e0' }],
          inbox: []
        };
        D.settings = meta.settings || { engine: 'bm', accent: '#6c8fff' };
        D.curEnv = meta.curEnv || 'e0';
        D.curGroup = meta.curGroup || 'g0';
        D.environments = meta.environments || [{ id: 'e0', name: 'Main Env' }];
        D.groups = meta.groups || [{ id: 'g0', name: 'Main Group', envId: 'e0' }];
        D.inbox = meta.inbox || [];
        
        if (window.sanitizeData) {
          window.sanitizeData(D);
        }
        
        const sanitizedMeta = {
          settings: D.settings,
          curEnv: D.curEnv,
          curGroup: D.curGroup,
          environments: D.environments,
          groups: D.groups,
          inbox: D.inbox
        };
        cacheMeta(sanitizedMeta); // Cache to localStorage
        
        if (D.__modified) {
          delete D.__modified;
          if (Date.now() - _lastSanitizeSvTs > SANITIZE_SV_COOLDOWN) {
            _lastSanitizeSvTs = Date.now();
            setTimeout(() => { window.sv(true, true); }, 100);
          }
        }
        
        renderMeta();
      }, (err) => {
        console.error('[SYNC] metaRef error:', err);
        if (typeof setSyncStatus === 'function') {
          setSyncStatus('err', 'Sync Error: ' + err.message);
        }
      });

      // Listen to Pages Directory (names, ids, group associations)
      db.ref(pagesMetaRef).on('value', (snap) => {
        if (isOwnWrite()) return;
        const pagesMetaRaw = snap.val() || [{ id: 'p0', groupId: 'g0', name: 'Home', pageType: 'miro', zoom: 100, panX: 0, panY: 0, bg: '', bgType: 'none' }];
        const pagesMeta = pagesMetaRaw.filter(p => p);

        // FIX: Preserve heavy data (widgets/miroCards) and guides/slices for ALL loaded pages, not just active
        const heavyDataMap = {};
        D.pages.forEach(p => {
          if (p) {
            const hasData = (p.widgets && p.widgets.length > 0) || (p.miroCards && p.miroCards.length > 0);
            const hasGuides = (p.vGuides && p.vGuides.length > 0) || (p.hGuides && p.hGuides.length > 0) || p._guidesMode || (p.customCells && p.customCells.length > 0) || p._layoutGuidesMode || p.cellGuides;
            if (hasData || hasGuides) {
              heavyDataMap[p.id] = {
                widgets: p.widgets || [],
                miroCards: p.miroCards || [],
                vGuides: p.vGuides || [],
                hGuides: p.hGuides || [],
                _guidesMode: p._guidesMode || false,
                lockedGuides: p.lockedGuides || [],
                cellStates: p.cellStates || {},
                mergedCells: p.mergedCells || [],
                customCells: p.customCells || [],
                cellGuides: p.cellGuides || {},
                _layoutGuidesMode: p._layoutGuidesMode || false
              };
            }
          }
        });

        D.pages = pagesMeta;

        // Re-inject heavy data into ALL pages that had it loaded
        D.pages.forEach(p => {
          if (p && heavyDataMap[p.id]) {
            p.widgets = heavyDataMap[p.id].widgets;
            p.miroCards = heavyDataMap[p.id].miroCards;
            p.vGuides = heavyDataMap[p.id].vGuides;
            p.hGuides = heavyDataMap[p.id].hGuides;
            p._guidesMode = heavyDataMap[p.id]._guidesMode;
            p.lockedGuides = heavyDataMap[p.id].lockedGuides;
            p.cellStates = heavyDataMap[p.id].cellStates;
            p.mergedCells = heavyDataMap[p.id].mergedCells;
            p.customCells = heavyDataMap[p.id].customCells;
            p.cellGuides = heavyDataMap[p.id].cellGuides;
            p._layoutGuidesMode = heavyDataMap[p.id]._layoutGuidesMode;
          }
        });

        if (window.sanitizeData) {
          window.sanitizeData(D);
        }

        const sanitizedMeta = D.pages.filter(p => p).map(p => ({
          id: p.id, groupId: p.groupId, name: p.name, pageType: p.pageType,
          zoom: p.zoom, panX: p.panX, panY: p.panY, bg: p.bg, bgType: p.bgType,
          tabColor: p.tabColor || ''
        }));
        cachePagesMeta(sanitizedMeta); // Cache to localStorage

        // Establish baseline for smart pagesMeta diffing in sv()
        _lastSyncedPagesMetaStr = JSON.stringify(sanitizedMeta);

        if (D.__modified) {
          delete D.__modified;
          if (Date.now() - _lastSanitizeSvTs > SANITIZE_SV_COOLDOWN) {
            _lastSanitizeSvTs = Date.now();
            setTimeout(() => { window.sv(true, true); }, 100);
          }
        }

        if (isFirstLoad) {
          const dg = D.settings.defaultGroup || '__last__';
          const dp = D.settings.defaultPage || '__last__';
          if (dg !== '__last__' && D.groups.some((g) => g.id === dg)) D.curGroup = dg;
          if (dp !== '__last__' && D.pages.some((p) => p.id === dp)) D.cur = dp;
          else {
            try {
              const lastPid = localStorage.getItem(LS_CUR_PAGE);
              if (lastPid && D.pages.some(p => p.id === lastPid)) D.cur = lastPid;
            } catch(e) {}
          }
          if (!D.cur && D.pages.length > 0) D.cur = D.pages[0].id;
          // Ensure curGroup and curEnv match the restored page
          const rp3 = D.pages.find(p => p.id === D.cur);
          if (rp3 && rp3.groupId) {
            D.curGroup = rp3.groupId;
            const rg3 = D.groups.find(g => g.id === rp3.groupId);
            if (rg3 && rg3.envId) D.curEnv = rg3.envId;
          }
          isFirstLoad = false;
          switchActivePage(D.cur); // This will render All
        } else {
          renderMeta();
        }

        setSyncStatus('ok', 'Realtime Sync Active \u2713');
      }, (err) => {
        console.error('[SYNC] pagesMetaRef error:', err);
        if (typeof setSyncStatus === 'function') {
          setSyncStatus('err', 'Sync Error: ' + err.message);
        }
      });

      db.ref('.info/connected').on('value', (snap) => {
        if (snap.val()) {
          console.log('[SYNC] Connected successfully');
          if (!isFirstLoad) setSyncStatus('ok', 'Realtime Sync Active \u2713');
        } else {
          console.warn('[SYNC] Disconnected / Offline');
          setSyncStatus('loading', '🔄 Disconnected \u2014 reconnecting...');
        }
      });
    } catch(error) {
      console.error('[SYNC] Connection failed:', error);
    }
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
        cellStates: activePg.cellStates || {},
        mergedCells: activePg.mergedCells || [],
        customCells: activePg.customCells || [],
        cellGuides: activePg.cellGuides || {},
        _layoutGuidesMode: activePg._layoutGuidesMode || false
      });

      // Cache all subpages of the slicer page
      if (activePg.pageType === 'slicer' && activePg.cellPages) {
        Object.values(activePg.cellPages).forEach(subPid => {
          const subPg = D.pages.find(p => p && p.id === subPid);
          if (subPg) {
            cachePageData(subPid, {
              widgets: subPg.widgets || [],
              miroCards: subPg.miroCards || [],
              vGuides: subPg.vGuides || [],
              hGuides: subPg.hGuides || [],
              _guidesMode: subPg._guidesMode || false,
              lockedGuides: subPg.lockedGuides || [],
              cellStates: subPg.cellStates || {},
              mergedCells: subPg.mergedCells || [],
              customCells: subPg.customCells || [],
              cellGuides: subPg.cellGuides || {},
              _layoutGuidesMode: subPg._layoutGuidesMode || false,
              ts: subPg.ts || Date.now()
            });
          }
        });
      }
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

    const metaRef = `users/${USER_ID}/startmine_meta`;
    const pagesMetaRef = `users/${USER_ID}/startmine_pages_meta`;

    // Extract metadata without payloads
    const meta = {
      settings: D.settings,
      curEnv: D.curEnv,
      curGroup: D.curGroup,
      environments: D.environments,
      groups: D.groups,
      inbox: D.inbox
    };

    const pagesMeta = D.pages.filter(p => p).map(p => ({
      id: p.id || '',
      groupId: p.groupId || '',
      name: p.name || 'Untitled Page',
      pageType: p.pageType || 'miro',
      zoom: p.zoom !== undefined ? p.zoom : 100,
      panX: p.panX !== undefined ? p.panX : 0,
      panY: p.panY !== undefined ? p.panY : 0,
      bg: p.bg || '',
      bgType: p.bgType || 'none',
      tabColor: p.tabColor || ''
    }));

    const updates = {};

    // Smart meta sync: only write if changed
    const curMetaStr = JSON.stringify(meta);
    if (curMetaStr !== _lastSyncedMetaStr) {
      updates[metaRef] = meta;
      _lastSyncedMetaStr = curMetaStr;
    }

    // Smart pagesMeta sync: only upload what changed
    const curPagesMetaStr = JSON.stringify(pagesMeta);
    if (curPagesMetaStr !== _lastSyncedPagesMetaStr) {
      // Check if only zoom/pan changed on the active page (most common case)
      let onlyZoomPanChanged = false;
      if (_lastSyncedPagesMetaStr) {
        try {
          const oldPM = JSON.parse(_lastSyncedPagesMetaStr);
          if (oldPM.length === pagesMeta.length) {
            let diffIdx = -1;
            let multiDiff = false;
            for (let i = 0; i < pagesMeta.length; i++) {
              const o = oldPM[i], n = pagesMeta[i];
              if (o.id === n.id && o.groupId === n.groupId && o.name === n.name &&
                o.pageType === n.pageType && o.bg === n.bg && o.bgType === n.bgType &&
                (o.tabColor || '') === (n.tabColor || '')) {
                if (o.zoom !== n.zoom || o.panX !== n.panX || o.panY !== n.panY) {
                  if (diffIdx >= 0) { multiDiff = true; break; }
                  diffIdx = i;
                }
              } else {
                diffIdx = -2; break; // structural change
              }
            }
            if (diffIdx >= 0 && !multiDiff) {
              // Only one page's zoom/pan changed — write just that page's meta entry
              onlyZoomPanChanged = true;
              updates[`${pagesMetaRef}/${diffIdx}/zoom`] = pagesMeta[diffIdx].zoom;
              updates[`${pagesMetaRef}/${diffIdx}/panX`] = pagesMeta[diffIdx].panX;
              updates[`${pagesMetaRef}/${diffIdx}/panY`] = pagesMeta[diffIdx].panY;
            }
          }
        } catch (e) { /* fallback to full write */ }
      }
      if (!onlyZoomPanChanged) {
        updates[pagesMetaRef] = pagesMeta;
      }
      _lastSyncedPagesMetaStr = curPagesMetaStr;
    }

    if (saveAll) {
      let _savedCount = 0, _skippedCount = 0;
      D.pages.forEach(p => {
        if (!p) return;
        let widgets, miroCards, vGuides, hGuides, _guidesMode, lockedGuides, cellStates, mergedCells, customCells, ts, cellGuides, _layoutGuidesMode;
        let gridRows, gridCols, cellPages, slicerColSizes, slicerRowSizes;
        if (p.id === D.cur) {
          p.ts = Date.now(); // Update live page timestamp
          // Active page — use live data
          widgets = p.widgets || [];
          miroCards = p.miroCards || [];
          vGuides = p.vGuides || [];
          hGuides = p.hGuides || [];
          _guidesMode = p._guidesMode || false;
          lockedGuides = p.lockedGuides || [];
          cellStates = p.cellStates || {};
          mergedCells = p.mergedCells || [];
          customCells = p.customCells || [];
          cellGuides = p.cellGuides || {};
          _layoutGuidesMode = p._layoutGuidesMode || false;
          gridRows = p.gridRows || null;
          gridCols = p.gridCols || null;
          cellPages = p.cellPages || null;
          slicerColSizes = p.slicerColSizes || null;
          slicerRowSizes = p.slicerRowSizes || null;
          ts = p.ts;
        } else {
          // NON-ACTIVE page — try cache, then memory
          const cached = getCachedPageData(p.id);
          const hasCachedData = cached && (
            (cached.widgets && cached.widgets.length > 0) ||
            (cached.miroCards && cached.miroCards.length > 0) ||
            (cached.vGuides && cached.vGuides.length > 0) ||
            (cached.hGuides && cached.hGuides.length > 0) ||
            cached._guidesMode ||
            (cached.customCells && cached.customCells.length > 0) ||
            cached._layoutGuidesMode ||
            cached.cellGuides
          );
          if (hasCachedData) {
            widgets = cached.widgets || [];
            miroCards = cached.miroCards || [];
            vGuides = cached.vGuides || [];
            hGuides = cached.hGuides || [];
            _guidesMode = cached._guidesMode || false;
            lockedGuides = cached.lockedGuides || [];
            cellStates = cached.cellStates || {};
            mergedCells = cached.mergedCells || [];
            customCells = cached.customCells || [];
            cellGuides = cached.cellGuides || {};
            _layoutGuidesMode = cached._layoutGuidesMode || false;
            gridRows = cached.gridRows || null;
            gridCols = cached.gridCols || null;
            cellPages = cached.cellPages || null;
            slicerColSizes = cached.slicerColSizes || null;
            slicerRowSizes = cached.slicerRowSizes || null;
            ts = cached.ts || p.ts || Date.now();
          } else if ((p.widgets && p.widgets.length > 0) || (p.miroCards && p.miroCards.length > 0) || (p.vGuides && p.vGuides.length > 0) || (p.hGuides && p.hGuides.length > 0) || p._guidesMode || (p.customCells && p.customCells.length > 0) || p._layoutGuidesMode || p.cellGuides) {
            widgets = p.widgets || [];
            miroCards = p.miroCards || [];
            vGuides = p.vGuides || [];
            hGuides = p.hGuides || [];
            _guidesMode = p._guidesMode || false;
            lockedGuides = p.lockedGuides || [];
            cellStates = p.cellStates || {};
            mergedCells = p.mergedCells || [];
            customCells = p.customCells || [];
            cellGuides = p.cellGuides || {};
            _layoutGuidesMode = p._layoutGuidesMode || false;
            gridRows = p.gridRows || null;
            gridCols = p.gridCols || null;
            cellPages = p.cellPages || null;
            slicerColSizes = p.slicerColSizes || null;
            slicerRowSizes = p.slicerRowSizes || null;
            ts = p.ts || Date.now();
          } else {
            // ⛔ ABSOLUTE GUARD: NEVER write empty data to Firebase
            // This page has no data anywhere — skip it entirely
            console.warn(`[SV GUARD ⛔] Skipping page "${p.name}" (${p.id}) — EMPTY. Firebase data preserved.`);
            _skippedCount++;
            return;
          }
        }
        // ⛔ DOUBLE CHECK: Even after loading from cache, if still empty → skip
        if (widgets.length === 0 && miroCards.length === 0 && vGuides.length === 0 && hGuides.length === 0 && !_guidesMode && customCells.length === 0 && Object.keys(cellGuides || {}).length === 0 && !_layoutGuidesMode) {
          console.warn(`[SV GUARD ⛔] Page "${p.name}" resolved to 0 items — refusing to write.`);
          _skippedCount++;
          return;
        }
        updates[`users/${USER_ID}/startmine_pages/${p.id}`] = {
          widgets,
          miroCards,
          vGuides,
          hGuides,
          _guidesMode,
          lockedGuides,
          cellStates,
          mergedCells,
          customCells,
          cellGuides,
          _layoutGuidesMode,
          gridRows,
          gridCols,
          cellPages,
          slicerColSizes,
          slicerRowSizes,
          ts
        };
        _savedCount++;
      });
      if (_skippedCount > 0) {
        console.warn(`[SV SUMMARY] Saved: ${_savedCount} pages, Skipped (protected): ${_skippedCount} pages`);
      }
    } else {
      // Only upload the heavy data for the active page (and subpages if active is slicer)
      const activePg = cp();
      if (activePg) {
        const pagesToSave = [activePg];
        if (activePg.pageType === 'slicer' && activePg.cellPages) {
          Object.values(activePg.cellPages).forEach(subPid => {
            const subPg = D.pages.find(p => p && p.id === subPid);
            if (subPg && !pagesToSave.some(p => p.id === subPid)) {
              pagesToSave.push(subPg);
            }
          });
        }

        pagesToSave.forEach(p => {
          if (p.id === activePg.id) {
            // ─── DATA LOSS GUARD: Don't overwrite non-empty Firebase data with empty data ───
            const curHasData = (activePg.widgets && activePg.widgets.length > 0) || (activePg.miroCards && activePg.miroCards.length > 0);
            if (!curHasData && _lastSyncedPageData) {
              const oldHadWidgets = JSON.parse(_lastSyncedPageData.widgets || '[]').length > 0;
              const oldHadCards = JSON.parse(_lastSyncedPageData.miroCards || '[]').length > 0;
              if (oldHadWidgets || oldHadCards) {
                console.error(`[SV GUARD] 🚨 Refusing to overwrite page "${activePg.name}" — was non-empty, now empty!`);
                if (typeof showToast === 'function') showToast('⚠️ Data loss prevented — page was not saved (empty data detected)', 5000);
                return;
              }
            }
            // ─── VERSION REGRESSION GUARD ───
            if (isVersionRegression(activePg.id, activePg.widgets, activePg.miroCards)) {
              console.error(`[SV GUARD] 🚨 Version regression on "${activePg.name}" — save blocked!`);
              if (typeof showToast === 'function') showToast('⚠️ Suspicious data drop detected — save blocked', 5000);
              return;
            }
            trackPageVersion(activePg.id, activePg.widgets, activePg.miroCards);
            activePg.ts = Date.now(); // Update timestamp on every save
            if (_lastSyncedPageData) {
              updates[`users/${USER_ID}/startmine_pages/${activePg.id}/ts`] = activePg.ts;

              const curWidgetsStr = JSON.stringify(activePg.widgets || []);
              const curCardsStr = JSON.stringify(activePg.miroCards || []);

              // Always write guides/slices properties when _lastSyncedPageData is active
              updates[`users/${USER_ID}/startmine_pages/${activePg.id}/vGuides`] = activePg.vGuides || [];
              updates[`users/${USER_ID}/startmine_pages/${activePg.id}/hGuides`] = activePg.hGuides || [];
              updates[`users/${USER_ID}/startmine_pages/${activePg.id}/_guidesMode`] = activePg._guidesMode || false;
              updates[`users/${USER_ID}/startmine_pages/${activePg.id}/lockedGuides`] = activePg.lockedGuides || [];
              updates[`users/${USER_ID}/startmine_pages/${activePg.id}/cellStates`] = activePg.cellStates || {};
              updates[`users/${USER_ID}/startmine_pages/${activePg.id}/mergedCells`] = activePg.mergedCells || [];
              updates[`users/${USER_ID}/startmine_pages/${activePg.id}/customCells`] = activePg.customCells || [];
              updates[`users/${USER_ID}/startmine_pages/${activePg.id}/cellGuides`] = activePg.cellGuides || {};
              updates[`users/${USER_ID}/startmine_pages/${activePg.id}/_layoutGuidesMode`] = activePg._layoutGuidesMode || false;
              updates[`users/${USER_ID}/startmine_pages/${activePg.id}/gridRows`] = activePg.gridRows || null;
              updates[`users/${USER_ID}/startmine_pages/${activePg.id}/gridCols`] = activePg.gridCols || null;
              updates[`users/${USER_ID}/startmine_pages/${activePg.id}/cellPages`] = activePg.cellPages || null;
              updates[`users/${USER_ID}/startmine_pages/${activePg.id}/slicerColSizes`] = activePg.slicerColSizes || null;
              updates[`users/${USER_ID}/startmine_pages/${activePg.id}/slicerRowSizes`] = activePg.slicerRowSizes || null;

              const oldWidgets = JSON.parse(_lastSyncedPageData.widgets || '[]');
              const oldCards = JSON.parse(_lastSyncedPageData.miroCards || '[]');
              const curWidgets = activePg.widgets || [];
              const curCards = activePg.miroCards || [];

              let widgetsChanged = false;
              if (oldWidgets.length !== curWidgets.length) widgetsChanged = true;
              else {
                for (let i = 0; i < curWidgets.length; i++) {
                  if (!curWidgets[i] || !oldWidgets[i] || curWidgets[i].id !== oldWidgets[i].id) { widgetsChanged = true; break; }
                }
              }

              if (widgetsChanged) {
                updates[`users/${USER_ID}/startmine_pages/${activePg.id}/widgets`] = curWidgets;
              } else {
                for (let i = 0; i < curWidgets.length; i++) {
                  if (!curWidgets[i] || !oldWidgets[i] || JSON.stringify(curWidgets[i]) !== JSON.stringify(oldWidgets[i])) {
                    updates[`users/${USER_ID}/startmine_pages/${activePg.id}/widgets/${i}`] = curWidgets[i];
                  }
                }
              }

              let cardsChanged = false;
              if (oldCards.length !== curCards.length) cardsChanged = true;
              else {
                for (let i = 0; i < curCards.length; i++) {
                  if (!curCards[i] || !oldCards[i] || curCards[i].id !== oldCards[i].id) { cardsChanged = true; break; }
                }
              }

              if (cardsChanged) {
                updates[`users/${USER_ID}/startmine_pages/${activePg.id}/miroCards`] = curCards;
              } else {
                for (let i = 0; i < curCards.length; i++) {
                  if (!curCards[i] || !oldCards[i] || JSON.stringify(curCards[i]) !== JSON.stringify(oldCards[i])) {
                    updates[`users/${USER_ID}/startmine_pages/${activePg.id}/miroCards/${i}`] = curCards[i];
                  }
                }
              }

              // Update baseline payload
              _lastSyncedPageData.widgets = curWidgetsStr;
              _lastSyncedPageData.miroCards = curCardsStr;
            } else {
              updates[`users/${USER_ID}/startmine_pages/${activePg.id}`] = {
                widgets: activePg.widgets || [],
                miroCards: activePg.miroCards || [],
                vGuides: activePg.vGuides || [],
                hGuides: activePg.hGuides || [],
                _guidesMode: activePg._guidesMode || false,
                lockedGuides: activePg.lockedGuides || [],
                cellStates: activePg.cellStates || {},
                mergedCells: activePg.mergedCells || [],
                customCells: activePg.customCells || [],
                cellGuides: activePg.cellGuides || {},
                _layoutGuidesMode: activePg._layoutGuidesMode || false,
                gridRows: activePg.gridRows || null,
                gridCols: activePg.gridCols || null,
                cellPages: activePg.cellPages || null,
                slicerColSizes: activePg.slicerColSizes || null,
                slicerRowSizes: activePg.slicerRowSizes || null,
                ts: activePg.ts
              };
            }
          } else {
            // For subpages, write their whole payload directly
            const subHasData = (p.widgets && p.widgets.length > 0) || (p.miroCards && p.miroCards.length > 0);
            if (!subHasData) {
              const cached = getCachedPageData(p.id);
              if (cached && ((cached.widgets && cached.widgets.length > 0) || (cached.miroCards && cached.miroCards.length > 0))) {
                console.warn(`[SV GUARD ⛔] Subpage "${p.name}" (${p.id}) resolved to empty in memory but had cached data — save skipped to prevent data loss.`);
                return;
              }
            }
            if (isVersionRegression(p.id, p.widgets, p.miroCards)) {
              console.error(`[SV GUARD] 🚨 Version regression on subpage "${p.name}" — save blocked!`);
              return;
            }
            trackPageVersion(p.id, p.widgets, p.miroCards);
            p.ts = Date.now();

            updates[`users/${USER_ID}/startmine_pages/${p.id}`] = {
              widgets: p.widgets || [],
              miroCards: p.miroCards || [],
              vGuides: p.vGuides || [],
              hGuides: p.hGuides || [],
              _guidesMode: p._guidesMode || false,
              lockedGuides: p.lockedGuides || [],
              cellStates: p.cellStates || {},
              mergedCells: p.mergedCells || [],
              customCells: p.customCells || [],
              cellGuides: p.cellGuides || {},
              _layoutGuidesMode: p._layoutGuidesMode || false,
              gridRows: p.gridRows || null,
              gridCols: p.gridCols || null,
              cellPages: p.cellPages || null,
              slicerColSizes: p.slicerColSizes || null,
              slicerRowSizes: p.slicerRowSizes || null,
              ts: p.ts
            };
          }
        });
      }
    }

    // Skip empty updates (nothing changed)
    if (Object.keys(updates).length === 0) {
      setOwnWrite(false);
      return;
    }

    db.ref().update(updates)
      .then(() => {
        setOwnWrite(false);
        _lastSvTs = Date.now();
        // Cache active page (and subpages if slicer) to localStorage after successful save
        const activePg = cp();
        if (activePg) {
          const pagesToSave = [activePg];
          if (activePg.pageType === 'slicer' && activePg.cellPages) {
            Object.values(activePg.cellPages).forEach(subPid => {
              const subPg = D.pages.find(p => p && p.id === subPid);
              if (subPg && !pagesToSave.some(p => p.id === subPid)) {
                pagesToSave.push(subPg);
              }
            });
          }

          pagesToSave.forEach(p => {
            cachePageData(p.id, {
              widgets: p.widgets || [],
              miroCards: p.miroCards || [],
              vGuides: p.vGuides || [],
              hGuides: p.hGuides || [],
              _guidesMode: p._guidesMode || false,
              lockedGuides: p.lockedGuides || [],
              cellStates: p.cellStates || {},
              mergedCells: p.mergedCells || [],
              customCells: p.customCells || [],
              ts: p.ts
            });
          });
        }
        // Clean up any pending deleted page nodes from Firebase
        if (_pendingDeletePageIds.length > 0) {
          const delUpdates = {};
          _pendingDeletePageIds.forEach(pid => {
            delUpdates[`users/${USER_ID}/startmine_pages/${pid}`] = null;
            // Also remove from localStorage cache
            try { localStorage.removeItem(lsPageKey(pid)); } catch(e) {}
          });
          _pendingDeletePageIds = [];
          db.ref().update(delUpdates).catch(e => console.warn('[DELETE CLEANUP]', e));
        }
      })
      .catch((err) => {
        setOwnWrite(false);
        setSyncStatus('err', 'Sync error: ' + (err.code || err.message));
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
        mergedCells: activePg.mergedCells || [],
        customCells: activePg.customCells || [],
        cellGuides: activePg.cellGuides || {},
        _layoutGuidesMode: activePg._layoutGuidesMode || false,
        gridRows: activePg.gridRows || null,
        gridCols: activePg.gridCols || null,
        cellPages: activePg.cellPages || null,
        slicerColSizes: activePg.slicerColSizes || null,
        slicerRowSizes: activePg.slicerRowSizes || null,
        ts: activePg.ts || Date.now()
      });

      // Cache all subpages of the slicer page
      if (activePg.pageType === 'slicer' && activePg.cellPages) {
        Object.values(activePg.cellPages).forEach(subPid => {
          const subPg = D.pages.find(p => p && p.id === subPid);
          if (subPg) {
            cachePageData(subPg.id, {
              widgets: subPg.widgets || [],
              miroCards: subPg.miroCards || [],
              vGuides: subPg.vGuides || [],
              hGuides: subPg.hGuides || [],
              _guidesMode: subPg._guidesMode || false,
              lockedGuides: subPg.lockedGuides || [],
              cellStates: subPg.cellStates || {},
              mergedCells: subPg.mergedCells || [],
              customCells: subPg.customCells || [],
              cellGuides: subPg.cellGuides || {},
              _layoutGuidesMode: subPg._layoutGuidesMode || false,
              ts: subPg.ts || Date.now()
            });
          }
        });
      }
    }
    const meta = {
      settings: D.settings, curEnv: D.curEnv, curGroup: D.curGroup,
      environments: D.environments, groups: D.groups, inbox: D.inbox
    };
    cacheMeta(meta);
    cachePagesMeta(D.pages.filter(p => p).map(p => ({
      id: p.id || '',
      groupId: p.groupId || '',
      name: p.name || 'Untitled Page',
      pageType: p.pageType || 'miro',
      zoom: p.zoom !== undefined ? p.zoom : 100,
      panX: p.panX !== undefined ? p.panX : 0,
      panY: p.panY !== undefined ? p.panY : 0,
      bg: p.bg || '',
      bgType: p.bgType || 'none',
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
