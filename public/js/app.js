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
      if (wc > 0 || mc > 0 || hc > 0 || p._guidesMode) {
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
          ts: p.ts || Date.now()
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
    if (wc > 0 || mc > 0 || hc > 0 || p._guidesMode) {
      snapshot.pages[p.id] = {
        widgets: p.widgets || [],
        miroCards: p.miroCards || [],
        vGuides: p.vGuides || [],
        hGuides: p.hGuides || [],
        _guidesMode: p._guidesMode || false,
        lockedGuides: p.lockedGuides || [],
        cellStates: p.cellStates || {},
        mergedCells: p.mergedCells || [],
        customCells: p.customCells || []
      };
    } else {
      // Try cache
      const cached = getCachedPageData(p.id);
      if (cached && ((cached.widgets || []).length > 0 || (cached.miroCards || []).length > 0 || (cached.vGuides || []).length > 0 || (cached.hGuides || []).length > 0 || cached._guidesMode || (cached.customCells || []).length > 0)) {
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
    
    // Remember Me logic: if token is expired or missing, prepare silent re-auth on first interaction
    if (localStorage.getItem('sm_remember_me') === 'true' && isGoogleTokenExpired()) {
      let reauthInProgress = false;
      function onFirstUserInteraction() {
        if (reauthInProgress) return;
        if (localStorage.getItem('sm_remember_me') === 'true' && isGoogleTokenExpired()) {
          reauthInProgress = true;
          console.log('[AUTH] User interacted. Initiating background Google token refresh popup...');
          manualGoogleReAuth().then(() => {
            console.log('[AUTH] Background Google token refresh successful!');
            // Reload page columns / cards to fetch fresh events
            if (typeof buildCols === 'function') buildCols();
          }).catch((err) => {
            console.warn('[AUTH] Background Google token refresh failed:', err);
          }).finally(() => {
            reauthInProgress = false;
          });
        }
        // Remove listeners immediately on first try
        document.removeEventListener('mousedown', onFirstUserInteraction);
        document.removeEventListener('touchstart', onFirstUserInteraction);
        document.removeEventListener('keydown', onFirstUserInteraction);
      }
      document.addEventListener('mousedown', onFirstUserInteraction);
      document.addEventListener('touchstart', onFirstUserInteraction);
      document.addEventListener('keydown', onFirstUserInteraction);
    }

    if (SM.core.runHealthCheck) SM.core.runHealthCheck();
    initDB();
  } else {
    USER_ID = null;
    DB_REF = null;
    document.getElementById('login-screen').style.display = 'flex';
    document.getElementById('root').style.display = 'none';
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
      }
      isFirstLoad = false;
      renderMeta();
      buildCols();
      updateOfflineUI();
    }
    return;
  }

  // Load sharded listeners immediately so that offline cache loads instantly 
  // and listeners are attached without blocking on legacy migration check
  setupShardedListeners();

  // Backwards compatibility migration check: run in background asynchronously
  db.ref(DB_REF).once('value', (snap) => {
    const rawData = snap.val();
    if (rawData && rawData.pages && Array.isArray(rawData.pages)) {
      console.log('[MIGRATION] Monolithic legacy layout found. Migrating to sharded layout in background...');
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

      db.ref().update(updates).then(() => {
        console.log('[MIGRATION] Legacy data migration complete!');
      }).catch((err) => {
        console.error('[MIGRATION] Legacy data migration update failed:', err);
      });
    }
  }, (err) => {
    console.warn('[MIGRATION] Monolithic layout read error or permission denied (possibly already sharded):', err.message);
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
  // ─── Safe Eviction: ONLY clear memory after verified cache write ───
  const prevPg = cp();
  if (prevPg && prevPg.id !== pageId) {
    const prevItemCount = (prevPg.widgets || []).length + (prevPg.miroCards || []).length;
    if (prevItemCount > 0) {
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
        customCells: prevPg.customCells || []
      });
      if (cacheOk) {
        // Cache verified — safe to evict
        prevPg.widgets = [];
        prevPg.miroCards = [];
      } else {
        // Cache FAILED! Keep data in memory — DO NOT evict!
        console.error(`[EVICTION BLOCKED] Page "${prevPg.name}" (${prevPg.id}) has ${prevItemCount} items but cache write failed. Keeping in memory!`);
        if (typeof showToast === 'function') showToast('⚠️ Cache full — keeping page data in memory (safe)', 5000);
        // Still write to IndexedDB asynchronously (already done in cachePageDataSafe)
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
  renderMeta();

  if (_activePageListener) {
    db.ref(_activePageListener).off();
  }

  const pageDataRef = `users/${USER_ID}/startmine_pages/${pageId}`;
  _activePageListener = pageDataRef;

  // ─── Instant render from localStorage cache, IndexedDB fallback ───
  // ─── Instant render from localStorage cache, IndexedDB fallback ───
  const cachedPage = getCachedPageData(pageId);
  if (cachedPage && ((cachedPage.widgets || []).length > 0 || (cachedPage.miroCards || []).length > 0 || (cachedPage.vGuides || []).length > 0 || (cachedPage.hGuides || []).length > 0 || (cachedPage.customCells || []).length > 0)) {
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
      const fakeD = { pages: [pg] };
      sanitizeData(fakeD);
      _lastSyncedPageData = {
        widgets: JSON.stringify(pg.widgets),
        miroCards: JSON.stringify(pg.miroCards)
      };
    }
    buildCols();
  } else {
    // Try IndexedDB async (larger, more reliable cache)
    getCachedPageDataAsync(pageId).then(idbCached => {
      if (idbCached && ((idbCached.widgets || []).length > 0 || (idbCached.miroCards || []).length > 0 || (idbCached.vGuides || []).length > 0 || (idbCached.hGuides || []).length > 0 || (idbCached.customCells || []).length > 0)) {
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
          const fakeD = { pages: [pg] };
          sanitizeData(fakeD);
          _lastSyncedPageData = {
            widgets: JSON.stringify(pg.widgets),
            miroCards: JSON.stringify(pg.miroCards)
          };
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
      
      pg.ts = incomingTs;

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
    // Right-click: export this group
    tab.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const env = D.environments.find(ev => ev.id === g.envId);
      const grpPages = D.pages.filter(p => p.groupId === g.id);
      openSelIO('export', {
        settings: D.settings,
        environments: env ? [env] : [],
        groups: [g],
        pages: grpPages
      });
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
  openM('m-settings');
};
document.getElementById('ok-settings').onclick = () => {
  D.settings.defaultEnv = document.getElementById('set-def-env').value;
  D.settings.defaultGroup = document.getElementById('set-def-grp').value;
  D.settings.defaultPage = document.getElementById('set-def-pg').value;
  sv();
  closeM('m-settings');
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

  const useRibbon = !!(D.settings && D.settings.useRibbonBg && D.settings.ribbonBg);
  if (useRibbon) {
    const bg = D.settings.ribbonBg;
    ribbon.style.background = bg;
    if (envGroup) envGroup.style.background = 'transparent';
    if (ptabs) ptabs.style.background = 'transparent';

    const isLight = isCssColorLight(bg);
    ribbon.classList.toggle('contrast-light', isLight);
  } else {
    ribbon.style.background = '';
    if (envGroup) envGroup.style.background = '';
    if (ptabs) ptabs.style.background = '';

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
    // Right-click: export this page
    tab.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const grp = D.groups.find(g => g.id === pg.groupId);
      const env = grp ? D.environments.find(ev => ev.id === grp.envId) : null;
      openSelIO('export', {
        settings: D.settings,
        environments: env ? [env] : [],
        groups: grp ? [grp] : [],
        pages: [pg]
      });
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

document.getElementById('mz-autofit-btn').onclick = () => {
  const page = cp();
  if (!page || page.pageType !== 'miro') return;
  if (typeof window.autofitAllMiroSlices === 'function') {
    window.autofitAllMiroSlices();
  }
};

function buildCols() {
  const page = cp();
  const isMiro = page.pageType === 'miro';
  
  // Diagnostic Log inside the main render function
  console.log('[RENDER] Rendering page:', page.name, 'pageType:', page.pageType, 'widgets:', (page.widgets||[]).length, 'miroCards:', (page.miroCards||[]).length);
  
  const wrap = document.getElementById('cw');
  if (page.id.startsWith('time_')) {
    document.getElementById('miro-canvas').classList.add('hidden');
    document.body.classList.remove('miro-active');
    const mz = document.getElementById('miro-zoom');
    if (mz) mz.classList.remove('show');
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
  if (mz) mz.classList.toggle('show', isMiro);
  
  const maf = document.getElementById('miro-add-float');
  if (maf) maf.classList.toggle('show', isMiro);
  
  const mtb = document.getElementById('miro-toolbar');
  if (mtb) mtb.classList.toggle('show', isMiro);
  
  const colsWrap = document.getElementById('cols-wrap');
  if (colsWrap) colsWrap.style.display = isMiro ? 'none' : 'flex';
  
  if (isMiro) {
    page._guidesMode = false;
    if (typeof window.initMiroSlices === 'function') {
      window.initMiroSlices();
    }
    if (typeof buildMiroCanvas === 'function') buildMiroCanvas();
    if (typeof buildOutline === 'function') buildOutline();
    if (typeof updateGuidesButtonState === 'function') updateGuidesButtonState();
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
  if (!confirm('Delete this widget?')) return;
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
  const page = cp();
  if (!page.widgets) page.widgets = [];
  page.widgets.push(w);
  sv();
  buildCols();
  closeM('m-aw');
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
document.getElementById('tb').addEventListener('click', (e) => e.stopPropagation());
document.getElementById('ribbon').addEventListener('click', (e) => e.stopPropagation());
document.addEventListener('keydown', (e) => {
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

// Window aliases for backward compatibility
SM.renderAll = typeof renderAll !== 'undefined' ? renderAll : window.renderAll;
SM.buildCols = typeof buildCols !== 'undefined' ? buildCols : window.buildCols;
SM.saveAllBackups = typeof saveAllBackups !== 'undefined' ? saveAllBackups : window.saveAllBackups;
SM.openSnapshotModal = typeof openSnapshotModal !== 'undefined' ? openSnapshotModal : window.openSnapshotModal;

window.renderAll = SM.renderAll;
window.buildCols = SM.buildCols;
window.saveAllBackups = SM.saveAllBackups;
window.openSnapshotModal = SM.openSnapshotModal;
