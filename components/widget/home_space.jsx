"use client";

// Home — the messenger's landing screen as drawn: brand row, two-line greeting,
// the "Ask <assistant>" hero card, the most recent conversation and a help
// search box. The bottom nav belongs to the panel, not to this screen.
//
// Everything below the header comes from the data layer: the recent thread is
// the first row of /conversations, and the search box hands its query to the
// Help space rather than searching in place.

import { useCallback, useEffect, useState } from "react";
import {
  AiBadge,
  Avatar,
  Cap,
  ChevronRight,
  ErrorState,
  LoadingState,
  Search,
  Sparkles,
  X,
} from "./widget_primitives";

function relativeShort(iso) {
  if (!iso) return "";
  try {
    const diff = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    if (diff < 1) return "now";
    if (diff < 60) return `${diff}m`;
    if (diff < 60 * 24) return `${Math.round(diff / 60)}h`;
    const days = Math.round(diff / (60 * 24));
    if (days < 7) return `${days}d`;
    return new Date(iso).toLocaleDateString([], { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

// "Hi there. How can we help?" reads as two lines in the design — a bold
// salutation over a muted question.
function splitGreeting(greeting) {
  const text = String(greeting || "Hi there. How can we help?").trim();
  const at = text.indexOf(".");
  if (at > 0 && at < text.length - 1) {
    return [text.slice(0, at + 1), text.slice(at + 1).trim()];
  }
  return [text, ""];
}

export function HomeSpace({ getApi, config, navigate, postToHost }) {
  const [conversations, setConversations] = useState(null);
  const [failed, setFailed] = useState(false);

  const assistant = config?.assistantName || "Aria";
  const brand = config?.name || "Northwind Help";
  const [salutation, question] = splitGreeting(config?.greeting);

  const load = useCallback(() => {
    getApi()
      ?.conversations()
      .then((rows) => {
        setConversations(rows ?? []);
        setFailed(false);
      })
      .catch(() => {
        setFailed(true);
        setConversations([]);
      });
  }, [getApi]);

  useEffect(() => {
    load();
  }, [load]);

  const recent = conversations?.[0];

  return (
    <>
      <header className="gc-header gc-header--home">
        <div className="gc-header__row">
          <div className="gc-header__brand">
            <div className="gc-header__logo" aria-hidden="true">
              {(brand.match(/[A-Z]/g) || ["N"]).slice(0, 2).join("")}
            </div>
            <span className="gc-header__brandname">{brand}</span>
          </div>
          <button
            type="button"
            className="gc-iconbtn"
            onClick={() => postToHost?.("close")}
            aria-label="Close messenger"
          >
            <X />
          </button>
        </div>
        <div className="gc-header__greeting">
          <p>{salutation}</p>
          {question ? <p>{question}</p> : null}
        </div>
      </header>

      <div className="gc-home">
        <button type="button" className="gc-card" onClick={() => navigate({ space: "ask" })}>
          <div className="gc-card__icon" aria-hidden="true">
            <Sparkles size={15} />
          </div>
          <div className="gc-card__body">
            <div className="gc-card__titlerow">
              <span className="gc-card__title">Ask {assistant}</span>
              <AiBadge />
            </div>
            <p className="gc-card__desc">
              {config?.assistantTagline || "Answers about your order, return or account in seconds."}
            </p>
          </div>
          <ChevronRight className="gc-card__chev" />
        </button>

        {conversations === null ? (
          <LoadingState label="Checking for conversations…" />
        ) : failed ? (
          <ErrorState title="Couldn't load your conversations" onRetry={load} />
        ) : recent ? (
          <>
            <div className="gc-sectionrow">
              <Cap>Recent</Cap>
              <button type="button" className="gc-link" onClick={() => navigate({ space: "messages" })}>
                See all
              </button>
            </div>
            <button
              type="button"
              className="gc-recent"
              onClick={() => navigate({ space: "messages", conversationId: recent.id })}
            >
              <Avatar name={recent.agentName || recent.subject} showStatus online={recent.state !== "closed"} />
              <div className="gc-recent__body">
                <div className="gc-recent__top">
                  <span className="gc-recent__name">{recent.agentName || recent.subject || "Your conversation"}</span>
                  <span className="gc-recent__time">{relativeShort(recent.lastActivityAt || recent.updatedAt)}</span>
                </div>
                <p className="gc-recent__preview">{recent.preview || "Tap to open"}</p>
              </div>
            </button>
          </>
        ) : null}

        <form
          className="gc-search"
          onSubmit={(e) => {
            e.preventDefault();
            const input = e.currentTarget.elements.namedItem("q");
            navigate({ space: "help", query: input?.value || "" });
          }}
        >
          <Search className="gc-search__icon" />
          <input
            name="q"
            type="search"
            className="gc-search__input"
            placeholder="Search for help"
            aria-label="Search for help"
          />
        </form>
      </div>
    </>
  );
}
