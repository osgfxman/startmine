/**
 * @module Grid
 * @description Handles grid snapping, background dot rendering, and coordinate alignments
 * @namespace SM.miro.layout
 * @depends namespace.js, miro-state.js
 * @provides window.updateMiroGrid, window.snapToGrid, window.updateMiroScrollbars
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
  if (!canvas) return;

  // If Slices Mode is active, clear main canvas grid to avoid overlapping
  const hasSlices = page && (page._guidesMode || (page.vGuides && page.vGuides.length > 0) || (page.hGuides && page.hGuides.length > 0) || (page.customCells && page.customCells.length > 0));
  if (hasSlices) {
    canvas.style.backgroundImage = 'none';
    return;
  }

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

    const trackW = Math.max(1, canvas.clientWidth - 8 - thumbW);
    const startDragX = (e) => {
      e.stopPropagation();
      if (e.cancelable) e.preventDefault();
      const startCoord = (e.touches && e.touches[0]) ? e.touches[0].clientX : e.clientX;
      const startPan = page.panX || 0;

      const onMove = (me) => {
        me.stopPropagation();
        if (me.cancelable) me.preventDefault();
        const curCoord = (me.touches && me.touches[0]) ? me.touches[0].clientX : me.clientX;
        const dx = curCoord - startCoord;
        const scrollDelta = dx / trackW;
        const worldDelta = scrollDelta * (contentW - vw) * zoom;
        page.panX = startPan - worldDelta;
        sv();
        buildMiroCanvas();
      };

      const onEnd = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onEnd);
        document.removeEventListener('touchmove', onMove);
        document.removeEventListener('touchend', onEnd);
        document.removeEventListener('touchcancel', onEnd);
      };

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onEnd);
      document.addEventListener('touchmove', onMove, { passive: false });
      document.addEventListener('touchend', onEnd);
      document.addEventListener('touchcancel', onEnd);
    };

    thumb.addEventListener('mousedown', startDragX);
    thumb.addEventListener('touchstart', startDragX, { passive: false });

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

    const trackH = Math.max(1, canvas.clientHeight - 8 - thumbH);
    const startDragY = (e) => {
      e.stopPropagation();
      if (e.cancelable) e.preventDefault();
      const startCoord = (e.touches && e.touches[0]) ? e.touches[0].clientY : e.clientY;
      const startPan = page.panY || 0;

      const onMove = (me) => {
        me.stopPropagation();
        if (me.cancelable) me.preventDefault();
        const curCoord = (me.touches && me.touches[0]) ? me.touches[0].clientY : me.clientY;
        const dy = curCoord - startCoord;
        const scrollDelta = dy / trackH;
        const worldDelta = scrollDelta * (contentH - vh) * zoom;
        page.panY = startPan - worldDelta;
        sv();
        buildMiroCanvas();
      };

      const onEnd = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onEnd);
        document.removeEventListener('touchmove', onMove);
        document.removeEventListener('touchend', onEnd);
        document.removeEventListener('touchcancel', onEnd);
      };

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onEnd);
      document.addEventListener('touchmove', onMove, { passive: false });
      document.addEventListener('touchend', onEnd);
      document.addEventListener('touchcancel', onEnd);
    };

    thumb.addEventListener('mousedown', startDragY);
    thumb.addEventListener('touchstart', startDragY, { passive: false });

    sb.appendChild(thumb);
    canvas.appendChild(sb);
  }
};

SM.miro.layout = SM.miro.layout || {};
SM.miro.layout.updateMiroGrid = typeof updateMiroGrid !== 'undefined' ? updateMiroGrid : window.updateMiroGrid;
SM.miro.layout.snapToGrid = typeof snapToGrid !== 'undefined' ? snapToGrid : window.snapToGrid;
SM.miro.layout.updateMiroScrollbars = typeof updateMiroScrollbars !== 'undefined' ? updateMiroScrollbars : window.updateMiroScrollbars;

window.updateMiroGrid = SM.miro.layout.updateMiroGrid;
window.snapToGrid = SM.miro.layout.snapToGrid;
window.updateMiroScrollbars = SM.miro.layout.updateMiroScrollbars;
})();
