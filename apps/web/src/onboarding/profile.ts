import { create } from "zustand";
import { persist } from "zustand/middleware";

/** Who the user is, from first-run onboarding. Drives wording, default mode and developer detail. */
export type ProfileIntent = "build" | "ask" | "both";
export type ProfileLevel = "none" | "some" | "dev";
export type ProfileDefaultMode = "chat" | "code";

type ProfileData = {
  intent: ProfileIntent;
  level: ProfileLevel;
  onboarded: boolean;
  /** True when the person left onboarding with Skip. Never reopens it automatically. */
  onboardingSkipped: boolean;
  onboardingVersion: number;
  /** Mode a new chat starts in; seeded from intent, editable in Settings. */
  defaultMode: ProfileDefaultMode;
};

type ProfileState = ProfileData & { set: (patch: Partial<ProfileData>) => void };

// No persist `version`: records written before these fields existed merge with the defaults below.
export const useProfile = create<ProfileState>()(
  persist(
    (set) => ({
      intent: "both",
      level: "some",
      onboarded: false,
      onboardingSkipped: false,
      onboardingVersion: 0,
      defaultMode: "code",
      set: (patch) => set(patch),
    }),
    { name: "create.profile" },
  ),
);

/** Technical users see endpoints, JSON and code export. */
export const isTechnical = (level: ProfileLevel) => level === "dev";
