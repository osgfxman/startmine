const fs = require('fs');
const vm = require('vm');

const files = [
  './public/js/app.js',
  './public/js/miro-engine.js',
  './public/js/life-widget.js'
];

let allOk = true;
for (const f of files) {
  try {
    const code = fs.readFileSync(f, 'utf8');
    new vm.Script(code);
    console.log(`✅ Syntax OK: ${f}`);
  } catch (err) {
    console.error(`❌ Syntax Error in ${f}:`, err.message);
    allOk = false;
  }
}

if (!allOk) {
  process.exit(1);
} else {
  console.log('All files are syntactically valid!');
}
