export { GhostCursor, mountGhost, unmountGhost } from "./GhostCursor";
export { ghostController, GhostController, prefersReducedMotion } from "./controller";
export type { GhostState, GhostUiState, GhostCursorApi } from "./controller";
export { runGhost, ghostAddRow, buildAddRowSteps, findAddRowForm, findTextFields, findSubmit, fieldKeys } from "./script";
export type { GhostStep, Target, RunOptions } from "./script";
export { runAgentAddRow, cancelAgentRow, agentRowRunning, handleAgentCommand, findLiftedForm, readTable } from "./agentRow";
export type { AgentRowResult } from "./agentRow";
export { isAgentRowCommand } from "./command";
export { deriveRowValues, nextCell } from "./rowValues";
export { installAgentHotkey } from "./hotkey";
export { easeInOutCubic, makePath, bezierAt, pointAtTime, glideDuration } from "./path";
export type { Point, BezierPath } from "./path";

import { mountGhost } from "./GhostCursor";
import { runGhost, ghostAddRow, findAddRowForm } from "./script";

if (import.meta.env?.DEV && typeof window !== "undefined") {
  (window as unknown as Record<string, unknown>).__createGhost = { mount: mountGhost, run: runGhost, addRow: ghostAddRow, findAddRowForm };
}
