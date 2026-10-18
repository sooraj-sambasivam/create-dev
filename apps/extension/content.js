// Lift: point at (or circle) a table, list, cards or chart image, say "turn this into something I can track", get a live app.
// Hold Option (or arm from the toolbar / Alt+Shift+P) to point; drag while holding Option to circle. Plain JS, no build step.
(() => {
  if (window.__createLift) return;

  /* ---------- motion: Web Animations on compositor properties only (translate, scale, opacity) ---------- */
  const reduceMQ = matchMedia("(prefers-reduced-motion: reduce)");
  const reduced = () => reduceMQ.matches;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  /** Damped spring sampled into a linear() easing, so the curve is physical and the work stays on the compositor. */
  function spring(stiffness, damping) {
    const dt = 1 / 120, pts = [0];
    let x = 0, v = 0, t = 0;
    while (t < 1.4) {
      v += (-stiffness * (x - 1) - damping * v) * dt; x += v * dt; t += dt;
      pts.push(x);
      if (Math.abs(x - 1) < 0.0015 && Math.abs(v) < 0.01) break;
    }
    pts[pts.length - 1] = 1;
    const step = Math.max(1, Math.floor(pts.length / 40)), out = [];
    for (let i = 0; i < pts.length; i += step) out.push(+pts[i].toFixed(4));
    if (out[out.length - 1] !== 1) out.push(1);
    return { duration: Math.round(t * 1000), easing: `linear(${out.join(",")})` };
  }
  const SPRING_OK = typeof CSS !== "undefined" && CSS.supports?.("animation-timing-function", "linear(0, 1)");
  const mk = (k, c, fb) => (SPRING_OK ? spring(k, c) : { duration: fb, easing: "cubic-bezier(.22,1,.36,1)" });
  // One timing vocabulary for every surface: soft (move/morph), pop (arrive), snap (text, small state changes).
  const SPR = { soft: mk(190, 23, 380), pop: mk(300, 21, 420), snap: mk(520, 36, 220) };
  const OUT = { duration: 140, easing: "cubic-bezier(.4,0,1,1)", fill: "forwards" };

  /** Run a keyframe animation under a key; a newer one with the same key replaces it. */
  function fx(el, key, frames, opts) {
    const m = (el.__fx ||= {});
    m[key]?.cancel();
    if (reduced()) return Promise.resolve();
    const a = el.animate(frames, opts);
    m[key] = a;
    return a.finished.then(() => { if (m[key] === a) delete m[key]; }, () => {});
  }
  const num2 = (s, d) => { const p = String(s).trim().split(/\s+/).map(parseFloat); return p.length && !p.some(isNaN) ? [p[0], p.length > 1 ? p[1] : p[0]] : [d, d]; };
  /** Show with an arrival animation (opacity + small rise). `frames` may override. */
  function showEl(el, display, frames) {
    const was = !!el.__on;
    el.__on = true;
    el.__fx?.out?.cancel(); delete el.__fx?.out;
    el.style.display = display;
    if (!was) fx(el, "in", frames || [{ opacity: 0, translate: "0 6px", scale: ".97" }, { opacity: 1, translate: "0 0", scale: "1" }], SPR.pop);
    return was;
  }
  function hideEl(el, opts = OUT, instant = false) {
    if (!el.__on) return;
    el.__on = false;
    if (instant || reduced()) { el.style.display = "none"; el.__fx?.in?.cancel(); return; }
    fx(el, "out", [{ opacity: 1 }, { opacity: 0 }], opts).then(() => {
      if (!el.__on) { el.style.display = "none"; el.__fx?.out?.cancel(); delete el.__fx?.out; }
    });
  }
  /** Move/resize a fixed element with translate+scale only (FLIP). Interrupts start from the live interpolated box. */
  function morph(el, r) {
    let from = null;
    if (el.__on && el.__w) {
      const cs = getComputedStyle(el), [tx, ty] = num2(cs.translate === "none" ? "0 0" : cs.translate, 0), [sx, sy] = num2(cs.scale === "none" ? "1 1" : cs.scale, 1);
      from = { x: tx, y: ty, w: el.__w * sx, h: el.__h * sy };
    }
    el.style.width = r.width + "px"; el.style.height = r.height + "px";
    el.style.translate = `${r.left}px ${r.top}px`; el.style.scale = "1";
    el.__w = r.width; el.__h = r.height;
    if (from && (Math.abs(from.x - r.left) + Math.abs(from.y - r.top) + Math.abs(from.w - r.width) + Math.abs(from.h - r.height) > 0.5)) {
      fx(el, "mv", [{ translate: `${from.x}px ${from.y}px`, scale: `${from.w / r.width} ${from.h / r.height}` }, { translate: `${r.left}px ${r.top}px`, scale: "1 1" }], SPR.soft);
    }
  }
  function slide(el, x, y) {
    let from = null;
    if (el.__on) { const t = getComputedStyle(el).translate; from = num2(t === "none" ? "0 0" : t, 0); }
    el.style.translate = `${x}px ${y}px`;
    if (from && Math.abs(from[0] - x) + Math.abs(from[1] - y) > 0.5) fx(el, "mv", [{ translate: `${from[0]}px ${from[1]}px` }, { translate: `${x}px ${y}px` }], SPR.soft);
  }

  /* ---------- text + type inference ---------- */
  const MAX_ROWS = 500, MAX_COLS = 20, MAX_CELL = 500;
  const clean = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
  const text = (el) => clean(el && (el.innerText || el.textContent)).slice(0, MAX_CELL);
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  const BLOCK = new Set(["DIV", "P", "LI", "UL", "OL", "DL", "DT", "DD", "H1", "H2", "H3", "H4", "H5", "H6", "SECTION", "ARTICLE", "HEADER", "FOOTER", "BR", "BUTTON", "TABLE", "TR", "FIGURE", "FIGCAPTION", "ASIDE", "NAV", "FORM"]);
  const SKIPT = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE"]);
  /** Visible text lines. Live pages use innerText; fetched (inert) documents get the same line breaks from block tags. */
  function linesOf(el, live) {
    if (live) return (el.innerText || el.textContent || "").split("\n").map(clean).filter(Boolean);
    const out = []; let cur = "";
    const flush = () => { const c = clean(cur); if (c) out.push(c); cur = ""; };
    const walk = (n) => {
      for (const k of n.childNodes) {
        if (k.nodeType === 3) cur += k.nodeValue;
        else if (k.nodeType === 1 && !SKIPT.has(k.tagName)) { const b = BLOCK.has(k.tagName); if (b) flush(); walk(k); if (b) flush(); }
      }
    };
    walk(el); flush();
    return out;
  }

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
  function fromCards(container, cards, live = true) {
    const data = cards.map((card) => {
      const headEl = card.querySelector("h1,h2,h3,h4,h5,h6,[class*=title],[class*=name],strong,b");
      const lines = linesOf(card, live);
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
  function cardChildren(el, live = true) {
    const kids = [...el.children].filter((c) => !CARDLESS.has(c.tagName.toUpperCase()) && (!live || visible(c)));
    if (kids.length < 2 || kids.length > 24) return null;
    const tag = kids[0].tagName;
    const same = kids.filter((c) => c.tagName === tag);
    if (same.length < 2 || same.length < kids.length * 0.66) return null;
    const rich = same.filter((c) => c.querySelectorAll("*").length >= 2 && text(c).length >= 8);
    if (rich.length !== same.length) return null;
    if (!live) return same;
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

  /* ---------- entity for any element (live page or fetched document) ---------- */
  function entityFor(el, live) {
    const tag = el.tagName.toUpperCase(), role = el.getAttribute("role");
    if (tag === "TABLE") return fromTable(el);
    if (role === "table" || role === "grid" || role === "treegrid") return fromAria(el);
    if (tag === "UL" || tag === "OL" || tag === "DL" || role === "list") return fromList(el);
    const cards = cardChildren(el, live);
    return cards ? fromCards(el, cards, live) : null;
  }

  /* ---------- deep capture: structured DOM snapshot of the circled container ---------- */
  const SNAP_ATTRS = new Set(["id", "class", "href", "src", "srcset", "alt", "title", "role", "aria-label", "aria-current", "name", "type", "datetime", "colspan", "rowspan", "rel", "for", "placeholder", "data-testid"]);
  const absUrl = (v) => { try { const u = new URL(v, location.href); return /^https?:$/.test(u.protocol) ? u.href : ""; } catch { return ""; } };
  function snapshot(root) {
    const links = [], images = [];
    let nodes = 0;
    const build = (budget, withStyle) => {
      nodes = 0; links.length = 0; images.length = 0;
      const one = (el, depth) => {
        if (nodes >= budget || depth > 14 || SKIPT.has(el.tagName)) return null;
        nodes++;
        const n = { t: el.tagName.toLowerCase() };
        const a = {};
        for (const at of el.attributes) {
          if (!SNAP_ATTRS.has(at.name)) continue;
          let v = at.value;
          if (at.name === "href" || at.name === "src") v = absUrl(v);
          else if (at.name === "srcset") v = v.split(",").map((c) => { const [u, ...d] = c.trim().split(/\s+/); const x = absUrl(u); return x ? [x, ...d].join(" ") : ""; }).filter(Boolean).join(", ");
          if (v) a[at.name] = v.slice(0, 500);
        }
        if (a.href && links.length < 100) links.push(a.href);
        if ((a.src || a.srcset) && images.length < 50) images.push(a.src || a.srcset.split(",")[0].trim().split(" ")[0]);
        if (Object.keys(a).length) n.a = a;
        if (withStyle) {
          try {
            const cs = getComputedStyle(el), s = {};
            for (const p of ["display", "color", "backgroundColor", "fontSize", "fontWeight", "textAlign"]) s[p] = cs[p];
            if (cs.borderRadius !== "0px") s.borderRadius = cs.borderRadius;
            if (s.backgroundColor === "rgba(0, 0, 0, 0)") delete s.backgroundColor;
            n.s = s;
          } catch {}
        }
        const own = clean([...el.childNodes].filter((k) => k.nodeType === 3).map((k) => k.nodeValue).join(" ")).slice(0, 300);
        if (own) n.x = own;
        const kids = [];
        for (const c of el.children) { const k = one(c, depth + 1); if (k) kids.push(k); }
        if (kids.length) n.c = kids;
        return n;
      };
      return one(root, 0);
    };
    let tree = build(500, true), json = JSON.stringify(tree);
    if (json.length > 120_000) { tree = build(220, false); json = JSON.stringify(tree); }
    return { url: location.href.slice(0, 2000), title: clean(document.title).slice(0, 300), nodes, tree, links, images };
  }

  /* ---------- circle: freehand loop -> elements mostly inside -> lowest common container ---------- */
  const dist2 = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
  /** Douglas-Peucker, iterative. */
  function simplify(pts, eps) {
    if (pts.length < 4) return pts.slice();
    const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
    const stack = [[0, pts.length - 1]];
    while (stack.length) {
      const [s, e] = stack.pop();
      const A = pts[s], B = pts[e], dx = B.x - A.x, dy = B.y - A.y, len = Math.hypot(dx, dy) || 1;
      let md = 0, mi = -1;
      for (let i = s + 1; i < e; i++) { const d = Math.abs((pts[i].x - A.x) * dy - (pts[i].y - A.y) * dx) / len; if (d > md) { md = d; mi = i; } }
      if (md > eps && mi > 0) { keep[mi] = 1; stack.push([s, mi], [mi, e]); }
    }
    return pts.filter((_, i) => keep[i]);
  }
  function inPoly(x, y, poly) {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i], b = poly[j];
      if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) c = !c;
    }
    return c;
  }
  const boxOf = (pts) => {
    let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
    for (const p of pts) { if (p.x < l) l = p.x; if (p.x > r) r = p.x; if (p.y < t) t = p.y; if (p.y > b) b = p.y; }
    return { l, t, r, b, w: r - l, h: b - t, area: (r - l) * (b - t) };
  };
  /** Share of an element's (viewport-clipped) rect inside the loop, from a 5x5 sample grid. */
  function coverage(r, poly) {
    const l = Math.max(0, r.left), t = Math.max(0, r.top), rr = Math.min(innerWidth, r.right), bb = Math.min(innerHeight, r.bottom);
    if (rr - l < 2 || bb - t < 2) return 0;
    let hit = 0;
    for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) if (inPoly(l + ((i + 0.5) / 5) * (rr - l), t + ((j + 0.5) / 5) * (bb - t), poly)) hit++;
    return hit / 25;
  }
  function collectInside(poly, bb) {
    const out = []; let seen = 0;
    const walk = (parent) => {
      for (const c of parent.children) {
        if (++seen > 6000) return;
        if (SKIPT.has(c.tagName) || c === host) continue;
        const r = c.getBoundingClientRect(), has = r.width > 0 && r.height > 0;
        if (has && (r.right < bb.l || r.left > bb.r || r.bottom < bb.t || r.top > bb.b)) continue;
        if (has && r.width >= 4 && r.height >= 4 && r.width * r.height <= bb.area * 1.5 && coverage(r, poly) >= 0.6) out.push(c);
        walk(c);
      }
    };
    walk(document.body);
    return out;
  }
  const lowest = (els) => { let a = els[0]; for (const e of els) while (a && !a.contains(e)) a = a.parentElement; return a; };
  const overlapShare = (r, bb) => {
    const w = Math.min(r.right, bb.r) - Math.max(r.left, bb.l), h = Math.min(r.bottom, bb.b) - Math.max(r.top, bb.t);
    return w > 0 && h > 0 ? (w * h) / Math.max(1, Math.min(bb.area, r.width * r.height)) : 0;
  };
  /** The loop's target: { el, kind, label, entity?, box, loop:true }. Falls back to an image region when no entity fits. */
  function resolveCircle(poly) {
    const bb = boxOf(poly);
    const inside = collectInside(poly, bb);
    const root = inside.length ? lowest(inside) : pick((bb.l + bb.r) / 2, (bb.t + bb.b) / 2);
    let d = null;
    const usable = (h) => h && overlapShare(h.el.getBoundingClientRect(), bb) >= 0.5;
    if (root && root !== document.body && root !== document.documentElement) {
      d = detect(root);
      if (!usable(d)) d = null;
    }
    if (!d) {
      const big = inside.map((e) => [e, e.getBoundingClientRect()]).sort((a, b) => b[1].width * b[1].height - a[1].width * a[1].height).slice(0, 40);
      for (const [e] of big) { const h = detect(e); if (usable(h)) { d = h; break; } }
    }
    const box = { x: bb.l, y: bb.t, w: bb.w, h: bb.h };
    if (d) return { ...d, loop: true, box, anchor: root || d.el };
    return { el: null, kind: "image", label: "Region · read as image", loop: true, box, anchor: root, entity: null };
  }

  /* ---------- tray snippet: sanitized markup + styles of the circled container ---------- */
  const TRAY_TAGS = new Set("div span p a ul ol li table thead tbody tfoot tr td th caption h1 h2 h3 h4 h5 h6 img button section article header footer nav main aside figure figcaption strong em b i u small code pre blockquote br hr label time dl dt dd cite".split(" "));
  const TRAY_VOID = new Set(["br", "hr", "img"]);
  const TRAY_ATTRS = new Set(["class", "id", "href", "src", "alt", "title", "role", "aria-label", "aria-current", "colspan", "rowspan", "datetime", "lang", "data-testid", "name", "type", "placeholder"]);
  const TRAY_DROP = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "IFRAME", "OBJECT", "EMBED", "SVG", "CANVAS", "HEAD", "META", "LINK", "TEXTAREA", "SELECT", "FORM"]);
  const TRAY_HTML_MAX = 20480, TRAY_STYLE_PROPS = ["display", "flexDirection", "color", "backgroundColor", "fontFamily", "fontSize", "fontWeight", "lineHeight", "textAlign", "padding", "margin", "borderRadius", "border", "boxShadow", "gap", "width", "height"];
  const SAFE_HREF = /^(https?:\/\/[^\s"'<>]+|mailto:[^\s"'<>]+|tel:[+\d\s()-]+|#[\w-]*|\/[^\s"'<>]*)$/i;
  const SAFE_SRC = /^(https?:\/\/[^\s"'<>]+|data:image\/(?:png|jpeg|gif|webp);base64,[A-Za-z0-9+/]+=*)$/i;
  const escH = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  function trayAttr(name, raw) {
    if (!TRAY_ATTRS.has(name)) return null;
    let v = String(raw).replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 500);
    if (!v) return null;
    if (name === "href" || name === "src") { v = absUrl(v) || (name === "src" && /^data:image\//i.test(v) ? v : ""); if (!v) return null; return (name === "href" ? SAFE_HREF : SAFE_SRC).test(v) ? v : null; }
    return v;
  }
  /** Allow-listed outerHTML, at most 20 KB; the server re-sanitizes anyway. */
  function trayHtml(root) {
    let left = TRAY_HTML_MAX;
    const cost = (s) => { if (s.length > left) { left = 0; return false; } left -= s.length; return true; };
    const inner = (n, depth) => {
      if (depth > 24) return "";
      let out = "";
      for (const c of n.childNodes) {
        if (c.nodeType === 3) { const t = escH(clean(c.nodeValue) ? String(c.nodeValue).replace(/\s+/g, " ") : ""); if (t.trim()) { if (cost(t)) out += t; else break; } }
        else if (c.nodeType === 1) { const p = emit(c, depth + 1); if (!p && left <= 0) break; out += p; }
      }
      return out;
    };
    const emit = (n, depth) => {
      if (n === host || TRAY_DROP.has(n.tagName.toUpperCase())) return "";
      const tag = n.tagName.toLowerCase();
      if (!TRAY_TAGS.has(tag)) return inner(n, depth);
      let attrs = "";
      for (const a of n.attributes) { const name = a.name.toLowerCase(), v = trayAttr(name, a.value); if (v !== null) attrs += ` ${name}="${escH(v).replace(/"/g, "&quot;")}"`; }
      if (tag === "img" && !/ src="/.test(attrs)) return "";
      if (tag === "a" && / href="/.test(attrs)) attrs += ' rel="noopener noreferrer"';
      const open = `<${tag}${attrs}>`;
      if (TRAY_VOID.has(tag)) return cost(open) ? open : "";
      if (!cost(open + `</${tag}>`)) return "";
      return open + inner(n, depth) + `</${tag}>`;
    };
    return emit(root, 0);
  }
  function trayStyles(el) {
    const out = {};
    try {
      const cs = getComputedStyle(el);
      for (const p of TRAY_STYLE_PROPS) {
        const v = cs[p];
        if (!v || v === "none" || v === "normal" || v === "0px" || v === "rgba(0, 0, 0, 0)") continue;
        out[p.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase())] = String(v).slice(0, 200);
      }
    } catch {}
    return out;
  }
  /** After a loop is released: shoot the region, send thumbnail + code to the tray. Never throws, never blocks the pill for long. */
  async function trayCapture(target) {
    try {
      const b = target.box;
      const x = Math.max(0, b.x), y = Math.max(0, b.y);
      const w = Math.min(innerWidth, b.x + b.w) - x, h = Math.min(innerHeight, b.y + b.h) - y;
      const root = target.anchor || target.el || null;
      let thumbnail = "";
      if (w >= 8 && h >= 8) {
        host.style.visibility = "hidden";
        await frames(2);
        const shot = await send({ type: "trayShot", rect: { x, y, w, h }, viewport: { w: innerWidth, h: innerHeight } });
        host.style.visibility = "";
        if (shot?.ok && shot.image) thumbnail = shot.image;
      }
      const snippetHtml = root && root !== document.body && root !== document.documentElement ? trayHtml(root) : "";
      if (!snippetHtml && !thumbnail) return;
      const title = clean((target.entity && target.entity.title) || (root && text(root)) || target.label || "Snippet").slice(0, 80) || "Snippet";
      const kind = root && /^(TABLE|UL|OL|IMG)$/.test(root.tagName) ? { TABLE: "table", UL: "list", OL: "list", IMG: "image" }[root.tagName] : snippetHtml ? "snippet" : "image";
      await send({ type: "tray", payload: { title, kind, ...(thumbnail ? { thumbnail } : {}), ...(snippetHtml ? { snippetHtml, styles: trayStyles(root) } : {}), source: { app: "extension", url: location.href.slice(0, 2000), title: clean(document.title).slice(0, 200) } } });
    } catch { host.style.visibility = ""; }
  }

  /* ---------- crawl: follow same-origin pagination, re-run the extractor on the same container ---------- */
  const WANT_ALL = /\b(?:all|every|each)\b[^.]{0,24}\bpages?\b|\bthe rest\b|\bremaining (?:pages|results)\b|\bevery page\b/i;
  const NEXT_TEXT = /^\s*(?:next(?:\s+page)?|older|more|›|»|→|>|next\s*[›»→>])\s*$/i;
  const normUrl = (u) => { try { const x = new URL(u); x.hash = ""; return x.href; } catch { return u; } };
  const PAGER = 'nav[aria-label*="pag" i], [class*="pagina" i], [class*="pager" i], [role="navigation"]';
  function pagerNumbers(doc, base) {
    const out = []; let cur = 1;
    for (const box of doc.querySelectorAll(PAGER)) {
      for (const a of box.querySelectorAll("a[href]")) {
        const n = /^\d{1,3}$/.test(clean(a.textContent)) ? +clean(a.textContent) : 0;
        if (!n) continue;
        let u; try { u = new URL(a.getAttribute("href"), base); } catch { continue; }
        out.push({ n, href: u.href });
      }
      for (const m of box.querySelectorAll('[aria-current], .active, .current, .on, .selected')) {
        const n = parseInt(clean(m.textContent), 10);
        if (n > 0 && n < 1000) cur = n;
      }
    }
    return { nums: out, cur };
  }
  /** The next page's URL (same origin, not yet seen), or null. */
  function nextUrl(doc, base, seen) {
    const ok = (href) => {
      if (!href) return null;
      try { const u = new URL(href, base); return /^https?:$/.test(u.protocol) && u.origin === location.origin && !seen.has(normUrl(u.href)) ? u.href : null; } catch { return null; }
    };
    for (const el of doc.querySelectorAll('link[rel~="next"], a[rel~="next"]')) { const u = ok(el.getAttribute("href")); if (u) return u; }
    for (const a of doc.querySelectorAll("a[href][aria-label]")) { if (/\bnext\b/i.test(a.getAttribute("aria-label")) && !/prev/i.test(a.getAttribute("aria-label"))) { const u = ok(a.getAttribute("href")); if (u) return u; } }
    for (const a of doc.querySelectorAll("a[href]")) { if (NEXT_TEXT.test(a.textContent || "")) { const u = ok(a.getAttribute("href")); if (u) return u; } }
    const { nums, cur } = pagerNumbers(doc, base);
    const ahead = nums.filter((p) => p.n > cur).sort((a, b) => a.n - b.n);
    for (const p of ahead) { const u = ok(p.href); if (u) return u; }
    return null;
  }
  const knownPages = (doc, base) => { const { nums, cur } = pagerNumbers(doc, base); return Math.max(cur, ...nums.map((p) => p.n), 1); };

  /**
   * Enclosing structure of `el`, nearest first (max 6): table, row (tr, li, [role=row]), list (ul/ol), chart (figure/svg/canvas),
   * card (one of 3-24 same-class siblings with text), section. Rects are viewport CSS px.
   */
  function containerAncestors(el) {
    const out = [];
    const kindOf = (e) => {
      const t = e.tagName.toLowerCase(), role = (e.getAttribute("role") || "").toLowerCase();
      if (t === "table" || role === "table" || role === "grid" || role === "treegrid") return "table";
      if (t === "tr" || t === "li" || role === "row" || role === "listitem") return "row";
      if (t === "ul" || t === "ol" || t === "dl" || role === "list" || role === "listbox") return "list";
      if (t === "figure" || t === "svg" || t === "canvas" || role === "graphics-document") return "chart";
      if (t === "section" || role === "region") return "section";
      const cls = typeof e.className === "string" ? e.className.trim() : "";
      // div-based tables (Notion, Sheets clones): class tokens ending in -row / -table / -grid / -table-view.
      const toks = cls ? cls.split(/\s+/) : [];
      if (toks.some((k) => /(^|-)row$/.test(k))) return "row";
      if (toks.some((k) => /(^|-)(table|grid)(-view)?$/.test(k))) return "table";
      if (cls && e.parentElement && e.parentElement !== document.body) {
        const same = [...e.parentElement.children].filter((c) => c.tagName === e.tagName && c.className === e.className);
        const r = e.getBoundingClientRect();
        if (same.length >= 3 && same.length <= 24 && r.width > 120 && r.height > 60 && (e.textContent || "").trim()) return "card";
      }
      return null;
    };
    for (let cur = el.parentElement; cur && cur !== document.body && cur !== document.documentElement && out.length < 6; cur = cur.parentElement) {
      const kind = kindOf(cur);
      if (!kind) continue;
      const r = cur.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) continue;
      const role = cur.getAttribute("role");
      out.push({ tag: cur.tagName.toLowerCase().slice(0, 40), ...(role ? { role: role.slice(0, 80) } : {}), rect: { x: r.left, y: r.top, w: r.width, h: r.height }, kind });
    }
    return out;
  }
  /** Where `el` sits under <body>: tag + nth-of-type per level, plus id and classes as fallbacks. */
  function pathOf(el) {
    const steps = [];
    for (let cur = el; cur && cur !== document.body && cur.parentElement; cur = cur.parentElement) {
      const same = [...cur.parentElement.children].filter((c) => c.tagName === cur.tagName);
      steps.unshift({ tag: cur.tagName, idx: same.indexOf(cur), id: cur.id || "", cls: [...cur.classList].slice(0, 3) });
    }
    return steps;
  }
  function locate(doc, steps) {
    let cur = doc.body;
    for (const s of steps) {
      if (!cur) break;
      const same = [...cur.children].filter((c) => c.tagName === s.tag);
      cur = same[s.idx] || same.find((c) => s.id && c.id === s.id) || same.find((c) => s.cls.length && s.cls.every((k) => c.classList.contains(k))) || null;
    }
    const last = steps[steps.length - 1];
    if (!cur && last) {
      if (last.id) cur = doc.getElementById(last.id);
      if (!cur && last.cls.length) cur = doc.querySelector(last.tag.toLowerCase() + last.cls.map((c) => "." + CSS.escape(c)).join(""));
    }
    return cur;
  }
  const rowSig = (cols, row) => cols.map((c) => clean(row[c.key]).toLowerCase()).join("␟");
  /** Merge `add` into `base` by column label; skip rows already seen. Returns how many were new. */
  function mergeInto(base, add) {
    const keyOf = new Map(base.columns.map((c) => [c.label.toLowerCase(), c.key]));
    for (const c of add.columns) {
      const lk = c.label.toLowerCase();
      if (keyOf.has(lk) || base.columns.length >= MAX_COLS) continue;
      let key = c.key; while (base.columns.some((b) => b.key === key)) key = `${key.slice(0, 55)}_${base.columns.length + 1}`;
      base.columns.push({ ...c, key }); keyOf.set(lk, key);
    }
    const seen = new Set(base.rows.map((r) => rowSig(base.columns, r)));
    let added = 0;
    for (const r of add.rows) {
      const row = Object.fromEntries(base.columns.map((c) => [c.key, ""]));
      for (const c of add.columns) { const k = keyOf.get(c.label.toLowerCase()); if (k) row[k] = r[c.key] ?? ""; }
      const sig = rowSig(base.columns, row);
      if (seen.has(sig) || base.rows.length >= MAX_ROWS) continue;
      seen.add(sig); base.rows.push(row); added++;
    }
    for (const c of base.columns) c.type = inferType(base.rows.map((r) => r[c.key]));
    return added;
  }
  const CRAWL_PAGES = 5, CRAWL_MS = 10_000;
  async function crawl(d, onProgress) {
    const t0 = Date.now(), steps = pathOf(d.el);
    const merged = JSON.parse(JSON.stringify(d.entity));
    if (d.entity.cardNoun) merged.cardNoun = d.entity.cardNoun;
    const seen = new Set([normUrl(location.href)]);
    let doc = document, base = location.href, pages = 1;
    const total = Math.min(CRAWL_PAGES, Math.max(2, knownPages(document, base) > 1 ? knownPages(document, base) : CRAWL_PAGES));
    while (pages < CRAWL_PAGES && Date.now() - t0 < CRAWL_MS) {
      const url = nextUrl(doc, base, seen);
      if (!url) break;
      seen.add(normUrl(url));
      onProgress(pages + 1, total);
      const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), Math.max(500, CRAWL_MS - (Date.now() - t0)));
      let html = "";
      try {
        const res = await fetch(url, { credentials: "same-origin", redirect: "follow", signal: ctl.signal });
        if (!res.ok || !/html/i.test(res.headers.get("content-type") || "")) break;
        // A redirect off the page's origin ends the crawl: never read or merge another site's content.
        if (res.url && new URL(res.url).origin !== location.origin) break;
        base = res.url || url;
        html = (await res.text()).slice(0, 3_000_000);
      } catch { break; } finally { clearTimeout(timer); }
      const rdoc = new DOMParser().parseFromString(html, "text/html");
      const el = locate(rdoc, steps);
      let ent = null;
      try { ent = el && entityFor(el, false); } catch {}
      if (!ent || !ent.rows.length) break;
      doc = rdoc; pages++;
      if (!mergeInto(merged, ent)) break;
    }
    merged.title = d.entity.title;
    return { entity: merged, pages };
  }

  /* ---------- UI: closed shadow root, tokens from DESIGN.md ---------- */
  const FONT = '"SF Pro Text", -apple-system, BlinkMacSystemFont, "Inter Variable", system-ui, sans-serif';
  const host = document.createElement("div");
  host.style.cssText = "all:initial;position:fixed;inset:0;pointer-events:none;z-index:2147483647";
  const root = host.attachShadow({ mode: "closed" });
  root.innerHTML = `<style>
    :host{--ink:#0d0d0d;--ink2:#5d5d5d;--ink3:#767676;--surface:#fff;--tray:#f4f4f4;--line:#e6e6e6;--accent:#3e7bf0;--bad:#c93c37;--soft:0 4px 20px rgba(0,0,0,.05)}
    *{box-sizing:border-box;font-family:${FONT}}
    .loop{position:fixed;inset:0;width:100%;height:100%;display:none;overflow:visible;pointer-events:none;will-change:opacity}
    .loop path{fill:none;stroke:var(--accent);stroke-linecap:round;stroke-linejoin:round}
    .loop .lf{fill:var(--accent);fill-opacity:.07;stroke:none}
    .loop .g2{stroke-width:20;stroke-opacity:.07}.loop .g1{stroke-width:9;stroke-opacity:.16}.loop .ln{stroke-width:3}
    .loop circle{fill:var(--accent)}
    .ring{position:fixed;left:0;top:0;display:none;border:2px solid var(--ink);border-radius:8px;box-shadow:0 0 0 2px var(--surface);pointer-events:none;transform-origin:0 0;contain:layout style;will-change:translate,scale,opacity}
    .chip{position:fixed;left:0;top:0;display:none;max-width:min(360px,90vw);height:24px;align-items:center;gap:6px;padding:0 8px;border:1px solid var(--line);border-radius:8px;background:var(--surface);color:var(--ink);font-size:12px;line-height:16px;box-shadow:var(--soft);white-space:nowrap;overflow:hidden;will-change:translate,scale,opacity}
    .chip .msg{display:inline-block;min-width:0;overflow:hidden;text-overflow:ellipsis}
    .chip.err{color:var(--bad)}
    .bar{position:absolute;left:0;bottom:0;height:2px;width:100%;background:var(--accent);transform-origin:0 0;scale:0 1;opacity:.85}
    .spin{width:10px;height:10px;border:1.5px solid var(--line);border-top-color:var(--ink);border-radius:50%;animation:s .8s linear infinite;flex:none}
    .spin[hidden]{display:none}
    @keyframes s{to{rotate:360deg}}
    @media (prefers-reduced-motion:reduce){.spin{animation:none}}
    .pill{position:fixed;left:0;right:0;margin:0 auto;bottom:24px;display:none;width:min(480px,92vw);flex-direction:column;gap:6px;padding:10px 10px 10px 14px;border:1px solid var(--line);border-radius:12px;background:var(--surface);color:var(--ink);box-shadow:var(--soft);pointer-events:auto;will-change:translate,scale,opacity}
    .pill small{font-size:12px;line-height:16px;color:var(--ink3)}
    .row{display:flex;align-items:center;gap:6px}
    .foot{justify-content:space-between;min-height:24px}
    .lbl{font-size:14px;color:var(--ink2);white-space:nowrap}
    input{flex:1;min-width:0;height:32px;border:0;background:transparent;color:var(--ink);font-size:14px;outline:none}
    button{all:unset;box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:8px;color:var(--ink2);cursor:pointer;flex:none;transition:background-color .15s,color .15s,opacity .15s}
    button:hover{background:var(--tray);color:var(--ink)}
    button:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
    button.go{background:var(--accent);color:#fff;border-radius:50%}button.go:hover{background:var(--accent);opacity:.9}
    button.on{background:var(--tray);color:var(--ink)}
    button.pages{width:auto;height:24px;padding:0 8px;border:1px solid var(--line);font-size:12px;line-height:16px;gap:6px;border-radius:8px}
    button.pages[aria-pressed=true]{background:var(--tray);color:var(--ink);border-color:var(--ink3)}
    button[hidden]{display:none}
    @media (prefers-reduced-motion:reduce){button{transition:none}}
  </style>
  <svg class="loop" aria-hidden="true"><path class="lf"/><path class="g2"/><path class="g1"/><path class="ln"/><circle r="4" cx="-10" cy="-10"/></svg>
  <div class="ring"></div><div class="chip" role="status" aria-live="polite"><span class="spin" hidden></span><span class="msg"></span><i class="bar"></i></div>
  <div class="pill" role="dialog" aria-label="Turn this into">
    <div class="row"><span class="lbl">Turn this into…</span><input aria-label="What to turn this into" spellcheck="false"><button class="mic" aria-label="Speak" title="Speak" hidden><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><path d="M12 19v3"/></svg></button><button class="go" aria-label="Build it" title="Build it"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 7-7 7 7"/><path d="M12 19V5"/></svg></button></div>
    <div class="row foot"><small>Enter to build · Esc to cancel</small><button class="pages" aria-pressed="false" hidden>Get all pages</button></div>
  </div>`;
  const loopSvg = root.querySelector(".loop"), ring = root.querySelector(".ring"), chip = root.querySelector(".chip"), pill = root.querySelector(".pill");
  const lpF = root.querySelector(".lf"), lpG2 = root.querySelector(".g2"), lpG1 = root.querySelector(".g1"), lpL = root.querySelector(".ln"), tip = loopSvg.querySelector("circle");
  const chipMsg = chip.querySelector(".msg"), spin = chip.querySelector(".spin"), bar = chip.querySelector(".bar");
  const input = root.querySelector("input"), mic = root.querySelector(".mic"), go = root.querySelector(".go"), pagesBtn = root.querySelector(".pages");

  function setProgress(p) {
    const to = p == null ? 0 : Math.max(0, Math.min(1, p));
    const from = num2(getComputedStyle(bar).scale === "none" ? "0 1" : getComputedStyle(bar).scale, 0)[0];
    bar.style.scale = `${to} 1`;
    if (Math.abs(from - to) > 0.01) fx(bar, "p", [{ scale: `${from} 1` }, { scale: `${to} 1` }], SPR.soft);
  }
  function setChip(msg, opts = {}) {
    chip.className = "chip" + (opts.error ? " err" : "");
    spin.hidden = !opts.busy;
    const label = (opts.error ? "✕ " : "") + msg;
    const r = opts.rect;
    const w = Math.min(360, Math.max(120, label.length * 6.4 + 40));
    const x = r ? Math.max(8, Math.min(innerWidth - w - 8, r.left)) : 16;
    const y = r ? (r.top > 40 ? r.top - 32 : Math.min(innerHeight - 32, r.bottom + 8)) : 16;
    const changed = chipMsg.textContent !== label;
    chipMsg.textContent = label;
    const wasOn = chip.__on;
    if (wasOn) slide(chip, x, y); else chip.style.translate = `${x}px ${y}px`;
    showEl(chip, "inline-flex", [{ opacity: 0, translate: `${x}px ${y + 6}px`, scale: ".96" }, { opacity: 1, translate: `${x}px ${y}px`, scale: "1" }]);
    if (wasOn && changed) fx(chipMsg, "t", [{ opacity: 0.3, translate: "0 3px" }, { opacity: 1, translate: "0 0" }], SPR.snap);
    setProgress(opts.progress);
    host.dataset.chip = msg;
  }
  function showRing(r, bleed = 0) {
    morph(ring, { left: r.left - bleed, top: r.top - bleed, width: r.width + bleed * 2, height: r.height + bleed * 2 });
    showEl(ring, "block", [{ opacity: 0 }, { opacity: 1 }]);
    return r;
  }
  const hideAll = (instant) => { hideEl(ring, OUT, instant); hideEl(chip, OUT, instant); delete host.dataset.chip; };

  /* ---------- state ---------- */
  let sticky = false, altDown = false, altUsed = false, altAt = 0, active = false, locked = null, busy = false;
  let mx = -1, my = -1, raf = 0, hover = null, recognition = null, listening = false;
  let drawing = null, suppressClick = false, crawlOn = false, moveAt = 0, labelKey = null;
  const state = (s) => { host.dataset.state = s; };
  state("idle");
  /** A lasso loop; shown from the moment the button goes down in pointer mode (Option held or armed). */
  const LASSO_CURSOR = `url("data:image/svg+xml;utf8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28"><ellipse cx="13" cy="11" rx="9" ry="6.5" fill="rgba(62,123,240,0.12)" stroke="#fff" stroke-width="3.4"/><ellipse cx="13" cy="11" rx="9" ry="6.5" fill="none" stroke="#3E7BF0" stroke-width="1.8"/><path d="M6.5 15.5c-1.6 2.2-1 4.6 1.2 5.6" fill="none" stroke="#fff" stroke-width="3.4" stroke-linecap="round"/><path d="M6.5 15.5c-1.6 2.2-1 4.6 1.2 5.6" fill="none" stroke="#3E7BF0" stroke-width="1.8" stroke-linecap="round"/></svg>')}") 13 11, crosshair`;
  let lassoStyle = null;
  const lassoCursor = (on) => {
    if (on && !lassoStyle) { lassoStyle = document.createElement("style"); lassoStyle.textContent = `html, html * { cursor: ${LASSO_CURSOR} !important; }`; document.documentElement.append(lassoStyle); }
    else if (!on && lassoStyle) { lassoStyle.remove(); lassoStyle = null; }
  };
  const editable = (el) => !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
  const pick = (x, y) => { const el = document.elementFromPoint(x, y); return el && el !== host ? el : null; };

  function refresh() {
    raf = 0;
    if (!active || locked || drawing) return;
    const el = mx >= 0 ? pick(mx, my) : null;
    hover = el ? detect(el) : null;
    if (hover) {
      const r = showRing(hover.el.getBoundingClientRect()); setChip(hover.label, { rect: r }); state("hover");
      // hover -> label latency: from the pointer move that led here to the label being painted.
      if (labelKey !== hover.el && moveAt) {
        const ms = performance.now() - moveAt; labelKey = hover.el;
        host.dataset.hoverMs = String(Math.round(ms));
        track("locate", "client:hover-label", ms, ms < 300 ? undefined : "over 300 ms budget");
      }
      moveAt = 0;
    } else {
      labelKey = null; moveAt = 0; hideEl(ring); if (sticky) setChip("Point at or circle a table, list, cards or chart"); else hideEl(chip); state("seeking"); }
  }
  const schedule = () => { if (!raf) raf = requestAnimationFrame(refresh); };

  function activate() {
    if (active) return;
    active = true;
    if (!host.isConnected) document.documentElement.append(host);
    schedule();
  }
  function deactivate() {
    if (drawing) endDraw(true);
    active = false; locked = null; hover = null; busy = false; crawlOn = false;
    hideEl(pill); hideAll(); hideEl(loopSvg); state("idle");
    stopListening();
    document.documentElement.style.removeProperty("cursor");
  }
  function release() { sticky = false; altDown = false; deactivate(); }

  /* ---------- circle drawing ---------- */
  function startDraw(e) {
    const p = { x: e.clientX, y: e.clientY };
    drawing = { id: e.pointerId, pts: [p], d: `M${p.x.toFixed(1)} ${p.y.toFixed(1)}`, c: p, dirty: true, preview: 0, last: p };
    altUsed = true; hover = null;
    hideEl(ring); hideEl(chip);
    state("drawing");
    lassoCursor(true);
    fx(loopSvg, "in", [{ opacity: 0 }, { opacity: 1 }], { duration: 120, easing: "ease-out" });
    loopSvg.__on = true; loopSvg.style.display = "block";
    try { document.documentElement.setPointerCapture(e.pointerId); } catch {}
    frameDraw();
  }
  function addPoint(x, y) {
    const dr = drawing; if (!dr) return;
    if (dist2(dr.last, { x, y }) < 6) return; // ~2.5px: drop jitter at the source
    const p = { x, y };
    dr.pts.push(p);
    const mid = { x: (dr.c.x + p.x) / 2, y: (dr.c.y + p.y) / 2 };
    dr.d += ` Q${dr.c.x.toFixed(1)} ${dr.c.y.toFixed(1)} ${mid.x.toFixed(1)} ${mid.y.toFixed(1)}`;
    dr.c = p; dr.last = p; dr.dirty = true;
  }
  function frameDraw() {
    const dr = drawing; if (!dr) return;
    if (dr.dirty) {
      dr.dirty = false;
      const open = `${dr.d} L${dr.c.x.toFixed(1)} ${dr.c.y.toFixed(1)}`;
      lpL.setAttribute("d", open); lpG1.setAttribute("d", open); lpG2.setAttribute("d", open); lpF.setAttribute("d", open + " Z");
      tip.setAttribute("cx", dr.c.x.toFixed(1)); tip.setAttribute("cy", dr.c.y.toFixed(1));
    }
    const now = performance.now();
    if (dr.pts.length > 8 && now - dr.preview > 180) {
      dr.preview = now;
      try { previewLoop(dr); } catch {}
    }
    requestAnimationFrame(frameDraw);
  }
  function previewLoop(dr) {
    const target = resolveCircle(simplify(dr.pts, 2.5));
    dr.target = target;
    if (target.el) { const r = showRing(target.el.getBoundingClientRect()); setChip(target.label, { rect: r }); }
    else { const b = target.box; const r = showRing(new DOMRect(b.x, b.y, b.w, b.h), 4); setChip(target.label, { rect: r }); }
  }
  /** Finish the stroke. `cancel` fades the loop out and does not lock anything. */
  function endDraw(cancel) {
    const dr = drawing; drawing = null;
    if (!dr) return;
    try { document.documentElement.releasePointerCapture(dr.id); } catch {}
    lassoCursor(false);
    const tiny = dr.pts.length < 6 || boxOf(dr.pts).w + boxOf(dr.pts).h < 40;
    if (cancel || tiny) { hideEl(loopSvg, { duration: 160, easing: "ease-out", fill: "forwards" }); if (!cancel) { suppressClick = false; state("seeking"); schedule(); } return; }
    suppressClick = true; setTimeout(() => { suppressClick = false; }, 80);
    // Close the loop visually, then let the stroke dissolve into the element it selected.
    const closed = `${dr.d} L${dr.c.x.toFixed(1)} ${dr.c.y.toFixed(1)} Z`;
    lpL.setAttribute("d", closed); lpG1.setAttribute("d", closed); lpG2.setAttribute("d", closed); lpF.setAttribute("d", closed);
    tip.setAttribute("cx", "-10");
    const target = resolveCircle(simplify(dr.pts, 2.5));
    hideEl(loopSvg, { duration: 420, easing: "cubic-bezier(.2,.7,.2,1)", fill: "forwards" });
    // Save the circled snippet to the tray first (host is hidden for two frames for a clean shot), then ask what to do with it.
    trayCapture(target).finally(() => { if (active && !locked) lock(target); });
  }
  addEventListener("pointerdown", (e) => {
    if (!active || locked || e.button !== 0 || !(altDown || sticky) || e.composedPath()[0] === host) return;
    e.preventDefault(); e.stopPropagation();
    startDraw(e);
  }, true);
  addEventListener("pointermove", (e) => {
    if (!drawing || e.pointerId !== drawing.id) return;
    e.preventDefault();
    const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
    for (const c of evs.length ? evs : [e]) addPoint(c.clientX, c.clientY);
  }, true);
  addEventListener("pointerup", (e) => { if (drawing && e.pointerId === drawing.id) { e.preventDefault(); e.stopPropagation(); endDraw(false); } }, true);
  addEventListener("pointercancel", () => { if (drawing) endDraw(true); }, true);
  for (const t of ["selectstart", "dragstart"]) addEventListener(t, (e) => { if (drawing) e.preventDefault(); }, true);

  /* ---------- input handlers (always on, cheap) ---------- */
  addEventListener("mousemove", (e) => { mx = e.clientX; my = e.clientY; if (!moveAt) moveAt = performance.now(); if (active && !locked && !drawing) schedule(); }, true);
  addEventListener("scroll", () => { if (active && !locked && !drawing) schedule(); }, true);
  addEventListener("blur", () => { if (altDown && !locked) { altDown = false; if (drawing) endDraw(true); if (!sticky) deactivate(); } });
  addEventListener("keydown", (e) => {
    if (locked) { if (e.key === "Escape" && !busy) release(); return; }
    if (e.key === "Alt" && !e.repeat && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
      if (editable(document.activeElement)) return;
      altDown = true; altUsed = false; altAt = Date.now(); activate();
      document.documentElement.style.cursor = "crosshair";
    } else if (e.key === "Escape" && active) { e.preventDefault(); release(); }
    else if (altDown && e.key !== "Alt") { altUsed = true; altDown = false; if (!sticky) deactivate(); }
  }, true);
  addEventListener("keyup", (e) => {
    if (e.key !== "Alt" || !altDown || locked) return;
    if (drawing) { altDown = false; return; } // finish the loop on pointer release
    const used = altUsed, long = Date.now() - altAt >= 200;
    altDown = false;
    if (!used && long && hover) lock(hover); else if (!sticky) deactivate();
  }, true);
  addEventListener("click", (e) => {
    if (suppressClick) { e.preventDefault(); e.stopPropagation(); return; }
    if (!active || locked) return;
    const el = pick(e.clientX, e.clientY), d = el && detect(el);
    if (!d) return;
    e.preventDefault(); e.stopPropagation();
    altDown = false;
    lock(d);
  }, true);

  /* ---------- the "Turn this into…" pill ---------- */
  const DEFAULT = "something I can track";
  const rectOf = (d) => (d.el ? d.el.getBoundingClientRect() : new DOMRect(d.box.x, d.box.y, d.box.w, d.box.h));
  function lock(d) {
    locked = d; busy = false; crawlOn = false;
    document.documentElement.style.removeProperty("cursor");
    d.snap = null;
    if (d.kind === "dom" && d.el) { try { d.snap = snapshot(d.el); host.dataset.nodes = String(d.snap.nodes); } catch { d.snap = null; } }
    const r = showRing(rectOf(d), d.el ? 0 : 4);
    setChip(d.label, { rect: r });
    state("asking");
    input.value = DEFAULT;
    pagesBtn.hidden = !(d.kind === "dom" && d.el && nextUrl(document, location.href, new Set([normUrl(location.href)])));
    pagesBtn.setAttribute("aria-pressed", "false");
    showEl(pill, "flex", [{ opacity: 0, translate: "0 12px", scale: ".98" }, { opacity: 1, translate: "0 0", scale: "1" }]);
    mic.hidden = !window.webkitSpeechRecognition;
    input.focus({ preventScroll: true }); input.select();
  }
  pagesBtn.addEventListener("click", () => { crawlOn = !crawlOn; pagesBtn.setAttribute("aria-pressed", String(crawlOn)); input.focus(); });
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
  /** Client stage timing: performance.measure plus a message to the background, which posts it to /api/traces. */
  function track(stage, provider, ms, error) {
    try { performance.measure(`create:${stage}:${provider}`, { start: performance.now() - ms, duration: ms }); } catch {}
    send({ type: "trace", stage, provider, ms, ok: !error || /budget/.test(error), ...(error ? { error } : {}) }).then((r) => { if (!r?.ok) console.info("Create: trace not recorded", r?.error); });
  }
  const frames = (n) => new Promise((r) => { const step = () => (n-- > 0 ? requestAnimationFrame(step) : r()); step(); });

  /** Tab screenshot crop of the target (the loop's bounding box for a region). */
  async function capture(d) {
    if (d.el && d.kind === "image") {
      const r0 = d.el.getBoundingClientRect();
      if (r0.top < 0 || r0.bottom > innerHeight) { d.el.scrollIntoView({ block: "center", inline: "nearest" }); await sleep(250); }
    }
    const r = rectOf(d);
    const x = Math.max(0, r.left), y = Math.max(0, r.top);
    const w = Math.min(innerWidth, r.right) - x, h = Math.min(innerHeight, r.bottom) - y;
    if (w < 8 || h < 8) return { ok: false, error: "That part is off screen" };
    host.style.visibility = "hidden";
    await frames(3);
    const res = await send({ type: "capture", rect: { x, y, w, h }, viewport: { w: innerWidth, h: innerHeight } });
    host.style.visibility = "";
    return res;
  }

  async function submit() {
    if (busy || !locked) return;
    busy = true;
    const d = locked, value = clean(input.value) || DEFAULT, t0 = performance.now();
    const instruction = `Turn this into ${value}`.slice(0, 1000);
    const wantAll = d.kind === "dom" && d.el && (crawlOn || WANT_ALL.test(value));
    stopListening();
    hideEl(pill);
    state("working");
    const r = rectOf(d);
    const fail = (msg) => {
      track("act", "client:command-done", performance.now() - t0, msg);
      busy = false; state("error");
      setChip(msg, { error: true, rect: r });
      showEl(pill, "flex"); input.focus();
    };
    const viaImage = async (label) => {
      setChip(label, { busy: true, rect: r });
      const cap = await capture(d);
      if (!cap.ok) return { error: cap.error || "Could not capture that" };
      const hint = clean((d.el && (d.el.getAttribute("alt") || d.el.getAttribute("aria-label"))) || document.title).slice(0, 500);
      // The DOM cannot say what is inside an image or a loop: ask /api/locate. A miss shows "Which one?", never a silent guess.
      const loc = await send({ type: "locate", image: cap.image, hint, utterance: value.slice(0, 1000), cursor: { x: Math.round(mx), y: Math.round(my) }, ...(d.el ? { dom: { tag: d.el.tagName.toLowerCase(), text: clean(d.el.textContent || "").slice(0, 2000), rect: { x: r.left, y: r.top, w: r.width, h: r.height }, selectorPath: JSON.stringify(pathOf(d.el)).slice(0, 1000), ancestors: containerAncestors(d.el) } } : {}) });
      if (loc.ok && loc.ask) return { error: `${loc.ask} Point closer or circle it.` };
      if (!loc.ok) console.info("Create: locate unavailable, reading the crop directly:", loc.error);
      const ex = await send({ type: "extract", image: cap.image, hint });
      if (!ex.ok) return { error: ex.error || "Could not read that" };
      const e = ex.entity;
      e.source = { ...e.source, url: location.href.slice(0, 2000), title: clean(document.title).slice(0, 300) };
      return { entity: e };
    };
    let entity = d.entity;
    if (d.kind === "image") {
      const got = await viaImage(d.loop ? "Reading region…" : "Reading chart…");
      if (got.error) return fail(got.error);
      entity = got.entity;
      setChip(`${d.loop ? "Region" : "Chart"} · ${plural(entity.rows?.length ?? 0, "row", "rows")}`, { busy: true, rect: r });
    } else if (wantAll) {
      setChip(`Page 1 of ${CRAWL_PAGES}…`, { busy: true, rect: r, progress: 0.05 });
      const res = await crawl(d, (p, t) => setChip(`Page ${p} of ${t}…`, { busy: true, rect: r, progress: (p - 1) / t }));
      entity = res.entity;
      setChip(res.pages > 1 ? `${describe(entity)} · ${plural(res.pages, "page", "pages")}` : "No more pages found", { busy: true, rect: r, progress: 1 });
      await sleep(450);
    } else {
      const noun = d.label.split(" ")[0].toLowerCase();
      setChip(`Reading ${noun}…`, { busy: true, rect: r });
      await sleep(250);
    }
    setChip("Building your app…", { busy: true, rect: r });
    const snap = d.snap && d.kind === "dom" && !wantAll ? d.snap : undefined;
    let lift = await send({ type: "lift", entity, instruction, snapshot: snap });
    if (!lift.ok && d.loop && d.kind === "dom") {
      // Structured data was rejected: fall back to reading the tab crop of the loop.
      const got = await viaImage("Reading a screenshot instead…");
      if (!got.error) { setChip("Building your app…", { busy: true, rect: r }); lift = await send({ type: "lift", entity: got.entity, instruction }); }
    }
    if (!lift.ok) return fail(lift.error || "Could not build that. Is Create running?");
    state("done");
    { const ms = performance.now() - t0; host.dataset.doneMs = String(Math.round(ms)); track("act", "client:command-done", ms); }
    setChip("Opened your app", { rect: r, progress: 1 });
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
