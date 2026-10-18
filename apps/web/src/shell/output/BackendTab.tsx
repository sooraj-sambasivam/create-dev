import { useEffect, useMemo, useRef, useState } from "react";
import { Check, CircleAlert, Copy, Database, Download, FileText, Globe, MousePointerClick, TextCursorInput, type LucideIcon } from "lucide-react";
import type { StoredSubmission } from "@create/shared";
import { listSubmissions, resolveAppId } from "../../components/forms";
import { downloadFile, exportSite } from "../../lib/exportSite";
import { isTechnical, useProfile } from "../../onboarding/profile";
import { useScreenStore } from "../../store/screenStore";
import { curlExample, deriveAppBackend, sampleBody, type AppBackend, type BackendStatus } from "./appBackend";
import { fetchHealth, lastSharedUrl } from "./shareApi";
import { liveColumns, newIds, submissionsFor } from "./liveRows";
import { button, chip, dot } from "../../ui/styles";

const PILL: Record<BackendStatus, { label: string; cls: string }> = {
  connected: { label: "Connected", cls: "bg-ok" },
  sample: { label: "Sample data", cls: "bg-warn" },
  setup: { label: "Needs setup", cls: "bg-warn" },
};

function Pill({ status }: { status: BackendStatus }) {
  const p = PILL[status];
  return (
    <span className={`${chip.status} shrink-0`}>
      <span className={`size-1.5 rounded-full ${p.cls}`} aria-hidden />
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
const btn = `${button.secondary} w-full`;

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

const POLL_MS = 3000;

/** Newest 5 responses as a table, polled every 3s while the tab is visible. New rows flash once. */
function Responses({ appId, formId, fields, dev }: { appId: string; formId: string; fields: { name: string; label: string }[]; dev: boolean }) {
  const [rows, setRows] = useState<StoredSubmission[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [visible, setVisible] = useState(() => typeof document === "undefined" || document.visibilityState !== "hidden");
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const known = useRef<Set<string> | null>(null);

  useEffect(() => {
    const onVis = () => setVisible(document.visibilityState !== "hidden");
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  useEffect(() => {
    if (!visible) return;
    const ctl = new AbortController();
    const timers: ReturnType<typeof setTimeout>[] = [];
    const tick = () =>
      listSubmissions(appId, ctl.signal).then(
        (all) => {
          if (ctl.signal.aborted) return;
          const mine = submissionsFor(all, formId);
          const added = newIds(known.current, mine);
          known.current = new Set(mine.map((r) => r.id));
          setRows(mine);
          setFailed(false);
          if (added.length) {
            setFresh((p) => new Set([...p, ...added]));
            timers.push(setTimeout(() => setFresh((p) => new Set([...p].filter((id) => !added.includes(id)))), 2200));
          }
        },
        () => { if (!ctl.signal.aborted) setFailed(true); },
      );
    void tick();
    const iv = setInterval(tick, POLL_MS);
    return () => {
      ctl.abort();
      clearInterval(iv);
      timers.forEach(clearTimeout);
    };
  }, [appId, formId, visible]);

  const cols = liveColumns(fields, rows ?? []);
  const count = rows?.length ?? 0;
  const live = visible && !failed && rows !== null;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex h-8 items-center justify-between gap-2">
        <span className="text-[14px] text-ink">{failed && rows === null ? "Couldn't load responses" : rows === null ? "Loading…" : `${count} ${count === 1 ? "response" : "responses"}`}</span>
        <span className={chip.status} role="status">
          <span className={failed ? dot.bad : live ? dot.ok : dot.idle} aria-hidden />
          {failed ? "Offline" : live ? "Live" : visible ? "Connecting…" : "Paused"}
        </span>
      </div>
      {count > 0 && (
        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full border-collapse text-left text-[12px]">
            <thead>
              <tr className="bg-tray text-ink-2">
                <th scope="col" className="h-6 px-2 font-normal">Time</th>
                {cols.map((c) => <th key={c.key} scope="col" className="h-6 px-2 font-normal">{c.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows!.slice(0, 5).map((r) => (
                <tr key={r.id} className={`border-t border-line transition-colors duration-700 ${fresh.has(r.id) ? "bg-hover" : "bg-surface"}`}>
                  <td className="whitespace-nowrap px-2 py-1.5 font-mono text-ink-2" title={r.createdAt}>{r.createdAt.slice(11, 19)}</td>
                  {cols.map((c) => (
                    <td key={c.key} className={`max-w-[160px] truncate px-2 py-1.5 text-ink ${dev ? "font-mono" : ""}`} title={r.fields[c.key]}>{r.fields[c.key] ?? ""}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
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
            <Responses appId={appId} formId={f.id} fields={f.fields} dev={dev} />
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
              {exporting ? "Exporting…" : "Export HTML"}
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
