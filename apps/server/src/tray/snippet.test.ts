import { describe, expect, it } from "vitest";
import { sanitizeSnippetHtml, snippetToSnapshot } from "./snippet";

describe("sanitizeSnippetHtml", () => {
  it("drops scripts, styles, iframes, event handlers and javascript: urls", () => {
    const out = sanitizeSnippetHtml(
      '<div class="a" onclick="x()" style="color:red"><script>alert(1)</script><style>p{}</style><iframe src="http://x"></iframe>' +
        '<a href="  JaVa\tScript:alert(1)">x</a><a href="https://ok.test/p?q=1&r=2">ok</a><img src="javascript:1" alt="no"><img src="https://i.test/a.png" alt="yes" onerror="y()"></div>',
    );
    expect(out).not.toMatch(/script|onclick|onerror|style=|iframe|javascript/i);
    expect(out).toContain('class="a"');
    expect(out).toContain('href="https://ok.test/p?q=1&amp;r=2"');
    expect(out).toContain('src="https://i.test/a.png"');
    expect(out).not.toContain("no\"");
  });
  it("unwraps unknown tags, keeps text, escapes stray brackets and balances tags", () => {
    expect(sanitizeSnippetHtml("<custom-el><p>a < b</p>")).toBe("<p>a &lt; b</p>");
    expect(sanitizeSnippetHtml("<ul><li>one<li>two</ul></div>")).toBe("<ul><li>one<li>two</li></li></ul>");
  });
  it("drops data: svg images but keeps data: png/jpeg", () => {
    expect(sanitizeSnippetHtml('<img src="data:image/svg+xml;base64,AAAA">')).toBe("");
    expect(sanitizeSnippetHtml('<img src="data:image/png;base64,AAAA">')).toContain("data:image/png");
  });
  it("caps output at 20 KB and stays balanced", () => {
    const html = "<div>" + '<p class="row">item item item item</p>'.repeat(2000) + "</div>";
    const out = sanitizeSnippetHtml(html);
    expect(out.length).toBeLessThanOrEqual(20_480);
    expect(out.length).toBeGreaterThan(1000);
    expect(out.startsWith("<div>")).toBe(true);
    expect(out.endsWith("</div>")).toBe(true);
    expect((out.match(/<p /g) ?? []).length).toBe((out.match(/<\/p>/g) ?? []).length);
  });
  it("is idempotent", () => {
    const once = sanitizeSnippetHtml('<table><tr><td colspan="2">x</td></tr></table><p>hi</p>');
    expect(sanitizeSnippetHtml(once)).toBe(once);
  });
});

describe("snippetToSnapshot", () => {
  it("builds a snapshot tree with root styles", () => {
    const s = snippetToSnapshot('<div><h3>Pro</h3><p>$9</p></div>', { backgroundColor: "rgb(255, 255, 255)", junk: "x" }, "Card");
    expect(s.title).toBe("Card");
    expect(s.root.tag).toBe("div");
    expect(s.root.children?.map((c) => c.tag)).toEqual(["h3", "p"]);
    expect(s.root.children?.[0]?.text).toBe("Pro");
    expect(s.root.style).toEqual({ backgroundColor: "rgb(255, 255, 255)" });
  });
});
