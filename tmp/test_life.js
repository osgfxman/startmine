const fs = require('fs');
const vm = require('vm');

// Mock browser environment
const createMockEl = () => ({
  appendChild: () => {},
  style: {},
  dataset: {},
  classList: {
    add: () => {},
    remove: () => {},
  },
  addEventListener: () => {},
  querySelector: () => createMockEl(),
  querySelectorAll: () => [],
  getContext: () => ({
    setTransform: () => {},
    clearRect: () => {},
    fillRect: () => {},
    strokeRect: () => {},
    rect: () => {},
    strokeRect: () => {},
    beginPath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    stroke: () => {},
    fillText: () => {},
    fill: () => {},
    save: () => {},
    restore: () => {},
  }),
});

const dom = {
  createElement: createMockEl,
  getElementById: () => null,
  addEventListener: () => {},
  tabIndex: 0,
};

let animationCallbacks = [];
const mockWindow = {
  devicePixelRatio: 1,
  addEventListener: () => {},
  document: dom,
  Intl: global.Intl,
  Date: global.Date,
  Math: global.Math,
  parseInt: global.parseInt,
  parseFloat: global.parseFloat,
  String: global.String,
  Map: global.Map,
  setTimeout: global.setTimeout,
  clearTimeout: global.clearTimeout,
  console: global.console,
  requestAnimationFrame: (cb) => {
    animationCallbacks.push(cb);
  },
};

mockWindow.window = mockWindow;

const code = fs.readFileSync('./public/js/life-widget.js', 'utf8');

try {
  vm.runInNewContext(code, mockWindow);
  console.log('Evaluation succeeded without errors!');

  // Test buildMiroLifeWidget call
  const _overlayLifeCard = {
    id: 'life_overlay_page',
    type: 'life',
    x: 0, y: 0,
    w: 900,
    h: 500,
    _overlayMode: true,
    life: { ov: [], cam: { z: 1.0, x: 0, y: 0 }, calEvents: [], _calTS: 0, sel: null }
  };

  if (typeof mockWindow.buildMiroLifeWidget === 'function') {
    const el = mockWindow.buildMiroLifeWidget(_overlayLifeCard);
    console.log('buildMiroLifeWidget returned successfully!');

    // Mock parentNode to simulate attached state
    el.parentNode = {};
    el.clientWidth = 900;
    el.clientHeight = 500;

    // Run animation callbacks
    console.log('Running animation frame callbacks...');
    while (animationCallbacks.length > 0) {
      const cb = animationCallbacks.shift();
      cb();
    }
    console.log('Animation frame callbacks executed successfully!');
  } else {
    console.error('buildMiroLifeWidget is not a function!');
  }
} catch (e) {
  console.error('Evaluation failed with error:', e);
}
