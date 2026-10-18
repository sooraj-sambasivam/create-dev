import {
  THUMB_MAX_BYTES,
  boundsOf,
  elementsInLoop,
  kindOf,
  lowestCommonContainer,
  pickStyles,
  sanitizeElementHtml,
  titleOf,
  type Pt,
  type SnipEl,
  type TrayPayload,
} from "./snippet";

/** Browser glue for lasso snippets: DOM -> payload, a small JPEG thumbnail, and the POST to /api/tray. */

const IGNORE = "[data-narrate-ignore],[data-tray-ignore]";
const abs = (u: string): string => { try { return new URL(u, location.href).href; } catch { return ""; } };

/** The payload for a loop drawn over the live document, or null when the loop encloses nothing usable. */
export function payloadFromLoop(poly: readonly Pt[], doc: Document = document): { payload: TrayPayload; container: HTMLElement } | null {
  const win = doc.defaultView;
  if (!win || !doc.body) return null;
  const inside = elementsInLoop(doc.body as unknown as SnipEl, poly, {
    vw: win.innerWidth,
    vh: win.innerHeight,
    skip: (el) => (el as unknown as Element).closest?.(IGNORE) != null,
  });
  const container = lowestCommonContainer(inside) as unknown as HTMLElement | null;
  if (!container || container === doc.body || container === doc.documentElement) return null;
  const snippetHtml = sanitizeElementHtml(container as unknown as SnipEl, undefined, abs);
  if (!snippetHtml) return null;
  const el = container as unknown as SnipEl;
  return {
    container,
    payload: {
      title: titleOf(el),
      kind: kindOf(el),
      snippetHtml,
      styles: pickStyles(win.getComputedStyle(container) as unknown as Record<string, unknown>),
      source: { app: "narrate", url: win.location.href.slice(0, 2000), title: doc.title.slice(0, 200) },
    },
  };
}

const COPY_STYLES = [
  "display", "position", "boxSizing", "width", "height", "minWidth", "minHeight", "maxWidth", "margin", "padding",
  "flexDirection", "flexWrap", "flexGrow", "flexShrink", "alignItems", "justifyContent", "gap", "gridTemplateColumns",
  "color", "backgroundColor", "fontFamily", "fontSize", "fontWeight", "lineHeight", "letterSpacing", "textAlign",
  "textDecoration", "whiteSpace", "overflow", "opacity", "borderRadius", "borderTopWidth", "borderTopStyle", "borderTopColor",
  "borderRightWidth", "borderRightStyle", "borderRightColor", "borderBottomWidth", "borderBottomStyle", "borderBottomColor",
  "borderLeftWidth", "borderLeftStyle", "borderLeftColor", "boxShadow", "verticalAlign", "objectFit",
] as const;

function inlineClone(src: Element, depth = 0, budget = { n: 400 }): Element | null {
  if (budget.n-- <= 0 || depth > 20) return null;
  const tag = src.tagName.toLowerCase();
  if (["script", "style", "iframe", "canvas", "video", "audio", "object", "embed", "svg"].includes(tag)) return null;
  const copy = src.ownerDocument.createElementNS("http://www.w3.org/1999/xhtml", tag);
  const cs = src.ownerDocument.defaultView!.getComputedStyle(src);
  let css = "";
  for (const p of COPY_STYLES) {
    const v = (cs as unknown as Record<string, string>)[p];
    if (v) css += `${p.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase())}:${v};`;
  }
  if (tag === "img") css += "background:#d9d9d9;";
  copy.setAttribute("style", css);
  for (const n of Array.from(src.childNodes)) {
    if (n.nodeType === 3) copy.appendChild(src.ownerDocument.createTextNode(n.nodeValue ?? ""));
    else if (n.nodeType === 1) {
      const c = inlineClone(n as Element, depth + 1, budget);
      if (c) copy.appendChild(c);
    }
  }
  return copy;
}

function backdrop(el: Element): string {
  for (let n: Element | null = el; n; n = n.parentElement) {
    const c = getComputedStyle(n).backgroundColor;
    if (c && c !== "rgba(0, 0, 0, 0)" && c !== "transparent") return c;
  }
  return "#ffffff";
}

const approxBytes = (dataUrl: string) => Math.floor(((dataUrl.length - dataUrl.indexOf(",") - 1) * 3) / 4);

/** Renders the element to a small JPEG data URL (<= 60 KB) via an SVG foreignObject. Undefined when the browser refuses. */
export async function renderThumbnail(el: HTMLElement, loop?: { l: number; t: number; r: number; b: number }): Promise<string | undefined> {
  try {
    const r = el.getBoundingClientRect();
    const w = Math.max(1, Math.min(1400, Math.round(r.width)));
    const h = Math.max(1, Math.min(1000, Math.round(r.height)));
    const clone = inlineClone(el);
    if (!clone) return undefined;
    (clone as HTMLElement).style.cssText += `;margin:0;width:${w}px;height:${h}px;overflow:hidden;`;
    const xml = new XMLSerializer().serializeToString(clone);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><foreignObject width="100%" height="100%">${xml}</foreignObject></svg>`;
    const img = new Image();
    await new Promise<void>((res, rej) => {
      const t = setTimeout(() => rej(new Error("thumbnail timeout")), 2000);
      img.onload = () => { clearTimeout(t); res(); };
      img.onerror = () => { clearTimeout(t); rej(new Error("thumbnail render failed")); };
      img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
    });
    const bg = backdrop(el);
    // Crop to where the loop was (clipped to the element), so the card shows what was circled, not the whole container.
    let sx = 0, sy = 0, sw = w, sh = h;
    if (loop) {
      const l = Math.max(0, loop.l - r.left), t = Math.max(0, loop.t - r.top);
      const rr = Math.min(w, loop.r - r.left), bb = Math.min(h, loop.b - r.top);
      if (rr - l >= 24 && bb - t >= 24) { sx = l; sy = t; sw = rr - l; sh = bb - t; }
    }
    for (const maxW of [420, 320, 240, 160]) {
      const k = Math.min(1, maxW / sw, (maxW * 0.7) / sh);
      const cw = Math.max(1, Math.round(sw * k)), ch = Math.max(1, Math.round(sh * k));
      const canvas = document.createElement("canvas");
      canvas.width = cw; canvas.height = ch;
      const ctx = canvas.getContext("2d");
      if (!ctx) return undefined;
      ctx.fillStyle = bg; ctx.fillRect(0, 0, cw, ch);
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, cw, ch);
      for (const q of [0.82, 0.66, 0.5]) {
        const url = canvas.toDataURL("image/jpeg", q);
        if (url.startsWith("data:image/jpeg") && approxBytes(url) <= THUMB_MAX_BYTES) return url;
      }
    }
  } catch {
    /* tainted canvas / unsupported: the card falls back to its kind icon */
  }
  return undefined;
}

export const TRAY_CHANGED = "create:tray-changed";

export async function postTray(payload: TrayPayload): Promise<boolean> {
  try {
    const r = await fetch("/api/tray", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    if (r.ok) window.dispatchEvent(new Event(TRAY_CHANGED));
    return r.ok;
  } catch {
    return false;
  }
}

/** Loop released: build the payload, render the thumbnail, send it. Resolves to the title kept, or null. */
export async function captureLoopToTray(poly: readonly Pt[]): Promise<string | null> {
  const got = payloadFromLoop(poly);
  if (!got) return null;
  const b = boundsOf(poly);
  const thumbnail = await renderThumbnail(got.container, b);
  const ok = await postTray({ ...got.payload, ...(thumbnail ? { thumbnail } : {}) });
  return ok ? got.payload.title : null;
}
