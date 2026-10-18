/**
 * "Seen on this page": the things the pointer can bind to, derived from the page's own nodes
 * (the Screen tree), not from pixels. Tables, prices, images and headings, in page order.
 */

export type EntityKind = "table" | "price" | "image" | "heading";

export type Entity = { id: string; kind: EntityKind; noun: string; detail: string };

export const ENTITY_NOUN: Record<EntityKind, string> = { table: "Table", price: "Price", image: "Image", heading: "Heading" };

type Node = { id?: string; type?: string; children?: unknown; [k: string]: unknown };

const PRICE_RE = /(?:[$€£¥]\s?\d[\d,]*(?:\.\d{1,2})?|\b\d[\d,]*(?:\.\d{1,2})?\s?(?:USD|EUR|GBP|JPY)\b)/;

const str = (v: unknown): string => (typeof v === "string" ? v : "");
const snip = (s: string, max = 32) => {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > max ? t.slice(0, max - 1) + "…" : t;
};

/** The first price in a string ("Only $12.50 today" gives "$12.50"), or null. */
export function findPrice(text: string): string | null {
  const m = PRICE_RE.exec(text);
  return m ? m[0].trim() : null;
}

const MAX_ENTITIES = 40;

/**
 * Walks the tree depth-first and returns every table, price, image and heading with an id.
 * A node counts once, so a heading that holds a price stays a heading. Capped so a huge page stays a short list.
 */
export function deriveEntities(nodes: readonly unknown[] | null | undefined, max = MAX_ENTITIES): Entity[] {
  const out: Entity[] = [];
  const visit = (list: readonly unknown[] | null | undefined) => {
    for (const raw of list ?? []) {
      if (out.length >= max) return;
      const n = raw as Node;
      if (!n || typeof n !== "object") continue;
      const id = str(n.id);
      if (id) {
        const e = classify(n, id);
        if (e) out.push(e);
      }
      if (Array.isArray(n.children)) visit(n.children);
    }
  };
  visit(nodes);
  return out;
}

function classify(n: Node, id: string): Entity | null {
  switch (n.type) {
    case "table": {
      const cols = Array.isArray(n.columns) ? n.columns.length : 0;
      const rows = Array.isArray(n.rows) ? n.rows.length : 0;
      return { id, kind: "table", noun: ENTITY_NOUN.table, detail: `${rows} ${rows === 1 ? "row" : "rows"} × ${cols} ${cols === 1 ? "col" : "cols"}` };
    }
    case "image": {
      const alt = snip(str(n.alt) || str(n.query));
      return { id, kind: "image", noun: ENTITY_NOUN.image, detail: alt };
    }
    case "heading":
      return { id, kind: "heading", noun: ENTITY_NOUN.heading, detail: snip(str(n.text)) };
    case "data": {
      // A live value formatted as money is a price even before it has loaded.
      if (n.format === "currency") return { id, kind: "price", noun: ENTITY_NOUN.price, detail: snip(str(n.label)) || "Live value" };
      return null;
    }
    case "text":
    case "badge":
    case "button": {
      const p = findPrice(str(n.text) || str(n.label));
      return p ? { id, kind: "price", noun: ENTITY_NOUN.price, detail: p } : null;
    }
    default:
      return null;
  }
}

/** Entities grouped by kind, in a stable display order, for the list. */
export function groupEntities(list: readonly Entity[]): { kind: EntityKind; items: Entity[] }[] {
  const order: EntityKind[] = ["table", "price", "image", "heading"];
  return order.map((kind) => ({ kind, items: list.filter((e) => e.kind === kind) })).filter((g) => g.items.length > 0);
}

/** The line for an entity row: "Table · 12 rows × 4 cols". */
export const entityLine = (e: Entity): string => (e.detail ? `${e.noun} · ${e.detail}` : e.noun);
