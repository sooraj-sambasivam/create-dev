import { describe, expect, it } from "vitest";
import { stripFences } from "./stripFences";

describe("stripFences", () => {
  it("strips ```html fences", () => {
    const input = '```html\n<div data-id="root">Hi</div>\n```';
    expect(stripFences(input)).toBe('<div data-id="root">Hi</div>');
  });

  it("strips bare ``` fences", () => {
    const input = '```\n<div data-id="root">Hi</div>\n```';
    expect(stripFences(input)).toBe('<div data-id="root">Hi</div>');
  });

  it("drops leading and trailing prose", () => {
    const input = [
      "Here is the page:",
      "```html",
      '<p data-id="p">Hi</p>',
      "```",
      "Let me know if you want changes.",
    ].join("\n");
    expect(stripFences(input)).toBe('<p data-id="p">Hi</p>');
  });

  it("returns the text when there are no fences", () => {
    expect(stripFences('<p data-id="p">Hi</p>')).toBe('<p data-id="p">Hi</p>');
  });
});
