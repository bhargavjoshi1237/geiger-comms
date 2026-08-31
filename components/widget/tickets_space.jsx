"use client";

// Tickets — the caller's tickets, read-only (the Inbox spec owns authoring and
// state transitions). Rows reuse the conversation-row shell so the space sits
// in the same visual family as Messages.

import { useCallback, useEffect, useState } from "react";
import { ErrorState, LoadingState, StatusPill } from "./widget_primitives";
import { MarkdownView } from "./markdown_view";

// Ticket states map onto the three pills the design draws.
const PILL = {
  submitted: "waiting",
  in_progress: "open",
  waiting: "waiting",
  resolved: "closed",
};

export function TicketsSpace({ getApi }) {
  const [rows, setRows] = useState(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(() => {
    getApi()
      ?.tickets()
      .then((result) => {
        setRows(result ?? []);
        setFailed(false);
      })
      .catch(() => setFailed(true));
  }, [getApi]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <>
      <header className="gc-listhead">
        <span className="gc-listhead__title">Your tickets</span>
      </header>

      <div className="gc-panel__body gc-panel__body--stack">
        {rows === null && !failed ? (
          <LoadingState label="Loading tickets…" />
        ) : failed ? (
          <ErrorState title="Couldn't load your tickets" onRetry={load} />
        ) : rows.length === 0 ? (
          <div className="gc-state">
            <p className="gc-state__title">No tickets yet</p>
            <p className="gc-state__hint">Requests your team tracks for you will appear here.</p>
          </div>
        ) : (
          rows.map((t) => (
            <div key={t.id} className="gc-convo" data-closed={t.state === "resolved"}>
              <div className="gc-convo__body">
                <div className="gc-convo__top">
                  <span className="gc-convo__title">{t.title || "Ticket"}</span>
                  <span className="gc-convo__time">{t.reference ? `#${t.reference}` : ""}</span>
                </div>
                {t.description ? (
                  <div className="gc-convo__preview">
                    <MarkdownView text={t.description} />
                  </div>
                ) : null}
                <div className="gc-convo__meta">
                  <StatusPill status={PILL[t.state] || "open"} />
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </>
  );
}
