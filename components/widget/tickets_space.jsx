"use client";

// Tickets space (§9): the caller's tickets, read-only (Inbox spec owns
// authoring and state transitions).

import { useEffect, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  LoadingState,
  EmptyState,
  ErrorState,
} from "./widget_primitives";
import { MarkdownView } from "./markdown_view";

const STATE_LABELS = {
  submitted: "Submitted",
  in_progress: "In progress",
  waiting: "Waiting",
  resolved: "Resolved",
};

export function TicketsSpace({ getApi, navigate }) {
  // status: loading | done | failed — set only from async callbacks so the
  // mount effect never calls setState synchronously.
  const [state, setState] = useState({ status: "loading", rows: [] });

  useEffect(() => {
    let active = true;
    getApi()
      .tickets()
      .then((rows) => {
        if (active) setState({ status: rows ? "done" : "failed", rows: rows ?? [] });
      })
      .catch(() => {
        if (active) setState({ status: "failed", rows: [] });
      });
    return () => {
      active = false;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function retry() {
    setState((prev) => ({ ...prev, status: "loading" }));
    getApi()
      ?.tickets()
      .then((rows) => setState({ status: rows ? "done" : "failed", rows: rows ?? [] }))
      .catch(() => setState({ status: "failed", rows: [] }));
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
        <h1 className="text-sm font-semibold">Your tickets</h1>
      </header>
      <main className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {state.status === "loading" ? (
          <LoadingState label="Loading tickets…" />
        ) : state.status === "failed" ? (
          <ErrorState title="Couldn't load your tickets" onRetry={retry} />
        ) : state.rows.length === 0 ? (
          <EmptyState title="No tickets yet" hint="Requests your team tracks for you will appear here." />
        ) : (
          <ul className="flex flex-col gap-2">
            {state.rows.map((t) => (
              <li key={t.id} className="rounded-lg border border-border bg-surface-card p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium">{t.title || "Ticket"}</span>
                  <span className="shrink-0 rounded-full bg-surface-hover px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                    {STATE_LABELS[t.state] || t.state}
                  </span>
                </div>
                {t.description ? (
                  <div className="mt-1.5 line-clamp-3 text-xs text-muted-foreground">
                    <MarkdownView text={t.description} />
                  </div>
                ) : null}
                <div className="mt-2 flex items-center justify-end text-[11px] text-muted-foreground">
                  <button
                    type="button"
                    onClick={() => navigate({ space: "tickets", ticketId: t.id })}
                    className="flex items-center gap-1 hover:text-foreground"
                  >
                    View details <ChevronRight className="h-3 w-3" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
