/**
 * @module Builders
 * @description DOM builders and rendering loops for Miro canvas cards
 * @namespace SM.miro.render
 * @depends namespace.js, miro-state.js, utils.js
 * @provides window.buildMiroCanvas, window.buildMiroSticky, window.buildMiroImage, window.buildMiroText, etc.
 * @safety Must use buildersMap with fallbacks. Recursion guard (_buildingCanvas) must wrap execution.
 */
// js/miro/render/builders.js
(function() {
  let _buildingCanvas = false;
  window.buildMiroCanvas = function buildMiroCanvas() {
  if (_buildingCanvas) { console.warn('[RECURSION BLOCKED]'); return; }
  _buildingCanvas = true;
  try {
    const page = cp();
    if (!page.miroCards) page.miroCards = [];
    const board = document.getElementById('miro-board');
    // Clear pinned layer (elements from previous page)
    const _pl = document.getElementById('miro-pinned-layer');
    if (_pl) _pl.innerHTML = '';
    // Remove only card elements, preserve selection overlays
    board.querySelectorAll('.miro-card, .miro-life, .miro-sticky, .miro-image, .miro-text, .miro-shape, .miro-pen, .miro-grid, .miro-mindmap, .miro-trello, .miro-widget, .miro-array, .miro-calendar, .miro-gantt, .miro-embed, .miro-overlay-widget').forEach((el) => el.remove());
    // Clean up grid toolbars that live in document.body
    document.querySelectorAll('.mg-toolbar[data-grid-id]').forEach(t => t.remove());
    // Clear selection state
    _miroSelected.clear();
    document.getElementById('miro-sel-frame').style.display = 'none';
    document.getElementById('miro-sel-box').style.display = 'none';
    const zoom = (page.zoom || 100) / 100;
    const px = page.panX || 0,
      py = page.panY || 0;
    board.style.transform = `translate(${px}px,${py}px) scale(${zoom})`;
    // Set inverse zoom so floating UI (toolbars, delete buttons) stays constant screen size
    board.style.setProperty('--inv-zoom', Math.min(3, Math.max(0.25, 1 / zoom)));
    document.getElementById('mz-slider').value = page.zoom || 100;
    document.getElementById('mz-pct').textContent = (page.zoom || 100) + '%';

    const buildersMap = {
      sticky: 'buildMiroSticky',
      image: 'buildMiroImage',
      text: 'buildMiroText',
      shape: 'buildMiroShape',
      pen: 'buildMiroPen',
      grid: 'buildMiroGridCard',
      mindmap: 'buildMiroMindMap',
      trello: 'buildMiroTrello',
      bwidget: 'buildMiroBookmarkWidget',
      array: 'buildMiroArray',
      calendar: 'buildMiroGantt',
      gantt: 'buildMiroGantt',
      embed: 'buildMiroEmbed',
      'overlay-page': 'buildMiroOverlayWidget',
      life: 'buildMiroLifeWidget',
    };
    try {
      page.miroCards.forEach((card) => {
        try {
          const fnName = buildersMap[card.type];
          const fn = fnName ? window[fnName] : null;
          const fallback = window.buildMiroCard;
          if (typeof fn === 'function') board.appendChild(fn(card));
          else if (typeof fallback === 'function') board.appendChild(fallback(card));
        } catch (err) {
          console.error('[RENDER ERROR]', card && card.type, card && card.id, err);
        }
      });
      if (typeof window.updateMiroGrid === 'function') window.updateMiroGrid();
      if (typeof window.updateMiroScrollbars === 'function') window.updateMiroScrollbars();
    } catch (fatal) {
      console.error('[BUILD MIRO CANVAS FATAL]', fatal);
      if (typeof showToast === 'function') showToast('❌ Canvas render crashed: ' + fatal.message, 8000);
    }
    // Auto-fix any base64 images on this page
    if (typeof _fixBase64ImagesOnPage === 'function') setTimeout(_fixBase64ImagesOnPage, 1000);
  } finally {
    _buildingCanvas = false;
  }
};
  window.buildMiroCard = function buildMiroCard(card) {
  const el = document.createElement('div');
  el.className = 'miro-card';
  el.dataset.cid = card.id;
  el.style.left = (card.x || 0) + 'px';
  el.style.top = (card.y || 0) + 'px';
  el.style.width = (card.w || 280) + 'px';
  el.style.height = (card.h || 240) + 'px';

  // Delete button (overlaid)
  const del = document.createElement('button');
  del.className = 'mc-del';
  del.textContent = '✕';
  del.onclick = (e) => {
    e.stopPropagation();
    deleteMiroCard(card.id);
  };

  // Open link button
  const openBtn = document.createElement('a');
  openBtn.className = 'mc-open';
  openBtn.href = card.url;
  openBtn.target = '_blank';
  openBtn.rel = 'noopener noreferrer';
  openBtn.textContent = '↗';
  openBtn.onclick = (e) => e.stopPropagation();

  // Thumbnail
  const thumb = document.createElement('div');
  thumb.className = 'mc-thumb';

  // Helper: replace thumb content without destroying overlays on el
  function setThumbImage(src) {
    // Remove any existing img or placeholder inside thumb
    const oldImg = thumb.querySelector('img');
    if (oldImg) oldImg.remove();
    const oldPh = thumb.querySelector('.mc-placeholder');
    if (oldPh) oldPh.remove();
    // Remove any iframe too (from video stop)
    const oldIframe = thumb.querySelector('iframe');
    if (oldIframe) oldIframe.remove();

    const img = document.createElement('img');
    img.src = src;
    img.alt = card.label || '';
    img.loading = 'lazy';
    img.onerror = () => {
      img.remove();
      if (!thumb.querySelector('.mc-placeholder')) {
        thumb.appendChild(buildMiroPlaceholder(card, true));
      }
    };
    thumb.insertBefore(img, thumb.firstChild);
  }

  function setThumbPlaceholder(showSpinner) {
    const oldImg = thumb.querySelector('img');
    if (oldImg) oldImg.remove();
    const oldPh = thumb.querySelector('.mc-placeholder');
    if (oldPh) oldPh.remove();
    thumb.insertBefore(buildMiroPlaceholder(card, showSpinner), thumb.firstChild);
  }

  if (card.thumbUrl) {
    // Show placeholder first, then load from IDB cache
    setThumbPlaceholder(false);
    if (typeof loadThumbCached === 'function') {
      loadThumbCached(card.thumbUrl).then(blobUrl => {
        if (blobUrl) {
          setThumbImage(blobUrl);
        } else {
          setThumbImage(card.thumbUrl);
        }
      });
    } else {
      setThumbImage(card.thumbUrl);
    }
  } else {
    setThumbPlaceholder(true);
    queueCardFetch(card);
  }

  // ─── Click-to-open / Click-to-play detection ───
  // Track mousedown position to distinguish click from drag
  let _mdX = 0, _mdY = 0, _mdTime = 0;
  thumb.addEventListener('mousedown', (e) => {
    _mdX = e.clientX; _mdY = e.clientY; _mdTime = Date.now();
  });
  thumb.addEventListener('click', (e) => {
    // Ignore clicks on buttons/links/controls
    if (e.target.closest('.mc-del, .mc-open, .mc-play-btn, .mc-video-close, .mc-lock')) return;
    // Check if this was a click (not a drag): short time + small distance
    const dt = Date.now() - _mdTime;
    const dist = Math.hypot(e.clientX - _mdX, e.clientY - _mdY);
    if (dt > 350 || dist > 8) return; // It was a drag, ignore

    e.stopPropagation();
    const videoInfo = detectVideoUrl(card.url);
    if (videoInfo) {
      _playVideoInCard(el, thumb, card, videoInfo);
    } else {
      window.open(card.url, '_blank', 'noopener');
    }
  });

  // Drag logic
  if (typeof miroSetupCardDrag === 'function') {
    miroSetupCardDrag(thumb, card, ['.mc-del', '.mc-open', '.mc-resize', '.mc-lock', '.mc-play-btn', '.mc-video-close']);
  }

  // Metadata footer
  const meta = document.createElement('div');
  meta.className = 'mc-meta';
  const favicon = document.createElement('img');
  favicon.src = getFav(card.url);
  favicon.onerror = () => {
    favicon.style.display = 'none';
  };
  const info = document.createElement('div');
  info.className = 'mc-meta-info';
  const title = document.createElement('div');
  title.className = 'mc-title';
  title.textContent = card.label || domainOf(card.url);
  const domain = document.createElement('div');
  domain.className = 'mc-domain';
  domain.textContent = domainOf(card.url);
  info.appendChild(title);
  info.appendChild(domain);
  meta.appendChild(favicon);
  meta.appendChild(info);

  // 4-corner resize handles
  attach8WayResize(el, card, 160, 100);

  // Lock UI
  if (typeof attachLockUI === 'function') {
    attachLockUI(el, card);
  }

  el.appendChild(del);
  el.appendChild(openBtn);
  el.appendChild(thumb);
  el.appendChild(meta);

  // ─── Video badge + play button (on card el, NOT inside thumb) ───
  const videoInfo = detectVideoUrl(card.url);
  if (videoInfo) {
    const badge = document.createElement('div');
    badge.className = 'mc-video-badge';
    badge.textContent = videoInfo.platform === 'YouTube' ? '▶ YouTube' : videoInfo.platform === 'TikTok' ? '♪ TikTok' : '▶ Facebook';
    el.appendChild(badge);

    const playBtn = document.createElement('div');
    playBtn.className = 'mc-play-btn';
    playBtn.title = 'Play video';
    playBtn.onclick = (e) => {
      e.stopPropagation();
      e.preventDefault();
      _playVideoInCard(el, thumb, card, videoInfo);
    };
    el.appendChild(playBtn);
  }

  return el;
};
  window.buildMiroOverlayWidget = function buildMiroOverlayWidget(card) {
  var pIdx = card.overlayPage || 0;
  // Default to near-fullscreen size if not set
  if (!card.w || card.w < 100) card.w = Math.max(900, window.innerWidth * 0.85);
  if (!card.h || card.h < 100) card.h = Math.max(500, window.innerHeight * 0.8);

  var el = document.createElement('div');
  el.className = 'miro-overlay-widget';
  el.dataset.cid = card.id;
  el.style.left = (card.x||0)+'px';
  el.style.top = (card.y||0)+'px';
  el.style.width = card.w+'px';
  el.style.height = card.h+'px';

  // â”€â”€ Header (identical to overlay) â”€â”€
  var hdr = document.createElement('div');
  hdr.className = 'ow-hdr';

  // Page switch buttons
  var pageEmojis = ['\u2600\uFE0F','\uD83D\uDCCA','\uD83D\uDCC8','\uD83C\uDF4E','\uD83C\uDFC3','\uD83E\uDDEC'];
  var pageNames = ['Today','Gantt','Stats','Fruit','Sprint','Life'];
  var pageBtns = [];
  pageEmojis.forEach(function(emoji, i) {
    var pb = document.createElement('button');
    pb.textContent = emoji;
    pb.title = pageNames[i];
    pb.className = 'ow-page-btn' + (i === pIdx ? ' active' : '');
    pb.onclick = function(e) {
      e.stopPropagation();
      card.overlayPage = i; pIdx = i; card.calOffset = 0;
      pageBtns.forEach(function(b,j){ b.className = 'ow-page-btn' + (j===i?' active':''); });
      sv(); _rw();
    };
    pageBtns.push(pb);
    hdr.appendChild(pb);
  });

  // Separator
  var sep = document.createElement('div');
  sep.style.cssText = 'width:1px;height:16px;background:rgba(128,128,128,.3);margin:0 4px;';
  hdr.appendChild(sep);

  // Nav buttons
  var _cb = function(txt,tip,fn){
    var b = document.createElement('button'); b.textContent = txt; b.title = tip;
    b.onclick = function(e){ e.stopPropagation(); fn(); }; return b;
  };
  var _days = function(){ return card.ganttView==='month'?30:card.ganttView==='2week'?14:7; };
  hdr.appendChild(_cb('\u25C0','Prev',function(){card.calOffset=(card.calOffset||0)-_days();sv();_rw();}));
  hdr.appendChild(_cb('\u2039','Prev day',function(){card.calOffset=(card.calOffset||0)-1;sv();_rw();}));
  hdr.appendChild(_cb('Today','Reset',function(){card.calOffset=0;sv();_rw();}));
  hdr.appendChild(_cb('\u203A','Next day',function(){card.calOffset=(card.calOffset||0)+1;sv();_rw();}));
  hdr.appendChild(_cb('\u25B6','Next',function(){card.calOffset=(card.calOffset||0)+_days();sv();_rw();}));

  // View toggle
  var vl = {week:'Wk','2week':'2W',month:'Mo'}, vc = ['week','2week','month'];
  var vb = _cb(vl[card.ganttView||'2week'],'View',function(){
    var i = vc.indexOf(card.ganttView||'2week');
    card.ganttView = vc[(i+1)%vc.length]; card.calOffset=0;
    vb.textContent = vl[card.ganttView]; sv(); _rw();
  });
  hdr.appendChild(vb);

  // Theme toggle
  var ths = ['light','dark','transparent'];
  var thI = {light:'\u2600\uFE0F',dark:'\uD83C\uDF19',transparent:'\uD83D\uDC41'};
  var thB = _cb(thI[card.calTheme||'light'],'Theme',function(){
    var i = ths.indexOf(card.calTheme||'light');
    card.calTheme = ths[(i+1)%ths.length]; thB.textContent = thI[card.calTheme];
    _applyTheme(); sv(); _rw();
  });
  hdr.appendChild(thB);
  hdr.appendChild(_cb('\uD83D\uDD04','Refresh',function(){ if (typeof window._clearCalendarCache === 'function') window._clearCalendarCache(); _rw(); }));
  hdr.appendChild(_cb('\uD83D\uDD11','Re-authenticate Google',function(){ if(typeof manualGoogleReAuth==='function'){manualGoogleReAuth().then(function(){_rw();}).catch(function(){});} }));

  // Spacer + delete
  var spacer = document.createElement('div');
  spacer.style.flex = '1';
  hdr.appendChild(spacer);

  var lockBtn = document.createElement('button');
  lockBtn.textContent = card.locked ? '\uD83D\uDD12' : '\uD83D\uDD13';
  lockBtn.title = 'Lock/Unlock';
  lockBtn.className = 'ow-lock-btn';
  lockBtn.onclick = function(e) {
    e.stopPropagation();
    card.locked = !card.locked;
    lockBtn.textContent = card.locked ? '\uD83D\uDD12' : '\uD83D\uDD13';
    el.classList.toggle('is-locked', card.locked);
    sv();
  };
  hdr.appendChild(lockBtn);

  var del = _cb('\u2715','Delete',function(){ deleteMiroCard(card.id); });
  hdr.appendChild(del);

  // â”€â”€ Body â”€â”€
  var body = document.createElement('div');
  body.className = 'ow-body';
  el.appendChild(hdr);
  el.appendChild(body);

  // â”€â”€ Theme â”€â”€
  function _applyTheme() {
    var t = card.calTheme || 'light';
    el.classList.remove('ow-light','ow-dark','ow-transparent');
    el.classList.add('ow-' + t);
  }
  _applyTheme();

  // â”€â”€ Render (uses overlay API for identical content) â”€â”€
  var _rendering = false;
  async function _rw() {
    if (_rendering) return;
    _rendering = true;
    try {
      // Try to use overlay's exact render functions
      if (window._overlayAPI && typeof window._overlayAPI.renderInto === 'function') {
        window._overlayAPI.renderInto(body, pIdx, card.calOffset||0, card.calTheme||'light', card.ganttView||'2week');
      } else {
        // Bootstrap: silently open overlay to initialize API, then retry
        if (typeof window._openGanttOverlay === 'function') {
          window._openGanttOverlay(0);
          await new Promise(function(r){ setTimeout(r, 300); });
          if (typeof window._closeGanttOverlay === 'function') window._closeGanttOverlay();
          // Now try again
          if (window._overlayAPI && typeof window._overlayAPI.renderInto === 'function') {
            window._overlayAPI.renderInto(body, pIdx, card.calOffset||0, card.calTheme||'light', card.ganttView||'2week');
          } else {
            body.innerHTML = '<div style="text-align:center;padding:40px;color:#888;">Initializing...</div>';
            setTimeout(function(){ _rendering = false; _rw(); }, 1500);
            return;
          }
        }
      }
    } catch(err) {
      body.innerHTML = '<div style="text-align:center;padding:40px;color:#e55;">' + err.message + '</div>';
    }
    _rendering = false;
  }

  // â”€â”€ Drag (from header) â”€â”€
  miroSetupCardDrag(el, card, ['.ow-body','button','.mc-resize-br','.mc-resize-bl','.mc-resize-tr','.mc-resize-tl','.mc-resize-t','.mc-resize-b','.mc-resize-l','.mc-resize-r']);

  // â”€â”€ 8-way Resize â”€â”€
  attach8WayResize(el, card, 400, 300);

  // â”€â”€ Auto-fit on resize â”€â”€
  var _rt = null, _lw = 0, _lh = 0;
  var ro = new ResizeObserver(function() {
    clearTimeout(_rt);
    _rt = setTimeout(function() {
      var w = el.offsetWidth, h = el.offsetHeight;
      if (w < 50 || h < 50) return;
      if (Math.abs(w-_lw) < 5 && Math.abs(h-_lh) < 5) return;
      _lw = w; _lh = h;
      card.w = w; card.h = h;
      _rw();
    }, 600);
  });
  ro.observe(el);

  // Initial render
  requestAnimationFrame(function() { _rw(); });
  return el;
};
  window._playVideoInCard = async function _playVideoInCard(el, thumb, card, videoInfo) {
  let embedUrl = videoInfo.embedUrl;

  // Handle TikTok short URLs
  if (videoInfo.shortUrl && !embedUrl) {
    if (typeof showToast === 'function') showToast('Resolving TikTok link…', 2000);
    const resolved = await resolveTikTokShortUrl(videoInfo.shortUrl);
    if (resolved) {
      embedUrl = resolved.embedUrl;
    } else {
      window.open(card.url, '_blank');
      return;
    }
  }

  if (!embedUrl) {
    window.open(card.url, '_blank');
    return;
  }

  el.classList.add('mc-video-active');

  // Hide badge + play btn
  const badge = el.querySelector('.mc-video-badge');
  const playBtn = el.querySelector('.mc-play-btn');
  if (badge) badge.style.display = 'none';
  if (playBtn) playBtn.style.display = 'none';

  // Clear thumb content and insert iframe
  thumb.innerHTML = '';
  const iframe = document.createElement('iframe');
  iframe.src = embedUrl;
  iframe.allow = 'autoplay; encrypted-media; fullscreen; picture-in-picture';
  iframe.allowFullscreen = true;
  iframe.style.cssText = 'width:100%;height:100%;border:none;';
  thumb.appendChild(iframe);

  // Add close/stop button
  let closeBtn = el.querySelector('.mc-video-close');
  if (!closeBtn) {
    closeBtn = document.createElement('button');
    closeBtn.className = 'mc-video-close';
    closeBtn.textContent = '■';
    closeBtn.title = 'Stop video';
    closeBtn.onclick = (ev) => {
      ev.stopPropagation();
      el.classList.remove('mc-video-active');

      // Remove iframe
      thumb.innerHTML = '';

      // Restore thumbnail
      if (card.thumbUrl) {
        const img = document.createElement('img');
        img.src = card.thumbUrl;
        img.alt = card.label || '';
        img.loading = 'lazy';
        img.onerror = () => { img.remove(); thumb.appendChild(buildMiroPlaceholder(card, false)); };
        thumb.appendChild(img);
        if (typeof loadThumbCached === 'function') {
          loadThumbCached(card.thumbUrl).then(blobUrl => {
            if (blobUrl) img.src = blobUrl;
          });
        }
      } else {
        thumb.appendChild(buildMiroPlaceholder(card, false));
      }

      // Restore badge + play btn
      if (badge) badge.style.display = '';
      if (playBtn) playBtn.style.display = '';
      closeBtn.remove();
    };
    el.appendChild(closeBtn);
  }
};
  window.detectVideoUrl = function detectVideoUrl(url) {
  if (!url) return null;
  // YouTube (watch, shorts, youtu.be, embed)
  let m = url.match(/(?:youtube\.com\/(?:watch\?.*v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{11})/);
  if (m) return { platform: 'YouTube', videoId: m[1], embedUrl: `https://www.youtube.com/embed/${m[1]}?autoplay=1&rel=0` };
  // TikTok (video IDs are numeric)
  m = url.match(/tiktok\.com\/@[^/]+\/video\/(\d+)/);
  if (m) return { platform: 'TikTok', videoId: m[1], embedUrl: `https://www.tiktok.com/embed/v2/${m[1]}` };
  // TikTok short URLs (vm.tiktok.com)
  if (/vm\.tiktok\.com|vt\.tiktok\.com/.test(url)) return { platform: 'TikTok', videoId: '', embedUrl: '' , shortUrl: url };
  // Facebook video
  m = url.match(/facebook\.com.*\/(?:videos?|watch|reel)[\/?]/);
  if (m) return { platform: 'Facebook', videoId: '', embedUrl: `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(url)}&show_text=false&autoplay=true&width=560` };
  // Facebook reel
  if (/facebook\.com\/reel\//.test(url)) return { platform: 'Facebook', videoId: '', embedUrl: `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(url)}&show_text=false&autoplay=true&width=560` };
  return null;
};
  window.resolveTikTokShortUrl = async function resolveTikTokShortUrl(shortUrl) {
  try {
    // Use a HEAD request to follow redirects
    const resp = await fetch(`https://jsonlink.io/api/extract?url=${encodeURIComponent(shortUrl)}`, { signal: AbortSignal.timeout(5000) });
    if (resp.ok) {
      const data = await resp.json();
      if (data.url) {
        const m = data.url.match(/tiktok\.com\/@[^/]+\/video\/(\d+)/);
        if (m) return { platform: 'TikTok', videoId: m[1], embedUrl: `https://www.tiktok.com/embed/v2/${m[1]}` };
      }
    }
  } catch (e) { /* timeout */ }
  return null;
};
  window.deleteMiroCard = function deleteMiroCard(cid) {
  const page = cp();
  if (!page.miroCards) return;
  page.miroCards = page.miroCards.filter((c) => c.id !== cid);
  sv();
  buildMiroCanvas();
  if (typeof buildOutline === 'function') buildOutline();
};

SM.miro.render = SM.miro.render || {};
SM.miro.render.buildMiroCanvas = typeof buildMiroCanvas !== 'undefined' ? buildMiroCanvas : window.buildMiroCanvas;
SM.miro.render.buildMiroSticky = typeof buildMiroSticky !== 'undefined' ? buildMiroSticky : window.buildMiroSticky;
SM.miro.render.buildMiroImage = typeof buildMiroImage !== 'undefined' ? buildMiroImage : window.buildMiroImage;
SM.miro.render.buildMiroText = typeof buildMiroText !== 'undefined' ? buildMiroText : window.buildMiroText;
SM.miro.render.buildMiroShape = typeof buildMiroShape !== 'undefined' ? buildMiroShape : window.buildMiroShape;
SM.miro.render.buildMiroPen = typeof buildMiroPen !== 'undefined' ? buildMiroPen : window.buildMiroPen;

window.buildMiroCanvas = SM.miro.render.buildMiroCanvas;
window.buildMiroSticky = SM.miro.render.buildMiroSticky;
window.buildMiroImage = SM.miro.render.buildMiroImage;
window.buildMiroText = SM.miro.render.buildMiroText;
window.buildMiroShape = SM.miro.render.buildMiroShape;
window.buildMiroPen = SM.miro.render.buildMiroPen;
})();
