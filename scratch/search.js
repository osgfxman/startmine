const fs = require('fs');
const content = fs.readFileSync('public/js/miro-engine.js', 'utf8');
const term = process.argv[2] || '_miroSelected';

const lines = content.split('\n');
console.log(`Searching for "${term}":`);
lines.forEach((line, idx) => {
  if (line.toLowerCase().includes(term.toLowerCase())) {
    console.log(`${idx + 1}: ${line.trim()}`);
  }
});
