import { create } from "zustand";

/** Lets the avatar menu reopen onboarding after it was finished or skipped. */
type OnboardingState = { replay: boolean; dismissed: boolean; open: () => void; close: () => void };

export const useOnboarding = create<OnboardingState>((set) => ({
  replay: false,
  dismissed: false,
  open: () => set({ replay: true, dismissed: false }),
  close: () => set({ replay: false, dismissed: true }),
}));
