import { useEffect, useState } from "react";

export type CardRect = { left: number; top: number; width: number; height: number };

/** Live bounds of the main work card (the shell's <main>), or null when it is not mounted. */
export function useCardRect(): CardRect | null {
  const [rect, setRect] = useState<CardRect | null>(null);
  useEffect(() => {
    const measure = () => {
      const el = document.querySelector("main");
      if (!el) return setRect(null);
      const r = el.getBoundingClientRect();
      setRect((p) =>
        p && p.left === r.left && p.top === r.top && p.width === r.width && p.height === r.height
          ? p
          : { left: r.left, top: r.top, width: r.width, height: r.height },
      );
    };
    measure();
    window.addEventListener("resize", measure);
    const el = document.querySelector("main");
    const ro = el && typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    if (el && ro) ro.observe(el);
    return () => {
      window.removeEventListener("resize", measure);
      ro?.disconnect();
    };
  }, []);
  return rect;
}
