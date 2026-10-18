import { useEffect, useState } from "react";
import { typedSlice } from "./ink";

/** The text of `text` written on so far (a margin note typing itself). Reduced motion shows it all at once. */
export function useTyped(text: string, reduce: boolean | null, msPerChar = 18): string {
  const [n, setN] = useState(() => (reduce ? text.length : 0));
  useEffect(() => {
    if (reduce) {
      setN(text.length);
      return;
    }
    setN(0);
    const t0 = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const k = typedSlice(text, t - t0, msPerChar).length;
      setN(k);
      if (k < text.length) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [text, reduce, msPerChar]);
  return text.slice(0, n);
}
