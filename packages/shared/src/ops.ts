import { z } from "zod";
import { FONTS, NodeSchema, ScreenSchema, StyleSchema, type Node, type Screen } from "./schema";
import { findNode, insertNode, removeNode, replaceNode, uniqueId, updateNode, updateStyle, walkNodes, childrenOf } from "./tree";

/**
 * Typed edit operations on a Screen. A model (or the canvas) proposes ops; applyOps validates
 * and applies them with the immutable helpers in ./tree. No HTML, CSS or script is ever involved.
 */

export const ScreenOpSchema = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("insert"),
    parentId: z.string().nullable().describe("Container id to insert into, or null for the top level"),
    index: z.number().int().min(0).optional().describe("Position among siblings; omit to append"),
    node: NodeSchema,
  }),
  z.object({
    op: z.literal("replace"),
    targetId: z.string(),
    nodes: z.array(NodeSchema).min(1).max(20),
  }),
  z.object({ op: z.literal("remove"), targetId: z.string() }),
  z.object({ op: z.literal("style"), targetId: z.string(), style: StyleSchema }),
  z.object({
    op: z.literal("update"),
    targetId: z.string(),
    patch: z.record(z.string(), z.unknown()).describe("Fields to change on the node; id, type and children are ignored"),
  }),
  z.object({
    op: z.literal("page"),
    title: z.string().optional(),
    theme: z.enum(["light", "dark"]).optional(),
    accent: ScreenSchema.shape.accent.optional(),
    font: z.enum(FONTS).optional(),
  }),
]);
export type ScreenOp = z.infer<typeof ScreenOpSchema>;

export const ScreenOpsSchema = z.array(ScreenOpSchema).max(40);

export type ApplyOpsResult = {
  screen: Screen;
  applied: number;
  skipped: { index: number; reason: string }[];
  changedIds: string[];
};

export function emptyScreen(title = "Untitled page"): Screen {
  return { title, theme: "light", accent: null, font: "sans", children: [] };
}

/** Rename any id in `node` (and descendants) that is already taken, recording the final ids. */
function freshen(screen: Screen, node: Node, taken: Set<string>): Node {
  let id = node.id;
  while (taken.has(id)) id = uniqueId(screen, node.id);
  taken.add(id);
  return node.type === "container"
    ? { ...node, id, children: node.children.map((c) => freshen(screen, c, taken)) }
    : { ...node, id };
}

function takenIds(screen: Screen): Set<string> {
  const s = new Set<string>();
  walkNodes(screen.children, (n) => s.add(n.id));
  return s;
}

export function applyOps(input: Screen | null, ops: ScreenOp[]): ApplyOpsResult {
  let screen: Screen = input ?? emptyScreen();
  const skipped: { index: number; reason: string }[] = [];
  const changed: string[] = [];
  let applied = 0;

  ops.forEach((op, index) => {
    const skip = (reason: string) => void skipped.push({ index, reason });
    switch (op.op) {
      case "insert": {
        if (op.parentId !== null) {
          const parent = findNode(screen, op.parentId);
          if (!parent) return skip(`unknown parent "${op.parentId}"`);
          if (parent.type !== "container") return skip(`parent "${op.parentId}" is not a container`);
        }
        const node = freshen(screen, op.node, takenIds(screen));
        const at = op.index ?? childrenOf(screen, op.parentId).length;
        screen = insertNode(screen, node, op.parentId, at);
        changed.push(node.id);
        applied++;
        return;
      }
      case "replace": {
        if (!findNode(screen, op.targetId)) return skip(`unknown target "${op.targetId}"`);
        const res = replaceNode(screen, op.targetId, op.nodes);
        screen = res.screen;
        changed.push(...res.ids);
        applied++;
        return;
      }
      case "remove": {
        if (!findNode(screen, op.targetId)) return skip(`unknown target "${op.targetId}"`);
        screen = removeNode(screen, op.targetId);
        changed.push(op.targetId);
        applied++;
        return;
      }
      case "style": {
        if (!findNode(screen, op.targetId)) return skip(`unknown target "${op.targetId}"`);
        screen = updateStyle(screen, op.targetId, op.style);
        changed.push(op.targetId);
        applied++;
        return;
      }
      case "update": {
        const node = findNode(screen, op.targetId);
        if (!node) return skip(`unknown target "${op.targetId}"`);
        const { id: _id, type: _type, children: _children, ...patch } = op.patch;
        const parsed = NodeSchema.safeParse({ ...node, ...patch });
        if (!parsed.success) return skip(`invalid patch for "${op.targetId}": ${parsed.error.issues[0]?.message ?? "invalid"}`);
        screen = updateNode(screen, op.targetId, parsed.data);
        changed.push(op.targetId);
        applied++;
        return;
      }
      case "page": {
        const next = { ...screen };
        if (op.title !== undefined) next.title = op.title;
        if (op.theme !== undefined) next.theme = op.theme;
        if (op.accent !== undefined) next.accent = op.accent;
        if (op.font !== undefined) next.font = op.font;
        screen = next;
        applied++;
        return;
      }
    }
  });

  return { screen, applied, skipped, changedIds: [...new Set(changed)] };
}
