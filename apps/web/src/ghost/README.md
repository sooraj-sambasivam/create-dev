# ghost: scripted agent cursor

A second cursor ("Agent" pill, accent outline) that glides along bezier paths and
dispatches real pointer, focus, input and click events, so a lifted app's
"Add a row" form really submits. Scripted, not a browser agent. Not mounted
anywhere yet.

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
