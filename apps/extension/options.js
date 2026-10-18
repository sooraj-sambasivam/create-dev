const D = { apiOrigin: "http://localhost:3001", webOrigin: "http://localhost:5175" };
const $ = (id) => document.getElementById(id);
chrome.storage.sync.get(D).then((s) => { $("web").value = s.webOrigin; $("api").value = s.apiOrigin; });
$("save").onclick = async () => {
  await chrome.storage.sync.set({ webOrigin: $("web").value.trim() || D.webOrigin, apiOrigin: $("api").value.trim() || D.apiOrigin });
  $("ok").textContent = "Saved";
};
