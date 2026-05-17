/**
 * @module Grid
 * @description Handles grid snapping, background dot rendering, and coordinate alignments
 * @namespace SM.miro.layout
 * @depends namespace.js, miro-state.js
 * @provides window.updateMiroGrid, window.snapToGrid
 * @safety Performance critical during pan/zoom. Keep calculations lightweight.
 */
// js/miro/layout/grid.js
(function() {
  window.updateMiroGrid = function updateMiroGrid() {
  const page = cp();
  const zoom = (page.zoom || 100) / 100;
  const panX = page.panX || 0;
  const panY = page.panY || 0;
  const canvas = document.getElementById('miro-canvas');

  // Base board-space grid unit
  const BASE = 10;
  const FACTOR = 5;

  // Find the fine grid level: scale BASE until fine * zoom is in [8, 200) px range
  let fine = BASE;
  while (fine * zoom < 8) fine *= FACTOR;
  while (fine * zoom > 200) fine /= FACTOR;

  const medium = fine * FACTOR;
  const coarse = medium * FACTOR;

  // Screen-space pixel sizes
  const fineScreen = fine * zoom;
  const medScreen = medium * zoom;
  const coarseScreen = coarse * zoom;

  // Opacity: fade in based on screen pixel spacing — tuned to match Miro.com
  const fineAlpha = clamp((fineScreen - 6) / 25, 0, 1) * 0.05;
  const medAlpha = clamp((medScreen - 6) / 40, 0, 1) * 0.10;
  const coarseAlpha = clamp((coarseScreen - 6) / 60, 0, 1) * 0.16;

  // Build CSS background layers (horizontal + vertical lines per level)
  const layers = [];
  const sizes = [];
  const positions = [];

  function addLevel(screenSize, alpha) {
    if (alpha < 0.002) return;
    const c = `rgba(0,0,0,${alpha.toFixed(4)})`;
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
    canvas.style.backgroundImage = layers.join(',');
    canvas.style.backgroundSize = sizes.join(',');
    canvas.style.backgroundPosition = positions.join(',');
  }
};
  window.updateMiroScrollbars = function updateMiroScrollbars() {
  const page = cp();
  if (page.pageType !== 'miro') return;
  const canvas = document.getElementById('miro-canvas');
  if (!canvas) return;

  // Remove existing
  canvas.querySelectorAll('.miro-sb').forEach(el => el.remove());

  if (!page.miroCards || page.miroCards.length === 0) return;

  // Find canvas content bounds
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  page.miroCards.forEach(c => {
    minX = Math.min(minX, c.x || 0);
    minY = Math.min(minY, c.y || 0);
    maxX = Math.max(maxX, (c.x || 0) + (c.w || 280));
    maxY = Math.max(maxY, (c.y || 0) + (c.h || 240));
  });

  if (minX === Infinity) return;

  // Add 500px padding around content bounds
  minX -= 500; minY -= 500;
  maxX += 500; maxY += 500;
  const contentW = maxX - minX;
  const contentH = maxY - minY;

  const zoom = (page.zoom || 100) / 100;
  const vw = canvas.clientWidth / zoom;
  const vh = canvas.clientHeight / zoom;

  const panX = (page.panX || 0) / zoom;
  const panY = (page.panY || 0) / zoom;

  // Visible rect in world coordinates
  const visX = -panX;
  const visY = -panY;

  // If content is smaller than viewport, no scrollbars needed
  const needX = contentW > vw;
  const needY = contentH > vh;

  if (needX) {
    const sb = document.createElement('div');
    sb.className = 'miro-sb miro-sb-x';
    const thumb = document.createElement('div');
    thumb.className = 'miro-sb-thumb';

    const thumbW = Math.max(20, (vw / contentW) * canvas.clientWidth);
    const scrollPct = clamp((visX - minX) / (contentW - vw), 0, 1);
    const thumbLeft = scrollPct * (canvas.clientWidth - 8 - thumbW);

    thumb.style.width = thumbW + 'px';
    thumb.style.transform = `translateX(${thumbLeft}px)`;

    thumb.onmousedown = (e) => {
      e.stopPropagation(); e.preventDefault();
      const startX = e.clientX;
      const startPan = page.panX || 0;
      const trackW = canvas.clientWidth - 8 - thumbW;

      const onMove = (me) => {
        const dx = me.clientX - startX;
        const scrollDelta = dx / trackW;
        const worldDelta = scrollDelta * (contentW - vw) * zoom;
        page.panX = startPan - worldDelta;
        sv(); buildMiroCanvas();
      };
      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    };

    sb.appendChild(thumb);
    canvas.appendChild(sb);
  }

  if (needY) {
    const sb = document.createElement('div');
    sb.className = 'miro-sb miro-sb-y';
    const thumb = document.createElement('div');
    thumb.className = 'miro-sb-thumb';

    const thumbH = Math.max(20, (vh / contentH) * canvas.clientHeight);
    const scrollPct = clamp((visY - minY) / (contentH - vh), 0, 1);
    const thumbTop = scrollPct * (canvas.clientHeight - 8 - thumbH);

    thumb.style.height = thumbH + 'px';
    thumb.style.transform = `translateY(${thumbTop}px)`;

    thumb.onmousedown = (e) => {
      e.stopPropagation(); e.preventDefault();
      const startY = e.clientY;
      const startPan = page.panY || 0;
      const trackH = canvas.clientHeight - 8 - thumbH;

      const onMove = (me) => {
        const dy = me.clientY - startY;
        const scrollDelta = dy / trackH;
        const worldDelta = scrollDelta * (contentH - vh) * zoom;
        page.panY = startPan - worldDelta;
        sv(); buildMiroCanvas();
      };
      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    };

    sb.appendChild(thumb);
    canvas.appendChild(sb);
  }
};

SM.miro.layout = SM.miro.layout || {};
SM.miro.layout.updateMiroGrid = typeof updateMiroGrid !== 'undefined' ? updateMiroGrid : window.updateMiroGrid;
SM.miro.layout.snapToGrid = typeof snapToGrid !== 'undefined' ? snapToGrid : window.snapToGrid;

window.updateMiroGrid = SM.miro.layout.updateMiroGrid;
window.snapToGrid = SM.miro.layout.snapToGrid;
})();
