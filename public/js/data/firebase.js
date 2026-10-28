/**
 * @module Firebase
 * @description Initializes Firebase app and authentication services
 * @namespace SM.data
 * @depends namespace.js
 * @provides window.auth, window.db, window.provider
 * @safety Ensure Firebase SDKs are loaded before this file runs
 */
// js/data/firebase.js
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
window.db = firebase.database();
window.auth = firebase.auth();

if (localStorage.getItem('sm_test_mock_auth') === 'true') {
  console.log('[MOCK AUTH] Bypassing Firebase with mock database and authentication...');
  const _listeners = {};
  const _dbStore = {};
  function triggerListeners(path) {
    if (_listeners[path]) {
      for (const cb of _listeners[path]) {
        const val = _dbStore[path];
        cb({ val: () => (val !== undefined ? val : null) });
      }
    }
  }

  window.firebase = {
    initializeApp: () => {},
    auth: function() {
      return window.auth;
    },
    database: function() {
      return {
        ref: function(path = '') {
          return {
            on: function(event, cb) {
              if (!_listeners[path]) _listeners[path] = [];
              _listeners[path].push(cb);
              if (path === '.info/connected') {
                setTimeout(() => cb({ val: () => true }), 0);
              } else {
                const val = _dbStore[path];
                setTimeout(() => cb({ val: () => (val !== undefined ? val : null) }), 0);
              }
            },
            off: function() {
              delete _listeners[path];
            },
            once: function(event) {
              const val = _dbStore[path];
              return Promise.resolve({ val: () => (val !== undefined ? val : null) });
            },
            update: function(updates) {
              for (const k in updates) {
                _dbStore[k] = updates[k];
                triggerListeners(k);
              }
              return Promise.resolve();
            },
            set: function(val) {
              _dbStore[path] = val;
              triggerListeners(path);
              return Promise.resolve();
            }
          };
        }
      };
    }
  };

  window.firebase.auth.GoogleAuthProvider = function() {
    this.addScope = () => {};
    this.setCustomParameters = () => {};
  };

  window.db = window.firebase.database();

  window.auth = {
    currentUser: { uid: 'mock-user-123', email: 'test@example.com' },
    onAuthStateChanged: function(cb) {
      setTimeout(() => cb({ uid: 'mock-user-123', email: 'test@example.com' }), 0);
      return () => {};
    },
    signOut: function() {
      localStorage.removeItem('sm_test_mock_auth');
      window.location.reload();
      return Promise.resolve();
    },
    getRedirectResult: function() {
      return Promise.resolve(null);
    },
    signInWithPopup: function() {
      return Promise.resolve({ user: { uid: 'mock-user-123', email: 'test@example.com' } });
    },
    signInWithRedirect: function() {
      return Promise.resolve();
    }
  };
}

const OWNER_DEFAULT_EMAIL = 'osgfxman@gmail.com';
try {
  if (window.auth && typeof window.auth.setPersistence === 'function' && firebase.auth && firebase.auth.Auth && firebase.auth.Auth.Persistence) {
    window.auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(() => {});
  }
} catch (e) {}

const provider = new firebase.auth.GoogleAuthProvider();
provider.addScope('https://www.googleapis.com/auth/drive.file');
provider.addScope('https://www.googleapis.com/auth/calendar.events');
provider.addScope('https://www.googleapis.com/auth/calendar.readonly');
provider.addScope('https://www.googleapis.com/auth/tasks');
try {
  const savedHintEmail = localStorage.getItem('sm_saved_email') || OWNER_DEFAULT_EMAIL;
  provider.setCustomParameters({ login_hint: savedHintEmail });
  if (localStorage.getItem('sm_explicit_logout') !== 'true') {
    localStorage.setItem('sm_remember_me', 'true');
  }
} catch (e) {}

window.USER_ID = null;
window.DB_REF = null;
window._googleAccessToken = null;
window._googleTokenExpiry = 0; // Timestamp when token expires

// Track recent user gestures so popups are only opened when browsers allow them
window._lastUserGestureTs = 0;
(function trackUserGestures() {
  const mark = () => { window._lastUserGestureTs = Date.now(); };
  ['mousedown', 'touchstart', 'keydown', 'click'].forEach(ev => {
    window.addEventListener(ev, mark, { capture: true, passive: true });
  });
})();

// ─── Token Persistence (tracked with expiry + synced across user's devices via Firebase) ───
const LS_G_TOKEN = 'sm_google_token';
const LS_G_TOKEN_EXP = 'sm_google_token_expiry';
const TOKEN_LIFETIME_MS = 55 * 60 * 1000; // 55 minutes (Google access tokens expire in 60 minutes)
let _activeReAuthPromise = null;
let _lastAutoReAuthAttemptTs = 0;

function cacheGoogleToken(token, customExpiryMs) {
  if (!token) return;
  _googleAccessToken = token;
  _googleTokenExpiry = customExpiryMs || (Date.now() + TOKEN_LIFETIME_MS);
  try {
    localStorage.setItem(LS_G_TOKEN, token);
    localStorage.setItem(LS_G_TOKEN_EXP, String(_googleTokenExpiry));
    localStorage.setItem('gdrive_access_token', token);
    localStorage.setItem('gdrive_token_expiry', String(_googleTokenExpiry));
  } catch (e) {}

  // Sync fresh token to Firebase under the owner's node so mobile/other tabs stay signed in automatically
  try {
    const uid = window.USER_ID || (window.auth && window.auth.currentUser && window.auth.currentUser.uid) || localStorage.getItem('sm_saved_uid');
    if (uid && window.db) {
      window.db.ref(`users/${uid}/startmine_auth`).set({
        accessToken: token,
        expiry: _googleTokenExpiry,
        email: (window.auth && window.auth.currentUser && window.auth.currentUser.email) || localStorage.getItem('sm_saved_email') || OWNER_DEFAULT_EMAIL,
        uid: uid,
        updatedAt: Date.now()
      }).catch(() => {});
    }
  } catch (e) {}
}

function restoreGoogleToken() {
  try {
    const t = localStorage.getItem(LS_G_TOKEN) || localStorage.getItem('gdrive_access_token');
    if (t) {
      _googleAccessToken = t;
      _googleTokenExpiry = parseInt(localStorage.getItem(LS_G_TOKEN_EXP) || localStorage.getItem('gdrive_token_expiry') || '0', 10);
      return true;
    }
  } catch (e) {}
  return false;
}

function isGoogleTokenExpired() {
  return !_googleAccessToken || Date.now() >= _googleTokenExpiry;
}

// Pull shared token from Firebase if another device/tab refreshed it more recently
async function syncGoogleTokenFromCloud() {
  try {
    const uid = window.USER_ID || (window.auth && window.auth.currentUser && window.auth.currentUser.uid) || localStorage.getItem('sm_saved_uid');
    if (!uid || !window.db) return null;
    const snap = await Promise.race([
      window.db.ref(`users/${uid}/startmine_auth`).once('value'),
      new Promise(r => setTimeout(() => r(null), 3500))
    ]);
    const val = snap && typeof snap.val === 'function' ? snap.val() : null;
    if (val && val.accessToken && val.expiry && val.expiry > Date.now() + 60000) {
      _googleAccessToken = val.accessToken;
      _googleTokenExpiry = val.expiry;
      try {
        localStorage.setItem(LS_G_TOKEN, val.accessToken);
        localStorage.setItem(LS_G_TOKEN_EXP, String(val.expiry));
        localStorage.setItem('gdrive_access_token', val.accessToken);
        localStorage.setItem('gdrive_token_expiry', String(val.expiry));
      } catch (e) {}
      return _googleAccessToken;
    }
  } catch (e) {}
  return null;
}

// Restore on load
restoreGoogleToken();

// Listen across tabs if another tab refreshes the token in localStorage
window.addEventListener('storage', (e) => {
  if ((e.key === LS_G_TOKEN || e.key === 'gdrive_access_token') && e.newValue) {
    restoreGoogleToken();
  }
});

// ─── Google token management (Always returns a Promise, never throws synchronously) ───
async function ensureGoogleToken() {
  if (!_googleAccessToken) restoreGoogleToken();
  if (_googleAccessToken && !isGoogleTokenExpired()) {
    return _googleAccessToken;
  }

  // 1. Check if another tab or device saved a fresh token in Firebase
  const cloudToken = await syncGoogleTokenFromCloud();
  if (cloudToken && !isGoogleTokenExpired()) {
    return cloudToken;
  }

  // 2. If user recently clicked/tapped (within 4s), auto-refresh seamlessly
  const hasRecentGesture = (Date.now() - (window._lastUserGestureTs || 0)) < 4000;
  if (hasRecentGesture && (Date.now() - _lastAutoReAuthAttemptTs > 15000)) {
    _lastAutoReAuthAttemptTs = Date.now();
    try {
      const refreshed = await manualGoogleReAuth({ silentOnBlock: true });
      if (refreshed) return refreshed;
    } catch (e) { /* fall through */ }
  }

  // 3. Schedule automatic refresh on the next user click if Remember Me is enabled
  armRememberMeAutoRefresh();

  const e = new Error('NEEDS_AUTH');
  e.needsAuth = true;
  throw e;
}

// Force-refresh token (called from user-triggered retry after 401)
async function ensureGoogleTokenFresh(opts = {}) {
  try {
    const cloudToken = await syncGoogleTokenFromCloud();
    if (cloudToken && !isGoogleTokenExpired() && !opts.forcePopup) {
      return cloudToken;
    }
    return await manualGoogleReAuth(opts);
  } catch (e) {
    return null;
  }
}

// Re-auth with login_hint for minimal friction (account is pre-selected)
async function manualGoogleReAuth(opts = {}) {
  if (_activeReAuthPromise) return _activeReAuthPromise;

  _activeReAuthPromise = (async () => {
    const user = window.auth && window.auth.currentUser;
    const hintEmail = (user && user.email) || localStorage.getItem('sm_saved_email') || OWNER_DEFAULT_EMAIL;
    const hintProvider = new firebase.auth.GoogleAuthProvider();
    hintProvider.addScope('https://www.googleapis.com/auth/drive.file');
    hintProvider.addScope('https://www.googleapis.com/auth/calendar.events');
    hintProvider.addScope('https://www.googleapis.com/auth/calendar.readonly');
    hintProvider.addScope('https://www.googleapis.com/auth/tasks');
    if (hintEmail) {
      hintProvider.setCustomParameters({ login_hint: hintEmail });
    }
    try {
      const result = await auth.signInWithPopup(hintProvider);
      if (result && result.user) {
        try {
          localStorage.setItem('sm_saved_uid', result.user.uid);
          localStorage.setItem('sm_saved_email', result.user.email || hintEmail);
          localStorage.setItem('sm_remember_me', 'true');
          localStorage.removeItem('sm_explicit_logout');
        } catch (e) {}
      }
      var cred = result.credential || (firebase.auth.GoogleAuthProvider.credentialFromResult && firebase.auth.GoogleAuthProvider.credentialFromResult(result));
      if (cred && cred.accessToken) {
        cacheGoogleToken(cred.accessToken);
        return _googleAccessToken;
      }
    } catch (e) {
      const code = (e && e.code) || '';
      const isBenignBlock = code === 'auth/popup-blocked' || code === 'auth/cancelled-popup-request' || code === 'auth/popup-closed-by-user';
      if (!opts.silentOnBlock && !isBenignBlock) {
        console.error('[AUTH REAUTH ERROR]', e);
        if (typeof showToast === 'function') showToast('❌ Auth failed: ' + (e.message || e), 4000);
      } else {
        console.warn('[AUTH] Popup skipped/closed:', code || e.message);
      }
      throw e;
    }
    throw new Error('Could not get Google access token');
  })().finally(() => {
    _activeReAuthPromise = null;
  });

  return _activeReAuthPromise;
}

let _rememberMeListenerArmed = false;
function armRememberMeAutoRefresh() {
  if (_rememberMeListenerArmed) return;
  if (localStorage.getItem('sm_explicit_logout') === 'true') return;
  if (!isGoogleTokenExpired()) return;
  _rememberMeListenerArmed = true;

  const onUserAction = async (ev) => {
    // Only trigger on primary click/tap on interactive elements, and respect a 2-minute cooldown
    if (ev.type === 'mousedown' && ev.button !== 0) return;
    if (!isGoogleTokenExpired()) {
      cleanup();
      return;
    }
    if (Date.now() - _lastAutoReAuthAttemptTs < 120000) return;
    cleanup();
    _lastAutoReAuthAttemptTs = Date.now();
    const cloudToken = await syncGoogleTokenFromCloud();
    if (cloudToken && !isGoogleTokenExpired()) return;
  };

  function cleanup() {
    _rememberMeListenerArmed = false;
    document.removeEventListener('mousedown', onUserAction);
    document.removeEventListener('touchstart', onUserAction);
  }

  document.addEventListener('mousedown', onUserAction, { passive: true });
  document.addEventListener('touchstart', onUserAction, { passive: true });
}

// Expose globals for HTML / app.js
window.SM.core.expose('cacheGoogleToken', cacheGoogleToken);
window.SM.core.expose('restoreGoogleToken', restoreGoogleToken);
window.SM.core.expose('isGoogleTokenExpired', isGoogleTokenExpired);
window.SM.core.expose('syncGoogleTokenFromCloud', syncGoogleTokenFromCloud);
window.SM.core.expose('ensureGoogleToken', ensureGoogleToken);
window.SM.core.expose('ensureGoogleTokenFresh', ensureGoogleTokenFresh);
window.SM.core.expose('manualGoogleReAuth', manualGoogleReAuth);

// Window aliases for backward compatibility
SM.data.auth = window.auth;
SM.data.db = window.db;
