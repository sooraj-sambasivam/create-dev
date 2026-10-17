import { DIAGRAM_NODES, diagramEdges, type DiagramNode } from "./routes";

export const W = 480;
export const NODE_W = 124;
export const NODE_H = 30;
const ROW_GAP = 12;
const TOP = 8;
const COL_X = [0, (W - NODE_W) / 2, W - NODE_W];

export type LaidNode = DiagramNode & { x: number; y: number };
export type LaidEdge = { from: string; to: string; d: string };

export function layoutDiagram() {
  const counts = [0, 0, 0];
  for (const n of DIAGRAM_NODES) counts[n.col]++;
  const height = TOP * 2 + Math.max(...counts) * (NODE_H + ROW_GAP) - ROW_GAP;
  const rows = [0, 0, 0];
  const nodes: LaidNode[] = DIAGRAM_NODES.map((n) => {
    // Centre each column vertically so the single API node sits mid-height.
    const colH = counts[n.col] * (NODE_H + ROW_GAP) - ROW_GAP;
    const y = TOP + (height - TOP * 2 - colH) / 2 + rows[n.col]++ * (NODE_H + ROW_GAP);
    return { ...n, x: COL_X[n.col], y };
  });
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const edges: LaidEdge[] = [];
  for (const [a, b] of diagramEdges()) {
    const f = byId.get(a);
    const t = byId.get(b);
    if (!f || !t) continue;
    const x1 = f.x + NODE_W;
    const y1 = f.y + NODE_H / 2;
    const x2 = t.x - 4;
    const y2 = t.y + NODE_H / 2;
    const mx = (x1 + x2) / 2;
    edges.push({ from: a, to: b, d: `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}` });
  }
  return { nodes, edges, height };
}
