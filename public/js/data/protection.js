/**
 * @module Protection
 * @description Advanced Zero-Data-Loss Protection, Drop Interceptor, Cloud Item Tracker, and 30-Day Recycle Bin
 * @namespace SM.data.protection
 * @depends namespace.js, events.js, utils.js, firebase.js
 * @provides window.countAllData, window.checkDataLossGuard, window.showDropWarningModal, window.addToRecycleBin, window.restoreRecycleBinItem, window.openRecycleBinModal, window.closeRecycleBinModal, window.saveSafetySnapshot, window.recalibrateHighestCounts
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
  window._initialSyncCompleted = false;
  window._userConfirmedDataLoss = false;
  window._activeWarningResolve = null;

  /* ─────────────────────────────────────────────────────────────
   * 1. ACCURATE ITEM & BOOKMARK COUNTER (DUAL-VIEW DEDUPLICATED)
   * ───────────────────────────────────────────────────────────── */
  function countAllData(source) {
    const d = source || window.D;
    if (!d) return { bookmarks: 0, widgets: 0, widgetItems: 0, cards: 0, pages: 0, inbox: 0, total: 0, rawCombinedBm: 0 };

    let totalBookmarks = 0;
    let totalWidgets = 0;
    let totalWidgetItems = 0;
    let totalCards = 0;
    let rawCombinedBm = 0;

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
      rawCombinedBm
    };
  }

  /* ─────────────────────────────────────────────────────────────
   * 2. GOLDEN RECORD TRACKING (LOCAL + CLOUD) & RECALIBRATION
   * ───────────────────────────────────────────────────────────── */
  function getHighestCounts() {
    let bm = parseInt(localStorage.getItem(LS_KEY_HIGHEST_BM) || '0', 10);
    let total = parseInt(localStorage.getItem(LS_KEY_HIGHEST_TOTAL) || '0', 10);
    if (window._cloudStats) {
      if (window._cloudStats.highestBookmarks && window._cloudStats.highestBookmarks > bm) {
        bm = window._cloudStats.highestBookmarks;
      }
      if (window._cloudStats.highestTotal && window._cloudStats.highestTotal > total) {
        total = window._cloudStats.highestTotal;
      }
    }

    // Auto-recalibrate if highest was inflated by v274 dual-view doubling
    if (window.D && bm > 0) {
      const live = countAllData(window.D);
      if (live.bookmarks > 0) {
        const isInflatedDouble = (live.rawCombinedBm > 0 && Math.abs(bm - live.rawCombinedBm) <= 30) ||
                                 (Math.abs(bm - (live.bookmarks * 2)) <= 30);
        if (isInflatedDouble && live.bookmarks >= 20) {
          console.warn(`[DATA LOSS GUARD 🔄] Auto-recalibrating inflated dual-view baseline: was ${bm}, corrected to ${live.bookmarks}`);
          bm = live.bookmarks;
          total = live.total;
          try {
            localStorage.setItem(LS_KEY_HIGHEST_BM, String(bm));
            localStorage.setItem(LS_KEY_HIGHEST_TOTAL, String(total));
          } catch(e) {}
          if (window._cloudStats) {
            window._cloudStats.highestBookmarks = bm;
            window._cloudStats.highestTotal = total;
          }
          if (window.USER_ID && window.db) {
            window.db.ref(`users/${window.USER_ID}/startmine_meta/stats`).update({
              highestBookmarks: bm,
              highestTotal: total,
              lastUpdated: Date.now()
            }).catch(e => console.warn('[STATS CLOUD UPDATE]', e));
          }
        }
      }
    }

    return { bookmarks: bm, total: total };
  }

  function recalibrateHighestCounts(newBm, newTotal) {
    let bm = typeof newBm === 'number' ? newBm : 0;
    let total = typeof newTotal === 'number' ? newTotal : 0;
    if (!bm && window.D) {
      const counts = countAllData(window.D);
      bm = counts.bookmarks;
      total = counts.total;
    }
    try {
      localStorage.setItem(LS_KEY_HIGHEST_BM, String(bm));
      localStorage.setItem(LS_KEY_HIGHEST_TOTAL, String(total));
    } catch(e) {}
    if (window._cloudStats) {
      window._cloudStats.highestBookmarks = bm;
      window._cloudStats.highestTotal = total;
    }
    if (window.USER_ID && window.db) {
      window.db.ref(`users/${window.USER_ID}/startmine_meta/stats`).update({
        highestBookmarks: bm,
        highestTotal: total,
        lastUpdated: Date.now()
      }).catch(e => console.warn('[RECALIBRATE STATS FB]', e));
    }
    console.log(`[PROTECTION] Golden bookmark baseline recalibrated to ${bm} (Total: ${total})`);
    return { bookmarks: bm, total: total };
  }

  function updateHighestCounts(counts) {
    if (!counts) return;
    const current = getHighestCounts();
    const newBm = Math.max(current.bookmarks, counts.bookmarks || 0);
    const newTotal = Math.max(current.total, counts.total || 0);

    try {
      localStorage.setItem(LS_KEY_HIGHEST_BM, String(newBm));
      localStorage.setItem(LS_KEY_HIGHEST_TOTAL, String(newTotal));
    } catch(e) {}

    if (window.USER_ID && window.db && (newBm > current.bookmarks || newTotal > current.total)) {
      const stats = {
        highestBookmarks: newBm,
        highestTotal: newTotal,
        lastBookmarks: counts.bookmarks || 0,
        lastTotal: counts.total || 0,
        lastUpdated: Date.now(),
        lastBrowser: (navigator.userAgent || '').slice(0, 120)
      };
      window._cloudStats = stats;
      window.db.ref(`users/${window.USER_ID}/startmine_meta/stats`).set(stats).catch(e => console.warn('[STATS CLOUD UPDATE]', e));
    }
  }

  function syncHighestCountsFromCloud(cloudStats) {
    if (!cloudStats) return;
    window._cloudStats = cloudStats;
    let localBm = parseInt(localStorage.getItem(LS_KEY_HIGHEST_BM) || '0', 10);
    let localTotal = parseInt(localStorage.getItem(LS_KEY_HIGHEST_TOTAL) || '0', 10);

    let cloudBm = cloudStats.highestBookmarks || 0;
    let cloudTotal = cloudStats.highestTotal || 0;

    // Check if cloud was also inflated by v274 doubling
    if (window.D && cloudBm > 0) {
      const live = countAllData(window.D);
      if (live.bookmarks > 0) {
        const isInflatedDouble = (live.rawCombinedBm > 0 && Math.abs(cloudBm - live.rawCombinedBm) <= 30) ||
                                 (Math.abs(cloudBm - (live.bookmarks * 2)) <= 30);
        if (isInflatedDouble && live.bookmarks >= 20) {
          cloudBm = live.bookmarks;
          cloudTotal = live.total;
          window._cloudStats.highestBookmarks = cloudBm;
          window._cloudStats.highestTotal = cloudTotal;
        }
      }
    }

    if (cloudBm > localBm) {
      localBm = cloudBm;
      try { localStorage.setItem(LS_KEY_HIGHEST_BM, String(localBm)); } catch(e) {}
    }
    if (cloudTotal > localTotal) {
      localTotal = cloudTotal;
      try { localStorage.setItem(LS_KEY_HIGHEST_TOTAL, String(localTotal)); } catch(e) {}
    }
  }

  /* ─────────────────────────────────────────────────────────────
   * 3. ZERO-DATA-LOSS DROP INTERCEPTOR
   * ───────────────────────────────────────────────────────────── */
  async function checkDataLossGuard(targetData, operationName = 'Save', options = {}) {
    // Prevent saves before initial cloud download completes
    if (!window._initialSyncCompleted && !options.force) {
      console.warn(`[DATA LOSS GUARD ⛔] ${operationName} blocked: Initial cloud sync not yet completed.`);
      return false;
    }

    if (window._userConfirmedDataLoss) {
      window._userConfirmedDataLoss = false;
      return true;
    }

    const candidate = countAllData(targetData || window.D);
    const highest = getHighestCounts();
    const currentLive = countAllData(window.D);

    const baselineBm = Math.max(highest.bookmarks, currentLive.bookmarks);
    const baselineTotal = Math.max(highest.total, currentLive.total);

    const bmDrop = baselineBm - candidate.bookmarks;
    const totalDrop = baselineTotal - candidate.total;

    // Detect dangerous loss:
    // 1. Total wipeout: bookmarks drop to near 0 while baseline had substantial bookmarks
    // 2. Massive bookmark drop: >15% drop AND losing 25+ bookmarks at once
    // 3. Massive total items drop: >20% drop AND losing 40+ total items at once
    const isWipeout = (baselineBm >= 20 && candidate.bookmarks <= 5);
    const isMassiveBmDrop = (baselineBm >= 20 && bmDrop >= 25 && candidate.bookmarks < Math.floor(baselineBm * 0.85));
    const isMassiveTotalDrop = (baselineTotal >= 30 && totalDrop >= 40 && candidate.total < Math.floor(baselineTotal * 0.80));

    const isDangerousLoss = isWipeout || isMassiveBmDrop || isMassiveTotalDrop;

    if (isDangerousLoss) {
      console.warn(`[DATA LOSS GUARD 🚨] ${operationName} detected drop! Baseline: ${baselineBm} bookmarks (${baselineTotal} items) vs Target: ${candidate.bookmarks} bookmarks (${candidate.total} items). Drop: -${bmDrop}`);

      // Auto-save emergency safety snapshot
      try {
        saveSafetySnapshot(`pre_drop_${operationName}_${Date.now()}`);
      } catch(e) { console.warn('[SAFETY SNAPSHOT]', e); }

      const userConfirmed = await showDropWarningModal({
        operationName,
        baselineBm,
        baselineTotal,
        candidateBm: candidate.bookmarks,
        candidateTotal: candidate.total,
        bmDrop,
        totalDrop
      });

      if (userConfirmed === true) {
        window._userConfirmedDataLoss = true;
        return true;
      } else {
        console.warn(`[DATA LOSS GUARD 🛡️] Operation "${operationName}" cancelled by user to protect data.`);
        return false;
      }
    }

    // Normal growth or safe state -> record highest counts
    updateHighestCounts(candidate);
    return true;
  }

  /* ─────────────────────────────────────────────────────────────
   * 4. OVERRIDE WARNING & CONFIRMATION MODAL
   * ───────────────────────────────────────────────────────────── */
  function showDropWarningModal(params) {
    return new Promise((resolve) => {
      window._activeWarningResolve = resolve;

      let modal = document.getElementById('m-override-warning');
      if (!modal) {
        modal = document.createElement('div');
        modal.id = 'm-override-warning';
        modal.className = 'mo';
        modal.style.zIndex = '999999';
        document.body.appendChild(modal);
      }

      const diffBm = params.bmDrop > 0 ? `-${params.bmDrop}` : '0';
      const pctDrop = params.baselineBm > 0 ? Math.round((params.bmDrop / params.baselineBm) * 100) : 0;

      modal.innerHTML = `
        <div class="mc wide" dir="rtl" style="direction: rtl; text-align: right; border: 2px solid #ff4444; box-shadow: 0 25px 80px rgba(255, 68, 68, 0.25); max-width: 620px; background: rgba(20, 22, 34, 0.98); color: #fff; font-family: var(--font);">
          <div style="display:flex; align-items:center; gap:12px; margin-bottom:14px; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:12px;">
            <span style="font-size:2rem; filter: drop-shadow(0 0 10px #ff4444);">🚨</span>
            <div>
              <h3 style="margin:0; font-size:1.25rem; color:#ff6b6b; font-weight:700;">تحذير أمان مشدد: رصد انخفاض في عدد المواقع!</h3>
              <p style="margin:2px 0 0 0; font-size:0.78rem; color:var(--mu);">تم إيقاف عملية (${params.operationName}) تلقائياً لمنع ضياع أي بيانات</p>
            </div>
          </div>

          <div style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap:10px; margin-bottom:16px;">
            <div style="background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.08); border-radius:12px; padding:12px 10px; text-align:center;">
              <div style="font-size:0.75rem; color:var(--mu); margin-bottom:4px;">📦 النسخة السابقة / المسجلة</div>
              <div style="font-size:1.6rem; font-weight:800; color:#6c8fff;">${params.baselineBm.toLocaleString()}</div>
              <div style="font-size:0.7rem; color:#93b5ff;">رابط وموقع</div>
            </div>

            <div style="background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.08); border-radius:12px; padding:12px 10px; text-align:center;">
              <div style="font-size:0.75rem; color:var(--mu); margin-bottom:4px;">⚠️ النسخة المستهدفة للحفظ</div>
              <div style="font-size:1.6rem; font-weight:800; color:#ffd166;">${params.candidateBm.toLocaleString()}</div>
              <div style="font-size:0.7rem; color:#ffeaa7;">رابط وموقع</div>
            </div>

            <div style="background:rgba(255, 68, 68, 0.1); border:1px solid rgba(255, 68, 68, 0.3); border-radius:12px; padding:12px 10px; text-align:center;">
              <div style="font-size:0.75rem; color:#ff8585; margin-bottom:4px;">❌ الفارق / النقص المحتمل</div>
              <div style="font-size:1.6rem; font-weight:800; color:#ff4444;">${diffBm}</div>
              <div style="font-size:0.7rem; color:#ff8585;">فقدان ${pctDrop}% من مكتبتك</div>
            </div>
          </div>

          <div style="background:rgba(255, 170, 0, 0.08); border-right:4px solid #ffaa00; padding:10px 14px; border-radius:6px; font-size:0.82rem; line-height:1.5; color:#f1f2f6; margin-bottom:18px;">
            <b>لماذا يظهر هذا التحذير؟</b><br>
            الموقع رصد أن النسخة التي تحاول حفظها أو مزامنتها تحتوي على عدد مواقع أقل بكثير. هذا يحدث عادة إذا فُتح الموقع من متصفح آخر كان الكاش فيه فارغاً أو قديماً. استبدال البيانات سيؤدي إلى فقدان ${params.bmDrop} رابط فوراً!
          </div>

          <div style="display:flex; flex-direction:column; gap:8px;">
            <button id="btn-drop-cancel" class="btn" style="background:linear-gradient(135deg, #10b981, #059669); color:#fff; font-weight:700; padding:12px; border-radius:10px; border:none; cursor:pointer; font-size:0.9rem; box-shadow:0 4px 15px rgba(16,185,129,0.3);">
              🛡️ إلغاء الحفظ فوراً وحماية النسخة الكبيرة (${params.baselineBm} رابط) — موصى به
            </button>

            <button id="btn-drop-restore-cloud" class="btn" style="background:rgba(108,143,255,0.15); border:1px solid rgba(108,143,255,0.4); color:#93b5ff; padding:10px; border-radius:10px; cursor:pointer; font-size:0.82rem;">
              🔄 سحب أحدث نسخة سحابية كاملة من Firebase / Snapshots
            </button>

            <div style="display:flex; gap:8px; margin-top:4px;">
              <button id="btn-drop-recalibrate" class="btn" style="flex:1; background:rgba(255, 209, 102, 0.15); border:1px solid rgba(255,209,102,0.4); color:#ffd166; padding:9px; border-radius:10px; cursor:pointer; font-size:0.78rem;">
                ⚖️ معايرة العداد (الروابط سليمة ومكررة في Miro)
              </button>
              <button id="btn-drop-confirm-deliberate" class="btn" style="flex:1; background:rgba(255, 68, 68, 0.15); border:1px solid rgba(255,68,68,0.4); color:#ff7b7b; padding:9px; border-radius:10px; cursor:pointer; font-size:0.78rem;">
                ⚠️ أؤكد الحذف بنفسي (أنا من قمت بحذف هذه الروابط عمداً)
              </button>
            </div>
          </div>
        </div>
      `;

      modal.classList.add('open');

      const closeWith = (val) => {
        modal.classList.remove('open');
        if (window._activeWarningResolve) {
          window._activeWarningResolve(val);
          window._activeWarningResolve = null;
        }
      };

      document.getElementById('btn-drop-cancel').onclick = () => {
        if (typeof window.showToast === 'function') {
          window.showToast(`🛡️ تم إيقاف الاستبدال وحماية مكتبتك (${params.baselineBm} رابط)`, 6000);
        }
        closeWith(false);
      };

      document.getElementById('btn-drop-restore-cloud').onclick = () => {
        closeWith(false);
        if (typeof window.openSnapshotModal === 'function') {
          window.openSnapshotModal();
        } else if (typeof window.syncNow === 'function') {
          window.syncNow();
        }
      };

      const recalibrateBtn = document.getElementById('btn-drop-recalibrate');
      if (recalibrateBtn) {
        recalibrateBtn.onclick = () => {
          recalibrateHighestCounts(params.candidateBm, params.candidateTotal);
          if (typeof window.showToast === 'function') {
            window.showToast(`✅ تم إعادة معايرة عداد المواقع بنجاح (${params.candidateBm} رابط)!`, 4000);
          }
          closeWith(true);
        };
      }

      document.getElementById('btn-drop-confirm-deliberate').onclick = () => {
        const sure = confirm(`تأكيد نهائي صارم:\nهل أنت متأكد تماماً من رغبتك في حذف ${params.bmDrop} رابط واستبدال النسخة بـ (${params.candidateBm}) فقط؟`);
        if (sure) {
          // Take snapshot before deliberate drop anyway!
          try { saveSafetySnapshot('deliberate_override_' + Date.now()); } catch(e) {}
          closeWith(true);
        }
      };
    });
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
    saveSafetySnapshot
  };

  // Expose to window for inline HTML handlers & legacy inter-op
  window.countAllData = countAllData;
  window.recalibrateHighestCounts = recalibrateHighestCounts;
  window.checkDataLossGuard = checkDataLossGuard;
  window.showDropWarningModal = showDropWarningModal;
  window.addToRecycleBin = addToRecycleBin;
  window.restoreRecycleBinItem = restoreRecycleBinItem;
  window.openRecycleBinModal = openRecycleBinModal;
  window.closeRecycleBinModal = closeRecycleBinModal;
  window.saveSafetySnapshot = saveSafetySnapshot;
  window.syncHighestCountsFromCloud = syncHighestCountsFromCloud;
})();
