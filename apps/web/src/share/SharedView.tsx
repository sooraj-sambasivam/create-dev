import { useEffect, useState } from "react";
import { ScreenSchema, type SharedPrototype } from "@create/shared";
import { ScreenRenderer } from "../components/ScreenRenderer";
import { remixScreen } from "./remix";
import { APP_NAME, sharedDocumentTitle } from "./brand";

type LoadState =
  | { status: "loading" }
  | { status: "ready"; prototype: SharedPrototype }
  | { status: "not-found" }
  | { status: "error"; message: string };

/** GET /api/prototypes/:id, validated. Resolves to null when the prototype does not exist. */
async function fetchPrototype(id: string, signal: AbortSignal): Promise<SharedPrototype | null> {
  const res = await fetch(`/api/prototypes/${encodeURIComponent(id)}`, { signal, headers: { Accept: "application/json" } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Could not load this prototype (${res.status}).`);
  const data = (await res.json()) as Partial<SharedPrototype>;
  const screen = ScreenSchema.safeParse(data.screen);
  if (!screen.success || typeof data.id !== "string") throw new Error("This prototype could not be read.");
  return {
    id: data.id,
    title: typeof data.title === "string" ? data.title : "Untitled prototype",
    screen: screen.data,
    createdAt: typeof data.createdAt === "string" ? data.createdAt : "",
  };
}

function TopBar({ onRemix, canRemix }: { onRemix?: () => void; canRemix: boolean }) {
  return (
    <header className="flex items-center justify-between gap-3 border-b border-line bg-surface px-4 py-2.5">
      <a href="/" className="text-sm font-medium text-ink no-underline">
        Made with {APP_NAME}
      </a>
      {onRemix && (
        <button
          type="button"
          onClick={onRemix}
          disabled={!canRemix}
          className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-surface transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          Remix
        </button>
      )}
    </header>
  );
}

function Message({ title, body }: { title: string; body: string }) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-4 py-16 text-center">
      <h1 className="text-2xl font-normal tracking-tight text-ink">{title}</h1>
      <p className="mt-2 max-w-md text-sm text-ink-2">{body}</p>
      <a href="/" className="mt-6 text-sm font-medium text-accent no-underline hover:underline">
        Open in {APP_NAME}
      </a>
    </main>
  );
}

/** Read-only view of a shared prototype (`/?p=<id>`). Preview only: no editing controls. */
export function SharedView({ id }: { id: string }) {
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: "loading" });
    fetchPrototype(id, controller.signal)
      .then((prototype) => {
        if (controller.signal.aborted) return;
        setState(prototype ? { status: "ready", prototype } : { status: "not-found" });
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setState({
          status: "error",
          message: err instanceof Error ? err.message : "Could not load this prototype.",
        });
      });
    return () => controller.abort();
  }, [id]);

  useEffect(() => {
    document.title = state.status === "ready" ? sharedDocumentTitle(state.prototype.title) : APP_NAME;
    return () => {
      document.title = APP_NAME;
    };
  }, [state]);

  if (state.status === "loading") {
    return (
      <div className="flex min-h-screen flex-col bg-shell">
        <TopBar canRemix={false} />
        <main className="flex flex-1 items-center justify-center p-4" aria-busy="true" aria-live="polite">
          <div className="shimmer aspect-video w-full max-w-5xl rounded-xl bg-surface" />
        </main>
      </div>
    );
  }

  if (state.status === "not-found") {
    return (
      <div className="flex min-h-screen flex-col bg-shell">
        <TopBar canRemix={false} />
        <Message title="Prototype not found" body="This link may be wrong, or the prototype was removed." />
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="flex min-h-screen flex-col bg-shell">
        <TopBar canRemix={false} />
        <Message title="Something went wrong" body={state.message} />
      </div>
    );
  }

  const { prototype } = state;
  return (
    <div className="flex min-h-screen flex-col bg-shell">
      <TopBar onRemix={() => remixScreen(prototype.screen)} canRemix />
      <main className="flex flex-1 flex-col" aria-label={prototype.title}>
        <ScreenRenderer screen={prototype.screen} editable={false} />
      </main>
    </div>
  );
}
