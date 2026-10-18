import { describe, expect, it } from "vitest";
import type { EditNodeRequest, Screen } from "@create/shared";
import { mockEditNode } from "./mockEdit";

const screen = {
  title: "T",
  theme: "light",
  children: [
    { id: "h1", type: "heading", text: "Welcome", level: 1 },
    { id: "b1", type: "button", label: "Buy", variant: "primary" },
    { id: "i1", type: "image", alt: "a dog", aspect: "video", size: "full" },
  ],
} as unknown as Screen;
const edit = (nodeId: string, prompt: string): EditNodeRequest => ({ screen, nodeId, prompt });

describe("mockEditNode", () => {
  it("makes text bigger and smaller", () => {
    const big = mockEditNode(edit("h1", "make this bigger")).nodes[0] as any;
    expect(big.style.fontSize).toBe("4xl");
    const small = mockEditNode(edit("h1", "make that smaller")).nodes[0] as any;
    expect(small.style.fontSize).toBe("2xl");
  });
  it("widens non-text nodes", () => {
    expect((mockEditNode(edit("i1", "bigger")).nodes[0] as any).widthPct).toBe(80);
  });
  it("applies colour, bold and centre", () => {
    const n = mockEditNode(edit("b1", "make it red")).nodes[0] as any;
    expect(n.style.background).toBe("#dc2626");
    const c = mockEditNode(edit("h1", "make it bold and center it")).nodes[0] as any;
    expect(c.style).toMatchObject({ weight: "bold", align: "center" });
  });
  it("rewrites text and swaps photos", () => {
    expect((mockEditNode(edit("h1", 'change it to "Hello there"')).nodes[0] as any).text).toBe("Hello there");
    const img = mockEditNode(edit("i1", "swap this photo for a cat")).nodes[0] as any;
    expect(img.query).toBe("cat");
  });
  it("removes, always changes something, and 404s on a missing node", () => {
    expect(mockEditNode(edit("h1", "delete this")).nodes).toEqual([]);
    expect(mockEditNode(edit("h1", "hmm")).nodes[0]).not.toEqual((screen.children as any)[0]);
    expect(() => mockEditNode(edit("nope", "bigger"))).toThrow(/no longer exists/);
  });
});
