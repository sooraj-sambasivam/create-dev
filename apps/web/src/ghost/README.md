# ghost: scripted agent cursor

A second cursor ("Agent" pill, accent outline) that glides along bezier paths and
dispatches real pointer, focus, input and click events, so a lifted app's
"Add a row" form really submits. Scripted, not a browser agent. Mounted in `main.tsx`.

## Wiring (gate)

```tsx
import { mountGhost, ghostAddRow, findAddRowForm } from "./ghost";

// once, e.g. on ?ghost=1 or a hotkey
mountGhost();
const form = findAddRowForm(); // or pass the form element directly
if (form) void ghostAddRow(form, { Name: "Latte", Price: "4.50" }, { caption: "Adding a row for you" });
```

Values are a record (matched to label, placeholder, aria-label or name) or an
array (positional). Custom scripts:

```ts
runGhost([
  { say: "Filling the form" },
  { moveTo: "#f" },
  { type: { selector: "input[name=name]", text: "Latte", cps: 14 } },
  { click: "button[type=submit]" },
  { wait: 600 },
]);
```

Selectors may also be Elements; `moveTo` takes `{x, y}`. Pass `signal` in the
options to abort. In DEV, `window.__createGhost` has `mount`, `run`, `addRow`,
`findAddRowForm`. With `prefers-reduced-motion`, the cursor jumps (no glide, no ripple).

## Tests

`path.test.ts` and the controller tests run anywhere. The DOM runner tests need
jsdom or happy-dom (neither is a web dependency yet) and skip otherwise; set
`GHOST_DOM_MODULE` to a module path to force one.

## Agent add-a-row (wired)

`runAgentAddRow()` finds the lifted app's form (`[data-form]`), reads the table next to it, derives the next
row (`rowValues.ts`: clock series, prices with units, "Stop 3", tier names, steady categories), glides and types
with the agent cursor, and narrates through Pip (`note` "On it…", `thinking`, `done`, then `celebrate`).
Triggers: a spoken line matching `isAgentRowCommand` ("add a row for me", "let the agent do it") in Narrate or
hold-to-talk, and, in dev builds, Ctrl+Shift+G (Escape stops it). `handleAgentCommand(text)` is the one-line hook
for any other input surface.

Motion: the controller glides a target along a bezier path; `GhostCursor` follows it with a spring (`spring.ts`)
written straight to `transform`, so there is no React render per frame and the loop sleeps at rest.
