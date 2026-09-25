const fs = require('fs');

const appPath = './public/js/app.js';
let app = fs.readFileSync(appPath, 'utf8').replace(/\r\n/g, '\n');

// List of exact lines/substrings to delete
const targets = [
  "function renderSR() { return window.renderSR(...arguments); }",
  "function buildEP() { return window.buildEP(...arguments); }\n// Moved to search.js;\nfunction buildAcPop() { return window.buildAcPop(...arguments); }\n// Moved to toolbar.js;",
  "function addToInbox() { return window.addToInbox(...arguments); }",
  "function buildInbox() { return window.buildInbox(...arguments); }"
];

let allFound = true;
for (const t of targets) {
  if (!app.includes(t)) {
    console.error(`Target not found in app.js:\n${t}`);
    allFound = false;
  }
}

if (!allFound) {
  // Let's do partial or line by line matching if the combined block above had spacing differences
  console.log('Trying individual replacements...');
  const individualTargets = [
    "function renderSR() { return window.renderSR(...arguments); }",
    "function buildEP() { return window.buildEP(...arguments); }",
    "// Moved to search.js;",
    "function buildAcPop() { return window.buildAcPop(...arguments); }",
    "// Moved to toolbar.js;",
    "function addToInbox() { return window.addToInbox(...arguments); }",
    "function buildInbox() { return window.buildInbox(...arguments); }"
  ];

  for (const t of individualTargets) {
    if (app.includes(t)) {
      app = app.replace(t, '');
      console.log(`Successfully replaced: ${t}`);
    } else {
      console.warn(`Individual target not found: ${t}`);
    }
  }
} else {
  for (const t of targets) {
    app = app.replace(t, '');
    console.log(`Successfully replaced: ${t}`);
  }
}

fs.writeFileSync(appPath, app);
console.log('Successfully completed replacements in app.js!');
