// js/ui/toasts.js
(function() {
  let _toastTimer;
  function showToast(msg, duration = 2000) {
    let toast = document.getElementById('sm-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'sm-toast';
      toast.style.cssText = 'position:fixed;top:18px;left:50%;transform:translateX(-50%) translateY(-60px);background:rgba(20,20,30,.95);color:#fff;padding:12px 28px;border-radius:14px;font-size:.92rem;z-index:999999;pointer-events:none;opacity:0;transition:all .35s cubic-bezier(.4,0,.2,1);backdrop-filter:blur(12px);border:1px solid rgba(108,143,255,.35);box-shadow:0 4px 24px rgba(0,0,0,.4);font-weight:500;';
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.style.opacity = '1';
    toast.style.transform = 'translateX(-50%) translateY(0)';
    
    clearTimeout(_toastTimer);
    _toastTimer = setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(-50%) translateY(-60px)';
    }, duration);
  }

  window.SM.ui.showToast = showToast;
  window.SM.core.expose('showToast', showToast);
})();
