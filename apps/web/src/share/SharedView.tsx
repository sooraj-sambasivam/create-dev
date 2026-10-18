import { useEffect, useState, type ReactNode } from "react";
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
  // A malformed id is treated as not found, the same as an unknown one.
  if (res.status === 404 || res.status === 400) return null;
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

/** Same frame as the main window: grey shell, white card inset 8px on every side, no divider. */
function Page({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen bg-shell text-ink">
      <div className="my-2 mx-2 flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl bg-surface">{children}</div>
    </div>
  );
}

function TopBar({ onRemix, canRemix }: { onRemix?: () => void; canRemix: boolean }) {
  return (
    <header className="flex h-10 shrink-0 items-center justify-between gap-3 px-4">
      <a href="/" className="text-sm font-medium text-ink no-underline">
        Made with {APP_NAME}
      </a>
      {onRemix && (
        <button
          type="button"
          onClick={onRemix}
          disabled={!canRemix}
          className="inline-flex h-8 items-center rounded-lg bg-accent px-3 text-sm font-medium text-white transition-opacity duration-150 hover:opacity-90 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
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
      <a
        href="/"
        className="mt-6 inline-flex h-8 items-center rounded-lg border border-line px-3 text-sm font-medium text-ink no-underline transition-colors hover:bg-tray"
      >
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
      <Page>
        <TopBar canRemix={false} />
        <main className="flex flex-1 items-center justify-center p-4" aria-busy="true" aria-live="polite">
          <div className="shimmer aspect-video w-full max-w-5xl rounded-xl bg-tray" />
        </main>
      </Page>
    );
  }

  if (state.status === "not-found") {
    return (
      <Page>
        <TopBar canRemix={false} />
        <Message title="Prototype not found" body="This link may be wrong, or the prototype was removed." />
      </Page>
    );
  }

  if (state.status === "error") {
    return (
      <Page>
        <TopBar canRemix={false} />
        <Message title="Something went wrong" body={state.message} />
      </Page>
    );
  }

  const { prototype } = state;
  return (
    <Page>
      <TopBar onRemix={() => remixScreen(prototype.screen)} canRemix />
      <main className="flex flex-1 flex-col" aria-label={prototype.title}>
        <div className="flex flex-1 flex-col">
          <ScreenRenderer screen={prototype.screen} editable={false} />
        </div>
      </main>
    </Page>
  );
}
