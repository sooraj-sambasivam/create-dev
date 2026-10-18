import { beforeEach, describe, expect, it, vi } from "vitest";

const memory = vi.hoisted(() => {
  const map = new Map<string, string>();
  const storage = {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: () => null,
    get length() {
      return map.size;
    },
  };
  Object.defineProperty(globalThis, "localStorage", { value: storage, configurable: true });
  return storage;
});

vi.mock("../lib/api", () => ({ editNode: vi.fn(), generateStream: vi.fn(), uploadImage: vi.fn() }));

import { findNode, type Node, type Screen } from "@create/shared";
import * as api from "../lib/api";
import { cancelInFlight, elementLabel, fastEdit, isDeletePrompt, useScreenStore } from "./screenStore";

const text = (extra: Partial<Node> = {}) => ({ id: "t", type: "text", text: "hi", ...extra }) as Node;
const page = (): Screen =>
  ({
    title: "T",
    children: [
      { id: "h", type: "heading", text: "Head", level: 1 },
      { id: "t", type: "text", text: "Body" },
      { id: "img", type: "image", src: "x", alt: "a" },
    ],
  }) as unknown as Screen;

describe("fastEdit", () => {
  it("steps font size for text", () => {
    expect(fastEdit(text(), "make it bigger")?.node.style?.fontSize).toBe("lg");
    expect(fastEdit(text({ style: { fontSize: "lg" } }), "a bit smaller")?.node.style?.fontSize).toBe("base");
    expect(fastEdit(text({ style: { fontSize: "5xl" } }), "bigger")?.node).toMatchObject({ style: { fontSize: "5xl" } });
  });
  it("steps one size from the size the renderer really uses", () => {
    const h3 = { id: "b", type: "heading", text: "Ember", level: 3 } as Node;
    expect(fastEdit(h3, "bigger")?.node.style?.fontSize).toBe("lg");
    expect(fastEdit({ ...h3, level: 1 } as Node, "bigger")?.node.style?.fontSize).toBe("4xl");
    expect(fastEdit({ ...h3, level: 2 } as Node, "smaller")?.node.style?.fontSize).toBe("xl");
  });
  it("labels edited elements", () => {
    expect(elementLabel({ id: "b", type: "heading", text: "Ember", level: 3 } as Node)).toBe("Heading · Ember");
    expect(elementLabel({ id: "i", type: "image" } as Node)).toBe("Image");
    expect(elementLabel(text({ text: "x".repeat(40) } as Partial<Node>))).toBe(`Text · ${"x".repeat(27)}…`);
  });
  it("uses widthPct for non-text", () => {
    const img = { id: "i", type: "image" } as Node;
    expect(fastEdit(img, "make this bigger")?.node.widthPct).toBe(70);
    expect(fastEdit({ ...img, widthPct: 100 } as Node, "bigger")?.node.widthPct).toBe(100);
    expect(fastEdit({ ...img, widthPct: 40 } as Node, "make that smaller")?.node.widthPct).toBe(30);
  });
  it("handles bold and centre", () => {
    expect(fastEdit(text(), "make it bold")?.node.style?.weight).toBe("bold");
    expect(fastEdit(text(), "center this")?.node.style?.align).toBe("center");
  });
  it("returns null for anything compound or unknown", () => {
    expect(fastEdit(text(), "make it bigger and blue")).toBeNull();
    expect(fastEdit(text(), "rewrite friendlier")).toBeNull();
    expect(fastEdit(text(), "")).toBeNull();
  });
  it("detects plain delete only", () => {
    expect(isDeletePrompt("delete this")).toBe(true);
    expect(isDeletePrompt("Remove it.")).toBe(true);
    expect(isDeletePrompt("remove the second paragraph and add a quote")).toBe(false);
  });
});

describe("editNodeWithAI", () => {
  beforeEach(() => {
    memory.clear();
    cancelInFlight();
    useScreenStore.getState().reset();
    useScreenStore.getState().setScreen(page());
    vi.mocked(api.editNode).mockReset();
  });

  it("applies fast paths without a model call", async () => {
    const r = await useScreenStore.getState().editNodeWithAI("t", "make it bigger");
    expect(r.summary).toBeTruthy();
    expect(api.editNode).not.toHaveBeenCalled();
    expect((findNode(useScreenStore.getState().screen!, "t") as Node).style?.fontSize).toBe("lg");
    const d = await useScreenStore.getState().editNodeWithAI("img", "delete this");
    expect(d.summary).toBe("Removed it.");
    expect(findNode(useScreenStore.getState().screen!, "img")).toBeFalsy();
  });

  it("queues a second command instead of dropping it", async () => {
    let release!: (v: unknown) => void;
    vi.mocked(api.editNode).mockImplementationOnce(() => new Promise((r) => (release = r)) as never);
    const st = useScreenStore.getState();
    const first = st.editNodeWithAI("t", "rewrite friendlier");
    const second = st.editNodeWithAI("h", "make it bold");
    const third = await st.editNodeWithAI("h", "make it bigger");
    expect(third.error).toMatch(/waiting/);
    release({ summary: "ok", nodes: [{ id: "t", type: "text", text: "Hello" }] });
    const f = await first;
    expect(f).toEqual({ summary: "ok" });
    expect((await second).summary).toBe("Made it bold.");
    expect((findNode(useScreenStore.getState().screen!, "h") as Node).style?.weight).toBe("bold");
  });

  it("discards a stale result after cancelInFlight", async () => {
    let release!: (v: unknown) => void;
    vi.mocked(api.editNode).mockImplementationOnce(() => new Promise((r) => (release = r)) as never);
    const p = useScreenStore.getState().editNodeWithAI("t", "rewrite friendlier");
    cancelInFlight();
    useScreenStore.setState({ aiBusyId: null });
    release({ summary: "late", nodes: [{ id: "t", type: "text", text: "LATE" }] });
    expect((await p).error).toBe("Cancelled.");
    expect((findNode(useScreenStore.getState().screen!, "t") as { text: string }).text).toBe("Body");
  });

  it("blocks mutations while generating", () => {
    useScreenStore.setState({ status: "loading" });
    useScreenStore.getState().patchNode("t", { text: "changed" } as Partial<Node>);
    useScreenStore.getState().remove("h");
    const s = useScreenStore.getState().screen!;
    expect((findNode(s, "t") as { text: string }).text).toBe("Body");
    expect(findNode(s, "h")).toBeTruthy();
  });
});
