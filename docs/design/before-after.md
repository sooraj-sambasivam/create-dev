# Stage J before and after

Scope: the minimal look, crafted. Neutral grays, one blue accent, one sans family. No new looks or themes.
Critique (three lenses, ranked, with file:line): docs/design/critique.md.
Capture script: /private/tmp/claude-501/-Users-soorajsambasivam-Documents-projects-create-dev/781b2c7e-b0d6-487c-909d-9cb6fda3c63e/scratchpad/J/cap.mjs (CDP, real app on the dev server, mock API). Scores are the lane's own
judgement against the anti-slop rules, 1 to 10, not user testing. No change scored lower, so nothing was reverted.

Paths: before `/private/tmp/claude-501/-Users-soorajsambasivam-Documents-projects-create-dev/781b2c7e-b0d6-487c-909d-9cb6fda3c63e/scratchpad/J/before/<scheme>-<width>-<shot>.png`, after `/private/tmp/claude-501/-Users-soorajsambasivam-Documents-projects-create-dev/781b2c7e-b0d6-487c-909d-9cb6fda3c63e/scratchpad/J/after/<same name>`,
side by side `/private/tmp/claude-501/-Users-soorajsambasivam-Documents-projects-create-dev/781b2c7e-b0d6-487c-909d-9cb6fda3c63e/scratchpad/J/pairs/<same name>`. Scheme is light or dark, width 1440 or 1024.
The shot names below are the same in all four scheme/width combinations (92 files each).

| Screen | Shot name | Before | After | What changed |
|---|---|---|---|---|
| Sign-in | 01-signin | 6.5 | 7.0 | Flat card (ring, no border plus shadow), labels at ink-2, "Welcome back." copy, busy label and error dot, invalid border |
| Onboarding 1 Welcome | 02-onboarding-1 | 6.0 | 7.0 | Balanced headline (no orphan), title anchored at 16vh, footer aligned to the column edge |
| Onboarding 2 You | 02-onboarding-2 | 6.0 | 7.5 | Selected choice is a crisp 1px ink border, unselected a hairline; same title position as every step |
| Onboarding 3 Permissions | 02-onboarding-3 | 5.5 | 7.5 | Two boxed cards plus disclosure became hairline rows |
| Onboarding 4 Try it | 02-onboarding-4 | 6.5 | 7.0 | Stable title position, tighter column |
| Onboarding 5 Done | 02-onboarding-5 | 6.5 | 7.0 | Stable title position, status chip legible on the shell |
| Empty state | 03-empty | 7.0 | 7.5 | Headline tracking and optical size, hint raised from ink-3 to ink-2 |
| Composer typed and menus | 04-composer-typed, 05-menu-model, 06-menu-plugins, 07-menu-files, 08-gofan | 7.0 | 7.2 | ink-3 contrast, tracking scale, hairline a step crisper |
| Thread with result cards | 09-thread-panel | 7.0 | 7.3 | Tracking and contrast; layout unchanged |
| Right panel tabs | 10-panel-output, 10-panel-inspect | 6.5 | 6.7 | Tracking and contrast only. Backend tab is absent on a plain page (by design) |
| Narrate pointing | 11-narrate-pointing | 6.0 | 6.0 | Unchanged: the overlay lives in modes/narrate, outside this lane |
| Pip | 12-pip-idle, -listening, -thinking, -done, -confused | 6.0 | 7.0 | Notes card sits above Pip instead of over the headline, wraps to two lines instead of cutting off |
| Avatar menu | 13-avatar-menu | 6.5 | 6.5 | Unchanged |
| Settings | 14-settings | 6.5 | 7.2 | Crisp choice chips, status chip contrast, click outside to close (no scrim: the design rule forbids one) |

## What changed, in the code

- Type: -apple-system first (SF Display or Text by size), tracking scale (display -0.022em, UI -0.006em, meta +0.01em),
  balanced headings, pretty paragraphs, tabular numerals for counts and timers. src/index.css, src/ui/styles.ts.
- Colour: ink-3 darkened so 12px meta passes AA on the shell (light) and lifted in dark; line one step crisper in light and
  dark; dark card ring 6% to 9%. Usage bars are neutral ink, not accent.
- Structure: onboarding anchored to one title position, permissions as hairline rows, choice chips as border states.
- Settings: click-away layer; Sign-in: busy, error and invalid states; Pip notes layout.
- DESIGN.md updated (tokens, family, tracking, variants).

## Variants (dev only, token sets)

`?variant=graphite|warm|ink` on the dev server (src/shell/variant.ts, tokens at the end of the colour section of
src/index.css). Default is unchanged. Production builds ignore the param.

| Variant | Light | Dark |
|---|---|---|
| Graphite | `/private/tmp/claude-501/-Users-soorajsambasivam-Documents-projects-create-dev/781b2c7e-b0d6-487c-909d-9cb6fda3c63e/scratchpad/J/variants/graphite/light-1440-*.png` | `/private/tmp/claude-501/-Users-soorajsambasivam-Documents-projects-create-dev/781b2c7e-b0d6-487c-909d-9cb6fda3c63e/scratchpad/J/variants/graphite/dark-1440-*.png` |
| Warm White | `/private/tmp/claude-501/-Users-soorajsambasivam-Documents-projects-create-dev/781b2c7e-b0d6-487c-909d-9cb6fda3c63e/scratchpad/J/variants/warm/light-1440-*.png` | `/private/tmp/claude-501/-Users-soorajsambasivam-Documents-projects-create-dev/781b2c7e-b0d6-487c-909d-9cb6fda3c63e/scratchpad/J/variants/warm/dark-1440-*.png` |
| Ink | `/private/tmp/claude-501/-Users-soorajsambasivam-Documents-projects-create-dev/781b2c7e-b0d6-487c-909d-9cb6fda3c63e/scratchpad/J/variants/ink/light-1440-*.png` | `/private/tmp/claude-501/-Users-soorajsambasivam-Documents-projects-create-dev/781b2c7e-b0d6-487c-909d-9cb6fda3c63e/scratchpad/J/variants/ink/dark-1440-*.png` |

Side-by-side sheets with the default: `/private/tmp/claude-501/-Users-soorajsambasivam-Documents-projects-create-dev/781b2c7e-b0d6-487c-909d-9cb6fda3c63e/scratchpad/J/variants/sheet-light-09-thread-panel.png`,
`sheet-dark-09-thread-panel.png`, `sheet-light-03-empty.png`, `sheet-dark-03-empty.png` in the same folder.

## Not changed, noted for the owner

- Generated page titles are title-cased ("A Landing Page For A Coffee Shop Called") in mock mode: generator output, outside this lane.
- The Narrate overlay (key legend, "Seen on this page" chip crowding the panel edge) is in modes/narrate, outside this lane.
- index.html still loads the extra Google font families; they are the generated-page font choices in Inspect, not app chrome.

## Gates

web tsc clean, vitest all pass (new: shell/variant.test.ts), vite build ok, scripts/e2e/smoke.mjs 20/20 against :5175.
