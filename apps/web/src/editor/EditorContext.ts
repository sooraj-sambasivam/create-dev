import { createContext, useContext } from "react";

export const ROOT_ID = "__root__";

export interface DropTarget {
  parentId: string | null;
  index: number;
  indicator: { nodeId: string; position: "before" | "after" | "inside"; axis: "x" | "y" };
}

/** Data attached to every droppable so the drag handlers can work out where a drop lands. */
export interface DropData {
  nodeId: string;
  parentId: string | null;
  index: number;
  parentDirection: "row" | "column";
  isContainer: boolean;
  isRoot: boolean;
  childCount: number;
}

export interface EditorState {
  editable: boolean;
  dropTarget: DropTarget | null;
  draggingId: string | null;
  resizing: { id: string; pct: number } | null;
  setResizing: (r: { id: string; pct: number } | null) => void;
  hoveredId: string | null;
  setHovered: (id: string | null) => void;
}

export const EditorContext = createContext<EditorState>({
  editable: false,
  dropTarget: null,
  draggingId: null,
  resizing: null,
  setResizing: () => {},
  hoveredId: null,
  setHovered: () => {},
});

export const useEditor = () => useContext(EditorContext);

export const TYPE_LABELS: Record<string, string> = {
  container: "Group",
  heading: "Heading",
  text: "Text",
  textbox: "Text box",
  button: "Button",
  image: "Image",
  checkbox: "Checkbox",
  select: "Dropdown",
  link: "Link",
  divider: "Divider",
};

/** Node types whose main text can be edited by double-clicking it. */
export const INLINE_FIELD: Record<string, string | undefined> = {
  heading: "text",
  text: "text",
  button: "label",
  link: "text",
  checkbox: "label",
  textbox: "label",
  select: "label",
};
