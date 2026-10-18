import type { AxNode, LocateKind, LocateResult } from "@create/shared";
import { area, contains } from "../geometry";
import type { LocateProvider } from "../types";

const DATA_ROLES: Record<string, LocateKind> = {
  AXTable: "table",
  AXGrid: "table",
  AXOutline: "list",
  AXList: "list",
  AXBrowser: "list",
  AXLayoutArea: "chart",
};
const SIMPLE_ROLES: Record<string, LocateKind> = {
  AXButton: "button",
  AXPopUpButton: "button",
  AXLink: "button",
  AXStaticText: "text",
  AXTextArea: "text",
  AXTextField: "text",
  AXImage: "image",
};
const label = (n: AxNode, kind: LocateKind) => (n.title?.trim() || n.value?.trim() || `${kind} (${n.role})`).slice(0, 120);

/**
 * Accessibility locate: walks the tree for nodes whose frame contains the cursor. The innermost
 * table/grid/list ancestor on the path wins (0.95); otherwise the smallest containing node (0.6).
 */
export const locateAx: LocateProvider = async ({ input }) => {
  if (!input.ax || !input.cursor) return [];
  const cursor = input.cursor;
  let data: AxNode | null = null;
  let deepest: AxNode | null = null;
  const walk = (n: AxNode): void => {
    if (!contains(n.frame, cursor)) return;
    if (DATA_ROLES[n.role] && n.frame.w > 0 && n.frame.h > 0) data = n;
    if (n.frame.w > 0 && n.frame.h > 0 && n.role !== "AXWindow" && (!deepest || area(n.frame) <= area(deepest.frame))) deepest = n;
    for (const c of n.children ?? []) walk(c);
  };
  walk(input.ax);
  const out: LocateResult[] = [];
  if (data) {
    const d: AxNode = data;
    const kind = DATA_ROLES[d.role]!;
    out.push({ box: d.frame, kind, label: label(d, kind), source: "ax", confidence: 0.95 });
  }
  if (deepest && deepest !== data) {
    const d: AxNode = deepest;
    const kind = SIMPLE_ROLES[d.role] ?? "other";
    out.push({ box: d.frame, kind, label: label(d, kind), source: "ax", confidence: data ? 0.4 : 0.6 });
  }
  return out;
};
