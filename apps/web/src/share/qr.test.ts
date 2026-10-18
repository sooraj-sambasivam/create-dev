import { describe, expect, it } from "vitest";
import { qrSvg } from "./qr";

describe("qrSvg", () => {
  it("renders an svg with a path in currentColor", () => {
    const svg = qrSvg("https://example.com/?p=abc123");
    expect(svg).toMatch(/^<svg /);
    expect(svg).toContain('fill="currentColor"');
    expect(svg).toContain("viewBox=");
  });
  it("returns null when the text cannot fit", () => {
    expect(qrSvg("x".repeat(5000))).toBeNull();
  });
});
