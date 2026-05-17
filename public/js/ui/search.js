/**
 * @module Search
 * @description Provides global search functionality across pages and items
 * @namespace SM.ui
 * @depends namespace.js
 * @provides window.buildEP, window.renderSR
 * @safety Debounce input to avoid freezing the UI with excessive DOM queries
 */
// js/ui/search.js
(function() {
  let srIdx = -1, srTimer = null;
  window.renderSR = function renderSR(q) {
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
};
  window.buildEP = function buildEP() {
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
};
  document.getElementById('seb').onclick = (ev) => {
  ev.stopPropagation();
  document.getElementById('ep').classList.toggle('open');
}

SM.ui.buildEP = typeof buildEP !== 'undefined' ? buildEP : window.buildEP;
SM.ui.renderSR = typeof renderSR !== 'undefined' ? renderSR : window.renderSR;

window.buildEP = SM.ui.buildEP;
window.renderSR = SM.ui.renderSR;
})();
