const D = { apiOrigin: "http://localhost:3002", webOrigin: "http://localhost:5176", voice: false };
const $ = (id) => document.getElementById(id);
chrome.storage.sync.get(D).then((s) => { $("web").value = s.webOrigin; $("api").value = s.apiOrigin; $("voice").checked = !!s.voice; });
$("save").onclick = async () => {
  await chrome.storage.sync.set({ webOrigin: $("web").value.trim() || D.webOrigin, apiOrigin: $("api").value.trim() || D.apiOrigin, voice: $("voice").checked });
  $("ok").textContent = "Saved";
};
