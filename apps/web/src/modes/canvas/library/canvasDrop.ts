import { AssetRecordType, createShapeId, type Editor } from "tldraw";

export type LibraryKind = "icon" | "photo";
export interface LibraryDrag {
  libraryKind: LibraryKind;
  /** Iconify name ("lucide:star") for icons, https URL for photos. */
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
    if ((v.libraryKind === "icon" || v.libraryKind === "photo") && typeof v.value === "string" && v.value.length < 2000) {
      return { libraryKind: v.libraryKind, value: v.value, label: typeof v.label === "string" ? v.label : undefined };
    }
  } catch {
    /* ignore malformed drops */
  }
  return null;
}

/** Add a library item to the tldraw canvas as an image shape tagged with meta {libraryKind, value}. */
export function addLibraryItemToCanvas(editor: Editor, item: LibraryDrag, pagePoint?: { x: number; y: number }): void {
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
