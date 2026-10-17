import { describe, expect, it } from "vitest";
import { initialKeyState, reduceKey, type KeyAction, type KeyState } from "./keys";

/** Runs a list of [type, at, repeat?] events and returns the actions in order. */
function run(events: Array<["down" | "up", number, boolean?]>) {
  let state: KeyState = initialKeyState;
  const actions: KeyAction[] = [];
  for (const [type, at, repeat] of events) {
    const r = reduceKey(state, { type, at, repeat });
    state = r.state;
    actions.push(r.action);
  }
  return { state, actions };
}

describe("reduceKey push-to-talk", () => {
  it("hold starts listening and release stops it", () => {
    const { state, actions } = run([
      ["down", 0],
      ["up", 800],
    ]);
    expect(actions).toEqual(["start", "stop"]);
    expect(state.listening).toBe(false);
    expect(state.locked).toBe(false);
  });

  it("ignores auto-repeat keydowns while held", () => {
    const { actions, state } = run([
      ["down", 0],
      ["down", 30, true],
      ["down", 60, true],
      ["up", 900],
    ]);
    expect(actions).toEqual(["start", "none", "none", "stop"]);
    expect(state.listening).toBe(false);
  });

  it("a second down without a release does not restart", () => {
    const { actions } = run([
      ["down", 0],
      ["down", 10],
    ]);
    expect(actions).toEqual(["start", "none"]);
  });

  it("two quick taps lock listening on", () => {
    const { state, actions } = run([
      ["down", 0],
      ["up", 100],
      ["down", 200],
      ["up", 280],
    ]);
    expect(actions).toEqual(["start", "stop", "start", "lock"]);
    expect(state.locked).toBe(true);
    expect(state.listening).toBe(true);
  });

  it("taps more than 300ms apart do not lock", () => {
    const { state, actions } = run([
      ["down", 0],
      ["up", 100],
      ["down", 600],
      ["up", 700],
    ]);
    expect(actions).toEqual(["start", "stop", "start", "stop"]);
    expect(state.locked).toBe(false);
  });

  it("the double-tap window is inclusive at 300ms", () => {
    const { actions } = run([
      ["down", 0],
      ["up", 100],
      ["down", 150],
      ["up", 400],
    ]);
    expect(actions[3]).toBe("lock");
  });

  it("while locked, holding does nothing and a single tap unlocks", () => {
    const { state, actions } = run([
      ["down", 0],
      ["up", 100],
      ["down", 200],
      ["up", 280], // lock
      ["down", 2_000], // hold while locked
      ["up", 2_100], // single tap -> unlock
    ]);
    expect(actions).toEqual(["start", "stop", "start", "lock", "none", "unlock"]);
    expect(state.locked).toBe(false);
    expect(state.listening).toBe(false);
  });

  it("after unlocking, a new quick double-tap locks again", () => {
    const { state, actions } = run([
      ["down", 0],
      ["up", 100],
      ["down", 200],
      ["up", 280], // lock
      ["down", 1_000],
      ["up", 1_100], // unlock
      ["down", 2_000],
      ["up", 2_100], // single stop (no lastUp after unlock)
      ["down", 2_200],
      ["up", 2_250], // lock
    ]);
    expect(actions.slice(3)).toEqual(["lock", "none", "unlock", "start", "stop", "start", "lock"]);
    expect(state.locked).toBe(true);
  });

  it("ignores a stray keyup with no matching keydown", () => {
    const { actions, state } = run([["up", 50]]);
    expect(actions).toEqual(["none"]);
    expect(state).toEqual(initialKeyState);
  });
});
