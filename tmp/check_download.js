const fs = require('fs');
let content = fs.readFileSync('tmp/pages.json', 'utf16le');
if (content.charCodeAt(0) === 0xFEFF) {
  content = content.slice(1);
}
const pages = JSON.parse(content);

console.log('Total pages:', Object.keys(pages).length);
Object.keys(pages).forEach(key => {
  const p = pages[key];
  const cardCount = p && p.miroCards ? p.miroCards.length : 0;
  const widgetCount = p && p.widgets ? p.widgets.length : 0;
  const hasGuides = p && (p.vGuides || p.hGuides || p._guidesMode) ? 'YES' : 'NO';
  console.log(`Page: ${key} | Cards: ${cardCount} | Widgets: ${widgetCount} | Guides: ${hasGuides}`);
});
