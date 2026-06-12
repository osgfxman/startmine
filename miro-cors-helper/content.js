// content.js - Bridges Startmine page and Extension background script

window.addEventListener("message", (event) => {
  // Only accept messages from ourselves
  if (event.source !== window) return;

  if (event.data && event.data.type === "STARTMINE_FETCH_MIRO") {
    const url = event.data.url;
    console.log("[Miro Extension Content] Received request to fetch URL:", url);
    
    chrome.runtime.sendMessage({ action: "fetchMiroImage", url: url }, (response) => {
      if (chrome.runtime.lastError) {
        console.error("[Miro Extension Content] Runtime error:", chrome.runtime.lastError.message);
        window.postMessage({
          type: "STARTMINE_FETCH_MIRO_RESPONSE",
          url: url,
          error: chrome.runtime.lastError.message
        }, "*");
        return;
      }
      
      console.log("[Miro Extension Content] Sending response back to page for URL:", url);
      window.postMessage({
        type: "STARTMINE_FETCH_MIRO_RESPONSE",
        url: url,
        base64: response.base64,
        error: response.error
      }, "*");
    });
  }
});
