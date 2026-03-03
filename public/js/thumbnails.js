      /* ─── Fast Thumbnail Cache Engine ─── */
      const THUMB_GRADIENTS = [
        'linear-gradient(135deg,#667eea,#764ba2)',
        'linear-gradient(135deg,#f093fb,#f5576c)',
        'linear-gradient(135deg,#4facfe,#00f2fe)',
        'linear-gradient(135deg,#43e97b,#38f9d7)',
        'linear-gradient(135deg,#fa709a,#fee140)',
        'linear-gradient(135deg,#a18cd1,#fbc2eb)',
        'linear-gradient(135deg,#fccb90,#d57eeb)',
        'linear-gradient(135deg,#e0c3fc,#8ec5fc)',
        'linear-gradient(135deg,#f6d365,#fda085)',
        'linear-gradient(135deg,#96fbc4,#f9f586)',
      ];

      function buildMiroPlaceholder(card, showSpinner) {
        const ph = document.createElement('div');
        ph.className = 'mc-placeholder';
        const letter = (card.label || card.url || 'U')[0].toUpperCase();
        const hash = (card.url || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0);
        ph.style.background = THUMB_GRADIENTS[hash % THUMB_GRADIENTS.length];
        ph.textContent = letter;
        if (showSpinner && !card.thumbUrl) {
          const sp = document.createElement('div');
          sp.className = 'mc-ph-spinner';
          ph.appendChild(sp);
        }
        return ph;
      }

      // Concurrent fetch queue
      const _fetchQueue = [];
      let _fetchActive = 0;
      const MAX_CONCURRENT = 6;

      function queueCardFetch(card) {
        _fetchQueue.push(card);
        processFetchQueue();
      }

      function processFetchQueue() {
        while (_fetchActive < MAX_CONCURRENT && _fetchQueue.length) {
          const card = _fetchQueue.shift();
          _fetchActive++;
          fetchCardMeta(card).finally(() => {
            _fetchActive--;
            processFetchQueue();
          });
        }
      }

      async function fetchCardMeta(card) {
        // Step 1: Try jsonlink.io for OG metadata + image
        let ogImage = null;
        try {
          const ctrl = new AbortController();
          const tmr = setTimeout(() => ctrl.abort(), 5000);
          const resp = await fetch(
            `https://jsonlink.io/api/extract?url=${encodeURIComponent(card.url)}`,
            { signal: ctrl.signal }
          );
          clearTimeout(tmr);
          if (resp.ok) {
            const data = await resp.json();
            if (data.images && data.images.length) ogImage = data.images[0];
            if (data.title && (!card.label || card.label === domainOf(card.url))) {
              card.label = data.title;
            }
            if (data.description) card.desc = data.description;
          }
        } catch (e) { /* timeout or network error */ }

        // Update label/desc immediately if we got them
        if (card.label || card.desc) { sv(); buildOutline(); updateCardMeta(card); }

        // Step 2: If we got an OG image, verify it actually loads
        if (ogImage) {
          const ok = await testImageLoad(ogImage, 6000);
          if (ok) {
            card.thumbUrl = ogImage;
            sv(); updateCardThumb(card);
            return;
          }
        }

        // Step 3: WordPress mshots — pre-warm then poll with forced cache bypass
        const wpBase = `https://s0.wp.com/mshots/v1/${encodeURIComponent(card.url)}?w=600`;
        // Pre-warm: triggers screenshot generation on their server
        try { await fetch(wpBase, { mode: 'no-cors' }); } catch (e) { }
        await delay(5000);
        // Poll: try 4 times with 3-second intervals, bypass browser cache via fetch+blob
        for (let attempt = 0; attempt < 4; attempt++) {
          const blobUrl = await fetchImageNoCache(wpBase);
          if (blobUrl) {
            card.thumbUrl = wpBase;
            sv(); updateCardThumbDirect(card, blobUrl);
            return;
          }
          if (attempt < 3) await delay(3000);
        }

        // Step 4: image.thum.io — same approach
        const thumBase = 'https://image.thum.io/get/width/600/' + card.url;
        try { await fetch(thumBase, { mode: 'no-cors' }); } catch (e) { }
        await delay(5000);
        for (let attempt = 0; attempt < 3; attempt++) {
          const blobUrl = await fetchImageNoCache(thumBase);
          if (blobUrl) {
            card.thumbUrl = thumBase;
            sv(); updateCardThumbDirect(card, blobUrl);
            return;
          }
          if (attempt < 2) await delay(3000);
        }

        // All failed — remove spinner
        const spinner = document.querySelector(
          `.miro-card[data-cid="${card.id}"] .mc-ph-spinner`
        );
        if (spinner) spinner.remove();
      }

      function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

      // Fetch image bypassing browser cache, return blob URL or null
      async function fetchImageNoCache(url) {
        try {
          const resp = await fetch(url, { cache: 'reload' });
          if (!resp.ok) return null;
          const ct = resp.headers.get('content-type') || '';
          if (!ct.startsWith('image/')) return null;
          const blob = await resp.blob();
          if (blob.size < 1000) return null; // too small, likely placeholder
          // Create a temporary image to check dimensions
          const blobUrl = URL.createObjectURL(blob);
          const ok = await new Promise(resolve => {
            const img = new Image();
            img.onload = () => {
              // Reject WordPress placeholder (typically 400x300 or very small)
              if (img.naturalWidth === 400 && img.naturalHeight === 300) resolve(false);
              else if (img.naturalWidth <= 10) resolve(false);
              else resolve(true);
            };
            img.onerror = () => resolve(false);
            img.src = blobUrl;
          });
          if (ok) return blobUrl;
          URL.revokeObjectURL(blobUrl);
          return null;
        } catch (e) {
          return null;
        }
      }

      // Show a blob URL directly in the card thumbnail
      function updateCardThumbDirect(card, blobUrl) {
        const el = document.querySelector(`.miro-card[data-cid="${card.id}"]`);
        if (!el) { URL.revokeObjectURL(blobUrl); return; }
        const thumb = el.querySelector('.mc-thumb');
        if (!thumb) { URL.revokeObjectURL(blobUrl); return; }
        const img = document.createElement('img');
        img.src = blobUrl;
        img.alt = card.label || '';
        img.onload = () => {
          thumb.innerHTML = '';
          thumb.appendChild(img);
        };
        img.onerror = () => URL.revokeObjectURL(blobUrl);
        updateCardMeta(card);
      }

      // Same as testRealScreenshot but accepts any valid image (for OG images)
      function testImageLoad(url, timeout) {
        return new Promise(resolve => {
          const img = new Image();
          const tmr = setTimeout(() => { img.src = ''; resolve(false); }, timeout);
          img.onload = () => { clearTimeout(tmr); resolve(img.naturalWidth > 2); };
          img.onerror = () => { clearTimeout(tmr); resolve(false); };
          img.src = url;
        });
      }

      function updateCardMeta(card) {
        const el = document.querySelector(`.miro-card[data-cid="${card.id}"]`);
        if (!el) return;
        const titleEl = el.querySelector('.mc-title');
        if (titleEl && card.label) titleEl.textContent = card.label;
      }

      function updateCardThumb(card) {
        const el = document.querySelector(`.miro-card[data-cid="${card.id}"]`);
        if (!el) return;
        const thumb = el.querySelector('.mc-thumb');
        if (!thumb || !card.thumbUrl) return;

        const img = document.createElement('img');
        img.src = card.thumbUrl;
        img.alt = card.label || '';
        img.loading = 'lazy';
        img.onload = () => {
          if (img.naturalWidth <= 2) return; // WordPress mshots placeholder
          thumb.innerHTML = '';
          thumb.appendChild(img);
        };
        img.onerror = () => {
          // Remove spinner, keep placeholder
          const sp = thumb.querySelector('.mc-ph-spinner');
          if (sp) sp.remove();
        };

        // Update title in metadata
        const titleEl = el.querySelector('.mc-title');
        if (titleEl && card.label) titleEl.textContent = card.label;
      }

      /* ─── 4-Corner Resize + Sticky Notes ─── */

      function attachCornerResize(el, card, minW, minH) {
        ['br', 'bl', 'tr', 'tl'].forEach(corner => {
          const handle = document.createElement('div');
          handle.className = 'mc-resize-' + corner;
          handle.addEventListener('mousedown', e => {
            e.stopPropagation();
            const page = cp();
            const zoom = (page.zoom || 100) / 100;
            const sx = e.clientX, sy = e.clientY;
            const oX = card.x || 0, oY = card.y || 0, oW = card.w || 280, oH = card.h || 240;
            function onMove(ev) {
              const dx = (ev.clientX - sx) / zoom;
              const dy = (ev.clientY - sy) / zoom;
              let nw = oW, nh = oH, nx = oX, ny = oY;
              if (corner === 'br') { nw = oW + dx; nh = oH + dy; }
              else if (corner === 'bl') { nw = oW - dx; nx = oX + dx; nh = oH + dy; }
              else if (corner === 'tr') { nw = oW + dx; nh = oH - dy; ny = oY + dy; }
              else if (corner === 'tl') { nw = oW - dx; nx = oX + dx; nh = oH - dy; ny = oY + dy; }
              // Enforce min size
              if (nw < minW) { if (corner === 'bl' || corner === 'tl') nx = oX + oW - minW; nw = minW; }
              if (nh < minH) { if (corner === 'tr' || corner === 'tl') ny = oY + oH - minH; nh = minH; }
              card.x = nx; card.y = ny; card.w = nw; card.h = nh;
              el.style.left = nx + 'px'; el.style.top = ny + 'px';
              el.style.width = nw + 'px'; el.style.height = nh + 'px';
              // Auto-size text for sticky notes
              const textEl = el.querySelector('.ms-text');
              if (textEl) autoSizeText(textEl, el);
              updateMiroSelFrame();
            }
            function onUp() {
              document.removeEventListener('mousemove', onMove);
              document.removeEventListener('mouseup', onUp);
              sv();
            }
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
          });
          el.appendChild(handle);
        });
      }

      function buildMiroSticky(card) {
        const el = document.createElement('div');
        el.className = 'miro-sticky sn-' + (card.color || 'yellow');
        el.dataset.cid = card.id;
        el.style.left = (card.x || 0) + 'px';
        el.style.top = (card.y || 0) + 'px';
        el.style.width = (card.w || 280) + 'px';
        el.style.height = (card.h || 160) + 'px';

        // Delete button
        const del = document.createElement('button');
        del.className = 'mc-del';
        del.textContent = '✕';
        del.onclick = e => { e.stopPropagation(); deleteMiroCard(card.id); };

        // On-click toolbar (color + S/M/L)
        const toolbar = document.createElement('div');
        toolbar.className = 'sn-toolbar';
        const snColors = ['yellow', 'pink', 'green', 'blue', 'purple', 'orange'];
        const snColorHex = { yellow: '#f9e96b', pink: '#f4a4c0', green: '#a6d89b', blue: '#84c6e8', purple: '#c9a6e8', orange: '#f5b971' };
        snColors.forEach(c => {
          const dot = document.createElement('div');
          dot.className = 'sn-tb-color' + (c === card.color ? ' sel' : '');
          dot.style.background = snColorHex[c];
          dot.dataset.color = c;
          dot.onclick = ev => {
            ev.stopPropagation();
            card.color = c;
            // Update class
            el.className = 'miro-sticky sn-' + c + (el.classList.contains('miro-selected') ? ' miro-selected' : '');
            toolbar.querySelectorAll('.sn-tb-color').forEach(d => d.classList.remove('sel'));
            dot.classList.add('sel');
            sv();
          };
          toolbar.appendChild(dot);
        });
        // Separator
        const sep = document.createElement('div'); sep.className = 'sn-tb-sep';
        toolbar.appendChild(sep);
        // S / M / L size buttons
        const sizes = { S: { w: 140, h: 80 }, M: { w: 280, h: 160 }, L: { w: 420, h: 240 } };
        Object.entries(sizes).forEach(([label, sz]) => {
          const btn = document.createElement('button');
          btn.className = 'sn-tb-size';
          btn.textContent = label;
          // Highlight current size
          if (Math.abs((card.w || 280) - sz.w) < 30 && Math.abs((card.h || 160) - sz.h) < 30) btn.classList.add('sel');
          btn.onclick = ev => {
            ev.stopPropagation();
            card.w = sz.w; card.h = sz.h;
            el.style.width = sz.w + 'px'; el.style.height = sz.h + 'px';
            toolbar.querySelectorAll('.sn-tb-size').forEach(b => b.classList.remove('sel'));
            btn.classList.add('sel');
            autoSizeText(text, el);
            updateMiroSelFrame();
            sv();
          };
          toolbar.appendChild(btn);
        });

        // Text area
        const text = document.createElement('div');
        text.className = 'ms-text';
        text.contentEditable = true;
        text.textContent = card.text || '';
        text.addEventListener('input', () => {
          card.text = text.textContent;
          autoSizeText(text, el);
          sv();
        });
        text.addEventListener('blur', () => { card.text = text.textContent; sv(); });
        // Prevent drag when editing
        text.addEventListener('mousedown', e => {
          if (document.activeElement === text) e.stopPropagation();
        });

        // Shape toggle handle
        const toggle = document.createElement('div');
        toggle.className = 'ms-shape-toggle';
        toggle.textContent = (card.w || 280) > (card.h || 160) ? '■' : '▬';
        toggle.title = 'Toggle shape';
        toggle.onclick = e => {
          e.stopPropagation();
          if ((card.w || 280) >= (card.h || 160)) {
            // Currently landscape → make square
            const side = Math.max(card.w || 280, card.h || 160);
            card.w = side; card.h = side;
          } else {
            // Currently square/portrait → make landscape
            card.w = Math.max(card.w || 280, 280);
            card.h = Math.round(card.w / 1.75);
          }
          sv(); buildMiroCanvas();
        };

        // Show/hide toolbar on click
        el.addEventListener('click', e => {
          if (e.target.closest('.mc-del') || e.target.closest('.ms-shape-toggle') || e.target.closest('.sn-toolbar')) return;
          // Close other toolbars
          document.querySelectorAll('.sn-toolbar.show').forEach(t => { if (t !== toolbar) t.classList.remove('show'); });
          toolbar.classList.toggle('show');
        });
        // Close toolbar when clicking elsewhere
        document.addEventListener('click', e => {
          if (!el.contains(e.target)) toolbar.classList.remove('show');
        });

        // Drag support (same as cards — multi-select group drag)
        el.addEventListener('mousedown', e => {
          if (e.target.closest('.mc-del') || e.target.closest('.mc-resize-br') || e.target.closest('.mc-resize-bl') || e.target.closest('.mc-resize-tr') || e.target.closest('.mc-resize-tl') || e.target.closest('.ms-shape-toggle') || e.target.closest('.sn-toolbar')) return;
          if (document.activeElement === text && e.target === text) return;
          e.stopPropagation();
          if (e.ctrlKey || e.metaKey) { toggleMiroSelect(card.id); return; }
          if (!_miroSelected.has(card.id)) { clearMiroSelection(); addMiroSelect(card.id); }
          const page = cp();
          const zoom = (page.zoom || 100) / 100;
          const startX = e.clientX, startY = e.clientY;
          const origPositions = new Map();
          _miroSelected.forEach(cid => {
            const c = (page.miroCards || []).find(x => x.id === cid);
            if (c) origPositions.set(cid, { x: c.x || 0, y: c.y || 0 });
          });
          let moved = false;
          function onMove(ev) {
            moved = true;
            const dx = (ev.clientX - startX) / zoom, dy = (ev.clientY - startY) / zoom;
            origPositions.forEach((orig, cid) => {
              const c = (page.miroCards || []).find(x => x.id === cid);
              if (!c) return;
              c.x = orig.x + dx; c.y = orig.y + dy;
              const cardEl = document.querySelector(`[data-cid="${cid}"]`);
              if (cardEl) { cardEl.style.left = c.x + 'px'; cardEl.style.top = c.y + 'px'; }
            });
            updateMiroSelFrame();
          }
          function onUp() { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); if (moved) sv(); }
          document.addEventListener('mousemove', onMove);
          document.addEventListener('mouseup', onUp);
        });

        // 4-corner resize
        attachCornerResize(el, card, 100, 80);

        el.appendChild(del);
        el.appendChild(toolbar);
        el.appendChild(toggle);
        el.appendChild(text);

        // Auto-size text after render
        requestAnimationFrame(() => autoSizeText(text, el));
        return el;
      }

      function autoSizeText(textEl, containerEl) {
        if (!textEl.textContent.trim()) { textEl.style.fontSize = '18px'; return; }
        const padX = 24, padY = 20;
        const maxW = containerEl.offsetWidth - padX;
        const maxH = containerEl.offsetHeight - padY;
        let lo = 8, hi = 120, best = 14;
        // Binary search for largest font that fits
        while (lo <= hi) {
          const mid = Math.floor((lo + hi) / 2);
          textEl.style.fontSize = mid + 'px';
          if (textEl.scrollWidth <= maxW + 2 && textEl.scrollHeight <= maxH + 2) {
            best = mid;
            lo = mid + 1;
          } else {
            hi = mid - 1;
          }
        }
        textEl.style.fontSize = best + 'px';
      }

      // Update selection queries to include sticky notes
      function addMiroSelectEl(cid) {
        const el = document.querySelector(`[data-cid="${cid}"]`);
        if (el) el.classList.add('miro-selected');
      }
      function removeMiroSelectEl(cid) {
        const el = document.querySelector(`[data-cid="${cid}"]`);
        if (el) el.classList.remove('miro-selected');
      }
