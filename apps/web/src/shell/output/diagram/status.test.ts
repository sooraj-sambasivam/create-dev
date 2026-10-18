import { describe, expect, it } from "vitest";
import { EDGES, NODES, neighbours, nodeStatus, routesFor, statusLabel } from "./model";

const live = { ok: true, hasAnthropic: true, hasElevenLabs: true, hasTypesafe: true, hasMongo: true, mock: false };

describe("nodeStatus", () => {
  it("is unknown until health loads", () => {
    expect(nodeStatus("api", null)).toBe("unknown");
  });
  it("is connected when every key is present", () => {
    for (const n of NODES) expect(nodeStatus(n.id, live)).toBe("connected");
  });
  it("falls back in mock mode even with a key", () => {
    for (const id of ["composer", "canvas", "sonnet", "haiku"]) expect(nodeStatus(id, { ...live, mock: true })).toBe("fallback");
    expect(nodeStatus("api", { ...live, mock: true })).toBe("connected");
  });
  it("falls back per missing key", () => {
    expect(nodeStatus("sonnet", { ...live, hasAnthropic: false })).toBe("fallback");
    expect(nodeStatus("scribe", { ...live, hasElevenLabs: false })).toBe("fallback");
    expect(nodeStatus("narrate", { ...live, hasElevenLabs: false })).toBe("fallback");
    expect(nodeStatus("jev", { ...live, hasTypesafe: false })).toBe("fallback");
    expect(nodeStatus("store", { ...live, hasMongo: false })).toBe("fallback");
    expect(nodeStatus("share", { ...live, hasMongo: false })).toBe("fallback");
    expect(nodeStatus("haiku", { ...live, hasElevenLabs: false })).toBe("connected");
  });
  it("labels statuses", () => {
    expect(statusLabel("connected")).toBe("Connected");
    expect(statusLabel("unused")).toBe("Not used");
    expect(statusLabel("fallback", "scribe", { ...live, hasElevenLabs: false })).toBe("Fallback: browser speech");
  });
});

describe("diagram model", () => {
  it("only connects known nodes", () => {
    const ids = new Set(NODES.map((n) => n.id));
    for (const e of EDGES) {
      expect(ids.has(e.from)).toBe(true);
      expect(ids.has(e.to)).toBe(true);
    }
  });
  it("finds neighbours", () => {
    expect([...neighbours("scribe")].sort()).toEqual(["api", "scribe"]);
    expect(neighbours("api").size).toBe(NODES.length);
  });
  it("lists routes per node", () => {
    expect(routesFor("scribe").map((r) => r.path)).toContain("/api/voice-token");
    expect(routesFor("jev").map((r) => r.path)).toEqual(["/api/route-intent"]);
    expect(routesFor("canvas").map((r) => r.path)).toEqual(["/api/generate-sketch"]);
  });
});
