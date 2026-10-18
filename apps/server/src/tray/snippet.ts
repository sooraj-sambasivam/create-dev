import { TRAY_HTML_MAX } from "@create/shared";
import type { Snapshot, SnapshotNode } from "../importElement/convert";

/**
 * Server-side snippet hygiene. The clients (Narrate, the extension) sanitize before sending, but nothing from a
 * client is trusted: the HTML is re-parsed here against an allow-list, so stored and re-served markup is always safe.
 * The parser is deliberately small: it only needs to understand markup our own capture produced.
 */

export type HNode = { tag: string; attrs: Record<string, string>; children: Array<HNode | string> };

const ALLOWED_TAGS = new Set([
  "div", "span", "p", "a", "ul", "ol", "li", "table", "thead", "tbody", "tfoot", "tr", "td", "th", "caption",
  "h1", "h2", "h3", "h4", "h5", "h6", "img", "button", "section", "article", "header", "footer", "nav", "main",
  "aside", "figure", "figcaption", "strong", "em", "b", "i", "u", "small", "code", "pre", "blockquote", "br", "hr",
  "label", "time", "dl", "dt", "dd", "cite",
]);
/** Dropped together with everything inside them. */
const DROP_WITH_CONTENT = new Set(["script", "style", "iframe", "object", "embed", "noscript", "template", "svg", "math", "head", "title", "textarea", "select", "form"]);
const VOID = new Set(["br", "hr", "img", "input", "meta", "link", "source", "wbr", "area", "base", "col", "param", "track"]);
const ALLOWED_ATTRS = new Set(["class", "id", "href", "src", "alt", "title", "role", "aria-label", "aria-current", "colspan", "rowspan", "datetime", "lang", "data-testid", "name", "type", "placeholder"]);
const MAX_DEPTH = 40;
const MAX_NODES = 1500;
const MAX_ATTR = 500;

const SAFE_HREF = /^(https?:\/\/[^\s"'<>]+|mailto:[^\s"'<>]+|tel:[+\d\s()-]+|#[\w-]*|\/[^\s"'<>]*)$/i;
const SAFE_SRC = /^(https?:\/\/[^\s"'<>]+|data:image\/(?:png|jpeg|gif|webp);base64,[A-Za-z0-9+/]+=*)$/i;

function cleanAttr(name: string, raw: string): string | null {
  if (!ALLOWED_ATTRS.has(name) || name.startsWith("on")) return null;
  // Strip control characters and whitespace tricks ("java\tscript:") before testing the scheme.
  const v = raw.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, MAX_ATTR);
  if (name === "href") return SAFE_HREF.test(v) ? v : null;
  if (name === "src") return SAFE_SRC.test(v) ? v : null;
  return v;
}

const ENTITIES: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&nbsp;": " " };
const decode = (s: string) => s.replace(/&(?:amp|lt|gt|quot|nbsp|#39);/g, (m) => ENTITIES[m] ?? m);
export const escText = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escAttr = (s: string) => escText(s).replace(/"/g, "&quot;");

/** Parses (and filters) markup into a tree. Unknown tags are unwrapped, dangerous ones dropped with their content. */
export function parseSnippet(html: string): HNode {
  const root: HNode = { tag: "#root", attrs: {}, children: [] };
  const stack: HNode[] = [root];
  const top = () => stack[stack.length - 1]!;
  const src = String(html ?? "");
  let i = 0;
  let nodes = 0;
  let skipUntil: string | null = null; // dropping content of a dangerous element
  let skipDepth = 0;
  const TAG = /^<(\/?)([a-zA-Z][a-zA-Z0-9:-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/;
  const ATTR = /([^\s"'<>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

  while (i < src.length && nodes < MAX_NODES) {
    const lt = src.indexOf("<", i);
    if (lt === -1) { if (!skipUntil) pushText(src.slice(i)); break; }
    if (lt > i && !skipUntil) pushText(src.slice(i, lt));
    i = lt;
    if (src.startsWith("<!--", i)) { const e = src.indexOf("-->", i + 4); i = e === -1 ? src.length : e + 3; continue; }
    if (src[i + 1] === "!" || src[i + 1] === "?") { const e = src.indexOf(">", i); i = e === -1 ? src.length : e + 1; continue; }
    const m = TAG.exec(src.slice(i, i + 4000));
    if (!m) { if (!skipUntil) pushText("<"); i += 1; continue; }
    i += m[0].length;
    const closing = m[1] === "/";
    const tag = m[2]!.toLowerCase();
    if (skipUntil) {
      if (tag === skipUntil) {
        if (closing) { if (--skipDepth === 0) skipUntil = null; }
        else if (!VOID.has(tag) && !m[3]!.trimEnd().endsWith("/")) skipDepth++;
      }
      continue;
    }
    if (closing) {
      for (let k = stack.length - 1; k > 0; k--) {
        if (stack[k]!.tag === tag) { stack.length = k; break; }
      }
      continue;
    }
    if (DROP_WITH_CONTENT.has(tag)) {
      if (!VOID.has(tag) && !m[3]!.trimEnd().endsWith("/")) { skipUntil = tag; skipDepth = 1; }
      continue;
    }
    if (!ALLOWED_TAGS.has(tag)) continue; // unwrap: children attach to the parent
    const attrs: Record<string, string> = {};
    for (const a of m[3]!.matchAll(ATTR)) {
      const name = a[1]!.toLowerCase();
      const val = cleanAttr(name, decode(a[2] ?? a[3] ?? a[4] ?? ""));
      if (val !== null && val !== "" && !(name in attrs)) attrs[name] = val;
    }
    if (tag === "img" && !attrs.src) continue; // an image with nothing safe to show
    const node: HNode = { tag, attrs, children: [] };
    nodes++;
    top().children.push(node);
    if (!VOID.has(tag) && !m[3]!.trimEnd().endsWith("/") && stack.length < MAX_DEPTH) stack.push(node);
  }
  return root;

  function pushText(t: string) {
    const text = decode(t);
    if (text.trim() === "" && !text.includes(" ")) return;
    const p = top();
    const last = p.children[p.children.length - 1];
    if (typeof last === "string") p.children[p.children.length - 1] = last + text;
    else p.children.push(text);
  }
}

function serialize(n: HNode | string, out: string[]): void {
  if (typeof n === "string") { out.push(escText(n)); return; }
  if (n.tag !== "#root") {
    const attrs = Object.entries(n.attrs).map(([k, v]) => ` ${k}="${escAttr(v)}"`).join("");
    const rel = n.tag === "a" && n.attrs.href ? ' rel="noopener noreferrer"' : "";
    out.push(`<${n.tag}${attrs}${rel}>`);
    if (VOID.has(n.tag)) return;
  }
  for (const c of n.children) serialize(c, out);
  if (n.tag !== "#root") out.push(`</${n.tag}>`);
}

/** Allow-listed, re-serialised, balanced markup of at most `max` characters. */
export function sanitizeSnippetHtml(html: string, max = TRAY_HTML_MAX): string {
  const tree = parseSnippet(html);
  let out: string[] = [];
  serialize(tree, out);
  let s = out.join("");
  if (s.length <= max) return s;
  // Over the cap: drop trailing siblings until it fits, so the markup stays balanced.
  const cut = (n: HNode): void => {
    for (let guard = 0; guard < 5000; guard++) {
      out = []; serialize(tree, out);
      s = out.join("");
      if (s.length <= max) return;
      let p: HNode = n;
      while (true) {
        const last = p.children[p.children.length - 1];
        if (last && typeof last !== "string" && last.children.length) p = last; else break;
      }
      p.children.pop();
      if (!tree.children.length) return;
      // Prune emptied containers.
      const prune = (x: HNode): void => {
        for (const c of x.children) if (typeof c !== "string") prune(c);
        x.children = x.children.filter((c) => typeof c === "string" || c.children.length > 0 || VOID.has(c.tag));
      };
      prune(tree);
    }
  };
  cut(tree);
  return s.length <= max ? s : "";
}

const STYLE_KEYS = ["display", "flexDirection", "color", "backgroundColor", "fontSize", "fontWeight", "textAlign"] as const;

/** A markup snippet to the snapshot shape /api/import-element understands. */
export function snippetToSnapshot(html: string, styles: Record<string, string> = {}, title?: string, url?: string): Snapshot {
  const tree = parseSnippet(sanitizeSnippetHtml(html));
  const conv = (n: HNode): SnapshotNode => {
    const node: SnapshotNode = { tag: n.tag };
    const own = n.children.filter((c): c is string => typeof c === "string").join(" ").replace(/\s+/g, " ").trim();
    if (own) node.text = own.slice(0, 1200);
    if (n.attrs.src) node.src = n.attrs.src;
    if (n.attrs.alt) node.alt = n.attrs.alt;
    if (n.attrs.href) node.href = n.attrs.href;
    const kids = n.children.filter((c): c is HNode => typeof c !== "string").map(conv);
    if (kids.length) node.children = kids;
    return node;
  };
  const kids = tree.children.filter((c): c is HNode => typeof c !== "string");
  const root: SnapshotNode = kids.length === 1 ? conv(kids[0]!) : { tag: "div", children: kids.map(conv) };
  const style: Record<string, string> = {};
  for (const k of STYLE_KEYS) if (styles[k]) style[k] = styles[k]!;
  if (Object.keys(style).length) root.style = { ...root.style, ...style };
  return { title, url, root };
}
