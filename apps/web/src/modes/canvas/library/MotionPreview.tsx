import { useId, useState } from "react";
import { PRESETS, keyframesCss, type MotionPreset } from "../../../motion/presets";

/** A small live preview of one preset. Respects prefers-reduced-motion. */
export function MotionPreview({ preset }: { preset: MotionPreset }) {
  const [n, setN] = useState(0);
  const cls = `cd-mp-${useId().replace(/[^a-z0-9]/gi, "")}`;
  return (
    <div className="flex h-10 w-full items-center justify-center overflow-hidden" onMouseEnter={() => setN((v) => v + 1)}>
      <style>{`@media (prefers-reduced-motion: no-preference){${keyframesCss([preset])}.${cls}{animation:${PRESETS[preset].animation}}}`}</style>
      <div key={n} className={`${cls} h-5 w-8 rounded-[6px] bg-accent`} />
    </div>
  );
}
