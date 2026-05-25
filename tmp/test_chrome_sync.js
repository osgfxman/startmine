const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const WebSocket = require('ws');

const PORT = 5000;
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

// MIME types mapping
const mimeTypes = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

// Start local static server
const server = http.createServer((req, res) => {
  let urlPath = req.url.split('?')[0];
  if (urlPath === '/' || urlPath === '/inbox') {
    urlPath = urlPath === '/inbox' ? '/inbox.html' : '/index.html';
  }
  
  const filePath = path.join(PUBLIC_DIR, urlPath);
  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
      return;
    }
    
    const ext = path.extname(filePath).toLowerCase();
    const contentType = mimeTypes[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, () => {
  console.log(`[SERVER] Serving public/ on http://localhost:${PORT}`);
  startChrome();
});

let chromeProcess;

function startChrome() {
  const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
  const USER_DATA_DIR = path.join(__dirname, 'chrome-test-profile');

  // Ensure tmp/chrome-test-profile directory exists
  if (!fs.existsSync(USER_DATA_DIR)) {
    fs.mkdirSync(USER_DATA_DIR, { recursive: true });
  }

  console.log('[CHROME] Launching Chrome in headless mode...');
  chromeProcess = spawn(CHROME_PATH, [
    '--remote-debugging-port=9222',
    `--user-data-dir=${USER_DATA_DIR}`,
    '--headless=new',
    '--no-first-run',
    '--no-default-browser-check',
    'about:blank'
  ]);

  chromeProcess.on('error', (err) => {
    console.error('Failed to start Chrome:', err);
    cleanup(1);
  });

  // Wait 2 seconds for Chrome to start up and listen on remote debugging port
  setTimeout(connectCDP, 2000);
}

function connectCDP() {
  console.log('[CDP] Connecting to remote debugging port 9222...');
  
  http.get('http://127.0.0.1:9222/json/list', (res) => {
    let rawData = '';
    res.on('data', (chunk) => { rawData += chunk; });
    res.on('end', () => {
      try {
        const targets = JSON.parse(rawData);
        const pageTarget = targets.find(t => t.type === 'page');
        if (!pageTarget) {
          console.error('[CDP] No page targets found. Retrying in 1s...');
          setTimeout(connectCDP, 1000);
          return;
        }
        
        runTest(pageTarget.webSocketDebuggerUrl);
      } catch (e) {
        console.error('[CDP] Failed to parse target list:', e.message);
        cleanup(1);
      }
    });
  }).on('error', (err) => {
    console.error('[CDP] Failed to connect to debugging port. Retrying in 1s...', err.message);
    setTimeout(connectCDP, 1000);
  });
}

function runTest(wsUrl) {
  console.log(`[CDP] Connecting to WebSocket: ${wsUrl}`);
  const ws = new WebSocket(wsUrl);
  let id = 1;
  const pending = {};

  function send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const msgId = id++;
      const payload = JSON.stringify({ id: msgId, method, params });
      pending[msgId] = { resolve, reject };
      ws.send(payload);
    });
  }

  async function evaluate(expression) {
    const res = await send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true
    });
    if (res.exceptionDetails) {
      throw new Error('Eval Exception: ' + (res.exceptionDetails.exception.description || res.exceptionDetails.text));
    }
    return res.result.value;
  }

  ws.on('open', async () => {
    console.log('[CDP] Connected! Running tests...');
    try {
      await send('Runtime.enable');
      await send('Page.enable');
      await send('Network.enable');
      await send('Network.setBypassServiceWorker', { bypass: true });

      // Inject Mock Firebase / Auth before loading index.html
      const mockScript = `
        const _listeners = {};
        const _dbStore = {};
        function triggerListeners(path) {
          if (_listeners[path]) {
            for (const cb of _listeners[path]) {
              const val = _dbStore[path];
              cb({ val: () => (val !== undefined ? val : null) });
            }
          }
        }

        window.firebase = {
          initializeApp: () => {},
          auth: function() {
            return window.auth;
          },
          database: function() {
            return {
              ref: function(path = '') {
                return {
                  on: function(event, cb) {
                    if (!_listeners[path]) _listeners[path] = [];
                    _listeners[path].push(cb);
                    if (path === '.info/connected') {
                      setTimeout(() => cb({ val: () => true }), 0);
                    } else {
                      const val = _dbStore[path];
                      setTimeout(() => cb({ val: () => (val !== undefined ? val : null) }), 0);
                    }
                  },
                  off: function() {
                    delete _listeners[path];
                  },
                  once: function(event) {
                    const val = _dbStore[path];
                    return Promise.resolve({ val: () => (val !== undefined ? val : null) });
                  },
                  update: function(updates) {
                    for (const k in updates) {
                      _dbStore[k] = updates[k];
                      triggerListeners(k);
                    }
                    return Promise.resolve();
                  },
                  set: function(val) {
                    _dbStore[path] = val;
                    triggerListeners(path);
                    return Promise.resolve();
                  }
                };
              }
            };
          }
        };

        window.auth = {
          currentUser: { uid: 'mock-user-123', email: 'test@example.com' },
          onAuthStateChanged: function(cb) {
            setTimeout(() => cb({ uid: 'mock-user-123', email: 'test@example.com' }), 0);
            return () => {};
          },
          signOut: function() {
            localStorage.removeItem('sm_test_mock_auth');
            window.location.reload();
            return Promise.resolve();
          }
        };

        localStorage.setItem('sm_test_mock_auth', 'true');
        localStorage.setItem('sm_remember_me', 'true');
        console.log('[MOCK INJECTED] Firebase & Auth mocks loaded successfully!');
      `;

      await send('Page.addScriptToEvaluateOnNewDocument', { source: mockScript });

      // Navigate to localhost:5000
      console.log('[TEST] Navigating to http://localhost:5000/');
      await send('Page.navigate', { url: 'http://localhost:5000/' });

      // Wait 3.5 seconds for scripts to load and run
      await new Promise(r => setTimeout(r, 3500));

      // Check if logged in
      const emailText = await evaluate("document.getElementById('user-email')?.textContent");
      console.log(`[TEST] User Email displayed in DOM: "${emailText}"`);
      if (!emailText || !emailText.includes('test@example.com')) {
        throw new Error('Failed to bypass auth / login into mock account!');
      }

      // Add a new page and switch to it
      console.log('[TEST] Adding a new page...');
      const newPageId = await evaluate(`
        (function() {
          const newId = 'page_test_' + Date.now();
          const newPg = {
            id: newId,
            groupId: D.curGroup || 'g0',
            name: 'CDP Test Page',
            pageType: 'miro',
            miroCards: [],
            zoom: 100,
            panX: 0,
            panY: 0,
            bg: '',
            bgType: 'none',
            widgets: []
          };
          D.pages.push(newPg);
          switchActivePage(newId);
          return newId;
        })()
      `);
      console.log(`[TEST] Created new page: "${newPageId}"`);

      // Verify page switched successfully
      const currentActiveId = await evaluate("D.cur");
      console.log(`[TEST] Active page ID: "${currentActiveId}"`);
      if (currentActiveId !== newPageId) {
        throw new Error('Failed to switch to the new page!');
      }

      // Add a card/sticky note to the new page
      console.log('[TEST] Adding a card to the new page...');
      await evaluate(`
        (function() {
          const card = {
            id: 'card-cdp-test',
            type: 'note',
            content: 'CDP Automated Test Card',
            x: 150,
            y: 150,
            w: 220,
            h: 160,
            color: { r: 255, g: 255, b: 255, a: 0.94 }
          };
          cp().miroCards.push(card);
          sv(false, true); // Immediate save
        })()
      `);

      // Wait 1.5 seconds for saving to complete
      await new Promise(r => setTimeout(r, 1500));

      // Verify card was written in local cache
      const cachedData = await evaluate(`JSON.stringify(getCachedPageDataSync('${newPageId}'))`);
      console.log(`[TEST] Cached Page Data: ${cachedData}`);
      if (!cachedData || !cachedData.includes('CDP Automated Test Card')) {
        throw new Error('Card was NOT written to the local storage cache!');
      }

      // Reload page to test if page and data persist
      console.log('[TEST] Reloading page...');
      await send('Page.reload');
      
      // Wait 3.5 seconds for reload to complete
      await new Promise(r => setTimeout(r, 3500));

      // Verify that after reload, we are STILL on the new page (Remember Last page setting)
      const postReloadCur = await evaluate("D.cur");
      console.log(`[TEST] Post-reload active page ID: "${postReloadCur}"`);
      if (postReloadCur !== newPageId) {
        throw new Error(`Remember last page failed! Expected ${newPageId}, got redirected to ${postReloadCur}`);
      }

      // Verify that the card is still present
      const postReloadCardContent = await evaluate("cp().miroCards.find(c => c.id === 'card-cdp-test')?.content");
      console.log(`[TEST] Post-reload card content: "${postReloadCardContent}"`);
      if (postReloadCardContent !== 'CDP Automated Test Card') {
        throw new Error('Test card was LOST or deleted after page reload!');
      }

      // Test page switching and persistence
      console.log('[TEST] Switching to a different page (e.g. p0)...');
      await evaluate(`
        (function() {
          switchActivePage('p0');
        })()
      `);
      await new Promise(r => setTimeout(r, 1500));

      const midSwitchCur = await evaluate("D.cur");
      console.log(`[TEST] Switched page ID: "${midSwitchCur}"`);
      if (midSwitchCur !== 'p0') {
        throw new Error('Failed to switch to p0 page!');
      }

      console.log('[TEST] Switching back to our test page...');
      await evaluate(`
        (function() {
          switchActivePage('${newPageId}');
        })()
      `);
      await new Promise(r => setTimeout(r, 1500));

      const finalCur = await evaluate("D.cur");
      console.log(`[TEST] Switched back page ID: "${finalCur}"`);
      if (finalCur !== newPageId) {
        throw new Error(`Failed to switch back to ${newPageId}!`);
      }

      const finalCardContent = await evaluate("cp().miroCards.find(c => c.id === 'card-cdp-test')?.content");
      console.log(`[TEST] Final card content: "${finalCardContent}"`);
      if (finalCardContent !== 'CDP Automated Test Card') {
        throw new Error('Card was LOST after switching pages!');
      }

      console.log('🎉 SUCCESS: All automated sync integrity tests passed successfully!');
      cleanup(0);
    } catch (err) {
      console.error('❌ TEST FAILED:', err.message);
      cleanup(1);
    }
  });

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data);
      if (msg.method === 'Runtime.consoleAPICalled') {
        const args = msg.params.args.map(a => a.value !== undefined ? a.value : (a.description || '')).join(' ');
        console.log(`[BROWSER LOG] [${msg.params.type}] ${args}`);
      } else if (msg.method === 'Runtime.exceptionThrown') {
        console.error(`[BROWSER UNCAUGHT EXCEPTION]`, msg.params.exceptionDetails.exception.description || msg.params.exceptionDetails.text);
      }

      if (pending[msg.id]) {
        if (msg.error) {
          pending[msg.id].reject(new Error(msg.error.message));
        } else {
          pending[msg.id].resolve(msg.result);
        }
        delete pending[msg.id];
      }
    } catch (e) {}
  });

  ws.on('error', (err) => {
    console.error('[CDP] WebSocket error:', err.message);
    cleanup(1);
  });
}

function cleanup(exitCode) {
  console.log('[CLEANUP] Stopping Chrome and Server...');
  try {
    if (chromeProcess) chromeProcess.kill();
  } catch (e) {}
  try {
    server.close();
  } catch (e) {}
  process.exit(exitCode);
}