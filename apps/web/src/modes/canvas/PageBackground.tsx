import { useEditor, useValue } from "tldraw";
import { PAGE_W, pageHeightFor, sectionLines } from "./groups";
import { maxBottom } from "./pageCamera";

/**
 * The page frame behind the ink: a surface with a border-line edge and a dashed guide every 600 units.
 * Rendered in tldraw's Background slot (not camera-transformed), so it follows the camera by hand.
 */
export function PageBackground() {
  const editor = useEditor();
  const box = useValue(
    "page-frame",
    () => {
      const h = pageHeightFor(maxBottom(editor));
      const a = editor.pageToViewport({ x: 0, y: 0 });
      const b = editor.pageToViewport({ x: PAGE_W, y: h });
      const z = editor.getZoomLevel();
      return { left: a.x, top: a.y, width: b.x - a.x, height: b.y - a.y, z, h };
    },
    [editor],
  );
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden bg-shell">
      <div
        className="absolute rounded-lg border border-line bg-surface"
        style={{ left: box.left, top: box.top, width: box.width, height: box.height }}
      >
        {sectionLines(box.h).map((y) => (
          <div key={y} className="absolute inset-x-0 border-t border-dashed border-line" style={{ top: y * box.z }}>
            <span className="absolute right-2 top-1 text-xs text-ink-3">{y}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
