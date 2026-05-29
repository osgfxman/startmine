const fs = require('fs');
const path = require('path');

const snapshotPath = path.join(__dirname, 'snapshot_restore.json');
const updatesPath = path.join(__dirname, 'db_updates.json');

try {
  console.log('Reading snapshot file...');
  const snapshotData = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
  
  if (!snapshotData || !snapshotData.meta || !snapshotData.pagesMeta) {
    throw new Error('Invalid snapshot structure! Missing meta or pagesMeta.');
  }
  
  console.log('Preparing updates...');
  const updates = {
    startmine_meta: snapshotData.meta,
    startmine_pages_meta: snapshotData.pagesMeta,
    startmine_pages: snapshotData.pages || {}
  };
  
  console.log('Writing DB updates JSON...');
  fs.writeFileSync(updatesPath, JSON.stringify(updates, null, 2), 'utf8');
  console.log('Done! Prepared updates successfully at:', updatesPath);
} catch (err) {
  console.error('Error preparing restore:', err.message);
  process.exit(1);
}
