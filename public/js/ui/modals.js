// js/ui/modals.js
(function() {
  function openM(id) {
    document.getElementById(id).classList.add('open');
  }

  function closeM(id) {
    document.getElementById(id).classList.remove('open');
    if (id === 'm-aw') {
      document.getElementById('nw-t').value = '';
      document.getElementById('nw-e').value = '';
      if (typeof window.selType !== 'undefined') window.selType = 'bookmarks';
      document.querySelectorAll('.tc').forEach((x) => x.classList.remove('sel'));
      const defTc = document.querySelector('.tc[data-t="bookmarks"]');
      if (defTc) defTc.classList.add('sel');
    }
    if (id === 'm-ren') {
      document.getElementById('rn-t').value = '';
      document.getElementById('rn-e').value = '';
      window._renId = null;
    }
    if (id === 'm-col') {
      window._colId = null;
    }
    if (id === 'm-bm') {
      document.getElementById('bm-u').value = '';
      document.getElementById('bm-l').value = '';
      document.getElementById('bm-e').value = '';
      window._bmWid = null;
    }
    if (id === 'm-dp') {
      window._dpWid = null;
    }
    if (id === 'm-mv') {
      window._mvWid = null;
    }
    if (id === 'm-miro-add') {
      document.getElementById('miro-add-url').value = '';
      document.getElementById('miro-add-label').value = '';
    }
    if (id === 'm-miro-sticky') {
      document.getElementById('sn-add-text').value = '';
    }
    if (id === 'm-miro-image') {
      const prev = document.getElementById('miro-img-preview');
      if (prev) prev.style.display = 'none';
      const prevEl = document.getElementById('miro-img-prev-el');
      if (prevEl) prevEl.src = '';
      document.getElementById('miro-img-label').value = '';
      const btn = document.getElementById('ok-miro-image');
      if (btn) btn.disabled = true;
      window._miroImgBase64 = null;
    }
  }

  window.SM.ui.openM = openM;
  window.SM.ui.closeM = closeM;

  window.SM.core.expose('openM', openM);
  window.SM.core.expose('closeM', closeM);
})();
