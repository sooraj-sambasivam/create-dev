import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ResultCard, ReviewResultCard, VISIBLE_ROWS } from "./ResultCard";
import { ActionRow } from "./ActionRow";
import { LiveRunLine, RunLine } from "./RunLine";
import { UserBubble } from "./UserBubble";
import { ContextCard } from "../context/ContextCard";

const rows = Array.from({ length: 6 }, (_, i) => ({ label: `Row ${i}`, stat: `${i}` }));

describe("thread render", () => {
  it("result card shows the first rows and counts the rest", () => {
    const html = renderToStaticMarkup(<ResultCard result={{ title: "Built page", meta: "23 elements", rows }} action="page" url={null} undoable />);
    expect(html).toContain("Built page");
    expect(html).toContain("23 elements");
    expect(html).toContain("Undo");
    expect(html).toContain("View page");
    for (let i = 0; i < VISIBLE_ROWS; i++) expect(html).toContain(`Row ${i}`);
    expect(html).not.toContain("Row 3");
    expect(html).toContain("Show 3 more");
    expect(html).toContain('aria-expanded="false"');
  });
  it("an app card opens the app and has no Undo", () => {
    const html = renderToStaticMarkup(<ResultCard result={{ title: "Lifted Route 44", meta: "12 rows · 4 columns", rows: [] }} action="app" url="http://localhost:3001/a" undoable={false} />);
    expect(html).toContain("Open app");
    expect(html).toContain('href="http://localhost:3001/a"');
    expect(html).not.toContain("Undo");
    expect(html).not.toContain("Show");
  });
  it("review card has Apply and Discard; preparing shows a status", () => {
    const ready = renderToStaticMarkup(<ReviewResultCard label="Heading" summary="Bigger" staging={false} />);
    expect(ready).toContain("Review change · Heading");
    expect(ready).toContain('data-testid="review-apply"');
    expect(ready).toContain('data-testid="review-discard"');
    expect(renderToStaticMarkup(<ReviewResultCard label="" summary="" staging />)).toContain("Preparing a change to review");
  });
  it("run line is a collapsed button with the duration", () => {
    const html = renderToStaticMarkup(<RunLine run="build" ms={12_000} steps={[{ label: "Planning layout", at: 0 }]} />);
    expect(html).toContain("Built in 12s");
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain("Planning layout");
  });
  it("live run line shows a timer, shimmer and a status role", () => {
    const html = renderToStaticMarkup(<LiveRunLine label="Building your page…" run={{ kind: "build", startedAt: Date.now(), steps: [{ label: "Planning layout", at: 0 }] }} />);
    expect(html).toContain('role="status"');
    expect(html).toContain("Building…");
    expect(html).toContain("shimmer-light");
  });
  it("action row labels every icon button", () => {
    const html = renderToStaticMarkup(<ActionRow text="Hello" retry={{ prompt: "p", as: "build" }} latest />);
    for (const l of ["Copy", "Good response", "Bad response", "Share link", "Retry"]) expect(html).toContain(`aria-label="${l}"`);
    expect(html).toContain('aria-pressed="false"');
  });
  it("short prompts have no Show more", () => {
    expect(renderToStaticMarkup(<UserBubble text="hi" />)).not.toContain("Show more");
  });
  it("context card shows the changes and sources, and View all", () => {
    const html = renderToStaticMarkup(<ContextCard wide />);
    for (const s of ["Elements edited", "Rows received", "Live data sources", "Forms", "Imported from", "View all"]) expect(html).toContain(s);
    expect(html).toContain('aria-label="Add a source"');
  });
  it("narrow context card folds into a pill", () => {
    const html = renderToStaticMarkup(<ContextCard wide={false} />);
    expect(html).toContain('data-testid="context-pill"');
    expect(html).not.toContain("Elements edited");
  });
});
