import { describe, expect, it } from "vitest";
import { classifyImageSrc, fitSize, matchOffered, sameWord } from "./pointerLogic";

const offered = ["Heading · Welcome", "Button · Buy now", "Image · coffee cup"];

describe("matchOffered", () => {
  it("matches a label word", () => {
    expect(matchOffered("the button", offered)).toBe(1);
    expect(matchOffered("welcome", offered)).toBe(0);
  });
  it("is fuzzy", () => {
    expect(matchOffered("the cofee cup", offered)).toBe(2);
    expect(matchOffered("buttons please", offered)).toBe(1);
  });
  it("accepts ordinals", () => {
    expect(matchOffered("the second one", offered)).toBe(1);
    expect(matchOffered("the last one", offered)).toBe(2);
  });
  it("returns null when nothing or two match", () => {
    expect(matchOffered("make it red", offered)).toBeNull();
    expect(matchOffered("the heading", ["Heading · A", "Heading · B"])).toBeNull();
    expect(matchOffered("", offered)).toBeNull();
  });
});

describe("sameWord", () => {
  it("tolerates one typo only in longer words", () => {
    expect(sameWord("welcome", "welcom")).toBe(true);
    expect(sameWord("cat", "car")).toBe(false);
  });
});

describe("classifyImageSrc", () => {
  const o = "http://localhost:5175";
  it("accepts data and same-origin, rejects the rest", () => {
    expect(classifyImageSrc("data:image/png;base64,AAA", o)).toBe("data");
    expect(classifyImageSrc("/img/a.png", o)).toBe("same-origin");
    expect(classifyImageSrc("http://localhost:5175/a.jpg", o)).toBe("same-origin");
    expect(classifyImageSrc("https://cdn.example.com/a.jpg", o)).toBeNull();
    expect(classifyImageSrc("data:image/svg+xml;base64,AAA", o)).toBeNull();
    expect(classifyImageSrc("blob:http://localhost:5175/x", o)).toBeNull();
  });
});

describe("fitSize", () => {
  it("scales down, never up", () => {
    expect(fitSize(1600, 800, 800)).toEqual({ w: 800, h: 400 });
    expect(fitSize(100, 50, 800)).toEqual({ w: 100, h: 50 });
  });
});
