/**
 * @module App
 * @description Main application entry point. Initializes DB, handles primary UI rendering.
 * @namespace SM
 * @depends All other modules (must load last)
 * @provides window.renderAll, window.buildCols, window.saveAllBackups, window.openSnapshotModal
 * @safety NEVER create duplicate function declarations here that override window aliases.
 */
console.log('[APP.JS] ✅ Loaded at', new Date().toISOString());
// Firebase initialization and token logic moved to js/data/firebase.js

const ENGINES = [
  { k: 'bm', ic: '🔖', name: 'Bookmarks (local)', url: '' },
  { k: 'g', ic: '🔍', name: 'Google', url: 'https://www.google.com/search?q=' },
  { k: 'dd', ic: '🦆', name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=' },
  { k: 'bi', ic: '🔷', name: 'Bing', url: 'https://bing.com/search?q=' },
  { k: 'br', ic: '🦁', name: 'Brave', url: 'https://search.brave.com/search?q=' },
  { k: 'yt', ic: '▶️', name: 'YouTube', url: 'https://youtube.com/results?search_query=' },
];
const SWATCHES = [
  '#ff0000',
  '#00ff00',
  '#0000ff',
  '#ffff00',
  '#ff00ff',
  '#00ffff',
  '#000000',
  '#ffffff',
  '#6c8fff',
  '#e8c97a',
  '#7ed4a4',
  '#ff8fa3',
  '#c4a0ff',
  '#ff9f6b',
  '#4dd0e1',
  '#f06292',
];
const TAB_COLORS = [
  '#ff0000',
  '#00ff00',
  '#0000ff',
  '#ffff00',
  '#ff00ff',
  '#00ffff',
  '#000000',
  '#ffffff',
  '#6c8fff',
  '#e8c97a',
  '#7ed4a4',
  '#ff8fa3',
  '#c4a0ff',
  '#ff9f6b',
  '#4dd0e1',
  '#f06292',
  '#90caf9',
  '#a5d6a7',
];
function isPagePayloadEqual(p1, p2) {
  if (!p1 || !p2) return false;
  const fields = [
    'widgets', 'miroCards', 'vGuides', 'hGuides', '_guidesMode', 'lockedGuides',
    'cellStates', 'mergedCells', 'customCells', 'cellGuides', '_layoutGuidesMode',
    'gridRows', 'gridCols', 'cellPages', 'slicerColSizes', 'slicerRowSizes'
  ];
  for (const f of fields) {
    const v1 = JSON.stringify(p1[f] || (f === 'cellStates' ? {} : (f === '_guidesMode' || f === '_layoutGuidesMode' ? false : [])));
    const v2 = JSON.stringify(p2[f] || (f === 'cellStates' ? {} : (f === '_guidesMode' || f === '_layoutGuidesMode' ? false : [])));
    if (v1 !== v2) return false;
  }
  return true;
}
window.isPagePayloadEqual = isPagePayloadEqual;
const DEF_COLOR = { r: 255, g: 255, b: 255, a: 0.94 };
const BG_SOLID_SWATCHES = [
  '#ffffff',
  '#f5f5f5',
  '#e0e0e0',
  '#ff0000',
  '#00ff00',
  '#0000ff',
  '#ffff00',
  '#ff00ff',
  '#00ffff',
  '#000000',
  '#0d0f18',
  '#0f172a',
  '#1a0a2e',
  '#0a1f2e',
  '#1a1200',
  '#0d1a10',
  '#1e1b2e',
  '#2d1b2e',
  '#0a0a0a',
  '#1a1a2e',
  '#16213e',
  '#0f3460',
  '#1a2a1a',
  '#2a1a1a',
  '#1a2a2a',
  '#2a2a1a',
];

const BG_GRADIENTS = [
  'linear-gradient(135deg,#0d0f18 0%,#1a1040 100%)',
  'linear-gradient(135deg,#0f172a 0%,#1e3a5f 100%)',
  'linear-gradient(135deg,#1a0a2e 0%,#0d0f18 50%,#0a1f2e 100%)',
  'linear-gradient(180deg,#0d0f18 0%,#1a2a1a 100%)',
  'linear-gradient(135deg,#0d0f18 0%,#2a1a1a 100%)',
  'radial-gradient(ellipse at top,#1a1040 0%,#0d0f18 70%)',
  'radial-gradient(ellipse at bottom,#0a1f2e 0%,#0d0f18 70%)',
  'linear-gradient(135deg,#0a0a0a 0%,#1a1a2e 100%)',
  'linear-gradient(160deg,#0d0f18 0%,#16213e 50%,#0f3460 100%)',
];

window.DEF = {
  settings: { engine: 'bm', accent: '#6c8fff' },
  cur: 'p0',
  curEnv: 'e0',
  curGroup: 'g0',
  environments: [{ id: 'e0', name: 'Main Env' }],
  groups: [{ id: 'g0', name: 'Main Group', envId: 'e0' }],
  inbox: [],
  pages: [
    {
      id: 'p0',
      groupId: 'g0',
      name: 'Home',
      pageType: 'miro',
      miroCards: [],
      zoom: 100,
      panX: 0,
      panY: 0,
      bg: '',
      bgType: 'none',
      widgets: [],
    },
  ],
};

window.D = JSON.parse(JSON.stringify(window.DEF));
window.pColIdx = null;
window.pWidId = null;
window.renWid = null;
window.colWid = null;
window.dispWid = null;
let dragWid = null,
  pvTimer = null,
  _skipColor = false,
  tcPid = null;
window._bgTempType = 'solid';
window._bgTempValue = '';
window.isFirstLoad = true;
window._svTimer = null;
window._lastSyncedPageData = null;
window._lastSyncedPagesMetaStr = null;
window._lastSyncedMetaStr = null;
window._pendingDeletePageIds = [];

/* ─── Offline Mode Stubs ─── */
function setOfflineMode(val) { return window.SM.data.setOfflineMode(val); }
function updateOfflineUI() { return window.SM.data.updateOfflineUI(); }
function markDirtyOffline() { return window.SM.data.markDirtyOffline(); }
function toggleOfflineMode() { return window.SM.data.toggleOfflineMode(); }
function detachAllListeners() { return window.SM.data.detachAllListeners(); }

function syncNow() {
  return window.SM.data.syncNow();
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

// ─── IndexedDB (primary page cache — much larger than localStorage) ───
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

// ─── Safe Page Data Cache (writes to BOTH IndexedDB + localStorage with verification) ───
function cachePageDataSafe(pid, data) {
  const itemCount = (data.widgets || []).length + (data.miroCards || []).length;
  let lsOk = false;
  // 1. Try localStorage (fast, synchronous)
  try {
    const json = JSON.stringify(data);
    localStorage.setItem(lsPageKey(pid), json);
    // Verify write
    const verify = localStorage.getItem(lsPageKey(pid));
    lsOk = (verify && verify.length === json.length);
    if (!lsOk) console.error(`[CACHE LS VERIFY FAIL] Page ${pid} — written ${json.length} chars, read back ${verify ? verify.length : 0}`);
  } catch (e) {
    console.error(`[CACHE LS FAIL] Page ${pid} — ${e.message}`);
    lsOk = false;
  }
  // 2. Always write to IndexedDB (async, much larger limit)
  idbSet('page_' + pid, data).then(ok => {
    if (!ok) console.error(`[CACHE IDB FAIL] Page ${pid}`);
  });
  if (!lsOk && itemCount > 0) {
    console.warn(`[CACHE WARNING] Page ${pid} has ${itemCount} items but localStorage write FAILED. IndexedDB is backup.`);
    if (typeof showToast === 'function') showToast('⚠️ Storage nearly full — data safe in backup cache', 4000);
  }
  return lsOk;
}

// Legacy compat wrapper
function cachePageData(pid, data) {
  cachePageDataSafe(pid, data);
}

// ─── Read from IndexedDB first, fallback to localStorage ───
async function getCachedPageDataAsync(pid) {
  // Try IndexedDB first (more reliable, larger)
  const idbData = await idbGet('page_' + pid);
  if (idbData) return idbData;
  // Fallback to localStorage
  return getCachedPageDataSync(pid);
}
function getCachedPageDataSync(pid) {
  try { return JSON.parse(localStorage.getItem(lsPageKey(pid))); } catch (e) { return null; }
}
// Keep sync version as default for backward compat 
function getCachedPageData(pid) { return getCachedPageDataSync(pid); }

// ─── Storage Usage Monitor ───
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
  const max = 5 * 1024 * 1024; // ~5MB typical
  return { used, max, pct: Math.round(used / max * 100) };
}

// ═══════════════════════════════════════════════════════════════
// ██  LAYER 6: beforeunload — verify ALL data is cached before tab closes  ██
// ═══════════════════════════════════════════════════════════════
window.addEventListener('beforeunload', () => {
  // Emergency: cache EVERY page that has data in memory
  if (typeof D !== 'undefined' && D.pages) {
    D.pages.forEach(p => {
      const wc = (p.widgets || []).length;
      const mc = (p.miroCards || []).length;
      const hc = (p.vGuides || []).length + (p.hGuides || []).length + (p.customCells || []).length;
      if (wc > 0 || mc > 0 || hc > 0 || p._guidesMode || p.pageType === 'slicer') {
        const payload = {
          widgets: p.widgets || [],
          miroCards: p.miroCards || [],
          vGuides: p.vGuides || [],
          hGuides: p.hGuides || [],
          _guidesMode: p._guidesMode || false,
          lockedGuides: p.lockedGuides || [],
          cellStates: p.cellStates || {},
          mergedCells: p.mergedCells || [],
          customCells: p.customCells || [],
          ts: p.ts || Date.now(),
          gridRows: p.gridRows || null,
          gridCols: p.gridCols || null,
          cellPages: p.cellPages || null,
          slicerColSizes: p.slicerColSizes || null,
          slicerRowSizes: p.slicerRowSizes || null
        };
        try {
          localStorage.setItem(lsPageKey(p.id), JSON.stringify(payload));
        } catch(e) { /* localStorage full, IDB already has it */ }
        // IndexedDB async — browser WILL finish this even after tab close
        idbSet('page_' + p.id, payload);
      }
    });
  }
});

// ═══════════════════════════════════════════════════════════════
// ██  LAYER 7: Auto-Snapshot — full backup to IndexedDB every 15 min  ██
// ═══════════════════════════════════════════════════════════════
let _lastSnapshotTime = 0;
function autoSnapshot() {
  if (!USER_ID || typeof D === 'undefined') return;
  const now = Date.now();
  if (now - _lastSnapshotTime < 15 * 60 * 1000) return; // Skip if < 15 min
  _lastSnapshotTime = now;
  
  const snapshot = {
    timestamp: now,
    userId: USER_ID,
    meta: { settings: D.settings, curEnv: D.curEnv, curGroup: D.curGroup, environments: D.environments, groups: D.groups },
    pagesMeta: D.pages.map(p => ({ id: p.id, name: p.name, groupId: p.groupId, pageType: p.pageType })),
    activePage: D.cur,
    pages: {}
  };
  
  // Save ALL pages: from memory + cache
  D.pages.forEach(p => {
    const wc = (p.widgets || []).length;
    const mc = (p.miroCards || []).length;
    const hc = (p.vGuides || []).length + (p.hGuides || []).length + (p.customCells || []).length;
    if (wc > 0 || mc > 0 || hc > 0 || p._guidesMode || p.pageType === 'slicer') {
      snapshot.pages[p.id] = {
        widgets: p.widgets || [],
        miroCards: p.miroCards || [],
        vGuides: p.vGuides || [],
        hGuides: p.hGuides || [],
        _guidesMode: p._guidesMode || false,
        lockedGuides: p.lockedGuides || [],
        cellStates: p.cellStates || {},
        mergedCells: p.mergedCells || [],
        customCells: p.customCells || [],
        gridRows: p.gridRows || null,
        gridCols: p.gridCols || null,
        cellPages: p.cellPages || null,
        slicerColSizes: p.slicerColSizes || null,
        slicerRowSizes: p.slicerRowSizes || null
      };
    } else {
      // Try cache
      const cached = getCachedPageData(p.id);
      if (cached && ((cached.widgets || []).length > 0 || (cached.miroCards || []).length > 0 || (cached.vGuides || []).length > 0 || (cached.hGuides || []).length > 0 || cached._guidesMode || (cached.customCells || []).length > 0 || cached.pageType === 'slicer')) {
        snapshot.pages[p.id] = cached;
      }
    }
  });
  
  // Keep last 5 snapshots (rotating)
  idbSet('snapshot_' + (now % 5), snapshot).then(() => {
    console.log(`[AUTO-SNAPSHOT ✅] Full backup saved (${Object.keys(snapshot.pages).length} pages, ${new Date(now).toLocaleTimeString()})`);
  });
}
// Run every 5 minutes (snapshot logic internally checks 15-min cooldown)
setInterval(autoSnapshot, 5 * 60 * 1000);

// ═══════════════════════════════════════════════════════════════
// ██  LAYER 8: Page Version Tracking — never go backwards  ██
// ═══════════════════════════════════════════════════════════════
const _pageVersions = {}; // { pageId: { count, timestamp } }
function trackPageVersion(pageId, widgets, miroCards) {
  const count = (widgets || []).length + (miroCards || []).length;
  _pageVersions[pageId] = { count, ts: Date.now() };
}
function isVersionRegression(pageId, newWidgets, newMiroCards) {
  const pg = typeof D !== 'undefined' && D.pages ? D.pages.find(p => p && p.id === pageId) : null;
  if (pg && pg._bypassVersionGuard) {
    console.log(`[VERSION GUARD] Bypassing regression guard for page "${pg.name}" (${pageId}) due to user action.`);
    delete pg._bypassVersionGuard;
    return false;
  }
  const prev = _pageVersions[pageId];
  if (!prev) return false; // No previous version — ok
  const newCount = (newWidgets || []).length + (newMiroCards || []).length;
  // Regression = new count is 0 while previous was > 0
  if (newCount === 0 && prev.count > 0) {
    console.error(`[VERSION GUARD ⛔] Page ${pageId}: count went from ${prev.count} → ${newCount} — REGRESSION BLOCKED!`);
    return true;
  }
  // Big drop (lost >50% of items in < 5 seconds) — suspicious
  if (newCount < prev.count * 0.5 && Date.now() - prev.ts < 5000) {
    console.error(`[VERSION GUARD ⚠️] Page ${pageId}: sudden drop from ${prev.count} → ${newCount} items in ${Date.now() - prev.ts}ms — suspicious!`);
    return true;
  }
  return false;
}

// ═══════════════════════════════════════════════════════════════
// ██  LAYER 9: Periodic Integrity Check  ██
// ═══════════════════════════════════════════════════════════════
function runIntegrityCheck() {
  if (!USER_ID || typeof D === 'undefined') return;
  const pg = typeof cp === 'function' ? cp() : null;
  if (!pg) return;
  const localW = (pg.widgets || []).length;
  const localC = (pg.miroCards || []).length;
  // Check if cache agrees with memory
  const cached = getCachedPageData(pg.id);
  if (cached) {
    const cacheW = (cached.widgets || []).length;
    const cacheC = (cached.miroCards || []).length;
    if (localW > 0 && cacheW === 0) {
      console.warn(`[INTEGRITY ⚠️] "${pg.name}": Memory has ${localW}w but cache has 0w!`);
      cachePageData(pg.id, {
        widgets: pg.widgets,
        miroCards: pg.miroCards,
        vGuides: pg.vGuides || [],
        hGuides: pg.hGuides || [],
        _guidesMode: pg._guidesMode || false,
        lockedGuides: pg.lockedGuides || [],
        cellStates: pg.cellStates || {},
        mergedCells: pg.mergedCells || [],
        customCells: pg.customCells || [],
        gridRows: pg.gridRows || null,
        gridCols: pg.gridCols || null,
        cellPages: pg.cellPages || null,
        slicerColSizes: pg.slicerColSizes || null,
        slicerRowSizes: pg.slicerRowSizes || null,
        cellGuides: pg.cellGuides || {},
        _layoutGuidesMode: pg._layoutGuidesMode || false,
        ts: pg.ts || Date.now()
      });
    }
    if (localC > 0 && cacheC === 0) {
      console.warn(`[INTEGRITY ⚠️] "${pg.name}": Memory has ${localC}c but cache has 0c!`);
      cachePageData(pg.id, {
        widgets: pg.widgets,
        miroCards: pg.miroCards,
        vGuides: pg.vGuides || [],
        hGuides: pg.hGuides || [],
        _guidesMode: pg._guidesMode || false,
        lockedGuides: pg.lockedGuides || [],
        cellStates: pg.cellStates || {},
        mergedCells: pg.mergedCells || [],
        customCells: pg.customCells || [],
        gridRows: pg.gridRows || null,
        gridCols: pg.gridCols || null,
        cellPages: pg.cellPages || null,
        slicerColSizes: pg.slicerColSizes || null,
        slicerRowSizes: pg.slicerRowSizes || null,
        cellGuides: pg.cellGuides || {},
        _layoutGuidesMode: pg._layoutGuidesMode || false,
        ts: pg.ts || Date.now()
      });
    }
  }
  // Track version
  trackPageVersion(pg.id, pg.widgets, pg.miroCards);
  // Storage capacity check
  const cap = getLsCapacity();
  if (cap.pct > 85) {
    console.warn(`[STORAGE ⚠️] localStorage ${cap.pct}% full (${(cap.used/1024).toFixed(0)}KB / ${(cap.max/1024).toFixed(0)}KB)`);
    if (cap.pct > 95 && typeof showToast === 'function') {
      showToast('⚠️ Browser storage 95%+ full — consider clearing old data', 6000);
    }
  }
}
// Run every 2 minutes
setInterval(runIntegrityCheck, 2 * 60 * 1000);

document.getElementById('login-btn').onclick = () => {
    localStorage.setItem('sm_remember_me', 'true');
    sessionStorage.removeItem('sm_auth_redirected');
    auth.signInWithPopup(provider).then((result) => {
      var cred = result.credential || (firebase.auth.GoogleAuthProvider.credentialFromResult && firebase.auth.GoogleAuthProvider.credentialFromResult(result));
      if (cred && cred.accessToken) {
        cacheGoogleToken(cred.accessToken);
      }
    }).catch((e) => {
      console.warn('[AUTH] Popup failed, trying redirect:', e.code, e.message);
      if (e.code === 'auth/popup-blocked' || e.code === 'auth/popup-closed-by-user' || e.code === 'auth/cancelled-popup-request' || e.code === 'auth/internal-error') {
        auth.signInWithRedirect(provider);
      } else {
        alert(e.message);
      }
    });
  };

  // Handle redirect result (for Edge and browsers that block popups)
  auth.getRedirectResult().then(function(result) {
    if (result && result.user) {
      localStorage.setItem('sm_remember_me', 'true');
      var cred = result.credential || (firebase.auth.GoogleAuthProvider.credentialFromResult && firebase.auth.GoogleAuthProvider.credentialFromResult(result));
      if (cred && cred.accessToken) {
        cacheGoogleToken(cred.accessToken);
      }
      sessionStorage.removeItem('sm_auth_redirected');
    }
  }).catch(function(e) {
    console.warn('[AUTH] Redirect result error:', e.code, e.message);
  });
document.getElementById('logout-btn').onclick = () => {
  localStorage.removeItem('sm_remember_me');
  sessionStorage.removeItem('sm_auth_redirected');
  auth.signOut();
};

auth.onAuthStateChanged((user) => {
  if (user) {
    USER_ID = user.uid;
    DB_REF = 'users/' + USER_ID + '/startmine_data';
    document.getElementById('user-email').textContent = '👤 ' + user.email;
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('root').style.display = 'flex';
    // Restore Google access token from cache if we don't have one
    if (!_googleAccessToken) {
      restoreGoogleToken();
    }
    
    if (SM.core.runHealthCheck) SM.core.runHealthCheck();
    initDB();
  } else {
    USER_ID = null;
    DB_REF = null;
    document.getElementById('login-screen').style.display = 'flex';
    document.getElementById('root').style.display = 'none';
    const spinner = document.getElementById('splash-spinner');
    if (spinner) spinner.style.display = 'none';
    const loginBtn = document.getElementById('login-btn');
    if (loginBtn) loginBtn.style.display = 'flex';
    db.ref().off();
  }
});

function setSyncStatus(state, msg) {
  const dot = document.getElementById('sync-dot');
  const msgEl = document.getElementById('sync-msg');
  dot.className = state;
  msgEl.textContent = msg;
}

function sanitizeData(d) {
  if (!d) return d;
  // Smart snapshot: strip empty arrays and sort keys to prevent key ordering changes from triggering updates
  function _snapForCompare(obj) {
    function sortAndFilter(val) {
      if (val === null || typeof val !== 'object') {
        return val;
      }
      if (Array.isArray(val)) {
        if (val.length === 0) return undefined;
        return val.map(sortAndFilter);
      }
      const keys = Object.keys(val).sort();
      const res = {};
      let hasKeys = false;
      for (const k of keys) {
        const v = sortAndFilter(val[k]);
        if (v !== undefined) {
          res[k] = v;
          hasKeys = true;
        }
      }
      return hasKeys ? res : undefined;
    }
    return JSON.stringify(sortAndFilter(obj));
  }
  const beforeStr = _snapForCompare(d);

  if (!d.settings) d.settings = { engine: 'bm', accent: '#6c8fff' };
  if (!d.settings.defaultPageType) d.settings.defaultPageType = 'miro';

  if (!d.environments || !Array.isArray(d.environments) || d.environments.length === 0) {
    d.environments = [{ id: 'e0', name: 'Main Env' }];
  }
  if (!d.environments.some(e => e.id === 'env_time')) {
    d.environments.push({ id: 'env_time', name: 'Time', tabColor: '#ff8fa3' });
  }
  if (!d.curEnv) d.curEnv = d.environments[0].id;

  if (!d.groups || !Array.isArray(d.groups) || d.groups.length === 0) {
    d.groups = [{ id: 'g0', name: 'Main Group', envId: d.environments[0].id }];
  }
  if (!d.groups.some(g => g.id === 'group_time')) {
    d.groups.push({ id: 'group_time', name: 'Current', envId: 'env_time' });
  } else {
    const gt = d.groups.find(g => g.id === 'group_time');
    gt.envId = 'env_time';
    if (!gt.name || gt.name === 'TIme Group') gt.name = 'Current';
  }
  // Backwards compatibility: ensure all groups have an envId
  d.groups.forEach(g => {
    if (!g.envId) g.envId = d.environments[0].id;
  });

  if (!d.curGroup) d.curGroup = d.groups[0].id;
  if (!d.pages) d.pages = JSON.parse(JSON.stringify(DEF.pages));
  
  const timePageDefaults = [
    { id: 'time_today', name: 'Today' },
    { id: 'time_gantt', name: 'Gantt Chart' },
    { id: 'time_stats', name: 'Statistics' },
    { id: 'time_fruit', name: 'Fruit Tracker' },
    { id: 'time_zooper', name: 'Zooper' },
    { id: 'time_life', name: 'Life' }
  ];
  timePageDefaults.forEach(tp => {
    let existing = d.pages.find(p => p.id === tp.id);
    if (!existing) {
      existing = {
        id: tp.id,
        groupId: 'group_time',
        name: tp.name,
        pageType: 'web',
        zoom: 100,
        panX: 0,
        panY: 0
      };
      d.pages.push(existing);
    } else {
      // Only fix groupId and pageType; preserve user-set name, zoom, pan, tabColor
      existing.groupId = 'group_time';
      if (!existing.pageType || existing.pageType === 'miro' || existing.pageType === 'bookmarks') {
        existing.pageType = 'web';
      }
      // Migrate old lowercase names to Title Case (one-time)
      if (!existing.name || existing.name === tp.name.toLowerCase()) {
        existing.name = tp.name;
      }
    }
  });

  d.pages.forEach((p) => {
    if (!p.groupId) p.groupId = d.groups[0].id;
    if (!p.name) p.name = 'Untitled Page';
    if (!p.pageType) p.pageType = 'miro';
    if (p.zoom === undefined) p.zoom = 100;
    if (p.panX === undefined) p.panX = 0;
    if (p.panY === undefined) p.panY = 0;
    if (p.bg === undefined) p.bg = '';
    if (p.bgType === undefined) p.bgType = 'none';
    if (p.tabColor === undefined) p.tabColor = '';
    if (!p.widgets) p.widgets = [];
    p.widgets.forEach((w) => {
      if (w.type !== 'note' && !w.items) w.items = [];
      if (!w.color || (w.color.r < 30 && w.color.g < 30 && w.color.b < 40)) {
        w.color = { ...DEF_COLOR };
      }
    });
    if (p.pageType === 'miro') {
      if (!p.miroCards) p.miroCards = [];
    }
  });
  if (!d.cur) d.cur = d.pages[0]?.id || 'p0';
  if (!d.inbox) d.inbox = [];

  const afterStr = _snapForCompare(d);
  if (beforeStr !== afterStr) {
    console.warn('[SANITIZE] Data modified. Before:', beforeStr.length, 'After:', afterStr.length);
    d.__modified = true;
  }
  return d;
}
window.sanitizeData = sanitizeData;

function initDB() {
  if (window.__miroBuildersOk) window.__miroBuildersOk();
  isFirstLoad = true;

  // If in offline mode, just load from cache and render
  if (_offlineMode) {
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
      // Restore last page from localStorage
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
      const restoredPage = D.pages.find(p => p.id === D.cur);
      if (restoredPage && restoredPage.groupId) {
        D.curGroup = restoredPage.groupId;
        const restoredGrp = D.groups.find(g => g.id === restoredPage.groupId);
        if (restoredGrp && restoredGrp.envId) {
          D.curEnv = restoredGrp.envId;
        }
      }
      sanitizeData(D);
      if (D.__modified) {
        delete D.__modified;
        sv(true, true);
      }
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
        pg.gridRows = cachedPage.gridRows || null;
        pg.gridCols = cachedPage.gridCols || null;
        pg.cellPages = cachedPage.cellPages || null;
        pg.slicerColSizes = cachedPage.slicerColSizes || null;
        pg.slicerRowSizes = cachedPage.slicerRowSizes || null;
      }
      isFirstLoad = false;
      renderMeta();
      buildCols();
      updateOfflineUI();
    }
    return;
  }

  // Check if legacy monolithic data exists FIRST before attaching sharded listeners
  db.ref(DB_REF).once('value').then((snap) => {
    const rawData = snap.val();
    if (rawData && rawData.pages && Array.isArray(rawData.pages)) {
      console.log('[MIGRATION] Monolithic legacy layout found. Migrating to sharded layout...');
      const meta = {
        settings: rawData.settings || { engine: 'bm', accent: '#6c8fff' },
        curEnv: rawData.curEnv || 'e0',
        curGroup: rawData.curGroup || (rawData.groups && rawData.groups[0] ? rawData.groups[0].id : 'g0'),
        environments: rawData.environments || [{ id: 'e0', name: 'Main Env' }],
        groups: rawData.groups || [{ id: 'g0', name: 'Main Group', envId: 'e0' }],
        inbox: rawData.inbox || []
      };

      // Legacy group mapping
      meta.groups.forEach(g => {
        if (!g.envId) g.envId = meta.environments[0].id;
      });

      const pagesMeta = [];
      const updates = {};

      rawData.pages.forEach(p => {
        pagesMeta.push({
          id: p.id,
          groupId: p.groupId || meta.curGroup,
          name: p.name || 'Page',
          pageType: p.pageType || 'miro',
          zoom: p.zoom || 100,
          panX: p.panX || 0,
          panY: p.panY || 0,
          bg: p.bg || '',
          bgType: p.bgType || 'none',
          tabColor: p.tabColor || ''
        });

        updates[`users/${USER_ID}/startmine_pages/${p.id}`] = {
          widgets: p.widgets || [],
          miroCards: p.miroCards || []
        };
      });

      updates[`users/${USER_ID}/startmine_meta`] = meta;
      updates[`users/${USER_ID}/startmine_pages_meta`] = pagesMeta;

      // Clear the old monolith
      updates[DB_REF] = null;

      return db.ref().update(updates).then(() => {
        console.log('[MIGRATION] Legacy data migration complete!');
      });
    }
  }).catch((err) => {
    console.warn('[MIGRATION] Monolithic layout read error or permission denied (possibly already sharded):', err.message);
  }).finally(() => {
    // ALWAYS setup sharded listeners AFTER checking/running migration
    setupShardedListeners();
  });
}

let _activePageListener = null;

function setupShardedListeners() {
  return window.SM.data.setupShardedListeners();
}

function renderMeta() {
  buildEnvs();
  buildGroups();
  buildTabs();
  applyBG();
  applyContrast();
  buildEP();
  buildAcPop();
  buildBgSwatches();
  buildInbox();
  document.documentElement.style.setProperty('--ac', D.settings.accent || '#6c8fff');
  document.getElementById('ac-dot').style.background = D.settings.accent || '#6c8fff';

  const cb = document.getElementById('page-type-toggle-cb');
  const lbl = document.getElementById('page-type-label');
  if (cb && lbl) {
    const isWeb = (D.settings.defaultPageType === 'web');
    cb.checked = isWeb;
    lbl.textContent = isWeb ? 'Web' : 'Miro';
  }
}

// Switch the active synchronized payload
function switchActivePage(pageId) {
  window._lastSyncedPageData = null;

  // Clear any existing subpage listeners
  if (window._activeSubPageListeners) {
    window._activeSubPageListeners.forEach(item => {
      try {
        db.ref(item.path).off('value', item.callback);
      } catch(e) { console.warn('[SYNC SUB DETACH]', e); }
    });
  }
  window._activeSubPageListeners = [];

  // ─── Safe Eviction: ONLY clear memory after verified cache write ───
  const prevPg = cp();
  if (prevPg && prevPg.id !== pageId) {
    // Save all subpages of the Slicer page to local cache
    if (prevPg.pageType === 'slicer' && prevPg.cellPages) {
      Object.values(prevPg.cellPages).forEach(subPid => {
        const subPg = D.pages.find(p => p && p.id === subPid);
        if (subPg) {
          cachePageDataSafe(subPid, {
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
            ts: subPg.ts || Date.now()
          });
        }
      });
    }

    const prevItemCount = (prevPg.widgets || []).length + (prevPg.miroCards || []).length;
    if (prevItemCount > 0 || prevPg.pageType === 'slicer') {
      // Save to cache and VERIFY before evicting from memory
      const cacheOk = cachePageDataSafe(prevPg.id, {
        widgets: prevPg.widgets || [],
        miroCards: prevPg.miroCards || [],
        vGuides: prevPg.vGuides || [],
        hGuides: prevPg.hGuides || [],
        _guidesMode: prevPg._guidesMode || false,
        lockedGuides: prevPg.lockedGuides || [],
        cellStates: prevPg.cellStates || {},
        mergedCells: prevPg.mergedCells || [],
        customCells: prevPg.customCells || [],
        ts: prevPg.ts || Date.now(),
        gridRows: prevPg.gridRows || null,
        gridCols: prevPg.gridCols || null,
        cellPages: prevPg.cellPages || null,
        slicerColSizes: prevPg.slicerColSizes || null,
        slicerRowSizes: prevPg.slicerRowSizes || null,
        cellGuides: prevPg.cellGuides || {},
        _layoutGuidesMode: prevPg._layoutGuidesMode || false
      });
      if (cacheOk) {
        // Cache verified — safe to evict
        prevPg.widgets = [];
        prevPg.miroCards = [];
      } else {
        // Cache FAILED! Keep data in memory — DO NOT evict!
        console.error(`[EVICTION BLOCKED] Page "${prevPg.name}" (${prevPg.id}) has ${prevItemCount} items but cache write failed. Keeping in memory!`);
        if (typeof showToast === 'function') showToast('⚠️ Cache full — keeping page data in memory (safe)', 5000);
      }
    } else {
      // Empty page — safe to evict (nothing to lose)
      prevPg.widgets = [];
      prevPg.miroCards = [];
    }
  }
  D.cur = pageId;
  const activePg = D.pages.find(p => p && p.id === pageId);
  if (activePg && activePg.groupId) {
    D.curGroup = activePg.groupId;
    const activeGrp = D.groups.find(g => g && g.id === activePg.groupId);
    if (activeGrp && activeGrp.envId) {
      D.curEnv = activeGrp.envId;
    }
  }
  try { localStorage.setItem(LS_CUR_PAGE, pageId); } catch(e) {}
  if (activePg) {
    document.title = `${activePg.name} - QuranGFX Backyard`;
  } else {
    document.title = 'QuranGFX Backyard';
  }
  renderMeta();

  if (_activePageListener) {
    db.ref(_activePageListener).off();
  }

  const pageDataRef = `users/${USER_ID}/startmine_pages/${pageId}`;
  _activePageListener = pageDataRef;

  // ─── Instant render from localStorage cache, IndexedDB fallback ───
  // ─── Instant render from localStorage cache, IndexedDB fallback ───
  const cachedPage = getCachedPageData(pageId);
  if (cachedPage && ((cachedPage.widgets || []).length > 0 || (cachedPage.miroCards || []).length > 0 || (cachedPage.vGuides || []).length > 0 || (cachedPage.hGuides || []).length > 0 || (cachedPage.customCells || []).length > 0 || cachedPage.pageType === 'slicer' || cachedPage.gridRows)) {
    const pg = cp();
    if (pg) {
      pg.widgets = cachedPage.widgets || [];
      pg.miroCards = cachedPage.miroCards || [];
      pg.vGuides = cachedPage.vGuides || [];
      pg.hGuides = cachedPage.hGuides || [];
      pg._guidesMode = cachedPage._guidesMode || false;
      pg.lockedGuides = cachedPage.lockedGuides || [];
      pg.cellStates = cachedPage.cellStates || {};
      pg.mergedCells = cachedPage.mergedCells || [];
      pg.customCells = cachedPage.customCells || [];
      pg.ts = cachedPage.ts || 0;
      pg.gridRows = cachedPage.gridRows || null;
      pg.gridCols = cachedPage.gridCols || null;
      pg.cellPages = cachedPage.cellPages || null;
      pg.slicerColSizes = cachedPage.slicerColSizes || null;
      pg.slicerRowSizes = cachedPage.slicerRowSizes || null;
      const fakeD = { pages: [pg] };
      sanitizeData(fakeD);
      _lastSyncedPageData = {
        widgets: JSON.stringify(pg.widgets),
        miroCards: JSON.stringify(pg.miroCards)
      };
      pg._hasBeenLoaded = true;
      if (pg.pageType === 'slicer') {
        setupSlicerSubPageListeners(pg);
      }
    }
    buildCols();
  } else {
    // Try IndexedDB async (larger, more reliable cache)
    getCachedPageDataAsync(pageId).then(idbCached => {
      if (idbCached && ((idbCached.widgets || []).length > 0 || (idbCached.miroCards || []).length > 0 || (idbCached.vGuides || []).length > 0 || (idbCached.hGuides || []).length > 0 || (idbCached.customCells || []).length > 0 || idbCached.pageType === 'slicer' || idbCached.gridRows)) {
        const pg = cp();
        if (pg && pg.id === pageId) { // Make sure we're still on same page
          // ⛔ RACE CONDITION GUARD: If Firebase or another edit has already loaded newer data, don't overwrite it!
          const localTs = pg.ts || 0;
          const cachedTs = idbCached.ts || 0;
          if (localTs > cachedTs) {
            console.warn(`[IDB RESTORE GUARD ⛔] Page "${pg.name}" already has newer data (${localTs}) than IndexedDB cache (${cachedTs}) — skipping overwrite.`);
            return;
          }
          pg.widgets = idbCached.widgets || [];
          pg.miroCards = idbCached.miroCards || [];
          pg.vGuides = idbCached.vGuides || [];
          pg.hGuides = idbCached.hGuides || [];
          pg._guidesMode = idbCached._guidesMode || false;
          pg.lockedGuides = idbCached.lockedGuides || [];
          pg.cellStates = idbCached.cellStates || {};
          pg.mergedCells = idbCached.mergedCells || [];
          pg.customCells = idbCached.customCells || [];
          pg.ts = cachedTs;
          pg.gridRows = idbCached.gridRows || null;
          pg.gridCols = idbCached.gridCols || null;
          pg.cellPages = idbCached.cellPages || null;
          pg.slicerColSizes = idbCached.slicerColSizes || null;
          pg.slicerRowSizes = idbCached.slicerRowSizes || null;
          const fakeD = { pages: [pg] };
          sanitizeData(fakeD);
          _lastSyncedPageData = {
            widgets: JSON.stringify(pg.widgets),
            miroCards: JSON.stringify(pg.miroCards)
          };
          pg._hasBeenLoaded = true;
          if (pg.pageType === 'slicer') {
            setupSlicerSubPageListeners(pg);
          }
          buildCols();
          console.log(`[IDB RESTORE] Page "${pg.name}" loaded from IndexedDB (${(pg.widgets||[]).length}w + ${(pg.miroCards||[]).length}c)`);
        }
      }
    });
    document.getElementById('cw').innerHTML = '<div style="padding: 2rem; color: var(--mu); text-align: center;">Loading page data...</div>';
  }

  // In offline mode, just load from cache, don't attach Firebase listener
  if (_offlineMode) {
    buildCols();
    return;
  }

  db.ref(pageDataRef).on('value', (snap) => {
    if (isOwnWrite()) return;
    const pData = snap.val() || { widgets: [], miroCards: [] };
    
    // ⛔ RACE CONDITION GUARD: Find the actual page by pageId instead of cp(),
    // to prevent writing data of pageId into the wrong active page object if we switched pages.
    const pg = D.pages.find(p => p && p.id === pageId);
    if (pg) {
      if (isPagePayloadEqual(pg, pData)) {
        pg.ts = pData.ts || 0;
        return;
      }
      // ⛔ TIMESTAMP GUARD: If local data is newer than incoming server data, ignore update
      const incomingTs = pData.ts || 0;
      const localTs = pg.ts || 0;
      if (localTs > incomingTs) {
        console.warn(`[FIREBASE GUARD ⛔] Local data for "${pg.name}" is newer (${localTs}) than incoming (${incomingTs}) — ignoring update.`);
        // Upload our newer local data to server
        sv(false, true);
        return;
      }

      const incomingW = (pData.widgets || []).length;
      const incomingC = (pData.miroCards || []).length;
      const incomingG = (pData.vGuides || []).length + (pData.hGuides || []).length + (pData.customCells || []).length;
      const localW = (pg.widgets || []).length;
      const localC = (pg.miroCards || []).length;
      const localG = (pg.vGuides || []).length + (pg.hGuides || []).length + (pg.customCells || []).length;
      // ⛔ GUARD: If Firebase sends empty but we have local data, refuse the overwrite 
      // (Only do this if the server data is indeed older/equal, i.e., incomingTs <= localTs)
      const incomingEmpty = (incomingW === 0 && incomingC === 0 && incomingG === 0);
      const localHasData = (localW > 0 || localC > 0 || localG > 0);
      if (incomingEmpty && localHasData && incomingTs <= localTs) {
        console.error(`[FIREBASE GUARD ⛔] Incoming data for "${pg.name}" is EMPTY but local has data/guides — IGNORING Firebase update!`);
        if (typeof showToast === 'function') showToast('⚠️ Empty data from server ignored — local data preserved', 4000);
        return; // Don't apply empty data
      }

      pg.widgets = pData.widgets || [];
      pg.miroCards = pData.miroCards || [];
      if (pData.vGuides !== undefined) pg.vGuides = pData.vGuides;
      else if (pg.vGuides === undefined) pg.vGuides = [];
      
      if (pData.hGuides !== undefined) pg.hGuides = pData.hGuides;
      else if (pg.hGuides === undefined) pg.hGuides = [];
      
      if (pData._guidesMode !== undefined) pg._guidesMode = pData._guidesMode;
      else if (pg._guidesMode === undefined) pg._guidesMode = false;
      
      if (pData.lockedGuides !== undefined) pg.lockedGuides = pData.lockedGuides;
      else if (pg.lockedGuides === undefined) pg.lockedGuides = [];
      
      if (pData.cellStates !== undefined) pg.cellStates = pData.cellStates;
      else if (pg.cellStates === undefined) pg.cellStates = {};
      
      if (pData.mergedCells !== undefined) pg.mergedCells = pData.mergedCells;
      else if (pg.mergedCells === undefined) pg.mergedCells = [];
      
      if (pData.customCells !== undefined) pg.customCells = pData.customCells;
      else if (pg.customCells === undefined) pg.customCells = [];
      
      if (pData.gridRows !== undefined) pg.gridRows = pData.gridRows;
      else if (pg.gridRows === undefined) pg.gridRows = null;
      
      if (pData.gridCols !== undefined) pg.gridCols = pData.gridCols;
      else if (pg.gridCols === undefined) pg.gridCols = null;
      
      if (pData.cellPages !== undefined) pg.cellPages = pData.cellPages;
      else if (pg.cellPages === undefined) pg.cellPages = null;
      
      if (pData.slicerColSizes !== undefined) pg.slicerColSizes = pData.slicerColSizes;
      else if (pg.slicerColSizes === undefined) pg.slicerColSizes = null;
      
      if (pData.slicerRowSizes !== undefined) pg.slicerRowSizes = pData.slicerRowSizes;
      else if (pg.slicerRowSizes === undefined) pg.slicerRowSizes = null;
      
      if (pData.cellGuides !== undefined) pg.cellGuides = pData.cellGuides;
      else if (pg.cellGuides === undefined) pg.cellGuides = {};
      
      if (pData._layoutGuidesMode !== undefined) pg._layoutGuidesMode = pData._layoutGuidesMode;
      else if (pg._layoutGuidesMode === undefined) pg._layoutGuidesMode = false;
      
      pg.ts = incomingTs;
      pg._hasBeenLoaded = true;

      // Cache to BOTH localStorage and IndexedDB
      cachePageData(pageId, {
        widgets: pg.widgets,
        miroCards: pg.miroCards,
        vGuides: pg.vGuides,
        hGuides: pg.hGuides,
        _guidesMode: pg._guidesMode,
        lockedGuides: pg.lockedGuides,
        cellStates: pg.cellStates,
        mergedCells: pg.mergedCells,
        customCells: pg.customCells,
        gridRows: pg.gridRows,
        gridCols: pg.gridCols,
        cellPages: pg.cellPages,
        slicerColSizes: pg.slicerColSizes,
        slicerRowSizes: pg.slicerRowSizes,
        cellGuides: pg.cellGuides,
        _layoutGuidesMode: pg._layoutGuidesMode,
        ts: pg.ts
      });

      // ONLY sanitize, update lastSyncedPageData, and rebuild columns if it's the current active page
      if (pageId === D.cur) {
        const fakeD = { pages: [pg] };
        sanitizeData(fakeD);
        _lastSyncedPageData = {
          widgets: JSON.stringify(pg.widgets),
          miroCards: JSON.stringify(pg.miroCards)
        };
        if (pg.pageType === 'slicer') {
          setupSlicerSubPageListeners(pg);
        }
        buildCols();
      }
    }
  });
}


function sv(saveAll = false, immediate = false) {
  return window.SM.data.sv(saveAll, immediate);
}

// ─── Save Guards: force-save to localStorage on tab close ───
function forceLocalSave() {
  return window.SM.data.forceLocalSave();
}

window.addEventListener('beforeunload', (e) => {
  // Always force-save to localStorage first (guarantees no data loss)
  forceLocalSave();
  if (_svTimer) { clearTimeout(_svTimer); sv(false, true); }
  // Auto-snapshot on browser close (skip if sv just fired within 3s)
  if (Date.now() - _lastSvTs > 3000) saveSnapshotBeacon();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    forceLocalSave();
    if (_svTimer) { clearTimeout(_svTimer); sv(false, true); }
    if (Date.now() - _lastSvTs > 3000) saveSnapshotBeacon();
  }
});

// ─── Versioned Snapshot Backup System ───
const SNAPSHOT_MAX = 30;
let _snapshotSaving = false;
let _lastSnapshotTs = 0;

// Toast notification helper
function showToast(msg, duration = 2000) {
  let toast = document.getElementById('sm-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'sm-toast';
    toast.style.cssText = 'position:fixed;top:18px;left:50%;transform:translateX(-50%) translateY(-60px);background:rgba(20,20,30,.95);color:#fff;padding:12px 28px;border-radius:14px;font-size:.92rem;z-index:999999;pointer-events:none;opacity:0;transition:all .35s cubic-bezier(.4,0,.2,1);backdrop-filter:blur(12px);border:1px solid rgba(108,143,255,.35);box-shadow:0 4px 24px rgba(0,0,0,.4);font-weight:500;';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.style.opacity = '1';
  toast.style.transform = 'translateX(-50%) translateY(0)';
  clearTimeout(toast._tmr);
  toast._tmr = setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(-50%) translateY(-60px)';
  }, duration);
}

// Full snapshot save to Firebase
function saveSnapshot(silent = false) {
  if (!USER_ID || _snapshotSaving) return Promise.resolve();
  // Don't snapshot more than once per 10 seconds
  const now = Date.now();
  if (now - _lastSnapshotTs < 10000) return Promise.resolve();
  _snapshotSaving = true;
  _lastSnapshotTs = now;

  const snapshot = {
    ts: now,
    meta: {
      settings: D.settings,
      curEnv: D.curEnv,
      curGroup: D.curGroup,
      environments: D.environments,
      groups: D.groups,
      inbox: D.inbox
    },
    pagesMeta: D.pages.map(p => ({
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
    })),
    pages: {}
  };
  D.pages.forEach(p => {
    let widgets, miroCards, vGuides, hGuides, _guidesMode, lockedGuides, cellStates, mergedCells, customCells;
    if (p.id === D.cur) {
      widgets = p.widgets || [];
      miroCards = p.miroCards || [];
      vGuides = p.vGuides || [];
      hGuides = p.hGuides || [];
      _guidesMode = p._guidesMode || false;
      lockedGuides = p.lockedGuides || [];
      cellStates = p.cellStates || {};
      mergedCells = p.mergedCells || [];
      customCells = p.customCells || [];
    } else {
      const cached = getCachedPageData(p.id);
      if (cached) {
        widgets = cached.widgets || [];
        miroCards = cached.miroCards || [];
        vGuides = cached.vGuides || [];
        hGuides = cached.hGuides || [];
        _guidesMode = cached._guidesMode || false;
        lockedGuides = cached.lockedGuides || [];
        cellStates = cached.cellStates || {};
        mergedCells = cached.mergedCells || [];
        customCells = cached.customCells || [];
      } else {
        widgets = p.widgets || [];
        miroCards = p.miroCards || [];
        vGuides = p.vGuides || [];
        hGuides = p.hGuides || [];
        _guidesMode = p._guidesMode || false;
        lockedGuides = p.lockedGuides || [];
        cellStates = p.cellStates || {};
        mergedCells = p.mergedCells || [];
        customCells = p.customCells || [];
      }
    }
    snapshot.pages[p.id] = { widgets, miroCards, vGuides, hGuides, _guidesMode, lockedGuides, cellStates, mergedCells, customCells };
  });

  const snapRef = `users/${USER_ID}/startmine_snapshots/${now}`;
  return db.ref(snapRef).set(snapshot)
    .then(() => {
      _snapshotSaving = false;
      if (!silent) showToast('✅ Snapshot saved');
      // Cleanup: remove oldest if over limit
      return db.ref(`users/${USER_ID}/startmine_snapshots`).orderByKey().once('value');
    })
    .then(snap => {
      if (!snap) return;
      const keys = [];
      snap.forEach(child => { keys.push(child.key); });
      if (keys.length > SNAPSHOT_MAX) {
        const toDelete = keys.slice(0, keys.length - SNAPSHOT_MAX);
        const updates = {};
        toDelete.forEach(k => { updates[`users/${USER_ID}/startmine_snapshots/${k}`] = null; });
        return db.ref().update(updates);
      }
    })
    .catch(err => {
      _snapshotSaving = false;
      console.error('[SNAPSHOT ERROR]', err);
    });
}

// Beacon-based snapshot for beforeunload (fire-and-forget)
function saveSnapshotBeacon() {
  if (!USER_ID) return;
  const now = Date.now();
  if (now - _lastSnapshotTs < 30000) return; // Don't beacon if snapshotted recently
  _lastSnapshotTs = now;
  try {
    const snapshot = {
      ts: now,
      meta: {
        settings: D.settings,
        curEnv: D.curEnv,
        curGroup: D.curGroup,
        environments: D.environments,
        groups: D.groups,
        inbox: D.inbox
      },
      pagesMeta: D.pages.map(p => ({
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
      })),
      pages: {}
    };
    D.pages.forEach(p => {
      let widgets, miroCards;
      if (p.id === D.cur) {
        widgets = p.widgets || [];
        miroCards = p.miroCards || [];
      } else {
        const cached = getCachedPageData(p.id);
        if (cached) {
          widgets = cached.widgets || [];
          miroCards = cached.miroCards || [];
        } else {
          widgets = p.widgets || [];
          miroCards = p.miroCards || [];
        }
      }
      snapshot.pages[p.id] = { widgets, miroCards };
    });
    // Use fetch with keepalive + PUT for Firebase REST API (sendBeacon only does POST)
    const url = `${firebaseConfig.databaseURL}/users/${USER_ID}/startmine_snapshots/${now}.json`;
    fetch(url, { method: 'PUT', body: JSON.stringify(snapshot), keepalive: true, headers: { 'Content-Type': 'application/json' } }).catch(() => {});
  } catch (e) { console.error('[BEACON SNAPSHOT ERROR]', e); }
}

// Load all snapshots for restore UI
function loadSnapshots() {
  if (!USER_ID) return Promise.resolve([]);
  return db.ref(`users/${USER_ID}/startmine_snapshots`)
    .orderByKey().once('value')
    .then(snap => {
      const list = [];
      snap.forEach(child => {
        const v = child.val();
        const pageNames = (v.pagesMeta || []).map(p => p.name || 'Untitled');
        list.push({
          key: child.key,
          ts: v.ts || parseInt(child.key),
          pageCount: (v.pagesMeta || []).length,
          pageNames: pageNames
        });
      });
      return list.reverse(); // newest first
    });
}

// Restore a specific snapshot
function restoreSnapshot(key) {
  if (!USER_ID || !key) return;
  // Safety: save current state first
  showToast('💾 Saving current state before restore...');
  saveSnapshot(true).then(() => {
    return db.ref(`users/${USER_ID}/startmine_snapshots/${key}`).once('value');
  }).then(snap => {
    const data = snap.val();
    if (!data) { showToast('❌ Snapshot not found'); return; }

    // Restore meta
    if (data.meta) {
      D.settings = data.meta.settings || D.settings;
      D.curEnv = data.meta.curEnv || D.curEnv;
      D.curGroup = data.meta.curGroup || D.curGroup;
      D.environments = data.meta.environments || D.environments;
      D.groups = data.meta.groups || D.groups;
      D.inbox = data.meta.inbox || D.inbox;
    }

    // Restore pages
    if (data.pagesMeta && data.pages) {
      D.pages = data.pagesMeta.map(pm => {
        const pageData = data.pages[pm.id] || {};
        return {
          ...pm,
          widgets: pageData.widgets || [],
          miroCards: pageData.miroCards || []
        };
      });
      // Ensure cur points to a valid page
      if (!D.pages.find(p => p.id === D.cur)) {
        D.cur = D.pages[0]?.id || D.cur;
      }
      switchActivePage(D.cur);
    }

    // Save restored state to Firebase and rebuild UI
    sv(true, true);
    if (typeof buildMiroCanvas === 'function') buildMiroCanvas();
    if (typeof buildOutline === 'function') buildOutline();
    if (typeof buildCols === 'function') buildCols();
    if (typeof buildTabs === 'function') buildTabs();

    showToast('✅ Restored successfully!');
    closeSnapshotModal();
  }).catch(err => {
    console.error('[RESTORE ERROR]', err);
    showToast('❌ Restore failed');
  });
}

// Snapshot Modal UI
function openSnapshotModal() {
  let modal = document.getElementById('snapshot-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'snapshot-modal';
    modal.innerHTML = `
      <div class="snap-overlay"></div>
      <div class="snap-dialog">
        <div class="snap-header">
          <span>📸 Saved Snapshots</span>
          <button class="snap-close" onclick="closeSnapshotModal()">✕</button>
        </div>
        <div class="snap-body" id="snap-list">
          <div style="text-align:center;padding:20px;color:rgba(255,255,255,.5)">Loading...</div>
        </div>
      </div>`;
    document.body.appendChild(modal);
  }
  modal.style.display = 'flex';

  // Load snapshots
  const listEl = document.getElementById('snap-list');
  listEl.innerHTML = '<div style="text-align:center;padding:20px;color:rgba(255,255,255,.5)">Loading...</div>';
  loadSnapshots().then(snapshots => {
    if (snapshots.length === 0) {
      listEl.innerHTML = '<div style="text-align:center;padding:30px;color:rgba(255,255,255,.5)">No snapshots yet.<br>Press <b>Ctrl+S</b> or close the browser to create one.</div>';
      return;
    }
    listEl.innerHTML = '';
    snapshots.forEach(s => {
      const date = new Date(s.ts);
      const timeStr = date.toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }) + ' ' +
                      date.toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit', second:'2-digit' });
      const row = document.createElement('div');
      row.className = 'snap-row';
      row.innerHTML = `
        <div class="snap-info">
          <div class="snap-time">${timeStr}</div>
          <div class="snap-pages">${s.pageCount} page${s.pageCount !== 1 ? 's' : ''}: ${s.pageNames.slice(0, 5).join(', ')}${s.pageNames.length > 5 ? '...' : ''}</div>
        </div>
        <button class="snap-restore-btn" title="Restore this version">Restore</button>`;
      row.querySelector('.snap-restore-btn').onclick = () => {
        if (confirm('Are you sure you want to restore this snapshot?\nCurrent state will be saved first as a safety backup.')) {
          restoreSnapshot(s.key);
        }
      };
      listEl.appendChild(row);
    });
  });
}

function closeSnapshotModal() {
  const modal = document.getElementById('snapshot-modal');
  if (modal) modal.style.display = 'none';
}

// ─── Google Drive Backup System ───
const GDRIVE_FOLDER_NAME = 'Startmine Backups';
const GDRIVE_BACKUP_PREFIX = 'startmine_backup_';



// Find or create the Startmine Backups folder on Google Drive
async function getOrCreateDriveFolder(token) {
  // Search for existing folder
  const searchResp = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent("name='" + GDRIVE_FOLDER_NAME + "' and mimeType='application/vnd.google-apps.folder' and trashed=false")}&fields=files(id,name)`,
    { headers: { 'Authorization': 'Bearer ' + token } }
  );
  if (!searchResp.ok) {
    const errText = await searchResp.text();
    throw new Error('Google Drive search failed: ' + errText);
  }
  const searchData = await searchResp.json();
  if (searchData.files && searchData.files.length > 0) {
    return searchData.files[0].id;
  }

  // Create folder
  const createResp = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + token,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: GDRIVE_FOLDER_NAME,
      mimeType: 'application/vnd.google-apps.folder'
    })
  });
  if (!createResp.ok) {
    const errText = await createResp.text();
    throw new Error('Google Drive folder creation failed: ' + errText);
  }
  const folder = await createResp.json();
  if (!folder.id) {
    throw new Error('Google Drive folder creation returned no ID: ' + JSON.stringify(folder));
  }
  return folder.id;
}

// Build full export data including cached page data for non-active pages
function buildFullExportData() {
  const exportData = JSON.parse(JSON.stringify({
    settings: D.settings,
    curEnv: D.curEnv,
    curGroup: D.curGroup,
    cur: D.cur,
    environments: D.environments,
    groups: D.groups,
    inbox: D.inbox,
    pages: D.pages.map(p => {
      let widgets = p.widgets || [];
      let miroCards = p.miroCards || [];
      let vGuides = p.vGuides || [];
      let hGuides = p.hGuides || [];
      let _guidesMode = p._guidesMode || false;
      let lockedGuides = p.lockedGuides || [];
      let cellStates = p.cellStates || {};
      let mergedCells = p.mergedCells || [];
      let customCells = p.customCells || [];
      // Use localStorage cache for pages without loaded data
      if (widgets.length === 0 && miroCards.length === 0 && vGuides.length === 0 && hGuides.length === 0 && !_guidesMode && (p.customCells || []).length === 0) {
        const cached = getCachedPageData(p.id);
        if (cached) {
          widgets = cached.widgets || [];
          miroCards = cached.miroCards || [];
          vGuides = cached.vGuides || [];
          hGuides = cached.hGuides || [];
          _guidesMode = cached._guidesMode || false;
          lockedGuides = cached.lockedGuides || [];
          cellStates = cached.cellStates || {};
          mergedCells = cached.mergedCells || [];
          customCells = cached.customCells || [];
        }
      }
      return {
        id: p.id, groupId: p.groupId, name: p.name,
        pageType: p.pageType, zoom: p.zoom, panX: p.panX, panY: p.panY,
        bg: p.bg, bgType: p.bgType, tabColor: p.tabColor || '',
        widgets, miroCards, vGuides, hGuides, _guidesMode, lockedGuides, cellStates, mergedCells, customCells
      };
    })
  }));
  return exportData;
}

// ═══════════════════════════════════════════════════════════════
// ██  SELECTIVE EXPORT / IMPORT SYSTEM  ██
// ═══════════════════════════════════════════════════════════════

let _selIOData = null; // Holds import data when importing
let _selIOMode = 'export'; // 'export' or 'import'

function openSelIO(mode = 'export', data = null) {
  _selIOMode = mode;
  _selIOData = data;
  const modal = document.getElementById('sel-io-modal');
  const title = document.getElementById('sel-io-title');
  const expBtn = document.getElementById('sel-io-export-btn');
  const impBtn = document.getElementById('sel-io-import-btn');
  const drvBtn = document.getElementById('sel-io-drive-btn');
  
  if (mode === 'export') {
    title.textContent = '📤 Export Data';
    expBtn.style.display = '';
    impBtn.style.display = '';
    drvBtn.style.display = '';
    buildSelIOTree(D);
  } else {
    title.textContent = '📥 Import Data — Select items to add';
    expBtn.style.display = 'none';
    impBtn.style.display = 'none';
    drvBtn.style.display = 'none';
    // Add confirm button
    const footer = drvBtn.parentNode;
    let confirmBtn = document.getElementById('sel-io-confirm');
    if (!confirmBtn) {
      confirmBtn = document.createElement('button');
      confirmBtn.id = 'sel-io-confirm';
      confirmBtn.style.cssText = 'flex:1;padding:8px;border-radius:8px;border:none;background:linear-gradient(135deg,#34d399,#10b981);color:#fff;font-weight:600;font-size:.75rem;cursor:pointer';
      confirmBtn.textContent = '✅ Import Selected';
      confirmBtn.onclick = () => doMergeImport();
      footer.appendChild(confirmBtn);
    }
    confirmBtn.style.display = '';
    buildSelIOTree(data);
  }
  modal.style.display = 'flex';
}

function closeSelIO() {
  document.getElementById('sel-io-modal').style.display = 'none';
  const c = document.getElementById('sel-io-confirm');
  if (c) c.style.display = 'none';
}

function buildSelIOTree(data) {
  const tree = document.getElementById('sel-io-tree');
  tree.innerHTML = '';
  if (!data || !data.environments) return;
  
  const envs = data.environments || [];
  const groups = data.groups || [];
  const pages = data.pages || [];
  
  envs.forEach(env => {
    const envDiv = document.createElement('div');
    envDiv.style.cssText = 'margin-bottom:8px;';
    
    const envLabel = document.createElement('label');
    envLabel.style.cssText = 'display:flex;align-items:center;gap:6px;font-size:.8rem;color:#e4e4e4;cursor:pointer;padding:4px 0';
    const envCb = document.createElement('input');
    envCb.type = 'checkbox';
    envCb.checked = true;
    envCb.dataset.type = 'env';
    envCb.dataset.id = env.id;
    envCb.onchange = () => {
      // Cascade to children
      envDiv.querySelectorAll('input[type=checkbox]').forEach(c => c.checked = envCb.checked);
    };
    envLabel.appendChild(envCb);
    envLabel.appendChild(document.createTextNode('🌍 ' + (env.name || 'Environment')));
    envDiv.appendChild(envLabel);
    
    const envGroups = groups.filter(g => g.envId === env.id);
    envGroups.forEach(grp => {
      const grpDiv = document.createElement('div');
      grpDiv.style.cssText = 'margin-left:20px;';
      
      const grpLabel = document.createElement('label');
      grpLabel.style.cssText = 'display:flex;align-items:center;gap:6px;font-size:.75rem;color:#bbb;cursor:pointer;padding:3px 0';
      const grpCb = document.createElement('input');
      grpCb.type = 'checkbox';
      grpCb.checked = true;
      grpCb.dataset.type = 'group';
      grpCb.dataset.id = grp.id;
      grpCb.onchange = () => {
        grpDiv.querySelectorAll('input[data-type=page]').forEach(c => c.checked = grpCb.checked);
      };
      grpLabel.appendChild(grpCb);
      grpLabel.appendChild(document.createTextNode('📁 ' + (grp.name || 'Group')));
      grpDiv.appendChild(grpLabel);
      
      const grpPages = pages.filter(p => p.groupId === grp.id);
      grpPages.forEach(pg => {
        const wc = (pg.widgets || []).length;
        const mc = (pg.miroCards || []).length;
        // Try cache for evicted pages
        let count = wc + mc;
        if (count === 0 && _selIOMode === 'export') {
          const cached = getCachedPageData(pg.id);
          if (cached) count = (cached.widgets || []).length + (cached.miroCards || []).length;
        }
        const pgLabel = document.createElement('label');
        pgLabel.style.cssText = 'display:flex;align-items:center;gap:6px;font-size:.7rem;color:#999;cursor:pointer;padding:2px 0;margin-left:40px';
        const pgCb = document.createElement('input');
        pgCb.type = 'checkbox';
        pgCb.checked = true;
        pgCb.dataset.type = 'page';
        pgCb.dataset.id = pg.id;
        pgLabel.appendChild(pgCb);
        pgLabel.appendChild(document.createTextNode('📄 ' + (pg.name || 'Page') + (count > 0 ? ` (${count} items)` : '')));
        grpDiv.appendChild(pgLabel);
      });
      
      envDiv.appendChild(grpDiv);
    });
    
    tree.appendChild(envDiv);
  });
}

function selIOSelectAll(checked) {
  document.querySelectorAll('#sel-io-tree input[type=checkbox]').forEach(c => c.checked = checked);
}

function getSelIOChecked() {
  const envIds = new Set(), groupIds = new Set(), pageIds = new Set();
  document.querySelectorAll('#sel-io-tree input[type=checkbox]:checked').forEach(c => {
    if (c.dataset.type === 'env') envIds.add(c.dataset.id);
    if (c.dataset.type === 'group') groupIds.add(c.dataset.id);
    if (c.dataset.type === 'page') pageIds.add(c.dataset.id);
  });
  return { envIds, groupIds, pageIds };
}

function doSelectiveExport() {
  const { envIds, groupIds, pageIds } = getSelIOChecked();
  if (pageIds.size === 0 && groupIds.size === 0 && envIds.size === 0) {
    showToast('⚠️ Nothing selected to export', 3000);
    return;
  }
  
  const exportData = {
    _selectiveExport: true,
    exportDate: new Date().toISOString(),
    settings: D.settings,
    environments: D.environments.filter(e => envIds.has(e.id)),
    groups: D.groups.filter(g => groupIds.has(g.id)),
    pages: D.pages.filter(p => pageIds.has(p.id)).map(p => {
      let widgets = p.widgets || [];
      let miroCards = p.miroCards || [];
      let vGuides = p.vGuides || [];
      let hGuides = p.hGuides || [];
      let _guidesMode = p._guidesMode || false;
      let lockedGuides = p.lockedGuides || [];
      let cellStates = p.cellStates || {};
      let mergedCells = p.mergedCells || [];
      let customCells = p.customCells || [];
      if (widgets.length === 0 && miroCards.length === 0 && vGuides.length === 0 && hGuides.length === 0 && !_guidesMode && (p.customCells || []).length === 0) {
        const cached = getCachedPageData(p.id);
        if (cached) {
          widgets = cached.widgets || [];
          miroCards = cached.miroCards || [];
          vGuides = cached.vGuides || [];
          hGuides = cached.hGuides || [];
          _guidesMode = cached._guidesMode || false;
          lockedGuides = cached.lockedGuides || [];
          cellStates = cached.cellStates || {};
          mergedCells = cached.mergedCells || [];
          customCells = cached.customCells || [];
        }
      }
      return { ...p, widgets, miroCards, vGuides, hGuides, _guidesMode, lockedGuides, cellStates, mergedCells, customCells };
    })
  };
  
  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  const envNames = exportData.environments.map(e => e.name).join('_') || 'selected';
  a.download = `startmine_${envNames}_${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  closeSelIO();
  showToast(`📤 Exported ${exportData.pages.length} pages, ${exportData.groups.length} groups`, 3000);
}

function handleSelIOImport(e) {
  const file = e.target.files[0];
  if (!file) return;
  const r = new FileReader();
  r.onload = (ev) => {
    try {
      const raw = JSON.parse(ev.target.result);
      const parsed = _parseImport(raw);
      if (!parsed) { showToast('❌ Could not read file', 3000); return; }
      openSelIO('import', parsed);
    } catch (err) {
      showToast('❌ Parse error: ' + err.message, 4000);
    }
  };
  r.readAsText(file);
  e.target.value = '';
}

async function doImportFromDrive() {
  try {
    showToast('☁️ Loading backups from Google Drive…');
    let token = await ensureGoogleToken();
    if (!token) { showToast('❌ No Google token', 3000); return; }
    const folderId = await getOrCreateDriveFolder(token);
    let listResp = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent("'" + folderId + "' in parents and trashed=false")}&orderBy=createdTime desc&fields=files(id,name,createdTime,size)&pageSize=20`,
      { headers: { 'Authorization': 'Bearer ' + token } }
    );
    if (listResp.status === 401) {
      token = await ensureGoogleTokenFresh();
      if (!token) return;
      listResp = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent("'" + folderId + "' in parents and trashed=false")}&orderBy=createdTime desc&fields=files(id,name,createdTime,size)&pageSize=20`,
        { headers: { 'Authorization': 'Bearer ' + token } }
      );
    }
    const listData = await listResp.json();
    const files = (listData.files || []).filter(f => f.name.endsWith('.json'));
    if (files.length === 0) { showToast('No backups found on Google Drive', 3000); return; }
    
    // Show file picker
    const pick = prompt('Available backups:\n' + files.map((f, i) => `${i+1}. ${f.name}`).join('\n') + '\n\nEnter number:');
    const idx = parseInt(pick) - 1;
    if (isNaN(idx) || idx < 0 || idx >= files.length) return;
    
    showToast('⬇️ Downloading ' + files[idx].name + '…');
    const dlResp = await fetch(`https://www.googleapis.com/drive/v3/files/${files[idx].id}?alt=media`, {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    const raw = await dlResp.json();
    const parsed = _parseImport(raw);
    if (!parsed) { showToast('❌ Could not parse backup', 3000); return; }
    openSelIO('import', parsed);
  } catch(err) {
    showToast('❌ ' + err.message, 4000);
  }
}

function doMergeImport() {
  if (!_selIOData) return;
  const mode = document.querySelector('input[name="sel-io-mode"]:checked')?.value || 'merge';
  const { envIds, groupIds, pageIds } = getSelIOChecked();
  
  if (mode === 'replace') {
    if (!confirm('⚠️ Replace ALL will delete existing data. Are you sure?')) return;
    D = JSON.parse(JSON.stringify(_selIOData));
    sanitizeData(D);
    sv(true, true);
    switchActivePage(D.cur);
    closeSelIO();
    showToast('✅ Data replaced', 3000);
    return;
  }
  
  // MERGE mode — add without deleting
  const importEnvs = (_selIOData.environments || []).filter(e => envIds.has(e.id));
  const importGrps = (_selIOData.groups || []).filter(g => groupIds.has(g.id));
  const importPages = (_selIOData.pages || []).filter(p => pageIds.has(p.id));
  
  if (importPages.length === 0) { showToast('⚠️ Nothing selected', 3000); return; }
  
  // Map old IDs → new IDs to avoid conflicts
  const envIdMap = {}, grpIdMap = {}, pageIdMap = {};
  
  importEnvs.forEach(e => {
    const newId = uid();
    envIdMap[e.id] = newId;
    D.environments.push({ ...e, id: newId });
  });
  
  importGrps.forEach(g => {
    const newId = uid();
    grpIdMap[g.id] = newId;
    const newEnvId = envIdMap[g.envId] || g.envId;
    // If env doesn't exist, create one
    if (!D.environments.find(e => e.id === newEnvId)) {
      const orig = (_selIOData.environments || []).find(e => e.id === g.envId);
      const fallbackId = uid();
      envIdMap[g.envId] = fallbackId;
      D.environments.push({ id: fallbackId, name: (orig ? orig.name : 'Imported') });
    }
    D.groups.push({ ...g, id: newId, envId: envIdMap[g.envId] || newEnvId });
  });
  
  let importedCount = 0;
  importPages.forEach(p => {
    const newId = uid();
    pageIdMap[p.id] = newId;
    let newGroupId = grpIdMap[p.groupId] || p.groupId;
    // If group doesn't exist, create one
    if (!D.groups.find(g => g.id === newGroupId)) {
      const origGrp = (_selIOData.groups || []).find(g => g.id === p.groupId);
      const fallbackGid = uid();
      grpIdMap[p.groupId] = fallbackGid;
      // Find parent env
      const origEnvId = origGrp ? origGrp.envId : 'e0';
      let newEnvId = envIdMap[origEnvId] || origEnvId;
      if (!D.environments.find(e => e.id === newEnvId)) {
        newEnvId = D.environments[0]?.id || 'e0';
      }
      D.groups.push({ id: fallbackGid, name: origGrp ? origGrp.name : 'Imported', envId: newEnvId });
      newGroupId = fallbackGid;
    }
    
    let widgets = p.widgets || [];
    let miroCards = p.miroCards || [];
    if (widgets.length === 0 && miroCards.length === 0 && _selIOData.pages) {
      const orig = _selIOData.pages.find(op => op.id === p.id);
      if (orig) { widgets = orig.widgets || []; miroCards = orig.miroCards || []; }
    }
    
    D.pages.push({
      ...p,
      id: newId,
      groupId: newGroupId,
      widgets: JSON.parse(JSON.stringify(widgets)),
      miroCards: JSON.parse(JSON.stringify(miroCards))
    });
    importedCount++;
  });
  
  sanitizeData(D);
  sv(true, true);
  renderMeta();
  buildCols();
  closeSelIO();
  showToast(`✅ Merged ${importedCount} pages, ${importEnvs.length} envs`, 3000);
}

// Export to Google Drive
async function exportToGoogleDrive() {
  async function _doUpload(token) {
    const folderId = await getOrCreateDriveFolder(token);
    const exportData = buildFullExportData();
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 19).replace(/[T:]/g, '-');
    const fileName = GDRIVE_BACKUP_PREFIX + dateStr + '.json';
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const metadata = { name: fileName, parents: [folderId], mimeType: 'application/json' };
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', blob);
    const uploadResp = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink', {
      method: 'POST', headers: { 'Authorization': 'Bearer ' + token }, body: form
    });
    return { uploadResp, fileName };
  }
  try {
    showToast('☁️ Exporting to Google Drive…');
    let token;
    try {
      token = await ensureGoogleToken();
    } catch (e) {
      if (e.needsAuth) {
        showToast('🔄 Google Drive authorization needed. Opening popup…');
        token = await manualGoogleReAuth();
      } else {
        throw e;
      }
    }
    if (!token) throw new Error('No Google token');
    let { uploadResp, fileName } = await _doUpload(token);
    // Auto-retry on 401 (expired token)
    if (uploadResp.status === 401) {
      showToast('🔄 Token expired — re-authenticating…');
      token = await ensureGoogleTokenFresh();
      if (!token) throw new Error('Re-authentication failed');
      ({ uploadResp, fileName } = await _doUpload(token));
    }
    if (!uploadResp.ok) {
      const errText = await uploadResp.text();
      throw new Error('Upload failed: ' + errText);
    }
    const uploadResult = await uploadResp.json();
    showToast('✅ Saved to Google Drive: ' + fileName, 3000);
    console.log('[GDRIVE] Backup uploaded:', uploadResult);
    return uploadResult;
  } catch (err) {
    console.error('[GDRIVE EXPORT ERROR]', err);
    let msg = err.message || String(err);
    if (err.code === 'auth/popup-blocked') {
      msg = 'Browser popup blocked! Please check your browser address bar and allow popups for this site.';
    }
    showToast('❌ Drive export failed: ' + msg, 6000);
  }
}

// Restore from Google Drive — shows list of available backups
async function restoreFromGoogleDrive() {
  try {
    showToast('☁️ Loading backups from Google Drive…');
    let token;
    try {
      token = await ensureGoogleToken();
    } catch (e) {
      if (e.needsAuth) {
        showToast('🔄 Google Drive authorization needed. Opening popup…');
        token = await manualGoogleReAuth();
      } else {
        throw e;
      }
    }
    if (!token) throw new Error('No Google token');
    const folderId = await getOrCreateDriveFolder(token);

    // List backup files in folder
    const listResp = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent("'" + folderId + "' in parents and trashed=false")}&orderBy=createdTime desc&fields=files(id,name,createdTime,size)&pageSize=50`,
      { headers: { 'Authorization': 'Bearer ' + token } }
    );
    const listData = await listResp.json();
    const files = (listData.files || []).filter(f => f.name.endsWith('.json'));

    // Build modal UI
    let modal = document.getElementById('gdrive-restore-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'gdrive-restore-modal';
      document.body.appendChild(modal);
    }

    if (files.length === 0) {
      modal.innerHTML = `
        <div class="snap-overlay" onclick="document.getElementById('gdrive-restore-modal').style.display='none'"></div>
        <div class="snap-dialog">
          <div class="snap-header"><span>☁️ Google Drive Backups</span><button class="snap-close" onclick="document.getElementById('gdrive-restore-modal').style.display='none'">✕</button></div>
          <div class="snap-body"><div style="text-align:center;padding:30px;color:rgba(255,255,255,.5)">No backups found on Google Drive.<br>Press <b>Ctrl+Shift+S</b> to create one.</div></div>
        </div>`;
      modal.style.display = 'flex';
      return;
    }

    let rowsHtml = '';
    files.forEach(f => {
      const date = new Date(f.createdTime);
      const timeStr = date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) + ' ' +
        date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const sizeKB = f.size ? (parseInt(f.size) / 1024).toFixed(1) + ' KB' : '';
      rowsHtml += `
        <div class="snap-row" data-fid="${f.id}">
          <div class="snap-info">
            <div class="snap-time">${timeStr}</div>
            <div class="snap-pages">${f.name} ${sizeKB ? '(' + sizeKB + ')' : ''}</div>
          </div>
          <button class="snap-restore-btn gdrive-restore-btn" data-fid="${f.id}" title="Restore this backup">Restore</button>
        </div>`;
    });

    modal.innerHTML = `
      <div class="snap-overlay" onclick="document.getElementById('gdrive-restore-modal').style.display='none'"></div>
      <div class="snap-dialog">
        <div class="snap-header"><span>☁️ Google Drive Backups</span><button class="snap-close" onclick="document.getElementById('gdrive-restore-modal').style.display='none'">✕</button></div>
        <div class="snap-body">${rowsHtml}</div>
      </div>`;
    modal.style.display = 'flex';

    // Attach click handlers
    modal.querySelectorAll('.gdrive-restore-btn').forEach(btn => {
      btn.onclick = async () => {
        const fileId = btn.dataset.fid;
        if (!confirm('Restore this backup from Google Drive?\
Current state will be saved as a snapshot first.')) return;
        try {
          console.log('[RESTORE] Starting restore...');
          console.log('[RESTORE] Current D:', JSON.stringify(D).substring(0, 500));

          // Save current state first
          showToast('💾 Saving current state…');
          await saveSnapshot(true);

          // Download the backup file
          showToast('☁️ Downloading backup…');
          const dlResp = await fetch(
            `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
            { headers: { 'Authorization': 'Bearer ' + token } }
          );
          const raw = await dlResp.json();

          // Parse and apply
          const imported = _parseImport(raw);
          if (!imported) {
            showToast('❌ Could not parse backup file', 3000);
            return;
          }

          D = imported;
          sanitizeData(D);
          sv(true, true);
          switchActivePage(D.cur);
          modal.style.display = 'none';
          showToast('✅ Restored from Google Drive!', 3000);
        } catch (err) {
          console.error('[RESTORE FAILED]', err);
          if (typeof showToast === 'function') showToast('❌ Restore failed: ' + err.message, 8000);
          return;
        }
      };
    });

  } catch (err) {
    console.error('[GDRIVE RESTORE ERROR]', err);
    let msg = err.message || String(err);
    if (err.code === 'auth/popup-blocked') {
      msg = 'Browser popup blocked! Please check your browser address bar and allow popups for this site.';
    }
    showToast('❌ Failed to load backups: ' + msg, 6000);
  }
}

// ─── GitHub Backup System (Version Control) ───
// Token stored in localStorage to avoid GitHub Secret Scanning auto-revoking it
function getGitHubPAT() {
  let pat = localStorage.getItem('gh_pat');
  if (!pat) {
    pat = prompt('Enter your GitHub Personal Access Token (PAT).\nThis is stored locally and only needs to be entered once.\n\nGet one from: github.com/settings/tokens');
    if (pat && pat.trim()) {
      localStorage.setItem('gh_pat', pat.trim());
    } else {
      return null;
    }
  }
  return pat;
}
const GITHUB_OWNER = 'osgfxman';
const GITHUB_REPO = 'startmine-backup';
const GITHUB_FILE = 'startmine_data.json';
const GITHUB_API = 'https://api.github.com';

function ghHeaders() {
  const pat = getGitHubPAT();
  if (!pat) return null;
  return {
    'Authorization': 'Bearer ' + pat,
    'Accept': 'application/vnd.github+json',
    'Content-Type': 'application/json',
    'X-GitHub-Api-Version': '2022-11-28'
  };
}

// Ensure repo exists, create if not
async function ensureGitHubRepo() {
  try {
    const resp = await fetch(`${GITHUB_API}/repos/${GITHUB_OWNER}/${GITHUB_REPO}`, { headers: ghHeaders() });
    if (resp.ok) return true;
  } catch (e) { /* repo doesn't exist */ }

  // Try to create repo
  try {
    const createResp = await fetch(`${GITHUB_API}/user/repos`, {
      method: 'POST',
      headers: ghHeaders(),
      body: JSON.stringify({ name: GITHUB_REPO, private: true, description: 'Startmine automatic backups', auto_init: true })
    });
    if (createResp.ok) {
      showToast('📦 Created GitHub repo: ' + GITHUB_REPO, 3000);
      return true;
    }
    const err = await createResp.json();
    throw new Error(err.message || 'Could not create repo');
  } catch (e) {
    showToast('❌ GitHub repo not found. Please create "' + GITHUB_REPO + '" manually on GitHub.', 5000);
    throw e;
  }
}

// Export to GitHub (commit with version control)
async function exportToGitHub() {
  try {
    if (!getGitHubPAT()) { showToast('❌ GitHub token required', 3000); return; }
    showToast('🐙 Saving to GitHub…');
    await ensureGitHubRepo();

    const exportData = buildFullExportData();
    const content = btoa(unescape(encodeURIComponent(JSON.stringify(exportData, null, 2))));
    const now = new Date();
    const commitMsg = 'Backup ' + now.toISOString().slice(0, 19).replace('T', ' ');

    // Get current file SHA (needed for updates)
    let sha = null;
    try {
      const getResp = await fetch(`${GITHUB_API}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${GITHUB_FILE}`, { headers: ghHeaders() });
      if (getResp.ok) {
        const fileData = await getResp.json();
        sha = fileData.sha;
      }
    } catch (e) { /* file doesn't exist yet */ }

    // Create or update file
    const body = { message: commitMsg, content };
    if (sha) body.sha = sha;

    const putResp = await fetch(`${GITHUB_API}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${GITHUB_FILE}`, {
      method: 'PUT',
      headers: ghHeaders(),
      body: JSON.stringify(body)
    });

    if (!putResp.ok) {
      const errData = await putResp.json();
      throw new Error(errData.message || 'Upload failed');
    }

    const result = await putResp.json();
    showToast('✅ Saved to GitHub: ' + commitMsg, 3000);
    console.log('[GITHUB] Backup committed:', result.commit?.sha?.slice(0, 7));
    return result;
  } catch (err) {
    console.error('[GITHUB EXPORT ERROR]', err);
    showToast('❌ GitHub export failed: ' + err.message, 4000);
  }
}

// Restore from GitHub — shows commit history
async function restoreFromGitHub() {
  try {
    if (!getGitHubPAT()) { showToast('❌ GitHub token required', 3000); return; }
    showToast('🐙 Loading GitHub history…');
    await ensureGitHubRepo();

    // Get commit history for the backup file
    const commitsResp = await fetch(
      `${GITHUB_API}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/commits?path=${GITHUB_FILE}&per_page=30`,
      { headers: ghHeaders() }
    );
    if (!commitsResp.ok) throw new Error('Could not load commit history');
    const commits = await commitsResp.json();

    // Build modal UI
    let modal = document.getElementById('github-restore-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'github-restore-modal';
      document.body.appendChild(modal);
    }

    if (commits.length === 0) {
      modal.innerHTML = `
        <div class="snap-overlay" onclick="document.getElementById('github-restore-modal').style.display='none'"></div>
        <div class="snap-dialog">
          <div class="snap-header"><span>🐙 GitHub Backups</span><button class="snap-close" onclick="document.getElementById('github-restore-modal').style.display='none'">✕</button></div>
          <div class="snap-body"><div style="text-align:center;padding:30px;color:rgba(255,255,255,.5)">No backups found on GitHub.<br>Press <b>Ctrl+Alt+G</b> to create one.</div></div>
        </div>`;
      modal.style.display = 'flex';
      return;
    }

    let rowsHtml = '';
    commits.forEach(c => {
      const date = new Date(c.commit.author.date);
      const timeStr = date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) + ' ' +
        date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const shortSha = c.sha.slice(0, 7);
      rowsHtml += `
        <div class="snap-row" data-sha="${c.sha}">
          <div class="snap-info">
            <div class="snap-time">${timeStr}</div>
            <div class="snap-pages">${c.commit.message} <span style="opacity:.5;font-size:.7rem">${shortSha}</span></div>
          </div>
          <button class="snap-restore-btn github-restore-btn" data-sha="${c.sha}" title="Restore this version">Restore</button>
        </div>`;
    });

    modal.innerHTML = `
      <div class="snap-overlay" onclick="document.getElementById('github-restore-modal').style.display='none'"></div>
      <div class="snap-dialog">
        <div class="snap-header"><span>🐙 GitHub Version History</span><button class="snap-close" onclick="document.getElementById('github-restore-modal').style.display='none'">✕</button></div>
        <div class="snap-body">${rowsHtml}</div>
      </div>`;
    modal.style.display = 'flex';

    // Attach click handlers
    modal.querySelectorAll('.github-restore-btn').forEach(btn => {
      btn.onclick = async () => {
        const sha = btn.dataset.sha;
        if (!confirm('Restore this version from GitHub?\nCurrent state will be saved as a snapshot first.')) return;
        try {
          showToast('💾 Saving current state…');
          await saveSnapshot(true);

          showToast('🐙 Downloading version…');
          // Get file at specific commit
          const fileResp = await fetch(
            `${GITHUB_API}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${GITHUB_FILE}?ref=${sha}`,
            { headers: ghHeaders() }
          );
          if (!fileResp.ok) throw new Error('Could not download version');
          const fileData = await fileResp.json();
          const raw = JSON.parse(decodeURIComponent(escape(atob(fileData.content.replace(/\n/g, '')))));

          const imported = _parseImport(raw);
          if (!imported) {
            showToast('❌ Could not parse backup file', 3000);
            return;
          }
          D = imported;
          sanitizeData(D);
          sv(true, true);
          switchActivePage(D.cur);
          modal.style.display = 'none';
          showToast('✅ Restored from GitHub!', 3000);
        } catch (err) {
          console.error('[GITHUB RESTORE ERROR]', err);
          showToast('❌ Restore failed: ' + err.message, 4000);
        }
      };
    });
  } catch (err) {
    console.error('[GITHUB RESTORE ERROR]', err);
    showToast('❌ Failed to load GitHub history: ' + err.message, 4000);
  }
}

// ─── Save All: Firebase Snapshot + Google Drive + GitHub ───
async function saveAllBackups() {
  showToast('🔄 Saving to all destinations…');
  const results = { firebase: false, drive: false, github: false };

  // 1. Firebase Snapshot
  try {
    await saveSnapshot(true);
    results.firebase = true;
  } catch (e) { console.error('[SAVE ALL] Firebase failed:', e); }

  // 2. Google Drive + GitHub in parallel
  const [driveResult, githubResult] = await Promise.allSettled([
    exportToGoogleDrive().then(() => { results.drive = true; }),
    exportToGitHub().then(() => { results.github = true; })
  ]);

  const icons = [
    results.firebase ? '✅' : '❌',
    results.drive ? '✅' : '❌',
    results.github ? '✅' : '❌'
  ];
  const allOk = results.firebase && results.drive && results.github;
  showToast(
    (allOk ? '✅ All saved! ' : '⚠️ Partial save: ') +
    `Firebase ${icons[0]}  Drive ${icons[1]}  GitHub ${icons[2]}`,
    allOk ? 3000 : 5000
  );
}


document.getElementById('bg-btn').onclick = () => {
  const pg = cp();
  if (pg.bgType === 'solid' && pg.bg) {
    document.getElementById('bg-solid-hex').value = pg.bg;
    document.getElementById('bg-solid-picker').value = pg.bg;
    switchBgTab('solid');
  } else if (pg.bgType === 'gradient' && pg.bg) {
    document.getElementById('bg-grad-custom').value = pg.bg;
    switchBgTab('gradient');
  } else if (pg.bgType === 'image' && pg.bg) {
    switchBgTab('image');
  } else {
    switchBgTab('solid');
  }

  // Populate Ribbon Color settings
  const useRibbon = !!(D.settings && D.settings.useRibbonBg);
  const ribbonColor = (D.settings && D.settings.ribbonBg) || '#121420';
  const cb = document.getElementById('bg-ribbon-use');
  const picker = document.getElementById('bg-ribbon-picker');
  const hexInput = document.getElementById('bg-ribbon-hex');
  if (cb && picker && hexInput) {
    cb.checked = useRibbon;
    picker.value = ribbonColor.startsWith('#') && ribbonColor.length >= 7 ? ribbonColor : '#121420';
    hexInput.value = ribbonColor;
    const row = document.getElementById('bg-ribbon-color-row');
    if (row) {
      row.style.opacity = useRibbon ? '1' : '0.5';
      row.style.pointerEvents = useRibbon ? 'auto' : 'none';
    }
  }

  openM('m-bg');
};

const pageTypeToggleCb = document.getElementById('page-type-toggle-cb');
if (pageTypeToggleCb) {
  pageTypeToggleCb.onchange = () => {
    const isWeb = pageTypeToggleCb.checked;
    D.settings.defaultPageType = isWeb ? 'web' : 'miro';
    const lbl = document.getElementById('page-type-label');
    if (lbl) lbl.textContent = isWeb ? 'Web' : 'Miro';
    sv();
  };
}

function switchBgTab(t) {
  document
    .querySelectorAll('.bg-tab')
    .forEach((el) => el.classList.toggle('sel', el.dataset.bt === t));
  document
    .querySelectorAll('.bg-panel')
    .forEach((el) => el.classList.toggle('show', el.id === 'bg-p-' + t));
  _bgTempType = t;
}
document
  .querySelectorAll('.bg-tab')
  .forEach((el) => (el.onclick = () => switchBgTab(el.dataset.bt)));

function buildBgSwatches() {
  const c = document.getElementById('bg-solid-swatches');
  c.innerHTML = '';
  BG_SOLID_SWATCHES.forEach((hex) => {
    const s = document.createElement('div');
    s.className = 'bg-sw';
    s.style.background = hex;
    s.title = hex;
    s.onclick = () => {
      document.querySelectorAll('.bg-sw').forEach((x) => x.classList.remove('sel'));
      s.classList.add('sel');
      document.getElementById('bg-solid-hex').value = hex;
      document.getElementById('bg-solid-picker').value = hex;
    };
    c.appendChild(s);
  });
  const gc = document.getElementById('bg-grad-swatches');
  gc.innerHTML = '';
  BG_GRADIENTS.forEach((g) => {
    const s = document.createElement('div');
    s.className = 'bg-gr-sw';
    s.style.background = g;
    s.onclick = () => {
      document.querySelectorAll('.bg-gr-sw').forEach((x) => x.classList.remove('sel'));
      s.classList.add('sel');
      document.getElementById('bg-grad-custom').value = g;
    };
    gc.appendChild(s);
  });
}

const ribbonUse = document.getElementById('bg-ribbon-use');
if (ribbonUse) {
  ribbonUse.onchange = function () {
    const row = document.getElementById('bg-ribbon-color-row');
    if (row) {
      row.style.opacity = this.checked ? '1' : '0.5';
      row.style.pointerEvents = this.checked ? 'auto' : 'none';
    }
  };
}
const ribbonPicker = document.getElementById('bg-ribbon-picker');
if (ribbonPicker) {
  ribbonPicker.oninput = function () {
    const hexInput = document.getElementById('bg-ribbon-hex');
    if (hexInput) hexInput.value = this.value;
  };
}
const ribbonHex = document.getElementById('bg-ribbon-hex');
if (ribbonHex) {
  ribbonHex.oninput = function () {
    const picker = document.getElementById('bg-ribbon-picker');
    const val = this.value.trim();
    if (picker && /^#[0-9a-fA-F]{6}$/.test(val)) {
      picker.value = val;
    }
  };
}
const ribbonClr = document.getElementById('bg-ribbon-clr');
if (ribbonClr) {
  ribbonClr.onclick = function () {
    const picker = document.getElementById('bg-ribbon-picker');
    const hexInput = document.getElementById('bg-ribbon-hex');
    if (picker) picker.value = '#121420';
    if (hexInput) hexInput.value = '#121420';
  };
}

document.getElementById('bg-solid-picker').oninput = function () {
  document.getElementById('bg-solid-hex').value = this.value;
};
document.getElementById('bg-solid-hex').oninput = function () {
  if (/^#[0-9a-fA-F]{6}$/.test(this.value))
    document.getElementById('bg-solid-picker').value = this.value;
};
document.getElementById('bg-solid-op').oninput = function () {
  document.getElementById('bg-solid-op-v').textContent = this.value;
};

document.getElementById('bg-up').onchange = function (e) {
  const f = e.target.files[0];
  if (!f) return;
  const r = new FileReader();
  r.onload = (ev) => {
    const base64 = ev.target.result;
    document.getElementById('bg-img-preview').style.display = 'block';
    document.getElementById('bg-img-prev-el').src = base64;
    // Upload to imgbb for persistent URL (compressed)
    const btn = document.getElementById('ok-bg');
    btn.textContent = 'Uploading…';
    btn.disabled = true;
    // Use uploadToImgBB if available (has compression), else direct
    const doUpload = typeof uploadToImgBB === 'function'
      ? uploadToImgBB(base64)
      : fetch('https://api.imgbb.com/1/upload?key=129f1b49da234235959ee4405ac9ebb1', {
          method: 'POST', body: (() => { const fd = new FormData(); fd.append('image', base64.split(',')[1]); return fd; })()
        }).then(r => r.json()).then(d => d.success ? d.data.url : null).catch(() => null);
    doUpload.then(url => {
      if (url) {
        _bgTempValue = url;
        btn.textContent = 'Apply';
        btn.disabled = false;
      } else {
        _bgTempValue = null;
        btn.textContent = '⚠️ Upload Failed';
        btn.disabled = false;
        if (typeof showToast === 'function') showToast('⚠️ Background upload failed.', 3000);
      }
    });
  };
  r.readAsDataURL(f);
  this.value = '';
};

document.getElementById('ok-bg').onclick = () => {
  const pg = cp();
  const t = _bgTempType;
  if (t === 'solid') {
    const hex = document.getElementById('bg-solid-hex').value.trim() || '#0d0f18';
    const op = +document.getElementById('bg-solid-op').value / 100;
    const r = parseInt(hex.slice(1, 3), 16),
      g = parseInt(hex.slice(3, 5), 16),
      b = parseInt(hex.slice(5, 7), 16);
    pg.bg = `rgba(${r},${g},${b},${op})`;
    pg.bgType = 'solid';
  } else if (t === 'gradient') {
    const g = document.getElementById('bg-grad-custom').value.trim();
    if (g) {
      pg.bg = g;
      pg.bgType = 'gradient';
    }
  } else if (t === 'image' && _bgTempValue) {
    pg.bg = _bgTempValue;
    pg.bgType = 'image';
  }

  // Save Ribbon Color settings
  if (!D.settings) D.settings = {};
  const useRibbonEl = document.getElementById('bg-ribbon-use');
  const ribbonHexEl = document.getElementById('bg-ribbon-hex');
  if (useRibbonEl && ribbonHexEl) {
    D.settings.useRibbonBg = useRibbonEl.checked;
    D.settings.ribbonBg = ribbonHexEl.value.trim() || '#121420';
  }

  sv();
  applyBG();
  applyContrast();
  closeM('m-bg');
  _bgTempValue = '';
};

document.getElementById('bg-clr-btn').onclick = () => {
  cp().bg = '';
  cp().bgType = 'none';
  sv();
  applyBG();
  closeM('m-bg');
};

function applyBG() {
  const b = document.getElementById('bgl'),
    pg = cp();
  if (!pg.bg) {
    b.style.cssText =
      'background:radial-gradient(ellipse 70% 50% at 50% -5%,rgba(108,143,255,.1) 0%,transparent 65%),' +
      getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
    b.style.backgroundSize = '';
    b.style.backgroundPosition = '';
    return;
  }
  if (pg.bgType === 'image') {
    b.style.background = `url('${pg.bg}') center/cover no-repeat`;
  } else {
    b.style.background = pg.bg;
    b.style.backgroundSize = 'cover';
    b.style.backgroundPosition = 'center';
  }
}

const $si = () => document.getElementById('si');
const $sr = () => document.getElementById('sr');
let srIdx = -1,
  srTimer = null;
function allBm() {
  const r = [];
  for (const pg of D.pages)
    for (const w of pg.widgets || []) {
      if (!w.items) continue;
      for (const bm of w.type === 'todo' ? [] : w.items)
        r.push({ ...bm, _pg: pg.name, _pid: pg.id });
    }
  return r;
}

$si().addEventListener('input', (e) => {
  clearTimeout(srTimer);
  srTimer = setTimeout(() => renderSR(e.target.value.trim()), 80);
});
$si().addEventListener('keydown', (e) => {
  const c = $sr();
  const items = c.querySelectorAll('.sr-it');
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    srIdx = Math.min(srIdx + 1, items.length - 1);
    items.forEach((el, i) => el.classList.toggle('foc', i === srIdx));
    return;
  }
  if (e.key === 'ArrowUp') {
    e.preventDefault();
    srIdx = Math.max(srIdx - 1, -1);
    items.forEach((el, i) => el.classList.toggle('foc', i === srIdx));
    return;
  }
  if (e.key === 'Enter') {
    e.preventDefault();
    const q = $si().value.trim();
    if (!q) return;
    if (srIdx >= 0 && items[srIdx]) {
      items[srIdx].click();
      $si().value = '';
      c.classList.remove('show');
      return;
    }
    const eng = ENGINES.find((e2) => e2.k === D.settings.engine) || ENGINES[1];
    const url = eng.url
      ? eng.url + encodeURIComponent(q)
      : 'https://www.google.com/search?q=' + encodeURIComponent(q);
    window.open(url, '_blank');
    $si().value = '';
    c.classList.remove('show');
  }
  if (e.key === 'Escape') {
    c.classList.remove('show');
    $si().blur();
  }
});


// Moved to toolbar.js;

// Moved to toolbar.js;

document.getElementById('imp-json').onchange = function (e) {
  const file = e.target.files[0];
  if (!file) return;
  const r = new FileReader();
  r.onload = (ev) => {
    try {
      const raw = JSON.parse(ev.target.result);
      const imported = _parseImport(raw);
      if (!imported) {
        alert('Could not read file.');
        return;
      }
      D = imported;
      sanitizeData(D); // Force sanitize on imported JSON before saving
      sv(true, true); // Immediate Save All
      switchActivePage(D.cur);
      alert('Imported successfully!');
    } catch (err) {
      alert('Parse error: ' + err.message);
    }
  };
  r.readAsText(file);
  this.value = '';
  document.getElementById('io-pop').classList.remove('open');
};

document.getElementById('imp-csv').onchange = function (e) {
  const file = e.target.files[0];
  if (!file) return;
  const r = new FileReader();
  r.onload = (ev) => {
    _importCSV(ev.target.result);
  };
  r.readAsText(file);
  this.value = '';
  document.getElementById('io-pop').classList.remove('open');
};

function _parseImport(raw) {
  if (raw.settings && raw.pages && Array.isArray(raw.pages) && raw.pages[0]?.widgets) {
    if (!raw.groups) {
      raw.groups = [{ id: 'g0', name: 'Imported Group' }];
      raw.curGroup = 'g0';
      raw.pages.forEach((p) => (p.groupId = 'g0'));
    }
    return raw;
  }
  if (raw.pages && Array.isArray(raw.pages)) {
    const result = JSON.parse(JSON.stringify(DEF));
    result.pages = [];
    result.groups = [{ id: 'g0', name: 'Imported Group' }];
    result.curGroup = 'g0';
    raw.pages.forEach((pg, pi) => {
      const newPg = {
        id: uid(),
        groupId: 'g0',
        name: pg.title || pg.name || 'Page ' + (pi + 1),
        cols: 3,
        bg: '',
        bgType: 'none',
        widgets: [],
      };
      const sections = pg.sections || pg.tabs || pg.widgets || [];
      sections.forEach((sec, si) => {
        const bms = sec.bookmark_collection?.bookmarks || sec.items || sec.bookmarks || [];
        if (bms.length) {
          const w = {
            id: uid(),
            col: si % 3,
            title: sec.title || sec.settings?.title || 'Imported',
            emoji: '📌',
            type: 'bookmarks',
            display: 'auto',
            size: 'md',
            vis: 'all',
            color: { ...DEF_COLOR },
            items: [],
          };
          bms.forEach((bm) =>
            w.items.push({
              id: uid(),
              label: bm.title || bm.name || bm.label || '',
              url: bm.url || '',
              emoji: '',
            }),
          );
          newPg.widgets.push(w);
        }
      });
      result.pages.push(newPg);
    });
    if (result.pages.length) return result;
  }
  if (Array.isArray(raw)) {
    const result = JSON.parse(JSON.stringify(DEF));
    result.groups = [{ id: 'g0', name: 'Imported Group', envId: result.environments[0].id }];
    result.curGroup = 'g0';
    result.pages[0].groupId = 'g0';
    const w = {
      id: uid(),
      col: 0,
      title: 'Imported',
      emoji: '📥',
      type: 'bookmarks',
      display: 'auto',
      size: 'md',
      vis: 'all',
      color: { ...DEF_COLOR },
      items: [],
    };
    raw.forEach((bm) => {
      if (bm.url)
        w.items.push({
          id: uid(),
          label: bm.title || bm.label || bm.name || bm.url,
          url: bm.url,
          emoji: '',
        });
    });
    if (w.items.length) {
      result.pages[0].widgets.push(w);
      return result;
    }
  }
  return null;
}

function _importCSV(text) {
  function parseCSVLine(line) {
    const cols = [];
    let cur = '',
      inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQ && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQ = !inQ;
      } else if (ch === ',' && !inQ) {
        cols.push(cur.trim());
        cur = '';
      } else cur += ch;
    }
    cols.push(cur.trim());
    return cols.map((c) => c.replace(/^"|"$/g, '').replace(/""/g, '"'));
  }
  const lines = text.trim().split(/\r?\n/);
  const result = JSON.parse(JSON.stringify(DEF));
  result.pages = [];
  result.groups = [{ id: 'g0', name: 'Imported CSV', envId: result.environments[0].id }];
  result.curGroup = 'g0';
  const pagesMap = {},
    widgetsMap = {};
  let count = 0;
  lines.forEach((line, i) => {
    if (i === 0) {
      const h = line.toLowerCase();
      if (h.includes('title') || h.includes('url')) return;
    }
    const cols = parseCSVLine(line);
    const label = (cols[0] || '').trim(),
      url = (cols[1] || '').trim();
    const wName = (cols[2] || 'Imported').trim(),
      pName = (cols[3] || 'Imported').trim();
    if (!url || !url.startsWith('http')) return;
    if (!pagesMap[pName]) {
      pagesMap[pName] = {
        id: uid(),
        groupId: 'g0',
        name: pName,
        cols: 3,
        bg: '',
        bgType: 'none',
        widgets: [],
      };
      result.pages.push(pagesMap[pName]);
    }
    const wKey = pagesMap[pName].id + '_' + wName;
    if (!widgetsMap[wKey]) {
      const colIdx =
        Object.keys(widgetsMap).filter((k) => k.startsWith(pagesMap[pName].id + '_')).length % 3;
      widgetsMap[wKey] = {
        id: uid(),
        col: colIdx,
        title: wName,
        emoji: '📌',
        type: 'bookmarks',
        display: 'auto',
        size: 'md',
        vis: 'all',
        color: { ...DEF_COLOR },
        items: [],
      };
      pagesMap[pName].widgets.push(widgetsMap[wKey]);
    }
    widgetsMap[wKey].items.push({ id: uid(), label, url, emoji: '' });
    count++;
  });
  if (count > 0) {
    if (result.pages.length === 0) result.pages = JSON.parse(JSON.stringify(DEF)).pages;
    D = result;
    sv();
    renderAll();
    alert('CSV imported! ' + count + ' bookmarks loaded.');
  } else alert('No valid bookmarks found.');
}

document.getElementById('imp-startme').onchange = function (e) {
  const file = e.target.files[0];
  if (!file) return;
  const r = new FileReader();
  r.onload = (ev) => {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(ev.target.result, 'text/html');
      const result = {
        settings: { ...D.settings },
        cur: '',
        curEnv: 'e0',
        curGroup: 'g0',
        environments: [{ id: 'e0', name: 'Main Env' }],
        groups: [{ id: 'g0', name: 'Start.me Import', envId: 'e0' }],
        inbox: [],
        pages: [],
      };
      const topDL = doc.querySelector('body > DL') || doc.querySelector('DL');
      if (!topDL) {
        alert('Invalid Start.me file');
        return;
      }

      // Find all PAGE H3s (top-level pages)
      const topItems = topDL.children;
      for (let i = 0; i < topItems.length; i++) {
        const dt = topItems[i];
        if (dt.tagName !== 'DT') continue;
        const h3 = dt.querySelector(':scope > H3');
        if (!h3) continue;
        const isPage = h3.getAttribute('PAGE') === 'true';
        if (!isPage) continue;

        const pageName = h3.textContent.trim();
        const page = {
          id: uid(),
          groupId: 'g0',
          name: pageName,
          pageType: 'miro',
          miroCards: [],
          zoom: 100,
          panX: 0,
          panY: 0,
          bg: '',
          bgType: 'none',
          tabColor: '',
          widgets: [],
        };

        // Find the DL sibling that contains widgets
        const pageDL = dt.querySelector(':scope > DL');
        if (pageDL) {
          const startX = 100;
          const startY = 100;
          const gap = 40;
          let cursX = startX;
          let cursY = startY;
          let rowMaxH = 0;
          const colsPerRow = 4;
          let addedCount = 0;

          const pageDTs = pageDL.children;
          for (let j = 0; j < pageDTs.length; j++) {
            const wdt = pageDTs[j];
            if (wdt.tagName !== 'DT') continue;
            const wh3 = wdt.querySelector(':scope > H3');
            if (!wh3) continue;

            const widgetName = wh3.textContent.trim();
            const widgetItems = [];

            // Parse bookmarks inside widget into temporary array
            const wDL = wdt.querySelector(':scope > DL');
            if (wDL) {
              const itemsList = wDL.children;
              for (let k = 0; k < itemsList.length; k++) {
                const bdt = itemsList[k];
                if (bdt.tagName !== 'DT') continue;
                const a = bdt.querySelector(':scope > A');
                if (a) {
                  const href = a.getAttribute('HREF') || '';
                  if (href && href.startsWith('http')) {
                    widgetItems.push({
                      id: uid(),
                      label: a.textContent.trim().slice(0, 80),
                      url: href,
                      emoji: '',
                    });
                  }
                }
                const subH3 = bdt.querySelector(':scope > H3');
                if (subH3) {
                  const subDL = bdt.querySelector(':scope > DL');
                  if (subDL) {
                    const tempWidget = { items: widgetItems };
                    parseBookmarks(subDL, tempWidget);
                  }
                }
              }
            }

            if (widgetItems.length > 0) {
              let cardW = 320; let cardH = 400;
              const wCols = 6; const itemPx = 94;
              const reqRows = Math.ceil(widgetItems.length / wCols);
              cardW = 540; cardH = Math.max(200, 70 + (reqRows * itemPx));

              page.miroCards.push({
                id: uid(),
                type: 'bwidget',
                wType: 'bookmarks',
                title: widgetName,
                emoji: '📌',
                content: '',
                items: widgetItems,
                color: { ...DEF_COLOR },
                x: cursX,
                y: cursY,
                w: cardW,
                h: cardH,
                display: 'spark',
                size: 'md'
              });

              cursX += cardW + gap;
              rowMaxH = Math.max(rowMaxH, cardH);
              addedCount++;
              if (addedCount % colsPerRow === 0) {
                cursX = startX;
                cursY += rowMaxH + gap;
                rowMaxH = 0;
              }
            }
          }
        }
        result.pages.push(page);
      }

      if (result.pages.length === 0) {
        alert('No pages found in file.');
        return;
      }
      result.cur = result.pages[0].id;

      if (
        !confirm(
          'Import ' +
          result.pages.length +
          ' folders containing ' +
          result.pages.reduce((s, p) => s + (p.miroCards || []).length, 0) +
          ' clusters?\nThis will REPLACE all current data.',
        )
      )
        return;

      D = result;
      sv(true, true);
      switchActivePage(D.cur);
      document.getElementById('io-pop').classList.remove('open');
      const totalBm = result.pages.reduce(
        (s, p) => s + (p.miroCards || []).reduce((ss, w) => ss + (w.items || []).length, 0),
        0,
      );
      alert('✅ Imported successfully! ' + result.pages.length + ' boards created with ' + totalBm + ' bookmarks.');
    } catch (err) {
      alert('Import error: ' + err.message);
    }
  };
  r.readAsText(file);
  this.value = '';
};

function parseBookmarks(dl, widget) {
  const items = dl.children;
  for (let k = 0; k < items.length; k++) {
    const bdt = items[k];
    if (bdt.tagName !== 'DT') continue;
    const a = bdt.querySelector(':scope > A');
    if (a) {
      const href = a.getAttribute('HREF') || '';
      if (href && href.startsWith('http')) {
        widget.items.push({
          id: uid(),
          label: a.textContent.trim().slice(0, 80),
          url: href,
          emoji: '',
        });
      }
    }
    // Recurse into sub-folders
    const subH3 = bdt.querySelector(':scope > H3');
    if (subH3) {
      const subDL = bdt.querySelector(':scope > DL');
      if (subDL) parseBookmarks(subDL, widget);
    }
  }
}

// Google Drive buttons
// Moved to toolbar.js;
// Moved to toolbar.js;

// GitHub buttons
// Moved to toolbar.js;
// Moved to toolbar.js;

// Moved to toolbar.js;


let _dragEnvId = null;
function buildEnvs() {
  const bar = document.getElementById('etabs');
  if (!bar) return;
  bar.querySelectorAll('.gtab').forEach((t) => t.remove());
  const addBtn = document.getElementById('add-env');

  D.environments.forEach((env) => {
    const tab = document.createElement('div');
    tab.className = 'gtab' + (env.id === D.curEnv ? ' active' : '');
    if (env.tabColor) {
      tab.style.borderBottomColor = env.id === D.curEnv ? env.tabColor : 'transparent';
    }
    tab.draggable = env.id !== 'env_time';
    tab.addEventListener('dragstart', (e) => {
      if (env.id === 'env_time') {
        e.preventDefault();
        return;
      }
      _dragEnvId = env.id;
      tab.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    tab.addEventListener('dragend', () => {
      _dragEnvId = null;
      tab.classList.remove('dragging');
    });
    tab.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (env.id === 'env_time') return;
      if ((_dragEnvId && _dragEnvId !== env.id) || (_dragGrpId)) tab.classList.add('tab-dragover');
    });
    tab.addEventListener('dragleave', () => tab.classList.remove('tab-dragover'));
    tab.addEventListener('drop', (e) => {
      e.preventDefault();
      tab.classList.remove('tab-dragover');
      if (env.id === 'env_time') return;
      if (_dragGrpId) {
        const grp = D.groups.find((g) => g.id === _dragGrpId);
        if (grp && grp.envId !== env.id) {
          grp.envId = env.id;
          D.curEnv = env.id;
          D.curGroup = grp.id;
          const firstPage = D.pages.find(p => p.groupId === grp.id);
          _dragGrpId = null;
          if (firstPage) {
            switchActivePage(firstPage.id);
          } else {
            sv();
            renderAll();
          }
        }
        return;
      }
      if (!_dragEnvId || _dragEnvId === env.id) return;
      const fromIdx = D.environments.findIndex((e) => e.id === _dragEnvId);
      const toIdx = D.environments.findIndex((e) => e.id === env.id);
      if (fromIdx < 0 || toIdx < 0) return;
      const [moved] = D.environments.splice(fromIdx, 1);
      D.environments.splice(toIdx, 0, moved);
      _dragEnvId = null;
      sv();
      buildEnvs();
    });

    const cd = document.createElement('div');
    cd.className = 'etab-cd';
    cd.style.background = env.tabColor || 'rgba(255,255,255,.15)';
    cd.title = 'Environment color';
    cd.onclick = (ev) => {
      if (env.id === 'env_time') return;
      ev.stopPropagation();
      openEnvColorPop(ev, env.id);
    };

    const nm = document.createElement('span');
    nm.className = 'ptnm';
    nm.textContent = env.name;
    nm.contentEditable = 'false';
    nm.onblur = () => {
      nm.contentEditable = 'false';
      if (env.id === 'env_time') {
        nm.textContent = 'Time';
        return;
      }
      env.name = nm.textContent.trim() || 'Env';
      sv();
    };
    nm.onkeydown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        nm.blur();
      }
      e.stopPropagation();
    };
    nm.onclick = (e) => {
      if (nm.contentEditable === 'true') e.stopPropagation();
    };
    tab.addEventListener('dblclick', (e) => {
      if (env.id === 'env_time') return;
      e.stopPropagation();
      nm.contentEditable = 'true';
      nm.focus();
      const range = document.createRange();
      range.selectNodeContents(nm);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    });
    tab.onclick = () => {
      if (nm.contentEditable === 'true') return;
      if (D.curEnv === env.id) return;
      D.curEnv = env.id;
      let selectedGroup = D.groups.find((g) => g.envId === env.id && D.pages.some((p) => p.groupId === g.id));
      if (!selectedGroup) {
        selectedGroup = D.groups.find((g) => g.envId === env.id);
      }
      if (selectedGroup) {
        D.curGroup = selectedGroup.id;
        const firstPage = D.pages.find((p) => p.groupId === selectedGroup.id);
        if (firstPage) {
          switchActivePage(firstPage.id);
          return;
        }
      }
      D.cur = '';
      sv();
      renderAll();
    };
    const x = document.createElement('button');
    x.className = 'ptx';
    x.textContent = '✕';
    x.title = 'Delete environment';
    x.onclick = (e) => {
      e.stopPropagation();
      delEnv(env.id);
    };
    tab.appendChild(cd);
    tab.appendChild(nm);
    if (D.environments.length > 1 && env.id !== 'env_time') tab.appendChild(x);
    // Right-click: export/import this environment
    tab.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      // Build subset data for this env
      const envGroups = D.groups.filter(g => g.envId === env.id);
      const envPages = D.pages.filter(p => envGroups.some(g => g.id === p.groupId));
      openSelIO('export', {
        settings: D.settings,
        environments: [env],
        groups: envGroups,
        pages: envPages
      });
    });
    bar.insertBefore(tab, addBtn);
  });
}

let _dragGrpId = null;
function buildGroups() {
  const bar = document.getElementById('gtabs');
  bar.querySelectorAll('.gtab').forEach((t) => t.remove());
  if (D.curEnv === 'env_time') {
    bar.style.display = 'none';
    return;
  }
  bar.style.display = 'flex';
  const addBtn = document.getElementById('add-grp');

  if (D.curEnv === '__all__') return; // Hide groups in "All" view if implemented

  const envGroups = D.groups.filter(g => g.envId === D.curEnv);

  envGroups.forEach((g) => {
    const tab = document.createElement('div');
    tab.className = 'gtab' + (g.id === D.curGroup ? ' active' : '');
    if (g.tabColor) {
      tab.style.borderBottomColor = g.id === D.curGroup ? g.tabColor : 'transparent';
    }
    tab.draggable = true;
    tab.addEventListener('dragstart', (e) => {
      _dragGrpId = g.id;
      tab.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    tab.addEventListener('dragend', () => {
      _dragGrpId = null;
      tab.classList.remove('dragging');
    });
    tab.addEventListener('dragover', (e) => {
      e.preventDefault();
      if ((_dragGrpId && _dragGrpId !== g.id) || _dragTabId) tab.classList.add('tab-dragover');
    });
    tab.addEventListener('dragleave', () => tab.classList.remove('tab-dragover'));
    tab.addEventListener('drop', (e) => {
      e.preventDefault();
      tab.classList.remove('tab-dragover');
      if (_dragTabId) {
        const pg = D.pages.find((p) => p.id === _dragTabId);
        if (pg && pg.groupId !== g.id) {
          pg.groupId = g.id;
          D.curGroup = g.id;
          _dragTabId = null;
          switchActivePage(pg.id);
        }
        return;
      }
      if (!_dragGrpId || _dragGrpId === g.id) return;
      const fromIdx = D.groups.findIndex((p) => p.id === _dragGrpId);
      const toIdx = D.groups.findIndex((p) => p.id === g.id);
      if (fromIdx < 0 || toIdx < 0) return;
      const [moved] = D.groups.splice(fromIdx, 1);
      D.groups.splice(toIdx, 0, moved);
      _dragGrpId = null;
      sv();
      buildGroups();
    });
    // Color dot
    const cd = document.createElement('div');
    cd.className = 'gtab-cd';
    cd.style.background = g.tabColor || 'rgba(255,255,255,.15)';
    cd.title = 'Group color';
    cd.onclick = (ev) => {
      ev.stopPropagation();
      openGrpColorPop(ev, g.id);
    };
    // Name
    const nm = document.createElement('span');
    nm.className = 'ptnm';
    nm.textContent = g.name;
    nm.contentEditable = 'false';
    nm.onblur = () => {
      nm.contentEditable = 'false';
      if (g.id === 'group_time') {
        nm.textContent = 'Current';
        return;
      }
      g.name = nm.textContent.trim() || 'Group';
      sv();
    };
    nm.onkeydown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        nm.blur();
      }
      e.stopPropagation();
    };
    nm.onclick = (e) => {
      if (nm.contentEditable === 'true') e.stopPropagation();
    };
    tab.addEventListener('dblclick', (e) => {
      if (g.id === 'group_time') return;
      e.stopPropagation();
      nm.contentEditable = 'true';
      nm.focus();
      const range = document.createRange();
      range.selectNodeContents(nm);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    });
    tab.onclick = () => {
      if (nm.contentEditable === 'true') return;
      if (D.curGroup === g.id) return;
      D.curGroup = g.id;
      const firstPageInGroup = D.pages.find((p) => p.groupId === g.id);
      if (firstPageInGroup) {
        switchActivePage(firstPageInGroup.id);
      } else {
        D.cur = '';
        sv();
        renderAll();
      }
    };
    const x = document.createElement('button');
    x.className = 'ptx';
    x.textContent = '✕';
    x.title = 'Delete group';
    x.onclick = (e) => {
      e.stopPropagation();
      delGroup(g.id);
    };
    tab.appendChild(cd);
    tab.appendChild(nm);
    if (envGroups.length > 1) tab.appendChild(x);
    // Right-click: show context menu for group tab
    tab.addEventListener('contextmenu', (e) => {
      if (typeof showGroupTabContextMenu === 'function') {
        showGroupTabContextMenu(e, g, nm);
      }
    });
    bar.insertBefore(tab, addBtn);
  });
  // Update ALL button style
  document.getElementById('all-btn').classList.toggle('active-toggle', D.curGroup === '__all__');
}

function openEnvColorPop(ev, eid) {
  tcPid = null;
  const pop = document.getElementById('tc-pop');
  pop.querySelectorAll('.tc-sw').forEach((s) => s.remove());
  TAB_COLORS.forEach((hex) => {
    const s = document.createElement('div');
    s.className = 'tc-sw';
    s.style.background = hex;
    const env = D.environments.find((e) => e.id === eid);
    s.style.borderColor = env && env.tabColor === hex ? '#fff' : 'transparent';
    s.onclick = () => {
      if (env) {
        env.tabColor = hex;
        sv();
        buildEnvs();
      }
      pop.classList.remove('open');
    };
    pop.insertBefore(s, document.getElementById('tc-none'));
  });
  document.getElementById('tc-none').onclick = () => {
    const env = D.environments.find((e) => e.id === eid);
    if (env) {
      env.tabColor = '';
      sv();
      buildEnvs();
    }
    pop.classList.remove('open');
  };
  pop.classList.add('open');
  pop.style.left = Math.min(ev.clientX, window.innerWidth - 150) + 'px';
  pop.style.top = ev.clientY + 12 + 'px';
}

function openGrpColorPop(ev, gid) {
  tcPid = null;
  const pop = document.getElementById('tc-pop');
  pop.querySelectorAll('.tc-sw').forEach((s) => s.remove());
  TAB_COLORS.forEach((hex) => {
    const s = document.createElement('div');
    s.className = 'tc-sw';
    s.style.background = hex;
    const grp = D.groups.find((g) => g.id === gid);
    s.style.borderColor = grp && grp.tabColor === hex ? '#fff' : 'transparent';
    s.onclick = () => {
      if (grp) {
        grp.tabColor = hex;
        sv();
        buildGroups();
      }
      pop.classList.remove('open');
    };
    pop.insertBefore(s, document.getElementById('tc-none'));
  });
  document.getElementById('tc-none').onclick = () => {
    const grp = D.groups.find((g) => g.id === gid);
    if (grp) {
      grp.tabColor = '';
      sv();
      buildGroups();
    }
    pop.classList.remove('open');
  };
  pop.classList.add('open');
  pop.style.left = Math.min(ev.clientX, window.innerWidth - 150) + 'px';
  pop.style.top = ev.clientY + 12 + 'px';
}

// ALL button
document.getElementById('all-btn').onclick = () => {
  if (D.curGroup === '__all__') {
    const activePg = D.pages.find(p => p.id === D.cur);
    if (activePg) {
      D.curGroup = activePg.groupId;
      const activeGrp = D.groups.find(g => g.id === activePg.groupId);
      if (activeGrp) D.curEnv = activeGrp.envId;
      switchActivePage(activePg.id);
    } else {
      const fallbackGroup = D.groups.find(g => g.envId === D.curEnv) || D.groups[0];
      if (fallbackGroup) {
        D.curGroup = fallbackGroup.id;
        const fp = D.pages.find(p => p.groupId === fallbackGroup.id);
        if (fp) {
          switchActivePage(fp.id);
        } else {
          D.cur = '';
          sv();
          renderAll();
        }
      }
    }
  } else {
    D.curGroup = '__all__';
    sv();
    renderAll();
  }
};

// Preview mode
let _pvMode = false;
let _livePvTimer = null;
document.getElementById('pv-mode-btn').onclick = () => {
  _pvMode = !_pvMode;
  document.getElementById('pv-mode-btn').classList.toggle('active-toggle', _pvMode);
  if (!_pvMode) {
    document.getElementById('live-pv').style.display = 'none';
  }
};
function posLivePv(ev) {
  const pv = document.getElementById('live-pv');
  const W = window.innerWidth,
    H = window.innerHeight;
  let x = ev.clientX + 16,
    y = ev.clientY + 14;
  if (x + 430 > W) x = ev.clientX - 436;
  if (y + 310 > H) y = ev.clientY - 316;
  pv.style.left = Math.max(4, x) + 'px';
  pv.style.top = Math.max(4, y) + 'px';
}

// Settings
document.getElementById('settings-btn').onclick = () => {
  const envSel = document.getElementById('set-def-env');
  const grpSel = document.getElementById('set-def-grp');
  const pgSel = document.getElementById('set-def-pg');
  envSel.innerHTML = '<option value="__last__">🕐 Remember last</option>';
  (D.environments || []).forEach((e) => {
    const o = document.createElement('option');
    o.value = e.id;
    o.textContent = e.name;
    envSel.appendChild(o);
  });
  grpSel.innerHTML = '<option value="__last__">🕐 Remember last</option>';
  D.groups.forEach((g) => {
    const o = document.createElement('option');
    o.value = g.id;
    o.textContent = g.name;
    grpSel.appendChild(o);
  });
  pgSel.innerHTML = '<option value="__last__">🕐 Remember last</option>';
  D.pages.forEach((p) => {
    const o = document.createElement('option');
    o.value = p.id;
    o.textContent = p.name;
    pgSel.appendChild(o);
  });
  envSel.value = D.settings.defaultEnv || '__last__';
  grpSel.value = D.settings.defaultGroup || '__last__';
  pgSel.value = D.settings.defaultPage || '__last__';
  document.getElementById('set-slicer-headers-autohide').checked = !!D.settings.slicerHeadersAutoHide;
  openM('m-settings');
};
document.getElementById('ok-settings').onclick = () => {
  D.settings.defaultEnv = document.getElementById('set-def-env').value;
  D.settings.defaultGroup = document.getElementById('set-def-grp').value;
  D.settings.defaultPage = document.getElementById('set-def-pg').value;
  D.settings.slicerHeadersAutoHide = document.getElementById('set-slicer-headers-autohide').checked;
  sv();
  closeM('m-settings');
  buildCols();
};

// Move/Copy Widget
let _mvWid = null;
function openMvModal(wid) {
  _mvWid = wid;
  const gs = document.getElementById('mv-grp');
  gs.innerHTML = '';
  D.groups.forEach((g) => {
    const o = document.createElement('option');
    o.value = g.id;
    o.textContent = g.name;
    gs.appendChild(o);
  });
  gs.value = D.curGroup === '__all__' ? D.groups[0].id : D.curGroup;
  updateMvPages();
  gs.onchange = updateMvPages;
  openM('m-mv');
}
function updateMvPages() {
  const gid = document.getElementById('mv-grp').value;
  const ps = document.getElementById('mv-pg');
  ps.innerHTML = '';
  D.pages
    .filter((p) => p.groupId === gid)
    .forEach((p) => {
      const o = document.createElement('option');
      o.value = p.id;
      o.textContent = p.name;
      ps.appendChild(o);
    });
}
document.getElementById('mv-move').onclick = () => {
  const w = fw(_mvWid);
  if (!w) return;
  const tgtPid = document.getElementById('mv-pg').value;
  const tgtPage = D.pages.find((p) => p.id === tgtPid);
  if (!tgtPage) return;
  // Remove from current page
  D.pages.forEach((p) => {
    p.widgets = (p.widgets || []).filter((x) => x.id !== _mvWid);
  });
  // Add to target at position 0
  w.col = 0;
  if (!tgtPage.widgets) tgtPage.widgets = [];
  tgtPage.widgets.unshift(w);
  sv();
  buildCols();
  closeM('m-mv');
};
document.getElementById('mv-copy').onclick = () => {
  const w = fw(_mvWid);
  if (!w) return;
  const tgtPid = document.getElementById('mv-pg').value;
  const tgtPage = D.pages.find((p) => p.id === tgtPid);
  if (!tgtPage) return;
  const clone = JSON.parse(JSON.stringify(w));
  clone.id = uid();
  clone.col = 0;
  if (clone.items) clone.items.forEach((it) => (it.id = uid()));
  if (!tgtPage.widgets) tgtPage.widgets = [];
  tgtPage.widgets.unshift(clone);
  sv();
  buildCols();
  closeM('m-mv');
};

// INBOX sidebar
document.getElementById('inbox-btn').onclick = () => {
  document.getElementById('inbox-side').classList.toggle('open');
  document.getElementById('inbox-btn').classList.toggle('active-toggle');
  buildInbox();
};
document.getElementById('inbox-close').onclick = () => {
  document.getElementById('inbox-side').classList.remove('open');
  document.getElementById('inbox-btn').classList.remove('active-toggle');
};
document.getElementById('inbox-add-btn').onclick = addToInbox;
document.getElementById('inbox-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addToInbox(); }
});
// Image input
document.getElementById('inbox-img-input').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file || !file.type.startsWith('image/')) return;
  const reader = new FileReader();
  reader.onload = () => {
    if (!D.inbox) D.inbox = [];
    D.inbox.push({ id: uid(), type: 'image', data: reader.result, label: file.name, ts: Date.now() });
    sv(); buildInbox();
  };
  reader.readAsDataURL(file);
  e.target.value = '';
});
// Image paste in inbox textarea
document.getElementById('inbox-input').addEventListener('paste', (e) => {
  const items = e.clipboardData?.items;
  if (!items) return;
  for (const item of items) {
    if (item.type.startsWith('image/')) {
      e.preventDefault();
      const file = item.getAsFile();
      const reader = new FileReader();
      reader.onload = () => {
        if (!D.inbox) D.inbox = [];
        D.inbox.push({ id: uid(), type: 'image', data: reader.result, label: 'Pasted image', ts: Date.now() });
        sv(); buildInbox();
      };
      reader.readAsDataURL(file);
      return;
    }
  }
});

let _dragInboxId = null;
let _dragBmId = null;
let _dragBmSrcWid = null;



// Quick inbox input in toolbar
document.getElementById('qi').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    let url = e.target.value.trim();
    if (!url) return;
    if (!url.startsWith('http')) url = 'https://' + url;
    let label = url;
    try {
      label = new URL(url).hostname
        .replace('www.', '')
        .split('.')[0]
        .replace(/^./, (c) => c.toUpperCase());
    } catch (ex) { }
    if (!D.inbox) D.inbox = [];
    D.inbox.push({ id: uid(), url, label, ts: Date.now() });
    e.target.value = '';
    sv();
    buildInbox();
    // Flash the inbox button
    const btn = document.getElementById('inbox-btn');
    btn.style.background = 'var(--ac)';
    setTimeout(() => {
      btn.style.background = '';
    }, 600);
  }
});

// Inbox resize
(function () {
  const side = document.getElementById('inbox-side');
  const handle = document.getElementById('inbox-resize');
  let resizing = false;
  handle.addEventListener('mousedown', (e) => {
    e.preventDefault();
    resizing = true;
    side.style.transition = 'none';
    document.addEventListener('mousemove', onMove);
    document.addEventListener(
      'mouseup',
      () => {
        resizing = false;
        side.style.transition = '';
        document.removeEventListener('mousemove', onMove);
      },
      { once: true },
    );
  });
  function onMove(e) {
    if (!resizing) return;
    const w = window.innerWidth - e.clientX;
    if (w >= 200 && w <= window.innerWidth * 0.5) {
      side.style.width = w + 'px';
    }
  }
})();

// ─── Inbox Save / Restore / Export / Import ───
const INBOX_BACKUP_KEY = 'startmine_inbox_backup';

// 💾 Save Inbox - saves to localStorage AND Firebase dedicated node
// Moved to inbox-ui.js;

// 🔄 Restore Inbox - from localStorage or Firebase
// Moved to inbox-ui.js;

// 📤 Export Inbox as JSON file
// Moved to inbox-ui.js;

// 📥 Import Inbox from JSON file
document.getElementById('inbox-import-file').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      let items = [];
      if (data.type === 'startmine_inbox' && Array.isArray(data.inbox)) {
        items = data.inbox;
      } else if (Array.isArray(data)) {
        items = data;
      } else {
        showToast('❌ Invalid inbox file format', 'err');
        return;
      }

      if (!D.inbox) D.inbox = [];
      const existingIds = new Set(D.inbox.map(x => x.id));
      let added = 0;
      items.forEach(item => {
        if (item.id && !existingIds.has(item.id)) {
          D.inbox.push(item);
          added++;
        }
      });

      sv();
      buildInbox();
      showToast(`📥 Imported ${added} new items (${items.length - added} duplicates skipped)`, 'ok');
    } catch(err) {
      showToast('❌ Error reading file: ' + err.message, 'err');
    }
  };
  reader.readAsText(file);
  e.target.value = '';
});

// ─── Export Inbox to Page (inbox env → inbox gr → timestamped page) ───
// Moved to inbox-ui.js;

// Duplicate link detection
window._dupScope = 'page'; // 'page' or 'all'
// Moved to toolbar.js;
// Moved to toolbar.js
function findDups(scope) {
  const urlMap = {}; // url -> [{pageId, pageName, widgetId, widgetTitle, itemId}]
  const pages = scope === 'page' ? [cp()] : D.pages;
  pages.forEach((pg) => {
    (pg.widgets || []).forEach((w) => {
      if (w.type === 'note') return;
      (w.items || []).forEach((it) => {
        if (!it.url) return;
        const key = it.url.replace(/\/+$/, '').toLowerCase();
        if (!urlMap[key]) urlMap[key] = [];
        urlMap[key].push({
          pageId: pg.id,
          pageName: pg.name,
          widgetId: w.id,
          widgetTitle: w.title,
          itemId: it.id,
          label: it.label,
          url: it.url,
        });
      });
    });
  });
  const dups = {};
  for (const k in urlMap) {
    if (urlMap[k].length > 1) dups[k] = urlMap[k];
  }
  return dups;
}
function buildDupReport() {
  const list = document.getElementById('dup-list');
  const dups = findDups(_dupScope);
  const keys = Object.keys(dups);
  if (keys.length === 0) {
    list.innerHTML =
      '<div style="padding:1.5rem;text-align:center;color:var(--mu);font-size:.75rem">✅ No duplicates found!</div>';
    document.getElementById('dup-del-all').style.display = 'none';
    return;
  }
  document.getElementById('dup-del-all').style.display = '';
  list.innerHTML = '';
  keys.forEach((url) => {
    const items = dups[url];
    const row = document.createElement('div');
    row.className = 'dup-it';
    const img = document.createElement('img');
    img.src = getFav(items[0].url);
    img.onerror = () => {
      img.style.display = 'none';
    };
    const info = document.createElement('div');
    info.className = 'dup-info';
    const urlDiv = document.createElement('div');
    urlDiv.className = 'dup-url';
    urlDiv.textContent = items[0].label || items[0].url;
    const meta = document.createElement('div');
    meta.className = 'dup-meta';
    const locations = items.map((i) => i.pageName + ' / ' + i.widgetTitle);
    meta.textContent = items.length + '× — ' + [...new Set(locations)].join(', ');
    info.appendChild(urlDiv);
    info.appendChild(meta);
    const rm = document.createElement('button');
    rm.className = 'dup-rm';
    rm.textContent = 'Remove extras';
    rm.onclick = () => {
      removeDups(url, items);
      buildDupReport();
    };
    row.appendChild(img);
    row.appendChild(info);
    row.appendChild(rm);
    list.appendChild(row);
  });
}
function removeDups(urlKey, items) {
  // Keep first, remove rest
  for (let i = 1; i < items.length; i++) {
    const pg = D.pages.find((p) => p.id === items[i].pageId);
    if (!pg) continue;
    const w = (pg.widgets || []).find((x) => x.id === items[i].widgetId);
    if (!w || !w.items) continue;
    w.items = w.items.filter((it) => it.id !== items[i].itemId);
  }
  sv();
  buildCols();
}
document.getElementById('dup-del-all').onclick = () => {
  const dups = findDups(_dupScope);
  for (const url in dups) {
    removeDups(url, dups[url]);
  }
  buildDupReport();
};
function applyContrast() {
  const pg = cp();
  const ribbon = document.getElementById('ribbon');
  const envGroup = document.getElementById('env-group-container');
  const ptabs = document.getElementById('ptabs');
  if (!ribbon) return;

  const mtb = document.getElementById('miro-toolbar');
  const mtbr = document.getElementById('miro-toolbar-right');
  const mz = document.getElementById('miro-zoom');
  const ctxMenu = document.getElementById('miro-ctx-menu');

  const useRibbon = !!(D.settings && D.settings.useRibbonBg && D.settings.ribbonBg);
  if (useRibbon) {
    const bg = D.settings.ribbonBg;
    ribbon.style.background = bg;
    if (envGroup) envGroup.style.background = 'transparent';
    if (ptabs) ptabs.style.background = 'transparent';
    if (mtb) mtb.style.background = bg;
    if (mtbr) mtbr.style.background = bg;
    if (mz) mz.style.background = bg;

    const isLight = isCssColorLight(bg);
    ribbon.classList.toggle('contrast-light', isLight);
    if (mtb) mtb.classList.toggle('contrast-light', isLight);
    if (mtbr) mtbr.classList.toggle('contrast-light', isLight);
    if (mz) mz.classList.toggle('contrast-light', isLight);
    if (ctxMenu) ctxMenu.classList.toggle('contrast-light', isLight);
  } else {
    ribbon.style.background = '';
    if (envGroup) envGroup.style.background = '';
    if (ptabs) ptabs.style.background = '';
    if (mtb) mtb.style.background = '';
    if (mtbr) mtbr.style.background = '';
    if (mz) mz.style.background = '';

    let isLight = false;
    if (pg && pg.bgType === 'solid' && pg.bg) {
      isLight = isCssColorLight(pg.bg);
    } else if (pg && pg.bgType === 'image' && pg.bg) {
      isLight = false; // images are usually dark enough
    } else if (pg && pg.bgType === 'gradient' && pg.bg) {
      // Check first color in gradient
      const m = pg.bg.match(/#[0-9a-fA-F]{6}|#[0-9a-fA-F]{3}|rgba?\([^)]+\)/);
      if (m) isLight = isCssColorLight(m[0]);
    }
    ribbon.classList.toggle('contrast-light', isLight);
    if (mtb) mtb.classList.toggle('contrast-light', isLight);
    if (mtbr) mtbr.classList.toggle('contrast-light', isLight);
    if (mz) mz.classList.toggle('contrast-light', isLight);
    if (ctxMenu) ctxMenu.classList.toggle('contrast-light', isLight);
  }
}
function isCssColorLight(c) {
  if (!c) return false;
  let r = 0,
    g = 0,
    b = 0;
  if (c.startsWith('#')) {
    const hex = c.length === 4 ? '#' + c[1] + c[1] + c[2] + c[2] + c[3] + c[3] : c;
    r = parseInt(hex.slice(1, 3), 16);
    g = parseInt(hex.slice(3, 5), 16);
    b = parseInt(hex.slice(5, 7), 16);
  } else if (c.startsWith('rgb')) {
    const m = c.match(/(\d+)/g);
    if (m) {
      r = +m[0];
      g = +m[1];
      b = +m[2];
    }
  }
  return (r * 299 + g * 587 + b * 114) / 1000 > 160;
}
let _dragTabId = null;
function buildTabs() {
  const bar = document.getElementById('ptabs');
  bar.querySelectorAll('.ptab').forEach((t) => t.remove());
  const addBtn = document.getElementById('add-pg');
  if (D.curEnv === 'env_time') {
    if (addBtn) addBtn.style.display = 'none';
  } else {
    if (addBtn) addBtn.style.display = '';
  }
  const groupPages =
    D.curGroup === '__all__' ? D.pages : D.pages.filter((p) => p.groupId === D.curGroup);
  groupPages.forEach((pg) => {
    const tab = document.createElement('div');
    tab.className = 'ptab' + (pg.id === D.cur ? ' active' : '');
    if (pg.tabColor) {
      tab.style.borderColor = pg.tabColor + '66';
    }
    tab.draggable = true;
    tab.dataset.pid = pg.id;
    tab.addEventListener('dragstart', (e) => {

      _dragTabId = pg.id;
      tab.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    tab.addEventListener('dragend', () => {
      _dragTabId = null;
      tab.classList.remove('dragging');
    });
    tab.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (_dragTabId && _dragTabId !== pg.id) tab.classList.add('tab-dragover');
    });
    tab.addEventListener('dragleave', () => tab.classList.remove('tab-dragover'));
    tab.addEventListener('drop', (e) => {
      e.preventDefault();
      tab.classList.remove('tab-dragover');
      if (!_dragTabId || _dragTabId === pg.id) return;
      const fromIdx = D.pages.findIndex((p) => p.id === _dragTabId);
      const toIdx = D.pages.findIndex((p) => p.id === pg.id);
      if (fromIdx < 0 || toIdx < 0) return;
      const [moved] = D.pages.splice(fromIdx, 1);
      D.pages.splice(toIdx, 0, moved);
      _dragTabId = null;
      sv();
      buildTabs();
    });
    const cd = document.createElement('div');
    cd.className = 'ptab-cd';
    cd.style.background = pg.tabColor || 'rgba(255,255,255,.15)';
    cd.title = 'Tab color';
    cd.onclick = (ev) => {
      ev.stopPropagation();
      openTcPop(ev, pg.id);
    };
    const nm = document.createElement('span');
    nm.className = 'ptnm';
    nm.textContent = pg.name;
    nm.contentEditable = 'false';
    nm.onblur = () => {
      nm.contentEditable = 'false';

      pg.name = nm.textContent.trim() || 'Page';
      sv();
    };
    nm.onkeydown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        nm.blur();
      }
      e.stopPropagation();
    };
    nm.onclick = (e) => {
      if (nm.contentEditable === 'true') e.stopPropagation();
    };

    tab.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      nm.contentEditable = 'true';
      nm.focus();
      const range = document.createRange();
      range.selectNodeContents(nm);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    });
    tab.onclick = () => {
      if (nm.contentEditable === 'true') return;
      if (D.cur !== pg.id) switchActivePage(pg.id);
    };
    const x = document.createElement('button');
    x.className = 'ptx';
    x.textContent = '✕';
    x.title = 'Delete page';
    x.onclick = (e) => {
      e.stopPropagation();
      delPage(pg.id);
    };
    tab.appendChild(cd);
    tab.appendChild(nm);
    if (groupPages.length > 1 && !pg.id.startsWith('time_')) tab.appendChild(x);
    // Right-click: show custom page tab context menu
    tab.addEventListener('contextmenu', (e) => {
      if (typeof showPageTabContextMenu === 'function') {
        showPageTabContextMenu(e, pg, nm, cd);
      }
    });
    bar.insertBefore(tab, addBtn);
  });
}

// Moved to toolbar.js;

// Moved to toolbar.js;

// Moved to toolbar.js;

function delEnv(eid) {
  if (eid === 'env_time') {
    alert('Cannot delete the Time environment.');
    return;
  }
  if (D.environments.length <= 1) {
    alert('Cannot delete the only environment.');
    return;
  }
  if (!confirm('Delete this environment and ALL its groups and pages?')) return;
  const envIdx = D.environments.findIndex((e) => e.id === eid);
  if (envIdx < 0) return;

  const groupsToDel = D.groups.filter(g => g.envId === eid);
  const groupIds = groupsToDel.map(g => g.id);

  // FIX: Queue deleted page IDs for Firebase cleanup
  const pagesToDel = D.pages.filter((p) => groupIds.includes(p.groupId));
  pagesToDel.forEach(p => _pendingDeletePageIds.push(p.id));

  D.pages = D.pages.filter((p) => !groupIds.includes(p.groupId));
  D.groups = D.groups.filter((g) => g.envId !== eid);
  D.environments.splice(envIdx, 1);

  if (D.curEnv === eid || !D.environments.some(e => e.id === D.curEnv)) {
    D.curEnv = D.environments[0].id;
    const firstGroupInEnv = D.groups.find(g => g.envId === D.curEnv);
    if (firstGroupInEnv) {
      D.curGroup = firstGroupInEnv.id;
      const firstPageInGroup = D.pages.find(p => p.groupId === firstGroupInEnv.id);
      if (firstPageInGroup) {
        switchActivePage(firstPageInGroup.id);
      } else {
        D.cur = '';
        sv();
        renderAll();
      }
    } else {
      D.cur = '';
      sv();
      renderAll();
    }
  }
  sv();
  renderAll();
}

function delGroup(gid) {
  if (gid === 'group_time') {
    alert('Cannot delete the Current group.');
    return;
  }
  const envGroups = D.groups.filter(g => g.envId === D.curEnv);
  if (envGroups.length <= 1) {
    alert('Cannot delete the only group in this environment.');
    return;
  }
  if (!confirm('Delete this group and ALL its pages?')) return;
  const gidx = D.groups.findIndex((g) => g.id === gid);
  if (gidx < 0) return;

  // FIX: Queue deleted page IDs for Firebase cleanup
  D.pages.filter((p) => p.groupId === gid).forEach(p => _pendingDeletePageIds.push(p.id));

  D.pages = D.pages.filter((p) => p.groupId !== gid);
  D.groups.splice(gidx, 1);
  if (D.curGroup === gid || !D.groups.some(g => g.id === D.curGroup)) {
    const fallbackGroup = D.groups.find(g => g.envId === D.curEnv);
    if (fallbackGroup) {
      D.curGroup = fallbackGroup.id;
      const firstPageInGroup = D.pages.find((p) => p.groupId === fallbackGroup.id);
      if (firstPageInGroup) {
        switchActivePage(firstPageInGroup.id);
      } else {
        D.cur = '';
        sv();
        renderAll();
      }
    } else {
      D.cur = '';
      sv();
      renderAll();
    }
  }
  sv();
  renderAll();
}

function delPage(pid) {
  if (pid.startsWith('time_')) {
    alert('Cannot delete Time environment pages.');
    return;
  }
  const pg = D.pages.find((p) => p.id === pid);
  if (!pg) return;
  const siblingPages = D.pages.filter((p) => p.groupId === pg.groupId);
  if (siblingPages.length <= 1) {
    alert('Cannot delete the only page in this group.');
    return;
  }
  if (!confirm('Delete this page?')) return;

  // FIX: Queue deleted page ID for Firebase cleanup
  _pendingDeletePageIds.push(pid);

  D.pages = D.pages.filter((p) => p.id !== pid);
  if (D.cur === pid) {
    const remaining =
      D.curGroup === '__all__' ? D.pages : D.pages.filter((p) => p.groupId === pg.groupId);
    sv();
    switchActivePage(remaining[0]?.id || D.pages[0]?.id);
  } else {
    sv();
    renderMeta();
  }
}

function openTcPop(ev, pid) {
  tcPid = pid;
  const pop = document.getElementById('tc-pop');
  pop.querySelectorAll('.tc-sw').forEach((s) => s.remove());
  TAB_COLORS.forEach((hex) => {
    const s = document.createElement('div');
    s.className = 'tc-sw';
    s.style.background = hex;
    const pg = D.pages.find((p) => p.id === pid);
    s.style.borderColor = pg && pg.tabColor === hex ? '#fff' : 'transparent';
    s.onclick = () => {
      setTabColor(pid, hex);
      pop.classList.remove('open');
    };
    pop.insertBefore(s, document.getElementById('tc-none'));
  });
  pop.classList.add('open');
  pop.style.left = Math.min(ev.clientX, window.innerWidth - 150) + 'px';
  pop.style.top = ev.clientY + 12 + 'px';
}
document.getElementById('tc-none').onclick = () => {
  setTabColor(tcPid, '');
  document.getElementById('tc-pop').classList.remove('open');
};
function setTabColor(pid, color) {
  const pg = D.pages.find((p) => p.id === pid);
  if (!pg) return;
  pg.tabColor = color;
  sv();
  buildTabs();
}

// Slices Mode - Guides & Grid bindings
function updateGuidesButtonState() {
  const page = cp();
  const btn = document.getElementById('mz-guides-btn');
  if (btn) {
    const isActive = !!(page && page.pageType === 'miro' && page._guidesMode);
    btn.classList.toggle('active-toggle', isActive);
    if (isActive) {
      btn.style.background = 'rgba(108, 143, 255, 0.2)';
      btn.style.color = '#4a7aff';
    } else {
      btn.style.background = '';
      btn.style.color = '';
    }
  }
}

function updateLayoutGuidesButtonState() {
  const page = cp();
  const btn = document.getElementById('mz-layout-guides-btn');
  if (btn) {
    const isActive = !!(page && page.pageType === 'miro' && page._layoutGuidesMode);
    btn.classList.toggle('active-toggle', isActive);
    if (isActive) {
      btn.style.background = 'rgba(108, 143, 255, 0.2)';
      btn.style.color = '#4a7aff';
    } else {
      btn.style.background = '';
      btn.style.color = '';
    }
  }
}

if (document.getElementById('mz-guides-btn')) {
  document.getElementById('mz-guides-btn').onclick = () => {
    const page = cp();
    if (!page || page.pageType !== 'miro') return;
    
    page._guidesMode = !page._guidesMode;
    if (!page._guidesMode) {
      // Hide/Remove rulers, but DO NOT delete guides or merge cells!
      document.querySelectorAll('.miro-ruler').forEach(el => el.remove());
      if (typeof window._exitCustomCellDrawMode === 'function') {
        window._exitCustomCellDrawMode();
      }
    } else {
      // Show/Initialize rulers
      if (typeof window.initMiroSlices === 'function') {
        window.initMiroSlices();
      }
    }
    sv();
    if (typeof buildMiroCanvas === 'function') buildMiroCanvas();
    updateGuidesButtonState();
  };
}

if (document.getElementById('mz-layout-guides-btn')) {
  document.getElementById('mz-layout-guides-btn').onclick = () => {
    const page = cp();
    if (!page || page.pageType !== 'miro') return;
    
    page._layoutGuidesMode = !page._layoutGuidesMode;
    if (!page._layoutGuidesMode) {
      // Clean up rulers and drawing states
      document.querySelectorAll('.miro-cell-ruler').forEach(el => el.remove());
    }
    sv();
    if (typeof buildMiroCanvas === 'function') buildMiroCanvas();
    updateLayoutGuidesButtonState();
  };
}

if (document.getElementById('mz-grid-btn')) {
  document.getElementById('mz-grid-btn').onclick = () => {
    const page = cp();
    if (!page || page.pageType !== 'miro') return;
    
    const colsVal = prompt("Enter number of columns (1-20):", "3");
    if (colsVal === null) return;
    const cols = parseInt(colsVal);
    if (isNaN(cols) || cols < 1 || cols > 20) {
      alert("Please enter a valid number of columns between 1 and 20.");
      return;
    }
    
    const rowsVal = prompt("Enter number of rows (1-20):", "3");
    if (rowsVal === null) return;
    const rows = parseInt(rowsVal);
    if (isNaN(rows) || rows < 1 || rows > 20) {
      alert("Please enter a valid number of rows between 1 and 20.");
      return;
    }
    
    if (typeof window.createMiroGrid === 'function') {
      window.createMiroGrid(cols, rows);
      updateGuidesButtonState();
    }
  };
}

if (document.getElementById('mz-autofit-btn')) {
  document.getElementById('mz-autofit-btn').onclick = () => {
    const page = cp();
    if (!page || (page.pageType !== 'miro' && page.pageType !== 'slicer')) return;
    if (typeof window.zoomToFitSelection === 'function') {
      window.zoomToFitSelection();
    } else if (typeof window.autofitAllMiroSlices === 'function') {
      window.autofitAllMiroSlices();
    }
  };
}

function buildCols() {
  const page = cp();
  const isMiro = page.pageType === 'miro';
  
  // Diagnostic Log inside the main render function
  console.log('[RENDER] Rendering page:', page.name, 'pageType:', page.pageType, 'widgets:', (page.widgets||[]).length, 'miroCards:', (page.miroCards||[]).length);
  
  const wrap = document.getElementById('cw');
  wrap.classList.remove('cw-slicer');
  if (page.id.startsWith('time_')) {
    document.getElementById('miro-canvas').classList.add('hidden');
    document.body.classList.remove('miro-active');
    const mz = document.getElementById('miro-zoom');
    if (mz) mz.classList.add('show');
    const mzMiro = document.getElementById('mz-controls-miro');
    if (mzMiro) mzMiro.style.display = 'none';
    const maf = document.getElementById('miro-add-float');
    if (maf) maf.classList.remove('show');
    const mtb = document.getElementById('miro-toolbar');
    if (mtb) mtb.classList.remove('show');
    
    wrap.style.display = '';
    wrap.classList.add('embedded-overlay');
    wrap.style.gridTemplateColumns = '';
    // Only clear wrap if overlay isn't already embedded — prevents visual flash
    if (!wrap.querySelector('.gantt-overlay')) {
      wrap.innerHTML = '';
    }
    const idx = {
      'time_today': 0,
      'time_gantt': 1,
      'time_stats': 2,
      'time_fruit': 3,
      'time_zooper': 4,
      'time_life': 5
    }[page.id];
    if (typeof window._openGanttOverlay === 'function') {
      window._openGanttOverlay(idx, wrap);
    }
    return;
  }
  wrap.classList.remove('embedded-overlay');

  document.getElementById('cw').style.display = isMiro ? 'none' : '';
  document.getElementById('miro-canvas').classList.toggle('hidden', !isMiro);
  document.body.classList.toggle('miro-active', isMiro);
  
  const mz = document.getElementById('miro-zoom');
  if (mz) mz.classList.add('show');
  
  const mzMiro = document.getElementById('mz-controls-miro');
  if (mzMiro) mzMiro.style.display = isMiro ? '' : 'none';
  const mzSlicer = document.getElementById('mz-controls-slicer');
  if (mzSlicer) mzSlicer.style.display = (page.pageType === 'slicer') ? 'flex' : 'none';
  
  const maf = document.getElementById('miro-add-float');
  if (maf) maf.classList.toggle('show', isMiro);
  
  const mtb = document.getElementById('miro-toolbar');
  const toolbarShown = isMiro || page.pageType === 'slicer';
  if (mtb) mtb.classList.toggle('show', toolbarShown);
  document.body.classList.toggle('left-toolbar-active', toolbarShown);
  
  const colsWrap = document.getElementById('cols-wrap');
  if (colsWrap) colsWrap.style.display = isMiro ? 'none' : 'flex';
  
  if (isMiro) {
    page._guidesMode = false;
    page._layoutGuidesMode = false;
    if (typeof window.initMiroSlices === 'function') {
      window.initMiroSlices();
    }
    if (typeof buildMiroCanvas === 'function') buildMiroCanvas();
    if (typeof buildOutline === 'function') buildOutline();
    if (typeof updateGuidesButtonState === 'function') updateGuidesButtonState();
    if (typeof updateLayoutGuidesButtonState === 'function') updateLayoutGuidesButtonState();
    return;
  }
  
  if (page.pageType === 'slicer') {
    // Rescue #miro-sel-frame before clearing DOM — it may have been moved into a slicer cell
    const _rescueFrame = document.getElementById('miro-sel-frame');
    const _homeBoard = document.getElementById('miro-board');
    if (_rescueFrame && _homeBoard && _rescueFrame.parentNode !== _homeBoard) {
      _homeBoard.appendChild(_rescueFrame);
    }
    if (_rescueFrame) _rescueFrame.style.display = 'none';
    _miroSelected.clear();
    
    wrap.innerHTML = '';
    wrap.style.gridTemplateColumns = '';
    wrap.classList.add('cw-slicer');
    buildSlicerPage(page, wrap);
    if (typeof buildOutline === 'function') buildOutline();
    return;
  }

  wrap.innerHTML = '';
  wrap.style.gridTemplateColumns = `repeat(${page.cols || 3},minmax(0,1fr))`;
  for (let ci = 0; ci < (page.cols || 3); ci++) {
    const col = document.createElement('div');
    col.className = 'col';
    col.dataset.ci = ci;
    col.addEventListener('dragover', (e) => {
      e.preventDefault();
      col.classList.add('dragover');
    });
    col.addEventListener('dragleave', () => col.classList.remove('dragover'));
    col.addEventListener('drop', (e) => {
      e.preventDefault();
      col.classList.remove('dragover');
      if (!dragWid) return;
      const w = (page.widgets || []).find((x) => x.id === dragWid);
      if (w) {
        w.col = ci;
        sv();
        buildCols();
      }
      dragWid = null;
    });
    const colWidgets = (page.widgets || []).filter((w) => w.col === ci);
    if (ci === (page.cols || 3) - 1) {
      (page.widgets || []).filter((w) => w.col >= (page.cols || 3)).forEach((w) => colWidgets.push(w));
    }
    colWidgets.forEach((w) => col.appendChild(buildWidget(w)));
    const ab = document.createElement('button');
    ab.className = 'add-w';
    ab.innerHTML = '＋ Add Widget';
    ab.onclick = () => {
      pColIdx = ci;
      openM('m-aw');
    };
    col.appendChild(ab);
    wrap.appendChild(col);
  }
  if (typeof buildOutline === 'function') buildOutline();
}
function luma(c) {
  return (c.r * 299 + c.g * 587 + c.b * 114) / 1000;
}
function buildWidget(w) {
  const el = document.createElement('div');
  el.className = 'widget edit';
  el.dataset.wid = w.id;
  el.draggable = true;
  const c = w.color || DEF_COLOR;
  const light = luma(c) > 140;
  const txtCol = light ? '#111' : '#dde1ee';
  const muCol = light ? '#666' : 'rgba(255,255,255,.42)';
  const bdCol = light ? 'rgba(0,0,0,.1)' : `rgba(255,255,255,${Math.min(c.a * 0.13, 0.09)})`;
  el.style.cssText = `background:${rgba(c)};border:1px solid ${bdCol};color:${txtCol};--w-tx:${txtCol};--w-mu:${muCol}`;
  el.addEventListener('dragstart', () => {
    dragWid = w.id;
    setTimeout(() => el.classList.add('dragging'), 0);
  });
  el.addEventListener('dragend', () => {
    el.classList.remove('dragging');
    dragWid = null;
  });
  el.addEventListener('dragover', (e) => {
    if (_dragInboxId || (_dragBmId && w.type !== 'note' && w.type !== 'todo')) {
      e.preventDefault();
      el.style.outline = '2px solid var(--ac)';
    }
  });
  el.addEventListener('dragleave', () => {
    el.style.outline = '';
  });
  el.addEventListener('drop', (e) => {
    if (_dragInboxId) {
      e.preventDefault();
      el.style.outline = '';
      const inboxItem = (D.inbox || []).find((x) => x.id === _dragInboxId);
      if (inboxItem && w.type !== 'note') {
        if (!w.items) w.items = [];
        w.items.push({ id: uid(), label: inboxItem.label, url: inboxItem.url, emoji: '' });
        D.inbox = D.inbox.filter((x) => x.id !== _dragInboxId);
        _dragInboxId = null;
        sv();
        buildCols();
        buildInbox();
      }
    } else if (_dragBmId) {
      e.preventDefault();
      el.style.outline = '';
      if (w.type !== 'note' && w.type !== 'todo') {
        const page = cp();
        let srcW = (page.widgets || []).find(x => x.id === _dragBmSrcWid);
        if (!srcW && page.miroCards) srcW = page.miroCards.find(x => x.id === _dragBmSrcWid);
        if (!srcW) return;
        const bmItemIdx = (srcW.items || []).findIndex(x => x.id === _dragBmId);
        if (bmItemIdx >= 0) {
          const bmItem = srcW.items.splice(bmItemIdx, 1)[0];
          if (!w.items) w.items = [];
          w.items.push(bmItem);
          _dragBmId = null;
          _dragBmSrcWid = null;
          sv();
          if (typeof buildCols === 'function') buildCols();
          if (typeof buildMiroCanvas === 'function') buildMiroCanvas();
        }
      }
    }
  });
  const hdr = document.createElement('div');
  hdr.className = 'wh';
  hdr.style.borderBottomColor = bdCol;
  const exportBtn = (w.type === 'bookmarks' || w.type === 'list') ? `<button class="wab" data-ex2m="${w.id}" title="Export as New Miro Page">🚀 Export as Miro Page</button>` : '';
  const spanLabel = (w.colSpan && w.colSpan > 1) ? w.colSpan : '';
  const spanBtn = `<button class="wab" data-sp="${w.id}" title="Column Span: ${w.colSpan || 1}">↔ Span ${spanLabel}</button>`;
  const copyMiroBtn = (w.type === 'bookmarks') ? `<button class="wab" data-copymiro="${w.id}" title="Copy to Miro Clipboard">📋 Copy to Miro</button>` : '';

  hdr.innerHTML = `
    <div class="wt" style="color:${muCol}"><span>${w.emoji || '📌'}</span>${esc(w.title)}</div>
    <div class="wa">
      <div class="gear-dropdown">
        <button class="wab gear-btn" title="Options">⚙️</button>
        <div class="gear-menu">
          ${spanBtn}
          ${copyMiroBtn}
          ${exportBtn}
          <button class="wab" data-dp="${w.id}" title="Display Settings">🖥️ Display</button>
          <button class="wab" data-mv="${w.id}" title="Move or Copy">📋 Move/Copy</button>
          <button class="wab" data-cl="${w.id}" title="Change Color">🎨 Color</button>
          <button class="wab" data-rn="${w.id}" title="Rename">✏️ Rename</button>
          <button class="wab d" data-dl="${w.id}" title="Delete">🗑️ Delete</button>
        </div>
      </div>
    </div>
  `;

  hdr.querySelector('[data-sp]').onclick = (e) => {
    e.stopPropagation();
    const page = cp();
    const maxSpan = page.cols || 3;
    w.colSpan = ((w.colSpan || 1) % maxSpan) + 1;
    sv(); buildCols();
  };
  const ex2mBtn = hdr.querySelector('[data-ex2m]');
  if (ex2mBtn) {
    ex2mBtn.onclick = (e) => {
      e.stopPropagation();
      exportToMiro(w.id);
    };
  }
  const cmBtn = hdr.querySelector('[data-copymiro]');
  if (cmBtn) {
    cmBtn.onclick = (e) => {
      e.stopPropagation();
      exportToMiroClipboard(w.id);
    };
  }
  hdr.querySelector('[data-dp]').onclick = (e) => {
    e.stopPropagation();
    openDisp(w.id);
  };
  hdr.querySelector('[data-mv]').onclick = (e) => {
    e.stopPropagation();
    openMvModal(w.id);
  };
  hdr.querySelector('[data-cl]').onclick = (e) => {
    e.stopPropagation();
    openColModal(w.id);
  };
  hdr.querySelector('[data-rn]').onclick = (e) => {
    e.stopPropagation();
    openRen(w.id);
  };
  hdr.querySelector('[data-dl]').onclick = (e) => {
    e.stopPropagation();
    delWidget(w.id);
  };
  el.appendChild(hdr);
  const body = document.createElement('div');
  body.className = 'wb';
  if (w.type === 'note') {
    const ta = document.createElement('textarea');
    ta.className = 'note-ta';
    ta.placeholder = 'Write notes…';
    ta.value = w.content || '';
    ta.style.color = txtCol;
    ta.oninput = () => {
      w.content = ta.value;
      sv();
    };
    body.appendChild(ta);
  } else if (w.type === 'todo') {
    buildTodoBody(body, w);
  } else {
    buildBmBody(body, w);
  }
  el.appendChild(body);
  return el;
}
function buildTodoBody(body, w) {
  const list = document.createElement('div');
  list.className = 'todo-list';
  (w.items || []).forEach((item) => {
    list.appendChild(mkTodoItem(item, w));
  });
  const addRow = document.createElement('div');
  addRow.className = 'todo-add';
  const addIn = document.createElement('input');
  addIn.className = 'todo-add-in';
  addIn.type = 'text';
  addIn.placeholder = 'Add a task…';
  addIn.onkeydown = (e) => {
    if (e.key === 'Enter') {
      const txt = addIn.value.trim();
      if (!txt) return;
      if (!w.items) w.items = [];
      const item = { id: uid(), text: txt, done: false };
      w.items.push(item);
      sv();
      list.insertBefore(mkTodoItem(item, w), addRow);
      addIn.value = '';
    }
  };
  addRow.innerHTML = '<span style="font-size:.8rem;color:var(--mu)">＋</span>';
  addRow.appendChild(addIn);
  list.appendChild(addRow);
  body.appendChild(list);
}
function mkTodoItem(item, w) {
  const row = document.createElement('div');
  row.className = 'todo-it' + (item.done ? ' done' : '');
  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.className = 'todo-cb';
  cb.checked = !!item.done;
  cb.onchange = () => {
    item.done = cb.checked;
    row.classList.toggle('done', item.done);
    sv();
  };
  const txt = document.createElement('input');
  txt.type = 'text';
  txt.className = 'todo-txt';
  txt.value = item.text || '';
  txt.readOnly = true;
  txt.ondblclick = () => {
    txt.readOnly = false;
    txt.focus();
  };
  txt.onblur = () => {
    txt.readOnly = true;
    item.text = txt.value;
    sv();
  };
  txt.onkeydown = (e) => {
    if (e.key === 'Enter') txt.blur();
  };
  const rm = document.createElement('button');
  rm.className = 'rmb mr';
  rm.textContent = '✕';
  rm.onclick = () => {
    if (!w.items) return;
    w.items = w.items.filter((x) => x.id !== item.id);
    sv();
    row.remove();
  };
  row.appendChild(cb);
  row.appendChild(txt);
  row.appendChild(rm);
  return row;
}
function buildBmBody(body, w) {
  const items = w.items || [];
  const visN = w.vis === 'all' ? items.length : parseInt(w.vis) || items.length;
  const shown = items.slice(0, visN);
  const sz = w.size || 'md';
  let mode = w.display || 'auto';
  if (mode === 'auto') mode = shown.length <= 8 ? 'spark' : 'stream';
  const wrap = document.createElement('div');
  wrap.className = sz;
  if (mode === 'spark') {
    wrap.classList.add('spark', sz);
    shown.forEach((bm) => wrap.appendChild(mkSparkItem(bm, w, sz)));
  } else if (mode === 'cloud') {
    wrap.classList.add('cloud');
    shown.forEach((bm) => {
      const a = document.createElement('a');
      a.className = 'cl-it';
      a.href = bm.url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      if (bm.emoji) a.textContent = bm.emoji + ' ' + bm.label;
      else a.textContent = bm.label;
      const rm = mkRm(bm.id, w.id, 'cr');
      a.appendChild(rm);
      setupPv(a, bm);
      makeBmDraggable(a, bm, w);
      wrap.appendChild(a);
    });
  } else if (mode === 'card') {
    wrap.classList.add('cards');
    shown.forEach((bm) => wrap.appendChild(mkCardItem(bm, w, sz)));
  } else {
    wrap.classList.add('stream');
    shown.forEach((bm) => wrap.appendChild(mkStreamItem(bm, w, sz)));
  }
  wrap.appendChild(mkAddBtn(w.id));
  body.appendChild(wrap);
}
function makeBmDraggable(a, bm, w) {
  a.draggable = true;
  a.addEventListener('dragstart', (e) => {
    _dragBmId = bm.id;
    _dragBmSrcWid = w.id;
    e.dataTransfer.effectAllowed = 'move';
    setTimeout(() => a.classList.add('dragging'), 0);
  });
  a.addEventListener('dragend', () => {
    a.classList.remove('dragging');
    _dragBmId = null;
    _dragBmSrcWid = null;
  });
  a.addEventListener('dragover', (e) => {
    if ((_dragBmId && _dragBmId !== bm.id) || _dragInboxId) {
      e.preventDefault();
      e.stopPropagation();
      const rect = a.getBoundingClientRect();
      const isCard = w.display === 'card';
      const isStream = w.display === 'stream';
      const isVertical = isCard || isStream;

      a.classList.remove('bm-drop-top', 'bm-drop-bottom', 'bm-drop-left', 'bm-drop-right');

      if (isVertical) {
        if (e.clientY < rect.top + rect.height / 2) a.classList.add('bm-drop-top');
        else a.classList.add('bm-drop-bottom');
      } else {
        if (e.clientX < rect.left + rect.width / 2) a.classList.add('bm-drop-left');
        else a.classList.add('bm-drop-right');
      }
    }
  });
  a.addEventListener('dragleave', () => {
    a.classList.remove('bm-drop-top', 'bm-drop-bottom', 'bm-drop-left', 'bm-drop-right');
  });
  a.addEventListener('drop', (e) => {
    if ((_dragBmId && _dragBmId !== bm.id) || _dragInboxId) {
      e.preventDefault();
      e.stopPropagation();

      const insertAfter = a.classList.contains('bm-drop-bottom') || a.classList.contains('bm-drop-right');
      a.classList.remove('bm-drop-top', 'bm-drop-bottom', 'bm-drop-left', 'bm-drop-right');

      if (!w.items) w.items = [];
      const targetIdx = w.items.findIndex(x => x.id === bm.id);
      const insertIdx = insertAfter ? targetIdx + 1 : Math.max(0, targetIdx);

      if (_dragInboxId) {
        const inboxItem = (D.inbox || []).find((x) => x.id === _dragInboxId);
        if (inboxItem) {
          w.items.splice(insertIdx, 0, { id: uid(), label: inboxItem.label, url: inboxItem.url, emoji: '' });
          D.inbox = D.inbox.filter((x) => x.id !== _dragInboxId);
          _dragInboxId = null;
          sv();
          if (typeof buildCols === 'function' && !_miroMode) buildCols();
          if (typeof buildMiroCanvas === 'function') buildMiroCanvas();
          if (typeof buildInbox === 'function') buildInbox();
        }
      } else if (_dragBmId) {
        const page = cp();
        let srcW = (page.widgets || []).find(x => x.id === _dragBmSrcWid);
        if (!srcW && page.miroCards) srcW = page.miroCards.find(x => x.id === _dragBmSrcWid);
        if (!srcW) return;

        const bmItemIdx = (srcW.items || []).findIndex(x => x.id === _dragBmId);
        if (bmItemIdx < 0) return;

        let finalInsertIdx = insertIdx;
        // If sorting within the same widget and moving downwards, adjust index
        if (srcW.id === w.id && bmItemIdx < insertIdx) {
          finalInsertIdx--;
        }

        const bmItem = srcW.items.splice(bmItemIdx, 1)[0];
        w.items.splice(finalInsertIdx, 0, bmItem);

        _dragBmId = null;
        _dragBmSrcWid = null;
        sv();
        if (typeof buildCols === 'function' && typeof _miroMode !== 'undefined' && !_miroMode) buildCols();
        if (typeof buildMiroCanvas === 'function') buildMiroCanvas();
      }
    }
  });
}
function mkSparkItem(bm, w, sz) {
  const DIM = { sm: { w: 30, r: 8 }, md: { w: 38, r: 9 }, lg: { w: 82, r: 19 } };
  const d = DIM[sz] || DIM.md;
  const a = document.createElement('a');
  a.className = 'sp-it';
  a.href = bm.url;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  const fav = mkFav(bm, d.w, d.w, d.r);
  const lbl = document.createElement('div');
  lbl.className = 'sp-lb';
  lbl.textContent = bm.label;
  const rm = mkRm(bm.id, w.id, 'tr');
  a.appendChild(fav);
  a.appendChild(lbl);
  a.appendChild(rm);
  setupPv(a, bm);
  makeBmDraggable(a, bm, w);
  return a;
}
function mkStreamItem(bm, w, sz) {
  const DIM = { sm: { w: 15, r: 5 }, md: { w: 19, r: 5 }, lg: { w: 24, r: 6 } };
  const d = DIM[sz] || DIM.md;
  const a = document.createElement('a');
  a.className = 'st-it';
  a.href = bm.url;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  a.title = bm.label;
  const fav = mkFav(bm, d.w, d.w, d.r);
  const lbl = document.createElement('span');
  lbl.className = 'st-lb';
  lbl.textContent = bm.label;
  const rm = mkRm(bm.id, w.id, 'mr');
  a.appendChild(fav);
  a.appendChild(lbl);
  a.appendChild(rm);
  setupPv(a, bm);
  makeBmDraggable(a, bm, w);
  return a;
}
function mkCardItem(bm, w, sz) {
  const DIM = { sm: { w: 24, r: 7 }, md: { w: 32, r: 8 }, lg: { w: 40, r: 9 } };
  const d = DIM[sz] || DIM.md;
  const a = document.createElement('a');
  a.className = 'cd-it';
  a.href = bm.url;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  const fav = mkFav(bm, d.w, d.w, d.r);
  const info = document.createElement('div');
  info.className = 'cd-info';
  const nm = document.createElement('div');
  nm.className = 'cd-nm';
  nm.textContent = bm.label;
  const ur = document.createElement('div');
  ur.className = 'cd-url';
  ur.textContent = domainOf(bm.url);
  info.appendChild(nm);
  info.appendChild(ur);
  const rm = mkRm(bm.id, w.id, 'mr');
  a.appendChild(fav);
  a.appendChild(info);
  a.appendChild(rm);
  setupPv(a, bm);
  makeBmDraggable(a, bm, w);
  return a;
}
function mkRm(itemId, wid, pos) {
  const b = document.createElement('button');
  b.className = `rmb ${pos}`;
  b.textContent = '✕';
  b.onclick = (ev) => {
    ev.stopPropagation();
    ev.preventDefault();
    rmItem(wid, itemId);
  };
  return b;
}
function mkAddBtn(wid) {
  const d = document.createElement('div');
  d.className = 'add-i';
  d.innerHTML = '＋ Add';
  d.onclick = () => {
    pWidId = wid;
    ['bm-u', 'bm-l', 'bm-e'].forEach((id) => (document.getElementById(id).value = ''));
    openM('m-bm');
  };
  return d;
}
function setupPv(el, bm) {
  el.addEventListener('mouseenter', (ev) => {
    clearTimeout(pvTimer);
    pvTimer = setTimeout(
      () => {
        if (_pvMode && bm.url) {
          const pv = document.getElementById('live-pv');
          pv.innerHTML = '<div class="pv-loading">Loading preview…</div>';
          const img = document.createElement('img');
          img.src = 'https://image.thum.io/get/width/600/' + bm.url;
          img.onload = () => {
            pv.innerHTML = '';
            pv.appendChild(img);
          };
          img.onerror = () => {
            pv.innerHTML = '<div class="pv-loading">Preview unavailable</div>';
          };
          pv.style.display = 'block';
          posLivePv(ev);
        } else {
          showPv(bm, ev);
        }
      },
      _pvMode ? 150 : 700,
    );
  });
  el.addEventListener('mouseleave', () => {
    clearTimeout(pvTimer);
    hidePv();
    const pv = document.getElementById('live-pv');
    pv.style.display = 'none';
    pv.innerHTML = '';
  });
  el.addEventListener('mousemove', (ev) => {
    if (_pvMode && document.getElementById('live-pv').style.display === 'block') posLivePv(ev);
    else if (document.getElementById('pvt').style.display === 'block') posPv(ev);
  });
}
function showPv(bm, ev) {
  const pt = document.getElementById('pvt');
  const pvFav = document.getElementById('pv-fav');
  pvFav.innerHTML = '';
  const bg = letterColor(letterOf(bm.label, bm.url));
  pvFav.style.background = bg;
  if (bm.emoji) {
    pvFav.textContent = bm.emoji;
  } else {
    const img = document.createElement('img');
    img.src = getFav(bm.url);
    img.style.cssText = 'width:100%;height:100%;object-fit:contain;border-radius:10px';
    img.onerror = () => {
      img.remove();
      pvFav.textContent = letterOf(bm.label, bm.url);
      pvFav.style.color = '#fff';
      pvFav.style.fontSize = '1.5rem';
      pvFav.style.fontWeight = '700';
    };
    pvFav.appendChild(img);
  }
  document.getElementById('pv-title').textContent = bm.label;
  document.getElementById('pv-domain').textContent = domainOf(bm.url);
  document.getElementById('pv-bar').style.background = `linear-gradient(90deg,${bg},transparent)`;
  pt.style.display = 'block';
  posPv(ev);
}
function hidePv() {
  document.getElementById('pvt').style.display = 'none';
}
function posPv(ev) {
  const pt = document.getElementById('pvt');
  const W = window.innerWidth,
    H = window.innerHeight;
  const tw = pt.offsetWidth || 262,
    th = pt.offsetHeight || 100;
  let x = ev.clientX + 16,
    y = ev.clientY + 14;
  if (x + tw > W - 8) x = ev.clientX - tw - 8;
  if (y + th > H - 8) y = ev.clientY - th - 8;
  pt.style.left = x + 'px';
  pt.style.top = y + 'px';
}
function delWidget(wid) {
  // Check if this widget is the last element on any page
  let willBeEmpty = false;
  let affectedPage = null;
  D.pages.forEach((p) => {
    if (p && p.widgets && p.widgets.some((w) => w.id === wid)) {
      const remaining = p.widgets.filter((w) => w.id !== wid).length;
      const hasCards = p.miroCards && p.miroCards.length > 0;
      if (remaining === 0 && !hasCards) {
        willBeEmpty = true;
        affectedPage = p;
      }
    }
  });

  const promptMsg = willBeEmpty 
    ? "هذا هو العنصر الأخير في الصفحة. حذف هذا الويدجت سيجعل الصفحة فارغة تماماً. هل تريد الاستمرار؟"
    : "Delete this widget?";

  if (!confirm(promptMsg)) return;

  if (willBeEmpty && affectedPage) {
    affectedPage._bypassVersionGuard = true;
  }

  D.pages.forEach((p) => {
    p.widgets = (p.widgets || []).filter((w) => w.id !== wid);
  });
  sv();
  buildCols();
}
function rmItem(wid, itemId) {
  const w = fw(wid);
  if (!w || !w.items) return;
  w.items = w.items.filter((i) => i.id !== itemId);
  sv();
  buildCols();
}
function openRen(wid) {
  const w = fw(wid);
  if (!w) return;
  renWid = wid;
  document.getElementById('rn-t').value = w.title;
  document.getElementById('rn-e').value = w.emoji || '';
  openM('m-ren');
}
document.getElementById('ok-ren').onclick = () => {
  const w = fw(renWid);
  if (!w) return;
  w.title = document.getElementById('rn-t').value.trim() || w.title;
  w.emoji = document.getElementById('rn-e').value.trim() || '📌';
  sv();
  buildCols();
  closeM('m-ren');
};
let selType = 'bookmarks';
document.querySelectorAll('.tc').forEach((c) => {
  c.onclick = () => {
    document.querySelectorAll('.tc').forEach((x) => x.classList.remove('sel'));
    c.classList.add('sel');
    selType = c.dataset.t;
  };
});
document.getElementById('ok-aw').onclick = () => {
  const t = document.getElementById('nw-t').value.trim() || 'New Widget';
  const e2 = document.getElementById('nw-e').value.trim() || '📌';
  const w = {
    id: uid(),
    col: pColIdx,
    title: t,
    emoji: e2,
    type: selType,
    display: 'auto',
    size: 'md',
    vis: 'all',
    color: { ...DEF_COLOR },
    items: selType !== 'note' ? [] : undefined,
    content: selType === 'note' ? '' : undefined,
  };
  const targetPageId = window._widgetAddTargetPageId || D.cur;
  const page = D.pages.find(p => p.id === targetPageId) || cp();
  if (!page.widgets) page.widgets = [];
  page.widgets.push(w);
  sv();
  buildCols();
  closeM('m-aw');
  window._widgetAddTargetPageId = null;
};
document.getElementById('bm-u').addEventListener('blur', () => {
  const u = document.getElementById('bm-u').value.trim();
  if (u && !document.getElementById('bm-l').value) {
    try {
      const h = new URL(u).hostname.replace('www.', '');
      document.getElementById('bm-l').value = h.split('.')[0].replace(/^./, (c) => c.toUpperCase());
    } catch (e3) { }
  }
});
document.getElementById('ok-bm').onclick = () => {
  let url = document.getElementById('bm-u').value.trim();
  if (!url) {
    alert('يا هندسة، لازم تكتب لينك الموقع الأول!');
    return;
  }
  if (!url.startsWith('http')) url = 'https://' + url;
  const label = document.getElementById('bm-l').value.trim() || url;
  const emoji = document.getElementById('bm-e').value.trim();
  const w = fw(pWidId);
  if (!w) return;
  if (!w.items) w.items = [];
  w.items.push({ id: uid(), label, url, emoji });
  sv();
  if (cp().pageType === 'miro') {
    if (typeof buildMiroCanvas === 'function') buildMiroCanvas();
  } else {
    buildCols();
  }
  closeM('m-bm');
};
function openDisp(wid) {
  const w = fw(wid);
  if (!w) return;
  dispWid = wid;
  document.querySelectorAll('#dm-g .dr').forEach((r) => {
    const v = r.querySelector('input').value,
      isSel = v === (w.display || 'auto');
    r.classList.toggle('sel', isSel);
    r.querySelector('input').checked = isSel;
  });
  document.getElementById('dm-sz').value = w.size || 'md';
  document.getElementById('dm-vi').value = w.vis || 'all';
  openM('m-dp');
}
document.querySelectorAll('#dm-g .dr').forEach((r) => {
  r.onclick = () => {
    document.querySelectorAll('#dm-g .dr').forEach((x) => x.classList.remove('sel'));
    r.classList.add('sel');
    r.querySelector('input').checked = true;
  };
});
document.getElementById('ok-dp').onclick = () => {
  const w = fw(dispWid);
  if (!w) return;
  w.display = document.querySelector('#dm-g input:checked').value;
  w.size = document.getElementById('dm-sz').value;
  w.vis = document.getElementById('dm-vi').value;
  sv();
  if (cp().pageType === 'miro') {
    if (typeof buildMiroCanvas === 'function') buildMiroCanvas();
  } else {
    buildCols();
  }
  closeM('m-dp');
};
document.getElementById('dp-all').onclick = () => {
  const mode = document.querySelector('#dm-g input:checked').value;
  const sz = document.getElementById('dm-sz').value,
    vis = document.getElementById('dm-vi').value;
  (cp().widgets || []).forEach((w) => {
    if (w.type !== 'note' && w.type !== 'todo') {
      w.display = mode;
      w.size = sz;
      w.vis = vis;
    }
  });
  (cp().miroCards || []).forEach((w) => {
    if (w.type === 'bwidget') {
      w.display = mode;
      w.size = sz;
      w.vis = vis;
    }
  });
  sv();
  if (cp().pageType === 'miro') {
    if (typeof buildMiroCanvas === 'function') buildMiroCanvas();
  } else {
    buildCols();
  }
  closeM('m-dp');
};
function openColModal(wid) {
  colWid = wid;
  const w = fw(wid);
  const c = w && w.color ? w.color : DEF_COLOR;
  setSl(c.r, c.g, c.b, Math.round(c.a * 100));
  openM('m-col');
}
function setSl(r, g, b, a) {
  document.getElementById('rs').value = r;
  document.getElementById('gs').value = g;
  document.getElementById('bs').value = b;
  document.getElementById('as').value = a;
  syncCol(r, g, b, a);
}
function syncCol(r, g, b, a) {
  document.getElementById('rv').textContent = r;
  document.getElementById('gv').textContent = g;
  document.getElementById('bv').textContent = b;
  document.getElementById('av').textContent = a;
  const hex = '#' + [r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('');
  document.getElementById('cps').style.background = `rgba(${r},${g},${b},${a / 100})`;
  document.getElementById('hexi').value = hex;
  const { c, m, y, k } = rgb2cmyk(r, g, b);
  _skipColor = true;
  document.getElementById('cv').value = c;
  document.getElementById('mv').value = m;
  document.getElementById('yv').value = y;
  document.getElementById('kv').value = k;
  _skipColor = false;
}
['rs', 'gs', 'bs', 'as'].forEach((id) => {
  document.getElementById(id).oninput = () =>
    syncCol(
      +document.getElementById('rs').value,
      +document.getElementById('gs').value,
      +document.getElementById('bs').value,
      +document.getElementById('as').value,
    );
});
document.getElementById('hexi').oninput = function () {
  const h = this.value.trim();
  if (!/^#[0-9a-fA-F]{6}$/.test(h)) return;
  const r = parseInt(h.slice(1, 3), 16),
    g = parseInt(h.slice(3, 5), 16),
    b = parseInt(h.slice(5, 7), 16);
  _skipColor = true;
  document.getElementById('rs').value = r;
  document.getElementById('gs').value = g;
  document.getElementById('bs').value = b;
  _skipColor = false;
  syncCol(r, g, b, +document.getElementById('as').value);
};
['cv', 'mv', 'yv', 'kv'].forEach((id) => {
  document.getElementById(id).oninput = () => {
    if (_skipColor) return;
    const { r, g, b } = cmyk2rgb(
      clamp(+document.getElementById('cv').value, 0, 100),
      clamp(+document.getElementById('mv').value, 0, 100),
      clamp(+document.getElementById('yv').value, 0, 100),
      clamp(+document.getElementById('kv').value, 0, 100),
    );
    _skipColor = true;
    document.getElementById('rs').value = r;
    document.getElementById('gs').value = g;
    document.getElementById('bs').value = b;
    _skipColor = false;
    syncCol(r, g, b, +document.getElementById('as').value);
  };
});
document.getElementById('ok-col').onclick = () => {
  const w = fw(colWid);
  if (!w) return;
  w.color = {
    r: +document.getElementById('rs').value,
    g: +document.getElementById('gs').value,
    b: +document.getElementById('bs').value,
    a: +document.getElementById('as').value / 100,
  };
  sv();
  buildCols();
  closeM('m-col');
};
function rgb2cmyk(r, g, b) {
  if (!r && !g && !b) return { c: 0, m: 0, y: 0, k: 100 };
  let c = 1 - r / 255,
    m = 1 - g / 255,
    y = 1 - b / 255;
  const k = Math.min(c, m, y);
  c = (c - k) / (1 - k) || 0;
  m = (m - k) / (1 - k) || 0;
  y = (y - k) / (1 - k) || 0;
  return {
    c: Math.round(c * 100),
    m: Math.round(m * 100),
    y: Math.round(y * 100),
    k: Math.round(k * 100),
  };
}
function cmyk2rgb(c, m, y, k) {
  c /= 100;
  m /= 100;
  y /= 100;
  k /= 100;
  return {
    r: Math.round(255 * (1 - c) * (1 - k)),
    g: Math.round(255 * (1 - m) * (1 - k)),
    b: Math.round(255 * (1 - y) * (1 - k)),
  };
}
function openM(id) {
  document.getElementById(id).classList.add('open');
}
function closeM(id) {
  document.getElementById(id).classList.remove('open');
  if (id === 'm-aw') {
    document.getElementById('nw-t').value = '';
    document.getElementById('nw-e').value = '';
    selType = 'bookmarks';
    document
      .querySelectorAll('.tc')
      .forEach((x) => x.classList.toggle('sel', x.dataset.t === 'bookmarks'));
  }
  if (id === 'm-bm') {
    document.getElementById('bm-u').value = '';
    document.getElementById('bm-l').value = '';
    document.getElementById('bm-e').value = '';
  }
}
document.querySelectorAll('.mo').forEach((o) => {
  o.addEventListener('click', (e) => {
    if (e.target === o) o.classList.remove('open');
  });
});
document.addEventListener('click', () => {
  document.getElementById('ep').classList.remove('open');
  document.getElementById('io-pop').classList.remove('open');
  document.getElementById('tc-pop').classList.remove('open');
  $sr().classList.remove('show');
});
const stopIds = ['tb', 'ribbon', 'miro-toolbar', 'miro-toolbar-right', 'miro-zoom'];
stopIds.forEach(id => {
  const el = document.getElementById(id);
  if (el) el.addEventListener('click', (e) => e.stopPropagation());
});
document.addEventListener('keydown', (e) => {
  // Shortcut ` or ذ to toggle between split/slicer page and parent/slicer pages
  if (e.code === 'Backquote' || e.key === '`' || e.key === 'ذ') {
    if (
      document.activeElement && (
        document.activeElement.tagName === 'INPUT' ||
        document.activeElement.tagName === 'TEXTAREA' ||
        document.activeElement.tagName === 'SELECT' ||
        document.activeElement.contentEditable === 'true' ||
        document.activeElement.isContentEditable
      )
    ) {
      return;
    }
    e.preventDefault();
    const activePg = cp();
    if (activePg) {
      if (activePg.pageType === 'slicer') {
        const cellKey = window._hoveredCellKey || window._activeCellKey;
        const targetPageId = cellKey && activePg.cellPages ? activePg.cellPages[cellKey] : null;
        if (targetPageId) {
          switchActivePage(targetPageId);
        } else {
          if (typeof showToast === 'function') showToast('قف بالماوس فوق خلية تحتوي على صفحة');
        }
      } else {
        const parentSlicer = D.pages.find(p => p && p.pageType === 'slicer' && p.cellPages && Object.values(p.cellPages).includes(activePg.id));
        if (parentSlicer) {
          switchActivePage(parentSlicer.id);
        } else {
          if (typeof showToast === 'function') showToast('هذه الصفحة غير مدمجة في أي صفحة مقسمة');
        }
      }
    }
    return;
  }

  if (e.key === 'F2') {
    e.preventDefault();
    toggleOutline();
    return;
  }
  if (e.key === 'Escape') {
    document.querySelectorAll('.mo.open').forEach((m) => m.classList.remove('open'));
    ['ep', 'io-pop', 'tc-pop'].forEach((id) =>
      document.getElementById(id).classList.remove('open'),
    );
    $sr().classList.remove('show');
  }
  if (
    e.key.length === 1 &&
    !e.ctrlKey &&
    !e.metaKey &&
    !e.altKey &&
    !document.querySelector('.mo.open') &&
    document.activeElement.tagName !== 'INPUT' &&
    document.activeElement.tagName !== 'TEXTAREA' &&
    !document.activeElement.getAttribute('contenteditable')
  ) {
    const pageObj = cp();
    if (pageObj && (pageObj.pageType === 'miro' || pageObj.pageType === 'slicer')) {
      const miroKeys = new Set([
        'v', 'ر', 'n', 'ى', 't', 'ف', 's', 'س', 'p', 'ح',
        'g', 'ل', 'm', 'ة', 'w', 'ص', 'k', 'ن', 'i', 'ه',
        'b', 'e', 'ث', 'y', 'ئ', 'f', 'ب'
      ]);
      if (miroKeys.has(e.key.toLowerCase())) {
        return;
      }
    }
    var pageMap = {'1':0, '2':1, '3':2, '4':3, '5':4, '6':5};
    var isShortcutKey = (pageMap[e.key] !== undefined || e.key === 'h' || e.key === 'H' || e.key === '\u0623' || e.key === '\u0627');
    if (!isShortcutKey) {
      $si().focus();
    }
  }
});
function renderAll() {
  console.log('[DATA CHECK] Total pages:', D.pages ? D.pages.length : 0);
  D.pages && D.pages.forEach((p, i) => {
    const wc = (p.widgets || []).length;
    const mc = (p.miroCards || []).length;
    const totalBookmarks = (p.widgets || []).reduce((sum, w) => sum + (w.items || []).length, 0);
    if (wc > 0 || mc > 0) console.log('[DATA CHECK] Page', i, p.name, '| widgets:', wc, '| miroCards:', mc, '| totalBookmarks:', totalBookmarks);
  });

  buildEnvs();
  buildGroups();
  buildTabs();
  buildCols();
  applyBG();
  applyContrast();
  buildEP();
  buildAcPop();
  buildBgSwatches();
  buildInbox();
  document.documentElement.style.setProperty('--ac', D.settings.accent || '#6c8fff');
  document.getElementById('ac-dot').style.background = D.settings.accent || '#6c8fff';
}

// ─── Export Bookmark Widget to Miro Clipboard (Copy Paste) ───
function exportToMiroClipboard(widgetId) {
  const w = fw(widgetId);
  if (!w || !w.items || !w.items.length) {
    alert('No bookmarks to export.');
    return;
  }

  const miroCard = {
    id: uid(),
    type: 'bwidget',
    title: w.title || 'Bookmarks',
    emoji: w.emoji || '🗂️',
    items: JSON.parse(JSON.stringify(w.items || [])),
    x: 100,
    y: 100,
    w: 320,
    h: 400,
    color: w.color || { r: 50, g: 50, b: 50, a: 0.8 },
    display: w.display || 'auto',
    size: w.size || 'md',
    vis: w.vis || 'all'
  };

  localStorage.setItem('miro_clipboard', JSON.stringify([miroCard]));
  alert('✅ Widget copied!\nOpen a Miro page and press Ctrl+V to paste the fully interactive widget.');
}

// ─── Export Bookmark Widget to Miro Page (Legacy Grid) ───
function exportToMiro(widgetId) {
  const w = fw(widgetId);
  if (!w || !w.items || !w.items.length) {
    alert('No bookmarks to export.');
    return;
  }
  if (!confirm(`Export "${w.title}" (${w.items.length} links) to a new Miro page?`)) return;

  const pageId = uid();
  const targetGroup = D.curGroup === '__all__' ? D.groups[0].id : D.curGroup;

  // Grid layout: arrange cards in columns
  const CARD_W = 280;
  const CARD_H = 240;
  const GAP = 20;
  const COLS = Math.min(Math.ceil(Math.sqrt(w.items.length)), 6);

  const miroCards = w.items.map((bm, i) => {
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    return {
      id: uid(),
      type: 'card',
      url: bm.url,
      label: bm.label || '',
      x: col * (CARD_W + GAP),
      y: row * (CARD_H + GAP),
      w: CARD_W,
      h: CARD_H,
    };
  });

  D.pages.push({
    id: pageId,
    groupId: targetGroup,
    name: w.title || 'Exported',
    pageType: 'miro',
    miroCards,
    zoom: 100,
    panX: 40,
    panY: 40,
    bg: '',
    bgType: 'none',
    widgets: [],
  });

  switchActivePage(pageId);
}

// ─── Convert Dashboard Page to Miro Page ───
window.convertPageToMiro = function (pageId) {
  const pgIdx = D.pages.findIndex((p) => p.id === pageId);
  if (pgIdx === -1) return;
  const pg = D.pages[pgIdx];

  const newId = uid();
  const newPg = {
    id: newId,
    groupId: pg.groupId,
    name: pg.name, // keep same name
    pageType: 'miro',
    miroCards: [],
    zoom: 100,
    panX: 0,
    panY: 0,
    bg: pg.bg || '',
    bgType: pg.bgType || 'none',
    tabColor: pg.tabColor || '' // keep same color
  };

  const oldWidgets = pg.widgets || [];
  const startX = 100;
  const startY = 100;
  const gap = 40;

  let cursX = startX;
  let cursY = startY;
  let rowMaxH = 0;
  const colsPerRow = 4; // Miro widgets per row

  oldWidgets.forEach((w) => {
    let cardW = 320; let cardH = 400;
    if (w.items && w.items.length > 0) {
      const wCols = 6; const itemPx = 94;
      const reqRows = Math.ceil(w.items.length / wCols);
      cardW = 540; cardH = Math.max(200, 70 + (reqRows * itemPx));
    } else if (w.type === 'note') {
      cardW = 280; cardH = 280;
    } else if (w.type === 'todo') {
      const items = w.items || [];
      cardW = 300; cardH = Math.max(200, 70 + (items.length * 40));
    }
    newPg.miroCards.push({
      id: uid(),
      type: 'bwidget',
      wType: w.type,
      title: w.title || 'Widget',
      emoji: w.emoji || '',
      content: w.content || '',
      items: w.items ? JSON.parse(JSON.stringify(w.items)) : [],
      color: w.color || { r: 255, g: 255, b: 255, a: 1 },
      x: cursX,
      y: cursY,
      w: cardW,
      h: cardH,
      display: w.display || 'spark',
      size: w.size || 'md'
    });

    cursX += cardW + gap;
    rowMaxH = Math.max(rowMaxH, cardH);

    // wrap row
    if (newPg.miroCards.length % colsPerRow === 0) {
      cursX = startX;
      cursY += rowMaxH + gap;
      rowMaxH = 0;
    }
  });

  // Insert immediately after original page
  D.pages.splice(pgIdx + 1, 0, newPg);

  // Switch to new page
  switchActivePage(newId);

  if (typeof showToast === 'function') {
    showToast(`Page converted and exported to Miro.`);
  }
};


// FIX: Removed stale startmine_cache layer that could cause data loss.
// The proper sharded cache (sm_meta, sm_pages_meta, sm_page_{id}) is already used
// in setupShardedListeners() for instant loading.
// Clean up any leftover stale cache on first load:
try { localStorage.removeItem('startmine_cache'); localStorage.removeItem('startmine_cache_ts'); } catch(e) {}

/* ─── Slicer Grid (Page Aggregation) ─── */
window._widgetAddTargetPageId = null;
window._miroAddTargetPageId = null;
window._slicerMergeMode = false;
window._slicerSelectedCells = null;

function injectSlicerStyles() {
  if (document.getElementById('slicer-styles')) return;
  const style = document.createElement('style');
  style.id = 'slicer-styles';
  style.textContent = `
    #cw.cw-slicer {
      display: flex !important;
      flex-direction: column !important;
      flex: 1 !important;
      padding: 0 !important;
      gap: 0 !important;
      height: 0 !important;
      min-height: 0 !important;
      overflow: hidden !important;
      position: relative !important;
      background: transparent !important;
    }
    .slicer-grid-container {
      position: relative;
      width: 100%;
      height: 100%;
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    .slicer-controls-toggle {
      position: absolute;
      top: 10px;
      right: 10px;
      z-index: 10001;
      background: rgba(28, 32, 45, 0.75);
      border: 1px solid rgba(255, 255, 255, 0.12);
      color: #aaa;
      border-radius: 50%;
      width: 34px;
      height: 34px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      backdrop-filter: blur(8px);
      transition: all 0.2s;
      user-select: none;
    }
    .slicer-controls-toggle:hover {
      color: #fff;
      background: rgba(108, 143, 255, 0.25);
      border-color: rgba(108, 143, 255, 0.4);
      box-shadow: 0 0 10px rgba(108, 143, 255, 0.3);
    }
    .slicer-controls {
      position: absolute;
      top: 12px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 10000;
      display: flex;
      gap: 12px;
      align-items: center;
      padding: 8px 16px;
      background: rgba(20, 24, 35, 0.95);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border-radius: 12px;
      border: 1px solid rgba(108, 143, 255, 0.35);
      font-size: 0.85rem;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.6);
      transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
      opacity: 0;
      pointer-events: none;
    }
    .slicer-controls.show {
      opacity: 1;
      pointer-events: auto;
    }
    .slicer-controls input[type="number"] {
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.15);
      color: #fff;
      border-radius: 4px;
      padding: 4px 6px;
      width: 45px;
      text-align: center;
      outline: none;
    }
    .slicer-controls button {
      background: var(--ac, #6c8fff);
      border: none;
      color: #fff;
      padding: 6px 12px;
      border-radius: 6px;
      cursor: pointer;
      font-weight: 500;
      font-size: 0.8rem;
      transition: all 0.2s;
    }
    .slicer-controls button:hover {
      filter: brightness(1.1);
    }
    .slicer-controls button.cancel-btn {
      background: rgba(255, 255, 255, 0.1);
    }
    .slicer-controls button.cancel-btn:hover {
      background: rgba(255, 255, 255, 0.15);
    }
    .slicer-controls button.merge-active {
      background: #ffaa00 !important;
      animation: pulse-merge 1.5s infinite;
    }
    .slicer-controls .merge-help {
      color: #ffaa00;
      font-weight: bold;
      margin-left: 8px;
    }
    .slicer-grid {
      display: grid;
      width: 100%;
      height: 100%;
      gap: 2px;
      background: transparent;
      padding: 0;
      margin: 0;
      box-sizing: border-box;
      flex: 1;
    }
    .slicer-cell {
      display: flex;
      flex-direction: column;
      background: transparent;
      overflow: hidden;
      position: relative;
      height: 100%;
      width: 100%;
    }
    .slicer-cell.selected-for-merge {
      box-shadow: inset 0 0 0 3px #ffaa00 !important;
      z-index: 100;
    }
    .slicer-cell-header {
      position: relative;
      top: 0;
      left: 0;
      right: 0;
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: transparent;
      backdrop-filter: none;
      -webkit-backdrop-filter: none;
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
      padding: 2px 8px;
      height: 24px;
      box-sizing: border-box;
      color: #fff;
      font-family: var(--font, 'Inter', sans-serif);
      font-size: 0.68rem;
      z-index: 10000;
      user-select: none;
      opacity: 1;
      pointer-events: auto;
      transition: opacity 0.2s ease, background 0.2s ease, box-shadow 0.2s ease;
      overflow: visible !important;
    }
    .slicer-cell-header.has-change {
      background: rgba(255, 107, 53, 0.95) !important;
      color: #fff !important;
      box-shadow: 0 0 12px rgba(255, 107, 53, 0.8) !important;
      animation: dyntitle-glow 2s infinite alternate !important;
      opacity: 1 !important;
      pointer-events: auto !important;
    }
    .slicer-cell-header.has-change * {
      color: #fff !important;
    }
    @keyframes dyntitle-glow {
      0% { box-shadow: 0 0 8px rgba(255, 107, 53, 0.6); }
      100% { box-shadow: 0 0 18px rgba(255, 107, 53, 1); }
    }
    .slicer-cell-header-left {
      display: flex;
      align-items: center;
      gap: 6px;
      font-weight: 600;
      overflow: visible;
      white-space: nowrap;
    }
    .slicer-cell-header-center {
      display: flex;
      align-items: center;
      gap: 12px;
      font-size: 0.65rem;
      color: rgba(255, 255, 255, 0.7);
    }
    .slicer-cell-header-right {
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .slicer-cell-header-right button {
      background: rgba(255, 255, 255, 0.08);
      border: 1px solid rgba(255, 255, 255, 0.1);
      color: #ccc;
      padding: 0 5px;
      min-width: 20px;
      height: 20px;
      border-radius: 4px;
      font-size: 0.75rem;
      cursor: pointer;
      transition: all 0.2s;
      display: flex;
      align-items: center;
      justify-content: center;
      box-sizing: border-box;
    }
    .slicer-cell-header-right button:hover {
      background: rgba(108, 143, 255, 0.2);
      border-color: var(--ac, #6c8fff);
      color: #fff;
    }
    .slicer-cell-header.theme-light {
      color: #121420 !important;
      border-bottom: 1px solid rgba(0, 0, 0, 0.08) !important;
    }
    .slicer-cell-header.theme-light .slicer-cell-header-center {
      color: rgba(18, 20, 32, 0.7) !important;
    }
    .slicer-cell-header.theme-light .slicer-cell-header-right button {
      color: #121420 !important;
      background: rgba(0, 0, 0, 0.06) !important;
      border: 1px solid rgba(0, 0, 0, 0.12) !important;
    }
    .slicer-cell-header.theme-light .slicer-cell-header-right button:hover {
      background: rgba(0, 0, 0, 0.12) !important;
      border-color: var(--ac, #6c8fff) !important;
      color: var(--ac, #6c8fff) !important;
    }
    .slicer-cell-color-tag {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      display: inline-block;
      flex-shrink: 0;
    }
    .slicer-cell-dyn-row {
      font-size: 0.65rem;
      opacity: 0.9;
    }
    .slicer-cell-progress-text {
      font-weight: 500;
    }
    .slicer-cell-zoom-text {
      opacity: 0.65;
    }
    .slicer-cell-body {
      width: 100%;
      height: calc(100% - 24px);
      position: relative;
      overflow: hidden;
      background: transparent;
      flex: 1;
    }
    .slicer-splitter {
      position: absolute;
      z-index: 10005;
      background: rgba(108, 143, 255, 0.08);
      transition: background 0.15s, width 0.15s, height 0.15s;
    }
    .slicer-splitter:hover, .slicer-splitter.active-dragging {
      background: var(--ac, #6c8fff) !important;
      box-shadow: 0 0 10px var(--ac, #6c8fff);
    }
    .slicer-splitter-v {
      top: 0;
      bottom: 0;
      width: 6px;
      margin-left: -3px;
      cursor: col-resize;
    }
    .slicer-splitter-v:hover, .slicer-splitter-v.active-dragging {
      width: 8px;
      margin-left: -4px;
    }
    .slicer-splitter-h {
      left: 0;
      right: 0;
      height: 6px;
      margin-top: -3px;
      cursor: row-resize;
    }
    .slicer-splitter-h:hover, .slicer-splitter-h.active-dragging {
      height: 8px;
      margin-top: -4px;
    }
    .slicer-empty-cell {
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      height: 100%;
      color: rgba(255, 255, 255, 0.25);
      font-size: 0.85rem;
      gap: 16px;
      user-select: none;
      background: rgba(28, 32, 45, 0.4);
    }
    .slicer-empty-cell-title {
      font-size: 0.9rem;
      color: rgba(255, 255, 255, 0.45);
      font-weight: 500;
    }
    .slicer-empty-cell-actions {
      display: flex;
      flex-direction: column;
      gap: 10px;
      width: 200px;
      z-index: 2;
    }
    .slicer-empty-cell-actions select {
      width: 100%;
      background: #0a0c10;
      border: 1px solid rgba(255, 255, 255, 0.15);
      color: #fff;
      font-size: 0.8rem;
      padding: 6px 10px;
      border-radius: 6px;
      outline: none;
      cursor: pointer;
    }
    .slicer-empty-cell-actions select option {
      background: #0a0c10;
      color: #fff;
    }
    .slicer-empty-cell-buttons {
      display: flex;
      gap: 8px;
      width: 100%;
    }
    .slicer-empty-cell-buttons button {
      flex: 1;
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid rgba(255, 255, 255, 0.12);
      color: #ccc;
      padding: 6px;
      border-radius: 6px;
      font-size: 0.75rem;
      cursor: pointer;
      transition: all 0.2s;
    }
    .slicer-empty-cell-buttons button:hover {
      background: rgba(108, 143, 255, 0.15);
      border-color: var(--ac, #6c8fff);
      color: #fff;
    }
    .slicer-miro-container {
      position: relative;
      width: 100%;
      height: 100%;
      overflow: hidden;
      background: transparent;
      user-select: none;
    }
    .slicer-miro-board {
      position: absolute;
      top: 0;
      left: 0;
      transform-origin: 0 0;
      width: 50000px;
      height: 50000px;
      pointer-events: auto;
    }
    .slicer-widget-container {
      display: flex;
      gap: 2px;
      height: 100%;
      overflow-x: auto;
      overflow-y: hidden;
      padding: 2px;
      box-sizing: border-box;
      background: transparent;
    }
    .slicer-widget-col {
      flex: 1;
      min-width: 200px;
      display: flex;
      flex-direction: column;
      gap: 4px;
      overflow-y: auto;
      background: rgba(255, 255, 255, 0.01);
      border-radius: 4px;
      padding: 4px;
      border: 1px dashed rgba(255, 255, 255, 0.04);
      box-sizing: border-box;
      height: 100%;
    }
    .slicer-widget-col.dragover {
      background: rgba(108, 143, 255, 0.1);
      border-color: var(--ac, #6c8fff);
    }
    .slicer-widget-col .add-w {
      margin-top: auto;
      width: 100%;
      background: rgba(255, 255, 255, 0.03);
      border: 1px dashed rgba(255, 255, 255, 0.08);
      color: #666;
      padding: 6px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 0.75rem;
      transition: all 0.2s;
    }
    .slicer-widget-col .add-w:hover {
      background: rgba(255, 255, 255, 0.06);
      color: #aaa;
    }
    @keyframes pulse-merge {
      0% { box-shadow: inset 0 0 0 3px rgba(255, 170, 0, 0.4); }
      70% { box-shadow: inset 0 0 0 8px rgba(255, 170, 0, 0.1); }
      100% { box-shadow: inset 0 0 0 3px rgba(255, 170, 0, 0.4); }
    }
    .slicer-headers-autohide .slicer-cell-header {
      position: absolute !important;
      opacity: 0 !important;
      pointer-events: none !important;
    }
    .slicer-headers-autohide .slicer-cell:hover .slicer-cell-header {
      opacity: 1 !important;
      pointer-events: auto !important;
    }
    .slicer-headers-autohide .slicer-cell-body {
      height: 100% !important;
    }
  `;
  document.head.appendChild(style);
}

function getSlicerActiveCells(page) {
  const rows = page.gridRows || 2;
  const cols = page.gridCols || 2;
  const merged = page.mergedCells || [];
  const covered = Array.from({ length: rows }, () => Array(cols).fill(false));
  const cells = [];

  merged.forEach((m, idx) => {
    if (m.rStart >= 0 && m.rStart < rows && m.cStart >= 0 && m.cStart < cols &&
        m.rEnd >= 0 && m.rEnd < rows && m.cEnd >= 0 && m.cEnd < cols) {
      cells.push({
        id: `merged_${idx}`,
        rStart: m.rStart,
        cStart: m.cStart,
        rEnd: m.rEnd,
        cEnd: m.cEnd,
        isMerged: true,
        key: `${m.rStart}_${m.cStart}`
      });
      for (let r = m.rStart; r <= m.rEnd; r++) {
        for (let c = m.cStart; c <= m.cEnd; c++) {
          covered[r][c] = true;
        }
      }
    }
  });

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!covered[r][c]) {
        cells.push({
          id: `cell_${r}_${c}`,
          rStart: r,
          cStart: c,
          rEnd: r,
          cEnd: c,
          isMerged: false,
          key: `${r}_${c}`
        });
      }
    }
  }
  return cells;
}

function autofitSlicerCell(page, cellKey, targetPage, cellW, cellH) {
  if (!page.cellStates) page.cellStates = {};
  const cards = targetPage.miroCards || [];
  if (cards.length === 0) {
    if (!page.cellStates[cellKey]) {
      page.cellStates[cellKey] = { zoom: 30, panX: 0, panY: 0 };
    } else {
      page.cellStates[cellKey].zoom = 30;
      page.cellStates[cellKey].panX = 0;
      page.cellStates[cellKey].panY = 0;
    }
    return;
  }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  cards.forEach(c => {
    const x = c.x || 0, y = c.y || 0;
    const w = c.w || 200, h = c.h || 200;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x + w > maxX) maxX = x + w;
    if (y + h > maxY) maxY = y + h;
  });
  const bw = maxX - minX;
  const bh = maxY - minY;
  if (bw <= 0 || bh <= 0) {
    if (!page.cellStates[cellKey]) {
      page.cellStates[cellKey] = { zoom: 30, panX: 0, panY: 0 };
    } else {
      page.cellStates[cellKey].zoom = 30;
      page.cellStates[cellKey].panX = 0;
      page.cellStates[cellKey].panY = 0;
    }
    return;
  }
  const padding = 20;
  const availW = cellW - padding * 2;
  const availH = cellH - padding * 2;
  const fitZoom = Math.min(availW / bw, availH / bh);
  const newZoomNum = Math.max(10, Math.min(400, Math.round(fitZoom * 100)));
  const newZoom = newZoomNum / 100;
  const panX = (cellW - (minX + maxX) * newZoom) / 2;
  const panY = (cellH - (minY + maxY) * newZoom) / 2;
  
  if (!page.cellStates[cellKey]) {
    page.cellStates[cellKey] = { zoom: newZoomNum, panX, panY };
  } else {
    page.cellStates[cellKey].zoom = newZoomNum;
    page.cellStates[cellKey].panX = panX;
    page.cellStates[cellKey].panY = panY;
  }
}

function applyCellBackground(container, targetPage, cellState) {
  let baseBg = 'transparent';
  if (targetPage && targetPage.bg) {
    if (targetPage.bgType === 'image') {
      baseBg = `url('${targetPage.bg}') center/cover no-repeat`;
    } else {
      baseBg = targetPage.bg;
    }
  }

  if (cellState && cellState.bgColor) {
    const bg = cellState.bgColor;
    const opacity = cellState.bgOpacity != null ? cellState.bgOpacity : 0.15;
    const r = parseInt(bg.slice(1, 3), 16);
    const g = parseInt(bg.slice(3, 5), 16);
    const b = parseInt(bg.slice(5, 7), 16);
    const tint = `rgba(${r}, ${g}, ${b}, ${opacity})`;
    if (baseBg && baseBg !== 'transparent') {
      container.style.background = `linear-gradient(${tint}, ${tint}), ${baseBg}`;
    } else {
      container.style.background = tint;
    }
  } else {
    container.style.background = baseBg;
  }
}

function getHeaderEffectiveBgColor(cellState, targetPage, parentPage) {
  const ho = cellState.headerOpacity != null ? cellState.headerOpacity : 0.0;
  if (cellState.headerColor && ho >= 0.4) {
    return cellState.headerColor;
  }
  const bo = cellState.bgOpacity != null ? cellState.bgOpacity : 0.0;
  if (cellState.bgColor && bo >= 0.4) {
    return cellState.bgColor;
  }
  if (targetPage && targetPage.bg) {
    if (targetPage.bgType !== 'image') {
      return targetPage.bg;
    }
  }
  if (parentPage && parentPage.bg) {
    if (parentPage.bgType !== 'image') {
      return parentPage.bg;
    }
  }
  const defaultBg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
  return defaultBg || '#0d0f18';
}

function isColorLight(color) {
  if (!color) return false;
  color = color.trim();
  if (color.startsWith('#')) return isHexColorLight(color);
  if (color.startsWith('rgb')) return isRgbColorLight(color);
  const hexMatch = color.match(/#[0-9a-fA-F]{3,6}/);
  if (hexMatch) return isHexColorLight(hexMatch[0]);
  const rgbMatch = color.match(/rgb\([^)]+\)/);
  if (rgbMatch) return isRgbColorLight(rgbMatch[0]);
  return false;
}

function getGridColorForPage(targetPage) {
  let isLight = false;
  if (!targetPage.bg) {
    const defaultBg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
    if (defaultBg.startsWith('#')) {
      isLight = isHexColorLight(defaultBg);
    } else {
      isLight = true;
    }
  } else if (targetPage.bgType !== 'image') {
    if (targetPage.bg.startsWith('#')) {
      isLight = isHexColorLight(targetPage.bg);
    } else if (targetPage.bg.startsWith('rgb')) {
      isLight = isRgbColorLight(targetPage.bg);
    }
  }
  return isLight ? 'rgba(0,0,0,' : 'rgba(255,255,255,';
}

function isHexColorLight(hex) {
  hex = hex.replace('#', '');
  if (hex.length === 3) {
    hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
  }
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  const luma = (r * 299 + g * 587 + b * 114) / 1000;
  return luma > 140;
}

function isRgbColorLight(rgb) {
  const m = rgb.match(/\d+/g);
  if (m && m.length >= 3) {
    const r = parseInt(m[0]), g = parseInt(m[1]), b = parseInt(m[2]);
    const luma = (r * 299 + g * 587 + b * 114) / 1000;
    return luma > 140;
  }
  return true;
}

function updateSlicerCellGrid(container, state, targetPage) {
  if (!container || !state || !targetPage) return;
  const overlay = container.querySelector('.slicer-miro-grid-overlay');
  if (!overlay) return;

  const zoom = (state.zoom || 100) / 100;
  const panX = state.panX || 0;
  const panY = state.panY || 0;

  const BASE = 10;
  const FACTOR = 5;

  let fine = BASE;
  while (fine * zoom < 8) fine *= FACTOR;
  while (fine * zoom > 200) fine /= FACTOR;

  const medium = fine * FACTOR;
  const coarse = medium * FACTOR;

  const fineScreen = fine * zoom;
  const medScreen = medium * zoom;
  const coarseScreen = coarse * zoom;

  const fineAlpha = clamp((fineScreen - 6) / 25, 0, 1) * 0.05;
  const medAlpha = clamp((medScreen - 6) / 40, 0, 1) * 0.10;
  const coarseAlpha = clamp((coarseScreen - 6) / 60, 0, 1) * 0.16;

  const layers = [];
  const sizes = [];
  const positions = [];

  const colorPrefix = getGridColorForPage(targetPage);

  function addLevel(screenSize, alpha) {
    if (alpha < 0.002) return;
    const c = `${colorPrefix}${alpha.toFixed(4)})`;
    layers.push(
      `linear-gradient(${c} 1px, transparent 1px)`,
      `linear-gradient(90deg, ${c} 1px, transparent 1px)`,
    );
    const s = `${screenSize}px ${screenSize}px`;
    sizes.push(s, s);
    const ox = panX % screenSize;
    const oy = panY % screenSize;
    const p = `${ox}px ${oy}px`;
    positions.push(p, p);
  }

  addLevel(fineScreen, fineAlpha);
  addLevel(medScreen, medAlpha);
  addLevel(coarseScreen, coarseAlpha);

  if (layers.length) {
    overlay.style.backgroundImage = layers.join(',');
    overlay.style.backgroundSize = sizes.join(',');
    overlay.style.backgroundPosition = positions.join(',');
  } else {
    overlay.style.backgroundImage = 'none';
  }
}

function setupSlicerSubPageListeners(slicerPage) {
  if (!slicerPage.cellPages) return;

  // Mark all subpages of this slicer as loaded
  Object.values(slicerPage.cellPages).forEach(subPid => {
    const pg = D.pages.find(p => p && p.id === subPid);
    if (pg) pg._hasBeenLoaded = true;
  });

  if (_offlineMode) return; // Do not attach Firebase listeners in offline mode

  // Get unique subpage IDs to listen to, filtering out slicer pages to prevent circular listeners
  const subPageIds = [...new Set(Object.values(slicerPage.cellPages))].filter(subPid => {
    const pg = D.pages.find(p => p && p.id === subPid);
    return pg && pg.pageType !== 'slicer' && subPid && subPid !== slicerPage.id;
  });

  const targetPaths = subPageIds.map(subPid => `users/${USER_ID}/startmine_pages/${subPid}`).sort();
  const currentPaths = (window._activeSubPageListeners || []).map(item => item.path).sort();
  const pathsMatch = currentPaths.length === targetPaths.length && currentPaths.every((val, idx) => val === targetPaths[idx]);
  if (pathsMatch) {
    return;
  }

  // Clear any existing subpage listeners first
  if (window._activeSubPageListeners) {
    window._activeSubPageListeners.forEach(item => {
      try {
        db.ref(item.path).off('value', item.callback);
      } catch(e) { console.warn('[SYNC SUB DETACH]', e); }
    });
  }
  window._activeSubPageListeners = [];
  
  subPageIds.forEach(subPid => {
    const path = `users/${USER_ID}/startmine_pages/${subPid}`;
    let initial = true;
    const callback = (snap) => {
      if (isOwnWrite()) return;
      const pData = snap.val() || { widgets: [], miroCards: [] };
      
      const pg = D.pages.find(p => p && p.id === subPid);
      if (pg) {
        if (isPagePayloadEqual(pg, pData)) {
          pg.ts = pData.ts || 0;
          return;
        }
        // Timestamp Guard
        const incomingTs = pData.ts || 0;
        const localTs = pg.ts || 0;
        if (localTs > incomingTs) {
          console.warn(`[FIREBASE SUB GUARD ⛔] Local data for subpage "${pg.name}" is newer (${localTs}) than incoming (${incomingTs}) — ignoring update.`);
          return;
        }

        // Overwrite empty guard (same as main page)
        const incomingW = (pData.widgets || []).length;
        const incomingC = (pData.miroCards || []).length;
        const incomingG = (pData.vGuides || []).length + (pData.hGuides || []).length + (pData.customCells || []).length;
        const localW = (pg.widgets || []).length;
        const localC = (pg.miroCards || []).length;
        const localG = (pg.vGuides || []).length + (pg.hGuides || []).length + (pg.customCells || []).length;
        const incomingEmpty = (incomingW === 0 && incomingC === 0 && incomingG === 0);
        const localHasData = (localW > 0 || localC > 0 || localG > 0);
        if (incomingEmpty && localHasData && incomingTs <= localTs) {
          console.error(`[FIREBASE SUB GUARD ⛔] Incoming data for subpage "${pg.name}" is EMPTY but local has data — IGNORING Firebase update!`);
          return;
        }

        pg.widgets = pData.widgets || [];
        pg.miroCards = pData.miroCards || [];
        pg.vGuides = pData.vGuides || [];
        pg.hGuides = pData.hGuides || [];
        pg._guidesMode = pData._guidesMode || false;
        pg.lockedGuides = pData.lockedGuides || [];
        pg.cellStates = pData.cellStates || {};
        pg.mergedCells = pData.mergedCells || [];
        pg.customCells = pData.customCells || [];
        pg.gridRows = pData.gridRows !== undefined ? pData.gridRows : null;
        pg.gridCols = pData.gridCols !== undefined ? pData.gridCols : null;
        pg.cellPages = pData.cellPages !== undefined ? pData.cellPages : null;
        pg.slicerColSizes = pData.slicerColSizes !== undefined ? pData.slicerColSizes : null;
        pg.slicerRowSizes = pData.slicerRowSizes !== undefined ? pData.slicerRowSizes : null;
        pg.cellGuides = pData.cellGuides !== undefined ? pData.cellGuides : {};
        pg._layoutGuidesMode = pData._layoutGuidesMode !== undefined ? pData._layoutGuidesMode : false;
        pg.ts = incomingTs;
        pg._hasBeenLoaded = true;

        // Cache locally
        cachePageData(subPid, {
          widgets: pg.widgets,
          miroCards: pg.miroCards,
          vGuides: pg.vGuides,
          hGuides: pg.hGuides,
          _guidesMode: pg._guidesMode,
          lockedGuides: pg.lockedGuides,
          cellStates: pg.cellStates,
          mergedCells: pg.mergedCells,
          customCells: pg.customCells,
          gridRows: pg.gridRows,
          gridCols: pg.gridCols,
          cellPages: pg.cellPages,
          slicerColSizes: pg.slicerColSizes,
          slicerRowSizes: pg.slicerRowSizes,
          cellGuides: pg.cellGuides,
          _layoutGuidesMode: pg._layoutGuidesMode,
          ts: pg.ts
        });

        // Trigger rebuild to update Slicer view (only if not the initial synchronous call)
        if (!initial && cp().id === slicerPage.id) {
          buildCols();
        }
      }
    };

    db.ref(path).on('value', callback);
    initial = false;
    window._activeSubPageListeners.push({ path, callback });
  });
}

function createBlankPageForSlicerCell(slicerPage, cellKey, pageType) {
  const newPid = uid();
  const targetGroup = D.curGroup === '__all__' ? D.groups[0].id : D.curGroup;
  const count = D.pages.filter(p => p.groupId === targetGroup).length;
  const pageName = (pageType === 'miro' ? 'Canvas ' : 'Dashboard ') + (count + 1);
  
  const newPage = {
    id: newPid,
    groupId: targetGroup,
    name: pageName,
    pageType: pageType,
    zoom: 100,
    panX: 0,
    panY: 0,
    bg: '',
    bgType: 'none',
    widgets: [],
    miroCards: []
  };
  
  D.pages.push(newPage);
  if (!slicerPage.cellPages) slicerPage.cellPages = {};
  slicerPage.cellPages[cellKey] = newPid;
  
  sv();
  buildCols();
  if (typeof showToast === 'function') {
    showToast(`✅ Created blank ${pageType === 'miro' ? 'Canvas' : 'Dashboard'} "${pageName}"`);
  }
}

function buildSlicerPage(page, wrap) {
  injectSlicerStyles();
  setupSlicerSubPageListeners(page);
  
  // Initialize window._activeCellKey to first active cell if not set or invalid
  const cellsList = getSlicerActiveCells(page);
  if (cellsList && cellsList.length > 0) {
    if (!window._activeCellKey || !cellsList.some(c => c.key === window._activeCellKey)) {
      window._activeCellKey = cellsList[0].key;
    }
  }
  
  const containerEl = document.createElement('div');
  containerEl.className = 'slicer-grid-container';
  if (D.settings && D.settings.slicerHeadersAutoHide) {
    containerEl.classList.add('slicer-headers-autohide');
  }
  
  // Bind bottom Slicer toolbar controls
  const tbRowsInput = document.getElementById('slicer-tb-rows');
  const tbColsInput = document.getElementById('slicer-tb-cols');
  const tbApplyBtn = document.getElementById('slicer-tb-apply');
  const tbMergeBtn = document.getElementById('slicer-tb-merge');
  const tbResetBtn = document.getElementById('slicer-tb-reset');
  const tbRevertBtn = document.getElementById('slicer-tb-revert');
  const tbFitAllBtn = document.getElementById('slicer-tb-fit-all');
  
  if (tbFitAllBtn) {
    tbFitAllBtn.onclick = (e) => {
      e.stopPropagation();
      const cells = getSlicerActiveCells(page);
      cells.forEach(cell => {
        const targetPageId = page.cellPages ? page.cellPages[cell.key] : null;
        const targetPage = targetPageId ? D.pages.find(p => p.id === targetPageId) : null;
        
        // Find cell's body element to get dimensions
        const cellEl = document.querySelector(`.slicer-cell[data-cell-key="${cell.key}"]`);
        const bodyEl = cellEl ? cellEl.querySelector('.slicer-cell-body') : null;
        const cellW = bodyEl ? bodyEl.clientWidth || 300 : 300;
        const cellH = bodyEl ? bodyEl.clientHeight || 200 : 200;
        
        if (targetPage && targetPage.pageType === 'miro') {
          autofitSlicerCell(page, cell.key, targetPage, cellW, cellH);
        } else {
          if (!page.cellStates) page.cellStates = {};
          page.cellStates[cell.key] = { zoom: 30, panX: 0, panY: 0 };
        }
      });
      sv();
      buildCols();
      if (typeof showToast === 'function') {
        showToast('🔍 Zoom-fitted all cells! (Empty cells set to 30%)');
      }
    };
  }
  
  if (tbRowsInput) tbRowsInput.value = page.gridRows || 2;
  if (tbColsInput) tbColsInput.value = page.gridCols || 2;
  
  if (tbApplyBtn) {
    tbApplyBtn.onclick = (e) => {
      e.stopPropagation();
      const r = parseInt(tbRowsInput.value);
      const c = parseInt(tbColsInput.value);
      if (isNaN(r) || r < 1 || r > 10 || isNaN(c) || c < 1 || c > 10) {
        alert('Please enter valid dimensions between 1x1 and 10x10.');
        return;
      }
      page.gridRows = r;
      page.gridCols = c;
      page.mergedCells = (page.mergedCells || []).filter(m => 
        m.rStart < r && m.rEnd < r && m.cStart < c && m.cEnd < c
      );
      
      // Reset resizer splitters to equal sizes
      page.slicerColSizes = Array(c).fill(100 / c);
      page.slicerRowSizes = Array(r).fill(100 / r);
      
      const newCellPages = {};
      for (const key in (page.cellPages || {})) {
        const [row, col] = key.split('_').map(Number);
        if (row < r && col < c) {
          newCellPages[key] = page.cellPages[key];
        }
      }
      page.cellPages = newCellPages;
      sv();
      buildCols();
    };
  }
  
  if (tbMergeBtn) {
    tbMergeBtn.classList.toggle('merge-active', !!window._slicerMergeMode);
    tbMergeBtn.style.background = window._slicerMergeMode ? '#ffaa00' : '';
    tbMergeBtn.textContent = window._slicerMergeMode ? 'Confirm Merge' : 'Merge';
    
    tbMergeBtn.onclick = (e) => {
      e.stopPropagation();
      if (!window._slicerMergeMode) {
        window._slicerMergeMode = true;
        window._slicerSelectedCells = new Set();
        buildCols();
      } else {
        const selected = Array.from(window._slicerSelectedCells).map(k => {
          const [r, c] = k.split('_').map(Number);
          return { r, c };
        });
        if (selected.length < 2) {
          alert('Please select at least 2 cells to merge.');
          return;
        }
        let minR = Infinity, maxR = -Infinity;
        let minC = Infinity, maxC = -Infinity;
        selected.forEach(cell => {
          minR = Math.min(minR, cell.r);
          maxR = Math.max(maxR, cell.r);
          minC = Math.min(minC, cell.c);
          maxC = Math.max(maxC, cell.c);
        });
        const area = (maxR - minR + 1) * (maxC - minC + 1);
        if (selected.length !== area) {
          alert('Selected cells must form a contiguous rectangular block with no gaps.');
          return;
        }
        page.mergedCells = (page.mergedCells || []).filter(m => {
          const intersect = !(
            m.rEnd < minR || m.rStart > maxR ||
            m.cEnd < minC || m.cStart > maxC
          );
          return !intersect;
        });
        page.mergedCells.push({ rStart: minR, cStart: minC, rEnd: maxR, cEnd: maxC });
        
        const targetKey = `${minR}_${minC}`;
        let inheritedPageId = null;
        selected.forEach(cell => {
          const k = `${cell.r}_${cell.c}`;
          if (page.cellPages[k]) {
            if (!inheritedPageId) inheritedPageId = page.cellPages[k];
            delete page.cellPages[k];
          }
        });
        if (inheritedPageId) {
          page.cellPages[targetKey] = inheritedPageId;
        }
        window._slicerMergeMode = false;
        window._slicerSelectedCells = null;
        sv();
        buildCols();
      }
    };
  }
  
  if (tbResetBtn) {
    tbResetBtn.style.display = (page.mergedCells && page.mergedCells.length > 0) ? 'block' : 'none';
    tbResetBtn.onclick = (e) => {
      e.stopPropagation();
      if (confirm('Reset all cell merges?')) {
        page.mergedCells = [];
        page.cellStates = {};
        sv();
        buildCols();
      }
    };
  }
  
  const tbDistributeBtn = document.getElementById('slicer-tb-distribute');
  if (tbDistributeBtn) {
    tbDistributeBtn.onclick = (e) => {
      e.stopPropagation();
      const r = page.gridRows || 2;
      const c = page.gridCols || 2;
      page.slicerColSizes = Array(c).fill(100 / c);
      page.slicerRowSizes = Array(r).fill(100 / r);
      sv();
      buildCols();
      if (typeof showToast === 'function') {
        showToast('⚖️ Split-screen sizes distributed equally!');
      }
    };
  }

  if (tbRevertBtn) {
    tbRevertBtn.onclick = (e) => {
      e.stopPropagation();
      if (confirm('Revert this split-screen layout back to a standard page?')) {
        let firstPageId = null;
        if (page.cellPages) {
          const keys = Object.keys(page.cellPages);
          if (keys.length > 0) firstPageId = page.cellPages[keys[0]];
        }
        const targetPage = firstPageId ? D.pages.find(p => p.id === firstPageId) : null;
        page.pageType = targetPage ? targetPage.pageType : 'miro';
        sv();
        switchActivePage(page.id);
      }
    };
  }
  
  const colCount = page.gridCols || 2;
  if (!page.slicerColSizes || page.slicerColSizes.length !== colCount) {
    page.slicerColSizes = Array(colCount).fill(100 / colCount);
  }
  const rowCount = page.gridRows || 2;
  if (!page.slicerRowSizes || page.slicerRowSizes.length !== rowCount) {
    page.slicerRowSizes = Array(rowCount).fill(100 / rowCount);
  }
  
  // Render grid wrapper
  const gridEl = document.createElement('div');
  gridEl.className = 'slicer-grid';
  gridEl.style.gridTemplateRows = page.slicerRowSizes.map(s => `${s}fr`).join(' ');
  gridEl.style.gridTemplateColumns = page.slicerColSizes.map(s => `${s}fr`).join(' ');
  
  const cells = getSlicerActiveCells(page);
  cells.forEach(cell => {
    const cellEl = document.createElement('div');
    cellEl.className = 'slicer-cell';
    cellEl.dataset.cellKey = cell.key;
    cellEl.style.gridRowStart = cell.rStart + 1;
    cellEl.style.gridRowEnd = cell.rEnd + 2;
    cellEl.style.gridColumnStart = cell.cStart + 1;
    cellEl.style.gridColumnEnd = cell.cEnd + 2;
    
    // Add hover listeners to cell to update tab title dynamically
    cellEl.addEventListener('mouseenter', () => {
      window._hoveredCellKey = cell.key;
      if (typeof window.updateTabTitleForHoveredCell === 'function') {
        window.updateTabTitleForHoveredCell();
      }
    });
    cellEl.addEventListener('mouseleave', () => {
      if (window._hoveredCellKey === cell.key) {
        window._hoveredCellKey = null;
        if (typeof window.updateTabTitleForHoveredCell === 'function') {
          window.updateTabTitleForHoveredCell();
        }
      }
    });
    cellEl.addEventListener('mousedown', () => {
      window._activeCellKey = cell.key;
      window._hoveredCellKey = cell.key;
    });
    
    if (window._slicerMergeMode) {
      cellEl.style.cursor = 'pointer';
      const slots = [];
      for (let r = cell.rStart; r <= cell.rEnd; r++) {
        for (let c = cell.cStart; c <= cell.cEnd; c++) {
          slots.push(`${r}_${c}`);
        }
      }
      const isSel = slots.some(s => window._slicerSelectedCells.has(s));
      if (isSel) cellEl.classList.add('selected-for-merge');
      
      cellEl.onclick = () => {
        const anySelected = slots.some(s => window._slicerSelectedCells.has(s));
        if (anySelected) {
          slots.forEach(s => window._slicerSelectedCells.delete(s));
          cellEl.classList.remove('selected-for-merge');
        } else {
          slots.forEach(s => window._slicerSelectedCells.add(s));
          cellEl.classList.add('selected-for-merge');
        }
        const count = window._slicerSelectedCells.size;
        if (tbMergeBtn) tbMergeBtn.textContent = count > 0 ? `Confirm Merge (${count} slots)` : 'Confirm Merge';
      };
      gridEl.appendChild(cellEl);
      return;
    }
    
    const bodyEl = document.createElement('div');
    bodyEl.className = 'slicer-cell-body';
    
    const cellState = (page.cellStates && page.cellStates[cell.key]) || {};
    const targetPageId = page.cellPages ? page.cellPages[cell.key] : null;
    const targetPage = targetPageId ? D.pages.find(p => p.id === targetPageId) : null;
    
    // Apply page background and cell custom background color to cellEl container
    applyCellBackground(cellEl, targetPage || page, cellState);

    if (targetPage) {
        if ((!targetPage.miroCards || targetPage.miroCards.length === 0) && (!targetPage.widgets || targetPage.widgets.length === 0) && !targetPage._bypassVersionGuard) {
          const cached = getCachedPageData(targetPageId);
          if (cached) {
            targetPage.miroCards = cached.miroCards || [];
            targetPage.widgets = cached.widgets || [];
            targetPage.zoom = cached.zoom || 100;
            targetPage.panX = cached.panX || 0;
            targetPage.panY = cached.panY || 0;
          }
        }
        
        // Render Premium Cell Header Bar
        const headerEl = document.createElement('div');
        headerEl.className = 'slicer-cell-header';
        headerEl.dataset.cellKey = cell.key;
        
        // Left part: Icon & Title
        const leftEl = document.createElement('div');
        leftEl.className = 'slicer-cell-header-left';
        
        let displayIcon = cellState.icon || '';
        let iconSize = cellState.iconSize || 20;
        
        if (displayIcon) {
          const iconImg = document.createElement('img');
          iconImg.src = displayIcon;
          iconImg.style.cssText = `width:auto;max-width:${iconSize}px;max-height:${iconSize}px;object-fit:contain;flex-shrink:0;z-index:10001;position:relative;`;
          leftEl.appendChild(iconImg);
        } else {
          const typeIcon = document.createElement('span');
          typeIcon.textContent = targetPage.pageType === 'miro' ? '🖼️' : '🗂️';
          leftEl.appendChild(typeIcon);
        }
        
        if (cellState.colorTag) {
          const dot = document.createElement('span');
          dot.className = 'slicer-cell-color-tag';
          dot.style.background = cellState.colorTag;
          leftEl.appendChild(dot);
        }
        
        const titleSpan = document.createElement('span');
        titleSpan.className = 'slicer-cell-title-text';
        titleSpan.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:120px;';
        const dynamicVal = cellState.dynamicType ? window.getDynamicTitleValue(cellState.dynamicType) : '';
        titleSpan.textContent = cellState.title || dynamicVal || targetPage.name;
        leftEl.appendChild(titleSpan);
        
        if (cellState.title && dynamicVal) {
          const dynRow = document.createElement('span');
          dynRow.className = 'slicer-cell-dyn-row';
          dynRow.style.cssText = 'font-size: 0.65rem; opacity: 0.8; margin-left: 6px;';
          dynRow.textContent = `[${dynamicVal}]`;
          leftEl.appendChild(dynRow);
        }
        headerEl.appendChild(leftEl);
        
        // Center part: dynamic status progress & zoom
        const centerEl = document.createElement('div');
        centerEl.className = 'slicer-cell-header-center';
        
        if (cellState.dynamicType) {
          const progVal = window.getDynamicProgressValue ? window.getDynamicProgressValue(cellState.dynamicType) : '';
          if (progVal) {
            const progSpan = document.createElement('span');
            progSpan.className = 'slicer-cell-progress-text';
            progSpan.textContent = progVal;
            centerEl.appendChild(progSpan);
          }
        }
        
        const zoomSpan = document.createElement('span');
        zoomSpan.className = 'slicer-cell-zoom-text';
        zoomSpan.textContent = `${cellState.zoom || 100}%`;
        centerEl.appendChild(zoomSpan);
        headerEl.appendChild(centerEl);
        
        // Right part: actions (⚙️ settings, 🔍 fit, 🔗 max, ✕ close)
        const rightEl = document.createElement('div');
        rightEl.className = 'slicer-cell-header-right';
        
        // Helper to bind robust click/touchstart triggers
        const bindHeaderAction = (btn, actionFn) => {
          let triggered = false;
          const handler = (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (triggered) return;
            triggered = true;
            setTimeout(() => { triggered = false; }, 500);
            actionFn(e);
          };
          btn.onclick = handler;
          btn.onmousedown = (e) => e.stopPropagation();
          btn.ontouchstart = handler;
        };

        const settingsBtn = document.createElement('button');
        settingsBtn.innerHTML = '⚙️';
        settingsBtn.title = 'Cell Settings';
        bindHeaderAction(settingsBtn, () => {
          if (typeof window.showCellSettingsModal === 'function') {
            window.showCellSettingsModal(cell.key);
          }
        });
        rightEl.appendChild(settingsBtn);
        
        if (targetPage.pageType === 'miro') {
          const fitBtn = document.createElement('button');
          fitBtn.innerHTML = '🔍 Fit';
          fitBtn.title = 'Autofit elements';
          bindHeaderAction(fitBtn, () => {
            const cellW = bodyEl.clientWidth || 300;
            const cellH = bodyEl.clientHeight || 200;
            autofitSlicerCell(page, cell.key, targetPage, cellW, cellH);
            sv();
            buildCols();
          });
          rightEl.appendChild(fitBtn);
        }
        
        const maxBtn = document.createElement('button');
        maxBtn.innerHTML = '🔗';
        maxBtn.title = 'Go to original page';
        bindHeaderAction(maxBtn, () => {
          switchActivePage(targetPage.id);
        });
        rightEl.appendChild(maxBtn);
        
        const closeSplitBtn = document.createElement('button');
        closeSplitBtn.innerHTML = '✕';
        closeSplitBtn.title = 'Remove page from cell';
        closeSplitBtn.style.color = '#ff5e5e';
        bindHeaderAction(closeSplitBtn, () => {
          if (confirm('Remove this page split?')) {
            delete page.cellPages[cell.key];
            if (page.cellStates) delete page.cellStates[cell.key];
            sv();
            buildCols();
          }
        });
        rightEl.appendChild(closeSplitBtn);
        headerEl.appendChild(rightEl);
        
        if (cellState.hasUnacknowledgedChange) {
          headerEl.classList.add('has-change');
        }
        headerEl.onclick = (e) => {
          if (e.target.closest('button, select, input, option')) return;
          if (cellState.hasUnacknowledgedChange) {
            cellState.hasUnacknowledgedChange = false;
            headerEl.classList.remove('has-change');
            sv();
            buildCols();
          }
        };
        
        // Apply text/icon color contrast class dynamically
        const headerTextColorOverride = cellState.headerTextColor || 'auto';
        let isHeaderLight = false;
        if (headerTextColorOverride === 'light') {
          isHeaderLight = false;
        } else if (headerTextColorOverride === 'dark') {
          isHeaderLight = true;
        } else {
          const effectiveBg = getHeaderEffectiveBgColor(cellState, targetPage, page);
          isHeaderLight = isColorLight(effectiveBg);
        }
        
        if (isHeaderLight) {
          headerEl.classList.add('theme-light');
        } else {
          headerEl.classList.remove('theme-light');
        }
        
        cellEl.appendChild(headerEl);
        
        // Apply cell custom header background color & opacity & blur dynamically
        if (cellState.headerColor) {
          const opacity = cellState.headerOpacity != null ? cellState.headerOpacity : 0.0;
          const hex = cellState.headerColor;
          const r = parseInt(hex.slice(1, 3), 16);
          const g = parseInt(hex.slice(3, 5), 16);
          const b = parseInt(hex.slice(5, 7), 16);
          headerEl.style.background = `rgba(${r}, ${g}, ${b}, ${opacity})`;
          if (opacity > 0) {
            headerEl.style.backdropFilter = 'blur(8px)';
            headerEl.style.webkitBackdropFilter = 'blur(8px)';
          } else {
            headerEl.style.backdropFilter = 'none';
            headerEl.style.webkitBackdropFilter = 'none';
          }
        } else {
          headerEl.style.background = 'transparent';
          headerEl.style.backdropFilter = 'none';
          headerEl.style.webkitBackdropFilter = 'none';
        }
        
        if (targetPage.pageType === 'slicer') {
          console.warn('Nested slicer pages are not supported.');
          const errorEl = document.createElement('div');
          errorEl.className = 'slicer-empty-cell';
          errorEl.style.cssText = 'height:100%;display:flex;align-items:center;justify-content:center;background:#1a0c10;z-index:2;position:relative;';
          errorEl.innerHTML = `<div style="color:#ff5e5e;font-size:0.85rem;font-weight:500;text-align:center;padding:20px;">⚠️ Nested Slicer Page not supported</div>`;
          bodyEl.appendChild(errorEl);
        } else if (targetPage.pageType === 'miro') {
          let state = page.cellStates[cell.key];
          if (!state) {
            setTimeout(() => {
              const cellW = bodyEl.clientWidth || 300;
              const cellH = bodyEl.clientHeight || 200;
              autofitSlicerCell(page, cell.key, targetPage, cellW, cellH);
              sv();
              buildCols();
            }, 50);
            state = { zoom: 100, panX: 0, panY: 0 };
          }
          
          const miroContainer = document.createElement('div');
          miroContainer.className = 'slicer-miro-container';
          miroContainer.dataset.cellKey = cell.key;
          
          // Prevent click-outside handlers from closing editor if just created
          miroContainer.addEventListener('click', (e) => {
            if (window._justCreatedCard) {
              e.stopPropagation();
              window._justCreatedCard = false;
            }
          });
          
          const gridOverlay = document.createElement('div');
          gridOverlay.className = 'slicer-miro-grid-overlay';
          gridOverlay.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:1;';
          miroContainer.appendChild(gridOverlay);
          
          const anyCreateMode = window._stickyCreateMode || window._textCreateMode || window._gridCreateMode || window._mindmapCreateMode || window._widgetCreateMode || window._trelloCreateMode || window._embedCreateMode || window._overlayPageCreateMode || window._dyntitleCreateMode || window._penMode || window._shapeMode;
          miroContainer.style.cursor = anyCreateMode ? 'crosshair' : 'default';
          
          const miroBoard = document.createElement('div');
          miroBoard.className = 'slicer-miro-board';
          const zoom = (state.zoom || 100) / 100;
          miroBoard.style.transform = `translate(${state.panX || 0}px, ${state.panY || 0}px) scale(${zoom})`;
          
          const buildersMap = {
            sticky: 'buildMiroSticky',
            image: 'buildMiroImage',
            text: 'buildMiroText',
            shape: 'buildMiroShape',
            pen: 'buildMiroPen',
            grid: 'buildMiroGridCard',
            mindmap: 'buildMiroMindMap',
            trello: 'buildMiroTrello',
            bwidget: 'buildMiroBookmarkWidget',
            array: 'buildMiroArray',
            calendar: 'buildMiroGantt',
            gantt: 'buildMiroGantt',
            embed: 'buildMiroEmbed',
            'overlay-page': 'buildMiroOverlayWidget',
            life: 'buildMiroLifeWidget',
            dyntitle: 'buildMiroDynamicTitleCard',
          };
          
          (targetPage.miroCards || []).forEach(card => {
            const fnName = buildersMap[card.type];
            const fn = fnName ? window[fnName] : null;
            const fallback = window.buildMiroCard;
            let cardEl;
            if (typeof fn === 'function') cardEl = fn(card);
            else if (typeof fallback === 'function') cardEl = fallback(card);
            
            if (cardEl) {
              cardEl.dataset.pageId = targetPage.id;
              cardEl.querySelectorAll('*').forEach(child => {
                child.dataset.pageId = targetPage.id;
              });
              miroBoard.appendChild(cardEl);
            }
          });
          
          updateSlicerCellGrid(miroContainer, state, targetPage);
          
          let isPanning = false;
          let startX = 0, startY = 0;
          let startPanX = 0, startPanY = 0;
          
          let cellShapeDrawing = false;
          let cellPenDrawing = false;
          let cellPenPoints = [];
          let liveSvg = null;
          let previewEl = null;
          let shapeStartX = 0;
          let shapeStartY = 0;
          
          miroContainer.addEventListener('mousedown', (e) => {
            if (e.target.closest('.slicer-cell-floating-toolbar, .slicer-cell-header, .sn-toolbar, .mt-toolbar, .mc-del, .miro-sticky, .miro-text, .miro-shape, .miro-card, .ms-text, .mt-text')) return;
            if (e.button !== 0 && e.type !== 'touchstart') {
              if (e.button === 1 || e.button === 2) {
                isPanning = true;
                startX = e.clientX;
                startY = e.clientY;
                startPanX = state.panX || 0;
                startPanY = state.panY || 0;
                miroContainer.style.cursor = 'grabbing';
                e.preventDefault();
                e.stopPropagation();

                const onMidPanMove = (ev) => {
                  if (!isPanning) return;
                  const dx = ev.clientX - startX;
                  const dy = ev.clientY - startY;
                  state.panX = startPanX + dx;
                  state.panY = startPanY + dy;
                  miroBoard.style.transform = `translate(${state.panX}px, ${state.panY}px) scale(${(state.zoom || 100)/100})`;
                  updateSlicerCellGrid(miroContainer, state, targetPage);
                };

                const onMidPanUp = () => {
                  if (isPanning) {
                    isPanning = false;
                    const createMode = window._stickyCreateMode || window._textCreateMode || window._gridCreateMode || window._mindmapCreateMode || window._widgetCreateMode || window._trelloCreateMode || window._embedCreateMode || window._overlayPageCreateMode || window._dyntitleCreateMode || window._penMode || window._shapeMode;
                    miroContainer.style.cursor = createMode ? 'crosshair' : 'default';
                    sv();
                  }
                  window.removeEventListener('mousemove', onMidPanMove);
                  window.removeEventListener('mouseup', onMidPanUp);
                };

                window.addEventListener('mousemove', onMidPanMove);
                window.addEventListener('mouseup', onMidPanUp);
              }
              return;
            }
            
            const currentZoom = (state.zoom || 100) / 100;
            
            if (window._shapeMode) {
              e.preventDefault();
              e.stopPropagation();
              cellShapeDrawing = true;
              const rect = miroContainer.getBoundingClientRect();
              shapeStartX = (e.clientX - rect.left - (state.panX || 0)) / currentZoom;
              shapeStartY = (e.clientY - rect.top - (state.panY || 0)) / currentZoom;
              previewEl = document.createElement('div');
              previewEl.style.cssText = `position:absolute;border:2px dashed var(--ac);pointer-events:none;z-index:9999;left:${shapeStartX}px;top:${shapeStartY}px;width:0;height:0;`;
              miroBoard.appendChild(previewEl);
              
              const onMove = (ev) => {
                if (!cellShapeDrawing || !previewEl) return;
                const r = miroContainer.getBoundingClientRect();
                const mx = (ev.clientX - r.left - (state.panX || 0)) / currentZoom;
                const my = (ev.clientY - r.top - (state.panY || 0)) / currentZoom;
                const x = Math.min(shapeStartX, mx), y = Math.min(shapeStartY, my);
                const w = Math.abs(mx - shapeStartX), h = Math.abs(my - shapeStartY);
                previewEl.style.left = x + 'px';
                previewEl.style.top = y + 'px';
                previewEl.style.width = w + 'px';
                previewEl.style.height = h + 'px';
              };
              
              const onUp = (ev) => {
                cellShapeDrawing = false;
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);
                if (previewEl) { previewEl.remove(); previewEl = null; }
                const r = miroContainer.getBoundingClientRect();
                const mx = (ev.clientX - r.left - (state.panX || 0)) / currentZoom;
                const my = (ev.clientY - r.top - (state.panY || 0)) / currentZoom;
                const w = Math.abs(mx - shapeStartX), h = Math.abs(my - shapeStartY);
                if (w < 10 && h < 10) return;
                const x = Math.min(shapeStartX, mx), y = Math.min(shapeStartY, my);
                
                const tPage = D.pages.find(p => p.id === targetPageId);
                if (tPage) {
                  if (!tPage.miroCards) tPage.miroCards = [];
                  tPage.miroCards.push({
                    id: uid(), type: 'shape', shape: window._activeShapeType || 'rect',
                    x, y, w: Math.max(w, 40), h: Math.max(h, 40),
                    fillColor: 'none', strokeColor: '#333333', strokeWidth: 2, opacity: 1
                  });
                  sv();
                  buildCols();
                }
              };
              document.addEventListener('mousemove', onMove);
              document.addEventListener('mouseup', onUp);
              return;
            }
            
            if (window._penMode) {
              e.preventDefault();
              e.stopPropagation();
              cellPenDrawing = true;
              const rect = miroContainer.getBoundingClientRect();
              const bx = (e.clientX - rect.left - (state.panX || 0)) / currentZoom;
              const by = (e.clientY - rect.top - (state.panY || 0)) / currentZoom;
              cellPenPoints = [{ x: bx, y: by }];
              
              liveSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
              liveSvg.setAttribute('width', '99999');
              liveSvg.setAttribute('height', '99999');
              liveSvg.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none;z-index:9999;overflow:visible;';
              const pathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
              pathEl.setAttribute('d', `M${bx},${by}`);
              pathEl.setAttribute('fill', 'none');
              pathEl.setAttribute('stroke', document.getElementById('pen-color').value || '#333');
              pathEl.setAttribute('stroke-width', document.getElementById('pen-width').value || '3');
              pathEl.setAttribute('stroke-linecap', 'round');
              pathEl.setAttribute('stroke-linejoin', 'round');
              liveSvg.appendChild(pathEl);
              miroBoard.appendChild(liveSvg);
              
              const onMove = (ev) => {
                if (!cellPenDrawing || !liveSvg) return;
                const r = miroContainer.getBoundingClientRect();
                const mx = (ev.clientX - r.left - (state.panX || 0)) / currentZoom;
                const my = (ev.clientY - r.top - (state.panY || 0)) / currentZoom;
                cellPenPoints.push({ x: mx, y: my });
                let d = `M${cellPenPoints[0].x},${cellPenPoints[0].y}`;
                for (let i = 1; i < cellPenPoints.length; i++) d += ` L${cellPenPoints[i].x},${cellPenPoints[i].y}`;
                liveSvg.querySelector('path').setAttribute('d', d);
              };
              
              const onUp = () => {
                cellPenDrawing = false;
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);
                if (liveSvg) { liveSvg.remove(); liveSvg = null; }
                if (cellPenPoints.length < 2) return;
                let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
                cellPenPoints.forEach(p => { minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y); });
                const pad = 10;
                const w = maxX - minX + pad * 2, h = maxY - minY + pad * 2;
                const normalized = cellPenPoints.map(p => ({ x: p.x - minX + pad, y: p.y - minY + pad }));
                
                const tPage = D.pages.find(p => p.id === targetPageId);
                if (tPage) {
                  if (!tPage.miroCards) tPage.miroCards = [];
                  tPage.miroCards.push({
                    id: uid(), type: 'pen', points: normalized,
                    x: minX - pad, y: minY - pad, w, h,
                    penColor: document.getElementById('pen-color').value || '#333',
                    penWidth: +(document.getElementById('pen-width').value) || 3
                  });
                  sv();
                  buildCols();
                }
              };
              document.addEventListener('mousemove', onMove);
              document.addEventListener('mouseup', onUp);
              return;
            }
            
            const anyCreate = window._stickyCreateMode || window._textCreateMode || window._gridCreateMode || window._mindmapCreateMode || window._widgetCreateMode || window._trelloCreateMode || window._embedCreateMode || window._overlayPageCreateMode || window._dyntitleCreateMode;
            if (anyCreate) {
              e.preventDefault();
              e.stopPropagation();
              
              window._justCreatedCard = true;
              setTimeout(() => { window._justCreatedCard = false; }, 300);
              
              try {
                const rect = miroContainer.getBoundingClientRect();
                const clickX = e.clientX - rect.left;
                const clickY = e.clientY - rect.top;
                const bx = (clickX - (state.panX || 0)) / currentZoom;
                const by = (clickY - (state.panY || 0)) / currentZoom;
                
                const tPage = D.pages.find(p => p.id === targetPageId);
                if (!tPage) return;
                if (!tPage.miroCards) tPage.miroCards = [];
                
                const newId = uid();
                
                if (window._stickyCreateMode) {
                  tPage.miroCards.push({ id: newId, type: 'sticky', text: '', color: 'yellow', shape: 'rect', x: bx - 140, y: by - 80, w: 280, h: 160 });
                  sv();
                  buildCols();
                  setTimeout(() => {
                    const el = document.querySelector(`.slicer-cell[data-cell-key="${cell.key}"] [data-cid="${newId}"] .ms-text`);
                    if (el) {
                      el.contentEditable = true;
                      el.focus();
                      const tb = el.closest('.miro-sticky')?.querySelector('.sn-toolbar');
                      if (tb) tb.classList.add('show');
                    }
                  }, 100);
                } else if (window._textCreateMode) {
                  tPage.miroCards.push({ id: newId, type: 'text', text: '', x: bx - 60, y: by - 15, w: 200, h: 40, fontSize: 24, font: 'Inter', fontColor: '#333333', align: 'right' });
                  sv();
                  buildCols();
                  setTimeout(() => {
                    const el = document.querySelector(`.slicer-cell[data-cell-key="${cell.key}"] [data-cid="${newId}"] .mt-text`);
                    if (el) {
                      el.contentEditable = true;
                      el.focus();
                      const tb = el.closest('.miro-text')?.querySelector('.mt-toolbar');
                      if (tb) tb.classList.add('show');
                    }
                  }, 100);
                } else if (window._gridCreateMode) {
                  const rows = window._gridPickerRows || 3, cols = window._gridPickerCols || 3;
                  const rdInput = document.getElementById('mgp-rd');
                  const cdInput = document.getElementById('mgp-cd');
                  const rowH = rdInput ? parseInt(rdInput.value) || 40 : 40;
                  const colW = cdInput ? parseInt(cdInput.value) || 120 : 120;
                  const cellsData = [];
                  for (let r = 0; r < rows; r++) { const row = []; for (let c = 0; c < cols; c++) row.push(''); cellsData.push(row); }
                  const w = cols * colW, h = rows * rowH;
                  const colWidths = Array(cols).fill(colW);
                  const rowHeights = Array(rows).fill(rowH);
                  tPage.miroCards.push({ id: uid(), type: 'grid', rows, cols, cells: cellsData, colWidths, rowHeights, x: bx - w / 2, y: by - h / 2, w, h, headerColor: 'none', borderColor: '#555' });
                  sv();
                  buildCols();
                } else if (window._mindmapCreateMode) {
                  const rootId = uid(), child1 = uid(), child2 = uid(), child3 = uid();
                  tPage.miroCards.push({
                    id: uid(), type: 'mindmap', x: bx - 300, y: by - 200, w: 600, h: 400,
                    root: {
                      id: rootId, text: 'Main Topic', color: '#6c8fff',
                      children: [
                        { id: child1, text: 'Branch 1', color: '#ff6b6b', children: [] },
                        { id: child2, text: 'Branch 2', color: '#51cf66', children: [] },
                        { id: child3, text: 'Branch 3', color: '#ffd43b', children: [] },
                      ],
                    },
                  });
                  sv();
                  buildCols();
                } else if (window._widgetCreateMode) {
                  tPage.miroCards.push({ id: uid(), type: 'bwidget', title: 'Bookmarks', emoji: '🗂️', items: [], x: bx - 160, y: by - 200, w: 320, h: 400, color: { r: 255, g: 255, b: 255, a: 1 } });
                  sv();
                  buildCols();
                } else if (window._trelloCreateMode) {
                  const gap = 20;
                  const lw = 260, lh = 380;
                  const lists = [
                    { title: '2Do', color: '#6c8fff' },
                    { title: 'In Progress', color: '#ffd43b' },
                    { title: 'Done', color: '#51cf66' }
                  ];
                  const totalW = lists.length * lw + (lists.length - 1) * gap;
                  const startX = bx - totalW / 2;
                  lists.forEach((l, i) => {
                    tPage.miroCards.push({ id: uid(), type: 'trello', title: l.title, listColor: l.color, cards: [], x: startX + i * (lw + gap), y: by - lh / 2, w: lw, h: lh });
                  });
                  sv();
                  buildCols();
                } else if (window._overlayPageCreateMode) {
                  const opIdx = window._overlayPageCreateIdx;
                  tPage.miroCards.push({ id: uid(), type: 'overlay-page', overlayPage: opIdx, x: bx - Math.floor(window.innerWidth*0.42), y: by - Math.floor(window.innerHeight*0.4), w: Math.floor(window.innerWidth*0.85), h: Math.floor(window.innerHeight*0.8), calOffset: 0, calTheme: 'light', ganttView: '2week', ganttRowHeight: 50 });
                  sv();
                  buildCols();
                } else if (window._embedCreateMode) {
                  const url = prompt('🌐 Enter published URL (Google Sheets chart, web page, etc.):');
                  if (url && url.trim()) {
                    tPage.miroCards.push({ id: uid(), type: 'embed', embedUrl: url.trim(), cropRect: null, refreshMin: 15, x: bx - 300, y: by - 200, w: 600, h: 400 });
                    sv();
                    buildCols();
                  }
                } else if (window._dyntitleCreateMode) {
                  tPage.miroCards.push({
                    id: uid(),
                    type: 'dyntitle',
                    title: '',
                    dynamicType: '',
                    pinned: true,
                    w: 120,
                    h: 40,
                    _pinCellW: 120,
                    _pinCellH: 40,
                    x: bx - 60,
                    y: by - 20,
                    _pinCellX: clickX - 60,
                    _pinCellY: clickY - 20,
                    _pinScreenX: clickX - 60,
                    _pinScreenY: clickY - 20,
                    _pinScreenW: 120,
                    _pinScreenH: 40
                  });
                  sv();
                  buildCols();
                }
                
                if (typeof window.setActiveTool === 'function') {
                  window.setActiveTool('select');
                }
              } catch (err) {
                console.error('[SLICER TOOL CREATE ERROR]', err);
              }
              return;
            }
            
            e.preventDefault();
            e.stopPropagation();

            if (e.altKey) {
              // Alt+left-click → pan the cell view
              isPanning = true;
              startX = e.clientX;
              startY = e.clientY;
              startPanX = state.panX || 0;
              startPanY = state.panY || 0;
              miroContainer.style.cursor = 'grabbing';

              const onSlicerPanMove = (ev) => {
                if (!isPanning) return;
                const dx = ev.clientX - startX;
                const dy = ev.clientY - startY;
                state.panX = startPanX + dx;
                state.panY = startPanY + dy;
                miroBoard.style.transform = `translate(${state.panX}px, ${state.panY}px) scale(${(state.zoom || 100)/100})`;
                updateSlicerCellGrid(miroContainer, state, targetPage);
              };

              const onSlicerPanUp = () => {
                if (isPanning) {
                  isPanning = false;
                  const currentAnyCreate = window._stickyCreateMode || window._textCreateMode || window._gridCreateMode || window._mindmapCreateMode || window._widgetCreateMode || window._trelloCreateMode || window._embedCreateMode || window._overlayPageCreateMode || window._dyntitleCreateMode || window._penMode || window._shapeMode;
                  miroContainer.style.cursor = currentAnyCreate ? 'crosshair' : 'default';
                  sv();
                }
                window.removeEventListener('mousemove', onSlicerPanMove);
                window.removeEventListener('mouseup', onSlicerPanUp);
              };

              window.addEventListener('mousemove', onSlicerPanMove);
              window.addEventListener('mouseup', onSlicerPanUp);
            } else {
              // Normal left-click → clear selection + rubber-band select
              if (typeof clearMiroSelection === 'function') clearMiroSelection();

              const rbZoom = currentZoom;
              const rbRect = miroContainer.getBoundingClientRect();
              const rbSX = (e.clientX - rbRect.left - (state.panX || 0)) / rbZoom;
              const rbSY = (e.clientY - rbRect.top - (state.panY || 0)) / rbZoom;

              let rbBox = miroBoard.querySelector('.slicer-rb-box');
              if (!rbBox) {
                rbBox = document.createElement('div');
                rbBox.className = 'slicer-rb-box';
                rbBox.style.cssText = 'position:absolute;border:1px solid var(--ac, #6c8fff);background:rgba(108,143,255,.08);pointer-events:none;z-index:9999;display:none;';
                miroBoard.appendChild(rbBox);
              }
              rbBox.style.left = rbSX + 'px';
              rbBox.style.top = rbSY + 'px';
              rbBox.style.width = '0';
              rbBox.style.height = '0';
              rbBox.style.display = 'block';

              const onRBMove = (ev) => {
                const r = miroContainer.getBoundingClientRect();
                const mx = (ev.clientX - r.left - (state.panX || 0)) / rbZoom;
                const my = (ev.clientY - r.top - (state.panY || 0)) / rbZoom;
                const x = Math.min(rbSX, mx);
                const y = Math.min(rbSY, my);
                const w = Math.abs(mx - rbSX);
                const h = Math.abs(my - rbSY);
                rbBox.style.left = x + 'px';
                rbBox.style.top = y + 'px';
                rbBox.style.width = w + 'px';
                rbBox.style.height = h + 'px';
              };

              const onRBUp = (ev) => {
                document.removeEventListener('mousemove', onRBMove);
                document.removeEventListener('mouseup', onRBUp);

                const r = miroContainer.getBoundingClientRect();
                const mx = (ev.clientX - r.left - (state.panX || 0)) / rbZoom;
                const my = (ev.clientY - r.top - (state.panY || 0)) / rbZoom;
                const selX = Math.min(rbSX, mx);
                const selY = Math.min(rbSY, my);
                const selW = Math.abs(mx - rbSX);
                const selH = Math.abs(my - rbSY);

                rbBox.style.display = 'none';

                // Select all cards within the rubber-band rectangle
                if (selW > 5 || selH > 5) {
                  const tPage = D.pages.find(p => p.id === targetPageId);
                  if (tPage && tPage.miroCards) {
                    tPage.miroCards.forEach(c => {
                      if (c.pinned || c.type === 'dyntitle') return;
                      const cx = c.x || 0, cy = c.y || 0;
                      const cw = c.w || 200, ch = c.h || 200;
                      if (cx + cw > selX && cx < selX + selW && cy + ch > selY && cy < selY + selH) {
                        if (typeof addMiroSelect === 'function') addMiroSelect(c.id);
                      }
                    });
                    if (typeof updateMiroSelFrame === 'function') updateMiroSelFrame();
                  }
                }
              };

              document.addEventListener('mousemove', onRBMove);
              document.addEventListener('mouseup', onRBUp);
            }
          });
          
          miroContainer.addEventListener('wheel', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const rect = miroContainer.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;
            
            const curZoom = (state.zoom || 100) / 100;
            const boardX = (mouseX - state.panX) / curZoom;
            const boardY = (mouseY - state.panY) / curZoom;
            
            const zoomFactor = 1.1;
            let newZoom = e.deltaY < 0 ? curZoom * zoomFactor : curZoom / zoomFactor;
            newZoom = Math.max(0.1, Math.min(4.0, newZoom));
            const zPercent = Math.round(newZoom * 100);
            
            state.zoom = zPercent;
            state.panX = mouseX - boardX * newZoom;
            state.panY = mouseY - boardY * newZoom;
            
            miroBoard.style.transform = `translate(${state.panX}px, ${state.panY}px) scale(${newZoom})`;
            updateSlicerCellGrid(miroContainer, state, targetPage);
            
            // Update the zoom text directly in the DOM
            const headerZoomSpan = miroContainer.closest('.slicer-cell')?.querySelector('.slicer-cell-zoom-text');
            if (headerZoomSpan) {
              headerZoomSpan.textContent = `${zPercent}%`;
            }
            
            sv();
          }, { passive: false });
          
          miroContainer.appendChild(miroBoard);
          bodyEl.appendChild(miroContainer);
        } else {
          // Dashboard Widgets
          const columnsContainer = document.createElement('div');
          columnsContainer.className = 'slicer-widget-container';
          
          const colCount = targetPage.cols || 3;
          for (let ci = 0; ci < colCount; ci++) {
            const colEl = document.createElement('div');
            colEl.className = 'slicer-widget-col';
            colEl.dataset.ci = ci;
            
            colEl.addEventListener('dragover', (e) => {
              e.preventDefault();
              colEl.classList.add('dragover');
            });
            colEl.addEventListener('dragleave', () => colEl.classList.remove('dragover'));
            colEl.addEventListener('drop', (e) => {
              e.preventDefault();
              colEl.classList.remove('dragover');
              if (!dragWid) return;
              const w = (targetPage.widgets || []).find((x) => x.id === dragWid);
              if (w) {
                w.col = ci;
                sv();
                buildCols();
              }
              dragWid = null;
            });
            
            const colWidgets = (targetPage.widgets || []).filter((w) => w.col === ci);
            if (ci === colCount - 1) {
              (targetPage.widgets || []).filter((w) => w.col >= colCount).forEach((w) => colWidgets.push(w));
            }
            colWidgets.forEach(w => {
              colEl.appendChild(buildWidget(w));
            });
            
            const colAddW = document.createElement('button');
            colAddW.className = 'add-w';
            colAddW.textContent = '＋ Widget';
            colAddW.onclick = () => {
              window._widgetAddTargetPageId = targetPage.id;
              pColIdx = ci;
              openM('m-aw');
            };
            colEl.appendChild(colAddW);
            columnsContainer.appendChild(colEl);
          }
          bodyEl.appendChild(columnsContainer);
        }
    } else {
      // Empty Cell
      const emptyEl = document.createElement('div');
      emptyEl.className = 'slicer-empty-cell';
      
      const gridOverlay = document.createElement('div');
      gridOverlay.className = 'slicer-miro-grid-overlay';
      gridOverlay.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:1;';
      emptyEl.appendChild(gridOverlay);

      updateSlicerCellGrid(emptyEl, { zoom: 100, panX: 0, panY: 0 }, page);

      const contentEl = document.createElement('div');
      contentEl.className = 'slicer-empty-cell-actions';
      contentEl.style.cssText = 'position:relative;z-index:2;display:flex;flex-direction:column;align-items:center;gap:12px;width:240px;';

      const titleEl = document.createElement('div');
      titleEl.className = 'slicer-empty-cell-title';
      titleEl.style.cssText = 'color:#e4e4e4;font-size:0.85rem;font-weight:500;margin-bottom:4px;display:flex;align-items:center;gap:6px;';
      titleEl.innerHTML = `<span>📐</span> Cell [${cell.cStart+1}, ${cell.rStart+1}]`;
      if (cell.isMerged) {
        titleEl.innerHTML = `<span>📐</span> Merged Cell`;
      }
      contentEl.appendChild(titleEl);

      const selectEl = document.createElement('select');
      selectEl.style.cssText = 'width:100%;background:#000;border:1px solid rgba(255,255,255,0.15);color:#fff;font-size:0.8rem;padding:8px 12px;border-radius:8px;outline:none;cursor:pointer;';
      
      const defOpt = document.createElement('option');
      defOpt.value = '';
      defOpt.textContent = 'Select existing page...';
      selectEl.appendChild(defOpt);

      const populateOptions = () => {
        if (selectEl.children.length > 1) return; // already populated
        const otherPages = (D.pages || [])
          .filter(p => p && p.id !== page.id && p.pageType !== 'slicer')
          .sort((a, b) => {
            const tsA = a.ts || 0;
            const tsB = b.ts || 0;
            return tsB - tsA; // newest first
          });
        otherPages.forEach(p => {
          const opt = document.createElement('option');
          opt.value = p.id;
          opt.style.background = '#000';
          opt.textContent = `${p.pageType === 'miro' ? '🖼️' : '🗂️'} ${p.name}`;
          selectEl.appendChild(opt);
        });
      };
      selectEl.addEventListener('focus', populateOptions);
      selectEl.addEventListener('mousedown', populateOptions);

      selectEl.onchange = () => {
        const nextPid = selectEl.value;
        if (!page.cellPages) page.cellPages = {};
        if (nextPid) {
          page.cellPages[cell.key] = nextPid;
          if (page.cellStates) delete page.cellStates[cell.key];
        } else {
          delete page.cellPages[cell.key];
        }
        sv();
        buildCols();
      };
      contentEl.appendChild(selectEl);

      const buttonsEl = document.createElement('div');
      buttonsEl.className = 'slicer-empty-cell-buttons';
      buttonsEl.style.cssText = 'display:flex;gap:8px;width:100%;';

      const createCanvasBtn = document.createElement('button');
      createCanvasBtn.innerHTML = '➕ Canvas';
      createCanvasBtn.title = 'Create a new blank Miro infinite canvas';
      createCanvasBtn.onclick = () => {
        createBlankPageForSlicerCell(page, cell.key, 'miro');
      };
      buttonsEl.appendChild(createCanvasBtn);

      const createDashBtn = document.createElement('button');
      createDashBtn.innerHTML = '➕ Dashboard';
      createDashBtn.title = 'Create a new blank Widget dashboard';
      createDashBtn.onclick = () => {
        createBlankPageForSlicerCell(page, cell.key, 'bookmarks');
      };
      buttonsEl.appendChild(createDashBtn);

      contentEl.appendChild(buttonsEl);

      if (cell.isMerged) {
        const splitBtn = document.createElement('button');
        splitBtn.style.cssText = 'width:100%;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);color:#ccc;padding:6px;border-radius:6px;font-size:0.75rem;cursor:pointer;margin-top:4px;';
        splitBtn.innerHTML = '🥞 Split Merged Cell';
        splitBtn.onclick = () => {
          page.mergedCells = (page.mergedCells || []).filter(m => 
            !(m.rStart === cell.rStart && m.cStart === cell.cStart && 
              m.rEnd === cell.rEnd && m.cEnd === cell.cEnd)
          );
          if (page.cellStates) delete page.cellStates[cell.key];
          sv();
          buildCols();
        };
        contentEl.appendChild(splitBtn);
      }

      const settingsBtn = document.createElement('button');
      settingsBtn.style.cssText = 'width:100%;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);color:#ccc;padding:6px;border-radius:6px;font-size:0.75rem;cursor:pointer;';
      settingsBtn.innerHTML = '⚙️ Cell Settings';
      settingsBtn.onclick = () => {
        if (typeof window.showCellSettingsModal === 'function') {
          window.showCellSettingsModal(cell.key);
        }
      };
      contentEl.appendChild(settingsBtn);

      emptyEl.appendChild(contentEl);
      bodyEl.appendChild(emptyEl);
    }
    
    cellEl.appendChild(bodyEl);
    gridEl.appendChild(cellEl);
  });

  // Render draggable resizable splitters
  gridEl.style.position = 'relative';

  // 1. Vertical Splitters (Columns)
  let cumulativeCol = 0;
  for (let c = 0; c < colCount - 1; c++) {
    cumulativeCol += page.slicerColSizes[c];
    const splitter = document.createElement('div');
    splitter.className = 'slicer-splitter slicer-splitter-v';
    splitter.style.left = `${cumulativeCol}%`;
    
    splitter.onmousedown = (e) => {
      e.preventDefault();
      e.stopPropagation();
      splitter.classList.add('active-dragging');
      const startX = e.clientX;
      const rect = gridEl.getBoundingClientRect();
      const gridW = rect.width;
      const colSizeA = page.slicerColSizes[c];
      const colSizeB = page.slicerColSizes[c + 1];
      const sum = colSizeA + colSizeB;

      const onMouseMove = (ev) => {
        const dx = ev.clientX - startX;
        const dxPct = (dx / gridW) * 100;
        let newA = colSizeA + dxPct;
        let newB = colSizeB - dxPct;

        if (newA < 5) {
          newA = 5;
          newB = sum - 5;
        } else if (newB < 5) {
          newB = 5;
          newA = sum - 5;
        }

        page.slicerColSizes[c] = newA;
        page.slicerColSizes[c + 1] = newB;
        
        gridEl.style.gridTemplateColumns = page.slicerColSizes.map(s => `${s}fr`).join(' ');
        
        // Update all vertical splitters' positions in real-time
        let tempCum = 0;
        const allVSplitters = gridEl.querySelectorAll('.slicer-splitter-v');
        allVSplitters.forEach((splitEl, idx) => {
          tempCum += page.slicerColSizes[idx];
          splitEl.style.left = `${tempCum}%`;
        });
      };

      const onMouseUp = () => {
        splitter.classList.remove('active-dragging');
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
        sv();
        buildCols();
      };

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    };
    gridEl.appendChild(splitter);
  }

  // 2. Horizontal Splitters (Rows)
  let cumulativeRow = 0;
  for (let r = 0; r < rowCount - 1; r++) {
    cumulativeRow += page.slicerRowSizes[r];
    const splitter = document.createElement('div');
    splitter.className = 'slicer-splitter slicer-splitter-h';
    splitter.style.top = `${cumulativeRow}%`;
    
    splitter.onmousedown = (e) => {
      e.preventDefault();
      e.stopPropagation();
      splitter.classList.add('active-dragging');
      const startY = e.clientY;
      const rect = gridEl.getBoundingClientRect();
      const gridH = rect.height;
      const rowSizeA = page.slicerRowSizes[r];
      const rowSizeB = page.slicerRowSizes[r + 1];
      const sum = rowSizeA + rowSizeB;

      const onMouseMove = (ev) => {
        const dy = ev.clientY - startY;
        const dyPct = (dy / gridH) * 100;
        let newA = rowSizeA + dyPct;
        let newB = rowSizeB - dyPct;

        if (newA < 5) {
          newA = 5;
          newB = sum - 5;
        } else if (newB < 5) {
          newB = 5;
          newA = sum - 5;
        }

        page.slicerRowSizes[r] = newA;
        page.slicerRowSizes[r + 1] = newB;
        
        gridEl.style.gridTemplateRows = page.slicerRowSizes.map(s => `${s}fr`).join(' ');
        
        // Update all horizontal splitters' positions in real-time
        let tempCum = 0;
        const allHSplitters = gridEl.querySelectorAll('.slicer-splitter-h');
        allHSplitters.forEach((splitEl, idx) => {
          tempCum += page.slicerRowSizes[idx];
          splitEl.style.top = `${tempCum}%`;
        });
      };

      const onMouseUp = () => {
        splitter.classList.remove('active-dragging');
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
        sv();
        buildCols();
      };

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    };
    gridEl.appendChild(splitter);
  }
  
  containerEl.appendChild(gridEl);
  wrap.appendChild(containerEl);
}

function showPageTabContextMenu(e, pg, nm, cd) {
  e.preventDefault();
  e.stopPropagation();

  // Inject styles if they don't exist
  if (!document.getElementById('custom-ctx-menu-styles')) {
    const style = document.createElement('style');
    style.id = 'custom-ctx-menu-styles';
    style.textContent = `
      .custom-ctx-menu {
        position: fixed;
        background: rgba(28, 32, 45, 0.98);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        border: 1px solid rgba(108, 143, 255, 0.25);
        border-radius: 12px;
        padding: 6px 0;
        min-width: 180px;
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
        z-index: 999999;
        display: flex;
        flex-direction: column;
        font-family: 'DM Sans', sans-serif;
      }
      .custom-ctx-item {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 8px 16px;
        color: #e4e4e4;
        font-size: 0.85rem;
        cursor: pointer;
        transition: all 0.2s ease;
        user-select: none;
        text-align: right;
        direction: rtl;
      }
      .custom-ctx-item:hover {
        background: rgba(108, 143, 255, 0.15);
        color: #fff;
      }
      .custom-ctx-item.danger:hover {
        background: rgba(255, 94, 94, 0.2);
        color: #ff5e5e;
      }
      .custom-ctx-sep {
        height: 1px;
        background: rgba(255, 255, 255, 0.08);
        margin: 4px 0;
      }
    `;
    document.head.appendChild(style);
  }

  // Close any existing menus first
  const existing = document.querySelector('.custom-ctx-menu');
  if (existing) existing.remove();

  const menu = document.createElement('div');
  menu.className = 'custom-ctx-menu';

  // Add Link back to parent slicer page(s) if this page is sharded inside them
  const parentSlicers = D.pages.filter(p => p && p.pageType === 'slicer' && p.cellPages && Object.values(p.cellPages).includes(pg.id));
  if (parentSlicers.length > 0) {
    parentSlicers.forEach(slicer => {
      const slicerItem = document.createElement('div');
      slicerItem.className = 'custom-ctx-item';
      slicerItem.style.color = '#38ef7d';
      slicerItem.innerHTML = `<span>📐</span> <span>العودة لـ "${slicer.name}"</span>`;
      slicerItem.onclick = () => {
        menu.remove();
        switchActivePage(slicer.id);
      };
      menu.appendChild(slicerItem);
    });
    const sep = document.createElement('div');
    sep.className = 'custom-ctx-sep';
    menu.appendChild(sep);
  }

  // 1. Rename Page
  const renameItem = document.createElement('div');
  renameItem.className = 'custom-ctx-item';
  renameItem.innerHTML = `<span>✏️</span> <span>إعادة تسمية الصفحة</span>`;
  renameItem.onclick = () => {
    menu.remove();
    nm.contentEditable = 'true';
    nm.focus();
    const range = document.createRange();
    range.selectNodeContents(nm);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  };
  menu.appendChild(renameItem);

  // 2. Change Color
  const colorItem = document.createElement('div');
  colorItem.className = 'custom-ctx-item';
  colorItem.innerHTML = `<span>🎨</span> <span>تغيير لون التبويب</span>`;
  colorItem.onclick = (ev) => {
    menu.remove();
    if (typeof openTcPop === 'function') {
      openTcPop(e, pg.id);
    }
  };
  menu.appendChild(colorItem);

  // Separator
  const sep1 = document.createElement('div');
  sep1.className = 'custom-ctx-sep';
  menu.appendChild(sep1);

  // 3. Change Page Type
  const types = [
    { type: 'miro', name: 'Miro Infinite Canvas', icon: '🖼️' },
    { type: 'bookmarks', name: 'Widgets Dashboard', icon: '🗂️' },
    { type: 'slicer', name: 'Slicer Grid', icon: '📐' }
  ];

  types.forEach(t => {
    const typeItem = document.createElement('div');
    typeItem.className = 'custom-ctx-item';
    if (pg.pageType === t.type) {
      typeItem.style.fontWeight = 'bold';
      typeItem.style.color = 'var(--ac, #6c8fff)';
    }
    typeItem.innerHTML = `<span>${t.icon}</span> <span>${t.name}</span>`;
    typeItem.onclick = () => {
      menu.remove();
      if (pg.pageType !== t.type) {
        pg.pageType = t.type;
        if (t.type === 'slicer') {
          if (!pg.gridRows) pg.gridRows = 2;
          if (!pg.gridCols) pg.gridCols = 2;
          if (!pg.cellPages) pg.cellPages = {};
          if (!pg.mergedCells) pg.mergedCells = [];
        }
        sv();
        switchActivePage(pg.id);
      }
    };
    menu.appendChild(typeItem);
  });

  // Separator
  const sep2 = document.createElement('div');
  sep2.className = 'custom-ctx-sep';
  menu.appendChild(sep2);

  // 4. Export Page (Selective Export)
  const exportItem = document.createElement('div');
  exportItem.className = 'custom-ctx-item';
  exportItem.innerHTML = `<span>📦</span> <span>تصدير الصفحة</span>`;
  exportItem.onclick = () => {
    menu.remove();
    if (typeof openSelIO === 'function') {
      const grp = D.groups.find(g => g.id === pg.groupId);
      const env = grp ? D.environments.find(ev => ev.id === grp.envId) : null;
      openSelIO('export', {
        settings: D.settings,
        environments: env ? [env] : [],
        groups: grp ? [grp] : [],
        pages: [pg]
      });
    }
  };
  menu.appendChild(exportItem);

  // Separator
  const sep3 = document.createElement('div');
  sep3.className = 'custom-ctx-sep';
  menu.appendChild(sep3);

  // 5. Delete Page
  const deleteItem = document.createElement('div');
  deleteItem.className = 'custom-ctx-item danger';
  deleteItem.innerHTML = `<span>🗑️</span> <span>حذف الصفحة</span>`;
  deleteItem.onclick = () => {
    menu.remove();
    if (typeof delPage === 'function') {
      delPage(pg.id);
    }
  };
  menu.appendChild(deleteItem);

  // Positioning
  document.body.appendChild(menu);
  const rect = menu.getBoundingClientRect();
  let x = e.clientX;
  let y = e.clientY;
  
  if (x + rect.width > window.innerWidth) {
    x = window.innerWidth - rect.width - 10;
  }
  if (y + rect.height > window.innerHeight) {
    y = window.innerHeight - rect.height - 10;
  }
  
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;

  // Dismiss on clicking outside
  const dismiss = (ev) => {
    if (!menu.contains(ev.target)) {
      menu.remove();
      document.removeEventListener('mousedown', dismiss);
    }
  };
  setTimeout(() => {
    document.addEventListener('mousedown', dismiss);
  }, 10);
}

function showGroupTabContextMenu(e, g, nm) {
  e.preventDefault();
  e.stopPropagation();

  // Inject styles if they don't exist
  if (!document.getElementById('custom-ctx-menu-styles')) {
    const style = document.createElement('style');
    style.id = 'custom-ctx-menu-styles';
    style.textContent = `
      .custom-ctx-menu {
        position: fixed;
        background: rgba(28, 32, 45, 0.98);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        border: 1px solid rgba(108, 143, 255, 0.25);
        border-radius: 12px;
        padding: 6px 0;
        min-width: 180px;
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
        z-index: 999999;
        display: flex;
        flex-direction: column;
        font-family: 'DM Sans', sans-serif;
      }
      .custom-ctx-item {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 8px 16px;
        color: #e4e4e4;
        font-size: 0.85rem;
        cursor: pointer;
        transition: all 0.2s ease;
        user-select: none;
        text-align: right;
        direction: rtl;
      }
      .custom-ctx-item:hover {
        background: rgba(108, 143, 255, 0.15);
        color: #fff;
      }
      .custom-ctx-item.danger:hover {
        background: rgba(255, 94, 94, 0.2);
        color: #ff5e5e;
      }
      .custom-ctx-sep {
        height: 1px;
        background: rgba(255, 255, 255, 0.08);
        margin: 4px 0;
      }
    `;
    document.head.appendChild(style);
  }

  // Close any existing menus first
  const existing = document.querySelector('.custom-ctx-menu');
  if (existing) existing.remove();

  const menu = document.createElement('div');
  menu.className = 'custom-ctx-menu';

  // 1. Merge Pages (إدمج كل الصفحات)
  const mergeItem = document.createElement('div');
  mergeItem.className = 'custom-ctx-item';
  mergeItem.innerHTML = `<span>📐</span> <span>إدمج كل الصفحات</span>`;
  mergeItem.onclick = () => {
    menu.remove();
    // Filter pages in this group that are not slicer pages
    const grpPages = (D.pages || []).filter(p => p && p.groupId === g.id && p.pageType !== 'slicer');
    if (grpPages.length === 0) {
      if (typeof showToast === 'function') {
        showToast('❌ لا توجد صفحات لدمجها في هذه المجموعة!');
      }
      return;
    }

    // Calculate grid rows and cols based on pages count
    const count = grpPages.length;
    let rows = 2;
    let cols = 2;
    if (count <= 2) {
      rows = 1;
      cols = count;
    } else if (count <= 4) {
      rows = 2;
      cols = 2;
    } else if (count <= 6) {
      rows = 2;
      cols = 3;
    } else if (count <= 8) {
      rows = 2;
      cols = 4;
    } else if (count <= 9) {
      rows = 3;
      cols = 3;
    } else if (count <= 12) {
      rows = 3;
      cols = 4;
    } else {
      cols = Math.ceil(Math.sqrt(count));
      rows = Math.ceil(count / cols);
    }

    const newPageId = 'p_' + uid();
    const newPage = {
      id: newPageId,
      groupId: g.id,
      name: `${g.name} - Merge`,
      pageType: 'slicer',
      zoom: 100,
      panX: 0,
      panY: 0,
      bg: '',
      bgType: 'none',
      gridRows: rows,
      gridCols: cols,
      slicerColSizes: Array(cols).fill(100 / cols),
      slicerRowSizes: Array(rows).fill(100 / rows),
      cellPages: {},
      cellStates: {},
      mergedCells: [],
      widgets: [],
      miroCards: [],
      ts: Date.now()
    };

    let idx = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (idx < grpPages.length) {
          const subPage = grpPages[idx];
          const cellKey = `${r}_${c}`;
          newPage.cellPages[cellKey] = subPage.id;
          newPage.cellStates[cellKey] = { zoom: 30, panX: 0, panY: 0 };
          idx++;
        }
      }
    }

    D.pages.push(newPage);
    D.cur = newPageId;
    D.curGroup = g.id;
    sv(true, true); // Save immediately
    switchActivePage(newPageId);
    if (typeof showToast === 'function') {
      showToast('✅ تم دمج كل الصفحات بنجاح!');
    }
  };
  menu.appendChild(mergeItem);

  // 2. Export Group (تصدير المجموعة)
  const exportItem = document.createElement('div');
  exportItem.className = 'custom-ctx-item';
  exportItem.innerHTML = `<span>📦</span> <span>تصدير المجموعة</span>`;
  exportItem.onclick = () => {
    menu.remove();
    if (typeof openSelIO === 'function') {
      const env = D.environments.find(ev => ev.id === g.envId);
      const grpPages = D.pages.filter(p => p.groupId === g.id);
      openSelIO('export', {
        settings: D.settings,
        environments: env ? [env] : [],
        groups: [g],
        pages: grpPages
      });
    }
  };
  menu.appendChild(exportItem);

  // Positioning
  document.body.appendChild(menu);
  const rect = menu.getBoundingClientRect();
  let x = e.clientX;
  let y = e.clientY;
  
  if (x + rect.width > window.innerWidth) {
    x = window.innerWidth - rect.width - 10;
  }
  if (y + rect.height > window.innerHeight) {
    y = window.innerHeight - rect.height - 10;
  }
  
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;

  // Dismiss on clicking outside
  const dismiss = (ev) => {
    if (!menu.contains(ev.target)) {
      menu.remove();
      document.removeEventListener('mousedown', dismiss);
    }
  };
  setTimeout(() => {
    document.addEventListener('mousedown', dismiss);
  }, 10);
}

window.showPageTabContextMenu = showPageTabContextMenu;
window.showGroupTabContextMenu = showGroupTabContextMenu;
window.buildSlicerPage = buildSlicerPage;
window.setupSlicerSubPageListeners = setupSlicerSubPageListeners;
window.autofitSlicerCell = autofitSlicerCell;
window.getSlicerActiveCells = getSlicerActiveCells;
window.applyCellBackground = applyCellBackground;
window.updateSlicerCellGrid = updateSlicerCellGrid;
window.getGridColorForPage = getGridColorForPage;

// Window aliases for backward compatibility
SM.renderAll = typeof renderAll !== 'undefined' ? renderAll : window.renderAll;
SM.buildCols = typeof buildCols !== 'undefined' ? buildCols : window.buildCols;
SM.saveAllBackups = typeof saveAllBackups !== 'undefined' ? saveAllBackups : window.saveAllBackups;
SM.openSnapshotModal = typeof openSnapshotModal !== 'undefined' ? openSnapshotModal : window.openSnapshotModal;

window.renderAll = SM.renderAll;
window.buildCols = SM.buildCols;
window.saveAllBackups = SM.saveAllBackups;
window.openSnapshotModal = SM.openSnapshotModal;
