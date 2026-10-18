import type { Node, Screen } from "@create/shared";

/** Rough rendered height in page units (width 1200); enough to map a canvas y to a section. */
export function estimateHeight(n: Node): number {
  switch (n.type) {
    case "heading": return n.level === 1 ? 90 : n.level === 2 ? 64 : 44;
    case "text": return 56;
    case "button": case "link": case "badge": case "checkbox": return 48;
    case "textbox": return n.multiline ? 120 : 72;
    case "select": return 72;
    case "icon": return 48;
    case "avatar": return 64;
    case "image": return n.size === "logo" ? 40 : n.size === "small" ? 96 : n.size === "medium" ? 200 : 420;
    case "video": case "map": return 420;
    case "list": return 28 * Math.max(1, n.items.length) + 16;
    case "rating": return 32;
    case "table": return 48 * (n.rows.length + 1);
    case "accordion": return 64 * Math.max(1, n.items.length);
    case "divider": return 24;
    case "spacer": return { sm: 16, md: 32, lg: 64, xl: 96 }[n.size];
    case "container": {
      const pad = { none: 0, sm: 16, md: 32, lg: 56, xl: 80 }[n.padding] * 2;
      const gap = { none: 0, sm: 8, md: 16, lg: 32 }[n.gap];
      const hs = n.children.map(estimateHeight);
      if (hs.length === 0) return pad + 40;
      const inner = n.direction === "row" && !n.wrap ? Math.max(...hs) : hs.reduce((a, b) => a + b, 0) + gap * (hs.length - 1);
      return pad + inner;
    }
  }
}

/** Top-level insert index whose section contains (or follows) page y. */
export function indexForY(screen: Screen | null, y: number): number {
  const children = screen?.children ?? [];
  let top = 0;
  for (let i = 0; i < children.length; i++) {
    const h = estimateHeight(children[i]!);
    if (y < top + h / 2) return i;
    top += h;
  }
  return children.length;
}

function label(n: Node): string {
  switch (n.type) {
    case "heading": case "text": case "badge": case "link": return n.text;
    case "button": case "checkbox": case "textbox": case "select": return n.label;
    case "image": return n.alt;
    case "avatar": return n.name;
    case "list": return n.items.slice(0, 3).join(" | ");
    default: return "";
  }
}

/** Compact, line-per-node outline: id, type, text and estimated y range. Capped to keep prompts small. */
export function outlineScreen(screen: Screen | null, maxLines = 120): string {
  if (!screen) return "(empty page)";
  const lines: string[] = [`page "${screen.title}" theme=${screen.theme}`];
  let top = 0;
  const visit = (nodes: Node[], depth: number, y0: number) => {
    let y = y0;
    for (const n of nodes) {
      const h = estimateHeight(n);
      if (lines.length < maxLines) {
        const t = label(n).replace(/\s+/g, " ").slice(0, 60);
        lines.push(`${"  ".repeat(depth)}${n.id} [${n.type}]${t ? ` "${t}"` : ""} y~${Math.round(y)}-${Math.round(y + h)}`);
      }
      if (n.type === "container") visit(n.children, depth + 1, y);
      y += h;
    }
    return y;
  };
  top = visit(screen.children, 0, top);
  if (lines.length >= maxLines) lines.push("... (truncated)");
  return lines.join("\n");
}
