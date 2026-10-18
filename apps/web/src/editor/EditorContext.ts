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
  container: "Box",
  heading: "Heading",
  text: "Text",
  button: "Button",
  link: "Link",
  icon: "Icon",
  image: "Image",
  avatar: "Avatar",
  badge: "Badge",
  list: "List",
  rating: "Rating",
  table: "Table",
  accordion: "FAQ",
  video: "Video",
  map: "Map",
  textbox: "Text box",
  checkbox: "Checkbox",
  select: "Dropdown",
  data: "Live data",
  divider: "Divider",
  spacer: "Spacer",
};
