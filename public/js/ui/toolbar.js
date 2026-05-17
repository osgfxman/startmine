// js/ui/toolbar.js
(function() {
  window.buildAcPop = function buildAcPop() {
  const pop = document.getElementById('ac-pop');
  pop.innerHTML = '';
  SWATCHES.forEach((hex) => {
    const s = document.createElement('div');
    s.className = 'ac-sw';
    s.style.background = hex;
    s.style.borderColor = hex === D.settings.accent ? '#fff' : 'transparent';
    s.onclick = () => {
      D.settings.accent = hex;
      document.documentElement.style.setProperty('--ac', hex);
      document.getElementById('ac-dot').style.background = hex;
      sv();
      buildAcPop();
    };
    pop.appendChild(s);
  });
};
  document.getElementById('io-btn').onclick = (ev) => {
  ev.stopPropagation();
  document.getElementById('io-pop').classList.toggle('open');
}
  document.getElementById('exp-json').onclick = () => {
  const b = new Blob([JSON.stringify(D, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(b);
  a.download = 'startmine.json';
  a.click();
  document.getElementById('io-pop').classList.remove('open');
}
  document.getElementById('exp-csv').onclick = () => {
  let csv = 'Title,URL,Widget,Page\/**
 * @module Toolbar
 * @description Manages toolbar interactions and action popups
 * @namespace SM.ui
 * @depends namespace.js
 * @provides window.buildAcPop, window.buildSettings, window.buildImpJson
 * @safety Do not duplicate listeners if rebuilt multiple times
 */
n';
  for (const pg of D.pages)
    for (const w of pg.widgets || []) {
      if (!w.items) continue;
      for (const bm of w.items)
        csv += `"${(bm.label || '').replace(/"/g, '""')}","${(bm.url || '').replace(/"/g, '""')}","${(w.title || '').replace(/"/g, '""')}","${(pg.name || '').replace(/"/g, '""')}"
`;
    }
  const b = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(b);
  a.download = 'startmine.csv';
  a.click();
  document.getElementById('io-pop').classList.remove('open');
}
  document.getElementById('gdrive-export').onclick = () => {
  document.getElementById('io-pop').classList.remove('open');
  exportToGoogleDrive();
}
  document.getElementById('gdrive-restore').onclick = () => {
  document.getElementById('io-pop').classList.remove('open');
  restoreFromGoogleDrive();
}
  document.getElementById('github-export').onclick = () => {
  document.getElementById('io-pop').classList.remove('open');
  exportToGitHub();
}
  document.getElementById('github-restore').onclick = () => {
  document.getElementById('io-pop').classList.remove('open');
  restoreFromGitHub();
}
  document.getElementById('reset-btn').onclick = () => {
  if (!confirm('Reset all data?')) return;
  D = JSON.parse(JSON.stringify(DEF));
  sv();
  renderAll();
  document.getElementById('io-pop').classList.remove('open');
}
  document.getElementById('add-env').onclick = () => {
  const id = uid();
  D.environments.push({ id, name: 'Env ' + (D.environments.length + 1) });
  const gid = uid();
  D.groups.push({ id: gid, name: 'Group 1', envId: id });
  const pid = uid();
  D.pages.push({
    id: pid,
    groupId: gid,
    name: 'Miro 1',
    pageType: 'miro',
    miroCards: [],
    zoom: 100,
    panX: 0,
    panY: 0,
    bg: '',
    bgType: 'none',
    widgets: [],
  });
  D.curEnv = id;
  D.curGroup = gid;
  sv();
  switchActivePage(pid);
}
  document.getElementById('add-grp').onclick = () => {
  const id = uid();
  const targetEnv = D.curEnv === '__all__' ? D.environments[0].id : D.curEnv;
  const envGroups = D.groups.filter((g) => g.envId === targetEnv);
  D.groups.push({ id, name: 'Group ' + (envGroups.length + 1), envId: targetEnv });
  const pid = uid();
  D.pages.push({
    id: pid,
    groupId: id,
    name: 'Miro 1',
    pageType: 'miro',
    miroCards: [],
    zoom: 100,
    panX: 0,
    panY: 0,
    bg: '',
    bgType: 'none',
    widgets: [],
  });
  D.curGroup = id;
  sv();
  switchActivePage(pid);
}
  document.getElementById('add-pg').onclick = () => {
  const id = uid();
  const targetGroup = D.curGroup === '__all__' ? D.groups[0].id : D.curGroup;
  const groupPages = D.pages.filter((p) => p.groupId === targetGroup);
  D.pages.push({
    id,
    groupId: targetGroup,
    name: 'Miro ' + (groupPages.length + 1),
    pageType: 'miro',
    miroCards: [],
    zoom: 100,
    panX: 0,
    panY: 0,
    bg: '',
    bgType: 'none',
    widgets: [],
  });
  sv();
  switchActivePage(id);
}
  document.getElementById('dup-btn').onclick = () => {
  _dupScope = 'page';
  document.getElementById('dup-page').classList.add('ba');
  document.getElementById('dup-page').classList.remove('bg-btn');
  document.getElementById('dup-all').classList.add('bg-btn');
  document.getElementById('dup-all').classList.remove('ba');
  buildDupReport();
  openM('m-dup');
}
  document.getElementById('dup-page').onclick = () => {
  window._dupScope = 'page';
  document.getElementById('dup-page').classList.add('ba');
  document.getElementById('dup-page').classList.remove('bg-btn');
  document.getElementById('dup-all').classList.add('bg-btn');
  document.getElementById('dup-all').classList.remove('ba');
  buildDupReport();
};
document.getElementById('dup-all').onclick = () => {
  window._dupScope = 'all';
  document.getElementById('dup-all').classList.add('ba');
  document.getElementById('dup-all').classList.remove('bg-btn');
  document.getElementById('dup-page').classList.add('bg-btn');
  document.getElementById('dup-page').classList.remove('ba');
  buildDupReport();
};

SM.ui.buildAcPop = typeof buildAcPop !== 'undefined' ? buildAcPop : window.buildAcPop;
window.buildAcPop = SM.ui.buildAcPop;
})();
