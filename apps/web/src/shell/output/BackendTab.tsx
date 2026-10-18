import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, CircleAlert, Copy, Database, Download, FileText, Globe, MousePointerClick, RefreshCw, TextCursorInput, type LucideIcon } from "lucide-react";
import type { StoredSubmission } from "@create/shared";
import { listSubmissions, resolveAppId } from "../../components/forms";
import { downloadFile, exportSite } from "../../lib/exportSite";
import { isTechnical, useProfile } from "../../onboarding/profile";
import { useScreenStore } from "../../store/screenStore";
import { curlExample, deriveAppBackend, sampleBody, type AppBackend, type BackendStatus } from "./appBackend";
import { fetchHealth, lastSharedUrl } from "./shareApi";

const PILL: Record<BackendStatus, { label: string; cls: string }> = {
  connected: { label: "Connected", cls: "bg-ok" },
  sample: { label: "Sample data", cls: "bg-warn" },
  setup: { label: "Needs setup", cls: "bg-bad" },
};

function Pill({ status }: { status: BackendStatus }) {
  const p = PILL[status];
  return (
    <span className="flex h-6 shrink-0 items-center gap-1.5 rounded-full bg-tray px-2 text-[12px] text-ink-2">
      <span className={`size-2 rounded-full ${p.cls}`} aria-hidden />
      {p.label}
    </span>
  );
}

function Section({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="flex h-6 items-center gap-2 text-[14px] font-medium text-ink">
        <Icon size={16} strokeWidth={1.75} className="text-ink-2" aria-hidden />
        {title}
      </h3>
      <div className="flex flex-col gap-2 pl-6">{children}</div>
    </section>
  );
}

const card = "flex flex-col gap-2 rounded-lg border border-line bg-surface p-3";
const btn = "flex h-8 items-center justify-center gap-1.5 rounded-lg border border-line px-3 text-[14px] text-ink transition-colors duration-150 hover:bg-hover disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

function Code({ children }: { children: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative">
      <pre className="whitespace-pre-wrap break-all rounded-lg bg-tray p-3 pr-9 font-mono text-[12px] text-ink">{children}</pre>
      <button
        aria-label="Copy"
        title="Copy"
        className="absolute right-1 top-1 grid size-6 place-items-center rounded-lg text-ink-2 transition-colors duration-150 hover:bg-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        onClick={() => navigator.clipboard?.writeText(children).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }, () => {})}
      >
        {copied ? <Check size={16} strokeWidth={1.75} className="text-ok" /> : <Copy size={16} strokeWidth={1.75} />}
      </button>
    </div>
  );
}

function Responses({ appId, formId, dev }: { appId: string; formId: string; dev: boolean }) {
  const [rows, setRows] = useState<StoredSubmission[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback((signal?: AbortSignal) => {
    setBusy(true);
    listSubmissions(appId, signal).then(
      (r) => { setRows(r); setFailed(false); setBusy(false); },
      () => { if (!signal?.aborted) { setFailed(true); setBusy(false); } },
    );
  }, [appId]);
  useEffect(() => {
    const ctl = new AbortController();
    load(ctl.signal);
    return () => ctl.abort();
  }, [load]);

  const mine = (rows ?? []).filter((r) => r.formId === formId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return (
    <div className="flex flex-col gap-1">
      <div className="flex h-8 items-center justify-between">
        <span className="text-[14px] text-ink-2">{failed ? "Couldn't load responses" : rows === null ? "Loading…" : `${mine.length} ${mine.length === 1 ? "response" : "responses"}`}</span>
        <button aria-label="Refresh responses" title="Refresh" disabled={busy} className="grid size-8 place-items-center rounded-lg text-ink-2 transition-colors duration-150 hover:bg-hover disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent" onClick={() => load()}>
          <RefreshCw size={16} strokeWidth={1.75} className={busy ? "animate-spin" : ""} />
        </button>
      </div>
      {mine.slice(0, 5).map((r) => (
        <div key={r.id} className="flex gap-2 border-t border-line py-1.5 text-[12px]">
          <time className="shrink-0 font-mono text-ink-2" title={r.createdAt}>{r.createdAt.slice(11, 19)}</time>
          <span className={`min-w-0 break-all text-ink ${dev ? "font-mono" : ""}`}>
            {dev ? JSON.stringify(r.fields) : Object.values(r.fields).filter(Boolean).join(" · ")}
          </span>
        </div>
      ))}
    </div>
  );
}

function Empty() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-1 px-6 py-12 text-center">
      <p className="text-[16px] text-ink">Build something to see its backend.</p>
      <p className="text-[14px] text-ink-2">Forms, live data and links on your page show up here.</p>
    </div>
  );
}

/** Backend tab body: the backend of the user's app, derived from the current Screen. Renders inside the right panel. */
export function BackendTab() {
  const screen = useScreenStore((s) => s.screen);
  const level = useProfile((s) => s.level);
  const dev = isTechnical(level);
  const [mock, setMock] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ctl = new AbortController();
    fetchHealth(ctl.signal).then((h) => setMock(!!h.mock), () => {});
    return () => ctl.abort();
  }, []);

  const appId = resolveAppId();
  const shareUrl = lastSharedUrl();
  const b: AppBackend = useMemo(() => deriveAppBackend(screen, { appId, shareUrl, mock }), [screen, appId, shareUrl, mock]);
  if (!screen) return <Empty />;

  const exportCode = async () => {
    setExporting(true);
    setError(null);
    try {
      const { filename, html } = await exportSite();
      downloadFile(filename, html);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't export the code.");
    } finally {
      setExporting(false);
    }
  };

  const origin = typeof location !== "undefined" ? location.origin : "";

  return (
    <div className="flex flex-col gap-4 overflow-y-auto px-4 py-3">
      <Section icon={FileText} title="Pages">
        {b.pages.map((p) => (
          <div key={p.id} className={`${card} flex-row items-center justify-between`}>
            <span className="min-w-0 truncate text-[14px] text-ink">{p.title}</span>
            <span className="shrink-0 font-mono text-[12px] text-ink-2">{dev ? `${p.path} · ${p.elements} elements` : `${p.elements} elements`}</span>
          </div>
        ))}
      </Section>

      <Section icon={TextCursorInput} title="Forms">
        {b.forms.length === 0 && <p className="text-[14px] text-ink-2">{dev ? "No forms on this page." : "No forms yet. Ask for a signup or contact form."}</p>}
        {b.forms.map((f) => (
          <div key={f.id} className={card}>
            <div className="flex items-center justify-between gap-2">
              <span className="min-w-0 truncate text-[14px] text-ink">{dev ? f.label : `Your ${f.label.toLowerCase()} form`}</span>
              <Pill status={f.status} />
            </div>
            {dev ? (
              <>
                <p className="font-mono text-[12px] text-ink-2">POST {f.endpoint}</p>
                <Code>{JSON.stringify(sampleBody(f), null, 2)}</Code>
                <Code>{curlExample(f, origin)}</Code>
              </>
            ) : (
              <p className="text-[14px] text-ink-2">Saves to Create. Asks for: {f.fields.map((x) => x.label).join(", ")}.</p>
            )}
            <Responses appId={appId} formId={f.id} dev={dev} />
          </div>
        ))}
      </Section>

      <Section icon={Database} title="Data">
        {b.data.length === 0 && <p className="text-[14px] text-ink-2">{dev ? "No live data sources." : "Nothing on the page updates by itself."}</p>}
        {b.data.map((d) => (
          <div key={d.id} className={`${card} flex-row items-center justify-between`}>
            <div className="min-w-0">
              <p className="truncate text-[14px] text-ink">{d.label}</p>
              <p className="text-[12px] text-ink-2">
                {dev ? `GET /api/live${d.source}` : "Live value"}
                {d.refreshSec ? ` · every ${d.refreshSec}s` : ""}
              </p>
            </div>
            <Pill status={d.status} />
          </div>
        ))}
      </Section>

      <Section icon={MousePointerClick} title="Actions">
        {b.actions.length === 0 && <p className="text-[14px] text-ink-2">No buttons or links.</p>}
        {b.actions.map((a) => (
          <div key={a.id} className={`${card} flex-row items-center justify-between`}>
            <span className="min-w-0 truncate text-[14px] text-ink">{a.label}</span>
            <span className="flex shrink-0 items-center gap-2">
              <span className="max-w-[160px] truncate font-mono text-[12px] text-ink-2">
                {a.kind === "submit" ? "sends the form" : a.target || "does nothing yet"}
              </span>
              <Pill status={a.kind === "button" ? "setup" : "connected"} />
            </span>
          </div>
        ))}
      </Section>

      <Section icon={Globe} title="Hosting">
        <div className={card}>
          <div className="flex items-center justify-between gap-2">
            <span className="text-[14px] text-ink">{b.hosting.published ? "Shared" : "Only in Create"}</span>
            <Pill status={b.hosting.published ? "connected" : "setup"} />
          </div>
          {b.hosting.shareUrl ? (
            <a href={b.hosting.shareUrl} target="_blank" rel="noreferrer" className="truncate font-mono text-[12px] text-ink">{b.hosting.shareUrl}</a>
          ) : (
            <p className="text-[14px] text-ink-2">Copy the share link in the Output tab to put it online.</p>
          )}
          {dev && b.env.length > 0 && (
            <div className="flex flex-col gap-1">
              <span className="text-[12px] text-ink-2">Environment variables</span>
              <Code>{b.env.join("\n")}</Code>
            </div>
          )}
          {dev && (
            <button className={btn} onClick={exportCode} disabled={exporting}>
              <Download size={16} strokeWidth={1.75} />
              {exporting ? "Exporting…" : "Export code"}
            </button>
          )}
        </div>
        {error && (
          <p role="alert" className="flex items-center gap-1.5 text-[14px] text-bad">
            <CircleAlert size={16} strokeWidth={1.75} aria-hidden className="shrink-0" />
            {error}
          </p>
        )}
      </Section>
    </div>
  );
}
