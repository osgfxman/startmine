/**
 * @module Events
 * @description Simple pub/sub event bus for decoupled module communication
 * @namespace SM.events
 * @depends namespace.js
 * @provides SM.events.on, SM.events.off, SM.events.once, SM.events.emit, SM.events.clear
 * @safety Never emit events inside event handlers to avoid infinite loops
 */
(function() {
  const listeners = {};

  SM.events = {
    on(event, fn) {
      if (typeof fn !== 'function') return;
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(fn);
    },
    off(event, fn) {
      if (!listeners[event]) return;
      listeners[event] = listeners[event].filter(f => f !== fn);
    },
    once(event, fn) {
      if (typeof fn !== 'function') return;
      const self = this;
      const wrapper = function(data) {
        self.off(event, wrapper);
        fn(data);
      };
      this.on(event, wrapper);
    },
    emit(event, data) {
      if (!listeners[event]) return;
      listeners[event].slice().forEach(fn => {
        try { fn(data); }
        catch(err) { console.error('[EVENT ERROR]', event, err); }
      });
    },
    clear(event) {
      if (event) {
        delete listeners[event];
      } else {
        Object.keys(listeners).forEach(k => delete listeners[k]);
      }
    }
  };

  window.SM = SM;
})();
