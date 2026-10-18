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
| `--shell` | `#ECECEC` (dark `#0F0F0F`) | App background, sidebar, collapsed rail |
| `--surface` | `#FFFFFF` (dark `#1C1C1C`) | Main work card, side panel card, composer, menus, windows |
| `--tray` | `#F4F4F4` | Tray under the composer, hover fill |
| `--hover` | `#EDEDED` | Hover on surface and tray controls |
| `--hover-shell` | `rgb(0 0 0 / .05)` (dark `rgb(255 255 255 / .06)`) | Row hover on the shell (sidebar). Alpha, so it holds on any shell tone |
| `--selected` | `rgb(0 0 0 / .08)` (dark `rgb(255 255 255 / .10)`) | Selected sidebar row; always visibly stronger than hover |
| `--line` | `#E6E6E6` | All borders and dividers (1px) |
| `--ink` | `#0D0D0D` | Primary text, headline |
| `--ink-2` | `#5D5D5D` | Icons, secondary labels |
| `--ink-3` | `#767676` | Placeholder, disabled, effort label (4.5:1 on white) |
| `--accent` | `#3E7BF0` | Go button (the only accent fill), unread dots, focus ring |
| `--on-accent` | `#FFFFFF` (dark: `#0D0D0D`) | Glyph on a filled Go |
| `--ok` / `--warn` / `--bad` | `#1F8A4C` / `#C27803` / `#C93C37` | ✓ / ⚠ / ✕ only, always with their symbol |

**Radius scale:** 6 (chips, small icon buttons) · 8 (buttons, inputs, menu items) · 12 (menus, popovers, windows, the main card) · 24 (composer and the tray's bottom corners) · full (Go, fan bubbles, avatar, segmented controls). Nothing else: no `rounded-[Npx]`, no bare `rounded`.

**Shadow:** two tokens. `shadow-soft` (`0 4px 20px rgba(0,0,0,0.05)`; heavier in dark) on the composer, menus, fan bubbles and floating windows. `shadow-card` (`0 0 0 1px rgb(0 0 0 / .06), 0 1px 3px rgb(0 0 0 / .05)`; dark: a 1px `rgb(255 255 255 / .06)` ring only) on the cards that sit on the shell: the main card and the side panel. No `shadow-sm`, no inline shadows. Shell against surface is only about 1.2:1, so the 1px ring is what separates a card from the shell.

**Spacing:** 4px grid. Composer padding is 14/16. Menu items are 32px tall with 8px horizontal padding.

## Looks (Paper and Luminous)

Two selectable looks, picked in onboarding and changeable in Settings. `html[data-look="paper"|"luminous"]` defines the whole token set in `src/index.css`; the neutral tokens above remain the fallback when no look is set. `ui/look.ts` exports `useLook()` (zustand, persisted as `create-look`), `applyLook`, `defaultLook`, `LOOKS`, `LOOK_LABEL`, `LOOK_BLURB`, `LOOK_SWATCH`. `setLook(look)` sets `data-look`, mirrors the `dark` class and `color-scheme` (Paper light, Luminous dark) and marks the choice as made. Until chosen, the default is data-theme dark -> luminous, light -> paper, system -> prefers-color-scheme. `index.html` applies the saved look before first paint.

| Token | Paper | Luminous |
|---|---|---|
| `shell` / `surface` / `tray` | `#F1EBDD` / `#FBF8F0` / `#F6F0E2` | `#0A0912` / `#14122A` / `#1B1836` |
| `hover` / `hover-shell` / `selected` | `#EFE8D6` / ink alpha .06 / ink alpha .10 | `#231F44` / white alpha .06 / magenta alpha .14 |
| `line` | `#DDD4BF` | `#2B2750` |
| `ink` / `ink-2` / `ink-3` | `#1F1C17` / `#4B453A` / `#6B6354` | `#F3F1FA` / `#B9B5D0` / `#9490B0` |
| `accent` / `on-accent` | vermilion `#B8361D` / `#FFF8F0` | magenta `#FF3D9A` / `#14020B` |
| `ok` / `warn` / `bad` | `#2F6B3A` / `#8F5A00` / `#B3261E` | `#4ADE9A` / `#FFB86B` / `#FF7B72` |
| `pen` | pen blue `#2C4A93` | rose `#FF8AC2` |
| `highlight` | highlighter yellow, alpha .62 | rose, alpha .28 |
| `glow` | vermilion alpha .14 | magenta-rose alpha .40 |
| `spotlight-dim` | warm brown alpha .18 | near-black alpha .70 |
| `shadow-soft` / `shadow-card` | warm brown shadows | black shadow; card adds a faint magenta bloom |
| `--paper-grain` | 1 (SVG noise on the body only) | 0 (ambient magenta and violet gradient instead) |

Utilities: `text-pen`, `bg-highlight`, `bg-glow`, `bg-spotlight-dim`, plus `font-display`, `font-ui`, `font-mono`, `font-note`. Luminous accent is magenta only, never green. Contrast was computed: ink, ink-2, ink-3, accent, ok, warn, bad and pen are all at least 4.5:1 on shell, surface and tray in both looks, and on-accent on accent is at least 4.5:1.

**Fonts** (Google Fonts `<link>` in `index.html`; exposed as CSS variables): `--font-display` Fraunces (Paper) or Instrument Serif italic (Luminous) for spoken words and page lines; `--font-ui` Figtree (Paper) or Inter (Luminous); `--font-mono` Geist Mono for numbers and timings; `--font-note` Caveat (Paper margin notes, never below 16px; Luminous falls back to Inter). `ui/styles.ts` adds `text.spoken`, `text.note`, `text.mono` and `highlight`. Readability floor in both looks: no text under 12px, body at least 14px.

## Type

- **Scale:** 12 (meta, chips, captions) · 14 (UI, buttons, menus) · 16 (body, composer input) · 28 (page headline). Sentence case everywhere; single-word tabs are capitalised. Ellipsis is "…" and only for in-progress or "opens an input" text, never in placeholders. No em dashes in UI copy.
- **Family:** `"SF Pro Text", -apple-system, BlinkMacSystemFont, "Inter Variable", system-ui, sans-serif`. That is SF on the demo Mac, matching the reference, and bundled Inter (`@fontsource-variable/inter`) everywhere else.
- **Sizes:** headline 28/36 weight 400, tracking −0.01em · body and composer input 16 · controls and menus 14 · tray labels 14 weight 400 · captions 12.
- **Ink:** `--ink` for headline, input text and model name. `--ink-2` for tray labels and control labels such as "Approve for me". `--ink-3` for the placeholder and effort ("Medium").

## Icons

- **Library:** `lucide-react` only, `strokeWidth` 1.75 (`STROKE`), coloured `--ink-2` (`--ink` when active). Sizes come from `ICON` in `ui/styles.ts` by role: `lg` 18 for navigation, menu rows, toolbar and close buttons · `md` 16 for tray, in-row actions, in-field icons and the Go glyph · `sm` 14 for chips and submenu chevrons. No hand-drawn SVGs and no emoji in the UI.
- Mapping: sidebar toggle `PanelLeft` · new chat `SquarePen` · project `Folder` · files `Library` · mention `AtSign` · plugins `Blocks` · screen `Laptop` · connectors `Plus` · permissions `ShieldCheck` (read only `Eye`, ask `ShieldQuestion`, approve `ShieldCheck`) · model chevron `ChevronDown` · mic `Mic` · Go empty `AudioLines`, Go with text `ArrowUp` · share `Share` · more `Ellipsis` · app menu `Menu` · Sketch `PanelsTopLeft` · Narrate `AudioWaveform` · Backend `Terminal`.

## Layout (from the sketch)

One composed window: a shell with an 8px inset, a rail or sidebar on the shell, and up to two cards. Everything below shares one frame.

- **Frame:** window inset 8px top, right and bottom. Cards (`card` in `styles.ts`: radius 12, `--surface`, `shadow-card`) are 8px apart and 8px from the window edge. Header rows are 48px (`h-12`) in the sidebar toggle row, the main card and the side panel, so their controls all centre on y=32.
- **Icon axis:** the toggle, New chat, New project, folder and avatar icon centres sit on x=24, in the rail and when expanded. Rows are 32px (`h-8`), icons 18px, row padding 7px and icon-to-label gap 9px, so labels start at x=42 and icon-less chat titles align under them.
- **Rail, 48px, on the shell (no card):** toggle, New chat, folder (expands the sidebar), avatar at the foot. Labels fade, icons never move. The main card starts at x=48, 8px from the icon edge.
- **Sidebar, 260px (min 220, max 420), on the shell:** `py-2 px-2`. Top: the `PanelLeft` toggle in a 48px row. Group A: New chat, New project (4px apart). A hairline (`hairline` in `styles.ts`). Then, scrolling: a "Projects" label (12px `--ink-2`, medium) with numbered projects and their chats, then "Chats" with the unassigned chats, then Archived. Empty: "Your chats appear here". The avatar sits at the bottom in a 32px row, `--tray`, no border. The main card starts at the sidebar edge, so the sidebar's own 8px padding is the gutter.
- **Row states:** hover `--hover-shell`, selected `--selected` with `--ink` and weight 500, idle `--ink-2`. Row actions float over the row end with no fill; the title fades under them with a mask, so hover never changes the title width or adds a box.
- **Main card:** `--surface`, radius 12, `shadow-card`, minimum width 520. The header is a 3-column grid: title (truncates), Chat | Work (centred), actions (never shrinks below its content). Below a 560px card the Share label folds into its icon.
- **Side panel (Output, Inspect, Backend):** a floating context card beside the main card, not a second main card. Width 440 for Output and 320 for Inspect and Backend, remembered per class; min 280, max 50% of the viewport. The sidebar drops to its rail only when sidebar, 520 card and panel no longer fit (around 1100px). The resize handle is a transparent strip centred on the 8px gutter; a hairline shows on hover and accent while dragging.
  - Header 48px, `px-4`: segmented tabs left, close (`button.icon`) right. Selected tab is `--ink` weight 500; an idle tab's hover changes the fill only. The Inspect dot is absolutely positioned, so tabs never shift.
  - Content inset is `px-4` everywhere. Scrolling bodies end in `pb-6` and a 24px fade into the surface.
  - Output: the toolbar is flat under the tabs and the preview is the only bordered element. The footer is folded into the panel as one `px-4` row of ghost buttons (Copy link, History) with no top border.
  - Empty states: a centred 14px `--ink-2` line (16px `--ink` title above it where present), `gap-2`.
- **Header, inside the main card:** Share (icon + "Share"), theme, `Ellipsis` menu (Rename, View files, Delete, Archive, Move to project ▸), and the side-panel toggle. Each is a 32px ghost button, radius 8.
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
| `segmented.root/item/active/pill` | The one segmented control (selected: `--ink`, weight 500; idle hover fills only): Chat \| Code, Output \| Inspect \| Backend, Edit \| Preview. Render `<ActivePill layoutId>` (ui/ActivePill.tsx) inside the active item so the highlight slides |
| `avatar` | The round account button (`--tray`, no border) |
| `card` | Card on the shell: radius 12, `--surface`, `shadow-card` (main card, side panel) |
| `row.base/hover/active/idle` | Sidebar rows: 32px, icon axis x=24, `--hover-shell` / `--selected` |
| `hairline` | Divider between sidebar groups |
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
