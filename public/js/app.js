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

let USER_ID = null;
let DB_REF = null;

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
let _svTimer = null;
let _lastSyncedPageData = null;
let _lastSyncedPagesMetaStr = null;

/* ─── LocalStorage Cache ─── */
const LS_META = 'sm_meta';
const LS_PAGES_META = 'sm_pages_meta';
function lsPageKey(pid) { return 'sm_page_' + pid; }
function cacheMeta(meta) { try { localStorage.setItem(LS_META, JSON.stringify(meta)); } catch (e) { } }
function cachePagesMeta(pm) { try { localStorage.setItem(LS_PAGES_META, JSON.stringify(pm)); } catch (e) { } }
function cachePageData(pid, data) { try { localStorage.setItem(lsPageKey(pid), JSON.stringify(data)); } catch (e) { } }
function getCachedMeta() { try { return JSON.parse(localStorage.getItem(LS_META)); } catch (e) { return null; } }
function getCachedPagesMeta() { try { return JSON.parse(localStorage.getItem(LS_PAGES_META)); } catch (e) { return null; } }
function getCachedPageData(pid) { try { return JSON.parse(localStorage.getItem(lsPageKey(pid))); } catch (e) { return null; } }

document.getElementById('login-btn').onclick = () =>
  auth.signInWithPopup(provider).catch((e) => alert(e.message));
document.getElementById('logout-btn').onclick = () => auth.signOut();

auth.onAuthStateChanged((user) => {
  if (user) {
    USER_ID = user.uid;
    DB_REF = 'users/' + USER_ID + '/startmine_data';
    document.getElementById('user-email').textContent = '👤 ' + user.email;
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('root').style.display = 'flex';
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
      if (!D.cur && D.pages.length > 0) D.cur = D.pages[0].id;
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
    if (_ownWrite) return;
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
    cacheMeta(meta); // Cache to localStorage
    renderMeta();
  });

  // Listen to Pages Directory (names, ids, group associations)
  db.ref(pagesMetaRef).on('value', (snap) => {
    if (_ownWrite) return;
    const pagesMeta = snap.val() || [{ id: 'p0', groupId: 'g0', name: 'Home', pageType: 'miro', zoom: 100, panX: 0, panY: 0, bg: '', bgType: 'none' }];

    // We update D.pages but we MUST PRESERVE the currently loaded active page's heavy data so it doesn't vanish
    const oldWidgets = cp() ? cp().widgets : [];
    const oldMiroCards = cp() ? cp().miroCards : [];

    D.pages = pagesMeta;
    cachePagesMeta(pagesMeta); // Cache to localStorage
    // Establish baseline for smart pagesMeta diffing in sv()
    _lastSyncedPagesMetaStr = JSON.stringify(pagesMeta.map(p => ({
      id: p.id, groupId: p.groupId, name: p.name, pageType: p.pageType,
      zoom: p.zoom, panX: p.panX, panY: p.panY, bg: p.bg, bgType: p.bgType,
      tabColor: p.tabColor || ''
    })));

    if (isFirstLoad) {
      const dg = D.settings.defaultGroup || '__last__';
      const dp = D.settings.defaultPage || '__last__';
      if (dg !== '__last__' && D.groups.some((g) => g.id === dg)) D.curGroup = dg;
      if (dp !== '__last__' && D.pages.some((p) => p.id === dp)) D.cur = dp;
      if (!D.cur && D.pages.length > 0) D.cur = D.pages[0].id;
      isFirstLoad = false;
      switchActivePage(D.cur); // This will render All
    } else {
      // Re-inject the heavy data into the newly refreshed metadata page structure
      const activePg = cp();
      if (activePg) {
        activePg.widgets = oldWidgets || [];
        activePg.miroCards = oldMiroCards || [];
      }
      renderMeta();
    }

    setSyncStatus('ok', 'Realtime Sync Active \u2713');
  });

  db.ref('.info/connected').on('value', (snap) => {
    if (!snap.val() && !isFirstLoad) setSyncStatus('err', 'Offline \u2014 changes will sync when reconnected');
    else if (snap.val() && !isFirstLoad) setSyncStatus('ok', 'Realtime Sync Active \u2713');
  });
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
}

// Switch the active synchronized payload
function switchActivePage(pageId) {
  D.cur = pageId;
  renderMeta();

  if (_activePageListener) {
    db.ref(_activePageListener).off();
  }

  const pageDataRef = `users/${USER_ID}/startmine_pages/${pageId}`;
  _activePageListener = pageDataRef;

  // ─── Instant render from localStorage cache ───
  const cachedPage = getCachedPageData(pageId);
  if (cachedPage) {
    const pg = cp();
    if (pg) {
      pg.widgets = cachedPage.widgets || [];
      pg.miroCards = cachedPage.miroCards || [];
      const fakeD = { pages: [pg] };
      sanitizeData(fakeD);
      _lastSyncedPageData = {
        widgets: JSON.stringify(pg.widgets),
        miroCards: JSON.stringify(pg.miroCards)
      };
    }
    buildCols();
  } else {
    document.getElementById('cw').innerHTML = '<div style="padding: 2rem; color: var(--mu); text-align: center;">Loading page data...</div>';
  }

  db.ref(pageDataRef).on('value', (snap) => {
    if (_ownWrite) { _ownWrite = false; return; }
    const pData = snap.val() || { widgets: [], miroCards: [] };
    const pg = cp();
    if (pg) {
      pg.widgets = pData.widgets || [];
      pg.miroCards = pData.miroCards || [];
      // Clean loaded data using original logic wrapper
      const fakeD = { pages: [pg] };
      sanitizeData(fakeD);
      // Store baseline for delta diffing
      _lastSyncedPageData = {
        widgets: JSON.stringify(pg.widgets),
        miroCards: JSON.stringify(pg.miroCards)
      };
      // Cache to localStorage
      cachePageData(pageId, { widgets: pg.widgets, miroCards: pg.miroCards });
    }
    buildCols();
  });
}


function sv(saveAll = false, immediate = false) {
  if (!USER_ID) return;
  // Capture undo snapshot before saving (for Miro pages)
  if (typeof pushUndo === 'function') { try { pushUndo(); } catch(e) {} }

  const doSave = () => {
    _ownWrite = true;

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

    const pagesMeta = D.pages.map(p => ({
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
    updates[metaRef] = meta;

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
      D.pages.forEach(p => {
        updates[`users/${USER_ID}/startmine_pages/${p.id}`] = {
          widgets: p.widgets || [],
          miroCards: p.miroCards || []
        };
      });
    } else {
      // Only upload the heavy data for the active page
      const activePg = cp();
      if (activePg) {
        if (_lastSyncedPageData) {
          const curWidgetsStr = JSON.stringify(activePg.widgets || []);
          const curCardsStr = JSON.stringify(activePg.miroCards || []);

          const oldWidgets = JSON.parse(_lastSyncedPageData.widgets || '[]');
          const oldCards = JSON.parse(_lastSyncedPageData.miroCards || '[]');
          const curWidgets = activePg.widgets || [];
          const curCards = activePg.miroCards || [];

          let widgetsChanged = false;
          if (oldWidgets.length !== curWidgets.length) widgetsChanged = true;
          else {
            for (let i = 0; i < curWidgets.length; i++) {
              if (curWidgets[i].id !== oldWidgets[i].id) { widgetsChanged = true; break; }
            }
          }

          if (widgetsChanged) {
            updates[`users/${USER_ID}/startmine_pages/${activePg.id}/widgets`] = curWidgets;
          } else {
            for (let i = 0; i < curWidgets.length; i++) {
              if (JSON.stringify(curWidgets[i]) !== JSON.stringify(oldWidgets[i])) {
                updates[`users/${USER_ID}/startmine_pages/${activePg.id}/widgets/${i}`] = curWidgets[i];
              }
            }
          }

          let cardsChanged = false;
          if (oldCards.length !== curCards.length) cardsChanged = true;
          else {
            for (let i = 0; i < curCards.length; i++) {
              if (curCards[i].id !== oldCards[i].id) { cardsChanged = true; break; }
            }
          }

          if (cardsChanged) {
            updates[`users/${USER_ID}/startmine_pages/${activePg.id}/miroCards`] = curCards;
          } else {
            for (let i = 0; i < curCards.length; i++) {
              if (JSON.stringify(curCards[i]) !== JSON.stringify(oldCards[i])) {
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
            miroCards: activePg.miroCards || []
          };
        }
      }
    }

    db.ref().update(updates)
      .then(() => {
        _ownWrite = false;
        // Cache active page data to localStorage after successful save
        const activePg = cp();
        if (activePg) {
          cachePageData(activePg.id, { widgets: activePg.widgets || [], miroCards: activePg.miroCards || [] });
        }
      })
      .catch((err) => {
        _ownWrite = false;
        setSyncStatus('err', 'Sync error: ' + (err.code || err.message));
      });
  };

  clearTimeout(_svTimer);
  if (immediate) doSave();
  else _svTimer = setTimeout(doSave, 800);
}

// ─── Save Guards: prevent data loss on tab close ───
window.addEventListener('beforeunload', () => {
  if (_svTimer) { clearTimeout(_svTimer); sv(false, true); }
  // Auto-snapshot on browser close
  saveSnapshotBeacon();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && _svTimer) { clearTimeout(_svTimer); sv(false, true); }
  if (document.hidden) saveSnapshotBeacon();
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
    toast.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%) translateY(60px);background:rgba(20,20,30,.92);color:#fff;padding:10px 24px;border-radius:12px;font-size:.85rem;z-index:999999;pointer-events:none;opacity:0;transition:all .3s ease;backdrop-filter:blur(8px);border:1px solid rgba(255,255,255,.1);';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.style.opacity = '1';
  toast.style.transform = 'translateX(-50%) translateY(0)';
  clearTimeout(toast._tmr);
  toast._tmr = setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(-50%) translateY(60px)';
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
      id: p.id, groupId: p.groupId, name: p.name,
      pageType: p.pageType, zoom: p.zoom, panX: p.panX, panY: p.panY,
      bg: p.bg, bgType: p.bgType, tabColor: p.tabColor || ''
    })),
    pages: {}
  };
  D.pages.forEach(p => {
    snapshot.pages[p.id] = {
      widgets: p.widgets || [],
      miroCards: p.miroCards || []
    };
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
        id: p.id, groupId: p.groupId, name: p.name,
        pageType: p.pageType, zoom: p.zoom, panX: p.panX, panY: p.panY,
        bg: p.bg, bgType: p.bgType, tabColor: p.tabColor || ''
      })),
      pages: {}
    };
    D.pages.forEach(p => {
      snapshot.pages[p.id] = {
        widgets: p.widgets || [],
        miroCards: p.miroCards || []
      };
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
        if (confirm('Are you sure you want to restore this snapshot?\\nCurrent state will be saved first as a safety backup.')) {
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

function uid() {
  return 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
}
function esc(s) {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function cp() {
  return D.pages.find((p) => p.id === D.cur) || D.pages[0];
}
function fw(id) {
  for (const p of D.pages) {
    let w = (p.widgets || []).find((x) => x.id === id);
    if (w) return w;
    w = (p.miroCards || []).find((x) => x.id === id);
    if (w) return w;
  }
  return null;
}
function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}
function rgba(c) {
  return `rgba(${c.r},${c.g},${c.b},${c.a})`;
}
function getFav(url) {
  try {
    const d = new URL(url).hostname;
    return `https://www.google.com/s2/favicons?domain=${d}&sz=64`;
  } catch (e) {
    return '';
  }
}
function letterOf(label, url) {
  if (label) return label.trim()[0].toUpperCase();
  try {
    return new URL(url).hostname.replace('www.', '')[0].toUpperCase();
  } catch (e) {
    return '?';
  }
}
function letterColor(ch) {
  const c = ['#6c8fff', '#e8c97a', '#7ed4a4', '#ff8fa3', '#c4a0ff', '#ff9f6b', '#4dd0e1'];
  return c[(ch.charCodeAt(0) || 0) % c.length];
}
function domainOf(url) {
  try {
    return new URL(url).hostname.replace('www.', '');
  } catch (e) {
    return url;
  }
}
function mkFav(bm, w, h, rad) {
  const el = document.createElement('div');
  el.className = 'fav';
  el.style.cssText = `width:${w}px;height:${h}px;border-radius:${rad}px;font-size:${w * 0.38}px`;
  if (bm.emoji) {
    el.textContent = bm.emoji;
    el.style.background = 'rgba(255,255,255,.08)';
    return el;
  }
  const furl = getFav(bm.url || '');
  if (furl) {
    const img = document.createElement('img');
    img.src = furl;
    img.alt = '';
    img.onerror = () => {
      img.remove();
      showLetter(el, bm);
    };
    el.appendChild(img);
  } else {
    showLetter(el, bm);
  }
  return el;
}
function showLetter(el, bm) {
  const l = letterOf(bm.label, bm.url || '');
  el.textContent = l;
  el.style.background = letterColor(l);
  el.style.color = '#fff';
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
  openM('m-bg');
};

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
    // Upload to imgbb for persistent URL
    const btn = document.getElementById('ok-bg');
    btn.textContent = 'Uploading…';
    btn.disabled = true;
    const fd = new FormData();
    fd.append('image', base64.split(',')[1]);
    fetch('https://api.imgbb.com/1/upload?key=c2a058a30580ce5e21608e3ec431b9c0', {
      method: 'POST',
      body: fd,
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.success) {
          _bgTempValue = data.data.url;
        } else {
          _bgTempValue = base64; // fallback
        }
        btn.textContent = 'Apply';
        btn.disabled = false;
      })
      .catch(() => {
        _bgTempValue = base64; // fallback
        btn.textContent = 'Apply';
        btn.disabled = false;
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
function renderSR(q) {
  srIdx = -1;
  const c = $sr();
  if (!q) {
    c.classList.remove('show');
    return;
  }
  const matches = allBm()
    .filter(
      (b) =>
        (b.label || '').toLowerCase().includes(q.toLowerCase()) ||
        (b.url || '').toLowerCase().includes(q.toLowerCase()),
    )
    .slice(0, 10);
  c.innerHTML = '';
  if (matches.length) {
    const hd = document.createElement('div');
    hd.className = 'sr-sec';
    hd.textContent = 'Bookmarks';
    c.appendChild(hd);
    matches.forEach((bm) => {
      const a = document.createElement('a');
      a.className = 'sr-it';
      a.href = bm.url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      const fv = document.createElement('div');
      fv.className = 'sr-fv';
      if (bm.emoji) {
        fv.textContent = bm.emoji;
      } else {
        const img = document.createElement('img');
        img.src = getFav(bm.url);
        img.onerror = () => {
          img.style.display = 'none';
          const l = letterOf(bm.label, bm.url);
          fv.textContent = l;
          fv.style.cssText = `background:${letterColor(l)};color:#fff;font-weight:700;font-size:.55rem;border-radius:4px;display:flex;align-items:center;justify-content:center`;
        };
        fv.appendChild(img);
      }
      const nm = document.createElement('span');
      nm.className = 'sr-nm';
      nm.textContent = bm.label;
      const pg = document.createElement('span');
      pg.className = 'sr-pg';
      pg.textContent = bm._pg;
      a.appendChild(fv);
      a.appendChild(nm);
      a.appendChild(pg);
      c.appendChild(a);
    });
  }
  const eng = ENGINES.find((e) => e.k === D.settings.engine) || ENGINES[1];
  if (eng.url) {
    const hd2 = document.createElement('div');
    hd2.className = 'sr-sec';
    hd2.textContent = 'Web';
    c.appendChild(hd2);
    const wb = document.createElement('div');
    wb.className = 'sr-web';
    wb.innerHTML = `<span>${eng.ic}</span> Search "${q}" on ${eng.name}`;
    wb.onclick = () => {
      window.open(eng.url + encodeURIComponent(q), '_blank');
      $si().value = '';
      c.classList.remove('show');
    };
    c.appendChild(wb);
  }
  c.classList.toggle('show', matches.length > 0 || !!eng.url);
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
function buildEP() {
  const ep = document.getElementById('ep');
  ep.innerHTML = '';
  ENGINES.forEach((eng) => {
    const d = document.createElement('div');
    d.className = 'eopt' + (eng.k === D.settings.engine ? ' on' : '');
    d.innerHTML = `<span>${eng.ic}</span><span>${eng.name}</span>`;
    d.onclick = () => {
      D.settings.engine = eng.k;
      sv();
      buildEP();
      document.getElementById('seb').textContent =
        ENGINES.find((e) => e.k === D.settings.engine)?.ic || '🔍';
      ep.classList.remove('open');
    };
    ep.appendChild(d);
  });
  document.getElementById('seb').textContent =
    ENGINES.find((e) => e.k === D.settings.engine)?.ic || '🔍';
}
document.getElementById('seb').onclick = (ev) => {
  ev.stopPropagation();
  document.getElementById('ep').classList.toggle('open');
};
function buildAcPop() {
  const pop = document.getElementById('ac-pop');
  pop.innerHTML = '';
  SWATCHES.forEach((hex) => {
    const s = document.createElement('div');
    s.className = 'ac-sw';
    s.style.background = hex;
    s.style.borderColor = hex === D.settings.accent ? '#fff' : 'transparent';
    s.onclick = () => {
      D.settings.accent = hex;
      document.documentElement.style.setProperty('--ac', hex);
      document.getElementById('ac-dot').style.background = hex;
      sv();
      buildAcPop();
    };
    pop.appendChild(s);
  });
}
document.getElementById('io-btn').onclick = (ev) => {
  ev.stopPropagation();
  document.getElementById('io-pop').classList.toggle('open');
};

document.getElementById('exp-json').onclick = () => {
  const b = new Blob([JSON.stringify(D, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(b);
  a.download = 'startmine.json';
  a.click();
  document.getElementById('io-pop').classList.remove('open');
};

document.getElementById('exp-csv').onclick = () => {
  let csv = 'Title,URL,Widget,Page\n';
  for (const pg of D.pages)
    for (const w of pg.widgets || []) {
      if (!w.items) continue;
      for (const bm of w.items)
        csv += `"${(bm.label || '').replace(/"/g, '""')}","${(bm.url || '').replace(/"/g, '""')}","${(w.title || '').replace(/"/g, '""')}","${(pg.name || '').replace(/"/g, '""')}"\n`;
    }
  const b = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(b);
  a.download = 'startmine.csv';
  a.click();
  document.getElementById('io-pop').classList.remove('open');
};

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

document.getElementById('reset-btn').onclick = () => {
  if (!confirm('Reset all data?')) return;
  D = JSON.parse(JSON.stringify(DEF));
  sv();
  renderAll();
  document.getElementById('io-pop').classList.remove('open');
};


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
    tab.draggable = true;
    tab.addEventListener('dragstart', (e) => {
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
      if ((_dragEnvId && _dragEnvId !== env.id) || (_dragGrpId)) tab.classList.add('tab-dragover');
    });
    tab.addEventListener('dragleave', () => tab.classList.remove('tab-dragover'));
    tab.addEventListener('drop', (e) => {
      e.preventDefault();
      tab.classList.remove('tab-dragover');
      if (_dragGrpId) {
        const grp = D.groups.find((g) => g.id === _dragGrpId);
        if (grp && grp.envId !== env.id) {
          grp.envId = env.id;
          D.curEnv = env.id;
          D.curGroup = grp.id;
          const firstPage = D.pages.find(p => p.groupId === grp.id);
          if (firstPage) D.cur = firstPage.id;
          _dragGrpId = null;
          sv();
          renderAll();
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
      ev.stopPropagation();
      openEnvColorPop(ev, env.id);
    };

    const nm = document.createElement('span');
    nm.className = 'ptnm';
    nm.textContent = env.name;
    nm.contentEditable = 'false';
    nm.onblur = () => {
      nm.contentEditable = 'false';
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
      const firstGroupInEnv = D.groups.find((g) => g.envId === env.id);
      if (firstGroupInEnv) {
        D.curGroup = firstGroupInEnv.id;
        const firstPageInGroup = D.pages.find((p) => p.groupId === firstGroupInEnv.id);
        if (firstPageInGroup) D.cur = firstPageInGroup.id;
      }
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
    if (D.environments.length > 1) tab.appendChild(x);
    bar.insertBefore(tab, addBtn);
  });
}

let _dragGrpId = null;
function buildGroups() {
  const bar = document.getElementById('gtabs');
  bar.querySelectorAll('.gtab').forEach((t) => t.remove());
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
          D.cur = pg.id;
          _dragTabId = null;
          sv();
          renderAll();
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
      if (firstPageInGroup) D.cur = firstPageInGroup.id;
      sv();
      renderAll();
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
    D.curGroup = D.groups[0].id;
    const fp = D.pages.find((p) => p.groupId === D.curGroup);
    if (fp) D.cur = fp.id;
  } else {
    D.curGroup = '__all__';
  }
  sv();
  renderAll();
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
  const grpSel = document.getElementById('set-def-grp');
  const pgSel = document.getElementById('set-def-pg');
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
  grpSel.value = D.settings.defaultGroup || '__last__';
  pgSel.value = D.settings.defaultPage || '__last__';
  openM('m-settings');
};
document.getElementById('ok-settings').onclick = () => {
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
document.getElementById('inbox-url').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') addToInbox();
});
function addToInbox() {
  let url = document.getElementById('inbox-url').value.trim();
  if (!url) return;
  if (!url.startsWith('http')) url = 'https://' + url;
  const label = document.getElementById('inbox-lbl').value.trim() || url;
  if (!D.inbox) D.inbox = [];
  D.inbox.push({ id: uid(), url, label, ts: Date.now() });
  document.getElementById('inbox-url').value = '';
  document.getElementById('inbox-lbl').value = '';
  sv();
  buildInbox();
}
let _dragInboxId = null;
let _dragBmId = null;
let _dragBmSrcWid = null;

function buildInbox() {
  const list = document.getElementById('inbox-list');
  list.innerHTML = '';
  if (!D.inbox || !D.inbox.length) {
    list.innerHTML =
      '<div style="padding:1.5rem;text-align:center;color:var(--mu);font-size:.7rem">Empty — paste URLs here for later</div>';
    return;
  }
  D.inbox.forEach((item) => {
    const row = document.createElement('div');
    row.className = 'inbox-it';
    row.draggable = true;
    row.addEventListener('dragstart', (e) => {
      _dragInboxId = item.id;
      e.dataTransfer.effectAllowed = 'move';
      row.style.opacity = '.4';
    });
    row.addEventListener('dragend', () => {
      _dragInboxId = null;
      row.style.opacity = '1';
    });
    const img = document.createElement('img');
    img.src = getFav(item.url);
    img.onerror = () => {
      img.style.display = 'none';
    };
    const lbl = document.createElement('span');
    lbl.className = 'inbox-lbl';
    lbl.textContent = item.label;
    const url = document.createElement('span');
    url.className = 'inbox-url';
    url.textContent = domainOf(item.url);
    const open = document.createElement('a');
    open.href = item.url;
    open.target = '_blank';
    open.style.cssText = 'color:var(--ac);font-size:.6rem;text-decoration:none;flex-shrink:0';
    open.textContent = '↗';
    const rm = document.createElement('button');
    rm.className = 'inbox-rm';
    rm.textContent = '✕';
    rm.onclick = () => {
      D.inbox = D.inbox.filter((x) => x.id !== item.id);
      sv();
      buildInbox();
    };
    row.appendChild(img);
    row.appendChild(lbl);
    row.appendChild(url);
    row.appendChild(open);
    row.appendChild(rm);
    list.appendChild(row);
  });
}

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

// Duplicate link detection
let _dupScope = 'page'; // 'page' or 'all'
document.getElementById('dup-btn').onclick = () => {
  _dupScope = 'page';
  document.getElementById('dup-page').classList.add('ba');
  document.getElementById('dup-page').classList.remove('bg-btn');
  document.getElementById('dup-all').classList.add('bg-btn');
  document.getElementById('dup-all').classList.remove('ba');
  buildDupReport();
  openM('m-dup');
};
document.getElementById('dup-page').onclick = () => {
  _dupScope = 'page';
  document.getElementById('dup-page').classList.add('ba');
  document.getElementById('dup-page').classList.remove('bg-btn');
  document.getElementById('dup-all').classList.add('bg-btn');
  document.getElementById('dup-all').classList.remove('ba');
  buildDupReport();
};
document.getElementById('dup-all').onclick = () => {
  _dupScope = 'all';
  document.getElementById('dup-all').classList.add('ba');
  document.getElementById('dup-all').classList.remove('bg-btn');
  document.getElementById('dup-page').classList.add('bg-btn');
  document.getElementById('dup-page').classList.remove('ba');
  buildDupReport();
};
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
  if (!ribbon) return;
  let isLight = false;
  if (pg.bgType === 'solid' && pg.bg) {
    isLight = isCssColorLight(pg.bg);
  } else if (pg.bgType === 'image' && pg.bg) {
    isLight = false; // images are usually dark enough
  } else if (pg.bgType === 'gradient' && pg.bg) {
    // Check first color in gradient
    const m = pg.bg.match(/#[0-9a-fA-F]{6}|#[0-9a-fA-F]{3}|rgba?\([^)]+\)/);
    if (m) isLight = isCssColorLight(m[0]);
  }
  ribbon.classList.toggle('contrast-light', isLight);
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
    if (groupPages.length > 1) tab.appendChild(x);
    bar.insertBefore(tab, addBtn);
  });
}

document.getElementById('add-env').onclick = () => {
  const id = uid();
  D.environments.push({ id, name: 'Env ' + (D.environments.length + 1) });
  const gid = uid();
  D.groups.push({ id: gid, name: 'Group 1', envId: id });
  const pid = uid();
  D.pages.push({
    id: pid,
    groupId: gid,
    name: 'Miro 1',
    pageType: 'miro',
    miroCards: [],
    zoom: 100,
    panX: 0,
    panY: 0,
    bg: '',
    bgType: 'none',
    widgets: [],
  });
  D.curEnv = id;
  D.curGroup = gid;
  sv();
  switchActivePage(pid);
};

document.getElementById('add-grp').onclick = () => {
  const id = uid();
  const targetEnv = D.curEnv === '__all__' ? D.environments[0].id : D.curEnv;
  const envGroups = D.groups.filter((g) => g.envId === targetEnv);
  D.groups.push({ id, name: 'Group ' + (envGroups.length + 1), envId: targetEnv });
  const pid = uid();
  D.pages.push({
    id: pid,
    groupId: id,
    name: 'Miro 1',
    pageType: 'miro',
    miroCards: [],
    zoom: 100,
    panX: 0,
    panY: 0,
    bg: '',
    bgType: 'none',
    widgets: [],
  });
  D.curGroup = id;
  sv();
  switchActivePage(pid);
};

document.getElementById('add-pg').onclick = () => {
  const id = uid();
  const targetGroup = D.curGroup === '__all__' ? D.groups[0].id : D.curGroup;
  const groupPages = D.pages.filter((p) => p.groupId === targetGroup);
  D.pages.push({
    id,
    groupId: targetGroup,
    name: 'Miro ' + (groupPages.length + 1),
    pageType: 'miro',
    miroCards: [],
    zoom: 100,
    panX: 0,
    panY: 0,
    bg: '',
    bgType: 'none',
    widgets: [],
  });
  sv();
  switchActivePage(id);
};

function delEnv(eid) {
  if (D.environments.length <= 1) {
    alert('Cannot delete the only environment.');
    return;
  }
  if (!confirm('Delete this environment and ALL its groups and pages?')) return;
  const envIdx = D.environments.findIndex((e) => e.id === eid);
  if (envIdx < 0) return;

  const groupsToDel = D.groups.filter(g => g.envId === eid);
  const groupIds = groupsToDel.map(g => g.id);

  D.pages = D.pages.filter((p) => !groupIds.includes(p.groupId));
  D.groups = D.groups.filter((g) => g.envId !== eid);
  D.environments.splice(envIdx, 1);

  if (D.curEnv === eid || !D.environments.some(e => e.id === D.curEnv)) {
    D.curEnv = D.environments[0].id;
    const firstGroupInEnv = D.groups.find(g => g.envId === D.curEnv);
    if (firstGroupInEnv) {
      D.curGroup = firstGroupInEnv.id;
      const firstPageInGroup = D.pages.find(p => p.groupId === firstGroupInEnv.id);
      if (firstPageInGroup) D.cur = firstPageInGroup.id;
    }
  }
  sv();
  renderAll();
}

function delGroup(gid) {
  const envGroups = D.groups.filter(g => g.envId === D.curEnv);
  if (envGroups.length <= 1) {
    alert('Cannot delete the only group in this environment.');
    return;
  }
  if (!confirm('Delete this group and ALL its pages?')) return;
  const gidx = D.groups.findIndex((g) => g.id === gid);
  if (gidx < 0) return;
  D.pages = D.pages.filter((p) => p.groupId !== gid);
  D.groups.splice(gidx, 1);
  if (D.curGroup === gid || !D.groups.some(g => g.id === D.curGroup)) {
    const fallbackGroup = D.groups.find(g => g.envId === D.curEnv);
    if (fallbackGroup) {
      D.curGroup = fallbackGroup.id;
      const firstPageInGroup = D.pages.find((p) => p.groupId === fallbackGroup.id);
      if (firstPageInGroup) D.cur = firstPageInGroup.id;
    }
  }
  sv();
  renderAll();
}

function delPage(pid) {
  const pg = D.pages.find((p) => p.id === pid);
  if (!pg) return;
  const siblingPages = D.pages.filter((p) => p.groupId === pg.groupId);
  if (siblingPages.length <= 1) {
    alert('Cannot delete the only page in this group.');
    return;
  }
  if (!confirm('Delete this page?')) return;
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
function buildCols() {
  document.getElementById('cw').style.display = 'none';
  document.getElementById('miro-canvas').classList.remove('hidden');
  const mz = document.getElementById('miro-zoom');
  if (mz) mz.classList.add('show');
  const maf = document.getElementById('miro-add-float');
  if (maf) maf.classList.add('show');
  const mtb = document.getElementById('miro-toolbar');
  if (mtb) mtb.classList.add('show');
  if (typeof buildMiroCanvas === 'function') buildMiroCanvas();
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
    $si().focus();
  }
});
function renderAll() {
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
  // Cache locally for fast reload
  try {
    localStorage.setItem('startmine_cache', JSON.stringify(D));
    localStorage.setItem('startmine_cache_ts', '' + Date.now());
  } catch (e) { /* quota exceeded */ }
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

  D.cur = pageId;
  sv();
  renderAll();
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
  D.cur = newId;
  sv();
  renderAll();

  if (typeof showToast === 'function') {
    showToast(`Page converted and exported to Miro.`);
  }
};


// ─── Local Cache: instant load from localStorage on startup ───
(function initLocalCache() {
  const origInitDB = initDB;
  initDB = function () {
    // Load cached data first for instant render
    try {
      const cached = localStorage.getItem('startmine_cache');
      if (cached) {
        const data = JSON.parse(cached);
        if (data && data.pages) {
          D = sanitizeData(data);
          renderAll();
        }
      }
    } catch (e) { /* ignore parse errors */ }
    // Then start Firebase real-time listener (will overwrite with fresh data)
    origInitDB();
  };
})();
