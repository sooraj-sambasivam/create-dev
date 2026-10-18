import { describe, expect, it } from "vitest";
import { initialHold, reduceHold, TAP_MS, type HoldAction, type HoldState } from "./holdToggle";

function run(events: Array<["down" | "up", number, boolean?]>) {
  let state: HoldState = initialHold;
  const actions: HoldAction[] = [];
  for (const [type, at, repeat] of events) {
    const r = reduceHold(state, { type, at, repeat });
    state = r.state;
    actions.push(r.action);
  }
  return { state, actions };
}

describe("reduceHold", () => {
  it("a hold starts on press and stops on release", () => {
    expect(run([["down", 0], ["up", 800]]).actions).toEqual(["start", "stop"]);
  });
  it("a quick tap latches listening on", () => {
    const { actions, state } = run([["down", 0], ["up", TAP_MS - 1]]);
    expect(actions).toEqual(["start", "latch"]);
    expect(state.toggled).toBe(true);
  });
  it("a press of exactly TAP_MS is still a hold", () => {
    expect(run([["down", 0], ["up", TAP_MS]]).actions).toEqual(["start", "stop"]);
  });
  it("the next tap ends a latched session", () => {
    const { actions, state } = run([["down", 0], ["up", 100], ["down", 2000], ["up", 2100]]);
    expect(actions).toEqual(["start", "latch", "none", "stop"]);
    expect(state).toEqual(initialHold);
  });
  it("a long press also ends a latched session", () => {
    expect(run([["down", 0], ["up", 100], ["down", 2000], ["up", 3500]]).actions).toEqual(["start", "latch", "none", "stop"]);
  });
  it("ignores auto-repeat and stray releases", () => {
    expect(run([["up", 0], ["down", 10], ["down", 40, true], ["up", 900]]).actions).toEqual(["none", "start", "none", "stop"]);
  });
  it("can start again after a stop", () => {
    expect(run([["down", 0], ["up", 900], ["down", 1000], ["up", 1100]]).actions).toEqual(["start", "stop", "start", "latch"]);
  });
});
