import { create } from "zustand";

export type Permission = "read-only" | "ask" | "approve";
export type ModelId = "sonnet-5.5" | "haiku-5.5";

export const PERMISSIONS: { id: Permission; label: string; hint: string }[] = [
  { id: "read-only", label: "Read only", hint: "Create-dev only looks, never changes anything" },
  { id: "ask", label: "Ask before writing", hint: "Create-dev asks before each change" },
  { id: "approve", label: "Approve for me", hint: "Create-dev applies changes without asking" },
];

export const MODELS: { id: ModelId; label: string }[] = [
  { id: "sonnet-5.5", label: "Sonnet 5.5" },
  { id: "haiku-5.5", label: "Haiku 5.5" },
];

export const CONNECTORS = [
  { id: "github", label: "GitHub" },
  { id: "gdrive", label: "Google Drive" },
  { id: "gmail", label: "Gmail" },
  { id: "notion", label: "Notion" },
] as const;

export const PLUGINS = [
  { id: "design", label: "Design" },
  { id: "research", label: "Research" },
  { id: "writing", label: "Writing" },
] as const;

export interface ComposerProject {
  id: string;
  name: string;
}

interface ComposerSettings {
  permission: Permission;
  model: ModelId;
  connectors: Record<string, boolean>;
  plugins: Record<string, boolean>;
  projects: ComposerProject[];
  projectId: string | null;
  setPermission: (p: Permission) => void;
  setModel: (m: ModelId) => void;
  toggleConnector: (id: string) => void;
  togglePlugin: (id: string) => void;
  selectProject: (id: string | null) => void;
  createProject: (name: string) => void;
}

export const useComposerSettings = create<ComposerSettings>((set) => ({
  permission: "approve",
  model: "sonnet-5.5",
  connectors: {},
  plugins: {},
  projects: [
    { id: "p1", name: "Personal site" },
    { id: "p2", name: "Landing page" },
  ],
  projectId: null,
  setPermission: (permission) => set({ permission }),
  setModel: (model) => set({ model }),
  toggleConnector: (id) => set((s) => ({ connectors: { ...s.connectors, [id]: !s.connectors[id] } })),
  togglePlugin: (id) => set((s) => ({ plugins: { ...s.plugins, [id]: !s.plugins[id] } })),
  selectProject: (projectId) => set({ projectId }),
  createProject: (name) =>
    set((s) => {
      const trimmed = name.trim();
      if (!trimmed) return s;
      const id = `p${Date.now().toString(36)}${s.projects.length}`;
      return { projects: [...s.projects, { id, name: trimmed }], projectId: id };
    }),
}));
