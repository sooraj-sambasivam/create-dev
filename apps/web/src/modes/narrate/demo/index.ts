export { GeneratingDemo, type GeneratingDemoProps } from "./GeneratingDemo";
export { generateDemo, createNdjsonReader, type DemoOutcome } from "./demoApi";
export { formatElapsed, clampPct, progressPct } from "./demoFormat";
export {
  setDemoWorkspaceBridge,
  getDemoWorkspaceBridge,
  type DemoWorkspaceBridge,
  type DemoLogEntry,
} from "./workspaceBridge";
