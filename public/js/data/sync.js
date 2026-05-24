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
    let widgets, miroCards, vGuides, hGuides, _guidesMode, lockedGuides, cellStates;
    if (p.id === D.cur) {
      // Active page: use live in-memory data
      widgets = p.widgets || [];
      miroCards = p.miroCards || [];
      vGuides = p.vGuides || [];
      hGuides = p.hGuides || [];
      _guidesMode = p._guidesMode || false;
      lockedGuides = p.lockedGuides || [];
      cellStates = p.cellStates || {};
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
      } else if ((p.widgets && p.widgets.length > 0) || (p.miroCards && p.miroCards.length > 0) || (p.vGuides && p.vGuides.length > 0) || (p.hGuides && p.hGuides.length > 0) || p._guidesMode) {
        widgets = p.widgets || [];
        miroCards = p.miroCards || [];
        vGuides = p.vGuides || [];
        hGuides = p.hGuides || [];
        _guidesMode = p._guidesMode || false;
        lockedGuides = p.lockedGuides || [];
        cellStates = p.cellStates || {};
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
      cellStates
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
          // Ensure curGroup matches the restored page
          const rp2 = D.pages.find(p => p.id === D.cur);
          if (rp2 && rp2.groupId) D.curGroup = rp2.groupId;
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
            const hasGuides = (p.vGuides && p.vGuides.length > 0) || (p.hGuides && p.hGuides.length > 0) || p._guidesMode;
            if (hasData || hasGuides) {
              heavyDataMap[p.id] = {
                widgets: p.widgets || [],
                miroCards: p.miroCards || [],
                vGuides: p.vGuides || [],
                hGuides: p.hGuides || [],
                _guidesMode: p._guidesMode || false,
                lockedGuides: p.lockedGuides || [],
                cellStates: p.cellStates || {}
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
          // Ensure curGroup matches the restored page
          const rp3 = D.pages.find(p => p.id === D.cur);
          if (rp3 && rp3.groupId) D.curGroup = rp3.groupId;
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
      id: p.id,
      groupId: p.groupId,
      name: p.name,
      pageType: p.pageType,
      zoom: p.zoom,
      panX: p.panX,
      panY: p.panY,
      bg: p.bg,
      bgType: p.bgType,
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
        let widgets, miroCards, vGuides, hGuides, _guidesMode, lockedGuides, cellStates;
        if (p.id === D.cur) {
          // Active page — use live data
          widgets = p.widgets || [];
          miroCards = p.miroCards || [];
          vGuides = p.vGuides || [];
          hGuides = p.hGuides || [];
          _guidesMode = p._guidesMode || false;
          lockedGuides = p.lockedGuides || [];
          cellStates = p.cellStates || {};
        } else {
          // NON-ACTIVE page — try cache, then memory
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
          } else if ((p.widgets && p.widgets.length > 0) || (p.miroCards && p.miroCards.length > 0) || (p.vGuides && p.vGuides.length > 0) || (p.hGuides && p.hGuides.length > 0) || p._guidesMode) {
            widgets = p.widgets || [];
            miroCards = p.miroCards || [];
            vGuides = p.vGuides || [];
            hGuides = p.hGuides || [];
            _guidesMode = p._guidesMode || false;
            lockedGuides = p.lockedGuides || [];
            cellStates = p.cellStates || {};
          } else {
            // ⛔ ABSOLUTE GUARD: NEVER write empty data to Firebase
            // This page has no data anywhere — skip it entirely
            console.warn(`[SV GUARD ⛔] Skipping page "${p.name}" (${p.id}) — EMPTY. Firebase data preserved.`);
            _skippedCount++;
            return;
          }
        }
        // ⛔ DOUBLE CHECK: Even after loading from cache, if still empty → skip
        if (widgets.length === 0 && miroCards.length === 0 && vGuides.length === 0 && hGuides.length === 0 && !_guidesMode) {
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
          cellStates
        };
        _savedCount++;
      });
      if (_skippedCount > 0) {
        console.warn(`[SV SUMMARY] Saved: ${_savedCount} pages, Skipped (protected): ${_skippedCount} pages`);
      }
    } else {
      // Only upload the heavy data for the active page
      const activePg = cp();
      if (activePg) {
        // ─── DATA LOSS GUARD: Don't overwrite non-empty Firebase data with empty data ───
        const curHasData = (activePg.widgets && activePg.widgets.length > 0) || (activePg.miroCards && activePg.miroCards.length > 0);
        if (!curHasData && _lastSyncedPageData) {
          const oldHadWidgets = JSON.parse(_lastSyncedPageData.widgets || '[]').length > 0;
          const oldHadCards = JSON.parse(_lastSyncedPageData.miroCards || '[]').length > 0;
          if (oldHadWidgets || oldHadCards) {
            console.error(`[SV GUARD] 🚨 Refusing to overwrite page "${activePg.name}" — was non-empty, now empty!`);
            if (typeof showToast === 'function') showToast('⚠️ Data loss prevented — page was not saved (empty data detected)', 5000);
            setOwnWrite(false);
            return;
          }
        }
        // ─── VERSION REGRESSION GUARD ───
        if (isVersionRegression(activePg.id, activePg.widgets, activePg.miroCards)) {
          console.error(`[SV GUARD] 🚨 Version regression on "${activePg.name}" — save blocked!`);
          if (typeof showToast === 'function') showToast('⚠️ Suspicious data drop detected — save blocked', 5000);
          setOwnWrite(false);
          return;
        }
        trackPageVersion(activePg.id, activePg.widgets, activePg.miroCards);
        if (_lastSyncedPageData) {
          const curWidgetsStr = JSON.stringify(activePg.widgets || []);
          const curCardsStr = JSON.stringify(activePg.miroCards || []);

          // Always write guides/slices properties when _lastSyncedPageData is active
          updates[`users/${USER_ID}/startmine_pages/${activePg.id}/vGuides`] = activePg.vGuides || [];
          updates[`users/${USER_ID}/startmine_pages/${activePg.id}/hGuides`] = activePg.hGuides || [];
          updates[`users/${USER_ID}/startmine_pages/${activePg.id}/_guidesMode`] = activePg._guidesMode || false;
          updates[`users/${USER_ID}/startmine_pages/${activePg.id}/lockedGuides`] = activePg.lockedGuides || [];
          updates[`users/${USER_ID}/startmine_pages/${activePg.id}/cellStates`] = activePg.cellStates || {};

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
            cellStates: activePg.cellStates || {}
          };
        }
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
        // Cache active page data to localStorage after successful save
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
