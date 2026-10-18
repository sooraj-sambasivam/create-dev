import { beforeEach, describe, expect, it } from "vitest";
import { pinFromClick, usePin } from "./pinStore";

const hit = (id: string) => ({ id, label: "heading: A", area: 1, box: { x: 0, y: 0, w: 1, h: 1 } });

describe("pinFromClick", () => {
  it("pins a clicked element, unpins on the same one or on empty space", () => {
    expect(pinFromClick(hit("a"), null)?.id).toBe("a");
    expect(pinFromClick(hit("b"), hit("a"))?.id).toBe("b");
    expect(pinFromClick(hit("a"), hit("a"))).toBeNull();
    expect(pinFromClick(null, hit("a"))).toBeNull();
  });
});

describe("usePin", () => {
  beforeEach(() => usePin.getState().unpin());
  it("holds and clears the pin", () => {
    usePin.getState().pin(hit("a"));
    expect(usePin.getState().pinned?.id).toBe("a");
    usePin.getState().unpin();
    expect(usePin.getState().pinned).toBeNull();
  });
});
