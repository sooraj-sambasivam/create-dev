import { describe, expect, it } from "vitest";
import { buildScreenLocateRequest, decideLocate, fitSize, iou, isUsableBox, normalizeRect, scaleRect, toSource } from "./lift";
import { modelsFromHealth } from "./useHealth";
import { parseModels } from "../../lib/api";
import { PLUGIN_ROWS } from "./controls";

describe("lift geometry", () => {
  it("normalizes a drag in any direction and clamps to the frame", () => {
    expect(normalizeRect({ x: 50, y: 40 }, { x: 10, y: 90 }, 200, 100)).toEqual({ x: 10, y: 40, w: 40, h: 50 });
    expect(normalizeRect({ x: -20, y: 5 }, { x: 500, y: 500 }, 200, 100)).toEqual({ x: 0, y: 5, w: 200, h: 95 });
  });
  it("ignores tiny boxes", () => {
    expect(isUsableBox({ x: 0, y: 0, w: 4, h: 80 })).toBe(false);
    expect(isUsableBox({ x: 0, y: 0, w: 40, h: 40 })).toBe(true);
  });
  it("maps displayed pixels to the frame", () => {
    expect(toSource({ x: 10, y: 10, w: 50, h: 20 }, { w: 500, h: 250 }, { w: 1000, h: 500 })).toEqual({ x: 20, y: 20, w: 100, h: 40 });
  });
  it("scales only crops larger than the cap", () => {
    expect(fitSize(800, 600)).toEqual({ w: 800, h: 600 });
    expect(fitSize(3200, 1600)).toEqual({ w: 1600, h: 800 });
  });
});

describe("server info", () => {
  it("parses /api/models in either shape and drops unknown ids", () => {
    const rows = [{ id: "sonnet", label: "Sonnet 5.5", available: true }, { id: "gpt", available: true }, { id: "gemini" }];
    expect(parseModels({ models: rows })).toEqual([
      { id: "sonnet", label: "Sonnet 5.5", available: true },
      { id: "gemini", label: "gemini", available: false },
    ]);
    expect(parseModels(rows)).toHaveLength(2);
    expect(parseModels("nope")).toEqual([]);
  });
  it("derives availability from health when /api/models is missing", () => {
    const m = modelsFromHealth({ hasAnthropic: true, hasGemini: false });
    expect(m.find((x) => x.id === "sonnet")?.available).toBe(true);
    expect(m.find((x) => x.id === "gemini")?.available).toBe(false);
    expect(modelsFromHealth(null).every((x) => !x.available)).toBe(true);
  });
  it("plugin rows report Connected only with their key", () => {
    const mongo = PLUGIN_ROWS.find((r) => r.key === "mongo")!;
    expect(mongo.connected({ hasMongo: true })).toBe(true);
    expect(mongo.connected({})).toBe(false);
    expect(PLUGIN_ROWS.filter((r) => r.provider).map((r) => r.key)).toEqual(["gemini", "inkling"]);
  });
});

describe("locate decisions", () => {
  const user = { x: 100, y: 100, w: 200, h: 100 };
  const r = (box: typeof user, confidence: number, extra = {}) => ({ box, label: "Table", confidence, ...extra });
  it("computes IoU and scales between spaces", () => {
    expect(iou(user, user)).toBe(1);
    expect(iou(user, { x: 400, y: 400, w: 10, h: 10 })).toBe(0);
    expect(scaleRect({ x: 10, y: 20, w: 30, h: 40 }, { w: 100, h: 100 }, { w: 200, h: 50 })).toEqual({ x: 20, y: 10, w: 60, h: 20 });
  });
  it("uses a confident result that overlaps the drag", () => {
    expect(decideLocate({ result: r({ x: 90, y: 95, w: 210, h: 110 }, 0.9) }, user).kind).toBe("use");
  });
  it("asks Which one? on ambiguity, on a far-away confident hit, and on a null result", () => {
    expect(decideLocate({ result: r(user, 0.4), ask: "Which one?" }, user).kind).toBe("ask");
    const far = decideLocate({ result: r({ x: 800, y: 800, w: 50, h: 50 }, 0.9) }, user);
    expect(far.kind).toBe("ask");
    expect(decideLocate({ result: null }, user)).toMatchObject({ kind: "ask", ask: "Which one?" });
  });
  it("falls back with a reason when unsure or when there is no answer", () => {
    expect(decideLocate({ result: r(user, 0.2) }, user)).toMatchObject({ kind: "fallback" });
    expect(decideLocate(null, user)).toMatchObject({ kind: "fallback" });
  });
  it("sends the box as cursor plus hint and no raw key material", () => {
    const b = buildScreenLocateRequest("data:image/jpeg;base64,AA", { w: 10, h: 10 }, user);
    expect(b.input).toMatchObject({ source: "screen", cursor: { x: 200, y: 150 }, hint: "box:100,100,200,100" });
  });
});
