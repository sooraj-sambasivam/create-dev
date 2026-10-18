import { describe, expect, it } from "vitest";
import { parseBlocks, parseInline } from "./markdown";

describe("markdown-light", () => {
  it("parses bold and inline code, leaving other characters as text", () => {
    expect(parseInline("a **b** `c` <b>d</b>")).toEqual([
      { t: "text", v: "a " },
      { t: "bold", v: "b" },
      { t: "text", v: " " },
      { t: "code", v: "c" },
      { t: "text", v: " <b>d</b>" },
    ]);
  });
  it("splits paragraphs and groups list items", () => {
    const b = parseBlocks("First line\nsecond line\n\n- one\n- two\n\n1. a\n2. b");
    expect(b.map((x) => x.t)).toEqual(["p", "ul", "ol"]);
    expect(b[0]).toEqual({ t: "p", inlines: [{ t: "text", v: "First line second line" }] });
    expect(b[1]).toMatchObject({ items: [[{ v: "one" }], [{ v: "two" }]] });
  });
  it("returns nothing for blank input", () => {
    expect(parseBlocks("  \n ")).toEqual([]);
  });
});

import { plainText } from "./markdown";
describe("plainText", () => {
  it("strips markers and keeps lists as lines", () => {
    expect(plainText("A **bold** `code` line.\n\n- one\n- two\n\n1. first")).toBe("A bold code line.\n\n- one\n- two\n\n1. first");
  });
});
