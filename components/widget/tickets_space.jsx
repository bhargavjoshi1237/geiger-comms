"use client";

// Tickets (spec §9) — the caller's tickets and a read-only detail; the Inbox spec owns authoring and state changes.
// Rows reuse the conversation-row shell so the space sits in the same visual family as Messages.

import { useCallback, useEffect, useState } from "react";
import { ErrorState, HeaderBar, LoadingState, StatusPill } from "./widget_primitives";
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

export function TicketsSpace({ getApi, route, navigate, sessionKey, syncTick }) {
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

  const retry = () => {
    setFailed(false);
    setRows(null);
    load();
  };

  if (route.ticketId) {
    const ticket = rows?.find((t) => t.id === route.ticketId) ?? null;
    return (
      <>
        <HeaderBar onBack={() => navigate({ space: "tickets" })}>
          <span className="gc-header__eyebrow">TICKET</span>
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
      <header className="gc-listhead">
        <span className="gc-listhead__title">Your tickets</span>
      </header>

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
          rows.map((t) => (
            <button
              key={t.id}
              type="button"
              className="gc-convo"
              data-closed={t.state === "resolved"}
              onClick={() => navigate({ space: "tickets", ticketId: t.id })}
            >
              <div className="gc-convo__body">
                <div className="gc-convo__top">
                  <span className="gc-convo__title">{t.title || "Ticket"}</span>
                  <span className="gc-convo__time">{t.reference ? `#${t.reference}` : formatDate(t.createdAt)}</span>
                </div>
                {t.description ? <p className="gc-convo__preview">{t.description}</p> : null}
                <div className="gc-convo__meta">
                  <StatusPill status={PILL[t.state] || "open"} />
                </div>
              </div>
            </button>
          ))
        )}
      </div>
    </>
  );
}

function TicketDetail({ ticket, navigate }) {
  return (
    <article className="gc-article">
      <h2>{ticket.title || "Ticket"}</h2>
      <div className="gc-article__byline">
        <span>
          {(STATE_LABEL[ticket.state] || "Open").toUpperCase()}
          {ticket.createdAt ? ` · OPENED ${formatDate(ticket.createdAt).toUpperCase()}` : ""}
        </span>
      </div>
      <div className="gc-article__divider" />
      {ticket.description ? (
        <div className="gc-article__p">
          <MarkdownView text={ticket.description} />
        </div>
      ) : null}
      {ticket.conversationId ? (
        <button
          type="button"
          className="gc-outlinebtn"
          onClick={() => navigate({ space: "messages", conversationId: ticket.conversationId })}
        >
          Open the conversation
        </button>
      ) : null}
    </article>
  );
}
