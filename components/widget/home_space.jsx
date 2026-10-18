"use client";

// Home (spec §9): greeting, "Send us a message", the most recent conversation and a help search box.
// Brand, greeting and assistant all come from the server config; the conversation list comes from the app root.

import {
  AiBadge,
  Avatar,
  BrandLogo,
  Cap,
  ChevronRight,
  ErrorState,
  LoadingState,
  MessageCircle,
  Search,
  Sparkles,
  UnreadCount,
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

// "Hi there. How can we help?" reads as two lines in the design — a bold salutation over a muted question.
function splitGreeting(greeting) {
  const text = String(greeting || "").trim();
  const at = text.indexOf(".");
  if (at > 0 && at < text.length - 1) {
    return [text.slice(0, at + 1), text.slice(at + 1).trim()];
  }
  return [text, ""];
}

export function HomeSpace({
  config,
  navigate,
  postToHost,
  content,
  conversations,
  conversationsFailed,
  reloadConversations,
  unreadMap,
}) {
  const assistant = config?.assistantName || "";
  const brand = config?.name || "Support";
  const [salutation, question] = splitGreeting(config?.greeting);
  const recent = conversations?.[0];
  const recentUnread = recent ? unreadMap?.[recent.id] || 0 : 0;
  const helpAvailable = config?.spaces?.help !== false && content?.help === true;

  return (
    <>
      <header className="gc-header gc-header--home">
        <div className="gc-header__row">
          <div className="gc-header__brand">
            <BrandLogo name={brand} logoUrl={config?.logoUrl} />
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
        <button type="button" className="gc-card" onClick={() => navigate({ space: "messages", compose: true })}>
          <div className="gc-card__icon" aria-hidden="true">
            <MessageCircle size={15} />
          </div>
          <div className="gc-card__body">
            <div className="gc-card__titlerow">
              <span className="gc-card__title">Send us a message</span>
            </div>
            <p className="gc-card__desc">{config?.officeHoursNote || "We'll reply here as soon as we can."}</p>
          </div>
          <ChevronRight className="gc-card__chev" />
        </button>

        {assistant ? (
          <button type="button" className="gc-card" onClick={() => navigate({ space: "ask" })}>
            <div className="gc-card__icon" aria-hidden="true">
              <Sparkles size={15} />
            </div>
            <div className="gc-card__body">
              <div className="gc-card__titlerow">
                <span className="gc-card__title">Ask {assistant}</span>
                <AiBadge />
              </div>
              <p className="gc-card__desc">{config?.assistantTagline || "Get an instant answer from our AI assistant."}</p>
            </div>
            <ChevronRight className="gc-card__chev" />
          </button>
        ) : null}

        {conversations === null && !conversationsFailed ? (
          <LoadingState label="Checking for conversations…" />
        ) : conversationsFailed ? (
          <ErrorState title="Couldn't load your conversations" onRetry={reloadConversations} />
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
              <Avatar name={recent.agentName || recent.subject || brand} />
              <div className="gc-recent__body">
                <div className="gc-recent__top">
                  <span className="gc-recent__name">{recent.agentName || recent.subject || "Your conversation"}</span>
                  <span className="gc-recent__time">{relativeShort(recent.lastActivityAt || recent.updatedAt)}</span>
                </div>
                <p className="gc-recent__preview">{recent.preview || "Tap to open"}</p>
              </div>
              {recentUnread ? <UnreadCount count={recentUnread} /> : null}
            </button>
          </>
        ) : null}

        {helpAvailable ? (
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
        ) : null}
      </div>
    </>
  );
}
