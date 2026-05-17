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
  function cp() {
    return D.pages.find((p) => p.id === D.cur) || D.pages[0];
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
  window.SM.core.rgba = rgba;
  window.SM.core.getFav = getFav;
  window.SM.core.letterOf = letterOf;
  window.SM.core.letterColor = letterColor;
  window.SM.core.domainOf = domainOf;
  window.SM.core.cp = cp;
  window.SM.core.fw = fw;
  window.SM.core.mkFav = mkFav;
  window.SM.core.showLetter = showLetter;

  // Expose as globals
  window.SM.core.expose('uid', uid);
  window.SM.core.expose('esc', esc);
  window.SM.core.expose('clamp', clamp);
  window.SM.core.expose('rgba', rgba);
  window.SM.core.expose('getFav', getFav);
  window.SM.core.expose('letterOf', letterOf);
  window.SM.core.expose('letterColor', letterColor);
  window.SM.core.expose('domainOf', domainOf);
  window.SM.core.expose('cp', cp);
  window.SM.core.expose('fw', fw);
  window.SM.core.expose('mkFav', mkFav);
  window.SM.core.expose('showLetter', showLetter);
})();
