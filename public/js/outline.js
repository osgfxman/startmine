/* ─── Enhanced Outline Sidebar ─── */
function toggleOutline() {
  const side = document.getElementById('outline-side');
  const isOpen = side.classList.toggle('open');
  document.body.classList.toggle('outline-open', isOpen);
  document.getElementById('outline-btn').classList.toggle('active-toggle', isOpen);
  if (isOpen) buildOutline();
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
  handle.addEventListener('mousedown', (e) => {
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
    const w = window.innerWidth - e.clientX;
    if (w >= 120 && w <= window.innerWidth * 0.5) {
      side.style.width = w + 'px';
      document.documentElement.style.setProperty('--outline-w', w + 'px');
    }
  }
})();

/* ─── Card info helper ─── */
function getCardInfo(c) {
  if (c.type === 'sticky') return { emoji: '📝', label: c.text || 'Sticky Note' };
  if (c.type === 'image') return { emoji: '🖼️', label: c.label || 'Image' };
  if (c.type === 'text') return { emoji: '✏️', label: (c.text || 'Text').substring(0, 40) };
  if (c.type === 'shape') return { emoji: '⬡', label: c.shape ? c.shape.charAt(0).toUpperCase() + c.shape.slice(1) : 'Shape' };
  if (c.type === 'pen') return { emoji: '🖊️', label: 'Drawing' };
  if (c.type === 'grid') return { emoji: '📊', label: 'Table ' + (c.rows || 3) + '×' + (c.cols || 3) };
  if (c.type === 'mindmap') return { emoji: '🧠', label: c.root?.text || 'Mind Map' };
  if (c.type === 'trello') return { emoji: '📋', label: c.title || 'List' };
  if (c.type === 'bwidget') return { emoji: '🔖', label: c.title || 'Bookmarks', favicon: null };
  // Default: bookmark card
  return { emoji: '🔗', label: c.label || (c.url ? domainOf(c.url) : 'Card'), favicon: c.url };
}

/* ─── Zoom-to-Fit for a single card ─── */
function zoomToFitCard(cid) {
  const page = cp();
  const card = (page.miroCards || []).find(c => c.id === cid);
  if (!card) return;
  const canvas = document.getElementById('miro-canvas');
  if (!canvas) return;
  const cw = canvas.clientWidth, ch = canvas.clientHeight;
  const cardW = card.w || 280, cardH = card.h || 240;
  const padding = 80;
  const fitZoom = Math.min((cw - padding * 2) / cardW, (ch - padding * 2) / cardH, 4);
  const clampedZoom = Math.max(0.1, Math.min(fitZoom, 4));
  page.zoom = Math.round(clampedZoom * 100);
  const zoom = page.zoom / 100;
  page.panX = cw / 2 - ((card.x || 0) + cardW / 2) * zoom;
  page.panY = ch / 2 - ((card.y || 0) + cardH / 2) * zoom;
  document.getElementById('miro-board').style.transform =
    'translate(' + page.panX + 'px,' + page.panY + 'px) scale(' + zoom + ')';
  document.getElementById('mz-slider').value = page.zoom;
  document.getElementById('mz-pct').textContent = page.zoom + '%';
  sv();
  // Highlight
  const el = document.querySelector('[data-cid="' + cid + '"]');
  if (el) {
    el.classList.remove('miro-hl');
    void el.offsetWidth;
    el.classList.add('miro-hl');
    el.addEventListener('animationend', () => el.classList.remove('miro-hl'), { once: true });
  }
}

/* ─── Zoom-to-Fit for multiple cards (group) ─── */
function zoomToFitCards(cids) {
  const page = cp();
  const cards = (page.miroCards || []).filter(c => cids.includes(c.id));
  if (!cards.length) return;
  const canvas = document.getElementById('miro-canvas');
  if (!canvas) return;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  cards.forEach(c => {
    minX = Math.min(minX, c.x || 0);
    minY = Math.min(minY, c.y || 0);
    maxX = Math.max(maxX, (c.x || 0) + (c.w || 280));
    maxY = Math.max(maxY, (c.y || 0) + (c.h || 240));
  });
  const cw = canvas.clientWidth, ch = canvas.clientHeight;
  const padding = 60;
  const bw = maxX - minX, bh = maxY - minY;
  const fitZoom = Math.min((cw - padding * 2) / bw, (ch - padding * 2) / bh, 4);
  const clampedZoom = Math.max(0.1, Math.min(fitZoom, 4));
  page.zoom = Math.round(clampedZoom * 100);
  const zoom = page.zoom / 100;
  page.panX = cw / 2 - (minX + bw / 2) * zoom;
  page.panY = ch / 2 - (minY + bh / 2) * zoom;
  document.getElementById('miro-board').style.transform =
    'translate(' + page.panX + 'px,' + page.panY + 'px) scale(' + zoom + ')';
  document.getElementById('mz-slider').value = page.zoom;
  document.getElementById('mz-pct').textContent = page.zoom + '%';
  sv();
}

/* ─── Group Management ─── */
function getOutlineGroups() {
  const page = cp();
  if (!page.outlineGroups) page.outlineGroups = [];
  return page.outlineGroups;
}

function getOutlineOrder() {
  const page = cp();
  if (!page.outlineOrder) page.outlineOrder = [];
  return page.outlineOrder;
}

function findGroupOfCard(cardId, groups) {
  for (const g of groups) {
    if (g.children && g.children.includes(cardId)) return g;
    if (g.subgroups) {
      for (const sg of g.subgroups) {
        if (sg.children && sg.children.includes(cardId)) return sg;
      }
    }
  }
  return null;
}

function collectGroupCardIds(group) {
  let ids = [...(group.children || [])];
  if (group.subgroups) {
    group.subgroups.forEach(sg => { ids = ids.concat(sg.children || []); });
  }
  return ids;
}

function groupSelectedCards() {
  const page = cp();
  if (!page.miroCards) return;
  const sel = typeof _miroSelected !== 'undefined' ? [..._miroSelected] : [];
  if (sel.length < 2) return;
  const groups = getOutlineGroups();
  // Remove selected cards from any existing group
  sel.forEach(cid => {
    groups.forEach(g => {
      g.children = (g.children || []).filter(id => id !== cid);
      if (g.subgroups) g.subgroups.forEach(sg => { sg.children = (sg.children || []).filter(id => id !== cid); });
    });
  });
  // Clean empty subgroups and groups
  groups.forEach(g => { if (g.subgroups) g.subgroups = g.subgroups.filter(sg => (sg.children || []).length > 0); });
  page.outlineGroups = groups.filter(g => (g.children || []).length > 0 || (g.subgroups || []).length > 0);
  // Create new group
  const newGroup = {
    id: typeof uid === 'function' ? uid() : Date.now().toString(),
    name: 'Group',
    children: sel,
    subgroups: [],
    collapsed: false
  };
  page.outlineGroups.push(newGroup);
  sv(); buildOutline();
}

function ungroupSelectedCards() {
  const page = cp();
  if (!page.miroCards) return;
  const sel = typeof _miroSelected !== 'undefined' ? [..._miroSelected] : [];
  if (sel.length === 0) return;
  const groups = getOutlineGroups();
  sel.forEach(cid => {
    groups.forEach(g => {
      g.children = (g.children || []).filter(id => id !== cid);
      if (g.subgroups) g.subgroups.forEach(sg => { sg.children = (sg.children || []).filter(id => id !== cid); });
    });
  });
  groups.forEach(g => { if (g.subgroups) g.subgroups = g.subgroups.filter(sg => (sg.children || []).length > 0); });
  page.outlineGroups = groups.filter(g => (g.children || []).length > 0 || (g.subgroups || []).length > 0);
  sv(); buildOutline();
}

/* ─── Build Outline ─── */
let _olDragId = null;

function buildOutline() {
  const list = document.getElementById('outline-list');
  list.innerHTML = '';
  const page = cp();

  // Miro page
  if (page.pageType === 'miro') {
    const cards = page.miroCards || [];
    if (!cards.length) {
      list.innerHTML = '<div class="outline-empty">No cards on this canvas</div>';
      return;
    }
    const groups = getOutlineGroups();
    const groupedIds = new Set();
    groups.forEach(g => {
      (g.children || []).forEach(id => groupedIds.add(id));
      (g.subgroups || []).forEach(sg => (sg.children || []).forEach(id => groupedIds.add(id)));
    });

    // Build ordered list: groups first (in order), then ungrouped cards
    const order = getOutlineOrder();
    const rendered = new Set();

    function buildCardItem(c, level) {
      const info = getCardInfo(c);
      const item = document.createElement('div');
      item.className = 'outline-item' + (level > 0 ? ' level-' + level : '');
      item.dataset.cid = c.id;
      item.draggable = true;
      item.title = info.label;

      // Favicon for bookmark types
      if (info.favicon && typeof getFav === 'function') {
        const fav = document.createElement('img');
        fav.className = 'ol-fav';
        fav.src = getFav(info.favicon);
        fav.onerror = () => { fav.style.display = 'none'; };
        item.appendChild(fav);
      } else {
        const emoji = document.createElement('span');
        emoji.className = 'ol-emoji';
        emoji.textContent = info.emoji;
        item.appendChild(emoji);
      }

      const title = document.createElement('span');
      title.className = 'ol-title';
      title.textContent = info.label;
      item.appendChild(title);

      item.onclick = () => {
        if (typeof clearMiroSelection === 'function') clearMiroSelection();
        if (typeof addMiroSelect === 'function') addMiroSelect(c.id);
        zoomToFitCard(c.id);
        // Highlight active in outline
        list.querySelectorAll('.outline-item').forEach(i => i.classList.remove('active'));
        item.classList.add('active');
      };

      // Drag reorder
      item.addEventListener('dragstart', (e) => {
        _olDragId = c.id;
        item.classList.add('ol-dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', c.id);
      });
      item.addEventListener('dragend', () => { item.classList.remove('ol-dragging'); _olDragId = null; });
      item.addEventListener('dragover', (e) => { if (_olDragId) { e.preventDefault(); item.classList.add('ol-drag-over'); } });
      item.addEventListener('dragleave', () => { item.classList.remove('ol-drag-over'); });
      item.addEventListener('drop', (e) => {
        e.preventDefault(); item.classList.remove('ol-drag-over');
        if (!_olDragId || _olDragId === c.id) return;
        reorderOutlineItem(_olDragId, c.id);
        _olDragId = null;
      });

      return item;
    }

    function buildGroupEl(g, level) {
      const div = document.createElement('div');
      div.className = 'outline-group' + (level > 0 ? ' level-' + level : '');
      div.dataset.gid = g.id;

      const hdr = document.createElement('div');
      hdr.className = 'outline-group-hdr' + (g.collapsed ? ' collapsed' : '');
      const arrow = document.createElement('span');
      arrow.className = 'og-arrow';
      arrow.textContent = '▼';
      const nameEl = document.createElement('span');
      nameEl.className = 'og-name';
      nameEl.textContent = g.name || 'Group';
      nameEl.contentEditable = true;
      nameEl.spellcheck = false;
      nameEl.addEventListener('blur', () => { g.name = nameEl.textContent.trim() || 'Group'; sv(); });
      nameEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); nameEl.blur(); } });
      nameEl.addEventListener('click', (e) => e.stopPropagation());
      const count = document.createElement('span');
      count.className = 'og-count';
      const allIds = collectGroupCardIds(g);
      count.textContent = allIds.length;
      const ungrp = document.createElement('button');
      ungrp.className = 'og-ungroup';
      ungrp.textContent = '⊟';
      ungrp.title = 'Ungroup';
      ungrp.onclick = (e) => {
        e.stopPropagation();
        const groups = getOutlineGroups();
        const idx = groups.indexOf(g);
        if (idx >= 0) groups.splice(idx, 1);
        // Also check if it's a subgroup
        groups.forEach(pg => {
          if (pg.subgroups) {
            const si = pg.subgroups.indexOf(g);
            if (si >= 0) pg.subgroups.splice(si, 1);
          }
        });
        sv(); buildOutline();
      };

      hdr.appendChild(arrow);
      hdr.appendChild(nameEl);
      hdr.appendChild(count);
      hdr.appendChild(ungrp);

      hdr.onclick = () => {
        g.collapsed = !g.collapsed;
        hdr.classList.toggle('collapsed', g.collapsed);
        body.classList.toggle('collapsed', g.collapsed);
        sv();
      };

      // Click group header → select all children + zoom to fit
      hdr.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        if (typeof clearMiroSelection === 'function') clearMiroSelection();
        allIds.forEach(id => { if (typeof addMiroSelect === 'function') addMiroSelect(id); });
        zoomToFitCards(allIds);
      });

      div.appendChild(hdr);

      const body = document.createElement('div');
      body.className = 'outline-group-body' + (g.collapsed ? ' collapsed' : '');

      // Render subgroups
      if (g.subgroups) {
        g.subgroups.forEach(sg => {
          body.appendChild(buildGroupEl(sg, level + 1));
          (sg.children || []).forEach(id => rendered.add(id));
        });
      }

      // Render children
      (g.children || []).forEach(cid => {
        const c = cards.find(x => x.id === cid);
        if (c) {
          body.appendChild(buildCardItem(c, level + 1));
          rendered.add(cid);
        }
      });

      div.appendChild(body);
      return div;
    }

    // Render groups
    groups.forEach(g => {
      list.appendChild(buildGroupEl(g, 0));
      collectGroupCardIds(g).forEach(id => rendered.add(id));
    });

    // Render ungrouped cards (in outline order if specified)
    const ungrouped = cards.filter(c => !rendered.has(c.id));
    // Sort by outlineOrder if present
    if (order.length > 0) {
      ungrouped.sort((a, b) => {
        const ai = order.indexOf(a.id), bi = order.indexOf(b.id);
        if (ai === -1 && bi === -1) return 0;
        if (ai === -1) return 1;
        if (bi === -1) return -1;
        return ai - bi;
      });
    }
    ungrouped.forEach(c => {
      list.appendChild(buildCardItem(c, 0));
    });
    return;
  }

  // Widget pages (non-miro)
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

/* ─── Reorder outline items ─── */
function reorderOutlineItem(dragId, targetId) {
  const page = cp();
  if (!page.outlineOrder) page.outlineOrder = (page.miroCards || []).map(c => c.id);
  const order = page.outlineOrder;
  // Ensure all current cards are in order
  (page.miroCards || []).forEach(c => { if (!order.includes(c.id)) order.push(c.id); });
  const di = order.indexOf(dragId);
  if (di >= 0) order.splice(di, 1);
  const ti = order.indexOf(targetId);
  if (ti >= 0) order.splice(ti, 0, dragId);
  else order.push(dragId);
  sv(); buildOutline();
}

/* ─── Legacy scrollToWidget (non-miro pages) ─── */
function scrollToWidget(wid) {
  const el = document.querySelector('.widget[data-wid="' + wid + '"]');
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.classList.remove('outline-hl');
  void el.offsetWidth;
  el.classList.add('outline-hl');
  el.addEventListener('animationend', () => el.classList.remove('outline-hl'), { once: true });
}

/* ─── scrollToMiroCard (kept for backward compat) ─── */
function scrollToMiroCard(cid) {
  if (typeof clearMiroSelection === 'function') clearMiroSelection();
  if (typeof addMiroSelect === 'function') addMiroSelect(cid);
  zoomToFitCard(cid);
}
