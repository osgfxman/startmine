      /* ─── Outline Sidebar ─── */
      function toggleOutline() {
        const side = document.getElementById('outline-side');
        const isOpen = side.classList.toggle('open');
        document.body.classList.toggle('outline-open', isOpen);
        document.getElementById('outline-btn').classList.toggle('active-toggle', isOpen);
      }
      document.getElementById('outline-btn').onclick = toggleOutline;
      document.getElementById('outline-close').onclick = () => {
        document.getElementById('outline-side').classList.remove('open');
        document.body.classList.remove('outline-open');
        document.getElementById('outline-btn').classList.remove('active-toggle');
      };

      // Outline resize
      (function () {
        const side = document.getElementById('outline-side');
        const handle = document.getElementById('outline-resize');
        let resizing = false;
        handle.addEventListener('mousedown', e => {
          e.preventDefault();
          resizing = true;
          side.style.transition = 'none';
          document.body.style.transition = 'none';
          document.getElementById('root').style.transition = 'none';
          document.addEventListener('mousemove', onMove);
          document.addEventListener('mouseup', () => {
            resizing = false;
            side.style.transition = '';
            document.body.style.transition = '';
            document.getElementById('root').style.transition = '';
            document.removeEventListener('mousemove', onMove);
          }, { once: true });
        });
        function onMove(e) {
          if (!resizing) return;
          const w = e.clientX;
          if (w >= 120 && w <= window.innerWidth * 0.5) {
            side.style.width = w + 'px';
            document.documentElement.style.setProperty('--outline-w', w + 'px');
          }
        }
      })();

      function buildOutline() {
        const list = document.getElementById('outline-list');
        list.innerHTML = '';
        const page = cp();
        if (page.pageType === 'miro') {
          const cards = page.miroCards || [];
          if (!cards.length) {
            list.innerHTML = '<div class="outline-empty">No cards on this canvas</div>';
            return;
          }
          cards.forEach(c => {
            const item = document.createElement('div');
            item.className = 'outline-item';
            item.title = c.label || c.url;
            const emoji = document.createElement('span');
            emoji.className = 'ol-emoji';
            emoji.textContent = '🔗';
            const title = document.createElement('span');
            title.className = 'ol-title';
            title.textContent = c.label || domainOf(c.url);
            item.appendChild(emoji);
            item.appendChild(title);
            item.onclick = () => scrollToMiroCard(c.id);
            list.appendChild(item);
          });
          return;
        }
        const widgets = page.widgets || [];
        if (!widgets.length) {
          list.innerHTML = '<div class="outline-empty">No widgets on this page</div>';
          return;
        }
        widgets.forEach(w => {
          const item = document.createElement('div');
          item.className = 'outline-item';
          item.title = w.title;
          const emoji = document.createElement('span');
          emoji.className = 'ol-emoji';
          emoji.textContent = w.emoji || '📌';
          const title = document.createElement('span');
          title.className = 'ol-title';
          title.textContent = w.title;
          item.appendChild(emoji);
          item.appendChild(title);
          item.onclick = () => scrollToWidget(w.id);
          list.appendChild(item);
        });
      }

      function scrollToWidget(wid) {
        const el = document.querySelector(`.widget[data-wid="${wid}"]`);
        if (!el) return;
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.remove('outline-hl');
        void el.offsetWidth;
        el.classList.add('outline-hl');
        el.addEventListener('animationend', () => el.classList.remove('outline-hl'), { once: true });
        document.querySelectorAll('.outline-item').forEach(i => i.classList.remove('active'));
        const page = cp();
        const idx = (page.widgets || []).findIndex(w => w.id === wid);
        const items = document.querySelectorAll('.outline-item');
        if (idx >= 0 && items[idx]) items[idx].classList.add('active');
      }

      function scrollToMiroCard(cid) {
        const page = cp();
        const card = (page.miroCards || []).find(c => c.id === cid);
        if (!card) return;
        const canvas = document.getElementById('miro-canvas');
        const zoom = (page.zoom || 100) / 100;
        // Pan so the card is centered
        page.panX = canvas.clientWidth / 2 - ((card.x || 0) + (card.w || 280) / 2) * zoom;
        page.panY = canvas.clientHeight / 2 - ((card.y || 0) + (card.h || 240) / 2) * zoom;
        document.getElementById('miro-board').style.transform =
          `translate(${page.panX}px,${page.panY}px) scale(${zoom})`;
        sv();
        // Highlight
        const el = document.querySelector(`.miro-card[data-cid="${cid}"]`);
        if (el) {
          el.classList.remove('miro-hl');
          void el.offsetWidth;
          el.classList.add('miro-hl');
          el.addEventListener('animationend', () => el.classList.remove('miro-hl'), { once: true });
        }
        // Update active state
        document.querySelectorAll('.outline-item').forEach(i => i.classList.remove('active'));
        const idx = (page.miroCards || []).findIndex(c => c.id === cid);
        const items = document.querySelectorAll('.outline-item');
        if (idx >= 0 && items[idx]) items[idx].classList.add('active');
      }