import { create } from "zustand";
import type { LiftEntry } from "./runs";

/**
 * Regions lifted into live apps during this session. The thread draws each as a "Lifted in 4s" run
 * line plus a result card. Not persisted: the lifted app itself lives on the server.
 */
interface LiftLogState {
  entries: LiftEntry[];
  /** A lift is in flight (region read, app being built). */
  active: { startedAt: number } | null;
  add: (entry: LiftEntry) => void;
  begin: () => void;
  end: () => void;
  clear: () => void;
}

export const useLiftLog = create<LiftLogState>()((set) => ({
  entries: [],
  active: null,
  add: (entry) => set((s) => ({ entries: [...s.entries, entry] })),
  begin: () => set({ active: { startedAt: Date.now() } }),
  end: () => set({ active: null }),
  clear: () => set({ entries: [], active: null }),
}));
