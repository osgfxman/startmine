const https = require('https');
const url = 'https://quran-gfx-default-rtdb.asia-southeast1.firebasedatabase.app/users/gBWMTgjiz5hlQgTHEZ3uGnZZmHf1/startmine_pages.json?shallow=true';

https.get(url, (res) => {
  let data = '';
  res.on('data', (chunk) => data += chunk);
  res.on('end', () => {
    try {
      const keys = Object.keys(JSON.parse(data));
      console.log('Page IDs:', keys);
      
      // Fetch details for each to check guides
      keys.forEach(key => {
        https.get(`https://quran-gfx-default-rtdb.asia-southeast1.firebasedatabase.app/users/gBWMTgjiz5hlQgTHEZ3uGnZZmHf1/startmine_pages/${key}.json`, (res2) => {
          let data2 = '';
          res2.on('data', (chunk) => data2 += chunk);
          res2.on('end', () => {
            try {
              const p = JSON.parse(data2);
              if (p && (p.vGuides || p.hGuides || p._guidesMode)) {
                console.log(`PAGE FOUND WITH GUIDES! ID: ${key}, vGuides:`, p.vGuides, `hGuides:`, p.hGuides, `_guidesMode:`, p._guidesMode);
              }
            } catch(e) {}
          });
        });
      });
    } catch(e) {
      console.error('Error parsing shallow response:', e.message);
    }
  });
}).on('error', (err) => {
  console.error('Error:', err.message);
});
