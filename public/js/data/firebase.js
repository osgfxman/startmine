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

const provider = new firebase.auth.GoogleAuthProvider();
provider.addScope('https://www.googleapis.com/auth/drive.file');
provider.addScope('https://www.googleapis.com/auth/calendar.events');
provider.addScope('https://www.googleapis.com/auth/calendar.readonly');
provider.addScope('https://www.googleapis.com/auth/tasks');

window.USER_ID = null;
window.DB_REF = null;
window._googleAccessToken = null;
window._googleTokenExpiry = 0; // Timestamp when token expires

// ─── Token Persistence (tracked with expiry) ───
const LS_G_TOKEN = 'sm_google_token';
const LS_G_TOKEN_EXP = 'sm_google_token_expiry';
const TOKEN_LIFETIME_MS = 55 * 60 * 1000; // 55 minutes (Google access tokens expire in 60 minutes)

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
    // Token expired or missing — clear stale data
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

// ─── Auto-refresh Google token before expiry ───
// Refresh proactively every 45 min to avoid 401s during API calls
setInterval(async () => {
  if (_googleAccessToken && Date.now() >= _googleTokenExpiry - 10 * 60 * 1000) {
    console.log('[Token] Proactive refresh — will refresh on next user action');
    // Don't auto-popup — just clear the token so next user-triggered action re-auths
    _googleAccessToken = null;
    _googleTokenExpiry = 0;
    try { localStorage.removeItem(LS_G_TOKEN); localStorage.removeItem(LS_G_TOKEN_EXP); } catch(e) {}
  }
}, 5 * 60 * 1000); // Check every 5 minutes

// Ensure we have a valid Google access token
// NEVER opens a popup — returns cached token or throws NEEDS_AUTH.
// Popups should only be triggered by direct user clicks (login button, calendar connect button).
async function ensureGoogleToken() {
  if (!_googleAccessToken) restoreGoogleToken();
  if (!_googleAccessToken) {
    // No token — callers should show a "connect" button
    const e = new Error('NEEDS_AUTH'); e.needsAuth = true; throw e;
  }
  // If expired, still return the token — let the API call try it.
  // If it 401s, the retry logic will call ensureGoogleTokenFresh → manualGoogleReAuth from a user click.
  return _googleAccessToken;
}
// Force-refresh token (called from user-triggered retry after 401)
async function ensureGoogleTokenFresh() {
  try {
    return await manualGoogleReAuth();
  } catch(e) {
    // Don't show toast here — let callers handle it
    return null;
  }
}

// Re-auth with login_hint for minimal friction (account is pre-selected)
async function manualGoogleReAuth() {
  const user = auth.currentUser;
  if (!user) throw new Error('Not signed in to Firebase');
  const hintProvider = new firebase.auth.GoogleAuthProvider();
  hintProvider.addScope('https://www.googleapis.com/auth/drive.file');
  hintProvider.addScope('https://www.googleapis.com/auth/calendar.events');
  hintProvider.addScope('https://www.googleapis.com/auth/calendar.readonly');
  hintProvider.addScope('https://www.googleapis.com/auth/tasks');
  hintProvider.setCustomParameters({ login_hint: user.email });
  try {
    const result = await auth.signInWithPopup(hintProvider);
    if (result.credential) {
      cacheGoogleToken(result.credential.accessToken);
      return _googleAccessToken;
    }
  } catch (e) {
    if (typeof showToast === 'function') showToast('❌ Auth failed: ' + e.message, 4000);
    throw e;
  }
  throw new Error('Could not get Google access token');
}

// Expose globals for HTML / app.js
window.SM.core.expose('cacheGoogleToken', cacheGoogleToken);
window.SM.core.expose('restoreGoogleToken', restoreGoogleToken);
window.SM.core.expose('isGoogleTokenExpired', isGoogleTokenExpired);
window.SM.core.expose('ensureGoogleToken', ensureGoogleToken);
window.SM.core.expose('ensureGoogleTokenFresh', ensureGoogleTokenFresh);
window.SM.core.expose('manualGoogleReAuth', manualGoogleReAuth);

// Window aliases for backward compatibility
SM.data.auth = window.auth;
SM.data.db = window.db;
