// Shared capture helpers for corpus collection (web + rendered-fixture targets).
import { mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { screenshot, sleep } from "./cdp.mjs";

export const CORPUS = join(dirname(fileURLToPath(import.meta.url)), "../corpus");
export const VIEW = { w: 1440, h: 900 };

const hash = (s) => { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967295; };
export const jitter = (id, salt) => 0.4 + 0.2 * hash(id + salt); // deterministic cursor offset 40-60% into the box

// In-page element picker. spec: {sel, text, re, nth, within, closest, parent}
export const PICK_JS = `(spec,doc)=>{doc=doc||document;
  const vis=e=>{const r=e.getBoundingClientRect();const cs=e.ownerDocument.defaultView.getComputedStyle(e);return r.width>2&&r.height>2&&cs.visibility!=='hidden'&&cs.display!=='none'};
  const roots=spec.within?[...doc.querySelectorAll(spec.within)]:[doc];
  let cands=[];
  for(const root of roots){
    let list=spec.sel?[...root.querySelectorAll(spec.sel)]:[...root.querySelectorAll('*')];
    if(spec.text||spec.re){
      const re=spec.re?new RegExp(spec.re,spec.flags||''):null;
      const ok=e=>{const t=(e.innerText||e.getAttribute('aria-label')||e.alt||'').trim().replace(/\\s+/g,' ');return re?re.test(t):t===spec.text};
      list=list.filter(e=>vis(e)&&ok(e));
      // keep deepest (no matching descendant)
      list=list.filter(e=>![...e.children].some(c=>list.includes(c)));
    } else list=list.filter(vis);
    cands.push(...list);
  }
  let el=cands[spec.nth||0];
  if(el&&spec.closest) el=el.closest(spec.closest)||el;
  if(el&&spec.parent) for(let i=0;i<spec.parent;i++) el=el.parentElement||el;
  return el||null;
}`;

export async function pickAndMeasure(b, spec, scrollBlock = "center") {
  // returns viewport rect after scrolling the element into view (supports one iframe level via spec.frame)
  const js = `(()=>{const pick=${PICK_JS};
    const fr=${JSON.stringify(spec.frame || null)}?document.querySelector(${JSON.stringify(spec.frame || "x")}):null;
    const doc=fr?fr.contentDocument:document;
    const el=pick(${JSON.stringify(spec)},doc);if(!el)return null;
    if(!${JSON.stringify(spec.noScroll || false)}) el.scrollIntoView({block:${JSON.stringify(scrollBlock)},inline:'nearest'});
    window.__ptrEl=el;window.__ptrFr=fr;return true})()`;
  if (!(await b.ev(js))) return null;
  await sleep(700);
  return await b.ev(`(()=>{const el=window.__ptrEl,fr=window.__ptrFr;const r=el.getBoundingClientRect();const o=fr?fr.getBoundingClientRect():{x:0,y:0};return {x:r.x+o.x,y:r.y+o.y,w:r.width,h:r.height,tag:el.tagName,sy:scrollY,sx:scrollX}})()`);
}

const clip = (r) => {
  const x0 = Math.max(0, r.x), y0 = Math.max(0, r.y), x1 = Math.min(VIEW.w, r.x + r.w), y1 = Math.min(VIEW.h, r.y + r.h);
  return { x: Math.round(x0), y: Math.round(y0), w: Math.max(0, Math.round(x1 - x0)), h: Math.max(0, Math.round(y1 - y0)) };
};
export { clip };

const AX_KEEP = new Set(["cell", "gridcell", "columnheader", "rowheader", "row", "table", "grid", "button", "link", "image", "img", "heading", "tab", "tablist", "checkbox", "textbox", "combobox", "figure", "graphics-document", "graphics-object", "listitem", "list", "StaticText", "paragraph", "RootWebArea", "main", "navigation", "banner", "switch", "menuitem", "radio", "group", "region", "article", "Iframe", "LabelText"]);

/** Accessibility tree (CDP) -> AxNode-shaped flat children near the cursor, frames in viewport CSS px. */
export async function axNearCursor(b, cursor, title) {
  let nodes;
  try { nodes = (await b.send("Accessibility.getFullAXTree")).nodes; } catch { return null; }
  const cand = nodes.filter((n) => !n.ignored && n.backendDOMNodeId && AX_KEEP.has(n.role?.value) && n.role.value !== "StaticText" && n.role.value !== "RootWebArea");
  const out = [];
  await Promise.all(cand.slice(0, 1500).map(async (n) => {
    try {
      const { model } = await b.send("DOM.getBoxModel", { backendNodeId: n.backendDOMNodeId }, 8000);
      const q = model.border; const xs = [q[0], q[2], q[4], q[6]], ys = [q[1], q[3], q[5], q[7]];
      const x = Math.min(...xs), y = Math.min(...ys), w = Math.max(...xs) - x, h = Math.max(...ys) - y;
      if (w < 2 || h < 2 || x + w < 0 || y + h < 0 || x > VIEW.w || y > VIEW.h) return;
      const props = {}; for (const p of n.properties || []) props[p.name] = p.value?.value;
      out.push({ role: n.role.value, title: String(n.name?.value || "").slice(0, 200) || undefined, value: n.value?.value != null ? String(n.value.value).slice(0, 200) : undefined, frame: { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) } });
    } catch {}
  }));
  const d = (n) => { const cx = n.frame.x + n.frame.w / 2, cy = n.frame.y + n.frame.h / 2; return Math.hypot(cx - cursor.x, cy - cursor.y); };
  // nodes containing the cursor first (innermost first), then nearest
  const contains = (n) => cursor.x >= n.frame.x && cursor.x <= n.frame.x + n.frame.w && cursor.y >= n.frame.y && cursor.y <= n.frame.y + n.frame.h;
  out.sort((a, c) => (contains(c) - contains(a)) || (contains(a) && contains(c) ? a.frame.w * a.frame.h - c.frame.w * c.frame.h : d(a) - d(c)));
  return { role: "AXWebArea", title, frame: { x: 0, y: 0, w: VIEW.w, h: VIEW.h }, children: out.slice(0, 50), _meta: { source: "CDP Accessibility.getFullAXTree + DOM.getBoxModel", totalNodesInViewport: out.length } };
}

/** DomInfo for the element under the cursor plus a trimmed snapshot of its table/figure/section container. */
export async function domAtCursor(b, cursor) {
  return await b.ev(`(()=>{
    window.__off=null;let e=document.elementFromPoint(${cursor.x},${cursor.y}); if(!e) return null;
    if(e.tagName==='IFRAME'){ try{ const d=e.contentDocument; const r=e.getBoundingClientRect(); const e2=d.elementFromPoint(${cursor.x}-r.x,${cursor.y}-r.y); if(e2){ e=e2; window.__off={x:r.x,y:r.y}; } }catch{} }
    const path=el=>{const p=[];while(el&&el.nodeType===1&&p.length<8){let s=el.tagName.toLowerCase();if(el.id)s+='#'+el.id;else if(el.classList.length)s+='.'+[...el.classList].slice(0,2).join('.');p.unshift(s);el=el.parentElement}return p.join(' > ')};
    const r0=e.getBoundingClientRect();const o=(e.ownerDocument!==document&&window.__off)||{x:0,y:0};const r={x:r0.x+o.x,y:r0.y+o.y,width:r0.width,height:r0.height};
    const cont=e.closest('table,figure,[role=table],[role=grid],section,main')||e.parentElement||e;
    const clean=cont.cloneNode(true);clean.querySelectorAll('script,style,svg path,noscript').forEach(n=>n.remove());
    let snap=clean.outerHTML.replace(/\\s+/g,' ');if(snap.length>50000)snap=snap.slice(0,50000);
    return {tag:e.tagName.toLowerCase(),text:(e.innerText||e.alt||'').trim().slice(0,2000),rect:{x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)},selectorPath:path(e).slice(0,900),tableLike:!!e.closest('table,[role=table],[role=grid],[role=row]'),snapshot:snap};
  })()`);
}

export async function saveTarget(b, t, rect, extra = {}) {
  const dir = join(CORPUS, t.id); mkdirSync(dir, { recursive: true });
  const box = clip(rect);
  const clipped = box.w < Math.round(rect.w) - 1 || box.h < Math.round(rect.h) - 1;
  if (box.w < 8 || box.h < 8) throw new Error(`target ${t.id} not visible in viewport (box ${JSON.stringify(box)})`);
  const cursor = { x: Math.round(box.x + box.w * jitter(t.id, "x")), y: Math.round(box.y + box.h * jitter(t.id, "y")) };
  await screenshot(b, join(dir, "shot.png"));
  execFileSync("sips", ["-Z", "1568", join(dir, "shot.png"), "--out", join(dir, "shot_small.png")], { stdio: "ignore" });
  // full-page capture (capped), downscaled copy for Jev's 1568px limit
  try {
    const dims = await b.ev("({w:Math.max(document.documentElement.scrollWidth,innerWidth),h:Math.max(document.documentElement.scrollHeight,innerHeight)})");
    const H = Math.min(dims.h, 2400);
    const r = await b.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true, clip: { x: 0, y: 0, width: VIEW.w, height: H, scale: 1 } });
    writeFileSync(join(dir, "full.png"), Buffer.from(r.data, "base64"));
    execFileSync("sips", ["-Z", "1568", join(dir, "full.png"), "--out", join(dir, "full_small.png")], { stdio: "ignore" });
    extra.fullPage = { pageHeight: dims.h, capturedHeight: H, note: "full.png is the top of the page capped at 2400px; the target may be below the crop (see boxPage)" };
  } catch (e) { extra.fullPage = { error: String(e.message || e) }; }
  const dom = await domAtCursor(b, cursor).catch(() => null);
  if (dom) writeFileSync(join(dir, "dom.json"), JSON.stringify(dom, null, 1));
  const ax = await axNearCursor(b, cursor, t.label).catch(() => null);
  if (ax && ax.children.length) writeFileSync(join(dir, "ax.json"), JSON.stringify(ax, null, 1));
  const meta = {
    id: t.id, app: t.app, kind: t.kind, label: t.label, utterance: t.utterance,
    url: t.url, groundTruth: t.groundTruth || "dom-rect",
    viewport: { w: VIEW.w, h: VIEW.h, dpr: 1 }, imageSize: { w: VIEW.w, h: VIEW.h },
    box, boxClipped: clipped, cursor, collectedAt: new Date().toISOString(),
    boxPage: { x: box.x + Math.round(rect.sx || 0), y: box.y + Math.round(rect.sy || 0), w: box.w, h: box.h },
    files: { shot: "shot.png", shotSmall: "shot_small.png", dom: dom ? "dom.json" : null, ax: ax && ax.children.length ? "ax.json" : null },
    ...extra,
  };
  writeFileSync(join(dir, "target.json"), JSON.stringify(meta, null, 1));
  return meta;
}

// overlay for human verification (not stored in the corpus)
export async function overlayCheck(b, box, cursor, file) {
  await b.ev(`(()=>{const d=document.createElement('div');d.id='__ov';d.style.cssText='position:fixed;left:${box.x}px;top:${box.y}px;width:${box.w}px;height:${box.h}px;outline:3px solid #e0115f;z-index:2147483647;pointer-events:none';document.body.appendChild(d);const c=document.createElement('div');c.id='__oc';c.style.cssText='position:fixed;left:${cursor.x - 6}px;top:${cursor.y - 6}px;width:12px;height:12px;border-radius:50%;background:#0a0;z-index:2147483647;pointer-events:none';document.body.appendChild(c)})()`);
  await screenshot(b, file);
  await b.ev("document.getElementById('__ov')?.remove();document.getElementById('__oc')?.remove()");
}
