/**
 * The one set of control styles for the app chrome (DESIGN.md). Every surface composes these
 * class strings instead of re-declaring its own, so buttons, chips, menus and cards stay identical.
 * Colour comes only from the Tailwind theme tokens in index.css; accent fill is reserved for Go.
 */

export const focusRing =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

/** Icon sizes by role; every lucide icon uses strokeWidth 1.75. */
export const ICON = { sm: 14, md: 16, lg: 18 } as const;
export const STROKE = 1.75;

const base = `inline-flex items-center justify-center gap-1.5 whitespace-nowrap select-none transition-[color,background-color,opacity,transform] duration-120 ease-out active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40 ${focusRing}`;

export const button = {
  /** Confirm actions (Next, Done, Save). Ink on surface, never accent. */
  primary: `${base} h-8 rounded-lg bg-ink px-3 text-[14px] text-surface hover:opacity-90`,
  /** Outlined secondary actions. */
  secondary: `${base} h-8 rounded-lg border border-line bg-surface px-3 text-[14px] text-ink hover:bg-tray`,
  /** Text-only actions in toolbars and menus. */
  ghost: `${base} h-8 rounded-lg px-2.5 text-[14px] text-ink-2 hover:bg-hover hover:text-ink`,
  /** Square icon-only button; always pair with aria-label. */
  icon: `${base} size-8 rounded-lg text-ink-2 hover:bg-hover hover:text-ink`,
  /** Small square icon button inside rows and chips. */
  iconSm: `${base} size-6 rounded-md text-ink-2 hover:bg-hover hover:text-ink`,
  /** Destructive confirm. */
  danger: `${base} h-8 rounded-lg px-3 text-[14px] text-bad hover:bg-hover`,
} as const;

/** The round account button (initials) at the foot of the sidebar. */
export const avatar = `${base} size-8 rounded-full border border-line bg-surface text-[12px] font-medium text-ink-2 hover:bg-hover`;

/** Pill-shaped segmented control (Chat | Code, Output | Inspect | Backend, Edit | Preview). */
export const segmented = {
  root: "isolate inline-flex h-8 items-center gap-0.5 rounded-full bg-tray p-0.5",
  item: `${base} relative h-7 rounded-full px-3 text-[14px] text-ink-2 hover:text-ink`,
  active: "text-ink",
  /** The sliding highlight (render <ActivePill/> inside the active item). */
  pill: "absolute inset-0 -z-10 rounded-full bg-surface shadow-soft",
} as const;

/** Compact labels: suggestion chips, element chips, status pills. */
export const chip = {
  /** Clickable suggestion (empty state examples). */
  action: `${base} h-8 rounded-lg border border-line bg-surface px-3 text-[14px] text-ink-2 hover:bg-tray hover:text-ink`,
  /** Inline reference to an element or file. */
  tag: "inline-flex h-6 max-w-full items-center gap-1 truncate rounded-md bg-tray px-2 text-[12px] text-ink-2",
  /** Status (Connected / Sample data / Needs setup); pair with a dot and text, never colour alone. */
  status: "inline-flex h-6 items-center gap-1.5 rounded-full bg-tray px-2 text-[12px] text-ink-2",
} as const;

/** Status dot colours, used beside a text label. */
export const dot = {
  ok: "size-1.5 rounded-full bg-ok",
  warn: "size-1.5 rounded-full bg-warn",
  bad: "size-1.5 rounded-full bg-bad",
  idle: "size-1.5 rounded-full bg-ink-3",
} as const;

/** Floating surfaces. */
export const surface = {
  card: "rounded-xl border border-line bg-surface shadow-soft",
  pill: "rounded-full border border-line bg-surface shadow-soft",
  /** Bordered block inside a panel (no shadow): Backend rows, settings groups. */
  inset: "rounded-xl border border-line bg-surface",
  menu: "min-w-48 rounded-xl border border-line bg-surface p-1.5 shadow-soft",
} as const;

export const menuItem = `flex h-8 w-full items-center gap-2 rounded-lg px-2 text-left text-[14px] text-ink hover:bg-tray ${focusRing}`;

export const input = `h-8 w-full rounded-lg border border-line bg-surface px-3 text-[14px] text-ink placeholder:text-ink-3 ${focusRing}`;

/** Type scale: 12 meta, 14 UI, 16 body; display sizes only for page-level headings. */
export const text = {
  meta: "text-[12px] leading-4 text-ink-3",
  ui: "text-[14px] leading-5 text-ink",
  body: "text-[16px] leading-6 text-ink",
  title: "text-[16px] leading-6 font-medium text-ink",
  display: "text-[28px] leading-9 font-semibold tracking-tight text-ink",
} as const;
