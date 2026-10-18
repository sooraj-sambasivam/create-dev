// Toolbar click or Alt+Shift+P arms pointer mode; the content script is injected on demand (activeTab).
// content.js arms itself on every run (a second run toggles it off), so no follow-up message is sent.
const DEFAULTS = { apiOrigin: "http://localhost:3001", webOrigin: "http://localhost:5173" };

async function settings() {
  const s = await chrome.storage.sync.get(DEFAULTS);
  return { ...DEFAULTS, ...s };
}

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;
  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] });
  } catch (err) {
    console.warn("Create: cannot point on this page", err);
  }
});

// The POST runs here (not in the page) so page CSP and CORS do not apply.
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type !== "import") return false;
  (async () => {
    try {
      const { apiOrigin, webOrigin } = await settings();
      const res = await fetch(`${apiOrigin}/api/import-element`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ snapshot: msg.snapshot, instruction: msg.instruction, sourceUrl: msg.sourceUrl }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `Server said ${res.status}`);
      const url = `${webOrigin.replace(/\/+$/, "")}/?p=${encodeURIComponent(body.id)}`;
      await chrome.tabs.create({ url });
      sendResponse({ ok: true, url });
    } catch (err) {
      sendResponse({ ok: false, error: err instanceof Error ? err.message : "Failed" });
    }
  })();
  return true;
});
