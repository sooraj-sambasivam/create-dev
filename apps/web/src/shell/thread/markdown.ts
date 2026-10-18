/** Markdown-light for answers: paragraphs, **bold**, lists and `inline code`. Parsed to data, never to HTML. */

export type Inline = { t: "text" | "bold" | "code"; v: string };
export type Block =
  | { t: "p"; inlines: Inline[] }
  | { t: "ul" | "ol"; items: Inline[][] };

const INLINE_RE = /\*\*([^*]+)\*\*|`([^`]+)`/g;

export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  for (const m of text.matchAll(INLINE_RE)) {
    if (m.index > last) out.push({ t: "text", v: text.slice(last, m.index) });
    out.push(m[1] !== undefined ? { t: "bold", v: m[1] } : { t: "code", v: m[2] });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ t: "text", v: text.slice(last) });
  return out;
}

const UL_RE = /^\s*[-*•]\s+(.*)$/;
const OL_RE = /^\s*\d+[.)]\s+(.*)$/;

export function parseBlocks(src: string): Block[] {
  const blocks: Block[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) blocks.push({ t: "p", inlines: parseInline(para.join(" ")) });
    para = [];
  };
  for (const line of src.replace(/\r\n?/g, "\n").split("\n")) {
    const ul = UL_RE.exec(line);
    const ol = ul ? null : OL_RE.exec(line);
    const m = ul ?? ol;
    if (m) {
      flush();
      const t = ul ? "ul" : "ol";
      const prev = blocks[blocks.length - 1];
      if (prev && prev.t === t) prev.items.push(parseInline(m[1]));
      else blocks.push({ t, items: [parseInline(m[1])] });
    } else if (!line.trim()) flush();
    else para.push(line.trim());
  }
  flush();
  return blocks;
}

/** The answer as plain text for copy and read aloud: markers removed, lists kept as lines. */
export function plainText(src: string): string {
  return parseBlocks(src)
    .map((b) => {
      const flat = (inl: Inline[]) => inl.map((n) => n.v).join("");
      return b.t === "p" ? flat(b.inlines) : b.items.map((it, i) => `${b.t === "ol" ? `${i + 1}.` : "-"} ${flat(it)}`).join("\n");
    })
    .join("\n\n");
}
