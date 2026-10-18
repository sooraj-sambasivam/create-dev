// Lift: point at a table, list, cards or chart image, say "turn this into something I can track", get a live app.
// Hold Option (or arm from the toolbar / Alt+Shift+P) to point. Plain JS, no build step.
(() => {
  if (window.__createLift) return;

  /* ---------- text + type inference ---------- */
  const MAX_ROWS = 500, MAX_COLS = 20, MAX_CELL = 500;
  const clean = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
  const text = (el) => clean(el && (el.innerText || el.textContent)).slice(0, MAX_CELL);
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

  const T = String.raw`(?:\d{1,2}:\d{2}\s?(?:[ap]\.?m\.?)?|\d{1,2}\s?[ap]\.?m\.?)`;
  const DAY = String.raw`(?:(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*\.?,?\s+)?`;
  const SEP = String.raw`(?:\s*[–—-]\s*|\s+to\s+)`;
  const MON = String.raw`(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?`;
  const RX = {
    percent: /^[-+]?\d+(?:\.\d+)?\s?%$/,
    money: /^[-+]?[$€£¥]\s?\d[\d,]*(?:\.\d+)?(?:\s?\/\s?[a-z]+)?$|^\d[\d,]*(?:\.\d+)?\s?(?:USD|EUR|GBP)$/i,
    time: new RegExp(`^${DAY}${T}(?:${SEP}${T})?$`, "i"),
    date: new RegExp(`^${DAY}(?:\\d{4}-\\d{2}-\\d{2}|\\d{1,2}[/.-]\\d{1,2}[/.-]\\d{2,4}|${MON}\\s+\\d{1,2}(?:st|nd|rd|th)?(?:,?\\s+\\d{4})?|\\d{1,2}\\s+${MON}(?:,?\\s+\\d{4})?)$`, "i"),
    number: /^[-+]?\d[\d,]*(?:\.\d+)?$/,
  };
  /** number/money/percent/date/time when at least 80% of the non-empty values agree, else text. */
  function inferType(values) {
    const vals = values.map(clean).filter(Boolean);
    if (!vals.length) return "text";
    for (const t of ["percent", "money", "time", "date", "number"]) {
      if (vals.filter((v) => RX[t].test(v)).length / vals.length >= 0.8) return t;
    }
    return "text";
  }
  const slug = (s) => clean(s).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40);

  /** headers (or null) + string matrix -> typed columns and keyed rows. */
  function build(headers, matrix, kind, title) {
    const width = Math.min(MAX_COLS, Math.max(headers ? headers.length : 0, ...matrix.map((r) => r.length), 1));
    const used = new Set();
    const columns = Array.from({ length: width }, (_, i) => {
      const label = clean(headers?.[i]).slice(0, 120) || `Column ${i + 1}`;
      let key = slug(label) || `col_${i + 1}`;
      while (used.has(key)) key = `${key.slice(0, 55)}_${i + 1}`;
      used.add(key);
      return { key, label, type: inferType(matrix.map((r) => r[i])) };
    });
    const rows = matrix
      .filter((r) => r.some((c) => clean(c)))
      .slice(0, MAX_ROWS)
      .map((r) => Object.fromEntries(columns.map((c, i) => [c.key, clean(r[i]).slice(0, MAX_CELL)])));
    const timeCols = columns.filter((c) => c.type === "time").length;
    let k = kind;
    if (kind === "table" && (columns[0].type === "time" || (timeCols >= 2 && timeCols * 2 >= columns.length))) k = "schedule";
    return { kind: k, title: clean(title).slice(0, 200) || "Untitled", columns, rows, source: { url: location.href.slice(0, 2000), title: clean(document.title).slice(0, 300) } };
  }

  /* ---------- titles ---------- */
  function titleFor(el) {
    const cap = el.querySelector?.("caption");
    if (cap && text(cap)) return text(cap);
    const aria = el.getAttribute?.("aria-label");
    if (aria) return clean(aria);
    let node = el;
    for (let up = 0; node && up < 4 && node !== document.body; up++, node = node.parentElement) {
      for (let p = node.previousElementSibling, n = 0; p && n < 4; p = p.previousElementSibling, n++) {
        const h = /^H[1-6]$/.test(p.tagName) ? p : p.querySelector?.("h1,h2,h3,h4,h5,h6");
        if (h && text(h)) return text(h);
      }
    }
    return document.title || "Untitled";
  }

  /* ---------- extractors ---------- */
  function fromTable(t) {
    const trs = [...t.rows];
    if (!trs.length) return null;
    const cellsOf = (tr) => {
      const out = [];
      for (const c of tr.cells) { const span = Math.min(+c.colSpan || 1, 4); out.push(text(c)); for (let i = 1; i < span; i++) out.push(""); }
      return out;
    };
    let head = t.tHead?.rows.length ? t.tHead.rows[t.tHead.rows.length - 1] : null;
    if (!head && trs.length > 1) head = trs[0];
    const headers = head ? cellsOf(head) : null;
    const body = trs.filter((tr) => tr !== head && !(t.tHead && tr.parentElement === t.tHead));
    return build(headers, body.map(cellsOf), "table", titleFor(t));
  }

  function fromAria(g) {
    const rows = [...g.querySelectorAll('[role="row"]')];
    if (!rows.length) return null;
    const cellsOf = (r) => [...r.querySelectorAll('[role="columnheader"],[role="rowheader"],[role="gridcell"],[role="cell"]')].map(text);
    const first = rows[0];
    const hasHead = !!first.querySelector('[role="columnheader"]');
    return build(hasHead ? cellsOf(first) : null, (hasHead ? rows.slice(1) : rows).map(cellsOf), "table", titleFor(g));
  }

  const SPLIT = /\s+[–—-]\s+|:\s+|\t+|\s{2,}/;
  function fromList(l) {
    if (l.tagName === "DL") {
      const rows = []; let cur = null;
      for (const c of l.children) {
        if (c.tagName === "DT") { cur = [text(c), ""]; rows.push(cur); } else if (c.tagName === "DD" && cur) cur[1] = clean(`${cur[1]} ${text(c)}`);
      }
      return build(["Term", "Details"], rows, "list", titleFor(l));
    }
    const items = [...l.children].filter((c) => c.tagName === "LI" || c.getAttribute("role") === "listitem");
    const parts = items.map((li) => {
      let host = li;
      while (host.children.length === 1 && host.children[0].children.length) host = host.children[0];
      const kids = [...host.children].map(text).filter(Boolean);
      return kids.length >= 2 ? kids : [text(li)];
    });
    if (parts.filter((p) => p.length < 2).length / Math.max(parts.length, 1) >= 0.8) {
      const split = parts.map((p) => p[0].split(SPLIT).map(clean).filter(Boolean));
      if (split.filter((p) => p.length === 2).length / Math.max(split.length, 1) >= 0.8) return build(["Name", "Details"], split.map((p) => (p.length === 2 ? p : [p.join(" "), ""])), "list", titleFor(l));
      return build(["Item"], parts.map((p) => [p[0]]), "list", titleFor(l));
    }
    const width = Math.max(...parts.map((p) => p.length));
    const headers = ["Name", ...Array.from({ length: width - 1 }, (_, i) => (width === 2 ? "Details" : `Detail ${i + 1}`))];
    return build(headers, parts, "list", titleFor(l));
  }

  const MONEYISH = /^[-+]?[$€£¥]\s?\d|\d\s?\/\s?(?:mo|month|yr|year|wk|week|day)\b/i;
  function fromCards(container, cards) {
    const data = cards.map((card) => {
      const headEl = card.querySelector("h1,h2,h3,h4,h5,h6,[class*=title],[class*=name],strong,b");
      const lines = (card.innerText || card.textContent || "").split("\n").map(clean).filter(Boolean);
      const btn = new Set([...card.querySelectorAll("button,[role=button],input,a[class*=btn],a[class*=button]")].map(text));
      const feats = [...card.querySelectorAll("li")].map(text).filter(Boolean);
      const name = (headEl && text(headEl)) || lines[0] || "";
      const price = lines.find((l) => l !== name && MONEYISH.test(l)) || "";
      const used = new Set([name, price, ...feats, ...btn]);
      const rest = lines.filter((l) => !used.has(l));
      return { name, price, features: feats.join("; "), details: rest.join(" · ") };
    });
    const cols = [["name", "Name"], ["price", "Price"], ["features", "Features"], ["details", "Details"]].filter(([k]) => k === "name" || data.some((d) => d[k]));
    const e = build(cols.map(([, l]) => l), data.map((d) => cols.map(([k]) => d[k])), "table", titleFor(container));
    e.cardNoun = data.some((d) => d.price) ? "plans" : "cards";
    return e;
  }

  /* ---------- detection ---------- */
  const CARDLESS = new Set(["LI", "TR", "TD", "TH", "OPTION", "P", "SPAN", "A", "BR", "DT", "DD", "TBODY", "THEAD", "H1", "H2", "H3", "H4", "H5", "H6", "IMG", "SVG", "BUTTON", "INPUT", "LABEL"]);
  const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 40 && r.height > 24; };
  function cardChildren(el) {
    const kids = [...el.children].filter((c) => !CARDLESS.has(c.tagName.toUpperCase()) && visible(c));
    if (kids.length < 2 || kids.length > 24) return null;
    const tag = kids[0].tagName;
    const same = kids.filter((c) => c.tagName === tag);
    if (same.length < 2 || same.length < kids.length * 0.66) return null;
    const rich = same.filter((c) => c.querySelectorAll("*").length >= 2 && text(c).length >= 8);
    if (rich.length !== same.length) return null;
    const ws = same.map((c) => c.getBoundingClientRect().width).sort((a, b) => a - b);
    const hs = same.map((c) => c.getBoundingClientRect().height).sort((a, b) => a - b);
    // Cards line up in a row or column, so one dimension is stable.
    if (!(ws[0] / ws[ws.length - 1] >= 0.6 || hs[0] / hs[hs.length - 1] >= 0.6)) return null;
    return same;
  }
  const bigEnough = (el, w = 120, h = 80) => { const r = el.getBoundingClientRect(); return r.width >= w && r.height >= h; };

  const cache = new WeakMap();
  /** The liftable thing under `start`, or null: { el, kind: "dom"|"image", label, entity? }. */
  function detect(start) {
    let hit = null, listCand = null;
    for (let cur = start; cur && cur !== document.body && cur !== document.documentElement; cur = cur.parentElement) {
      const tag = cur.tagName.toUpperCase(), role = cur.getAttribute("role");
      if (tag === "SVG" || tag === "IMG" || tag === "CANVAS") {
        let top = cur;
        if (tag === "SVG") while (top.parentElement?.closest("svg")) top = top.parentElement.closest("svg");
        if (bigEnough(top)) { hit = { el: top, kind: "image", label: "Chart image" }; break; }
        continue;
      }
      if (tag === "TABLE" || role === "table" || role === "grid" || role === "treegrid") {
        hit = { el: cur, kind: "dom", build: () => (tag === "TABLE" ? fromTable(cur) : fromAria(cur)) };
        break;
      }
      if (!listCand && (tag === "UL" || tag === "OL" || tag === "DL" || role === "list")) { listCand = cur; continue; }
      const cards = cardChildren(cur);
      if (cards) { hit = { el: cur, kind: "dom", build: () => fromCards(cur, cards) }; break; }
    }
    if (!hit && listCand) hit = { el: listCand, kind: "dom", build: () => fromList(listCand) };
    if (!hit) return null;
    if (cache.has(hit.el)) return cache.get(hit.el);
    if (hit.kind === "dom") {
      let entity = null;
      try { entity = hit.build(); } catch { entity = null; }
      if (!entity || !entity.rows.length) { cache.set(hit.el, null); return null; }
      hit.entity = entity;
      hit.label = describe(entity);
    }
    cache.set(hit.el, hit);
    return hit;
  }
  function describe(e) {
    const n = e.rows.length, c = e.columns.length;
    if (e.cardNoun) return `Cards · ${plural(n, e.cardNoun === "plans" ? "plan" : "card", e.cardNoun)}`;
    if (e.kind === "list") return `List · ${plural(n, "item", "items")}`;
    return `${e.kind === "schedule" ? "Schedule" : "Table"} · ${plural(n, "row", "rows")} × ${plural(c, "col", "cols")}`;
  }

  /* ---------- UI: closed shadow root, tokens from DESIGN.md ---------- */
  const FONT = '"SF Pro Text", -apple-system, BlinkMacSystemFont, "Inter Variable", system-ui, sans-serif';
  const host = document.createElement("div");
  host.style.cssText = "all:initial;position:fixed;inset:0;pointer-events:none;z-index:2147483647";
  const root = host.attachShadow({ mode: "closed" });
  root.innerHTML = `<style>
    :host{--ink:#0d0d0d;--ink2:#5d5d5d;--ink3:#767676;--surface:#fff;--tray:#f4f4f4;--line:#e6e6e6;--accent:#3e7bf0;--bad:#c93c37;--soft:0 4px 20px rgba(0,0,0,.05)}
    *{box-sizing:border-box;font-family:${FONT}}
    .ring{position:fixed;display:none;border:2px solid var(--ink);border-radius:8px;box-shadow:0 0 0 2px var(--surface);pointer-events:none;transition:left .08s,top .08s,width .08s,height .08s}
    .chip{position:fixed;display:none;max-width:min(360px,90vw);height:24px;align-items:center;gap:6px;padding:0 8px;border:1px solid var(--line);border-radius:8px;background:var(--surface);color:var(--ink);font-size:12px;line-height:16px;box-shadow:var(--soft);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .chip.err{color:var(--bad)}
    .spin{width:10px;height:10px;border:1.5px solid var(--line);border-top-color:var(--ink);border-radius:50%;animation:s .8s linear infinite;flex:none}
    @keyframes s{to{transform:rotate(360deg)}}
    @media (prefers-reduced-motion:reduce){.spin{animation:none}.ring{transition:none}}
    .pill{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);display:none;width:min(480px,92vw);flex-direction:column;gap:6px;padding:10px 10px 10px 14px;border:1px solid var(--line);border-radius:12px;background:var(--surface);color:var(--ink);box-shadow:var(--soft);pointer-events:auto}
    .pill small{font-size:12px;line-height:16px;color:var(--ink3)}
    .row{display:flex;align-items:center;gap:6px}
    .lbl{font-size:14px;color:var(--ink2);white-space:nowrap}
    input{flex:1;min-width:0;height:32px;border:0;background:transparent;color:var(--ink);font-size:14px;outline:none}
    button{all:unset;box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:8px;color:var(--ink2);cursor:pointer;flex:none}
    button:hover{background:var(--tray);color:var(--ink)}
    button:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
    button.go{background:var(--accent);color:#fff;border-radius:50%}button.go:hover{background:var(--accent);opacity:.9}
    button.on{background:var(--tray);color:var(--ink)}
    button[hidden]{display:none}
  </style>
  <div class="ring"></div><div class="chip" role="status" aria-live="polite"></div>
  <div class="pill" role="dialog" aria-label="Turn this into">
    <div class="row"><span class="lbl">Turn this into…</span><input aria-label="What to turn this into" spellcheck="false"><button class="mic" aria-label="Speak" title="Speak" hidden><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><path d="M12 19v3"/></svg></button><button class="go" aria-label="Build it" title="Build it"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 7-7 7 7"/><path d="M12 19V5"/></svg></button></div>
    <small>Enter to build · Esc to cancel</small>
  </div>`;
  const ring = root.querySelector(".ring"), chip = root.querySelector(".chip"), pill = root.querySelector(".pill");
  const input = root.querySelector("input"), mic = root.querySelector(".mic"), go = root.querySelector(".go");

  function setChip(msg, opts = {}) {
    chip.className = "chip" + (opts.error ? " err" : "");
    chip.textContent = "";
    if (opts.busy) { const s = document.createElement("span"); s.className = "spin"; chip.append(s); }
    chip.append(document.createTextNode((opts.error ? "✕ " : "") + msg));
    chip.style.display = "inline-flex";
    host.dataset.chip = msg;
    const r = opts.rect;
    if (r) {
      chip.style.left = Math.max(8, Math.min(innerWidth - 248, r.left)) + "px";
      chip.style.top = (r.top > 40 ? r.top - 32 : Math.min(innerHeight - 32, r.bottom + 8)) + "px";
    } else { chip.style.left = "16px"; chip.style.top = "16px"; }
  }
  function showRing(el) {
    const r = el.getBoundingClientRect();
    Object.assign(ring.style, { display: "block", left: r.left + "px", top: r.top + "px", width: r.width + "px", height: r.height + "px" });
    return r;
  }
  const hideAll = () => { ring.style.display = chip.style.display = "none"; delete host.dataset.chip; };

  /* ---------- state ---------- */
  let sticky = false, altDown = false, altUsed = false, altAt = 0, active = false, locked = null, busy = false;
  let mx = -1, my = -1, raf = 0, hover = null, recognition = null, listening = false;
  const state = (s) => { host.dataset.state = s; };
  state("idle");
  const editable = (el) => !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
  const pick = (x, y) => { const el = document.elementFromPoint(x, y); return el && el !== host ? el : null; };

  function refresh() {
    raf = 0;
    if (!active || locked) return;
    const el = mx >= 0 ? pick(mx, my) : null;
    hover = el ? detect(el) : null;
    if (hover) { const r = showRing(hover.el); setChip(hover.label, { rect: r }); state("hover"); }
    else { ring.style.display = "none"; if (sticky) setChip("Point at a table, list, cards or chart"); else chip.style.display = "none"; state("seeking"); }
  }
  const schedule = () => { if (!raf) raf = requestAnimationFrame(refresh); };

  function activate() {
    if (active) return;
    active = true;
    if (!host.isConnected) document.documentElement.append(host);
    schedule();
  }
  function deactivate() {
    active = false; locked = null; hover = null; busy = false;
    pill.style.display = "none"; hideAll(); state("idle");
    stopListening();
    document.documentElement.style.removeProperty("cursor");
  }
  function release() { sticky = false; altDown = false; deactivate(); }

  /* ---------- input handlers (always on, cheap) ---------- */
  addEventListener("mousemove", (e) => { mx = e.clientX; my = e.clientY; if (active && !locked) schedule(); }, true);
  addEventListener("scroll", () => { if (active && !locked) schedule(); }, true);
  addEventListener("blur", () => { if (altDown && !locked) { altDown = false; if (!sticky) deactivate(); } });
  addEventListener("keydown", (e) => {
    if (locked) { if (e.key === "Escape" && !busy) release(); return; }
    if (e.key === "Alt" && !e.repeat && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
      if (editable(document.activeElement)) return;
      altDown = true; altUsed = false; altAt = Date.now(); activate();
    } else if (e.key === "Escape" && active) { release(); }
    else if (altDown && e.key !== "Alt") { altUsed = true; altDown = false; if (!sticky) deactivate(); }
  }, true);
  addEventListener("keyup", (e) => {
    if (e.key !== "Alt" || !altDown || locked) return;
    const used = altUsed, long = Date.now() - altAt >= 200;
    altDown = false;
    if (!used && long && hover) lock(hover); else if (!sticky) deactivate();
  }, true);
  addEventListener("click", (e) => {
    if (!active || locked) return;
    const el = pick(e.clientX, e.clientY), d = el && detect(el);
    if (!d) return;
    e.preventDefault(); e.stopPropagation();
    altDown = false;
    lock(d);
  }, true);

  /* ---------- the "Turn this into…" pill ---------- */
  const DEFAULT = "something I can track";
  function lock(d) {
    locked = d; busy = false;
    const r = showRing(d.el);
    setChip(d.label, { rect: r });
    state("asking");
    input.value = DEFAULT;
    pill.style.display = "flex";
    mic.hidden = !window.webkitSpeechRecognition;
    input.focus(); input.select();
  }
  // Keep typing away from page hotkeys (bubble phase on the shadow root, after the input's own handler).
  for (const t of ["keydown", "keyup", "keypress"]) root.addEventListener(t, (e) => e.stopPropagation());
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); submit(); }
    else if (e.key === "Escape") { e.preventDefault(); release(); }
  });
  go.addEventListener("click", submit);

  function stopListening() { try { recognition?.abort(); } catch {} recognition = null; listening = false; mic.classList.remove("on"); }
  mic.addEventListener("click", () => {
    if (listening) { stopListening(); return; }
    try {
      recognition = new window.webkitSpeechRecognition();
      recognition.interimResults = true; recognition.lang = navigator.language || "en-US";
      recognition.onresult = (ev) => { input.value = [...ev.results].map((r) => r[0].transcript).join(" ").replace(/^\s*turn (?:this|it) into\s*/i, ""); };
      recognition.onend = () => { listening = false; mic.classList.remove("on"); };
      recognition.onerror = () => {};
      recognition.start(); listening = true; mic.classList.add("on"); input.focus();
    } catch { stopListening(); }
  });

  const send = (msg) => new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(msg, (res) => resolve(res ?? { ok: false, error: chrome.runtime.lastError?.message || "No answer from the extension" }));
    } catch (err) { resolve({ ok: false, error: err instanceof Error ? err.message : "Extension was reloaded; refresh this page" }); }
  });
  const frames = (n) => new Promise((r) => { const step = () => (n-- > 0 ? requestAnimationFrame(step) : r()); step(); });

  async function capture(el) {
    const r0 = el.getBoundingClientRect();
    if (r0.top < 0 || r0.bottom > innerHeight) {
      el.scrollIntoView({ block: "center", inline: "nearest" });
      await new Promise((r) => setTimeout(r, 250));
    }
    const r = el.getBoundingClientRect();
    const x = Math.max(0, r.left), y = Math.max(0, r.top);
    const w = Math.min(innerWidth, r.right) - x, h = Math.min(innerHeight, r.bottom) - y;
    if (w < 8 || h < 8) return { ok: false, error: "That chart is off screen" };
    host.style.visibility = "hidden";
    await frames(3);
    const res = await send({ type: "capture", rect: { x, y, w, h }, viewport: { w: innerWidth, h: innerHeight } });
    host.style.visibility = "";
    return res;
  }

  async function submit() {
    if (busy || !locked) return;
    busy = true;
    const d = locked, value = clean(input.value) || DEFAULT;
    const instruction = `Turn this into ${value}`.slice(0, 1000);
    stopListening();
    pill.style.display = "none";
    state("working");
    const r = d.el.getBoundingClientRect();
    const fail = (msg) => {
      busy = false; state("error");
      setChip(msg, { error: true, rect: r });
      pill.style.display = "flex"; input.focus();
    };
    let entity = d.entity;
    if (d.kind === "image") {
      setChip("Reading chart…", { busy: true, rect: r });
      const cap = await capture(d.el);
      if (!cap.ok) return fail(cap.error || "Could not capture that");
      const hint = clean(d.el.getAttribute("alt") || d.el.getAttribute("aria-label") || document.title).slice(0, 500);
      const ex = await send({ type: "extract", image: cap.image, hint });
      if (!ex.ok) return fail(ex.error || "Could not read that chart");
      entity = ex.entity;
      entity.source = { ...entity.source, url: location.href.slice(0, 2000), title: clean(document.title).slice(0, 300) };
      setChip(`Chart · ${plural(entity.rows?.length ?? 0, "row", "rows")}`, { busy: true, rect: r });
    } else {
      const noun = d.label.split(" ")[0].toLowerCase();
      setChip(`Reading ${noun}…`, { busy: true, rect: r });
      await new Promise((res) => setTimeout(res, 250));
    }
    setChip("Building your app…", { busy: true, rect: r });
    const lift = await send({ type: "lift", entity, instruction });
    if (!lift.ok) return fail(lift.error || "Could not build that. Is Create running?");
    state("done");
    setChip("Opened your app", { rect: r });
    setTimeout(release, 1200);
  }

  window.__createLift = {
    arm() {
      if (active && sticky) { release(); return; }
      sticky = true; activate();
      document.documentElement.style.cursor = "crosshair";
    },
  };
  chrome.runtime.onMessage.addListener((m) => { if (m?.type === "arm") window.__createLift.arm(); });
})();
