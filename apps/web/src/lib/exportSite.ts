import type { Screen } from "@create/shared";
import { useScreenStore } from "../store/screenStore";

/**
 * Turn the current page into one self-contained HTML file a non-technical owner can upload
 * anywhere (e.g. Netlify Drop). It is captured from the live Preview rendering, so it looks
 * exactly like what they see: stock photos are swapped for their real URLs, uploads are
 * embedded, and the app's styles and fonts are inlined.
 */

const FONTS_HREF =
  "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Fraunces:opsz,wght@9..144,500;9..144,700&family=Space+Grotesk:wght@500;700&family=Nunito:wght@500;700;800&family=JetBrains+Mono:wght@500;700&family=Caveat:wght@600;700&display=swap";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

async function toDataUrl(url: string): Promise<string | null> {
  try {
    const blob = await (await fetch(url)).blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

const resolved = new Map<string, string | null>();
/** Map an app-relative image URL to something that works outside the app. */
async function portableUrl(url: string): Promise<string | null> {
  if (resolved.has(url)) return resolved.get(url)!;
  let out: string | null = url;
  if (url.startsWith("/api/image?")) {
    try {
      const data = (await (await fetch(url.replace("/api/image?", "/api/image/resolve?"))).json()) as { url: string | null };
      out = data.url;
    } catch {
      out = null;
    }
  } else if (url.startsWith("/api/uploads/")) {
    out = await toDataUrl(url);
  }
  resolved.set(url, out);
  return out;
}

function collectCss(): string {
  const parts: string[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      for (const rule of Array.from(sheet.cssRules)) parts.push(rule.cssText);
    } catch {
      // Cross-origin stylesheet (Google Fonts); linked separately.
    }
  }
  return parts.join("\n");
}

export async function exportSite(): Promise<{ filename: string; html: string }> {
  const store = useScreenStore.getState();
  const screen = store.screen as Screen | null;
  if (!screen) throw new Error("Build a page first.");

  // Capture from Preview so no editing outlines or handles end up in the file.
  const wasEditing = store.editMode;
  if (wasEditing) store.setEditMode(false);
  await sleep(1200); // let entrance animations and photos finish
  const live = document.querySelector<HTMLElement>("[data-screen-root]");
  if (!live) throw new Error("Couldn't find the page to export.");
  const root = live.cloneNode(true) as HTMLElement;
  if (wasEditing) store.setEditMode(true);

  // Anchors: "#menu" links need real ids in a plain HTML file.
  root.querySelectorAll<HTMLElement>("[data-node-id]").forEach((el) => {
    el.id = el.dataset.nodeId!;
    el.removeAttribute("data-node-id");
  });
  root.querySelectorAll(".shimmer-light").forEach((el) => el.remove());

  // Photos and uploads.
  for (const img of Array.from(root.querySelectorAll("img"))) {
    const src = img.getAttribute("src") ?? "";
    if (!src.startsWith("/")) continue;
    const url = await portableUrl(src);
    if (url) img.setAttribute("src", url);
    else (img.closest("figure") ?? img).remove();
  }
  for (const el of Array.from(root.querySelectorAll<HTMLElement>("[style*='url(']"))) {
    const style = el.getAttribute("style") ?? "";
    const matches = [...style.matchAll(/url\(&quot;([^&]+)&quot;\)|url\("([^"]+)"\)/g)];
    let next = style;
    for (const m of matches) {
      const url = m[1] ?? m[2];
      if (!url?.startsWith("/")) continue;
      const portable = await portableUrl(url);
      next = next.replace(url, portable ?? "");
    }
    el.setAttribute("style", next);
  }

  const css = collectCss();
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(screen.title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link rel="stylesheet" href="${FONTS_HREF}" />
<style>
${css}
html, body { margin: 0; background: none !important; background-image: none !important; }
[data-screen-root] { min-height: 100vh; }
html { scroll-behavior: smooth; }
</style>
</head>
<body>
${root.outerHTML}
</body>
</html>`;

  const slug = screen.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "my-website";
  return { filename: `${slug}.html`, html };
}

export function downloadFile(filename: string, contents: string) {
  const url = URL.createObjectURL(new Blob([contents], { type: "text/html" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
