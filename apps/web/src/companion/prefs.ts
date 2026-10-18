export type CompanionPref = "on" | "dot" | "off";
const KEY = "create.companion";

export function readPref(): CompanionPref {
  try {
    const v = localStorage.getItem(KEY);
    return v === "dot" || v === "off" ? v : "on";
  } catch {
    return "on";
  }
}

export function writePref(v: CompanionPref): void {
  try {
    localStorage.setItem(KEY, v);
  } catch {
    /* storage unavailable */
  }
}
