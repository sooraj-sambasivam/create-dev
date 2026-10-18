import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";

/** The shell theme the user picked. "system" follows prefers-color-scheme. */
export type ThemePreference = "light" | "dark" | "system";

/** The theme actually painted. */
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "create-theme";

/** Order the header toggle cycles through. */
export const THEME_ORDER: readonly ThemePreference[] = ["light", "dark", "system"];

export const THEME_LABEL: Record<ThemePreference, string> = {
  light: "Light",
  dark: "Dark",
  system: "System",
};

/** The next preference in the cycle light, dark, system, light. */
export function nextTheme(current: ThemePreference): ThemePreference {
  const index = THEME_ORDER.indexOf(current);
  return THEME_ORDER[(index + 1) % THEME_ORDER.length];
}

/** Resolves a preference to the theme that is painted, given the OS dark-mode flag. */
export function resolveTheme(preference: ThemePreference, systemPrefersDark: boolean): ResolvedTheme {
  if (preference === "system") return systemPrefersDark ? "dark" : "light";
  return preference;
}

const DARK_QUERY = "(prefers-color-scheme: dark)";

function systemPrefersDark(): boolean {
  try {
    return typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia(DARK_QUERY).matches
      : false;
  } catch {
    return false;
  }
}

/**
 * Writes the preference to `<html data-theme>` and toggles the `dark` class to match the
 * resolved theme. The colour tokens themselves live in index.css, keyed on data-theme.
 * Does nothing outside a browser (SSR, node tests).
 */
export function applyTheme(preference: ThemePreference): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.setAttribute("data-theme", preference);
  root.classList.toggle("dark", resolveTheme(preference, systemPrefersDark()) === "dark");
}

/** localStorage wrapped so a blocked or missing store never throws. */
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
      /* storage unavailable: the choice lasts for this page only */
    }
  },
  removeItem: (key) => {
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* storage unavailable */
    }
  },
};

export interface ThemeState {
  theme: ThemePreference;
  setTheme: (theme: ThemePreference) => void;
  cycleTheme: () => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: "system",
      setTheme: (theme) => set({ theme }),
      cycleTheme: () => set({ theme: nextTheme(get().theme) }),
    }),
    {
      name: THEME_STORAGE_KEY,
      storage: createJSONStorage(() => safeStorage),
      partialize: (state) => ({ theme: state.theme }),
    },
  ),
);

if (typeof window !== "undefined") {
  useThemeStore.subscribe((state) => applyTheme(state.theme));
  applyTheme(useThemeStore.getState().theme);

  // When the preference is "system", the painted theme follows the OS setting live.
  try {
    window.matchMedia(DARK_QUERY).addEventListener("change", () => {
      applyTheme(useThemeStore.getState().theme);
    });
  } catch {
    /* matchMedia unavailable: the theme is read again on the next change */
  }
}
