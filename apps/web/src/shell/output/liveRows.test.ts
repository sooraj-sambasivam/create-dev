import { describe, expect, it } from "vitest";
import type { StoredSubmission } from "@create/shared";
import { liveColumns, newIds, submissionsFor } from "./liveRows";

const row = (id: string, formId: string, createdAt: string, fields: Record<string, string> = {}): StoredSubmission => ({ id, appId: "a", formId, createdAt, fields });

describe("liveRows", () => {
  it("filters by form and sorts newest first", () => {
    const out = submissionsFor([row("1", "f", "2026-01-01T00:00:01Z"), row("2", "g", "2026-01-01T00:00:09Z"), row("3", "f", "2026-01-01T00:00:05Z")], "f");
    expect(out.map((r) => r.id)).toEqual(["3", "1"]);
  });
  it("orders columns by form fields then extras", () => {
    const cols = liveColumns([{ name: "name", label: "Name" }], [row("1", "f", "x", { name: "A", note: "n" })]);
    expect(cols).toEqual([{ key: "name", label: "Name" }, { key: "note", label: "note" }]);
  });
  it("finds new ids, none on first load", () => {
    const rows = [row("1", "f", "a"), row("2", "f", "b")];
    expect(newIds(null, rows)).toEqual([]);
    expect(newIds(new Set(["1"]), rows)).toEqual(["2"]);
  });
});
