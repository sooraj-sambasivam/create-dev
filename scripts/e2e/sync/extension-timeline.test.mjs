// node --test scripts/e2e/sync/extension-timeline.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const tl = createRequire(import.meta.url)("../../../apps/extension/timeline.js");

const cap = (t, d) => ({ t, kind: "hover", d });

test("ring: at() is the last item at or before t, old items age out", () => {
  const r = tl.ring(1000);
  r.push({ t: 100, v: "a" }); r.push({ t: 400, v: "b" }); r.push({ t: 2000, v: "c" });
  assert.equal(r.at(50), null);
  assert.equal(r.at(3000).v, "c");
  assert.equal(r.all().length, 1); // a and b are older than 1 s before c
});

test("estimateWords ends at arrival - lag and keeps order", () => {
  const w = tl.estimateWords("make this bigger", 5000, 200);
  assert.equal(w.length, 3);
  assert.ok(Math.abs(w[2].end - 4800) < 1e-6);
  assert.ok(w[0].start < w[1].start && w[1].start < w[2].start);
});

test("scribeWords places offsets (seconds) on the page clock and skips spacing", () => {
  const w = tl.scribeWords({ words: [{ text: "Move", start: 0.1, end: 0.3, type: "word" }, { text: " ", start: 0.3, end: 0.4, type: "spacing" }, { text: "this", start: 0.4, end: 0.6, type: "word" }] }, 1000);
  assert.deepEqual(w.map((x) => [x.text, x.start, x.end, x.exact]), [["Move", 1100, 1300, true], ["this", 1400, 1600, true]]);
  assert.equal(tl.scribeWords({ words: [] }, 1000), null);
  assert.equal(tl.scribeWords({ words: [{ text: "a", start: 0, end: 1 }] }, null), null);
});

test("a deictic binds to what was hovered when it was said, not what is hovered later", () => {
  const caps = tl.ring();
  caps.push(cap(0, { label: "Table A" })); caps.push(cap(3000, { label: "Table B" }));
  const [b] = tl.bindDeictics([{ text: "this", start: 2400, end: 2600, exact: true }], caps);
  assert.equal(b.bound.cap.d.label, "Table A");
  assert.equal(b.bound.mode, "hover");
});

test("two deictics bind to their own moments", () => {
  const caps = tl.ring();
  caps.push(cap(0, { label: "A" })); caps.push(cap(1500, { label: "B" }));
  const out = tl.bindDeictics([{ text: "Move", start: 100, end: 300, exact: true }, { text: "this", start: 500, end: 700, exact: true }, { text: "here,", start: 1900, end: 2100, exact: true }], caps);
  assert.deepEqual(out.map((o) => [o.word.text, o.bound.cap.d.label]), [["this", "A"], ["here,", "B"]]);
});

test("a hover that just ended still counts for 1.5 s", () => {
  const caps = tl.ring();
  caps.push(cap(0, { label: "A" })); caps.push(cap(1000, null));
  assert.equal(tl.bind({ text: "that", start: 1800, end: 2000, exact: true }, caps).mode, "recent");
  assert.equal(tl.bind({ text: "that", start: 4000, end: 4200, exact: true }, caps), null);
});

test("a lasso the speech overlaps wins over hover", () => {
  const caps = tl.ring();
  caps.push(cap(0, { label: "A" }));
  caps.push({ t: 1000, tEnd: 2500, kind: "lasso", d: { label: "Loop" } });
  assert.equal(tl.bind({ text: "this", start: 4000, end: 4200, exact: true }, caps).cap.d.label, "Loop"); // said 1.5 s after the loop ended
  assert.equal(tl.bind({ text: "this", start: 12000, end: 12200, exact: true }, caps).cap.d.label, "A"); // too late: back to hover
});

test("isDeictic ignores punctuation and case", () => {
  assert.ok(tl.isDeictic("Here,")); assert.ok(tl.isDeictic("THIS.")); assert.ok(!tl.isDeictic("table"));
});
