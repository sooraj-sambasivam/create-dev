/** Push-to-talk key state machine. Pure: feed it events with timestamps, apply the returned action. */

/** Option on macOS; the browser reports it as "Alt". */
export const HOLD_KEY = "Alt";
/** Two releases this close together count as a double-tap (lock). */
export const DOUBLE_TAP_MS = 300;

export type KeyState = {
  /** Key is currently held down. */
  pressed: boolean;
  /** Voice should be listening. */
  listening: boolean;
  /** Listening is latched on by a double-tap; only a single tap ends it. */
  locked: boolean;
  /** Time of the last release that ended a hold (null after a lock or unlock). */
  lastUpAt: number | null;
};

export type KeyAction = "none" | "start" | "stop" | "lock" | "unlock";

export type KeyEvent = {
  type: "down" | "up";
  /** True for auto-repeat keydown events; these are ignored. */
  repeat?: boolean;
  /** ms timestamp of the event. */
  at: number;
};

export const initialKeyState: KeyState = {
  pressed: false,
  listening: false,
  locked: false,
  lastUpAt: null,
};

/**
 * Transitions:
 * - down (not repeat): start listening.
 * - down while locked: no change (the next release unlocks).
 * - up while locked: unlock and stop.
 * - up that follows another release within DOUBLE_TAP_MS: lock (stays listening).
 * - any other up: stop.
 * - repeat downs and stray ups (no matching down) are ignored.
 */
export function reduceKey(state: KeyState, ev: KeyEvent): { state: KeyState; action: KeyAction } {
  if (ev.type === "down") {
    if (ev.repeat || state.pressed) return { state, action: "none" };
    if (state.locked) return { state: { ...state, pressed: true }, action: "none" };
    return { state: { ...state, pressed: true, listening: true }, action: "start" };
  }

  if (!state.pressed) return { state, action: "none" };

  if (state.locked) {
    return { state: { ...initialKeyState }, action: "unlock" };
  }

  const isDoubleTap = state.lastUpAt !== null && ev.at - state.lastUpAt <= DOUBLE_TAP_MS;
  if (isDoubleTap) {
    return {
      state: { pressed: false, listening: true, locked: true, lastUpAt: null },
      action: "lock",
    };
  }

  return {
    state: { pressed: false, listening: false, locked: false, lastUpAt: ev.at },
    action: "stop",
  };
}
