import type { AxNode, LocateKind } from "@create/shared";
import { ANCESTOR_KIND_TO_LOCATE, classifyIntent, pickAncestors, rankParts, smallest, type Parts } from "../container";
import { contains } from "../geometry";
import type { LocateProvider } from "../types";

/** Container roles (native macOS AX and web/CDP names). */
const CONTAINER_ROLES: Record<string, LocateKind> = {
  AXTable: "table",
  AXGrid: "table",
  table: "table",
  grid: "table",
  treegrid: "table",
  AXOutline: "list",
  AXList: "list",
  AXBrowser: "list",
  list: "list",
  AXLayoutArea: "chart",
  figure: "chart",
  "graphics-document": "chart",
  article: "list",
};
const ROW_ROLES = new Set(["AXRow", "row", "listitem"]);
const CELL_ROLES = new Set(["AXCell", "cell", "gridcell", "columnheader", "rowheader"]);
const SIMPLE_ROLES: Record<string, LocateKind> = {
  AXButton: "button",
  AXPopUpButton: "button",
  AXLink: "button",
  AXStaticText: "text",
  AXTextArea: "text",
  AXTextField: "text",
  AXImage: "image",
  button: "button",
  link: "button",
  heading: "text",
  image: "image",
  img: "image",
};
const SKIP_DEEPEST = new Set(["AXWindow", "AXWebArea", "RootWebArea", "WebArea"]);
const label = (n: AxNode, kind: LocateKind) => (n.title?.trim() || n.value?.trim() || `${kind} (${n.role})`).slice(0, 120);

/**
 * Accessibility locate: nodes whose frame contains the cursor, split into the smallest container (table/grid/list/chart),
 * row and cell. `ancestors` on a node fills whatever the tree did not contain. The utterance orders them; frames are clipped to the capture.
 */
export const locateAx: LocateProvider = async ({ input, image }) => {
  if (!input.ax || !input.cursor) return [];
  const cursor = input.cursor;
  const hits: AxNode[] = [];
  const walk = (n: AxNode): void => {
    if (!contains(n.frame, cursor)) return;
    if (n.frame.w > 0 && n.frame.h > 0) hits.push(n);
    for (const c of n.children ?? []) walk(c);
  };
  walk(input.ax);

  const containerNode = smallest(hits.filter((n) => CONTAINER_ROLES[n.role]));
  const rowNode = smallest(hits.filter((n) => ROW_ROLES.has(n.role)));
  const cellNode = smallest(hits.filter((n) => CELL_ROLES.has(n.role))) ?? smallest(hits.filter((n) => !SKIP_DEEPEST.has(n.role) && !CONTAINER_ROLES[n.role] && !ROW_ROLES.has(n.role)));

  const parts: Parts = {};
  if (containerNode) {
    const kind = CONTAINER_ROLES[containerNode.role]!;
    parts.container = { box: containerNode.frame, kind, label: label(containerNode, kind) };
  }
  if (rowNode) parts.row = { box: rowNode.frame, kind: "table", label: label(rowNode, "table") };
  if (cellNode) {
    const kind = SIMPLE_ROLES[cellNode.role] ?? "other";
    parts.cell = { box: cellNode.frame, kind, label: label(cellNode, kind) };
  }
  // Fill gaps from the ancestors the collector/extension attached to the best-known node (or the root).
  const anc = pickAncestors(cellNode?.ancestors ?? rowNode?.ancestors ?? containerNode?.ancestors ?? input.ax.ancestors);
  if (!parts.row && anc.row) parts.row = { box: anc.row.rect, kind: "table", label: `row (${anc.row.role ?? anc.row.tag})` };
  if (!parts.container && anc.container) parts.container = { box: anc.container.rect, kind: ANCESTOR_KIND_TO_LOCATE[anc.container.kind], label: `${anc.container.kind} (${anc.container.role ?? anc.container.tag})` };

  return rankParts(parts, { source: "ax", intent: classifyIntent(input.utterance), cursor, size: image?.coord ?? input.imageSize, topConfidence: 0.95 });
};
