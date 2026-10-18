import { describe, expect, it } from "vitest";
import { DIAGRAM_NODES, ROUTES, diagramEdges, nodesForRoute } from "../routes";
import { routesFor } from "./model";

describe("backend routes added for icons, canvas ops and live", () => {
  it("lists GET /api/icons/svg for editor and canvas, served by Iconify", () => {
    const r = ROUTES.find((x) => x.method === "GET" && x.path === "/api/icons/svg");
    expect(r).toBeDefined();
    expect(r?.summary).toContain("cached 24 h");
    expect(r?.clients).toEqual(["editor", "canvas"]);
    expect(r?.providers).toEqual(["iconify"]);
    expect([...nodesForRoute("/api/icons/svg")].sort()).toEqual(["api", "canvas", "editor", "iconify"]);
  });

  it("shows the icon SVG route on the services diagram Iconify node", () => {
    expect(routesFor("iconify").map((r) => r.path)).toContain("/api/icons/svg");
    expect(routesFor("iconify").map((r) => r.path)).toContain("/api/icons/search");
  });

  it("lists POST /api/canvas-ops under the canvas client with Perceptron and Claude behind it", () => {
    const r = ROUTES.find((x) => x.method === "POST" && x.path === "/api/canvas-ops");
    expect(r).toBeDefined();
    expect(r?.clients).toEqual(["canvas"]);
    expect(r?.providers).toEqual(["perceptron", "claude"]);
    expect(r?.model).toContain("Sonnet");
    expect(routesFor("canvas").map((x) => x.path)).toContain("/api/canvas-ops");
    expect(routesFor("sonnet").map((x) => x.path)).toContain("/api/canvas-ops");
  });

  it("lists the live catalog and live value routes, with the upstreams behind them", () => {
    expect(ROUTES.some((x) => x.method === "GET" && x.path === "/api/live")).toBe(true);
    const r = ROUTES.find((x) => x.method === "GET" && x.path === "/api/live/:id");
    expect(r).toBeDefined();
    expect(r?.model).toContain("Open-Meteo");
    expect(r?.model).toContain("YouTube");
    expect(r?.providers).toEqual(["live-apis"]);
  });

  it("only draws edges to declared diagram nodes for the new providers", () => {
    const ids = new Set(DIAGRAM_NODES.map((n) => n.id));
    const edges = diagramEdges();
    expect(edges).toContainEqual(["api", "perceptron"]);
    expect(edges).toContainEqual(["api", "live-apis"]);
    for (const [a, b] of edges) {
      expect(ids.has(a)).toBe(true);
      expect(ids.has(b)).toBe(true);
    }
  });
});
