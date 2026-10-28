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
  let _activeWriteCount = 0;
  let _ownWriteTs = 0;
  let _ownWriteCooldownUntil = 0;
  const OWN_WRITE_TIMEOUT = 8000;
  const OWN_WRITE_COOLDOWN_MS = 1500;
  let _lastSanitizeSvTs = 0;
  const SANITIZE_SV_COOLDOWN = 5000; // 5s cooldown between sanitize-triggered saves
  window._pendingCloudPageIds = window._pendingCloudPageIds || new Set();
  window._hasPendingLocalSave = false;
  window._lastLocalEditTs = 0;
  window._lastLocalMetaTs = 0;

  // Extracted syncNow
  window.syncNow = async function () {
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

  const serverPagesMeta = [];
  if (typeof _lastSyncedPagesMetaStr === 'string' && _lastSyncedPagesMetaStr) {
    try {
      const parsed = JSON.parse(_lastSyncedPagesMetaStr);
      if (Array.isArray(parsed)) {
        parsed.forEach(sm => { if (sm && sm.id) serverPagesMeta.push(sm); });
      }
    } catch(e) {}
  }

  // Pre-fetch cached data for all non-active pages asynchronously from IndexedDB/Memory
  const cachedPagesMap = new Map();
  if (Array.isArray(D.pages)) {
    for (const p of D.pages) {
      if (!p || p.id === D.cur) continue;
      try {
        const cached = typeof getCachedPageDataAsync === 'function' ? await getCachedPageDataAsync(p.id) : getCachedPageData(p.id);
        if (cached) cachedPagesMap.set(p.id, cached);
      } catch (err) {
        console.warn(`[SYNC PREFETCH] Failed to fetch cache for page ${p.id}:`, err);
      }
    }
  }

  const pagesMeta = D.pages.filter(p => p).map(p => {
    let serverTs = 0;
    const sMatch = serverPagesMeta.find(sm => sm.id === p.id);
    if (sMatch && sMatch.ts) serverTs = sMatch.ts;

    let localTs = 0;
    if (p.id === D.cur) {
      localTs = p.ts || Date.now();
    } else {
      const cached = cachedPagesMap.get(p.id) || getCachedPageData(p.id);
      localTs = (cached && cached.ts) || p.ts || 0;
    }

    if (serverTs > localTs && sMatch) {
      return sMatch;
    }

    return {
      id: p.id || '',
      groupId: p.groupId || '',
      name: p.name || 'Untitled Page',
      pageType: p.pageType || 'miro',
      zoom: p.zoom !== undefined ? p.zoom : 100,
      panX: p.panX !== undefined ? p.panX : 0,
      panY: p.panY !== undefined ? p.panY : 0,
      bg: p.bg || '',
      bgType: p.bgType || 'none',
      tabColor: p.tabColor || '',
      ts: localTs || p.ts || Date.now()
    };
  });

  const updates = {};
  updates[metaRef] = meta;
  updates[pagesMetaRef] = pagesMeta;

  D.pages.forEach(p => {
    if (!p) return;

    let serverTs = 0;
    const sMatch = serverPagesMeta.find(sm => sm.id === p.id);
    if (sMatch && sMatch.ts) serverTs = sMatch.ts;

    let localTs = 0;
    if (p.id === D.cur) {
      localTs = p.ts || Date.now();
    } else {
      const cached = cachedPagesMap.get(p.id) || getCachedPageData(p.id);
      localTs = (cached && cached.ts) || p.ts || 0;
    }

    if (serverTs > localTs) {
      console.warn(`[SYNC OVERWRITE GUARD ⛔] Skipping upload for page "${p.name}" (${p.id}) — server has newer data.`);
      return;
    }

    let widgets, miroCards, vGuides, hGuides, _guidesMode, lockedGuides, cellStates, mergedCells, customCells, ts, cellGuides, _layoutGuidesMode;
    let gridRows, gridCols, cellPages, slicerColSizes, slicerRowSizes;
    if (p.id === D.cur) {
      p.ts = localTs;
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
      if (p._bypassVersionGuard) {
        widgets = [];
        miroCards = [];
        vGuides = [];
        hGuides = [];
        _guidesMode = false;
        lockedGuides = [];
        cellStates = {};
        mergedCells = [];
        customCells = [];
        cellGuides = {};
        _layoutGuidesMode = false;
        gridRows = null;
        gridCols = null;
        cellPages = null;
        slicerColSizes = null;
        slicerRowSizes = null;
        ts = p.ts || Date.now();
      } else {
        const cached = cachedPagesMap.get(p.id) || getCachedPageData(p.id);
        const hasCachedItems = cached && (
          (Array.isArray(cached.widgets) && cached.widgets.length > 0) ||
          (Array.isArray(cached.miroCards) && cached.miroCards.length > 0)
        );
        const hasMemItems = (
          (Array.isArray(p.widgets) && p.widgets.length > 0) ||
          (Array.isArray(p.miroCards) && p.miroCards.length > 0)
        );
        if (hasCachedItems) {
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
        } else if (hasMemItems) {
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
          // SAFETY: skip unloaded non-active page to prevent overwriting cloud shard with empty arrays
          console.warn(`[SYNC GUARD] Skipping non-active unloaded page "${p.name}" (${p.id}) — cloud shard preserved.`);
          return;
        }
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
      D.pages.forEach(pg => {
        if (pg && pg._bypassVersionGuard) {
          delete pg._bypassVersionGuard;
        }
      });
      updateOfflineUI();
      showToast('✅ Synced successfully!');
      if (window.SM && window.SM.events) {
        window.SM.events.emit('sync:complete', { success: true, ts: Date.now() });
      }
    })
    .catch(err => {
      setOwnWrite(false);
      throw err;
    });
};
  window.SM.data.syncNow = window.syncNow;
  window.SM.core.expose('syncNow', window.syncNow);

  // Cloud Self-Healing & Full Workspace Hydration Engine
  window.healWorkspaceFromCloud = async function () {
    if (!USER_ID || _offlineMode) return;
    if (window._cloudHealInFlight) return;
    if (window._cloudHealRanForUid === USER_ID) return;
    window._cloudHealInFlight = true;

    const _ensureArr = (v) => Array.isArray(v) ? v : (v && typeof v === 'object' ? Object.values(v) : []);
    const _hasContent = (obj) => {
      if (!obj) return false;
      return (
        _ensureArr(obj.widgets).length > 0 ||
        _ensureArr(obj.miroCards).length > 0 ||
        _ensureArr(obj.customCells).length > 0 ||
        (obj.cellPages && typeof obj.cellPages === 'object' && Object.keys(obj.cellPages).length > 0) ||
        Boolean(obj.gridRows)
      );
    };

    try {
      const [pagesSnap, snapsSnap] = await Promise.all([
        db.ref(`users/${USER_ID}/startmine_pages`).once('value').catch(() => null),
        db.ref(`users/${USER_ID}/startmine_snapshots`).limitToLast(5).once('value').catch(() => null)
      ]);

      const allShards = (pagesSnap && pagesSnap.val()) || {};
      let bestSnap = null;
      let bestScore = -1;

      if (snapsSnap && snapsSnap.exists()) {
        snapsSnap.forEach(child => {
          const val = child.val();
          if (!val) return;
          const pCount = (val.pagesMeta && val.pagesMeta.length) || (val.pages && Object.keys(val.pages).length) || 0;
          let iCount = val.itemCount || 0;
          if (!iCount && val.pages) {
            Object.values(val.pages).forEach(pg => {
              if (pg) iCount += _ensureArr(pg.widgets).length + _ensureArr(pg.miroCards).length;
            });
          }
          const score = (pCount * 100) + iCount;
          if (score > bestScore) {
            bestScore = score;
            bestSnap = val;
          }
        });
      }
      if (bestSnap) {
        window._bestCloudSnapshot = bestSnap;
      }

      // Collect intentionally deleted page IDs so we never resurrect deleted pages
      const deletedPageIds = new Set(_pendingDeletePageIds || []);
      if (Array.isArray(D.recycleBin)) {
        D.recycleBin.forEach(item => {
          if (!item) return;
          if (item.type === 'page' && item.data && item.data.id) deletedPageIds.add(item.data.id);
          if (item.pageId && item.type === 'page') deletedPageIds.add(item.pageId);
        });
      }

      let metaHealed = false;
      let pagesMetaHealed = false;
      const cloudHealUpdates = {};

      // 1. Heal missing environments & groups from bestSnap.meta
      if (bestSnap && bestSnap.meta) {
        if (Array.isArray(bestSnap.meta.environments)) {
          const envIds = new Set((D.environments || []).map(e => e && e.id));
          bestSnap.meta.environments.forEach(env => {
            if (env && env.id && !envIds.has(env.id)) {
              D.environments.push(env);
              envIds.add(env.id);
              metaHealed = true;
            }
          });
        }
        if (Array.isArray(bestSnap.meta.groups)) {
          const grpIds = new Set((D.groups || []).map(g => g && g.id));
          bestSnap.meta.groups.forEach(grp => {
            if (grp && grp.id && !grpIds.has(grp.id)) {
              D.groups.push(grp);
              grpIds.add(grp.id);
              metaHealed = true;
            }
          });
        }
      }

      // 1b. Auto-purge any bogus 'Recovered Page' entries created from historical orphan shards
      const beforePurgeLen = D.pages.length;
      D.pages = (D.pages || []).filter(p => p && p.name !== 'Recovered Page');
      if (D.pages.length !== beforePurgeLen) {
        console.log(`[CLOUD SELF-HEAL 🧹] Purged ${beforePurgeLen - D.pages.length} bogus 'Recovered Page' tabs.`);
        pagesMetaHealed = true;
      }

      // 2. Only restore pages from bestSnap.pagesMeta if D.pages was catastrophically wiped down to default pages (<= 8)
      const existingPageIds = new Set((D.pages || []).map(p => p && p.id));
      if (D.pages.length <= 8 && bestSnap && Array.isArray(bestSnap.pagesMeta) && bestSnap.pagesMeta.length > 15) {
        bestSnap.pagesMeta.forEach(pm => {
          if (pm && pm.id && pm.name !== 'Recovered Page' && !existingPageIds.has(pm.id) && !deletedPageIds.has(pm.id)) {
            const hasShardOrSnap = _hasContent(allShards[pm.id]) || (bestSnap.pages && _hasContent(bestSnap.pages[pm.id]));
            if (hasShardOrSnap || pm.pageType === 'slicer') {
              D.pages.push({ ...pm, widgets: [], miroCards: [] });
              existingPageIds.add(pm.id);
              pagesMetaHealed = true;
            }
          }
        });
      }

      // 3. Hydrate all pages in D.pages and heal any emptied shard from bestSnap
      let activeOrSubHydrated = false;
      const activePgNow = typeof cp === 'function' ? cp() : null;
      const activeSubIds = new Set(
        activePgNow && activePgNow.cellPages ? Object.values(activePgNow.cellPages) : []
      );

      for (const p of D.pages) {
        if (!p || !p.id) continue;
        const shard = allShards[p.id];
        const snapPg = bestSnap && bestSnap.pages ? bestSnap.pages[p.id] : null;
        const shardHas = _hasContent(shard);
        const snapHas = _hasContent(snapPg);

        // Fix pageType if shard/snap is clearly a slicer page
        if ((shard && (shard.cellPages || shard.gridRows)) || (snapPg && (snapPg.cellPages || snapPg.gridRows))) {
          if (p.pageType !== 'slicer') {
            p.pageType = 'slicer';
            pagesMetaHealed = true;
          }
        }

        let source = null;
        if (shardHas) {
          source = shard;
        } else if (snapHas && !p._bypassVersionGuard) {
          source = snapPg;
          console.warn(`[CLOUD SELF-HEAL 🛡️] Restoring emptied page "${p.name}" (${p.id}) from Golden Snapshot!`);
          cloudHealUpdates[`users/${USER_ID}/startmine_pages/${p.id}`] = {
            widgets: _ensureArr(snapPg.widgets),
            miroCards: _ensureArr(snapPg.miroCards),
            vGuides: snapPg.vGuides || [],
            hGuides: snapPg.hGuides || [],
            _guidesMode: snapPg._guidesMode || false,
            lockedGuides: snapPg.lockedGuides || [],
            cellStates: snapPg.cellStates || {},
            mergedCells: snapPg.mergedCells || [],
            customCells: snapPg.customCells || [],
            cellGuides: snapPg.cellGuides || {},
            _layoutGuidesMode: snapPg._layoutGuidesMode || false,
            gridRows: snapPg.gridRows || null,
            gridCols: snapPg.gridCols || null,
            cellPages: snapPg.cellPages || null,
            slicerColSizes: snapPg.slicerColSizes || null,
            slicerRowSizes: snapPg.slicerRowSizes || null,
            cols: snapPg.cols !== undefined ? snapPg.cols : (p.cols !== undefined ? p.cols : 3),
            ts: Date.now()
          };
        }

        if (source && (! _hasContent(p) || !p._hasBeenLoaded) && !p._localDirtyTs) {
          p.widgets = _ensureArr(source.widgets);
          p.miroCards = _ensureArr(source.miroCards);
          p.vGuides = source.vGuides || [];
          p.hGuides = source.hGuides || [];
          p._guidesMode = source._guidesMode || false;
          p.lockedGuides = source.lockedGuides || [];
          p.cellStates = source.cellStates || {};
          p.mergedCells = source.mergedCells || [];
          p.customCells = source.customCells || [];
          p.cellGuides = source.cellGuides || {};
          p._layoutGuidesMode = source._layoutGuidesMode || false;
          p.gridRows = source.gridRows !== undefined ? source.gridRows : null;
          p.gridCols = source.gridCols !== undefined ? source.gridCols : null;
          p.cellPages = source.cellPages !== undefined ? source.cellPages : null;
          p.slicerColSizes = source.slicerColSizes !== undefined ? source.slicerColSizes : null;
          p.slicerRowSizes = source.slicerRowSizes !== undefined ? source.slicerRowSizes : null;
          if (source.cols !== undefined) p.cols = source.cols;
          p.ts = source.ts || p.ts || Date.now();
          p._hasBeenLoaded = true;

          cachePageData(p.id, {
            widgets: p.widgets,
            miroCards: p.miroCards,
            vGuides: p.vGuides,
            hGuides: p.hGuides,
            _guidesMode: p._guidesMode,
            lockedGuides: p.lockedGuides,
            cellStates: p.cellStates,
            mergedCells: p.mergedCells,
            customCells: p.customCells,
            cellGuides: p.cellGuides,
            _layoutGuidesMode: p._layoutGuidesMode,
            gridRows: p.gridRows,
            gridCols: p.gridCols,
            cellPages: p.cellPages,
            slicerColSizes: p.slicerColSizes,
            slicerRowSizes: p.slicerRowSizes,
            cols: p.cols !== undefined ? p.cols : 3,
            pageType: p.pageType || 'miro',
            ts: p.ts
          });

          if (p.id === D.cur || activeSubIds.has(p.id)) {
            activeOrSubHydrated = true;
          }
        }
      }

      if (metaHealed) {
        cloudHealUpdates[`users/${USER_ID}/startmine_meta`] = {
          settings: D.settings,
          curEnv: D.curEnv,
          curGroup: D.curGroup,
          environments: D.environments,
          groups: D.groups,
          inbox: D.inbox || [],
          ts: Date.now()
        };
      }
      if (pagesMetaHealed) {
        const healedPagesMeta = D.pages.filter(p => p).map(p => ({
          id: p.id || '', groupId: p.groupId || '', name: p.name || 'Untitled Page', pageType: p.pageType || 'miro',
          zoom: p.zoom !== undefined ? p.zoom : 100, panX: p.panX !== undefined ? p.panX : 0, panY: p.panY !== undefined ? p.panY : 0,
          bg: p.bg || '', bgType: p.bgType || 'none', tabColor: p.tabColor || '',
          cols: p.cols !== undefined ? p.cols : 3, ts: p.ts || Date.now()
        }));
        cloudHealUpdates[`users/${USER_ID}/startmine_pages_meta`] = healedPagesMeta;
        cachePagesMeta(healedPagesMeta);
        _lastSyncedPagesMetaStr = JSON.stringify(healedPagesMeta);
      }

      if (Object.keys(cloudHealUpdates).length > 0) {
        setOwnWrite(true);
        await db.ref().update(JSON.parse(JSON.stringify(cloudHealUpdates))).catch(e => console.warn('[CLOUD HEAL WRITE]', e));
        setOwnWrite(false);
      }

      window._cloudHealRanForUid = USER_ID;

      if (metaHealed || pagesMetaHealed || activeOrSubHydrated) {
        renderMeta();
        const curPg = typeof cp === 'function' ? cp() : null;
        if (curPg && curPg.pageType === 'slicer' && typeof setupSlicerSubPageListeners === 'function') {
          setupSlicerSubPageListeners(curPg);
        }
        buildCols();
      }
    } catch (err) {
      console.warn('[CLOUD SELF-HEAL ERROR]', err);
    } finally {
      window._cloudHealInFlight = false;
    }
  };
  window.SM.data.healWorkspaceFromCloud = window.healWorkspaceFromCloud;
  window.SM.core.expose('healWorkspaceFromCloud', window.healWorkspaceFromCloud);

  // Extracted setupShardedListeners
  window.setupShardedListeners = function () {
    console.log('[SYNC] setupShardedListeners called');
    try {
      const metaRef = `users/${USER_ID}/startmine_meta`;
      const pagesMetaRef = `users/${USER_ID}/startmine_pages_meta`;
      window._cloudMetaLoaded = false;
      window._cloudPagesMetaLoaded = false;

      // Clean up any existing listeners on metaRef / pagesMetaRef before re-attaching
      db.ref(metaRef).off();
      db.ref(pagesMetaRef).off();

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
          D.pages = cachedPagesMeta.filter(p => p && p.name !== 'Recovered Page');
          
          if (window.sanitizeData) {
            window.sanitizeData(D);
            if (D.__modified) {
              delete D.__modified;
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
            const ensureArray = (arr) => Array.isArray(arr) ? arr : (arr && typeof arr === 'object' ? Object.values(arr) : []);
            pg.widgets = ensureArray(cachedPage.widgets);
            pg.miroCards = ensureArray(cachedPage.miroCards);
            pg.vGuides = cachedPage.vGuides || [];
            pg.hGuides = cachedPage.hGuides || [];
            pg._guidesMode = cachedPage._guidesMode || false;
            pg.lockedGuides = cachedPage.lockedGuides || [];
            pg.cellStates = cachedPage.cellStates || {};
            pg.mergedCells = cachedPage.mergedCells || [];
            pg.customCells = cachedPage.customCells || [];
            pg.cellGuides = cachedPage.cellGuides || {};
            pg._layoutGuidesMode = cachedPage._layoutGuidesMode || false;
            pg.gridRows = cachedPage.gridRows || null;
            pg.gridCols = cachedPage.gridCols || null;
            pg.cellPages = cachedPage.cellPages || null;
            pg.slicerColSizes = cachedPage.slicerColSizes || null;
            pg.slicerRowSizes = cachedPage.slicerRowSizes || null;
            if (cachedPage.cols !== undefined) pg.cols = cachedPage.cols;
            pg.ts = cachedPage.ts || 0;
            if (pg.widgets.length > 0 || pg.miroCards.length > 0 || (pg.cellPages && Object.keys(pg.cellPages).length > 0)) {
              pg._hasBeenLoaded = true;
            }
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
        if (window._cloudMetaLoaded && isOwnWrite()) return;
        window._cloudMetaLoaded = true;
        const meta = snap.val() || {
          settings: { engine: 'bm', accent: '#6c8fff' },
          curEnv: 'e0',
          curGroup: 'g0',
          environments: [{ id: 'e0', name: 'Main Env' }],
          groups: [{ id: 'g0', name: 'Main Group', envId: 'e0' }],
          inbox: []
        };
        const incomingMetaTs = meta.ts || 0;
        if (window._lastLocalMetaTs && incomingMetaTs > 0 && window._lastLocalMetaTs > incomingMetaTs) {
          console.warn(`[SYNC META GUARD ⛔] Local metadata (${window._lastLocalMetaTs}) is newer than incoming (${incomingMetaTs}) — ignoring stale cloud meta.`);
          return;
        }
        // Protect against sudden loss of environments or groups from partial/stale cloud writes
        if (Array.isArray(D.environments) && D.environments.length > 1 && Array.isArray(meta.environments) && meta.environments.length < D.environments.length && (!incomingMetaTs || incomingMetaTs < (window._lastLocalEditTs || 0))) {
          console.warn('[SYNC META GUARD ⛔] Refusing to shrink environments from stale meta listener.');
          return;
        }
        D.settings = meta.settings || { engine: 'bm', accent: '#6c8fff' };
        // Do not forcibly hijack the user's current active tab/env/group after initial load if user is actively navigating locally
        if (isFirstLoad || !D.curEnv) D.curEnv = meta.curEnv || 'e0';
        if (isFirstLoad || !D.curGroup) D.curGroup = meta.curGroup || 'g0';
        D.environments = meta.environments || [{ id: 'e0', name: 'Main Env' }];
        D.groups = meta.groups || [{ id: 'g0', name: 'Main Group', envId: 'e0' }];
        D.inbox = meta.inbox || [];
        
        if (meta.stats && typeof window.syncHighestCountsFromCloud === 'function') {
          window.syncHighestCountsFromCloud(meta.stats);
        }

        if (window.sanitizeData) {
          window.sanitizeData(D);
        }
        
        const sanitizedMeta = {
          settings: D.settings,
          curEnv: D.curEnv,
          curGroup: D.curGroup,
          environments: D.environments,
          groups: D.groups,
          inbox: D.inbox,
          ts: incomingMetaTs || Date.now()
        };
        cacheMeta(sanitizedMeta); // Cache to localStorage
        
        if (D.__modified) {
          delete D.__modified;
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
        if (window._cloudPagesMetaLoaded && isOwnWrite()) return;
        window._cloudPagesMetaLoaded = true;
        const rawVal = snap.val();
        const pagesMetaRaw = Array.isArray(rawVal)
          ? rawVal
          : (rawVal && typeof rawVal === 'object' ? Object.values(rawVal) : [{ id: 'p0', groupId: 'g0', name: 'Home', pageType: 'miro', zoom: 100, panX: 0, panY: 0, bg: '', bgType: 'none' }]);
        const hadBogusRecovered = pagesMetaRaw.some(p => p && p.name === 'Recovered Page');
        const pagesMeta = pagesMetaRaw.filter(p => p && p.name !== 'Recovered Page');

        // FIX: Preserve heavy data (widgets/miroCards), guides/slices, and newer local metadata for ALL loaded pages
        const heavyDataMap = {};
        const localPagesById = {};
        D.pages.forEach(p => {
          if (p && p.id) {
            localPagesById[p.id] = p;
            const hasData = (p.widgets && p.widgets.length > 0) || (p.miroCards && p.miroCards.length > 0);
            const hasGuides = (p.vGuides && p.vGuides.length > 0) || (p.hGuides && p.hGuides.length > 0) || p._guidesMode || (p.customCells && p.customCells.length > 0) || p._layoutGuidesMode || (p.cellGuides && Object.keys(p.cellGuides).length > 0);
            const hasSlicer = (p.cellPages && Object.keys(p.cellPages).length > 0) || Boolean(p.gridRows);
            if (hasData || hasGuides || hasSlicer || p._localDirtyTs) {
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
                _layoutGuidesMode: p._layoutGuidesMode || false,
                gridRows: p.gridRows || null,
                gridCols: p.gridCols || null,
                cellPages: p.cellPages || null,
                slicerColSizes: p.slicerColSizes || null,
                slicerRowSizes: p.slicerRowSizes || null,
                cols: p.cols !== undefined ? p.cols : 3,
                ts: p.ts || 0,
                _localDirtyTs: p._localDirtyTs || 0,
                _hasBeenLoaded: p._hasBeenLoaded || false
              };
            }
          }
        });

        // Also preserve any locally created page that hasn't been synced to cloud yet
        const incomingIds = new Set(pagesMeta.map(p => p.id));
        D.pages.forEach(localP => {
          if (localP && localP.id && !incomingIds.has(localP.id) && localP._localDirtyTs && (Date.now() - localP._localDirtyTs < 30000)) {
            pagesMeta.push(localP);
          }
        });

        D.pages = pagesMeta.map(incP => {
          const locP = localPagesById[incP.id];
          if (locP && locP._localDirtyTs && (locP.ts || 0) > (incP.ts || 0)) {
            return {
              ...incP,
              name: locP.name || incP.name,
              groupId: locP.groupId || incP.groupId,
              pageType: locP.pageType || incP.pageType,
              zoom: locP.zoom !== undefined ? locP.zoom : incP.zoom,
              panX: locP.panX !== undefined ? locP.panX : incP.panX,
              panY: locP.panY !== undefined ? locP.panY : incP.panY,
              bg: locP.bg !== undefined ? locP.bg : incP.bg,
              bgType: locP.bgType !== undefined ? locP.bgType : incP.bgType,
              tabColor: locP.tabColor !== undefined ? locP.tabColor : incP.tabColor,
              cols: locP.cols !== undefined ? locP.cols : (incP.cols !== undefined ? incP.cols : 3),
              ts: locP.ts
            };
          }
          return incP;
        });

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
            p.gridRows = heavyDataMap[p.id].gridRows;
            p.gridCols = heavyDataMap[p.id].gridCols;
            p.cellPages = heavyDataMap[p.id].cellPages;
            p.slicerColSizes = heavyDataMap[p.id].slicerColSizes;
            p.slicerRowSizes = heavyDataMap[p.id].slicerRowSizes;
            if (p.cols === undefined && heavyDataMap[p.id].cols !== undefined) p.cols = heavyDataMap[p.id].cols;
            if (heavyDataMap[p.id].ts && heavyDataMap[p.id].ts > (p.ts || 0)) p.ts = heavyDataMap[p.id].ts;
            if (heavyDataMap[p.id]._localDirtyTs) p._localDirtyTs = heavyDataMap[p.id]._localDirtyTs;
            if (heavyDataMap[p.id]._hasBeenLoaded) p._hasBeenLoaded = true;
          }
        });

        if (window.sanitizeData) {
          window.sanitizeData(D);
        }

        const sanitizedMeta = D.pages.filter(p => p).map(p => ({
          id: p.id || '', groupId: p.groupId || '', name: p.name || 'Untitled Page', pageType: p.pageType || 'miro',
          zoom: p.zoom !== undefined ? p.zoom : 100, panX: p.panX !== undefined ? p.panX : 0, panY: p.panY !== undefined ? p.panY : 0,
          bg: p.bg || '', bgType: p.bgType || 'none',
          tabColor: p.tabColor || '',
          cols: p.cols !== undefined ? p.cols : 3,
          ts: p.ts || 0
        }));
        cachePagesMeta(sanitizedMeta); // Cache to localStorage

        // Establish baseline for smart pagesMeta diffing in sv()
        _lastSyncedPagesMetaStr = JSON.stringify(sanitizedMeta);

        if (hadBogusRecovered) {
          setOwnWrite(true);
          db.ref(pagesMetaRef).set(sanitizedMeta).finally(() => setOwnWrite(false));
        }

        if (D.__modified) {
          delete D.__modified;
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
          // If D.cur is not valid or points to default p0 while user's active curGroup has pages, pick the first page in D.curGroup
          if (!D.cur || !D.pages.some(p => p && p.id === D.cur)) {
            const grpPage = D.pages.find(p => p && p.groupId === D.curGroup);
            D.cur = grpPage ? grpPage.id : (D.pages[0] ? D.pages[0].id : 'p0');
          }
          // Ensure curGroup and curEnv match the restored page
          const rp3 = D.pages.find(p => p.id === D.cur);
          if (rp3 && rp3.groupId) {
            D.curGroup = rp3.groupId;
            const rg3 = D.groups.find(g => g.id === rp3.groupId);
            if (rg3 && rg3.envId) D.curEnv = rg3.envId;
          }
          isFirstLoad = false;
          switchActivePage(D.cur); // This will render All
          setTimeout(() => {
            window._initialSyncCompleted = true;
            if (typeof window.healWorkspaceFromCloud === 'function') {
              window.healWorkspaceFromCloud();
            }
            if (typeof window.prewarmPageCache === 'function') {
              window.prewarmPageCache();
            }
          }, 600);
        } else {
          renderMeta();
          if (typeof window.healWorkspaceFromCloud === 'function') {
            window.healWorkspaceFromCloud();
          }
        }

        setSyncStatus('ok', 'Realtime Sync Active \u2713');
      }, (err) => {
        console.error('[SYNC] pagesMetaRef error:', err);
        if (typeof setSyncStatus === 'function') {
          setSyncStatus('err', 'Sync Error: ' + err.message);
        }
      });

      // Ensure single listener and debounced disconnect handling to eliminate UI flash toggling
      db.ref('.info/connected').off();
      let _disconnectTimer = null;
      db.ref('.info/connected').on('value', (snap) => {
        const isConnected = !!snap.val();
        if (isConnected) {
          if (_disconnectTimer) {
            clearTimeout(_disconnectTimer);
            _disconnectTimer = null;
          }
          window._isFbConnected = true;
          console.log('[SYNC] Connected successfully');
          if (typeof _syncMode === 'undefined' || _syncMode === 'realtime') {
            if (typeof setSyncStatus === 'function') {
              setSyncStatus('ok', 'Realtime Sync Active \u2713');
            }
          }
        } else {
          // Grace period: debounce disconnect warning by 3.5 seconds to prevent flash toggles on brief reconnects or auth token refreshes
          if (!_disconnectTimer) {
            _disconnectTimer = setTimeout(() => {
              window._isFbConnected = false;
              console.warn('[SYNC] Disconnected / Offline (grace period expired)');
              if (typeof _syncMode === 'undefined' || _syncMode === 'realtime') {
                if (typeof setSyncStatus === 'function') {
                  setSyncStatus('loading', '🔄 Disconnected \u2014 reconnecting...');
                }
              }
            }, 3500);
          }
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

  const nowTs = Date.now();
  window._lastLocalEditTs = nowTs;
  window._lastLocalMetaTs = nowTs;
  window._hasPendingLocalSave = true;

  // Immediately update timestamps and dirty markers in memory to prevent Firebase listener race conditions/reversions during debounce
  const activePg = cp();
  if (activePg) {
    activePg.ts = nowTs;
    activePg._localDirtyTs = nowTs;
    window._pendingCloudPageIds.add(activePg.id);
    if (activePg.pageType === 'slicer' && activePg.cellPages) {
      Object.values(activePg.cellPages).forEach(subPid => {
        const subPg = D.pages.find(p => p && p.id === subPid);
        if (subPg) {
          subPg.ts = nowTs;
          subPg._localDirtyTs = nowTs;
          window._pendingCloudPageIds.add(subPid);
        }
      });
    }
  }

  // Capture undo snapshot before saving (for Miro pages)
  if (typeof pushUndo === 'function') { try { pushUndo(); } catch(e) {} }
  if (window.SM && window.SM.events) {
    window.SM.events.emit('data:saved', { ts: nowTs, saveAll, immediate });
  }

  // ─── IMMEDIATE LOCAL CACHE PERSISTENCE (ALL MODES: Realtime, SaveUpload, Offline) ───
  // Always persist to RAM + IndexedDB + localStorage at millisecond 0 so tab switches,
  // page switches, or network drops during the 800ms debounce never lose a single edit.
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
      cols: activePg.cols !== undefined ? activePg.cols : 3,
      pageType: activePg.pageType || 'miro',
      ts: activePg.ts || nowTs,
      _bypassVersionGuard: activePg._bypassVersionGuard || false
    });

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
            gridRows: subPg.gridRows || null,
            gridCols: subPg.gridCols || null,
            cellPages: subPg.cellPages || null,
            slicerColSizes: subPg.slicerColSizes || null,
            slicerRowSizes: subPg.slicerRowSizes || null,
            cols: subPg.cols !== undefined ? subPg.cols : 3,
            pageType: subPg.pageType || 'miro',
            ts: subPg.ts || nowTs,
            _bypassVersionGuard: subPg._bypassVersionGuard || false
          });
        }
      });
    }
  }
  cacheMeta({
    settings: D.settings, curEnv: D.curEnv, curGroup: D.curGroup,
    environments: D.environments, groups: D.groups, inbox: D.inbox,
    ts: nowTs
  });
  cachePagesMeta(D.pages.filter(p => p).map(p => ({
    id: p.id || '', groupId: p.groupId || '', name: p.name || 'Untitled Page', pageType: p.pageType || 'miro',
    zoom: p.zoom !== undefined ? p.zoom : 100, panX: p.panX !== undefined ? p.panX : 0, panY: p.panY !== undefined ? p.panY : 0,
    bg: p.bg || '', bgType: p.bgType || 'none',
    tabColor: p.tabColor || '',
    cols: p.cols !== undefined ? p.cols : 3,
    ts: p.ts || 0
  })));

  // ─── Local Save Mode (Offline or SaveUpload): stop after local cache save ───
  if (_offlineMode || (_syncMode === 'saveUpload' && !window._bypassingSaveUpload)) {
    window._hasPendingLocalSave = false;
    if (_syncMode === 'saveUpload') {
      if (activePg) {
        updateDirtyStatus(activePg.id, true);
        const parentSlicer = D.pages.find(p => p && p.pageType === 'slicer' && p.cellPages && Object.values(p.cellPages).includes(activePg.id));
        if (parentSlicer) {
          updateDirtyStatus(parentSlicer.id, true);
        }
      }
    } else {
      markDirtyOffline();
    }
    return;
  }

  const doSave = async () => {
    window._hasPendingLocalSave = false;
    if ((!window._initialSyncCompleted || !window._cloudMetaLoaded || !window._cloudPagesMetaLoaded) && !_offlineMode && !window._bypassingInitialLock) {
      console.warn('[SV ⛔] Cloud save blocked: Initial cloud sync not yet completed.');
      return;
    }

    setOwnWrite(true);

    const metaRef = `users/${USER_ID}/startmine_meta`;
    const pagesMetaRef = `users/${USER_ID}/startmine_pages_meta`;

    // Extract metadata without payloads
    const metaForDiff = {
      settings: D.settings,
      curEnv: D.curEnv,
      curGroup: D.curGroup,
      environments: D.environments,
      groups: D.groups,
      inbox: D.inbox,
      stats: window._cloudStats || (typeof window.getHighestCounts === 'function' ? window.getHighestCounts() : null)
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
      tabColor: p.tabColor || '',
      cols: p.cols !== undefined ? p.cols : 3,
      ts: p.ts || 0
    }));

    const updates = {};

    // Smart meta sync: only write if changed
    const curMetaStr = JSON.stringify(metaForDiff);
    if (curMetaStr !== _lastSyncedMetaStr) {
      updates[metaRef] = { ...metaForDiff, ts: window._lastLocalMetaTs || Date.now() };
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
                (o.tabColor || '') === (n.tabColor || '') &&
                (o.cols || 3) === (n.cols || 3)) {
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
      window._pendingCloudPageIds.clear();
      let _savedCount = 0, _skippedCount = 0;
      for (const p of D.pages) {
        if (!p) continue;
        let widgets, miroCards, vGuides, hGuides, _guidesMode, lockedGuides, cellStates, mergedCells, customCells, ts, cellGuides, _layoutGuidesMode;
        let gridRows, gridCols, cellPages, slicerColSizes, slicerRowSizes;
        if (p.id === D.cur) {
          p.ts = Date.now(); // Update live page timestamp
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
          // NON-ACTIVE page — hydrate asynchronously from IndexedDB + cache, then memory
          if (p._bypassVersionGuard) {
            widgets = [];
            miroCards = [];
            vGuides = [];
            hGuides = [];
            _guidesMode = false;
            lockedGuides = [];
            cellStates = {};
            mergedCells = [];
            customCells = [];
            cellGuides = {};
            _layoutGuidesMode = false;
            gridRows = null;
            gridCols = null;
            cellPages = null;
            slicerColSizes = null;
            slicerRowSizes = null;
            ts = p.ts || Date.now();
          } else {
            const cached = typeof getCachedPageDataAsync === 'function'
              ? await getCachedPageDataAsync(p.id)
              : getCachedPageData(p.id);
            const hasCachedItems = cached && (
              (Array.isArray(cached.widgets) && cached.widgets.length > 0) ||
              (Array.isArray(cached.miroCards) && cached.miroCards.length > 0) ||
              (Array.isArray(cached.customCells) && cached.customCells.length > 0)
            );
            const hasMemItems = (
              (Array.isArray(p.widgets) && p.widgets.length > 0) ||
              (Array.isArray(p.miroCards) && p.miroCards.length > 0) ||
              (Array.isArray(p.customCells) && p.customCells.length > 0)
            );
            if (hasCachedItems) {
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
            } else if (hasMemItems) {
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
              // ⛔ ABSOLUTE GUARD: Non-active page with no loaded items in memory or cache.
              // NEVER write empty shard to Firebase. Keep the existing Firebase data untouched.
              _skippedCount++;
              continue;
            }
          }
        }
        // ⛔ DOUBLE CHECK: Even after loading from cache, if still empty → skip
        if (widgets.length === 0 && miroCards.length === 0 && vGuides.length === 0 && hGuides.length === 0 && !_guidesMode && customCells.length === 0 && Object.keys(cellGuides || {}).length === 0 && !_layoutGuidesMode && p.pageType !== 'slicer') {
          if (!p._bypassVersionGuard) {
            console.warn(`[SV GUARD ⛔] Page "${p.name}" resolved to 0 items — refusing to write.`);
            _skippedCount++;
            continue;
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
          cols: p.cols !== undefined ? p.cols : 3,
          ts
        };
        _savedCount++;
      }
      if (_skippedCount > 0) {
        console.warn(`[SV SUMMARY] Saved: ${_savedCount} pages, Skipped (protected): ${_skippedCount} pages`);
      }
    } else {
      // Upload heavy data for the active page, any slicer subpages, AND any page queued in _pendingCloudPageIds during debounce
      const activePg = cp();
      const pagesToSave = [];
      const addPageToSave = (pgObj) => {
        if (pgObj && !pagesToSave.some(x => x.id === pgObj.id)) {
          pagesToSave.push(pgObj);
        }
      };
      if (activePg) {
        addPageToSave(activePg);
        if (activePg.pageType === 'slicer' && activePg.cellPages) {
          Object.values(activePg.cellPages).forEach(subPid => {
            const subPg = D.pages.find(p => p && p.id === subPid);
            if (subPg) addPageToSave(subPg);
          });
        }
      }
      if (window._pendingCloudPageIds && window._pendingCloudPageIds.size > 0) {
        window._pendingCloudPageIds.forEach(pid => {
          const pendPg = D.pages.find(p => p && p.id === pid);
          if (pendPg) addPageToSave(pendPg);
        });
        window._pendingCloudPageIds.clear();
      }

      pagesToSave.forEach(p => {
        if (!p._hasBeenLoaded && !p._bypassVersionGuard) {
          console.warn(`[SV GUARD ⛔] Page "${p.name}" (${p.id}) has not finished loading from cloud yet — skipping cloud write.`);
          return;
        }
        if (activePg && p.id === activePg.id) {
          // ─── DATA LOSS GUARD: Don't overwrite non-empty Firebase data with empty data ───
          const hasSlicerCells = activePg.pageType === 'slicer' && ((activePg.cellPages && Object.keys(activePg.cellPages).length > 0) || Boolean(activePg.gridRows));
          const curHasData = (activePg.widgets && activePg.widgets.length > 0) || (activePg.miroCards && activePg.miroCards.length > 0) || (activePg.customCells && activePg.customCells.length > 0) || hasSlicerCells;
          if (!curHasData && !activePg._bypassVersionGuard) {
            const cached = typeof getCachedPageData === 'function' ? getCachedPageData(activePg.id) : null;
            const cachedHadData = cached && (((cached.widgets || []).length > 0) || ((cached.miroCards || []).length > 0) || (cached.cellPages && Object.keys(cached.cellPages).length > 0));
            const oldHadWidgets = _lastSyncedPageData && JSON.parse(_lastSyncedPageData.widgets || '[]').length > 0;
            const oldHadCards = _lastSyncedPageData && JSON.parse(_lastSyncedPageData.miroCards || '[]').length > 0;
            if (oldHadWidgets || oldHadCards || cachedHadData || !activePg._localDirtyTs) {
              console.warn(`[SV GUARD ⛔] Refusing to overwrite page "${activePg.name}" with empty items — cache/cloud has items or no local edits!`);
              return;
            }
          }
          trackPageVersion(activePg.id, activePg.widgets, activePg.miroCards);
          activePg.ts = Date.now(); // Update timestamp on every save

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
            cols: activePg.cols !== undefined ? activePg.cols : 3,
            ts: activePg.ts
          };

          _lastSyncedPageData = {
            widgets: JSON.stringify(activePg.widgets || []),
            miroCards: JSON.stringify(activePg.miroCards || [])
          };
        } else {
          // For subpages or recently switched dirty pages, write their whole payload directly
          const subHasSlicerCells = p.pageType === 'slicer' && ((p.cellPages && Object.keys(p.cellPages).length > 0) || Boolean(p.gridRows));
          const subHasData = (p.widgets && p.widgets.length > 0) || (p.miroCards && p.miroCards.length > 0) || (p.customCells && p.customCells.length > 0) || subHasSlicerCells;
          if (!subHasData && !p._bypassVersionGuard) {
            const cached = getCachedPageData(p.id);
            if ((cached && ((cached.widgets && cached.widgets.length > 0) || (cached.miroCards && cached.miroCards.length > 0))) || !p._localDirtyTs) {
              console.warn(`[SV GUARD ⛔] Page "${p.name}" (${p.id}) resolved to empty in memory — save skipped to prevent data loss.`);
              return;
            }
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
            cols: p.cols !== undefined ? p.cols : 3,
            ts: p.ts
          };
        }
      });
    }

    // Skip empty updates (nothing changed)
    if (Object.keys(updates).length === 0) {
      setOwnWrite(false);
      return;
    }

    const cleanUpdates = JSON.parse(JSON.stringify(updates));
    db.ref().update(cleanUpdates)
      .then(() => {
        setOwnWrite(false);
        _lastSvTs = Date.now();
        D.pages.forEach(pg => {
          if (pg) {
            if (pg._bypassVersionGuard) delete pg._bypassVersionGuard;
            if (pg._localDirtyTs && pg._localDirtyTs <= _lastSvTs) delete pg._localDirtyTs;
          }
        });
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
              cellGuides: p.cellGuides || {},
              _layoutGuidesMode: p._layoutGuidesMode || false,
              gridRows: p.gridRows || null,
              gridCols: p.gridCols || null,
              cellPages: p.cellPages || null,
              slicerColSizes: p.slicerColSizes || null,
              slicerRowSizes: p.slicerRowSizes || null,
              cols: p.cols !== undefined ? p.cols : 3,
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
  if (immediate) {
    _svTimer = null;
    doSave();
  } else {
    _svTimer = setTimeout(() => {
      _svTimer = null;
      doSave();
    }, 800);
  }
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
        cols: activePg.cols !== undefined ? activePg.cols : 3,
        pageType: activePg.pageType || 'miro',
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
              cols: subPg.cols !== undefined ? subPg.cols : 3,
              pageType: subPg.pageType || 'miro',
              ts: subPg.ts || Date.now()
            });
          }
        });
      }
    }
    const meta = {
      settings: D.settings, curEnv: D.curEnv, curGroup: D.curGroup,
      environments: D.environments, groups: D.groups, inbox: D.inbox,
      ts: window._lastLocalMetaTs || Date.now()
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
      tabColor: p.tabColor || '',
      cols: p.cols !== undefined ? p.cols : 3,
      ts: p.ts || 0
    })));
  } catch(e) { console.warn('[FORCE SAVE]', e); }
};
  window.SM.data.forceLocalSave = window.forceLocalSave;
  window.SM.core.expose('forceLocalSave', window.forceLocalSave);

  // Extracted triggerManualSave
  window.triggerManualSave = function () {
    forceLocalSave();
    if (window._syncMode === 'saveUpload') {
      const activePg = typeof cp === 'function' ? cp() : null;
      if (activePg) {
        if (typeof showToast === 'function') showToast('☁️ جاري حفظ الصفحة على السحابة...', 2000);
        window._bypassingSaveUpload = true;
        sv(false, true);
        window._bypassingSaveUpload = false;

        if (typeof updateDirtyStatus === 'function') {
          updateDirtyStatus(activePg.id, false);
          if (activePg.pageType === 'slicer' && activePg.cellPages) {
            Object.values(activePg.cellPages).forEach(subPid => {
              updateDirtyStatus(subPid, false);
            });
          }
        }
      }
    } else if (window._syncMode === 'offline') {
      if (typeof syncNow === 'function') syncNow();
    } else {
      // Realtime mode: flush any pending debounced save immediately to cloud + local cache
      sv(false, true);
      if (typeof showToast === 'function') showToast('⚡ تم حفظ جميع التعديلات فوراً (محلياً وعلى السحابة)');
    }
  };
  window.SM.data.triggerManualSave = window.triggerManualSave;
  window.SM.core.expose('triggerManualSave', window.triggerManualSave);

  // Extracted setOwnWrite (Ref-counted + cooldown window to prevent multi-path listener echo race conditions)
  window.setOwnWrite = function (val) {
    if (val) {
      _activeWriteCount++;
      _ownWrite = true;
      _ownWriteTs = Date.now();
    } else {
      _activeWriteCount = Math.max(0, _activeWriteCount - 1);
      _ownWriteCooldownUntil = Date.now() + OWN_WRITE_COOLDOWN_MS;
      if (_activeWriteCount === 0) {
        _ownWrite = false;
      }
    }
  };
  window.SM.data.setOwnWrite = window.setOwnWrite;
  window.SM.core.expose('setOwnWrite', window.setOwnWrite);

  // Extracted isOwnWrite
  window.isOwnWrite = function () {
    // 1. If a local debounced save is waiting to fire (800ms window), block incoming listener overwrites!
    if (window._hasPendingLocalSave) return true;
    // 2. If we are within the post-write echo cooldown window (1.5s), block listener echoes!
    if (Date.now() < _ownWriteCooldownUntil) return true;
    // 3. Check active in-flight write count with safety timeout
    if (!_ownWrite && _activeWriteCount <= 0) return false;
    if (Date.now() - _ownWriteTs > OWN_WRITE_TIMEOUT) {
      console.warn('[DATA GUARD] _ownWrite was stuck for >8s — auto-resetting');
      _ownWrite = false;
      _activeWriteCount = 0;
      return false;
    }
    return true;
  };
  window.SM.data.isOwnWrite = window.isOwnWrite;
  window.SM.core.expose('isOwnWrite', window.isOwnWrite);


SM.data.syncNow = typeof syncNow !== 'undefined' ? syncNow : window.syncNow;
SM.data.sv = typeof sv !== 'undefined' ? sv : window.sv;
SM.data.triggerManualSave = typeof triggerManualSave !== 'undefined' ? triggerManualSave : window.triggerManualSave;
SM.data.setupShardedListeners = typeof setupShardedListeners !== 'undefined' ? setupShardedListeners : window.setupShardedListeners;
SM.data.forceLocalSave = typeof forceLocalSave !== 'undefined' ? forceLocalSave : window.forceLocalSave;
SM.data.detachAllListeners = typeof detachAllListeners !== 'undefined' ? detachAllListeners : window.detachAllListeners;

window.syncNow = SM.data.syncNow;
window.sv = SM.data.sv;
window.triggerManualSave = SM.data.triggerManualSave;
window.setupShardedListeners = SM.data.setupShardedListeners;
window.forceLocalSave = SM.data.forceLocalSave;
window.detachAllListeners = SM.data.detachAllListeners;
})();
