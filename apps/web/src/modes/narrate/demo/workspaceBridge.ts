/**
 * Thin bridge to the Output workspace (its store is not in this branch yet).
 * The integrator calls `setDemoWorkspaceBridge` once with the real `workspaceStore` actions
 * (log entry, read open state, toggle). Until then every call is a no-op.
 */
export type DemoLogEntry = {
  sessionId: string;
  title: string;
  summary: string;
  mock: boolean;
};

export interface DemoWorkspaceBridge {
  logDemo(entry: DemoLogEntry): void;
  isOutputOpen(): boolean;
  toggleOutput(): void;
}

const noopBridge: DemoWorkspaceBridge = {
  logDemo: () => {},
  isOutputOpen: () => true,
  toggleOutput: () => {},
};

let current: DemoWorkspaceBridge = noopBridge;

export function setDemoWorkspaceBridge(bridge: DemoWorkspaceBridge): void {
  current = bridge;
}

export function getDemoWorkspaceBridge(): DemoWorkspaceBridge {
  return current;
}
