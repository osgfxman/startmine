/**
 * @module Health
 * @description Runtime self-check that runs on every startup to detect broken modules
 * @namespace SM.core
 * @depends namespace.js (+ all other modules must be loaded before check runs)
 * @provides SM.core.runHealthCheck
 * @safety This must run AFTER all scripts are loaded but BEFORE user interaction
 */
(function() {
  SM.core.runHealthCheck = function() {
    const checks = [
      // Core
      { name: 'SM.events', test: () => typeof SM.events.emit === 'function' },

      // Data layer
      { name: 'syncNow', test: () => typeof window.syncNow === 'function' },
      { name: 'sv', test: () => typeof window.sv === 'function' },
      { name: 'toggleOfflineMode', test: () => typeof window.toggleOfflineMode === 'function' },

      // UI layer
      { name: 'showToast', test: () => typeof window.showToast === 'function' },
      { name: 'closeM', test: () => typeof window.closeM === 'function' },
      { name: 'buildEP', test: () => typeof window.buildEP === 'function' },
      { name: 'renderSR', test: () => typeof window.renderSR === 'function' },
      { name: 'addToInbox', test: () => typeof window.addToInbox === 'function' },
      { name: 'buildInbox', test: () => typeof window.buildInbox === 'function' },

      // Miro layer
      { name: 'buildMiroCanvas', test: () => typeof window.buildMiroCanvas === 'function' },
      { name: 'buildMiroSticky', test: () => typeof window.buildMiroSticky === 'function' },
      { name: 'buildMiroImage', test: () => typeof window.buildMiroImage === 'function' },
      { name: 'buildMiroText', test: () => typeof window.buildMiroText === 'function' },
      { name: 'buildMiroCard', test: () => typeof window.buildMiroCard === 'function' },
      { name: 'updateMiroGrid', test: () => typeof window.updateMiroGrid === 'function' },
      { name: 'updateMiroScrollbars', test: () => typeof window.updateMiroScrollbars === 'function' },
      { name: 'deleteMiroCard', test: () => typeof window.deleteMiroCard === 'function' },
      { name: 'setActiveTool', test: () => typeof window.setActiveTool === 'function' },
      { name: 'performUndo', test: () => typeof window.performUndo === 'function' },

      // State
      { name: 'SM.miro.state', test: () => SM.miro && SM.miro.state && typeof SM.miro.state._miroSelected !== 'undefined' },

      // Data integrity
      { name: 'D exists', test: () => typeof window.D !== 'undefined' },
      { name: 'DEF exists', test: () => typeof window.DEF !== 'undefined' },
      { name: 'cp function', test: () => typeof window.cp === 'function' },
    ];

    const failed = [];
    checks.forEach(c => {
      try {
        if (!c.test()) failed.push(c.name);
      } catch(e) {
        failed.push(c.name + ' (error: ' + e.message + ')');
      }
    });

    if (failed.length > 0) {
      console.error('[HEALTH CHECK FAILED]', failed);
      if (typeof window.showToast === 'function') {
        window.showToast('⚠️ Health check failed: ' + failed.join(', '), 10000);
      }
    } else {
      console.log('[HEALTH CHECK] ✅ All ' + checks.length + ' checks passed');
    }

    return failed.length === 0;
  };
})();
