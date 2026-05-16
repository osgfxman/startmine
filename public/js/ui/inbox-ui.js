// js/ui/inbox-ui.js
(function() {
  window._dragInboxId = null;
  window.addToInbox = function addToInbox() {
  const input = document.getElementById('inbox-input');
  const text = input.value.trim();
  if (!text) return;
  if (!D.inbox) D.inbox = [];
  // Detect if it's a URL
  const urlRegex = /^(https?:\/\/[^\s]+)$/i;
  if (urlRegex.test(text) || /^(www\.[^\s]+)$/i.test(text)) {
    let url = text;
    if (!url.startsWith('http')) url = 'https://' + url;
    let label = url;
    try { label = new URL(url).hostname.replace('www.', '').split('.')[0].replace(/^./, c => c.toUpperCase()); } catch (e) {}
    D.inbox.push({ id: uid(), type: 'url', url, label, ts: Date.now() });
  } else {
    D.inbox.push({ id: uid(), type: 'text', text, label: text.substring(0, 40), ts: Date.now() });
  }
  input.value = '';
  sv(); buildInbox();
};
  window.buildInbox = function buildInbox() {
  const list = document.getElementById('inbox-list');
  list.innerHTML = '';
  if (!D.inbox || !D.inbox.length) {
    list.innerHTML =
      '<div style="padding:1.5rem;text-align:center;color:var(--mu);font-size:.7rem">Empty — add text, URLs, or images</div>';
    return;
  }
  D.inbox.forEach((item) => {
    const row = document.createElement('div');
    row.className = 'inbox-it';
    row.draggable = true;
    row.addEventListener('dragstart', (e) => {
      _dragInboxId = item.id;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', item.id);
      e.dataTransfer.setData('application/x-inbox-type', item.type || 'url');
      row.style.opacity = '.4';
    });
    row.addEventListener('dragend', () => {
      _dragInboxId = null;
      row.style.opacity = '1';
    });
    const icon = document.createElement('span');
    icon.style.cssText = 'font-size:.8rem;flex-shrink:0';
    if (item.type === 'image') {
      icon.textContent = '🖼️';
      const thumb = document.createElement('img');
      thumb.src = item.data;
      thumb.style.cssText = 'width:30px;height:30px;object-fit:cover;border-radius:3px;flex-shrink:0';
      row.appendChild(thumb);
    } else if (item.type === 'url') {
      icon.textContent = '🔗';
      row.appendChild(icon);
    } else {
      icon.textContent = '📝';
      row.appendChild(icon);
    }
    const lbl = document.createElement('span');
    lbl.className = 'inbox-lbl';
    lbl.textContent = item.label || item.text || item.url || '';
    const rm = document.createElement('button');
    rm.className = 'inbox-rm';
    rm.textContent = '✕';
    rm.onclick = () => {
      D.inbox = D.inbox.filter((x) => x.id !== item.id);
      sv(); buildInbox();
    };
    row.appendChild(lbl);
    if (item.type === 'url') {
      const open = document.createElement('a');
      open.href = item.url;
      open.target = '_blank';
      open.style.cssText = 'color:var(--ac);font-size:.6rem;text-decoration:none;flex-shrink:0';
      open.textContent = '↗';
      row.appendChild(open);
    }
    row.appendChild(rm);
    list.appendChild(row);
  });
};
  document.getElementById('inbox-save-btn').onclick = () => {
  if (!D.inbox || !D.inbox.length) {
    showToast('📥 Inbox is empty — nothing to save', 'warn');
    return;
  }
  // Save to localStorage
  try {
    localStorage.setItem(INBOX_BACKUP_KEY, JSON.stringify(D.inbox));
    localStorage.setItem(INBOX_BACKUP_KEY + '_ts', Date.now().toString());
  } catch(e) {}

  // Save to Firebase dedicated inbox backup
  if (USER_ID) {
    db.ref(`users/${USER_ID}/startmine_inbox_backup`).set({
      inbox: D.inbox,
      ts: Date.now()
    }).catch(e => console.warn('Inbox backup to Firebase failed:', e));
  }

  const count = D.inbox.length;
  showToast(`💾 Inbox saved! (${count} item${count > 1 ? 's' : ''})`, 'ok');
}
  document.getElementById('inbox-restore-btn').onclick = async () => {
  // Try localStorage first
  let restored = null;
  let source = '';
  const localBackup = localStorage.getItem(INBOX_BACKUP_KEY);
  const localTs = parseInt(localStorage.getItem(INBOX_BACKUP_KEY + '_ts') || '0');

  if (localBackup) {
    try { restored = JSON.parse(localBackup); source = 'local'; } catch(e) {}
  }

  // Also try Firebase backup
  if (USER_ID) {
    try {
      const snap = await db.ref(`users/${USER_ID}/startmine_inbox_backup`).once('value');
      const fbBackup = snap.val();
      if (fbBackup && fbBackup.inbox && fbBackup.inbox.length) {
        // Use whichever is newer
        if (!restored || (fbBackup.ts && fbBackup.ts > localTs)) {
          restored = fbBackup.inbox;
          source = 'cloud';
        }
      }
    } catch(e) {}
  }

  if (!restored || !restored.length) {
    showToast('🔄 No inbox backup found', 'warn');
    return;
  }

  // Merge: don't replace, add missing items
  if (!D.inbox) D.inbox = [];
  const existingIds = new Set(D.inbox.map(x => x.id));
  let added = 0;
  restored.forEach(item => {
    if (!existingIds.has(item.id)) {
      D.inbox.push(item);
      added++;
    }
  });

  if (added === 0) {
    showToast(`🔄 All ${restored.length} items already in inbox (from ${source})`, 'ok');
  } else {
    sv();
    buildInbox();
    showToast(`🔄 Restored ${added} items from ${source} backup!`, 'ok');
  }
}
  document.getElementById('inbox-export-btn').onclick = () => {
  if (!D.inbox || !D.inbox.length) {
    showToast('📥 Inbox is empty — nothing to export', 'warn');
    return;
  }
  const data = {
    type: 'startmine_inbox',
    version: 1,
    exported: new Date().toISOString(),
    count: D.inbox.length,
    inbox: D.inbox
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `startmine-inbox-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  showToast(`📤 Exported ${D.inbox.length} inbox items`, 'ok');
}
  document.getElementById('inbox-export-page-btn').onclick = () => {
  if (!D.inbox || !D.inbox.length) {
    showToast('📥 Inbox is empty — nothing to export', 2000);
    return;
  }

  // 1. Generate page name: "4APR26-2:29PM" format
  const now = new Date();
  const months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  const day = now.getDate();
  const mon = months[now.getMonth()];
  const yr = String(now.getFullYear()).slice(-2);
  let hrs = now.getHours();
  const mins = String(now.getMinutes()).padStart(2, '0');
  const ampm = hrs >= 12 ? 'PM' : 'AM';
  hrs = hrs % 12 || 12;
  const pageName = `${day}${mon}${yr}-${hrs}:${mins}${ampm}`;

  // 2. Find or create "inbox env" environment
  let inboxEnv = D.environments.find(e => e.name === 'inbox env');
  if (!inboxEnv) {
    const envId = uid();
    inboxEnv = { id: envId, name: 'inbox env' };
    D.environments.push(inboxEnv);
  }

  // 3. Find or create "inbox gr" group under that environment
  let inboxGrp = D.groups.find(g => g.name === 'inbox gr' && g.envId === inboxEnv.id);
  if (!inboxGrp) {
    const grpId = uid();
    inboxGrp = { id: grpId, name: 'inbox gr', envId: inboxEnv.id };
    D.groups.push(inboxGrp);
  }

  // 4. Create miroCards from inbox items in a grid layout
  const GAP = 40;
  const COLS_PER_ROW = 4;
  const START_X = 80;
  const START_Y = 80;
  let curX = START_X;
  let curY = START_Y;
  let rowMaxH = 0;
  let colCount = 0;
  const miroCards = [];

  D.inbox.forEach(item => {
    const itemType = item.type || 'url';
    let card;

    if (itemType === 'text') {
      card = {
        id: uid(), type: 'sticky',
        text: item.text || item.label || '',
        bg: '#ffe599',
        x: curX, y: curY,
        w: 200, h: 200
      };
    } else if (itemType === 'image') {
      card = {
        id: uid(), type: 'image',
        imageUrl: item.data,
        label: item.label || 'Image',
        x: curX, y: curY,
        w: 300, h: 200
      };
    } else {
      // URL → bookmark card
      const url = item.url || '';
      card = {
        id: uid(), type: 'card',
        url: url,
        label: item.label || '',
        x: curX, y: curY,
        w: 280, h: 240
      };
    }

    miroCards.push(card);

    // Advance grid position
    const cardW = card.w || 280;
    const cardH = card.h || 240;
    curX += cardW + GAP;
    rowMaxH = Math.max(rowMaxH, cardH);
    colCount++;

    if (colCount % COLS_PER_ROW === 0) {
      curX = START_X;
      curY += rowMaxH + GAP;
      rowMaxH = 0;
    }
  });

  // 5. Create the new page
  const pageId = uid();
  D.pages.push({
    id: pageId,
    groupId: inboxGrp.id,
    name: pageName,
    pageType: 'miro',
    miroCards: miroCards,
    zoom: 100,
    panX: 0,
    panY: 0,
    bg: '',
    bgType: 'none',
    widgets: [],
  });

  // 6. Clear inbox
  const exportedCount = D.inbox.length;
  D.inbox = [];

  // 7. Navigate to the new page
  D.curEnv = inboxEnv.id;
  D.curGroup = inboxGrp.id;
  sv();
  switchActivePage(pageId);

  // 8. Close inbox sidebar and show toast
  document.getElementById('inbox-side').classList.remove('open');
  document.getElementById('inbox-btn').classList.remove('active-toggle');
  showToast(`📄 Exported ${exportedCount} items to "${pageName}"`, 3000);
}
})();