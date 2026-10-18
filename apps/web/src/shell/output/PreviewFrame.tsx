import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

const SKELETON = '<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;overflow:hidden"><div id="root"></div></body></html>';

/** Copy the host page's stylesheets and theme attributes into the frame document. */
export function syncFrameHead(host: Document, frame: Document): void {
  frame.head.querySelectorAll("[data-host-copy]").forEach((n) => n.remove());
  host.head.querySelectorAll('link[rel="stylesheet"], style').forEach((n) => {
    const c = n.cloneNode(true) as HTMLElement;
    c.setAttribute("data-host-copy", "");
    frame.head.appendChild(c);
  });
  for (const el of ["documentElement", "body"] as const) {
    const from = host[el];
    const to = frame[el];
    to.className = from.className;
    for (const a of Array.from(from.attributes)) {
      if (a.name.startsWith("data-")) to.setAttribute(a.name, a.value);
    }
  }
}

/**
 * Renders children into a same-origin iframe document so the preview's
 * [data-screen-root] / data-node-id never appear in the main document.
 */
export function PreviewFrame({ children, width, height, title }: { children: ReactNode; width: number; height: number; title: string }) {
  const [mount, setMount] = useState<HTMLElement | null>(null);
  const [frame, setFrame] = useState<HTMLIFrameElement | null>(null);

  useEffect(() => {
    if (!frame) return;
    let obs: MutationObserver | null = null;
    const attach = () => {
      const doc = frame.contentDocument;
      const root = doc?.getElementById("root");
      if (!doc || !root) return;
      syncFrameHead(document, doc);
      setMount(root);
      obs?.disconnect();
      obs = new MutationObserver(() => syncFrameHead(document, doc));
      obs.observe(document.head, { childList: true, subtree: true, characterData: true });
      obs.observe(document.documentElement, { attributes: true });
    };
    frame.addEventListener("load", attach);
    if (frame.contentDocument?.getElementById("root")) attach();
    return () => {
      frame.removeEventListener("load", attach);
      obs?.disconnect();
    };
  }, [frame]);

  return (
    <>
      <iframe ref={setFrame} scrolling="no" title={title} srcDoc={SKELETON} tabIndex={-1} aria-hidden style={{ width, height, border: 0, display: "block", background: "transparent" }} />
      {mount && createPortal(children, mount)}
    </>
  );
}
