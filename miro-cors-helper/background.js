// background.js - Manifest V2 blocking webRequest CORS modification + Dynamic Fetching

// 1. Intercept headers to bypass CORS on standard img tags
chrome.webRequest.onHeadersReceived.addListener(
  (details) => {
    const origin = details.initiator || '*';
    const responseHeaders = details.responseHeaders || [];
    
    // Filter out existing CORS headers to avoid duplicates
    const headers = responseHeaders.filter(
      h => !['access-control-allow-origin', 'access-control-allow-credentials', 'access-control-allow-methods', 'access-control-allow-headers'].includes(h.name.toLowerCase())
    );
    
    headers.push({ name: 'Access-Control-Allow-Origin', value: origin });
    headers.push({ name: 'Access-Control-Allow-Credentials', value: 'true' });
    headers.push({ name: 'Access-Control-Allow-Methods', value: 'GET, POST, OPTIONS, PUT, DELETE' });
    headers.push({ name: 'Access-Control-Allow-Headers', value: '*' });
    
    return { responseHeaders: headers };
  },
  { urls: ['https://miro.com/api/v1/boards/*', 'https://*.miro.com/api/v1/boards/*'] },
  ['blocking', 'responseHeaders', 'extraHeaders']
);

// 2. Programmatic fetch to bypass SameSite cookies and CORS for saving/migrating images
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "fetchMiroImage") {
    console.log("[Miro Extension Background] Programmatic fetch for URL:", request.url);
    fetch(request.url)
      .then(response => {
        if (!response.ok) throw new Error("HTTP error " + response.status);
        return response.blob();
      })
      .then(blob => {
        const reader = new FileReader();
        reader.onloadend = () => {
          sendResponse({ base64: reader.result });
        };
        reader.readAsDataURL(blob);
      })
      .catch(err => {
        console.error("[Miro Extension Background] Error fetching Miro image:", err);
        sendResponse({ error: err.message });
      });
    return true; // Keep sendResponse open for async use
  }
});
