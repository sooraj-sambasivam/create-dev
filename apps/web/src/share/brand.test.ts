import { describe, expect, it } from "vitest";
import { APP_NAME, sharedDocumentTitle } from "./brand";

describe("brand", () => {
  it("uses the product name Create", () => {
    expect(APP_NAME).toBe("Create");
  });
});

describe("sharedDocumentTitle", () => {
  it("appends the product name to the prototype title", () => {
    expect(sharedDocumentTitle("Landing page")).toBe("Landing page · Create");
  });

  it("trims the prototype title", () => {
    expect(sharedDocumentTitle("  Menu  ")).toBe("Menu · Create");
  });

  it("falls back to the product name when the title is empty or missing", () => {
    expect(sharedDocumentTitle("")).toBe("Create");
    expect(sharedDocumentTitle("   ")).toBe("Create");
    expect(sharedDocumentTitle(null)).toBe("Create");
    expect(sharedDocumentTitle(undefined)).toBe("Create");
  });

  it("never uses the old repository name", () => {
    expect(sharedDocumentTitle("x")).not.toContain("create-dev");
    expect(sharedDocumentTitle("")).not.toContain("create-dev");
  });
});
