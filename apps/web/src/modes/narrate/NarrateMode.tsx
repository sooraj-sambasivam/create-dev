/**
 * Placeholder for the Narrate mode (teammate-owned): point at a region and say what goes there.
 * Reuse `useRecorder` + `transcribe()` from ../../lib for the voice half, then call
 * `useScreenStore.getState().generate(prompt)` with the pointed-at node id in the prompt.
 */
export function NarrateMode() {
  return (
    <div className="w-full rounded-2xl border border-dashed border-white/15 bg-neutral-900/50 p-6 text-center text-sm text-neutral-400">
      <p className="font-medium text-neutral-200">Narrate mode goes here.</p>
      <p className="mt-1">
        Point at a spot on the screen, speak, and send the prompt with the target node id via{" "}
        <code className="rounded bg-neutral-800 px-1">useScreenStore.getState().generate(prompt)</code>.
      </p>
    </div>
  );
}
