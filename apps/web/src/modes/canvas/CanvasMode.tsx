/**
 * Placeholder for the Canvas mode (teammate-owned).
 * To plug in: build a `Screen` (see @create/shared) from the drawn shapes and call
 * `useScreenStore.getState().setScreen(screen, "summary")`.
 */
export function CanvasMode() {
  return (
    <div className="w-full rounded-2xl border border-dashed border-white/15 bg-neutral-900/50 p-6 text-center text-sm text-neutral-400">
      <p className="font-medium text-neutral-200">Canvas mode goes here.</p>
      <p className="mt-1">
        Draw shapes → build a <code className="rounded bg-neutral-800 px-1">Screen</code> from{" "}
        <code className="rounded bg-neutral-800 px-1">@create/shared</code> → call{" "}
        <code className="rounded bg-neutral-800 px-1">useScreenStore.getState().setScreen(screen)</code>.
      </p>
    </div>
  );
}
