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
| `--ink-3` | `#9B9B9B` | Placeholder, disabled, effort label |
| `--accent` | `#3E7BF0` | Go button, unread dots, focus ring |
| `--ok` / `--warn` / `--bad` | `#1F8A4C` / `#C27803` / `#C93C37` | ✓ / ⚠ / ✕ only, always with their symbol |

**Radius scale:** 6 (chips, small buttons) · 8 (menu items) · 12 (menus, popovers, windows, the main card) · 24 (composer) · full (Go, avatar, toggles).

**Shadow:** one soft shadow, `0 4px 20px rgba(0,0,0,0.05)`, on the composer, menus and floating windows. The main card uses no shadow; it is set off from the shell by colour alone.

**Spacing:** 4px grid. Composer padding is 14/16. Menu items are 32px tall with 8px horizontal padding.

## Type

- **Family:** `"SF Pro Text", -apple-system, BlinkMacSystemFont, "Inter Variable", system-ui, sans-serif`. That is SF on the demo Mac, matching the reference, and bundled Inter (`@fontsource-variable/inter`) everywhere else.
- **Sizes:** headline 28/36 weight 400, tracking −0.01em · body and composer input 16 · controls and menus 14 · tray labels 14 weight 400 · captions 12.
- **Ink:** `--ink` for headline, input text and model name. `--ink-2` for tray labels and control labels such as "Approve for me". `--ink-3` for the placeholder and effort ("Medium").

## Icons

- **Library:** `lucide-react` only. Icons are `size={18} strokeWidth={1.75}`, coloured `--ink-2` (`--ink` when active). Exceptions: tray icons, the permission icon and the Go glyph are 16; the model chevron is 12 in `--ink-3`. No hand-drawn SVGs and no emoji in the UI.
- Mapping: sidebar toggle `PanelLeft` · new chat `SquarePen` · project `Folder` · files `Library` · mention `AtSign` · plugins `Blocks` · screen `Laptop` · connectors `Plus` · permissions `ShieldCheck` (read only `Eye`, ask `ShieldQuestion`, approve `ShieldCheck`) · model chevron `ChevronDown` · mic `Mic` · Go empty `AudioLines`, Go with text `ArrowUp` · share `Share` · more `Ellipsis` · app menu `Menu` · Canvas `PanelsTopLeft` · Narrate `AudioWaveform` · Backend `Terminal`.

## Layout (from the sketch)

- **Shell:** full window `--shell`. The main card is `--surface`, radius 12, inset 8px from the top, right and bottom, sitting next to the sidebar.
- **Sidebar, 260px, on the shell (no border):** the `PanelLeft` toggle at top-left (collapses the sidebar to a 56px icon rail like the reference), then "New chat", a "Projects" label in 12px `--ink-3` caps-free, then numbered projects (1., 2., 3.) with their chats indented beneath in 14px `--ink-2`. The active chat gets a `--hover` fill, radius 8. The avatar sits at the bottom.
- **Header, inside the main card, top right only:** Share (icon + "Share"), `Ellipsis` menu (Rename, View files, Delete, Archive, Move to project ▸), `Menu` app menu. Each is a 32px ghost button, radius 8.
- **Empty state:** the headline "What should we work on?" is centered, with the composer 20px below it. The pair sits slightly above the vertical centre.
- **Composer:** 740px max width, `--surface`, 1px `--line`, radius 24, the one shadow.
  - Row 1: textarea, 16px, placeholder "Work with create-dev" (the headline already asks the question), auto-grows to 8 lines.
  - Row 2, left: `+` (connectors menu), then the permissions control as icon + label ("Approve for me") in `--ink-2`.
  - Row 2, right: model name in `--ink` plus effort in `--ink-3` and a `ChevronDown`, then `Mic`, then Go: a 32px `--accent` circle with a white icon.
- **Tray:** sits tucked under the composer: inset 16px on each side, `--tray`, radius 0 0 20 20, top hidden under the composer (−12px margin, extra top padding).
  - Left: Choose project, Files, @, Plugins, each an icon + 14px label.
  - Right: icon-only toggles `Laptop` (screen), `PanelsTopLeft` (Canvas), `AudioWaveform` (Narrate), `Terminal` (Backend). The active ones are `--ink` on `--hover`.
- **In a chat:** the composer and tray dock to the bottom of the main card (same width, 24px bottom margin), and messages flow above in a 740px column.

## Menus, popovers, windows

- **Menus:** `--surface`, radius 12, 1px `--line`, the one shadow, 6px padding. Items are 32px tall, radius 8, `--tray` on hover, with the icon at the left and a `Check` at the right for the selected item. Esc closes a menu and focus returns to its trigger.
- **Floating windows (Canvas, Narrator, Backend):** `--surface`, radius 12, 1px `--line`, the one shadow, and a 44px title bar with a 14px title plus a close button. They open with a 200ms fade and 8px rise.
- **Motion:** 150ms for hover and press, 200ms ease-out for menus, using `motion` only for menus and windows. Respect `prefers-reduced-motion`.

## Accessibility

Every icon-only button has an `aria-label` and a tooltip. The focus ring is 2px `--accent` at 2px offset. Body text keeps a contrast of at least 4.5:1, so `--ink-3` is used only for placeholder and effort text, never for content.
