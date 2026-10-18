import { describe, expect, it } from "vitest";
import { cssUrl, pickSource, resolveSource, typeQualifies } from "./capture";

const o = "http://localhost:5175";

describe("typeQualifies", () => {
  it("accepts image-like types and unknown types", () => {
    for (const t of ["image", "avatar", "container", "map", "video", null]) expect(typeQualifies(t)).toBe(true);
  });
  it("rejects text and number nodes", () => {
    for (const t of ["text", "heading", "stat", "button", "table"]) expect(typeQualifies(t)).toBe(false);
  });
});

describe("cssUrl", () => {
  it("skips gradient tints and unquotes", () => {
    expect(cssUrl('linear-gradient(rgba(0,0,0,.5), rgba(0,0,0,.5)), url("/api/image?q=a&seed=b")')).toBe("/api/image?q=a&seed=b");
    expect(cssUrl("url(https://x.test/a.jpg)")).toBe("https://x.test/a.jpg");
    expect(cssUrl("url('a.png')")).toBe("a.png");
  });
  it("returns null for none or gradients only", () => {
    expect(cssUrl("none")).toBeNull();
    expect(cssUrl("linear-gradient(red, blue)")).toBeNull();
    expect(cssUrl(undefined)).toBeNull();
  });
});

describe("resolveSource", () => {
  it("classifies urls", () => {
    expect(resolveSource("data:image/png;base64,AAA", o)?.kind).toBe("data");
    expect(resolveSource("/api/image?q=x", o)).toEqual({ url: `${o}/api/image?q=x`, kind: "same-origin" });
    expect(resolveSource("https://cdn.example.com/a.jpg", o)?.kind).toBe("cross-origin");
  });
  it("rejects svg data, blob, other schemes and empties", () => {
    expect(resolveSource("data:image/svg+xml;base64,AAA", o)).toBeNull();
    expect(resolveSource("blob:http://localhost:5175/x", o)).toBeNull();
    expect(resolveSource("javascript:alert(1)", o)).toBeNull();
    expect(resolveSource("", o)).toBeNull();
  });
});

describe("pickSource", () => {
  it("prefers the img over a background", () => {
    expect(pickSource({ type: "image", imgSrc: "/a.jpg", bgImage: 'url("/b.jpg")', origin: o })?.url).toBe(`${o}/a.jpg`);
  });
  it("uses a container background photo", () => {
    expect(pickSource({ type: "container", bgImage: 'url("https://x.test/b.jpg")', origin: o })?.kind).toBe("cross-origin");
  });
  it("sends nothing for text nodes, or a container without a photo", () => {
    expect(pickSource({ type: "text", imgSrc: "/a.jpg", origin: o })).toBeNull();
    expect(pickSource({ type: "container", bgImage: "none", origin: o })).toBeNull();
  });
});
