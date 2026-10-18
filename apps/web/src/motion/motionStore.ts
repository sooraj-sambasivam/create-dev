import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { isPreset, type MotionPreset } from "./presets";

/** chatId -> nodeId -> preset. */
export type MotionMap = Record<string, MotionPreset>;

interface MotionState {
  byChat: Record<string, MotionMap>;
  setPreset: (chatId: string, nodeId: string, preset: MotionPreset | null) => void;
  clearChat: (chatId: string) => void;
}

const noopStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };

export const MOTION_STORAGE_KEY = "create-dev:motion";

export const useMotionStore = create<MotionState>()(
  persist(
    (set) => ({
      byChat: {},
      setPreset: (chatId, nodeId, preset) =>
        set((s) => {
          const map = { ...(s.byChat[chatId] ?? {}) };
          if (preset && isPreset(preset)) map[nodeId] = preset;
          else delete map[nodeId];
          const byChat = { ...s.byChat };
          if (Object.keys(map).length) byChat[chatId] = map;
          else delete byChat[chatId];
          return { byChat };
        }),
      clearChat: (chatId) =>
        set((s) => {
          const byChat = { ...s.byChat };
          delete byChat[chatId];
          return { byChat };
        }),
    }),
    {
      name: MOTION_STORAGE_KEY,
      storage: createJSONStorage(() => {
        try {
          return typeof localStorage === "undefined" ? noopStorage : localStorage;
        } catch {
          return noopStorage;
        }
      }),
      partialize: (s) => ({ byChat: s.byChat }),
    },
  ),
);

export function motionFor(chatId: string | null): MotionMap {
  return chatId ? (useMotionStore.getState().byChat[chatId] ?? {}) : {};
}
