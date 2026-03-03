      /* â”€â”€â”€ Fast Thumbnail Cache Engine â”€â”€â”€ */
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

        // Step 3: WordPress mshots â€” pre-warm then poll with forced cache bypass
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

        // Step 4: image.thum.io â€” same approach
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

        // All failed â€” remove spinner
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

