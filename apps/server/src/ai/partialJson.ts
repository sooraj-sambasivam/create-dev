/**
 * Tolerant parser for an INCOMPLETE JSON document (the accumulated input_json_delta text of a
 * tool call). Pure function, no dependencies.
 *
 * parsePartialJson returns what has been fully received: truncated strings, numbers and
 * literals are dropped, and a container cut off mid-way is returned with its complete members
 * only and recorded in `incomplete`, so callers can tell finished elements from in-progress ones.
 */

export interface PartialParse {
  value: unknown;
  /** Objects/arrays that were cut off before their closing bracket. */
  incomplete: WeakSet<object>;
}

const MISSING = Symbol("missing");
type Parsed = unknown | typeof MISSING;

export function parsePartialJson(text: string): PartialParse {
  const incomplete = new WeakSet<object>();
  let i = 0;

  const skipWs = () => {
    while (i < text.length && (text[i] === " " || text[i] === "\n" || text[i] === "\r" || text[i] === "\t")) i++;
  };

  /** Parse a string starting at the opening quote. MISSING when the closing quote hasn't arrived. */
  const parseString = (): Parsed => {
    const start = i;
    i++;
    while (i < text.length) {
      const c = text[i];
      if (c === "\\") {
        i += 2;
        continue;
      }
      if (c === '"') {
        i++;
        try {
          return JSON.parse(text.slice(start, i)) as string;
        } catch {
          return MISSING;
        }
      }
      i++;
    }
    i = text.length;
    return MISSING;
  };

  const parseValue = (): Parsed => {
    skipWs();
    if (i >= text.length) return MISSING;
    const c = text[i];
    if (c === '"') return parseString();
    if (c === "{") return parseObject();
    if (c === "[") return parseArray();
    // number / true / false / null: complete only when followed by a delimiter.
    const start = i;
    while (i < text.length && !/[\s,\]}]/.test(text[i]!)) i++;
    if (i >= text.length) return MISSING;
    try {
      return JSON.parse(text.slice(start, i)) as unknown;
    } catch {
      return MISSING;
    }
  };

  const parseArray = (): Parsed => {
    const arr: unknown[] = [];
    i++;
    for (;;) {
      skipWs();
      if (i >= text.length) {
        incomplete.add(arr);
        return arr;
      }
      if (text[i] === "]") {
        i++;
        return arr;
      }
      if (text[i] === ",") {
        i++;
        continue;
      }
      const before = i;
      const v = parseValue();
      if (v === MISSING) {
        // Cut-off scalar at the end of input. (A container never returns MISSING.)
        incomplete.add(arr);
        i = text.length;
        return arr;
      }
      arr.push(v);
      if (i === before) i++; // malformed input: guarantee progress
    }
  };

  const parseObject = (): Parsed => {
    const obj: Record<string, unknown> = {};
    i++;
    for (;;) {
      skipWs();
      if (i >= text.length) {
        incomplete.add(obj);
        return obj;
      }
      if (text[i] === "}") {
        i++;
        return obj;
      }
      if (text[i] === ",") {
        i++;
        continue;
      }
      if (text[i] !== '"') {
        i++; // malformed input: skip a stray character
        continue;
      }
      const key = parseString();
      if (key === MISSING) {
        incomplete.add(obj);
        return obj;
      }
      skipWs();
      if (text[i] !== ":") {
        incomplete.add(obj);
        i = text.length;
        return obj;
      }
      i++;
      const v = parseValue();
      if (v === MISSING) {
        incomplete.add(obj);
        i = text.length;
        return obj;
      }
      obj[key as string] = v;
    }
  };

  skipWs();
  const value = parseValue();
  return { value: value === MISSING ? undefined : value, incomplete };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export interface PartialScreen {
  /** Page-level fields received so far (title, theme, accent, font), if any. */
  fields: Record<string, unknown>;
  /** Fully received top-level elements of `children`, in order. */
  children: unknown[];
}

/**
 * From the partial input of render_screen ({summary, screen: {title, ..., children: [...]}}),
 * pull the page fields and the top-level children that are complete. Also accepts a bare
 * {title, children} document.
 */
export function extractPartialScreen(text: string): PartialScreen {
  const { value, incomplete } = parsePartialJson(text);
  const root = isRecord(value) ? value : {};
  const screen = isRecord(root.screen) ? root.screen : root;
  const fields: Record<string, unknown> = {};
  for (const key of ["title", "theme", "accent", "font"]) {
    if (key in screen) fields[key] = screen[key];
  }
  const list = Array.isArray(screen.children) ? screen.children : [];
  const children = list.filter((c) => !(typeof c === "object" && c !== null && incomplete.has(c)));
  return { fields, children };
}
