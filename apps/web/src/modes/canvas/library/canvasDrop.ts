import { AssetRecordType, createShapeId, toRichText, type Editor } from "tldraw";

export type LibraryKind = "icon" | "photo" | "section" | "motion";
export interface LibraryDrag {
  libraryKind: LibraryKind;
  /** Iconify name ("lucide:star") for icons, https URL for photos, template id for sections, preset id for motion. */
  value: string;
  label?: string;
}

export const LIBRARY_MIME = "application/x-create-library";

export function iconUrl(name: string): string {
  const [prefix, icon] = name.split(":");
  return `https://api.iconify.design/${prefix}/${icon}.svg`;
}

export function libraryImageUrl(item: LibraryDrag): string {
  return item.libraryKind === "icon" ? iconUrl(item.value) : item.value;
}

export function setLibraryDrag(e: { dataTransfer: DataTransfer | null }, item: LibraryDrag): void {
  e.dataTransfer?.setData(LIBRARY_MIME, JSON.stringify(item));
  e.dataTransfer?.setData("text/plain", item.value);
  if (e.dataTransfer) e.dataTransfer.effectAllowed = "copy";
}

export function readLibraryDrag(dt: DataTransfer | null): LibraryDrag | null {
  try {
    const raw = dt?.getData(LIBRARY_MIME);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<LibraryDrag>;
    if ((v.libraryKind === "icon" || v.libraryKind === "photo" || v.libraryKind === "section" || v.libraryKind === "motion") && typeof v.value === "string" && v.value.length < 2000) {
      return { libraryKind: v.libraryKind, value: v.value, label: typeof v.label === "string" ? v.label : undefined };
    }
  } catch {
    /* ignore malformed drops */
  }
  return null;
}

/** Add a library item to the tldraw canvas tagged with meta {libraryKind, value}: icons and photos as images, sections and motion as labelled frames. */
export function addLibraryItemToCanvas(editor: Editor, item: LibraryDrag, pagePoint?: { x: number; y: number }): void {
  if (item.libraryKind === "section" || item.libraryKind === "motion") {
    const w = item.libraryKind === "section" ? 480 : 200;
    const h = item.libraryKind === "section" ? 160 : 80;
    const c = pagePoint ?? editor.getViewportPageBounds().center;
    const text = item.label ?? item.value;
    editor.createShape({
      id: createShapeId(),
      type: "geo",
      x: c.x - w / 2,
      y: c.y - h / 2,
      props: { geo: "rectangle", w, h, dash: item.libraryKind === "motion" ? "dashed" : "draw", richText: toRichText(item.libraryKind === "motion" ? `Motion: ${text}` : text) },
      meta: { libraryKind: item.libraryKind, value: item.value },
    });
    return;
  }
  const size = item.libraryKind === "icon" ? 96 : 320;
  const h = item.libraryKind === "icon" ? 96 : 213;
  const center = pagePoint ?? editor.getViewportPageBounds().center;
  const assetId = AssetRecordType.createId();
  editor.createAssets([
    {
      id: assetId,
      typeName: "asset",
      type: "image",
      props: { name: item.label ?? item.value, src: libraryImageUrl(item), w: size, h, mimeType: item.libraryKind === "icon" ? "image/svg+xml" : "image/jpeg", isAnimated: false },
      meta: {},
    },
  ]);
  editor.createShape({
    id: createShapeId(),
    type: "image",
    x: center.x - size / 2,
    y: center.y - h / 2,
    props: { assetId, w: size, h },
    meta: { libraryKind: item.libraryKind, value: item.value },
  });
}

/** Handle a drop event over the canvas container. Returns true when it was a library item. */
export function handleLibraryDrop(editor: Editor, e: { dataTransfer: DataTransfer | null; clientX: number; clientY: number; preventDefault(): void }): boolean {
  const item = readLibraryDrag(e.dataTransfer);
  if (!item) return false;
  e.preventDefault();
  addLibraryItemToCanvas(editor, item, editor.screenToPage({ x: e.clientX, y: e.clientY }));
  return true;
}
