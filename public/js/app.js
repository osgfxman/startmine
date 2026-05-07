const firebaseConfig = {
  apiKey: 'AIzaSyB-CeazTspR22753qVHzMlmgePPGVLhYdk',
  authDomain: 'quran-gfx.firebaseapp.com',
  databaseURL: 'https://quran-gfx-default-rtdb.asia-southeast1.firebasedatabase.app',
  projectId: 'quran-gfx',
  storageBucket: 'quran-gfx.firebasestorage.app',
  messagingSenderId: '117000797680',
  appId: '1:117000797680:web:8c3cb92817c79510e63135',
};
firebase.initializeApp(firebaseConfig);
const db = firebase.database();
const auth = firebase.auth();
const provider = new firebase.auth.GoogleAuthProvider();
provider.addScope('https://www.googleapis.com/auth/drive.file');
provider.addScope('https://www.googleapis.com/auth/calendar.events');
provider.addScope('https://www.googleapis.com/auth/calendar.readonly');

let USER_ID = null;
let DB_REF = null;
let _googleAccessToken = null;
let _googleTokenExpiry = 0; // Timestamp when token expires

// ─── Token Persistence (tracked with expiry) ───
const LS_G_TOKEN = 'sm_google_token';
const LS_G_TOKEN_EXP = 'sm_google_token_expiry';
const TOKEN_LIFETIME_MS = 55 * 60 * 1000; // 55 minutes (Google tokens last ~60min)

function cacheGoogleToken(token) {
  _googleAccessToken = token;
  _googleTokenExpiry = Date.now() + TOKEN_LIFETIME_MS;
  try {
    localStorage.setItem(LS_G_TOKEN, token || '');
    localStorage.setItem(LS_G_TOKEN_EXP, String(_googleTokenExpiry));
  } catch (e) {}
}

function restoreGoogleToken() {
  try {
    const t = localStorage.getItem(LS_G_TOKEN);
    const exp = parseInt(localStorage.getItem(LS_G_TOKEN_EXP) || '0');
    if (t && exp > Date.now()) {
      _googleAccessToken = t;
      _googleTokenExpiry = exp;
      return true;
    }
    // Token expired or missing — clear stale data BUT keep Firebase session alive
    if (t) {
      _googleAccessToken = null;
      localStorage.removeItem(LS_G_TOKEN);
      localStorage.removeItem(LS_G_TOKEN_EXP);
    }
  } catch (e) {}
  return false;
}

function isGoogleTokenExpired() {
  return !_googleAccessToken || Date.now() >= _googleTokenExpiry;
}

// Restore on load
restoreGoogleToken();

// ─── Silent Token Refresh (no popup) ───
// Try to silently refresh the Google access token using the existing Firebase session.
// This avoids forcing the user to re-auth every time the token expires.
async function silentRefreshGoogleToken() {
  try {
    const user = auth.currentUser;
    if (!user) return false;
    // Force Firebase to refresh its ID token — this also refreshes underlying credentials
    await user.getIdToken(true);
    console.log('[Token] Silent Firebase refresh OK');
    return true;
  } catch (e) {
    console.warn('[Token] Silent refresh failed:', e.message);
    return false;
  }
}

// ─── Proactive Token Management ───
// Check token status every 5 minutes. If close to expiry, try silent refresh.
// Only clear the token as a last resort (not preemptively).
setInterval(async () => {
  if (!_googleAccessToken) return;
  // If token expires in less than 10 minutes, attempt silent refresh
  if (Date.now() >= _googleTokenExpiry - 10 * 60 * 1000) {
    console.log('[Token] Approaching expiry — attempting silent refresh');
    const ok = await silentRefreshGoogleToken();
    if (!ok) {
      // Don't clear the token yet — let the next API call try it.
      // If it 401s, we'll handle re-auth at that point with a user-triggered popup.
      console.log('[Token] Silent refresh failed — will re-auth on next API failure');
    }
  }
}, 5 * 60 * 1000); // Check every 5 minutes
}, 5 * 60 * 1000); // Check every 5 minutes

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

const DEF = {
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

let D = JSON.parse(JSON.stringify(DEF));
let pColIdx = null,
  pWidId = null,
  renWid = null,
  colWid = null,
  dispWid = null;
let dragWid = null,
  pvTimer = null,
  _skipColor = false,
  tcPid = null;
let _bgTempType = 'solid',
  _bgTempValue = '';
let isFirstLoad = true;
let _ownWrite = false;
let _ownWriteTs = 0;
const OWN_WRITE_TIMEOUT = 5000; // Safety: auto-reset _ownWrite after 5 seconds
function setOwnWrite(val) {
  _ownWrite = val;
  if (val) _ownWriteTs = Date.now();
}
function isOwnWrite() {
  if (!_ownWrite) return false;
  // Safety timeout: if _ownWrite has been true for too long, auto-reset
  if (Date.now() - _ownWriteTs > OWN_WRITE_TIMEOUT) {
    console.warn('[DATA GUARD] _ownWrite was stuck for >5s — auto-resetting');
    _ownWrite = false;
    return false;
  }
  return true;
}
let _svTimer = null;
let _lastSyncedPageData = null;
let _lastSyncedPagesMetaStr = null;
let _lastSyncedMetaStr = null;
let _pendingDeletePageIds = []; // Track page IDs that need Firebase cleanup

/* ─── Offline Mode (default ON) ─── */
let _offlineMode = true;
let _dirtyOffline = false;
let _lastSvTs = 0; // Timestamp of last successful sv() for beacon dedup
try {
  const stored = localStorage.getItem('sm_offline_mode');
  if (stored !== null) _offlineMode = stored === '1';
  else localStorage.setItem('sm_offline_mode', '1'); // First visit: default to offline
} catch(e) {}

function setOfflineMode(val) {
  _offlineMode = val;
  try { localStorage.setItem('sm_offline_mode', val ? '1' : '0'); } catch(e) {}
  updateOfflineUI();
}

function updateOfflineUI() {
  const cb = document.getElementById('offline-toggle-cb');
  const lbl = document.getElementById('offline-label');
  const syncBtn = document.getElementById('sync-now-btn');
  if (cb) cb.checked = _offlineMode;
  if (lbl) lbl.textContent = _offlineMode ? '✈️ Offline' : '⚡ Realtime';
  if (syncBtn) syncBtn.disabled = !_offlineMode;
  // Update sync status display
  if (_offlineMode) {
    setSyncStatus('loading', _dirtyOffline ? '✈️ Offline Mode *' : '✈️ Offline Mode');
  }
}

function markDirtyOffline() {
  if (_offlineMode && !_dirtyOffline) {
    _dirtyOffline = true;
    updateOfflineUI();
  }
}

function toggleOfflineMode() {
  if (_offlineMode) {
    // Switching to Realtime: sync first if dirty, then re-attach listeners
    if (_dirtyOffline) {
      syncNow().then(() => {
        setOfflineMode(false);
        _dirtyOffline = false;
        setupShardedListeners();
        setSyncStatus('ok', 'Realtime Sync Active \u2713');
      }).catch(err => {
        showToast('❌ Sync failed: ' + (err.message || err));
      });
    } else {
      setOfflineMode(false);
      setupShardedListeners();
      setSyncStatus('ok', 'Realtime Sync Active \u2713');
    }
  } else {
    // Switching to Offline: detach listeners
    detachAllListeners();
    setOfflineMode(true);
    setSyncStatus('loading', '✈️ Offline Mode');
    showToast('✈️ Offline Mode — changes saved locally');
  }
}

function detachAllListeners() {
  if (!USER_ID) return;
  const metaRef = `users/${USER_ID}/startmine_meta`;
  const pagesMetaRef = `users/${USER_ID}/startmine_pages_meta`;
  db.ref(metaRef).off();
  db.ref(pagesMetaRef).off();
  db.ref('.info/connected').off();
  if (_activePageListener) {
    db.ref(_activePageListener).off();
  }
}

function syncNow() {
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

  const pagesMeta = D.pages.map(p => ({
    id: p.id, groupId: p.groupId, name: p.name,
    pageType: p.pageType, zoom: p.zoom, panX: p.panX, panY: p.panY,
    bg: p.bg, bgType: p.bgType, tabColor: p.tabColor || ''
  }));

  const updates = {};
  updates[metaRef] = meta;
  updates[pagesMetaRef] = pagesMeta;

  // Push all page data (active page from memory, others from cache)
  D.pages.forEach(p => {
    let widgets, miroCards;
    if (p.id === D.cur) {
      // Active page: use live in-memory data
      widgets = p.widgets || [];
      miroCards = p.miroCards || [];
    } else {
      // Non-active page: always prefer cache (memory is evicted)
      const cached = getCachedPageData(p.id);
      if (cached && (cached.widgets?.length > 0 || cached.miroCards?.length > 0)) {
        widgets = cached.widgets || [];
        miroCards = cached.miroCards || [];
      } else if ((p.widgets && p.widgets.length > 0) || (p.miroCards && p.miroCards.length > 0)) {
        widgets = p.widgets || [];
        miroCards = p.miroCards || [];
      } else {
        // SAFETY: skip to avoid overwriting Firebase with empty data
        console.warn(`[SYNC GUARD] Skipping page "${p.name}" (${p.id}) — no data available`);
        return;
      }
    }
    updates[`users/${USER_ID}/startmine_pages/${p.id}`] = { widgets, miroCards };
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
      if (wc > 0 || mc > 0) {
        try {
          localStorage.setItem(lsPageKey(p.id), JSON.stringify({ widgets: p.widgets, miroCards: p.miroCards }));
        } catch(e) { /* localStorage full, IDB already has it */ }
        // IndexedDB async — browser WILL finish this even after tab close
        idbSet('page_' + p.id, { widgets: p.widgets, miroCards: p.miroCards });
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
    if (wc > 0 || mc > 0) {
      snapshot.pages[p.id] = { widgets: p.widgets, miroCards: p.miroCards };
    } else {
      // Try cache
      const cached = getCachedPageData(p.id);
      if (cached && ((cached.widgets || []).length > 0 || (cached.miroCards || []).length > 0)) {
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
      cachePageData(pg.id, { widgets: pg.widgets, miroCards: pg.miroCards });
    }
    if (localC > 0 && cacheC === 0) {
      console.warn(`[INTEGRITY ⚠️] "${pg.name}": Memory has ${localC}c but cache has 0c!`);
      cachePageData(pg.id, { widgets: pg.widgets, miroCards: pg.miroCards });
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

// ─── Firebase Auth Persistence ───
// LOCAL = persists across browser restarts (most user-friendly)
// This is critical: without this, users must re-login every time the browser session ends.
auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch((e) => {
  console.warn('[Auth] Could not set persistence:', e.message);
});

document.getElementById('login-btn').onclick = () =>
  auth.signInWithPopup(provider).then((result) => {
    if (result.credential) {
      cacheGoogleToken(result.credential.accessToken);
    }
  }).catch((e) => {
    // Friendlier error handling — don't alert() unless it's truly fatal
    if (e.code === 'auth/popup-closed-by-user' || e.code === 'auth/cancelled-popup-request') {
      // User just closed the popup — silent ignore
      return;
    }
    if (typeof showToast === 'function') {
      showToast('❌ Login failed: ' + (e.message || 'Unknown error'), 5000);
    } else {
      alert(e.message);
    }
  });
document.getElementById('logout-btn').onclick = () => {
  // Clear cached Google token on explicit logout
  try {
    localStorage.removeItem(LS_G_TOKEN);
    localStorage.removeItem(LS_G_TOKEN_EXP);
  } catch(e) {}
  _googleAccessToken = null;
  _googleTokenExpiry = 0;
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
  if (!d.settings) d.settings = { engine: 'bm', accent: '#6c8fff' };
  if (!d.environments || !Array.isArray(d.environments) || d.environments.length === 0) {
    d.environments = [{ id: 'e0', name: 'Main Env' }];
  }
  if (!d.curEnv) d.curEnv = d.environments[0].id;

  if (!d.groups || !Array.isArray(d.groups) || d.groups.length === 0) {
    d.groups = [{ id: 'g0', name: 'Main Group', envId: d.environments[0].id }];
  }
  // Backwards compatibility: ensure all groups have an envId
  d.groups.forEach(g => {
    if (!g.envId) g.envId = d.environments[0].id;
  });

  if (!d.curGroup) d.curGroup = d.groups[0].id;
  if (!d.pages) d.pages = JSON.parse(JSON.stringify(DEF.pages));
  d.pages.forEach((p) => {
    if (!p.groupId) p.groupId = d.groups[0].id;
    if (p.pageType !== 'miro') {
      p.pageType = 'miro';
      if (!p.miroCards) p.miroCards = [];
      p.zoom = 100;
      p.panX = 0;
      p.panY = 0;
    }
    if (p.pageType === 'miro' && p.widgets && p.widgets.length > 0) {
      const startX = 100;
      const startY = 100;
      const gap = 40;
      let cursX = startX;
      let cursY = startY;
      let rowMaxH = 0;
      const colsPerRow = 4;
      let addedCount = 0;
      p.widgets.forEach((w) => {
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
        p.miroCards.push({
          id: (typeof uid === 'function' ? uid() : Math.random().toString(36).substr(2, 9)),
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
        addedCount++;
        if (addedCount % colsPerRow === 0) {
          cursX = startX;
          cursY += rowMaxH + gap;
          rowMaxH = 0;
        }
      });
      p.widgets = [];
      p.cols = undefined;
    }
    if (!p.widgets) p.widgets = [];
    p.widgets.forEach((w) => {
      if (w.type !== 'note' && !w.items) w.items = [];
      if (!w.color || (w.color.r < 30 && w.color.g < 30 && w.color.b < 40))
        w.color = { ...DEF_COLOR };
    });
  });
  if (!d.cur) d.cur = d.pages[0]?.id || 'p0';
  if (!d.inbox) d.inbox = [];
  return d;
}

function initDB() {
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
      // Ensure curGroup matches the restored page
      const restoredPage = D.pages.find(p => p.id === D.cur);
      if (restoredPage && restoredPage.groupId) {
        D.curGroup = restoredPage.groupId;
      }
      const cachedPage = getCachedPageData(D.cur);
      const pg = cp();
      if (pg && cachedPage) {
        pg.widgets = cachedPage.widgets || [];
        pg.miroCards = cachedPage.miroCards || [];
      }
      isFirstLoad = false;
      renderMeta();
      buildCols();
      updateOfflineUI();
    }
    return;
  }

  // Backwards compatibility migration logic: if the user still has monolithic data, migrate it first
  db.ref(DB_REF).once('value', (snap) => {
    const rawData = snap.val();
    if (rawData && rawData.pages && Array.isArray(rawData.pages)) {
      // It's a monolith. Let's shard it.
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
      updates[`users/${USER_ID}/startmine_data`] = null;

      db.ref().update(updates).then(() => {
        setupShardedListeners();
      }).catch((err) => {
        console.warn('Migration failed, proceeding with sharded listeners:', err);
        setSyncStatus('err', 'Migration error — retrying…');
        setupShardedListeners();
      });
    } else {
      setupShardedListeners();
    }
  }, (err) => {
    // Error reading legacy data — skip migration, go straight to sharded listeners
    console.warn('initDB read error, proceeding with sharded listeners:', err);
    setSyncStatus('err', 'Connection error — retrying…');
    setupShardedListeners();
  });
}

let _activePageListener = null;

function setupShardedListeners() {
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
    D.environm