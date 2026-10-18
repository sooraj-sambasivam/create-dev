import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import type { Container, Leaf as LeafNode, Node, Style } from "@create/shared";
import { EditableText } from "../editor/EditableText";
import { formatDataValue, getField } from "./dataFormat";
import { useSandboxData } from "./sandboxData";

/**
 * How each element type looks. ScreenRenderer wraps these with editor behaviour
 * (selection, drag, resize); here we only turn node data into DOM.
 */

export type Direction = Container["direction"];

export const gapClass: Record<Container["gap"], string> = { none: "gap-0", sm: "gap-2", md: "gap-4", lg: "gap-8" };
export const padClass: Record<Container["padding"], string> = { none: "p-0", sm: "p-3", md: "p-6", lg: "p-10", xl: "px-10 py-16 md:px-16 md:py-24" };
export const alignClass: Record<Container["align"], string> = {
  start: "items-start",
  center: "items-center",
  end: "items-end",
  stretch: "items-stretch",
};
export const justifyClass: Record<Container["justify"], string> = {
  start: "justify-start",
  center: "justify-center",
  end: "justify-end",
  between: "justify-between",
};
// Equal shares (flex: 1 1 0) so columns and an image beside them split the row evenly.
export const containerWidth: Record<Container["width"], string> = {
  full: "w-full",
  auto: "w-auto shrink-0",
  half: "w-full md:w-auto md:flex-1 md:basis-0 min-w-0",
  third: "w-full md:w-auto md:flex-1 md:basis-0 min-w-0",
  quarter: "w-full sm:w-[calc(50%-1rem)] md:w-auto md:flex-1 md:basis-0 min-w-0",
};

const RADIUS: Record<NonNullable<Style["radius"]>, string> = { none: "0px", sm: "4px", md: "8px", lg: "16px", full: "9999px" };
const SHADOW: Record<NonNullable<Style["shadow"]>, string> = {
  none: "none",
  sm: "0 1px 2px rgb(0 0 0 / 0.06), 0 1px 3px rgb(0 0 0 / 0.08)",
  md: "0 4px 12px -2px rgb(0 0 0 / 0.12), 0 2px 4px rgb(0 0 0 / 0.06)",
  lg: "0 24px 48px -12px rgb(0 0 0 / 0.25)",
};
const FONT_SIZE: Record<NonNullable<Style["fontSize"]>, string> = {
  sm: "0.875rem", base: "1rem", lg: "1.125rem", xl: "1.25rem", "2xl": "1.5rem", "3xl": "1.875rem", "4xl": "2.5rem", "5xl": "3.25rem",
};
const WEIGHT: Record<NonNullable<Style["weight"]>, number> = { normal: 400, medium: 500, semibold: 600, bold: 700, black: 900 };
const FILTER: Record<NonNullable<Style["filter"]>, string> = { none: "none", grayscale: "grayscale(1)", sepia: "sepia(0.8)" };

/** User style overrides as CSS. Only set fields produce output. */
export function overrides(style: Style | null | undefined): CSSProperties {
  const css: CSSProperties = {};
  if (!style) return css;
  if (style.color) css.color = style.color;
  if (style.background) {
    css.background = style.gradientTo
      ? `linear-gradient(135deg, ${style.background}, ${style.gradientTo})`
      : style.background;
  }
  if (style.radius) css.borderRadius = RADIUS[style.radius];
  if (style.shadow) css.boxShadow = SHADOW[style.shadow];
  if (style.border) css.border = "1px solid var(--border)";
  if (style.fontSize) css.fontSize = FONT_SIZE[style.fontSize];
  if (style.weight) css.fontWeight = WEIGHT[style.weight];
  if (style.align) css.textAlign = style.align;
  if (style.italic) css.fontStyle = "italic";
  if (style.filter && style.filter !== "none") css.filter = FILTER[style.filter];
  return css;
}

export function containerStyle(node: Container): CSSProperties {
  const css: CSSProperties & Record<string, string> = {};
  const bg = node.background;
  if (bg === "accent") {
    css.background = "var(--accent)";
    css.color = "var(--accent-fg)";
  } else if (bg !== "none") {
    css.background = `var(--${bg})`;
  }
  if (bg === "surface") {
    css.boxShadow = "0 0 0 1px var(--border), 0 1px 2px rgb(0 0 0 / 0.04), 0 8px 24px -12px rgb(0 0 0 / 0.12)";
  }
  const photo = node.bgSrc ?? (node.bgQuery ? photoUrl(node.bgQuery, `${node.id}-bg`) : null);
  if (photo) {
    const tint =
      node.overlay === "dark"
        ? "linear-gradient(rgb(0 0 0 / 0.55), rgb(0 0 0 / 0.55)), "
        : node.overlay === "light"
          ? "linear-gradient(rgb(255 255 255 / 0.7), rgb(255 255 255 / 0.7)), "
          : "";
    css.backgroundImage = `${tint}url("${photo}")`;
    css.backgroundSize = "cover";
    css.backgroundPosition = "center";
    if (node.overlay === "dark") css.color = "#ffffff";
    if (node.overlay === "light") css.color = "#111827";
  }
  // Muted text follows the container's text color when it isn't the page default,
  // so subtitles stay readable on accent, photo or custom-colored sections.
  if (bg === "accent" || node.style?.color || (photo && node.overlay !== "none")) {
    css["--fg-muted"] = "color-mix(in srgb, currentColor 75%, transparent)";
  }
  // Badges and links on accent or dark-photo sections switch to the section's text color.
  if (bg === "accent" || (photo && node.overlay === "dark")) {
    css["--badge-bg"] = "color-mix(in srgb, currentColor 18%, transparent)";
    css["--badge-fg"] = "currentColor";
  }
  return css;
}

/** Width of a leaf depends on the parent's flow direction. */
export function leafWidth(node: Node, parent: Direction, align: Container["align"]): string {
  if (parent === "column") {
    const hugs =
      ["button", "link", "checkbox", "badge", "icon", "rating", "avatar"].includes(node.type) ||
      (node.type === "image" && node.size !== "full");
    // Small elements hug their content so selection and resize handles sit on the element itself.
    if (hugs && align !== "stretch") return "w-fit max-w-full";
    if (hugs) return "w-fit max-w-full self-start";
    return "w-full";
  }
  switch (node.type) {
    case "image":
      return (node as { size?: string }).size === "full" ? "flex-1 min-w-0" : "min-w-0 max-w-full shrink";
    case "textbox":
    case "video":
    case "map":
    case "table":
    case "accordion":
    case "list":
      return "flex-1 min-w-0";
    case "heading":
    case "text":
      return "min-w-0";
    case "spacer":
      return "flex-1";
    default:
      return "shrink-0";
  }
}

export function photoUrl(query: string, seed: string): string {
  return `/api/image?q=${encodeURIComponent(query.trim())}&seed=${encodeURIComponent(seed)}`;
}

// ---------------------------------------------------------------- icons

const COLORFUL_SET = /^(fluent-emoji|flat-color-icons|noto|twemoji|logos|emojione|openmoji|fxemoji|streamline-emojis|vscode-icons|skill-icons|devicon)/;
const ICON_PX: Record<string, number> = { sm: 16, md: 24, lg: 36, xl: 56, "2xl": 80 };

/** Iconify icon. Single-color sets follow the current text color; colorful sets keep theirs.
 *  If the icon cannot load (offline, rate-limited), an outlined box of the same size keeps rows from collapsing. */
export function IconGlyph({ name, px, style }: { name: string; px: number; style?: CSSProperties }) {
  const [prefix, icon] = name.split(":");
  const url = prefix && icon ? `/api/icons/svg?name=${encodeURIComponent(name)}` : "";
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const colorful = COLORFUL_SET.test(prefix ?? "");
  useEffect(() => {
    if (!url || colorful) return;
    // Mask images give no error signal, so probe once (the browser caches the result).
    const probe = new Image();
    probe.onerror = () => setFailedUrl(url);
    probe.src = url;
    return () => {
      probe.onerror = null;
    };
  }, [url, colorful]);
  if (!url) return null;
  if (failedUrl === url) {
    return (
      <span
        aria-hidden
        data-icon-missing
        className="inline-block shrink-0 rounded-[4px] border border-dashed"
        style={{ width: px, height: px, borderColor: "currentColor", opacity: 0.35, ...style }}
      />
    );
  }
  if (colorful) {
    return (
      <img
        src={url}
        width={px}
        height={px}
        alt=""
        draggable={false}
        onError={() => setFailedUrl(url)}
        className="inline-block shrink-0"
        style={style}
      />
    );
  }
  const mask = `url("${url}") center / contain no-repeat`;
  return (
    <span
      aria-hidden
      className="inline-block shrink-0"
      style={{ width: px, height: px, backgroundColor: "currentColor", mask, WebkitMask: mask, ...style }}
    />
  );
}

// ---------------------------------------------------------------- links

/** Attributes that make a link behave correctly in an exported site too. */
function linkAttrs(href: string | null | undefined) {
  if (!href) return { href: "#" };
  return /^https?:/i.test(href) ? { href, target: "_blank", rel: "noopener noreferrer" } : { href };
}

/** In preview mode, buttons and links act: '#id' scrolls to that element, others open in a new tab. */
function follow(href: string | null | undefined, interactive: boolean, e: React.MouseEvent) {
  e.preventDefault();
  if (!interactive || !href) return;
  if (href.startsWith("#")) {
    const target = document.querySelector(`[data-screen-root] [data-node-id="${CSS.escape(href.slice(1))}"]`);
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }
  // Phone and email links hand off to the phone or mail app without opening a blank tab.
  if (/^(tel|mailto):/i.test(href)) {
    window.location.href = href;
    return;
  }
  window.open(href, "_blank", "noopener,noreferrer");
}

// ---------------------------------------------------------------- media

function Photo({
  src,
  alt,
  className,
  style,
}: {
  src: string;
  alt: string;
  className: string;
  style?: CSSProperties;
}) {
  const [state, setState] = useState<{ src: string; status: "loading" | "loaded" | "failed" }>({ src, status: "loading" });
  const status = state.src === src ? state.status : "loading";
  return (
    <figure className={`relative overflow-hidden ${className}`} style={{ background: "var(--muted)", ...style }}>
      {status !== "failed" && (
        <img
          key={src}
          src={src}
          alt={alt}
          draggable={false}
          onLoad={() => setState({ src, status: "loaded" })}
          onError={() => setState({ src, status: "failed" })}
          className={`h-full w-full object-cover transition-opacity duration-500 ${status === "loaded" ? "opacity-100" : "opacity-0"}`}
        />
      )}
      {status === "loading" && <div className="shimmer-light absolute inset-0" />}
      {status === "failed" && (
        <div
          data-photo-missing
          className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 p-3 text-center text-xs"
          style={{ background: "linear-gradient(135deg, var(--muted), var(--surface))", color: "var(--fg-muted)" }}
        >
          <IconGlyph name="lucide:image-off" px={22} />
          <span className="font-medium">No photo found</span>
          <span className="line-clamp-2 opacity-80">{alt}</span>
        </div>
      )}
    </figure>
  );
}

function videoEmbed(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    if (host === "youtu.be") return `https://www.youtube-nocookie.com/embed/${u.pathname.slice(1)}`;
    if (host.endsWith("youtube.com")) {
      const v = u.searchParams.get("v") ?? u.pathname.match(/\/(embed|shorts)\/([\w-]+)/)?.[2];
      return v ? `https://www.youtube-nocookie.com/embed/${v}` : null;
    }
    if (host.endsWith("vimeo.com")) {
      const vid = u.pathname.match(/(\d+)/)?.[1];
      return vid ? `https://player.vimeo.com/video/${vid}` : null;
    }
  } catch {
    // Not a URL.
  }
  return null;
}

function Stars({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(5, value)) * 20;
  const row = (
    <span className="flex gap-0.5">
      {Array.from({ length: 5 }, (_, i) => (
        <IconGlyph key={i} name="ph:star-fill" px={18} />
      ))}
    </span>
  );
  return (
    <span className="relative inline-block" aria-label={`${value} out of 5 stars`}>
      <span style={{ color: "var(--border)" }}>{row}</span>
      <span className="absolute inset-0 overflow-hidden" style={{ width: `${pct}%`, color: "#f5a524" }}>
        {row}
      </span>
    </span>
  );
}

// ---------------------------------------------------------------- leaves

const inputClass =
  "w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--accent)]/40";
const inputBase: CSSProperties = { borderColor: "var(--border)", background: "var(--input-bg)", color: "var(--fg)" };

function Label({ nodeId, text, children }: { nodeId: string; text: string; children: ReactNode }) {
  if (!text) return <>{children}</>;
  return (
    <label className="flex w-full flex-col gap-1.5 text-sm font-medium">
      <EditableText nodeId={nodeId} field="label" value={text} />
      {children}
    </label>
  );
}

function LiveData({ node, o }: { node: Extract<LeafNode, { type: "data" }>; o: CSSProperties }) {
  const result = useSandboxData(node.source, node.refreshSec ?? 0);
  const shown = result.status === "ready" ? formatDataValue(getField(result.data, node.field), node.format) : null;
  return (
    <div className="flex flex-col gap-1" style={o} data-live-fallback={node.fallback} aria-busy={result.status === "loading"}>
      {node.label && (
        <span className="text-sm" style={{ color: "var(--fg-muted)" }}>
          {node.label}
        </span>
      )}
      {result.status === "loading" ? (
        <span className="block h-8 w-24 animate-pulse rounded-md" style={{ background: "color-mix(in srgb, currentColor 14%, transparent)" }} aria-label="Loading" />
      ) : (
        <span className="text-3xl font-semibold leading-tight tracking-tight tabular-nums">{shown ?? node.fallback}</span>
      )}
    </div>
  );
}

export function Leaf({ node, fill, interactive }: { node: LeafNode; fill: boolean; interactive: boolean }) {
  const o = overrides(node.style);
  const boxed = node.style?.background ? "px-2 py-1 rounded-md" : "";
  switch (node.type) {
    case "heading": {
      const cls =
        node.level === 1
          ? "text-3xl font-semibold leading-tight tracking-tight text-balance md:text-4xl"
          : node.level === 2
            ? "text-2xl font-semibold leading-tight tracking-tight text-balance"
            : "text-base font-semibold leading-snug";
      const Tag = `h${node.level}` as const;
      return (
        <Tag className={`${cls} ${boxed}`} style={o}>
          <EditableText nodeId={node.id} field="text" value={node.text} />
        </Tag>
      );
    }
    case "text":
      return (
        <p
          className={`text-base leading-relaxed text-pretty ${boxed}`}
          style={{ ...(node.tone === "muted" ? { color: "var(--fg-muted)" } : {}), ...o }}
        >
          <EditableText nodeId={node.id} field="text" value={node.text} />
        </p>
      );
    case "button": {
      const base = `inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition active:scale-[0.98] ${fill ? "w-full" : ""}`;
      const variant: CSSProperties =
        node.variant === "primary"
          ? { background: "var(--accent)", color: "var(--accent-fg)" }
          : node.variant === "secondary"
            ? { border: "1px solid var(--border)", background: "var(--surface)", color: "var(--fg)" }
            : { color: "var(--accent)" };
      const inner = (
        <>
          {node.icon && <IconGlyph name={node.icon} px={18} />}
          {(node.label || !node.icon) && <EditableText nodeId={node.id} field="label" value={node.label} />}
        </>
      );
      return node.href ? (
        <a {...linkAttrs(node.href)} className={`${base} no-underline`} style={{ ...variant, ...o }} onClick={(e) => follow(node.href, interactive, e)}>
          {inner}
        </a>
      ) : (
        <button type="button" className={base} style={{ ...variant, ...o }}>
          {inner}
        </button>
      );
    }
    case "link":
      return (
        <a
          {...linkAttrs(node.href)}
          onClick={(e) => follow(node.href, interactive, e)}
          className={`inline-flex items-center gap-1.5 text-sm font-medium underline decoration-current/30 underline-offset-4 transition-colors hover:decoration-current ${fill ? "flex" : ""} ${boxed}`}
          style={{ color: "var(--fg)", ...o }}
        >
          {node.icon && <IconGlyph name={node.icon} px={node.text ? 16 : 22} />}
          {(node.text || !node.icon) && <EditableText nodeId={node.id} field="text" value={node.text} />}
        </a>
      );
    case "icon": {
      const px = ICON_PX[node.size] ?? 24;
      const { color, filter, ...rest } = o;
      return (
        <span className="inline-flex" style={{ color: color ?? "var(--accent)", ...rest }}>
          <IconGlyph name={node.name} px={px} style={filter ? { filter } : undefined} />
        </span>
      );
    }
    case "image": {
      const aspectClass =
        node.aspect === "square" ? "aspect-square" : node.aspect === "wide" ? "aspect-[21/9]" : node.aspect === "portrait" ? "aspect-[3/4]" : "aspect-video";
      const src = node.src ?? photoUrl(node.query || node.alt, node.id);
      if (node.size !== "full") {
        // Logos and small pictures: fixed height, natural width, never cropped.
        const h = node.size === "logo" ? 40 : node.size === "small" ? 96 : 200;
        return <img src={src} alt={node.alt} draggable={false} className={`block h-auto w-auto min-w-0 max-w-full object-contain ${node.size === "logo" ? "" : "rounded-lg"}`} style={{ maxHeight: h, height: h, ...o }} />;
      }
      return <Photo src={src} alt={node.alt} className={`w-full rounded-xl ${aspectClass}`} style={o} />;
    }
    case "avatar": {
      const px = node.size === "sm" ? 36 : node.size === "lg" ? 80 : 52;
      const initials = node.name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
      const src = node.src ?? (node.query ? photoUrl(node.query, node.id) : null);
      return src ? (
        <Photo src={src} alt={node.name} className="shrink-0 rounded-full" style={{ width: px, height: px, ...o }} />
      ) : (
        <span
          className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold"
          style={{ width: px, height: px, background: "var(--accent)", color: "var(--accent-fg)", fontSize: px / 2.6, ...o }}
        >
          {initials}
        </span>
      );
    }
    case "badge":
      return (
        <span
          className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold"
          style={{ background: "var(--badge-bg, color-mix(in srgb, var(--accent) 14%, transparent))", color: "var(--badge-fg, var(--accent))", ...o }}
        >
          <EditableText nodeId={node.id} field="text" value={node.text} />
        </span>
      );
    case "list": {
      const Tag = node.marker === "number" ? "ol" : "ul";
      return (
        <Tag className={`flex flex-col gap-2 text-base ${node.marker === "number" ? "list-decimal pl-5" : ""}`} style={o}>
          {node.items.map((item, i) => (
            <li key={i} className={node.marker === "number" ? "" : "flex items-start gap-2.5"}>
              {node.marker === "check" && (
                <span className="mt-1" style={{ color: "var(--accent)" }}>
                  <IconGlyph name="lucide:circle-check" px={18} />
                </span>
              )}
              {node.marker === "bullet" && <span className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: "currentColor" }} />}
              <span>{item}</span>
            </li>
          ))}
        </Tag>
      );
    }
    case "rating":
      return (
        <span className="inline-flex items-center gap-2 text-sm" style={o}>
          <Stars value={node.value} />
          <span className="font-semibold">{node.value.toFixed(1)}</span>
          {node.label && <span style={{ color: "var(--fg-muted)" }}>{node.label}</span>}
        </span>
      );
    case "table":
      return (
        <div className="w-full overflow-x-auto rounded-xl" style={{ boxShadow: "0 0 0 1px var(--border)", ...o }}>
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr style={{ background: "var(--muted)" }}>
                {node.columns.map((c, i) => (
                  <th key={i} className="px-4 py-2.5 font-semibold">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {node.rows.map((row, r) => (
                <tr key={r} style={{ borderTop: "1px solid var(--border)" }}>
                  {row.map((cell, c) => (
                    <td key={c} className={`px-4 py-2.5 ${c === row.length - 1 && row.length > 1 ? "text-right tabular-nums" : ""}`}>
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "accordion":
      return (
        <div className="flex w-full flex-col rounded-xl" style={{ boxShadow: "0 0 0 1px var(--border)", ...o }}>
          {node.items.map((item, i) => (
            <details key={i} className="group px-4 py-3" style={i > 0 ? { borderTop: "1px solid var(--border)" } : undefined} open={i === 0}>
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium">
                {item.question}
                <span className="transition group-open:rotate-45" style={{ color: "var(--fg-muted)" }}>
                  <IconGlyph name="lucide:plus" px={18} />
                </span>
              </summary>
              <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--fg-muted)" }}>
                {item.answer}
              </p>
            </details>
          ))}
        </div>
      );
    case "video": {
      const embed = videoEmbed(node.url);
      const aspect = node.aspect === "square" ? "aspect-square" : "aspect-video";
      return embed ? (
        <iframe
          src={embed}
          title="Video"
          className={`w-full rounded-xl ${aspect}`}
          style={o}
          loading="lazy"
          allow="accelerometer; encrypted-media; picture-in-picture; fullscreen"
          sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
        />
      ) : (
        <div
          className={`flex w-full flex-col items-center justify-center gap-2 rounded-xl text-sm ${aspect}`}
          style={{ background: "var(--muted)", color: "var(--fg-muted)", ...o }}
        >
          <IconGlyph name="lucide:circle-play" px={44} />
          Paste a YouTube or Vimeo link in the panel
        </div>
      );
    }
    case "map":
      return (
        <iframe
          title={`Map of ${node.address}`}
          src={`https://maps.google.com/maps?q=${encodeURIComponent(node.address)}&z=15&output=embed`}
          className="h-72 w-full rounded-xl border-0"
          style={o}
          loading="lazy"
          sandbox="allow-scripts allow-same-origin allow-popups"
        />
      );
    case "textbox":
      return (
        <Label nodeId={node.id} text={node.label}>
          {node.multiline ? (
            <textarea rows={4} placeholder={node.placeholder} className={inputClass} style={{ ...inputBase, ...o }} />
          ) : (
            <input type="text" placeholder={node.placeholder} className={inputClass} style={{ ...inputBase, ...o }} />
          )}
        </Label>
      );
    case "checkbox":
      return (
        <label className={`flex items-center gap-2 text-sm ${boxed}`} style={o}>
          <input type="checkbox" className="h-4 w-4 accent-[var(--accent)]" />
          <EditableText nodeId={node.id} field="label" value={node.label} />
        </label>
      );
    case "select":
      return (
        <Label nodeId={node.id} text={node.label}>
          <select className={inputClass} style={{ ...inputBase, ...o }} defaultValue="">
            <option value="" disabled>
              Select…
            </option>
            {[...new Set(node.options.map((v) => v.trim()).filter(Boolean))].map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </Label>
      );
    case "data":
      return <LiveData node={node} o={o} />;
    case "divider":
      return (
        <hr
          className="w-full border-0 border-t"
          style={{ borderColor: node.style?.color ?? node.style?.background ?? "var(--border)" }}
        />
      );
    case "spacer": {
      const h = { sm: 16, md: 32, lg: 64, xl: 112 }[node.size];
      return <div style={{ height: h }} aria-hidden />;
    }
  }
}

// ---------------------------------------------------------------- page-level

/** Readable text color on top of a brand color. */
function accentText(hex: string): string {
  const full = hex.length === 4 ? `#${[...hex.slice(1)].map((c) => c + c).join("")}` : hex.slice(0, 7);
  const n = parseInt(full.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.45 ? "#111827" : "#ffffff";
}

export function accentVars(accent: string | null | undefined): CSSProperties {
  if (!accent || !/^#[0-9a-f]{3,8}$/i.test(accent)) return {};
  return { "--accent": accent, "--accent-fg": accentText(accent) } as CSSProperties;
}

export const FONT_FAMILY: Record<string, string> = {
  sans: '"Inter", ui-sans-serif, system-ui, sans-serif',
  serif: '"Fraunces", "Playfair Display", Georgia, serif',
  display: '"Space Grotesk", "Inter", ui-sans-serif, sans-serif',
  rounded: '"Nunito", ui-rounded, ui-sans-serif, sans-serif',
  mono: '"JetBrains Mono", ui-monospace, monospace',
  handwritten: '"Caveat", "Comic Sans MS", cursive',
};
