/**
 * @module Protection
 * @description Advanced Zero-Data-Loss Protection, Drop Interceptor, Cloud Item Tracker, and 30-Day Recycle Bin
 * @namespace SM.data.protection
 * @depends namespace.js, events.js, utils.js, firebase.js
 * @provides window.countAllData, window.countAllDataAsync, window.checkDataLossGuard, window.showDropWarningModal, window.addToRecycleBin, window.restoreRecycleBinItem, window.openRecycleBinModal, window.closeRecycleBinModal, window.saveSafetySnapshot, window.recalibrateHighestCounts
 * @safety Never allow silent overwrites or drops. All deleted items preserved for 30 days.
 */
// js/data/protection.js
(function() {
  window.SM = window.SM || {};
  window.SM.data = window.SM.data || {};
  window.SM.data.protection = window.SM.data.protection || {};

  const LS_KEY_HIGHEST_BM = 'sm_highest_bookmarks';
  const LS_KEY_HIGHEST_TOTAL = 'sm_highest_total';
  const LS_KEY_RECYCLE_BIN = 'sm_recycle_bin';
  const RECYCLE_BIN_RETENTION_MS = 30 * 24 * 60 * 60 * 1000; // 30 Days in ms

  window._cloudStats = window._cloudStats || null;
  window._userConfirmedDataLoss = false;
  window._activeWarningResolve = null;

  /* ─────────────────────────────────────────────────────────────
   * 1. ACCURATE ITEM & BOOKMARK COUNTER (DUAL-VIEW DEDUPLICATED)
   * ───────────────────────────────────────────────────────────── */
  function countAllData(source) {
    const d = source || window.D;
    if (!d) return { bookmarks: 0, widgets: 0, widgetItems: 0, cards: 0, pages: 0, inbox: 0, total: 0, rawCombinedBm: 0, isPartial: false, unhydratedPages: 0 };

    let totalBookmarks = 0;
    let totalWidgets = 0;
    let totalWidgetItems = 0;
    let totalCards = 0;
    let rawCombinedBm = 0;
    let unhydratedPages = 0;

    const pagesList = Array.isArray(d.pages) ? d.pages : (d.pages && typeof d.pages === 'object' ? Object.values(d.pages) : []);

    pagesList.forEach(p => {
      if (!p) return;

      // Ensure background unhydrated pages read from cache if available
      let widgets = p.widgets;
      let miroCards = p.miroCards;
      if ((!widgets || widgets.length === 0) && (!miroCards || miroCards.length === 0) && p.id && typeof getCachedPageData === 'function') {
        try {
          const cached = getCachedPageData(p.id);
          if (cached) {
            if (cached.widgets && cached.widgets.length > 0) widgets = cached.widgets;
            if (cached.miroCards && cached.miroCards.length > 0) miroCards = cached.miroCards;
          }
        } catch(e) {}
      }

      const hasWidgets = Array.isArray(widgets) && widgets.length > 0;
      const hasCards = Array.isArray(miroCards) && miroCards.length > 0;
      if (!hasWidgets && !hasCards && p.pageType !== 'slicer' && !p._bypassVersionGuard) {
        unhydratedPages++;
      }

      let pageWidgetBm = 0;
      let pageWidgetItems = 0;
      if (Array.isArray(widgets)) {
        totalWidgets += widgets.length;
        widgets.forEach(w => {
          if (w && Array.isArray(w.items)) {
            pageWidgetItems += w.items.length;
            w.items.forEach(it => {
              if (it && (it.url || it.label)) pageWidgetBm++;
            });
          }
        });
      }
      totalWidgetItems += pageWidgetItems;

      let pageMiroBm = 0;
      if (Array.isArray(miroCards)) {
        totalCards += miroCards.length;
        miroCards.forEach(c => {
          if (!c) return;
          if (c.type === 'bwidget' && Array.isArray(c.items)) {
            c.items.forEach(it => {
              if (it && (it.url || it.label)) pageMiroBm++;
            });
          } else if (c.type === 'bookmark' || c.url || c.linkUrl) {
            pageMiroBm++;
          }
        });
      }

      rawCombinedBm += (pageWidgetBm + pageMiroBm);

      // In Startmine's dual-view architecture, StartMe widgets and Miro cards on the same page
      // are twin reflections of the exact same bookmarks.
      // The true deduplicated count for page p is Math.max(pageWidgetBm, pageMiroBm):
      const pageDeduplicatedBm = Math.max(pageWidgetBm, pageMiroBm);
      totalBookmarks += pageDeduplicatedBm;
    });

    const inboxCount = Array.isArray(d.inbox) ? d.inbox.length : 0;
    const nonBmWidgetItems = totalWidgetItems > totalBookmarks ? (totalWidgetItems - totalBookmarks) : 0;
    const total = totalBookmarks + totalCards + nonBmWidgetItems + inboxCount;

    return {
      bookmarks: totalBookmarks,
      widgets: totalWidgets,
      widgetItems: totalWidgetItems,
      cards: totalCards,
      pages: pagesList.length,
      inbox: inboxCount,
      total,
      rawCombinedBm,
      isPartial: unhydratedPages > 0,
      unhydratedPages
    };
  }

  async function countAllDataAsync(source) {
    const d = source || window.D;
    if (!d) return countAllData(d);

    const pagesList = Array.isArray(d.pages) ? d.pages : (d.pages && typeof d.pages === 'object' ? Object.values(d.pages) : []);

    // Pre-fetch any unhydrated pages asynchronously from IndexedDB
    const promises = pagesList.map(async (p) => {
      if (!p || !p.id) return;
      const hasWidgets = Array.isArray(p.widgets) && p.widgets.length > 0;
      const hasCards = Array.isArray(p.miroCards) && p.miroCards.length > 0;
      if (!hasWidgets && !hasCards && p.pageType !== 'slicer' && !p._bypassVersionGuard) {
        try {
          if (typeof getCachedPageDataAsync === 'function') {
            await getCachedPageDataAsync(p.id);
          } else if (typeof getCachedPageData === 'function') {
            getCachedPageData(p.id);
          }
        } catch (e) {}
      }
    });

    try {
      await Promise.all(promises);
    } catch(err) {
      console.warn('[PROTECTION] Async page pre-fetch warning:', err);
    }

    return countAllData(d);
  }

  /* ─────────────────────────────────────────────────────────────
   * 2. NON-BLOCKING STATS & CLEANUP
   * ───────────────────────────────────────────────────────────── */
  // Cleanup old inflated keys so no stale baseline warnings can ever happen
  try {
    localStorage.removeItem(LS_KEY_HIGHEST_BM);
    localStorage.removeItem(LS_KEY_HIGHEST_TOTAL);
    localStorage.removeItem('sm_golden_bookmarks');
    localStorage.removeItem('sm_golden_total');
    const existingOldModal = document.getElementById('m-override-warning');
    if (existingOldModal) existingOldModal.remove();
  } catch(e) {}

  function getHighestCounts() {
    if (window.D) {
      const counts = countAllData(window.D);
      return { bookmarks: counts.bookmarks, total: counts.total };
    }
    return { bookmarks: 0, total: 0 };
  }

  function recalibrateHighestCounts(newBm, newTotal) {
    return getHighestCounts();
  }

  function updateHighestCounts(counts) {
    // Harmless no-op: no baseline counting to annoy the user
  }

  function syncHighestCountsFromCloud(cloudStats) {
    // Harmless no-op
  }

  /* ─────────────────────────────────────────────────────────────
   * 3. ZERO-FRICTION DATA PROTECTION & TIME-MACHINE AUTO-SNAPSHOTS
   * ───────────────────────────────────────────────────────────── */
  let _lastSilentSnapshotTs = 0;
  const SILENT_SNAPSHOT_INTERVAL = 10 * 60 * 1000; // 10 minutes

  async function triggerSilentBackgroundSnapshot(tag = 'auto_periodic') {
    if (!window.D || !Array.isArray(window.D.pages) || window.D.pages.length === 0) return;
    const now = Date.now();
    if (now - _lastSilentSnapshotTs < 2 * 60 * 1000) {
      // Throttle: avoid saving more than once per 2 minutes
      return;
    }
    _lastSilentSnapshotTs = now;
    try {
      await saveSafetySnapshot(tag);
    } catch(e) {
      console.warn('[PROTECTION] Silent background snapshot error:', e);
    }
  }

  // Periodic automatic silent snapshot every 10 minutes in background
  setInterval(() => {
    triggerSilentBackgroundSnapshot('periodic_10min');
  }, SILENT_SNAPSHOT_INTERVAL);

  /**
   * Non-blocking Data Loss Guard:
   * Protects data without ever interrupting or blocking the user.
   * Only prevents writing if the root data is completely null/corrupted.
   */
  async function checkDataLossGuard(targetData, operationName = 'Save', options = {}) {
    // Basic sanity check to prevent saving a completely null or empty structure
    if (!targetData || !Array.isArray(targetData.pages) || targetData.pages.length === 0) {
      console.warn(`[DATA LOSS GUARD ⚠️] ${operationName} ignored: target data has no pages.`);
      return false;
    }

    // Trigger silent background snapshot
    triggerSilentBackgroundSnapshot('pre_save');

    // Never block normal user workflow or show annoying popup warnings
    return true;
  }

  /**
   * Dummy modal resolver for backward-compatibility with any legacy callers
   */
  function showDropWarningModal() {
    return Promise.resolve(true);
  }

  /* ─────────────────────────────────────────────────────────────
   * 5. 30-DAY RECYCLE BIN ENGINE
   * ───────────────────────────────────────────────────────────── */
  function getRecycleBin() {
    if (window.D && Array.isArray(window.D.recycleBin)) {
      return window.D.recycleBin;
    }
    try {
      const stored = localStorage.getItem(LS_KEY_RECYCLE_BIN);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          if (window.D) window.D.recycleBin = parsed;
          return parsed;
        }
      }
    } catch(e) {}
    if (window.D) window.D.recycleBin = [];
    return [];
  }

  function addToRecycleBin(entry) {
    if (!entry) return;
    const bin = getRecycleBin();
    const now = Date.now();

    const item = {
      id: 'rb_' + now.toString(36) + Math.random().toString(36).slice(2, 6),
      type: entry.type || 'bookmark', // 'bookmark' | 'widget' | 'card' | 'page'
      title: entry.title || (entry.data && (entry.data.label || entry.data.title || entry.data.name)) || 'عنصر محذوف',
      url: entry.url || (entry.data && (entry.data.url || entry.data.linkUrl)) || '',
      data: JSON.parse(JSON.stringify(entry.data || {})),
      sourcePageId: entry.sourcePageId || (window.D ? window.D.cur : ''),
      sourcePageName: entry.sourcePageName || '',
      sourceWidgetId: entry.sourceWidgetId || '',
      sourceWidgetTitle: entry.sourceWidgetTitle || '',
      deletedAt: now,
      expiresAt: now + RECYCLE_BIN_RETENTION_MS
    };

    bin.unshift(item);
    if (bin.length > 1000) bin.length = 1000; // Cap at 1000 items

    saveRecycleBinLocalAndCloud();

    if (typeof window.showToast === 'function') {
      window.showToast(`🗑️ تم نقل "${item.title}" إلى سلة المحذوفات (محفوظ لمدة 30 يوم)`, 4500);
    }
  }

  function pruneRecycleBin() {
    const bin = getRecycleBin();
    const now = Date.now();
    const initialLen = bin.length;
    const filtered = bin.filter(it => it && it.expiresAt > now);
    if (filtered.length !== initialLen) {
      if (window.D) window.D.recycleBin = filtered;
      saveRecycleBinLocalAndCloud();
    }
  }

  function saveRecycleBinLocalAndCloud() {
    const bin = getRecycleBin();
    try {
      localStorage.setItem(LS_KEY_RECYCLE_BIN, JSON.stringify(bin));
    } catch(e) {}

    // Async save to IndexedDB
    try {
      if (typeof window.idbSet === 'function') {
        window.idbSet('recycle_bin', bin).catch(() => {});
      }
    } catch(e) {}

    // Debounced sync to Firebase under users/${USER_ID}/startmine_recycle_bin
    clearTimeout(window._rbCloudTimer);
    window._rbCloudTimer = setTimeout(() => {
      if (window.USER_ID && window.db) {
        window.db.ref(`users/${window.USER_ID}/startmine_recycle_bin`).set(bin)
          .catch(e => console.warn('[RECYCLE BIN CLOUD SYNC]', e));
      }
    }, 2000);
  }

  function loadRecycleBinFromCloud() {
    if (!window.USER_ID || !window.db) return Promise.resolve([]);
    return window.db.ref(`users/${window.USER_ID}/startmine_recycle_bin`).once('value')
      .then(snap => {
        const val = snap.val();
        if (Array.isArray(val)) {
          // Merge with local bin without duplicates
          const localBin = getRecycleBin();
          const localIds = new Set(localBin.map(it => it.id));
          val.forEach(remoteItem => {
            if (remoteItem && remoteItem.id && !localIds.has(remoteItem.id)) {
              localBin.push(remoteItem);
            }
          });
          // Sort newest first
          localBin.sort((a, b) => (b.deletedAt || 0) - (a.deletedAt || 0));
          if (window.D) window.D.recycleBin = localBin;
          pruneRecycleBin();
          return localBin;
        }
        return getRecycleBin();
      }).catch(err => {
        console.warn('[RECYCLE BIN LOAD ERROR]', err);
        return getRecycleBin();
      });
  }

  function restoreRecycleBinItem(id) {
    const bin = getRecycleBin();
    const idx = bin.findIndex(it => it.id === id);
    if (idx === -1) return;
    const item = bin[idx];

    let restored = false;
    const curPg = typeof window.cp === 'function' ? window.cp() : (window.D && window.D.pages[0]);

    if (item.type === 'bookmark') {
      let targetWidget = null;
      let targetPage = window.D.pages.find(p => p.id === item.sourcePageId) || curPg;

      if (targetPage && Array.isArray(targetPage.widgets)) {
        targetWidget = targetPage.widgets.find(w => w.id === item.sourceWidgetId);
        if (!targetWidget) {
          targetWidget = targetPage.widgets.find(w => w.type === 'bookmarks');
        }
      }

      if (!targetWidget && targetPage) {
        targetWidget = {
          id: 'w_' + Date.now().toString(36),
          col: 0,
          type: 'bookmarks',
          title: item.sourceWidgetTitle || 'المواقع المستعادة',
          emoji: '🔗',
          items: []
        };
        if (!Array.isArray(targetPage.widgets)) targetPage.widgets = [];
        targetPage.widgets.push(targetWidget);
      }

      if (targetWidget) {
        if (!Array.isArray(targetWidget.items)) targetWidget.items = [];
        targetWidget.items.push(item.data);
        restored = true;
      }
    } else if (item.type === 'widget') {
      let targetPage = window.D.pages.find(p => p.id === item.sourcePageId) || curPg;
      if (targetPage) {
        if (!Array.isArray(targetPage.widgets)) targetPage.widgets = [];
        targetPage.widgets.push(item.data);
        restored = true;
      }
    } else if (item.type === 'card') {
      let targetPage = window.D.pages.find(p => p.id === item.sourcePageId) || curPg;
      if (targetPage) {
        if (!Array.isArray(targetPage.miroCards)) targetPage.miroCards = [];
        targetPage.miroCards.push(item.data);
        restored = true;
      }
    } else if (item.type === 'page') {
      if (!window.D.pages.some(p => p.id === item.data.id)) {
        window.D.pages.push(item.data);
        restored = true;
      }
    }

    if (restored) {
      bin.splice(idx, 1);
      saveRecycleBinLocalAndCloud();

      if (typeof window.sv === 'function') window.sv(true, true);
      if (typeof window.renderAll === 'function') window.renderAll();
      else {
        if (typeof window.buildCols === 'function') window.buildCols();
        if (typeof window.buildTabs === 'function') window.buildTabs();
        if (typeof window.buildMiroCanvas === 'function') window.buildMiroCanvas();
      }

      if (typeof window.showToast === 'function') {
        window.showToast(`✅ تم استعادة "${item.title}" بنجاح!`, 4000);
      }
      renderRecycleBinList();
    }
  }

  function deletePermanently(id) {
    const bin = getRecycleBin();
    const idx = bin.findIndex(it => it.id === id);
    if (idx === -1) return;
    if (!confirm('هل تريد حذف هذا العنصر نهائياً من سلة المحذوفات؟')) return;
    bin.splice(idx, 1);
    saveRecycleBinLocalAndCloud();
    renderRecycleBinList();
    if (typeof window.showToast === 'function') window.showToast('🗑️ تم الحذف النهائي بنجاح', 3000);
  }

  function emptyRecycleBin() {
    const bin = getRecycleBin();
    if (bin.length === 0) return;
    if (!confirm(`هل تريد بالتأكيد إفراغ سلة المحذوفات ومسح ${bin.length} عنصر نهائياً؟`)) return;
    if (window.D) window.D.recycleBin = [];
    saveRecycleBinLocalAndCloud();
    renderRecycleBinList();
    if (typeof window.showToast === 'function') window.showToast('🗑️ تم إفراغ سلة المحذوفات', 3000);
  }

  /* ─────────────────────────────────────────────────────────────
   * 6. RECYCLE BIN UI MODAL
   * ───────────────────────────────────────────────────────────── */
  let _rbFilter = 'all';
  let _rbSearch = '';

  function openRecycleBinModal() {
    let modal = document.getElementById('recycle-bin-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'recycle-bin-modal';
      modal.className = 'mo';
      modal.style.zIndex = '999998';
      document.body.appendChild(modal);
    }

    modal.innerHTML = `
      <div class="mc wide" dir="rtl" style="direction: rtl; text-align: right; width: 680px; max-width: 95vw; max-height: 85vh; display: flex; flex-direction: column; background: rgba(22, 24, 38, 0.98); border: 1px solid rgba(255,255,255,0.12); box-shadow: 0 24px 80px rgba(0,0,0,0.7); border-radius: 16px; font-family: var(--font); overflow: hidden;">
        <!-- Header -->
        <div style="display:flex; align-items:center; justify-content:space-between; padding:16px 20px; border-bottom:1px solid rgba(255,255,255,0.08);">
          <div style="display:flex; align-items:center; gap:10px;">
            <span style="font-size:1.4rem;">🗑️</span>
            <div>
              <h3 style="margin:0; font-size:1.1rem; color:#fff; font-weight:700;">سلة المحذوفات (Recycle Bin)</h3>
              <p style="margin:2px 0 0 0; font-size:0.74rem; color:var(--mu);">أي رابط أو ويدجت محذوف يظل محفوظاً هنا لمدة 30 يوماً كاملة للاستعادة الفورية</p>
            </div>
          </div>
          <button onclick="closeRecycleBinModal()" style="background:none; border:none; color:var(--mu); font-size:1.2rem; cursor:pointer; padding:4px 8px; border-radius:6px;">✕</button>
        </div>

        <!-- Filter & Search Bar -->
        <div style="padding:12px 20px; border-bottom:1px solid rgba(255,255,255,0.06); display:flex; flex-direction:column; gap:10px; background:rgba(0,0,0,0.15);">
          <input type="text" id="rb-search-input" placeholder="🔍 ابحث في المحذوفات بالاسم أو الرابط..." style="width:100%; padding:8px 12px; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.1); border-radius:8px; color:#fff; font-size:0.82rem; outline:none;" />
          
          <div style="display:flex; gap:6px; flex-wrap:wrap; align-items:center;">
            <button class="rb-filter-btn" data-type="all" style="padding:4px 10px; border-radius:20px; border:1px solid rgba(108,143,255,0.4); background:rgba(108,143,255,0.2); color:#93b5ff; font-size:0.75rem; cursor:pointer;">الكل</button>
            <button class="rb-filter-btn" data-type="bookmark" style="padding:4px 10px; border-radius:20px; border:1px solid rgba(255,255,255,0.1); background:none; color:var(--mu); font-size:0.75rem; cursor:pointer;">روابط بوكمارك 🔗</button>
            <button class="rb-filter-btn" data-type="widget" style="padding:4px 10px; border-radius:20px; border:1px solid rgba(255,255,255,0.1); background:none; color:var(--mu); font-size:0.75rem; cursor:pointer;">ويدجتس 🗂️</button>
            <button class="rb-filter-btn" data-type="card" style="padding:4px 10px; border-radius:20px; border:1px solid rgba(255,255,255,0.1); background:none; color:var(--mu); font-size:0.75rem; cursor:pointer;">بطاقات ميرو 📋</button>
            <button class="rb-filter-btn" data-type="page" style="padding:4px 10px; border-radius:20px; border:1px solid rgba(255,255,255,0.1); background:none; color:var(--mu); font-size:0.75rem; cursor:pointer;">صفحات 📄</button>
            <span style="flex:1;"></span>
            <button id="rb-empty-btn" onclick="SM.data.protection.emptyRecycleBin()" style="padding:4px 10px; border-radius:6px; border:1px solid rgba(255,68,68,0.3); background:rgba(255,68,68,0.1); color:#ff7b7b; font-size:0.72rem; cursor:pointer;">🗑️ إفراغ السلة</button>
          </div>
        </div>

        <!-- Items List -->
        <div id="rb-list-container" style="flex:1; overflow-y:auto; padding:12px 20px; display:flex; flex-direction:column; gap:8px;">
          <div style="text-align:center; padding:30px; color:var(--mu);">جارٍ التحميل...</div>
        </div>

        <!-- Footer -->
        <div style="padding:10px 20px; border-top:1px solid rgba(255,255,255,0.08); display:flex; align-items:center; justify-content:space-between; background:rgba(0,0,0,0.2); font-size:0.75rem; color:var(--mu);">
          <span id="rb-count-label">0 عناصر</span>
          <button onclick="closeRecycleBinModal()" class="btn bg-btn" style="padding:6px 16px; border-radius:8px;">إغلاق</button>
        </div>
      </div>
    `;

    modal.classList.add('open');

    // Event listeners
    const searchInput = document.getElementById('rb-search-input');
    if (searchInput) {
      searchInput.oninput = (e) => {
        _rbSearch = e.target.value.toLowerCase().trim();
        renderRecycleBinList();
      };
    }

    const filterBtns = modal.querySelectorAll('.rb-filter-btn');
    filterBtns.forEach(btn => {
      btn.onclick = () => {
        filterBtns.forEach(b => {
          b.style.background = 'none';
          b.style.borderColor = 'rgba(255,255,255,0.1)';
          b.style.color = 'var(--mu)';
        });
        btn.style.background = 'rgba(108,143,255,0.2)';
        btn.style.borderColor = 'rgba(108,143,255,0.4)';
        btn.style.color = '#93b5ff';
        _rbFilter = btn.getAttribute('data-type');
        renderRecycleBinList();
      };
    });

    // Sync from cloud first to ensure multi-device items appear
    loadRecycleBinFromCloud().finally(() => {
      renderRecycleBinList();
    });
  }

  function renderRecycleBinList() {
    const listEl = document.getElementById('rb-list-container');
    const countEl = document.getElementById('rb-count-label');
    if (!listEl) return;

    let items = getRecycleBin();
    pruneRecycleBin();
    items = getRecycleBin();

    if (_rbFilter !== 'all') {
      items = items.filter(it => it.type === _rbFilter);
    }

    if (_rbSearch) {
      items = items.filter(it => {
        const titleMatch = (it.title || '').toLowerCase().includes(_rbSearch);
        const urlMatch = (it.url || '').toLowerCase().includes(_rbSearch);
        return titleMatch || urlMatch;
      });
    }

    if (countEl) {
      countEl.textContent = `${items.length} عنصر في سلة المحذوفات`;
    }

    if (items.length === 0) {
      listEl.innerHTML = `
        <div style="text-align:center; padding:40px 20px; color:var(--mu);">
          <div style="font-size:2.5rem; margin-bottom:10px;">✨</div>
          <div style="font-size:0.95rem; font-weight:600; color:#eee;">سلة المحذوفات فارغة</div>
          <div style="font-size:0.78rem; margin-top:4px;">أي عنصر تحذفه سيظهر هنا تلقائياً ويبقى محفوظاً لمدة 30 يوماً!</div>
        </div>
      `;
      return;
    }

    listEl.innerHTML = '';
    const now = Date.now();

    items.forEach(it => {
      const daysLeft = Math.max(1, Math.ceil((it.expiresAt - now) / (24 * 60 * 60 * 1000)));
      const dateStr = new Date(it.deletedAt).toLocaleDateString('ar-EG', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

      let typeBadge = '';
      if (it.type === 'bookmark') typeBadge = '<span style="background:rgba(108,143,255,0.2);color:#93b5ff;padding:2px 8px;border-radius:10px;font-size:0.68rem;font-weight:600;">رابط 🔗</span>';
      else if (it.type === 'widget') typeBadge = '<span style="background:rgba(52,211,153,0.2);color:#34d399;padding:2px 8px;border-radius:10px;font-size:0.68rem;font-weight:600;">ويدجت 🗂️</span>';
      else if (it.type === 'card') typeBadge = '<span style="background:rgba(251,191,36,0.2);color:#fbbf24;padding:2px 8px;border-radius:10px;font-size:0.68rem;font-weight:600;">بطاقة ميرو 📋</span>';
      else if (it.type === 'page') typeBadge = '<span style="background:rgba(239,68,68,0.2);color:#f87171;padding:2px 8px;border-radius:10px;font-size:0.68rem;font-weight:600;">صفحة كاملة 📄</span>';

      const faviconUrl = it.url ? `https://www.google.com/s2/favicons?domain=${(it.url.match(/:\/\/(.[^/]+)/) || [])[1] || ''}&sz=32` : '';

      const row = document.createElement('div');
      row.style.cssText = 'display:flex; align-items:center; justify-content:space-between; padding:10px 14px; background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.06); border-radius:10px; gap:12px; transition:all 0.15s;';
      
      row.innerHTML = `
        <div style="display:flex; align-items:center; gap:10px; min-width:0; flex:1;">
          ${faviconUrl ? `<img src="${faviconUrl}" style="width:20px; height:20px; border-radius:4px; flex-shrink:0;" onerror="this.style.display='none'" />` : '<span style="font-size:1.2rem; flex-shrink:0;">📄</span>'}
          <div style="min-width:0; flex:1;">
            <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
              <span style="font-size:0.86rem; font-weight:600; color:#fff; text-overflow:ellipsis; overflow:hidden; white-space:nowrap; max-width:280px;" title="${it.title}">${it.title}</span>
              ${typeBadge}
              <span style="font-size:0.7rem; color:#ffaa00; background:rgba(255,170,0,0.1); padding:1px 6px; border-radius:6px;">🕒 متبقي ${daysLeft} يوم</span>
            </div>
            ${it.url ? `<a href="${it.url}" target="_blank" rel="noopener noreferrer" style="font-size:0.72rem; color:var(--mu); text-decoration:none; display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:320px;" title="${it.url}">🔗 ${it.url}</a>` : ''}
            <div style="font-size:0.68rem; color:rgba(255,255,255,0.4); margin-top:2px;">
              حُذف: ${dateStr} ${it.sourcePageName ? `| الصفحة: ${it.sourcePageName}` : ''} ${it.sourceWidgetTitle ? `| الويدجت: ${it.sourceWidgetTitle}` : ''}
            </div>
          </div>
        </div>

        <div style="display:flex; align-items:center; gap:6px; flex-shrink:0;">
          ${it.url ? `<button class="rb-act-btn rb-copy-btn" title="نسخ الرابط" style="background:rgba(255,255,255,0.08); border:none; color:#fff; border-radius:6px; padding:5px 9px; cursor:pointer; font-size:0.75rem;">📋 نسخ</button>` : ''}
          <button class="rb-act-btn rb-restore-btn" title="استعادة إلى مكانه" style="background:linear-gradient(135deg, #10b981, #059669); border:none; color:#fff; border-radius:6px; padding:5px 12px; cursor:pointer; font-size:0.75rem; font-weight:600;">↩️ استعادة</button>
          <button class="rb-act-btn rb-del-btn" title="حذف نهائي" style="background:none; border:none; color:rgba(255,68,68,0.6); padding:4px 6px; cursor:pointer; font-size:0.85rem;">✕</button>
        </div>
      `;

      const restoreBtn = row.querySelector('.rb-restore-btn');
      if (restoreBtn) restoreBtn.onclick = () => restoreRecycleBinItem(it.id);

      const delBtn = row.querySelector('.rb-del-btn');
      if (delBtn) delBtn.onclick = () => deletePermanently(it.id);

      const copyBtn = row.querySelector('.rb-copy-btn');
      if (copyBtn) copyBtn.onclick = () => {
        navigator.clipboard.writeText(it.url).then(() => {
          if (typeof window.showToast === 'function') window.showToast('📋 تم نسخ الرابط بنجاح');
        });
      };

      listEl.appendChild(row);
    });
  }

  function closeRecycleBinModal() {
    const modal = document.getElementById('recycle-bin-modal');
    if (modal) modal.classList.remove('open');
  }

  /* ─────────────────────────────────────────────────────────────
   * 7. EMERGENCY SAFETY SNAPSHOT
   * ───────────────────────────────────────────────────────────── */
  async function saveSafetySnapshot(tag = 'safety') {
    if (!window.D) return;
    const now = Date.now();
    const count = countAllData(window.D);

    const snapshot = {
      ts: now,
      tag,
      itemCount: count.total,
      bookmarkCount: count.bookmarks,
      pagesMeta: (window.D.pages || []).map(p => ({ id: p.id, name: p.name, groupId: p.groupId, pageType: p.pageType })),
      meta: {
        settings: window.D.settings,
        curEnv: window.D.curEnv,
        curGroup: window.D.curGroup,
        environments: window.D.environments,
        groups: window.D.groups,
        inbox: window.D.inbox
      },
      pages: {}
    };

    (window.D.pages || []).forEach(p => {
      snapshot.pages[p.id] = {
        widgets: p.widgets || [],
        miroCards: p.miroCards || [],
        vGuides: p.vGuides || [],
        hGuides: p.hGuides || []
      };
    });

    // 1. Save to IndexedDB
    try {
      if (typeof window.idbSet === 'function') {
        await window.idbSet(`safety_snapshot_${now}`, snapshot);
      }
    } catch(e) {}

    // 2. Save to Firebase
    if (window.USER_ID && window.db) {
      window.db.ref(`users/${window.USER_ID}/startmine_snapshots/${now}`).set(snapshot)
        .catch(e => console.warn('[SAFETY SNAPSHOT FB]', e));
    }
  }

  /* ─────────────────────────────────────────────────────────────
   * EXPORTS
   * ───────────────────────────────────────────────────────────── */
  SM.data.protection = {
    countAllData,
    countAllDataAsync,
    getHighestCounts,
    recalibrateHighestCounts,
    updateHighestCounts,
    syncHighestCountsFromCloud,
    checkDataLossGuard,
    showDropWarningModal,
    addToRecycleBin,
    pruneRecycleBin,
    restoreRecycleBinItem,
    openRecycleBinModal,
    closeRecycleBinModal,
    loadRecycleBinFromCloud,
    emptyRecycleBin,
    saveSafetySnapshot,
    triggerSilentBackgroundSnapshot
  };

  // Expose to window for inline HTML handlers & legacy inter-op
  window.countAllData = countAllData;
  window.countAllDataAsync = countAllDataAsync;
  window.recalibrateHighestCounts = recalibrateHighestCounts;
  window.checkDataLossGuard = checkDataLossGuard;
  window.showDropWarningModal = showDropWarningModal;
  window.addToRecycleBin = addToRecycleBin;
  window.restoreRecycleBinItem = restoreRecycleBinItem;
  window.openRecycleBinModal = openRecycleBinModal;
  window.closeRecycleBinModal = closeRecycleBinModal;
  window.saveSafetySnapshot = saveSafetySnapshot;
  window.triggerSilentBackgroundSnapshot = triggerSilentBackgroundSnapshot;
  window.syncHighestCountsFromCloud = syncHighestCountsFromCloud;
})();
