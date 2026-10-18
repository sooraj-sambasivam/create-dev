// Pointer mode: highlight the element under the cursor, click to capture, optionally speak an instruction.
(() => {
  if (window.__createPointer) { window.__createPointer.arm(); return; }
  const MAX_DEPTH = 6, MAX_NODES = 300, MAX_TEXT = 300;
  const SKIP = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "SVG", "IFRAME", "CANVAS", "TEMPLATE", "LINK", "META", "HEAD"]);
  const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif";

  let armed = false, locked = null, recognition = null;
  const outline = document.createElement("div");
  const chip = document.createElement("div");
  const host = document.createElement("div");
  host.style.cssText = "all:initial;position:fixed;inset:0;pointer-events:none;z-index:2147483647";
  const root = host.attachShadow({ mode: "closed" });
  outline.style.cssText = "position:fixed;border:2px solid #0d0d0d;border-radius:4px;box-shadow:0 0 0 1px #fff;display:none;pointer-events:none";
  chip.style.cssText = `position:fixed;display:none;background:#0d0d0d;color:#fff;font:600 12px ${FONT};padding:6px 10px;border-radius:8px;max-width:360px;pointer-events:none;box-shadow:0 4px 16px rgba(0,0,0,.3)`;
  root.append(outline, chip);

  function label(el) {
    const tag = el.tagName.toLowerCase();
    const kind = /^h[1-6]$/.test(tag) ? "Heading" : tag === "img" ? "Image" : tag === "a" ? "Link" : tag === "button" ? "Button" :
      ["section", "header", "footer", "nav", "main", "article", "aside"].includes(tag) ? "Section" : /^(ul|ol)$/.test(tag) ? "List" : /^(p|span)$/.test(tag) ? "Text" : "Block";
    const name = (el.getAttribute("aria-label") || el.alt || (el.innerText || "").trim().split("\n")[0] || "").slice(0, 32);
    return name ? `${kind} · ${name}` : kind;
  }
  function place(el, text) {
    const r = el.getBoundingClientRect();
    Object.assign(outline.style, { display: "block", left: r.left + "px", top: r.top + "px", width: r.width + "px", height: r.height + "px" });
    chip.textContent = text;
    chip.style.display = "block";
    chip.style.left = Math.max(8, Math.min(innerWidth - 240, r.left)) + "px";
    chip.style.top = (r.top > 40 ? r.top - 36 : r.bottom + 8) + "px";
  }
  const pick = (x, y) => {
    const el = document.elementFromPoint(x, y);
    return el && el !== host && !host.contains(el) ? el : null;
  };

  const abs = (u) => { try { return new URL(u, location.href).href; } catch { return undefined; } };
  function snap(el, depth, budget) {
    if (budget.n >= MAX_NODES || SKIP.has(el.tagName.toUpperCase())) return null;
    budget.n++;
    const cs = getComputedStyle(el);
    const node = {
      tag: el.tagName.toLowerCase(),
      style: {
        fontSize: cs.fontSize, fontWeight: cs.fontWeight, color: cs.color, backgroundColor: cs.backgroundColor,
        textAlign: cs.textAlign, display: cs.display, flexDirection: cs.flexDirection,
      },
    };
    const own = [...el.childNodes].filter((c) => c.nodeType === 3).map((c) => c.textContent).join(" ").replace(/\s+/g, " ").trim().slice(0, MAX_TEXT);
    if (own) node.text = own;
    if (node.tag === "img") { node.src = abs(el.currentSrc || el.src); node.alt = (el.alt || "").slice(0, 200); node.h = Math.round(el.getBoundingClientRect().height); }
    if (node.tag === "a" && el.getAttribute("href")) node.href = abs(el.getAttribute("href"));
    if (node.tag === "input" || node.tag === "textarea") { node.text = el.placeholder || ""; node.alt = el.getAttribute("aria-label") || ""; }
    if (depth < MAX_DEPTH) {
      const kids = [];
      for (const c of el.children) { const k = snap(c, depth + 1, budget); if (k) kids.push(k); }
      if (kids.length) node.children = kids;
    }
    return node;
  }

  function disarm() {
    armed = false; locked = null;
    outline.style.display = chip.style.display = "none";
    document.removeEventListener("mousemove", onMove, true);
    document.removeEventListener("click", onClick, true);
    document.removeEventListener("keydown", onKey, true);
    document.documentElement.style.cursor = "";
    try { recognition?.abort(); } catch {}
  }
  function onMove(e) { if (locked) return; const el = pick(e.clientX, e.clientY); if (el) place(el, label(el)); }
  function onKey(e) { if (e.key === "Escape") { disarm(); } }
  function onClick(e) {
    if (locked) return;
    const el = pick(e.clientX, e.clientY);
    if (!el) return;
    e.preventDefault(); e.stopPropagation();
    locked = el;
    askInstruction(el);
  }

  function askInstruction(el) {
    place(el, label(el));
    const box = document.createElement("div");
    box.style.cssText = `position:fixed;left:50%;bottom:24px;transform:translateX(-50%);width:min(440px,90vw);background:#0d0d0d;color:#fff;font:14px ${FONT};border-radius:8px;padding:12px;pointer-events:auto;box-shadow:0 8px 32px rgba(0,0,0,.4)`;
    box.innerHTML = `<div id="s" style="font-size:12px;opacity:.7;margin-bottom:6px">Say or type what to change, then Enter. Empty keeps it as is.</div>
      <input id="i" placeholder="make this mine but darker" style="width:100%;box-sizing:border-box;padding:8px;border-radius:8px;border:1px solid #444;background:#1a1a1a;color:#fff;font:inherit;outline:none">
      <div style="display:flex;gap:8px;margin-top:8px"><button id="go" style="flex:1;padding:8px;border:0;border-radius:8px;background:#fff;color:#0d0d0d;font:600 14px ${FONT};cursor:pointer">Send to Create</button><button id="x" style="padding:8px 12px;border:1px solid #444;border-radius:8px;background:transparent;color:#fff;font:inherit;cursor:pointer">Cancel</button></div>`;
    root.append(box);
    const input = box.querySelector("#i"), status = box.querySelector("#s");
    input.focus();
    const SR = window.webkitSpeechRecognition;
    if (SR) {
      try {
        recognition = new SR();
        recognition.interimResults = true; recognition.lang = navigator.language || "en-US";
        recognition.onresult = (ev) => {
          const t = [...ev.results].map((r) => r[0].transcript).join(" ");
          input.value = t;
          place(el, `“${t.slice(0, 60)}” · ${label(el)}`);
        };
        recognition.onerror = () => {};
        recognition.start();
        status.textContent = "Listening… or type, then Enter.";
      } catch {}
    }
    const finish = (send) => {
      try { recognition?.stop(); } catch {}
      if (!send) { box.remove(); disarm(); return; }
      status.textContent = "Sending to Create…";
      const budget = { n: 0 };
      const snapshot = { title: document.title.slice(0, 200), url: location.href, root: snap(el, 0, budget) };
      chrome.runtime.sendMessage({ type: "import", snapshot, instruction: input.value.trim(), sourceUrl: location.href }, (res) => {
        if (res?.ok) { box.remove(); disarm(); }
        else status.textContent = "Failed: " + (res?.error || chrome.runtime.lastError?.message || "is the Create server running?");
      });
    };
    box.querySelector("#go").onclick = () => finish(true);
    box.querySelector("#x").onclick = () => finish(false);
    input.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Enter") finish(true); if (e.key === "Escape") finish(false); }, true);
    input.addEventListener("keyup", (e) => e.stopPropagation(), true);
  }

  function arm() {
    if (armed) { disarm(); return; }
    armed = true;
    if (!host.isConnected) document.documentElement.append(host);
    document.addEventListener("mousemove", onMove, true);
    document.addEventListener("click", onClick, true);
    document.addEventListener("keydown", onKey, true);
    document.documentElement.style.cursor = "crosshair";
    chip.textContent = "Point at something, click to capture. Esc cancels.";
    chip.style.cssText += ";display:block;left:16px;top:16px";
  }
  window.__createPointer = { arm };
  chrome.runtime.onMessage.addListener((m) => { if (m?.type === "arm") arm(); });
  arm();
})();
