      /* â”€â”€â”€ 4-Corner Resize + Sticky Notes â”€â”€â”€ */

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
        del.textContent = 'âœ•';
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
        text.contentEditable = false;
        text.textContent = card.text || '';
        text.addEventListener('input', () => {
          card.text = text.textContent;
          autoSizeText(text, el);
          sv();
        });
        text.addEventListener('blur', () => {
          text.contentEditable = false;
          card.text = text.textContent;
          sv();
        });
        // Prevent drag when editing
        text.addEventListener('mousedown', e => {
          if (text.contentEditable === 'true') e.stopPropagation();
        });
        // Double click to edit
        el.addEventListener('dblclick', e => {
          e.stopPropagation();
          text.contentEditable = true;
          text.focus();
        });

        // Shape toggle handle
        const toggle = document.createElement('div');
        toggle.className = 'ms-shape-toggle';
        toggle.textContent = (card.w || 280) > (card.h || 160) ? 'â– ' : 'â–¬';
        toggle.title = 'Toggle shape';
        toggle.onclick = e => {
          e.stopPropagation();
          if ((card.w || 280) >= (card.h || 160)) {
            // Currently landscape â†’ make square
            const side = Math.max(card.w || 280, card.h || 160);
            card.w = side; card.h = side;
          } else {
            // Currently square/portrait â†’ make landscape
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

        // Drag support (same as cards â€” multi-select group drag)
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
        const padX = 24, padY = 24;
        const maxW = containerEl.offsetWidth - padX;
        const maxH = containerEl.offsetHeight - padY;

        // Use a temporary appended element to accurately measure unconstrained size
        const span = document.createElement('div');
        span.style.position = 'absolute';
        span.style.visibility = 'hidden';
        span.style.whiteSpace = 'pre-wrap';
        span.style.wordBreak = 'break-word';
        span.style.width = maxW + 'px';
        span.style.fontFamily = 'var(--font)';
        span.style.fontWeight = '500';
        span.style.lineHeight = '1.3';
        span.textContent = textEl.textContent;
        document.body.appendChild(span);

        let lo = 8, hi = 180, best = 14;
        while (lo <= hi) {
          const mid = Math.floor((lo + hi) / 2);
          span.style.fontSize = mid + 'px';
          if (span.scrollWidth <= maxW + 2 && span.scrollHeight <= maxH + 4) {
            best = mid;
            lo = mid + 1;
          } else {
            hi = mid - 1;
          }
        }
        span.remove();
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

