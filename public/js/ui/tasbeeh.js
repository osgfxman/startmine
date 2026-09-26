/**
 * @module TasbeehPane
 * @description Manages the digital Tasbeeh side pane, lazy loading, resize gestures, and reload persistence
 * @namespace SM.ui.tasbeeh
 * @depends namespace.js
 * @provides window.openTasbeehPane, window.closeTasbeehPane, window.refreshTasbeehPane, window.toggleOrRefreshTasbeehPane, window.isTasbeehOpen
 * @safety Iframe is lazy-loaded strictly on demand to preserve zero initial page load overhead
 */
(function () {
  'use strict';

  const TASBEEH_URL = 'https://cloudtasbeeh.ai.studio/?sync=TSB-747';
  const STORAGE_WIDTH_KEY = 'sm_tasbeeh_width';
  const SESSION_OPEN_KEY = 'sm_tasbeeh_open_state';
  const DEFAULT_WIDTH = 395; // Mobile phone portrait aspect default width

  function getElements() {
    return {
      pane: document.getElementById('tasbeeh-sidepane'),
      body: document.getElementById('tasbeeh-body'),
      btn: document.getElementById('tasbeeh-btn'),
      handle: document.getElementById('tasbeeh-resize-handle'),
      refreshBtn: document.getElementById('tasbeeh-refresh-btn'),
      closeBtn: document.getElementById('tasbeeh-close-btn'),
      iframe: document.getElementById('tasbeeh-iframe'),
    };
  }

  function isTasbeehOpen() {
    const pane = document.getElementById('tasbeeh-sidepane');
    return !!(pane && pane.classList.contains('open'));
  }

  function showLoader(body) {
    if (!body) return;
    let loader = document.getElementById('tasbeeh-loader');
    if (!loader) {
      loader = document.createElement('div');
      loader.id = 'tasbeeh-loader';
      loader.className = 'tasbeeh-loader';
      loader.innerHTML = '<div class="tasbeeh-spinner"></div><span>جارٍ تحميل السبحة الإلكترونية...</span>';
      body.appendChild(loader);
    }
    loader.style.opacity = '1';
    loader.style.display = 'flex';
  }

  function hideLoader() {
    const loader = document.getElementById('tasbeeh-loader');
    if (loader) {
      loader.style.opacity = '0';
      setTimeout(() => {
        if (loader && loader.style.opacity === '0') {
          loader.style.display = 'none';
        }
      }, 250);
    }
  }

  function ensureIframe(forceReload) {
    const els = getElements();
    if (!els.body) return null;

    let iframe = document.getElementById('tasbeeh-iframe');
    if (!iframe) {
      showLoader(els.body);
      iframe = document.createElement('iframe');
      iframe.id = 'tasbeeh-iframe';
      iframe.className = 'tasbeeh-iframe';
      iframe.setAttribute('allow', 'fullscreen; clipboard-read; clipboard-write; autoplay');
      iframe.setAttribute('title', 'السبحة الإلكترونية');
      iframe.setAttribute('loading', 'lazy');
      iframe.onload = () => {
        hideLoader();
      };
      iframe.onerror = () => {
        hideLoader();
      };
      iframe.src = TASBEEH_URL;
      els.body.appendChild(iframe);
    } else if (forceReload) {
      showLoader(els.body);
      // Cross-origin safe iframe reload
      try {
        iframe.contentWindow.location.reload();
      } catch (e) {
        const s = iframe.src || TASBEEH_URL;
        iframe.src = 'about:blank';
        setTimeout(() => {
          iframe.src = s;
        }, 30);
      }
    }
    return iframe;
  }

  function openTasbeehPane(forceReload) {
    const els = getElements();
    if (!els.pane) return;

    // Apply saved width if any
    const savedW = localStorage.getItem(STORAGE_WIDTH_KEY);
    if (savedW) {
      els.pane.style.width = savedW;
    } else {
      els.pane.style.width = DEFAULT_WIDTH + 'px';
    }

    els.pane.classList.add('open');
    if (els.btn) els.btn.classList.add('active-toggle');
    try {
      sessionStorage.setItem(SESSION_OPEN_KEY, '1');
    } catch (e) {}

    ensureIframe(!!forceReload);
  }

  function closeTasbeehPane() {
    const els = getElements();
    if (!els.pane) return;

    els.pane.classList.remove('open');
    if (els.btn) els.btn.classList.remove('active-toggle');
    try {
      sessionStorage.removeItem(SESSION_OPEN_KEY);
    } catch (e) {}
  }

  function refreshTasbeehPane() {
    const els = getElements();
    if (els.refreshBtn) {
      els.refreshBtn.classList.remove('spin-once');
      void els.refreshBtn.offsetWidth; // trigger reflow
      els.refreshBtn.classList.add('spin-once');
    }

    if (!isTasbeehOpen()) {
      openTasbeehPane(true);
    } else {
      ensureIframe(true);
      if (typeof window.showToast === 'function') {
        window.showToast('🔄 تم تحديث السبحة الإلكترونية', 1500);
      }
    }
  }

  function toggleOrRefreshTasbeehPane() {
    // User requirement: "وأهم خاصيه إنه كل مره يتضغط الزرار أو الإختصار يعمل ريفريش للينك .."
    // If closed: opens pane and loads fresh.
    // If open: refreshes the link!
    if (!isTasbeehOpen()) {
      openTasbeehPane(true);
    } else {
      refreshTasbeehPane();
    }
  }

  // Setup Resize Drag on Right Border
  function initResize() {
    const els = getElements();
    if (!els.pane || !els.handle) return;

    let isDragging = false;

    els.handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      isDragging = true;
      els.pane.style.transition = 'none';
      document.body.classList.add('tasbeeh-resizing');

      const onMove = (ev) => {
        if (!isDragging) return;
        const newW = ev.clientX;
        const minW = 280;
        const maxW = Math.min(window.innerWidth * 0.9, 900);
        if (newW >= minW && newW <= maxW) {
          els.pane.style.width = newW + 'px';
        }
      };

      const onUp = (ev) => {
        if (!isDragging) return;
        isDragging = false;
        els.pane.style.transition = '';
        document.body.classList.remove('tasbeeh-resizing');
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);

        const finalW = els.pane.style.width;
        if (finalW) {
          localStorage.setItem(STORAGE_WIDTH_KEY, finalW);
        }
      };

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }

  // Setup Event Handlers & Shortcuts
  function initHandlers() {
    const els = getElements();

    if (els.btn) {
      els.btn.onclick = (e) => {
        e.stopPropagation();
        toggleOrRefreshTasbeehPane();
      };
    }

    if (els.refreshBtn) {
      els.refreshBtn.onclick = (e) => {
        e.stopPropagation();
        refreshTasbeehPane();
      };
    }

    if (els.closeBtn) {
      els.closeBtn.onclick = (e) => {
        e.stopPropagation();
        closeTasbeehPane();
      };
    }

    // Keyboard shortcuts:
    // 1) Q or ض to toggle/refresh
    // 2) Escape to close if open
    // 3) Ctrl+Shift+R / Ctrl+F5 / F5 to mark reload persistence
    document.addEventListener('keydown', (e) => {
      // Escape closes tasbeeh pane if open
      if (e.key === 'Escape' && isTasbeehOpen()) {
        closeTasbeehPane();
        return;
      }

      // Track reload combinations when open
      const isReloadKey =
        (e.ctrlKey && e.shiftKey && (e.key === 'r' || e.key === 'R' || e.code === 'KeyR')) ||
        (e.ctrlKey && (e.key === 'F5' || e.code === 'F5')) ||
        (e.key === 'F5');

      if (isReloadKey && isTasbeehOpen()) {
        try {
          sessionStorage.setItem(SESSION_OPEN_KEY, '1');
        } catch (err) {}
      }

      // Check if user is typing in editable input/textarea
      if (e.target) {
        const tag = e.target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target.isContentEditable || e.target.contentEditable === 'true') {
          return;
        }
      }

      // Shortcut: Q (English) or ض (Arabic)
      if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        if (e.key === 'q' || e.key === 'Q' || e.key === 'ض' || e.code === 'KeyQ') {
          e.preventDefault();
          toggleOrRefreshTasbeehPane();
        }
      }
    });

    // Beforeunload: preserve open state across reloads if open
    window.addEventListener('beforeunload', () => {
      try {
        if (isTasbeehOpen()) {
          sessionStorage.setItem(SESSION_OPEN_KEY, '1');
        } else {
          sessionStorage.removeItem(SESSION_OPEN_KEY);
        }
      } catch (err) {}
    });

    // If page reloaded while open, auto reopen and fresh-load
    try {
      if (sessionStorage.getItem(SESSION_OPEN_KEY) === '1') {
        setTimeout(() => {
          openTasbeehPane(true);
        }, 150);
      }
    } catch (err) {}
  }

  function init() {
    initResize();
    initHandlers();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Register on SM namespace and window
  if (!window.SM) window.SM = {};
  if (!window.SM.ui) window.SM.ui = {};
  window.SM.ui.tasbeeh = {
    open: openTasbeehPane,
    close: closeTasbeehPane,
    refresh: refreshTasbeehPane,
    toggleOrRefresh: toggleOrRefreshTasbeehPane,
    isOpen: isTasbeehOpen,
  };

  window.openTasbeehPane = openTasbeehPane;
  window.closeTasbeehPane = closeTasbeehPane;
  window.refreshTasbeehPane = refreshTasbeehPane;
  window.toggleOrRefreshTasbeehPane = toggleOrRefreshTasbeehPane;
  window.isTasbeehOpen = isTasbeehOpen;
})();
