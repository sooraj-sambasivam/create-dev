import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";

/** The two selectable looks. Paper is light (vermilion pen); Luminous is dark (magenta glow). */
export type Look = "paper" | "luminous";

export const LOOKS: readonly Look[] = ["paper", "luminous"];
export const LOOK_STORAGE_KEY = "create-look";

export const LOOK_LABEL: Record<Look, string> = { paper: "Paper", luminous: "Luminous" };
export const LOOK_BLURB: Record<Look, string> = {
  paper: "Warm paper, ink and a vermilion pen. Pointing draws and highlights.",
  luminous: "A dark room with a magenta glow. What you point at lights up.",
};

/** Whether a look paints a dark shell (drives the `dark` class and color-scheme). */
export const isDarkLook = (look: Look): boolean => look === "luminous";

/** Swatches for the onboarding picker: [shell, surface, ink, accent]. Mirror index.css. */
export const LOOK_SWATCH: Record<Look, readonly [string, string, string, string]> = {
  paper: ["#f1ebdd", "#fbf8f0", "#1f1c17", "#b8361d"],
  luminous: ["#0a0912", "#14122a", "#f3f1fa", "#ff3d9a"],
};

function systemPrefersDark(): boolean {
  try {
    return typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
      : false;
  } catch {
    return false;
  }
}

/**
 * The look used when the user has not chosen one: data-theme="dark" -> luminous, "light" -> paper,
 * otherwise (system or unset) prefers-color-scheme: dark -> luminous, else paper.
 */
export function defaultLook(): Look {
  if (typeof document !== "undefined") {
    const theme = document.documentElement.getAttribute("data-theme");
    if (theme === "dark") return "luminous";
    if (theme === "light") return "paper";
  }
  return systemPrefersDark() ? "luminous" : "paper";
}

/** Writes html[data-look], the `dark` class and color-scheme. No-op outside a browser. */
export function applyLook(look: Look): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.dataset.look = look;
  root.classList.toggle("dark", isDarkLook(look));
  root.style.colorScheme = isDarkLook(look) ? "dark" : "light";
}

const safeStorage: StateStorage = {
  getItem: (key) => {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem: (key, value) => {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      /* storage blocked: the look still applies for this session */
    }
  },
  removeItem: (key) => {
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  },
};

interface LookState {
  look: Look;
  /** True once the user (or onboarding) picked a look; false while it is the system default. */
  chosen: boolean;
  setLook: (look: Look) => void;
}

export const useLook = create<LookState>()(
  persist(
    (set) => ({
      look: defaultLook(),
      chosen: false,
      setLook: (look) => {
        applyLook(look);
        set({ look, chosen: true });
      },
    }),
    {
      name: LOOK_STORAGE_KEY,
      storage: createJSONStorage(() => safeStorage),
      partialize: (s) => ({ look: s.look, chosen: s.chosen }),
      onRehydrateStorage: () => (state) => {
        if (state) applyLook(state.chosen ? state.look : defaultLook());
      },
    },
  ),
);

if (typeof document !== "undefined") applyLook(useLook.getState().look);
