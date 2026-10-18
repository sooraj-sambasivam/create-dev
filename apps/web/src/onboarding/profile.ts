import { create } from "zustand";
import { persist } from "zustand/middleware";

/** Who the user is, from first-run onboarding. Drives wording, default mode and developer detail. */
export type ProfileIntent = "build" | "ask" | "both";
export type ProfileLevel = "none" | "some" | "dev";

type ProfileState = {
  intent: ProfileIntent;
  level: ProfileLevel;
  onboarded: boolean;
  set: (patch: Partial<Pick<ProfileState, "intent" | "level" | "onboarded">>) => void;
};

export const useProfile = create<ProfileState>()(
  persist(
    (set) => ({ intent: "both", level: "some", onboarded: false, set: (patch) => set(patch) }),
    { name: "create.profile" },
  ),
);

/** Technical users see endpoints, JSON and code export. */
export const isTechnical = (level: ProfileLevel) => level === "dev";
