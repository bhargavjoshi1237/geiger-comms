"use client";

// News space (§9): published posts (comms.posts) with a simple reader.
// Fetch results are stored as { key, rows } so a change of reader target
// re-renders as loading without synchronous resets inside effects.

import { useEffect, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  LoadingState,
  EmptyState,
  ErrorState,
} from "./widget_primitives";
import { MarkdownView } from "./markdown_view";

function formatDate(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString([], { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

export function NewsSpace({ getApi, route, navigate }) {
  const [result, setResult] = useState(null); // { key: "list", rows }
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    getApi()
      .news()
      .then((rows) => {
        if (active) setResult({ key: "list", rows: rows ?? [] });
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (route.postId) {
    return <PostReader postId={route.postId} getApi={getApi} onBack={() => navigate({ space: "news" })} />;
  }

  const loading = !failed && !result;

  function retry() {
    setFailed(false);
    getApi()
      ?.news()
      .then((rows) => setResult({ key: "list", rows: rows ?? [] }))
      .catch(() => setFailed(true));
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center gap-2 border-b border-border px-4 py-3">
        <button
          type="button"
          aria-label="Back"
          onClick={() => navigate({ space: "home" })}
          className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground hover:bg-surface-hover"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <h1 className="text-sm font-semibold">News</h1>
      </header>
      <main className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {loading ? (
          <LoadingState label="Loading news…" />
        ) : failed ? (
          <ErrorState title="Couldn't load news" onRetry={retry} />
        ) : result.rows.length === 0 ? (
          <EmptyState title="No updates yet" />
        ) : (
          <ul className="flex flex-col">
            {result.rows.map((p) => (
              <li key={p.id} className="border-b border-border">
                <button
                  type="button"
                  onClick={() => navigate({ space: "news", postId: p.id })}
                  className="flex w-full items-start gap-3 px-1 py-3 text-left hover:bg-surface-hover"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{p.title}</span>
                    <span className="text-[11px] text-muted-foreground">{formatDate(p.publishedAt)}</span>
                    {p.summary ? (
                      <span className="mt-1 block line-clamp-2 text-[12px] text-muted-foreground">{p.summary}</span>
                    ) : null}
                  </span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}

function PostReader({ postId, getApi, onBack }) {
  const [state, setState] = useState({ status: "loading", post: null });

  useEffect(() => {
    let active = true;
    // The list payload already carries the body; find it client-side — there
    // is no separate single-post endpoint.
    getApi()
      .news()
      .then((rows) => {
        if (!active) return;
        const row = (rows ?? []).find((p) => p.id === postId);
        setState(row ? { status: "done", post: row } : { status: "failed", post: null });
      })
      .catch(() => active && setState({ status: "failed", post: null }));
    return () => {
      active = false;
    };
  }, [postId]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center gap-2 border-b border-border px-4 py-3">
        <button
          type="button"
          aria-label="Back"
          onClick={onBack}
          className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground hover:bg-surface-hover"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <h1 className="text-sm font-semibold">Update</h1>
      </header>
      <main className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {state.status === "loading" ? (
          <LoadingState label="Loading…" />
        ) : state.status === "failed" ? (
          <ErrorState title="Post not found" onRetry={onBack} />
        ) : (
          <article>
            <h1 className="text-lg font-semibold">{state.post.title}</h1>
            <p className="mt-1 text-xs text-muted-foreground">{formatDate(state.post.publishedAt)}</p>
            <div className="mt-3 text-sm leading-relaxed text-foreground/90">
              <MarkdownView text={state.post.body} />
            </div>
          </article>
        )}
      </main>
    </div>
  );
}
