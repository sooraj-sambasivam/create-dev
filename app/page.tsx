"use client";

import dynamic from "next/dynamic";
import "tldraw/tldraw.css";

const Canvas = dynamic(async () => (await import("tldraw")).Tldraw, {
  ssr: false,
});

export default function Home() {
  return (
    <main className="flex h-screen w-screen">
      <section className="flex h-full w-1/2 min-w-0 flex-col border-r border-neutral-300">
        <div className="relative min-h-0 flex-1">
          <div className="absolute inset-0">
            <Canvas />
          </div>
        </div>
        <div className="shrink-0 border-t border-neutral-300 p-3">
          <button
            type="button"
            className="rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white"
          >
            Generate
          </button>
        </div>
      </section>
      <section className="h-full w-1/2 min-w-0" aria-label="Preview" />
    </main>
  );
}
