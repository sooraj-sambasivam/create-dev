"use client";

import dynamic from "next/dynamic";
import { useRef, useState } from "react";
import type { Editor } from "tldraw";
import "tldraw/tldraw.css";

const Canvas = dynamic(async () => (await import("tldraw")).Tldraw, {
  ssr: false,
});

export default function Home() {
  const editorRef = useRef<Editor | null>(null);
  const [html, setHtml] = useState("");
  const [generating, setGenerating] = useState(false);

  async function onGenerate() {
    const editor = editorRef.current;
    if (!editor || generating) return;

    const shapes = editor.getCurrentPageShapes();
    if (shapes.length === 0) return;

    setGenerating(true);
    try {
      const { blob } = await editor.toImage(shapes, { format: "png" });
      const image = await blobToBase64(blob);
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image }),
      });
      if (!response.ok) return;
      const data = (await response.json()) as { html?: unknown };
      if (typeof data.html === "string") setHtml(data.html);
    } finally {
      setGenerating(false);
    }
  }

  return (
    <main className="flex h-screen w-screen">
      <section className="flex h-full w-1/2 min-w-0 flex-col border-r border-neutral-300">
        <div className="relative min-h-0 flex-1">
          <div className="absolute inset-0">
            <Canvas
              onMount={(editor) => {
                editorRef.current = editor;
              }}
            />
          </div>
        </div>
        <div className="shrink-0 border-t border-neutral-300 p-3">
          <button
            type="button"
            className="rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            disabled={generating}
            onClick={() => {
              void onGenerate();
            }}
          >
            {generating ? "Generating…" : "Generate"}
          </button>
        </div>
      </section>
      <section className="h-full w-1/2 min-w-0" aria-label="Preview">
        {html ? (
          <iframe
            title="Preview"
            className="h-full w-full border-0 bg-white"
            sandbox="allow-scripts"
            srcDoc={html}
          />
        ) : null}
      </section>
    </main>
  );
}

function blobToBase64(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("Failed to encode image"));
        return;
      }
      const comma = result.indexOf(",");
      resolve(comma === -1 ? result : result.slice(comma + 1));
    };
    reader.onerror = () =>
      reject(reader.error ?? new Error("Failed to encode image"));
    reader.readAsDataURL(blob);
  });
}
