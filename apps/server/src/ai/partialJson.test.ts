import { describe, expect, it } from "vitest";
import { extractPartialScreen, parsePartialJson } from "./partialJson";

const doc = {
  summary: 'Built "it" {ok}',
  screen: {
    title: 'Café "Noir" } ] {',
    theme: "dark",
    accent: "#ff0000",
    font: "serif",
    children: [
      { id: "a", type: "heading", text: 'He said "hi\\" {x}', level: 1 },
      { id: "b", type: "container", children: [{ id: "b1", type: "text", text: "[1,2]" }, { id: "b2", type: "text", text: "n" }], n: -1.5e2, flag: true, nothing: null },
      { id: "c", type: "text", text: "last ☃ \n line" },
    ],
  },
};
const json = JSON.stringify(doc);
const full = doc.screen.children;

describe("parsePartialJson", () => {
  it("parses complete documents exactly", () => {
    const { value, incomplete } = parsePartialJson(json);
    expect(value).toEqual(doc);
    expect(incomplete.has(value as object)).toBe(false);
  });

  it("drops truncated strings, numbers and literals", () => {
    expect(parsePartialJson('{"a":1,"b":"unfini').value).toEqual({ a: 1 });
    expect(parsePartialJson('{"a":1,"b":12').value).toEqual({ a: 1 });
    expect(parsePartialJson('{"a":1,"b":tru').value).toEqual({ a: 1 });
    expect(parsePartialJson('{"a":1,"b"').value).toEqual({ a: 1 });
    expect(parsePartialJson('{"a":1,"b":').value).toEqual({ a: 1 });
    expect(parsePartialJson('["x","y').value).toEqual(["x"]);
    expect(parsePartialJson("").value).toBeUndefined();
  });

  it("does not choke on a dangling escape", () => {
    expect(parsePartialJson('{"a":"x\\').value).toEqual({});
  });
});

describe("extractPartialScreen", () => {
  it("never returns a half-finished child, at every byte position", () => {
    let prev = 0;
    for (let n = 0; n <= json.length; n++) {
      const { children } = extractPartialScreen(json.slice(0, n));
      // Every returned child is a complete, correct element, and the count never goes down.
      children.forEach((c, i) => expect(c).toEqual(full[i]));
      expect(children.length).toBeGreaterThanOrEqual(prev);
      prev = children.length;
    }
    expect(prev).toBe(3);
  });

  it("emits a child exactly when its closing brace arrives", () => {
    const endOfFirst = json.indexOf('"level":1}') + '"level":1}'.length;
    expect(extractPartialScreen(json.slice(0, endOfFirst - 1)).children).toHaveLength(0);
    expect(extractPartialScreen(json.slice(0, endOfFirst)).children).toHaveLength(1);
  });

  it("survives chunk boundaries (incremental accumulation in odd chunk sizes)", () => {
    for (const size of [1, 2, 3, 7, 13]) {
      let acc = "";
      let last = 0;
      for (let i = 0; i < json.length; i += size) {
        acc += json.slice(i, i + size);
        last = extractPartialScreen(acc).children.length;
      }
      expect(last).toBe(3);
    }
  });

  it("reads page fields once complete and ignores braces inside strings", () => {
    const { fields } = extractPartialScreen(json);
    expect(fields).toEqual({ title: doc.screen.title, theme: "dark", accent: "#ff0000", font: "serif" });
    const early = extractPartialScreen(json.slice(0, json.indexOf('"theme"') + 5));
    expect(early.fields).toEqual({ title: doc.screen.title });
  });

  it("accepts a bare screen document and tolerates whitespace", () => {
    const text = ' { "title" : "T" , "children" : [ { "id":"x","type":"text","text":"a" } , { "id":"y" ';
    const r = extractPartialScreen(text);
    expect(r.children).toEqual([{ id: "x", type: "text", text: "a" }]);
    expect(r.fields).toEqual({ title: "T" });
  });

  it("handles children listed before the page fields", () => {
    const text = '{"screen":{"children":[{"id":"x","type":"text","text":"a"}],"title":"After"}}';
    const r = extractPartialScreen(text);
    expect(r.children).toHaveLength(1);
    expect(r.fields.title).toBe("After");
  });
});
