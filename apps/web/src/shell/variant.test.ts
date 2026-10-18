import { describe, expect, it } from "vitest";
import { variantFromSearch } from "./variant";

describe("variantFromSearch", () => {
  it("accepts the three palette names", () => {
    expect(variantFromSearch("?variant=graphite")).toBe("graphite");
    expect(variantFromSearch("?a=1&variant=warm")).toBe("warm");
    expect(variantFromSearch("?variant=ink")).toBe("ink");
  });
  it("ignores anything else", () => {
    expect(variantFromSearch("")).toBeNull();
    expect(variantFromSearch("?variant=paper")).toBeNull();
    expect(variantFromSearch("?variant=")).toBeNull();
  });
});
