import { describe, expect, it, vi } from "vitest";
import { BUBBLE_OFFSET, clientToLocal, clientToPage, isInsideBox, placeBubble } from "./geometry";
import { attachPointerTracker, type PointerInfo } from "./pointerTracker";

const box = { left: 100, top: 50, width: 800, height: 600 };

function ptr(type: string, x: number, y: number, extra: Record<string, unknown> = {}): Event {
  const e = new Event(type, { cancelable: true, bubbles: true });
  Object.assign(e, { clientX: x, clientY: y, button: 0, shiftKey: false, ...extra });
  return e;
}

describe("inside / page coordinate mapping", () => {
  it("maps client coordinates to container-local ones", () => {
    expect(clientToLocal(box, 130, 90)).toEqual({ x: 30, y: 40 });
  });
  it("detects inside vs outside the container rect", () => {
    expect(isInsideBox(box, 100, 50)).toBe(true);
    expect(isInsideBox(box, 899, 649)).toBe(true);
    expect(isInsideBox(box, 900, 300)).toBe(false);
    expect(isInsideBox(box, 99, 300)).toBe(false);
    expect(isInsideBox(box, 300, 650)).toBe(false);
  });
  it("converts client points to rounded page coordinates through the camera", () => {
    const camera = { x: -20, y: 10, z: 2 };
    const screenToPage = (p: { x: number; y: number }) => ({ x: (p.x - box.left) / camera.z - camera.x, y: (p.y - box.top) / camera.z - camera.y });
    expect(clientToPage(screenToPage, 140, 90)).toEqual({ x: 40, y: 10 });
  });
});

describe("placeBubble", () => {
  const bubble = { w: 200, h: 60 };
  const area = { w: 800, h: 600 };
  it("sits 16px bottom-right of the pointer", () => {
    expect(placeBubble({ x: 100, y: 100 }, bubble, area)).toEqual({ x: 100 + BUBBLE_OFFSET, y: 100 + BUBBLE_OFFSET });
  });
  it("flips left and up near the right and bottom edges", () => {
    const p = placeBubble({ x: 780, y: 590 }, bubble, area);
    expect(p.x + bubble.w).toBeLessThanOrEqual(780 - BUBBLE_OFFSET + 0.001);
    expect(p.y + bubble.h).toBeLessThanOrEqual(590 - BUBBLE_OFFSET + 0.001);
  });
});

describe("attachPointerTracker", () => {
  function setup(opts: { lasso?: boolean; ui?: (t: EventTarget | null) => boolean } = {}) {
    const target = new EventTarget();
    const moves: PointerInfo[] = [];
    const onLeave = vi.fn();
    const lassoEnd = vi.fn();
    const detach = attachPointerTracker({
      target,
      getBox: () => box,
      isUi: opts.ui,
      lassoEnabled: () => !!opts.lasso,
      onMove: (i) => moves.push(i),
      onLeave,
      onLassoEnd: lassoEnd,
    });
    return { target, moves, onLeave, lassoEnd, detach };
  }

  it("a pointermove over the container reports local position and inside", () => {
    const { target, moves } = setup();
    target.dispatchEvent(ptr("pointermove", 250, 150));
    expect(moves).toHaveLength(1);
    expect(moves[0]).toMatchObject({ inside: true, local: { x: 150, y: 100 } });
  });

  it("a pointermove outside the container reports leave, not a move", () => {
    const { target, moves, onLeave } = setup();
    target.dispatchEvent(ptr("pointermove", 10, 10));
    expect(moves).toHaveLength(0);
    expect(onLeave).toHaveBeenCalledTimes(1);
  });

  it("a pointer over our own pill counts as outside so the bubble never covers the buttons", () => {
    const pill = {};
    const { target, moves, onLeave } = setup({ ui: (t) => t === pill });
    const e = ptr("pointermove", 250, 150);
    Object.defineProperty(e, "target", { value: pill });
    target.dispatchEvent(e);
    expect(moves).toHaveLength(0);
    expect(onLeave).toHaveBeenCalled();
  });

  it("Shift+drag lasso swallows the gesture so tldraw's brush never starts", () => {
    const { target, lassoEnd } = setup({ lasso: true });
    const seenByTldraw = vi.fn();
    // Registered after ours, in the bubble phase: a stopped event never reaches it.
    target.addEventListener("pointerdown", seenByTldraw);
    target.addEventListener("pointerup", seenByTldraw);
    target.dispatchEvent(ptr("pointerdown", 200, 100, { shiftKey: true }));
    target.dispatchEvent(ptr("pointerup", 400, 300, { shiftKey: true }));
    expect(seenByTldraw).not.toHaveBeenCalled();
    expect(lassoEnd).toHaveBeenCalledTimes(1);
    const [start, end, cancelled] = lassoEnd.mock.calls[0];
    expect(start.local).toEqual({ x: 100, y: 50 });
    expect(end.local).toEqual({ x: 300, y: 250 });
    expect(cancelled).toBe(false);
  });

  it("does not interfere with a plain drag", () => {
    const { target, lassoEnd } = setup({ lasso: true });
    const seen = vi.fn();
    target.addEventListener("pointerdown", seen);
    target.dispatchEvent(ptr("pointerdown", 200, 100));
    expect(seen).toHaveBeenCalledTimes(1);
    expect(lassoEnd).not.toHaveBeenCalled();
  });

  it("detach removes the listeners", () => {
    const { target, moves, detach } = setup();
    detach();
    target.dispatchEvent(ptr("pointermove", 250, 150));
    expect(moves).toHaveLength(0);
  });
});
