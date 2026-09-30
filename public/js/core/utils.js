/**
 * @module Utils
 * @description Global utility functions for DOM, colors, and layout helpers
 * @namespace SM.core
 * @depends namespace.js
 * @provides SM.core.uid, SM.core.esc, SM.core.cp, SM.core.fw, etc.
 * @safety Pure functions mostly, do not mutate state directly
 */
// js/core/utils.js
(function() {
  function uid() {
    return 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  }
  function esc(s) {
    return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
  }
  function normalizeColor(c, fallback) {
    const def = fallback || { r: 255, g: 255, b: 255, a: 0.94 };
    if (!c) return { ...def };
    if (typeof c === 'string') {
      const s = c.trim();
      if (s.startsWith('#')) {
        let hex = s.slice(1);
        if (hex.length === 3) hex = hex.split('').map(x => x + x).join('');
        if (hex.length === 6) {
          const r = parseInt(hex.slice(0, 2), 16);
          const g = parseInt(hex.slice(2, 4), 16);
          const b = parseInt(hex.slice(4, 6), 16);
          if (!isNaN(r) && !isNaN(g) && !isNaN(b)) {
            return { r, g, b, a: def.a !== undefined ? def.a : 1 };
          }
        } else if (hex.length === 8) {
          const r = parseInt(hex.slice(0, 2), 16);
          const g = parseInt(hex.slice(2, 4), 16);
          const b = parseInt(hex.slice(4, 6), 16);
          const a = Math.round((parseInt(hex.slice(6, 8), 16) / 255) * 100) / 100;
          if (!isNaN(r) && !isNaN(g) && !isNaN(b)) {
            return { r, g, b, a: isNaN(a) ? 1 : a };
          }
        }
      }
      const rgbMatch = s.match(/rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)/i);
      if (rgbMatch) {
        return {
          r: clamp(parseInt(rgbMatch[1], 10), 0, 255),
          g: clamp(parseInt(rgbMatch[2], 10), 0, 255),
          b: clamp(parseInt(rgbMatch[3], 10), 0, 255),
          a: rgbMatch[4] !== undefined ? clamp(parseFloat(rgbMatch[4]), 0, 1) : (def.a !== undefined ? def.a : 1)
        };
      }
      return { ...def };
    }
    if (typeof c === 'object') {
      const r = typeof c.r === 'number' && !isNaN(c.r) ? clamp(Math.round(c.r), 0, 255) : def.r;
      const g = typeof c.g === 'number' && !isNaN(c.g) ? clamp(Math.round(c.g), 0, 255) : def.g;
      const b = typeof c.b === 'number' && !isNaN(c.b) ? clamp(Math.round(c.b), 0, 255) : def.b;
      const a = typeof c.a === 'number' && !isNaN(c.a) ? clamp(c.a, 0, 1) : (def.a !== undefined ? def.a : 1);
      return { r, g, b, a };
    }
    return { ...def };
  }
  function rgba(c) {
    if (!c) return 'rgba(255,255,255,0.94)';
    const n = normalizeColor(c);
    return `rgba(${n.r},${n.g},${n.b},${n.a})`;
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
  function cp() {
    return D.pages.find((p) => p.id === D.cur) || D.pages[0];
  }
  function getCellKeyForPageId(slicerPage, pageId) {
    if (!slicerPage || !slicerPage.cellPages) return null;
    for (const [key, pid] of Object.entries(slicerPage.cellPages)) {
      if (pid === pageId) return key;
    }
    return null;
  }
  function fw(id) {
    for (const p of D.pages) {
      let w = (p.widgets || []).find((x) => x.id === id);
      if (w) return w;
      w = (p.miroCards || []).find((x) => x.id === id);
      if (w) return w;
      // Search localStorage cache for evicted pages
      if (typeof getCachedPageData === 'function') {
        const cached = getCachedPageData(p.id);
        if (cached) {
          w = (cached.widgets || []).find((x) => x.id === id);
          if (w) return w;
          w = (cached.miroCards || []).find((x) => x.id === id);
          if (w) return w;
        }
      }
    }
    return null;
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
      img.draggable = false;
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

  // Export to SM.core
  window.SM.core.uid = uid;
  window.SM.core.esc = esc;
  window.SM.core.clamp = clamp;
  window.SM.core.normalizeColor = normalizeColor;
  window.SM.core.rgba = rgba;
  window.SM.core.getFav = getFav;
  window.SM.core.letterOf = letterOf;
  window.SM.core.letterColor = letterColor;
  window.SM.core.domainOf = domainOf;
  window.SM.core.cp = cp;
  window.SM.core.getCellKeyForPageId = getCellKeyForPageId;
  window.SM.core.fw = fw;
  window.SM.core.mkFav = mkFav;
  window.SM.core.showLetter = showLetter;

  // Expose as globals
  window.SM.core.expose('uid', uid);
  window.SM.core.expose('esc', esc);
  window.SM.core.expose('clamp', clamp);
  window.SM.core.expose('normalizeColor', normalizeColor);
  window.SM.core.expose('rgba', rgba);
  window.SM.core.expose('getFav', getFav);
  window.SM.core.expose('letterOf', letterOf);
  window.SM.core.expose('letterColor', letterColor);
  window.SM.core.expose('domainOf', domainOf);
  window.SM.core.expose('cp', cp);
  window.SM.core.expose('getCellKeyForPageId', getCellKeyForPageId);
  window.SM.core.expose('fw', fw);
  window.SM.core.expose('mkFav', mkFav);
  window.SM.core.expose('showLetter', showLetter);
})();
