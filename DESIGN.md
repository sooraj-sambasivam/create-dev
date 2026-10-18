# create-dev design system

Every screen uses this file as its visual contract. The layout comes from the hand sketch. The finish comes from the reference screenshot: a calm grey shell, a white work surface, a soft rounded composer with a tray tucked under it. Use the reference for feel, not branding. No other product's names, logos or copy.

## Principles

- **One surface, one focus.** The white work surface holds the content; the grey shell holds navigation. On the empty screen the composer is the only thing that draws the eye.
- **One of everything.** One icon library, one font, one radius scale, one shadow, one accent. If a value is not in this file, don't invent it; add it here first.
- **Quiet until needed.** Secondary text is grey, and controls show a hover background only on hover. Colour appears only for the Go button, unread dots and check results.

## Tokens

Defined once as CSS variables in `src/index.css` (`@theme` for Tailwind 4) and used everywhere through Tailwind classes. Nobody hard-codes hex values in components.

| Token | Value | Use |
|---|---|---|
| `--shell` | `#F3F2F2` | App background, sidebar, collapsed rail |
| `--surface` | `#FFFFFF` | Main work card, composer, menus, windows |
| `--tray` | `#F4F4F4` | Tray under the composer, hover fill |
| `--hover` | `#EDEDED` | Hover on shell items |
| `--line` | `#E6E6E6` | All borders and dividers (1px) |
| `--ink` | `#0D0D0D` | Primary text, headline |
| `--ink-2` | `#5D5D5D` | Icons, secondary labels |
| `--ink-3` | `#767676` | Placeholder, disabled, effort label (4.5:1 on white) |
| `--accent` | `#3E7BF0` | Go button (the only accent fill), unread dots, focus ring |
| `--on-accent` | `#FFFFFF` (dark: `#0D0D0D`) | Glyph on a filled Go |
| `--ok` / `--warn` / `--bad` | `#1F8A4C` / `#C27803` / `#C93C37` | ✓ / ⚠ / ✕ only, always with their symbol |

**Radius scale:** 6 (chips, small icon buttons) · 8 (buttons, inputs, menu items) · 12 (menus, popovers, windows, the main card) · 24 (composer and the tray's bottom corners) · full (Go, fan bubbles, avatar, segmented controls). Nothing else: no `rounded-[Npx]`, no bare `rounded`.

**Shadow:** one soft shadow, Tailwind `shadow-soft` (`0 4px 20px rgba(0,0,0,0.05)`; heavier in dark), on the composer, menus, fan bubbles and floating windows. No `shadow-sm`, no inline shadows, no second menu shadow. The main card uses no shadow; it is set off from the shell by colour alone.

**Spacing:** 4px grid. Composer padding is 14/16. Menu items are 32px tall with 8px horizontal padding.

## Type

- **Scale:** 12 (meta, chips, captions) · 14 (UI, buttons, menus) · 16 (body, composer input) · 28 (page headline). Sentence case everywhere; single-word tabs are capitalised. Ellipsis is "…" and only for in-progress or "opens an input" text, never in placeholders. No em dashes in UI copy.
- **Family:** `"SF Pro Text", -apple-system, BlinkMacSystemFont, "Inter Variable", system-ui, sans-serif`. That is SF on the demo Mac, matching the reference, and bundled Inter (`@fontsource-variable/inter`) everywhere else.
- **Sizes:** headline 28/36 weight 400, tracking −0.01em · body and composer input 16 · controls and menus 14 · tray labels 14 weight 400 · captions 12.
- **Ink:** `--ink` for headline, input text and model name. `--ink-2` for tray labels and control labels such as "Approve for me". `--ink-3` for the placeholder and effort ("Medium").

## Icons

- **Library:** `lucide-react` only, `strokeWidth` 1.75 (`STROKE`), coloured `--ink-2` (`--ink` when active). Sizes come from `ICON` in `ui/styles.ts` by role: `lg` 18 for navigation, menu rows, toolbar and close buttons · `md` 16 for tray, in-row actions, in-field icons and the Go glyph · `sm` 14 for chips and submenu chevrons. No hand-drawn SVGs and no emoji in the UI.
- Mapping: sidebar toggle `PanelLeft` · new chat `SquarePen` · project `Folder` · files `Library` · mention `AtSign` · plugins `Blocks` · screen `Laptop` · connectors `Plus` · permissions `ShieldCheck` (read only `Eye`, ask `ShieldQuestion`, approve `ShieldCheck`) · model chevron `ChevronDown` · mic `Mic` · Go empty `AudioLines`, Go with text `ArrowUp` · share `Share` · more `Ellipsis` · app menu `Menu` · Sketch `PanelsTopLeft` · Narrate `AudioWaveform` · Backend `Terminal`.

## Layout (from the sketch)

- **Shell:** full window `--shell`. The main card is `--surface`, radius 12, inset 8px from the top, right and bottom, sitting next to the sidebar.
- **Sidebar, 260px, on the shell (no border):** the `PanelLeft` toggle at top-left (collapses the sidebar to a 56px icon rail like the reference), then "New chat", a "Projects" label in 12px `--ink-3` caps-free, then numbered projects (1., 2., 3.) with their chats indented beneath in 14px `--ink-2`. The active chat gets a `--hover` fill, radius 8. The avatar sits at the bottom.
- **Header, inside the main card, top right only:** Share (icon + "Share"), `Ellipsis` menu (Rename, View files, Delete, Archive, Move to project ▸), `Menu` app menu. Each is a 32px ghost button, radius 8.
- **Empty state:** the headline "What should we work on?" is centered, with the composer 20px below it. The pair sits slightly above the vertical centre.
- **Composer:** 740px max width, built from Tailwind tokens only (no `--c-*` aliases), `--surface`, 1px `--line`, radius 24, the one shadow.
  - Row 1: textarea, 16px, placeholder "Work with create-dev" (the headline already asks the question), auto-grows to 8 lines.
  - Row 2 as built: Chat | Code segmented control on the left (16px under the text), Go on the right. The fan of Speak, Sketch and Narrate opens as one row of 32px bubbles with 8px gaps, 12px above the composer's top edge and right-aligned over Go, so it never covers the text.
  - Row 2 as designed, left: `+` (connectors menu), then the permissions control as icon + label ("Approve for me") in `--ink-2`.
  - Row 2, right: model name in `--ink` plus effort in `--ink-3` and a `ChevronDown`, then `Mic`, then Go: a 32px `--accent` circle with a white icon.
- **Tray:** sits tucked under the composer: inset 16px on each side, `--tray`, radius 0 0 24 24 (matches the composer), horizontal padding 16px, top hidden under the composer (−12px margin, extra top padding).
  - Left: Choose project, Files, @, Plugins, each an icon + 14px label.
  - Right: icon-only toggles `Laptop` (screen), `PanelsTopLeft` (Canvas), `AudioWaveform` (Narrate), `Terminal` (Backend). The active ones are `--ink` on `--hover`.
- **In a chat:** the composer and tray dock to the bottom of the main card (same width, 24px bottom margin), and messages flow above in a 740px column.

## Menus, popovers, windows

- **Menus:** `--surface`, radius 12, 1px `--line`, the one shadow, 6px padding. Items are 32px tall, radius 8, `--tray` on hover, with the icon at the left and a `Check` at the right for the selected item. Esc closes a menu and focus returns to its trigger.
- **Floating windows (Sketch, Narrate, Backend):** `--surface`, radius 12, 1px `--line`, the one shadow, and a 44px title bar with a 14px title plus a close button. They open with the `scaleIn` variant (fade from 96% scale on the gentle spring) and close with the exit tween.

## Motion

One system, in `apps/web/src/ui/motion.ts`. Nothing in the chrome declares its own duration, easing or spring; CSS-only transitions read the same values from `--duration-*` and `--ease-*` in `index.css`.

| Token | Value | Use |
|---|---|---|
| `duration.fast` / `base` / `slow` | 120 / 200 / 320 ms | hover and press / menus and fades / panels and entrances |
| `ease.standard` | cubic-bezier(0.2, 0, 0, 1) | default, and all CSS transitions |
| `ease.emphasized` | cubic-bezier(0.3, 0, 0, 1) | entrances (things arriving) |
| `ease.exit` | cubic-bezier(0.4, 0, 1, 1) | things leaving |
| `spring.snappy` | stiffness 520, damping 38 | controls: the sliding pill, sidebar width, Go press |
| `spring.gentle` | stiffness 260, damping 30 | panels, cards, composer dock, lifted-app rows |
| `spring.bouncy` | stiffness 420, damping 22 | the Go fan and chart bars growing |
| `STAGGER` | 24 ms (capped at 12 items) | lists: thread items, table rows, empty-state chips |

Variants (`fadeUp`, `scaleIn`, `popover`, `panelSlide`, `listStagger`, `sharedAxis`, `fade`) cover every entrance: thread items `fadeUp` in a `listStagger` log, QR card and Settings `scaleIn`, every menu `popover` scaled from its trigger corner (`originFor(side, align)`), the right panel `panelSlide`, onboarding steps `sharedAxis` (slides with the direction of travel).

Rules:

- **Transform, opacity and clip-path only.** No animating `width`, `height`, `top`, `left`, `font-size` or colour. The one exception is the width of the two layout slots (the sidebar and the side-panel slot), because the main card has to give up the space; their content keeps a fixed width and fades, so it never reflows mid-animation. Growing text uses `scale`; growing bars use `scaleY` from the baseline; the line chart draws with `pathLength`; moving siblings use `layout="position"`.
- **`will-change` only while animating** (set on animation start, cleared on complete). Never in a class.
- **Shared elements use `layoutId`**: the segmented pill (`ActivePill`), the onboarding step dot, the composer gliding between the empty state and the docked position.
- **Reduced motion:** `useReducedMotionSafe()` returns `{ reduce, t, v }`; `t(transition)` swaps in a 120ms fade and `v(variants)` strips every move, leaving opacity. The global rule in `index.css` also stops the shimmer and the caret and clamps CSS transitions.
- **Press feedback:** every button scales to 0.97 while pressed (`styles.ts` base), Go springs to 0.94.
- **Loading:** the shimmer is a translated highlight, not a moving background. The streaming caret blinks by opacity.

Lifted apps arrive with the same tokens: table rows stagger in (`fadeUp`-like, 24ms apart), new live rows spring in from above and flash an accent wash that fades by opacity, chart bars grow from the baseline on `spring.bouncy`, the line draws over 0.9s.

## Accessibility

Every icon-only button has an `aria-label` and a tooltip. The focus ring is 2px `--accent` at 2px offset. Body text keeps a contrast of at least 4.5:1, so `--ink-3` is used only for placeholder and effort text, never for content.

## Components (`apps/web/src/ui/styles.ts`)

One set of class strings; surfaces compose these and never re-declare their own. Colour comes from theme tokens only, and accent fill is reserved for Go.

| Export | Use |
|---|---|
| `focusRing` | 2px `--accent` outline at 2px offset, on every focusable control |
| `ICON`, `STROKE` | Icon sizes by role (lg 18, md 16, sm 14) and the 1.75 stroke |
| `button.primary` | Confirm (Next, Done, Save, Add): ink on surface, 32px, radius 8 |
| `button.secondary` | Outlined secondary action |
| `button.ghost` | Text action in toolbars, menus and the header (Share) |
| `button.icon` / `iconSm` | 32px / 24px icon-only; hover `--hover`; always with `aria-label`. Toggled on = `--hover` fill and `--ink` |
| `button.danger` | Destructive confirm |
| `segmented.root/item/active/pill` | The one segmented control: Chat \| Code, Output \| Inspect \| Backend, Edit \| Preview. Render `<ActivePill layoutId>` (ui/ActivePill.tsx) inside the active item so the highlight slides |
| `avatar` | The round account button |
| `chip.action` / `tag` / `status` | Suggestion chip, element reference, status pill with a dot |
| `dot.*` | Status dots, always beside text |
| `surface.card` / `pill` / `menu` / `inset` | Floating card (radius 12), floating pill, menu panel (radius 12, 6px padding), bordered block inside a panel with no shadow |
| `menuItem` | 32px row, radius 8, `--tray` on hover; icon left, check right |
| `input` | 32px field, radius 8, 1px `--line`, focus ring |
| `text.*` | meta 12 · ui 14 · body 16 · title 16 medium · display 28 |

Menu panels (`role="menu"`) repoint `--surface` and `--tray` through `--menu-surface` and `--menu-hover` in `index.css`, so `bg-surface` and the item hover work in both themes. The generated page palette (`.screen-light`, `.screen-dark`) is page content only, not app chrome.

## Vocabulary

Four ways to start: Type · Speak · Sketch · Narrate. Narrate is the mode; "point" is only the gesture ("Point at the heading"). Chat and Code are the work modes. The right-hand column is the side panel (Output, Inspect, Backend). Copy a link with "Copy link"; "Share" is the header button; "Export" is the HTML file. Say "microphone" in sentences and errors, "Speak" for the control.

Toasts: `toast("Link copied")` from `ui/toastStore.ts`; `ToastHost` (mounted in AppShell) shows at most three, bottom centre, as `surface.pill` with a `Check`.
