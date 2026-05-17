/**
 * @module Events
 * @description Simple pub/sub event bus for decoupled module communication
 * @namespace SM.events
 * @depends namespace.js
 * @provides SM.events.on, SM.events.off, SM.events.emit
 * @safety Never emit events inside event handlers to avoid infinite loops
 */
(function() {
  const listeners = {};

  SM.events = {
    on(event, fn) {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(fn);
    },
    off(event, fn) {
      if (!listeners[event]) return;
      listeners[event] = listeners[event].filter(f => f !== fn);
    },
    emit(event, data) {
      if (!listeners[event]) return;
      listeners[event].forEach(fn => {
        try { fn(data); }
        catch(err) { console.error('[EVENT ERROR]', event, err); }
      });
    }
  };

  window.SM = SM;
})();
