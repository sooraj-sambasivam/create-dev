import { create } from "zustand";
import { persist } from "zustand/middleware";

/** Chat answers and never edits; Code builds and edits the page. */
export type WorkMode = "chat" | "code";

type ModeState = { mode: WorkMode; setMode: (mode: WorkMode) => void };

export const useWorkMode = create<ModeState>()(
  persist((set) => ({ mode: "code", setMode: (mode) => set({ mode }) }), { name: "create.workMode" }),
);
