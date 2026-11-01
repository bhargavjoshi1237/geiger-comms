"use client";

// Tickets (spec §9) — the caller's tickets and a read-only detail; the Inbox spec owns authoring and state changes.
// Rows reuse the conversation-row shell so the space sits in the same visual family as Messages.

import { useCallback, useEffect, useState } from "react";
import { ErrorState, HeaderBar, LoadingState, PageHead, StatusPill } from "./widget_primitives";
import { MarkdownView } from "./markdown_view";

// Ticket states map onto the three pills the design draws.
const PILL = {
  submitted: "waiting",
  in_progress: "open",
  waiting: "waiting",
  resolved: "closed",
};

const STATE_LABEL = {
  submitted: "Submitted",
  in_progress: "In progress",
  waiting: "Waiting on you",
  resolved: "Resolved",
};

function formatDate(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString([], { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

export function TicketsSpace({ getApi, route, navigate, postToHost, sessionKey, syncTick }) {
  const [rows, setRows] = useState(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(() => {
    getApi()
      ?.tickets()
      .then((result) => {
        setRows(Array.isArray(result) ? result : []);
        setFailed(false);
      })
      .catch(() => setFailed(true));
  }, [getApi]);

  useEffect(() => {
    load();
  }, [load, sessionKey, syncTick]);

  const close = () => postToHost?.("close");

  const retry = () => {
    setFailed(false);
    setRows(null);
    load();
  };

  if (route.ticketId) {
    const ticket = rows?.find((t) => t.id === route.ticketId) ?? null;
    return (
      <>
        <HeaderBar onBack={() => navigate({ space: "tickets" })} backLabel="Back to tickets" onClose={close}>
          <span className="gc-bar__crumb">Tickets</span>
        </HeaderBar>
        <div className="gc-panel__body gc-panel__body--stack">
          {rows === null && !failed ? (
            <LoadingState label="Loading ticket…" />
          ) : failed ? (
            <ErrorState title="Couldn't load this ticket" onRetry={retry} />
          ) : !ticket ? (
            <ErrorState
              title="Ticket not found"
              onRetry={() => navigate({ space: "tickets" })}
              retryLabel="Back to tickets"
            />
          ) : (
            <TicketDetail ticket={ticket} navigate={navigate} />
          )}
        </div>
      </>
    );
  }

  return (
    <>
      <PageHead title="Tickets" onClose={close} />

      <div className="gc-panel__body gc-panel__body--stack">
        {rows === null && !failed ? (
          <LoadingState label="Loading tickets…" />
        ) : failed ? (
          <ErrorState title="Couldn't load your tickets" onRetry={retry} />
        ) : rows.length === 0 ? (
          <div className="gc-state">
            <p className="gc-state__title">No tickets yet</p>
            <p className="gc-state__hint">Requests your team tracks for you will appear here.</p>
          </div>
        ) : (
          <div className="gc-list gc-list--top">
            {rows.map((t) => (
              <button
                key={t.id}
                type="button"
                className="gc-convo"
                data-closed={t.state === "resolved"}
                onClick={() => navigate({ space: "tickets", ticketId: t.id })}
              >
                <span className="gc-convo__body">
                  <span className="gc-convo__top">
                    <span className="gc-convo__title">{t.title || "Ticket"}</span>
                    <span className="gc-convo__time">{t.reference ? `#${t.reference}` : formatDate(t.createdAt)}</span>
                  </span>
                  {t.description ? <span className="gc-convo__preview">{t.description}</span> : null}
                  <span className="gc-convo__tags">
                    <StatusPill status={PILL[t.state] || "open"} />
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function TicketDetail({ ticket, navigate }) {
  return (
    <article className="gc-article">
      <h1 className="gc-article__title">{ticket.title || "Ticket"}</h1>
      <div className="gc-byline">
        <StatusPill status={PILL[ticket.state] || "open"} />
        <span className="gc-byline__date">
          {STATE_LABEL[ticket.state] || "Open"}
          {ticket.createdAt ? ` · Opened ${formatDate(ticket.createdAt)}` : ""}
        </span>
      </div>
      <hr className="gc-article__rule" />
      {ticket.description ? <MarkdownView text={ticket.description} className="gc-prose" /> : null}
      {ticket.conversationId ? (
        <button
          type="button"
          className="gc-btn gc-btn--outline gc-btn--block"
          onClick={() => navigate({ space: "messages", conversationId: ticket.conversationId })}
        >
          Open the conversation
        </button>
      ) : null}
    </article>
  );
}
