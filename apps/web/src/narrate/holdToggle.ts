/** Hold-to-talk key with a toggle alternative. Pure: feed it events with timestamps, apply the returned action. */

/** A press shorter than this is a tap: it leaves listening on until the next press ends it. */
export const TAP_MS = 250;

export type HoldState = {
  /** When the key went down, or null while it is up. */
  downAt: number | null;
  /** Listening was latched on by a tap; the next press and release ends it. */
  toggled: boolean;
};

/** "latch" means listening stays on after this release. */
export type HoldAction = "none" | "start" | "stop" | "latch";

export type HoldEvent = { type: "down" | "up"; repeat?: boolean; at: number };

export const initialHold: HoldState = { downAt: null, toggled: false };

/**
 * - down: start listening (when not already latched on).
 * - up after a hold: stop, as before.
 * - up after a tap (under TAP_MS): keep listening (toggle on).
 * - next press while latched on: its release stops listening, tap or hold.
 * - auto-repeat downs and stray ups are ignored.
 */
export function reduceHold(state: HoldState, ev: HoldEvent): { state: HoldState; action: HoldAction } {
  if (ev.type === "down") {
    if (ev.repeat || state.downAt !== null) return { state, action: "none" };
    if (state.toggled) return { state: { downAt: ev.at, toggled: true }, action: "none" };
    return { state: { downAt: ev.at, toggled: false }, action: "start" };
  }
  if (state.downAt === null) return { state, action: "none" };
  if (state.toggled) return { state: initialHold, action: "stop" };
  if (ev.at - state.downAt < TAP_MS) return { state: { downAt: null, toggled: true }, action: "latch" };
  return { state: initialHold, action: "stop" };
}
