import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { PermState } from "./steps";

/**
 * UI hints about permissions. The browser is the source of truth: on load the microphone state is
 * reconciled from the Permissions API, and this record is never treated as a grant.
 * No audio, device labels or other personal data are stored, only an opaque device id.
 */
type PermData = {
  mic: PermState;
  micDeviceId: string | null;
  micTestedAt: number | null;
  talkKeyTestedAt: number | null;
  asked: number | null;
};

type PermissionsStore = PermData & { set: (patch: Partial<PermData>) => void };

export const usePermissions = create<PermissionsStore>()(
  persist(
    (set) => ({
      mic: "unknown",
      micDeviceId: null,
      micTestedAt: null,
      talkKeyTestedAt: null,
      asked: null,
      set: (patch) => set(patch),
    }),
    { name: "create.permissions" },
  ),
);

/** A stored device id is a hint: use it only if the browser still lists it. */
export function resolveDeviceId(stored: string | null, devices: { id: string }[]): string | null {
  return stored && devices.some((d) => d.id === stored) ? stored : null;
}
