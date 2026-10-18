import { findNode, type AskRequest, type Node, type Screen } from "@create/shared";

/**
 * Deterministic Chat answer used when MOCK_AI=1 or there is no API key. It finds the element the
 * question is about (the pointed node first, then numbers, quoted words and key nouns in the
 * question), explains it with its neighbours, and never claims to have edited anything.
 */

type Container = Extract<Node, { type: "container" }>;
type Unit = { node: Node; text: string; ctx: string[]; scope: Node[]; ancestors: Container[] };
type Terms = { numbers: string[]; quoted: string[]; nouns: string[] };

const STOP = new Set(
  `the and for are was were what whats why how who when where which does did doing this that these those with from into about mean means meant show shows shown here there page screen number numbers explain describe tell please can could would you your have has had its it's not but all any some one out than then them they their just very much many also like over under`.split(" "),
);
const NUMBER_WORDS = ["zero", "one", "two", "three", "four", "five"];
const MONTHS = "jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?";
const DATE_RE = new RegExp(`\\b\\d{4}-\\d{2}-\\d{2}\\b|\\b\\d{1,2}/\\d{1,2}/\\d{2,4}\\b|\\b(?:${MONTHS})\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?(?:,?\\s+\\d{4})?|\\b\\d{1,2}(?:st|nd|rd|th)?\\s+(?:${MONTHS})\\b(?:,?\\s+\\d{4})?`, "i");
const PRICE_RE = /(?:US)?\$\s?\d[\d,]*(?:\.\d+)?(?:\s?[kKmM]\b)?(?:\s?\/\s?\w+)?/;
const PERCENT_RE = /\d[\d,]*(?:\.\d+)?\s?%/;
const NUMBER_RE = /\d[\d,]*(?:\.\d+)?\s?[kKmM]?\b/;
const RATING_CUE = /star|★|⭐|rating|rated|out of 5|review/i;

const clip = (s: string, n = 80) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const quote = (s: string) => `"${clip(s.trim())}"`;
const plain = (s: string) => s.replace(/[,\s]/g, "").toLowerCase();

function termsOf(question: string): Terms {
  const quoted = [...question.matchAll(/["“]([^"”]{1,60})["”]|(?:^|[\s(])'([^']{1,60})'(?=$|[\s).,?!])/g)].map((m) => (m[1] ?? m[2] ?? "").trim()).filter(Boolean);
  const stripped = question.replace(/["“][^"”]*["”]/g, " ");
  const numbers = [...stripped.matchAll(/\d[\d,]*(?:\.\d+)?/g)].map((m) => m[0].replace(/,$/, ""));
  const nouns = [...new Set(stripped.toLowerCase().replace(/[^a-z\s]/g, " ").split(/\s+/).filter((w) => w.length >= 3 && !STOP.has(w)))];
  return { numbers, quoted, nouns };
}

/** Every piece of readable text on the screen, with the neighbours that explain it. */
function collect(screen: Screen): Unit[] {
  const out: Unit[] = [];
  const visit = (nodes: Node[], ancestors: Container[]) => {
    for (const node of nodes) {
      const base = { node, scope: nodes, ancestors };
      switch (node.type) {
        case "heading": case "text": case "badge": case "link":
          out.push({ ...base, text: node.text, ctx: [] }); break;
        case "button": case "checkbox": case "textbox": case "select":
          out.push({ ...base, text: node.label, ctx: [] }); break;
        case "image": if (node.alt) out.push({ ...base, text: node.alt, ctx: [] }); break;
        case "avatar": out.push({ ...base, text: node.name, ctx: [] }); break;
        case "rating": out.push({ ...base, text: String(node.value), ctx: node.label ? [node.label] : [] }); break;
        case "data": out.push({ ...base, text: node.label ? `${node.label} ${node.field}` : node.field, ctx: [] }); break;
        case "list": for (const item of node.items) out.push({ ...base, text: item, ctx: [] }); break;
        case "table":
          node.rows.forEach((row) => row.forEach((cell, i) => {
            const others = row.filter((_, j) => j !== i && row[j]);
            out.push({ ...base, text: cell, ctx: [node.columns[i], ...others.slice(0, 1)].filter((s): s is string => !!s) });
          }));
          break;
        case "accordion": for (const it of node.items) out.push({ ...base, text: it.answer, ctx: [it.question] }); break;
        case "container": visit(node.children, [...ancestors, node]); break;
        default: break;
      }
    }
  };
  visit(screen.children, []);
  return out;
}

const textOfSibling = (n: Node): string | null => {
  if (n.type === "text" || n.type === "heading" || n.type === "badge") return n.text;
  if (n.type === "rating") return n.label ? n.label : null;
  if (n.type === "link") return n.text;
  return null;
};

/** Nearby text: siblings in the same container first, then the closest text beside the parent. */
function neighbours(u: Unit, screen: Screen): string[] {
  const found: string[] = [...u.ctx];
  const add = (nodes: Node[], skip: Node) => {
    for (const n of nodes) {
      if (n === skip) continue;
      const t = textOfSibling(n);
      if (t && t.trim()) found.push(t.trim());
    }
  };
  add(u.scope, u.node);
  for (let i = u.ancestors.length - 1; i >= 0 && found.length < 2; i--) {
    const holder = u.ancestors[i]!;
    add(i === 0 ? screen.children : u.ancestors[i - 1]!.children, holder);
  }
  return [...new Set(found.filter((t) => plain(t) !== plain(u.text)))].slice(0, 2);
}

function score(u: Unit, t: Terms, pointedId: string | null, pointerContainer: Container | null): number {
  const hay = [u.text, ...u.ctx].join(" ").toLowerCase();
  const own = u.text.toLowerCase();
  let s = 0;
  for (const q of t.quoted) if (own.includes(q.toLowerCase())) s += 12;
  for (const n of t.numbers) if (own.replace(/,/g, "").includes(n.replace(/,/g, ""))) s += 10;
  for (const w of t.nouns) if (new RegExp(`\\b${w}`).test(hay)) s += 2;
  if (u.node.type === "rating" && t.nouns.some((w) => /^(rating|ratings|rated|stars?|review|reviews)$/.test(w))) s += 4;
  if (pointedId && u.node.id === pointedId) s += 8;
  else if (pointerContainer && u.ancestors.some((a) => a.id === pointerContainer.id)) s += 1;
  return s;
}

type Kind = "rating" | "price" | "percent" | "date" | "count" | "number" | "plain";

function classify(u: Unit, ctxText: string, question: string, hasRatingSibling: boolean): { kind: Kind; token: string } {
  const text = u.text;
  if (u.node.type === "rating") return { kind: "rating", token: text };
  const date = DATE_RE.exec(text);
  if (date) return { kind: "date", token: date[0] };
  const price = PRICE_RE.exec(text);
  if (price) return { kind: "price", token: price[0].trim() };
  const pct = PERCENT_RE.exec(text);
  if (pct) return { kind: "percent", token: pct[0].replace(/\s/g, "") };
  const num = NUMBER_RE.exec(text);
  if (num) {
    const token = num[0].trim();
    const value = Number(token.replace(/,/g, ""));
    const cue = hasRatingSibling || RATING_CUE.test(`${text} ${ctxText} ${question}`);
    if (/^\d(?:\.\d)?$/.test(token) && value <= 5 && (cue || token.includes("."))) return { kind: cue ? "rating" : "number", token };
    if (/^\d[\d,]*\s?[kKmM]?$/.test(token) && (/[kKmM]$/.test(token) || value >= 10 || /\d,\d/.test(token))) return { kind: "count", token };
    return { kind: "number", token };
  }
  return { kind: "plain", token: text };
}

/** "1.2K" -> "about 1,200". */
function expand(token: string): string {
  const m = /^(\d[\d,]*(?:\.\d+)?)\s?([kKmM])?$/.exec(token.trim());
  if (!m) return token;
  const base = Number(m[1]!.replace(/,/g, ""));
  const v = m[2] ? base * (m[2].toLowerCase() === "k" ? 1_000 : 1_000_000) : base;
  return v.toLocaleString("en-US");
}

function withPhrase(ctx: string[], own: string | null): string {
  const parts = ctx.map(quote);
  if (own) parts.unshift(`in ${quote(own)}`);
  if (!parts.length) return "";
  return own ? ` ${parts[0]}${parts[1] ? `, near ${parts[1]}` : ""}` : ` with ${parts.join(" and ")}`;
}

function firstCount(strings: string[], skip: string): string | null {
  for (const s of strings) {
    for (const m of s.matchAll(/\d[\d,]*(?:\.\d+)?\s?[kKmM]?\b/g)) {
      if (plain(m[0]) !== plain(skip)) return m[0].trim();
    }
  }
  return null;
}

function explain(u: Unit, ctx: string[], question: string, hasRatingSibling: boolean): string {
  const { kind, token } = classify(u, ctx.join(" "), question, hasRatingSibling);
  const embedded = u.text.trim().length > token.length + 12 && kind !== "plain" ? u.text.trim() : null;
  const around = withPhrase(ctx, embedded);
  const ctxAll = [...ctx, u.text];
  switch (kind) {
    case "rating": {
      const value = u.node.type === "rating" ? u.node.value : Number(token);
      const stars = Math.round(value);
      const beside = stars > 0 ? `next to the ${NUMBER_WORDS[stars]} star${stars === 1 ? "" : "s"}` : "next to the stars";
      const count = firstCount(ctxAll, token);
      const people = count ? ` — so about ${expand(count)} ${/\b(makers?|customers?|users?|people|reviews?|buyers?|clients?)\b/i.test(ctxAll.join(" ")) ? "people rated it" : "ratings went into it"}.` : ".";
      return `The "${token}" ${beside} is an average rating out of 5${around ? `, shown${around}` : ""}${people}`;
    }
    case "price": {
      const period = /\/\s?(mo|month)|per month|monthly/i.test(`${u.text} ${ctx.join(" ")}`) ? " It is billed per month." : /\/\s?(yr|year)|per year|yearly|annual/i.test(`${u.text} ${ctx.join(" ")}`) ? " It is billed per year." : "";
      return `The "${token}" is a price in US dollars${around ? `, shown${around}` : ""}.${period}`;
    }
    case "percent": {
      const n = token.replace("%", "");
      const discount = /\b(off|discount|save|saving|sale)\b/i.test(ctxAll.join(" "));
      return `The "${token}" is a percentage, ${n} out of every 100${discount ? ", here a discount off the normal price" : ""}${around ? `, shown${around}` : ""}.`;
    }
    case "date":
      return `The "${token}" is a date${around ? `, shown${around}` : ""}${isoLong(token)}.`;
    case "count": {
      const after = new RegExp(`${token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s+([A-Za-z][\\w-]*)`).exec(u.text)?.[1];
      const noun = after ?? ctx.map((c) => /^\s*([A-Za-z][\w-]*)/.exec(c)?.[1]).find((w) => w && !STOP.has(w.toLowerCase()));
      return `The "${token}" is a count${noun ? ` of ${noun}` : ""}: about ${expand(token)}${around ? `, shown${around}` : ""}.`;
    }
    case "number":
      return `The "${token}" is a plain number${around ? `, shown${around}` : ""}.`;
    default: {
      if (u.node.type === "data") {
        const d = u.node;
        return `${d.label ? quote(d.label) : "That"} is a live value read from the backend field "${d.field}"${d.format !== "text" ? `, shown as ${d.format === "currency" ? "a dollar amount" : d.format === "date" ? "a date" : "a number"}` : ""}, so it changes as the data does.`;
      }
      const name = u.node.type === "badge" ? "badge" : u.node.type;
      return `That ${name} reads ${quote(u.text.replace(/\s+/g, " "))}${ctx[0] ? `, next to ${quote(ctx[0])}` : ""}.`;
    }
  }
}

function isoLong(token: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(token)) return "";
  const d = new Date(`${token}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return "";
  return `, which falls on a ${d.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" })}`;
}

export function mockAnswerBody(req: AskRequest, reading?: string | null): string {
  const { screen, pointer } = req;
  const question = req.question.trim();
  const terms = termsOf(question);
  const pointedId = pointer?.targetId ?? null;
  const pointed = pointedId && screen ? findNode(screen, pointedId) : null;
  const pointerContainer = pointed?.type === "container" ? pointed : null;
  const parts: string[] = [];

  let best: { u: Unit; s: number } | null = null;
  if (screen) {
    for (const u of collect(screen)) {
      if (!u.text.trim()) continue;
      const s = score(u, terms, pointedId, pointerContainer);
      if (s > 0 && (!best || s > best.s)) best = { u, s };
    }
  }
  if (best && screen) {
    const ctx = neighbours(best.u, screen);
    const ratingSibling = best.u.scope.some((n) => n !== best!.u.node && n.type === "rating");
    parts.push(explain(best.u, ctx, question, ratingSibling));
  } else if (pointer?.label?.trim()) {
    parts.push(`You pointed at ${quote(pointer.label)}.`);
  } else if (screen) {
    const heads = collect(screen).filter((u) => u.node.type === "heading").map((u) => u.text).slice(0, 3);
    parts.push(`This page is ${quote(screen.title)} with ${screen.children.length} top-level section${screen.children.length === 1 ? "" : "s"}${heads.length ? `, covering ${heads.map(quote).join(", ")}` : ""}.`);
  } else {
    parts.push("I do not see a page to look at yet, so tell me which part you mean and I will explain it.");
  }
  if (pointer?.image) {
    const about = (pointed?.type === "image" && pointed.alt.trim()) || pointer.label?.trim() || question;
    parts.unshift(`I see the image you pointed at (${quote(about)}).`);
  }
  if (reading) parts.push(`What I can see there: ${reading.replace(/\s+/g, " ").slice(0, 300)}`);
  return parts.join(" ");
}
