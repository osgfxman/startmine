// js/core/namespace.js
window.SM = window.SM || {};
window.SM.core = window.SM.core || {};
window.SM.data = window.SM.data || {};
window.SM.ui = window.SM.ui || {};
window.SM.miro = window.SM.miro || {};
window.SM.integrations = window.SM.integrations || {};

/**
 * Exposes a function to the global scope (window) 
 * to maintain backward compatibility for inline HTML event handlers.
 * @param {string} name - The name to expose it as on window.
 * @param {Function} fn - The function to expose.
 */
window.SM.core.expose = function(name, fn) {
  window[name] = fn;
};
