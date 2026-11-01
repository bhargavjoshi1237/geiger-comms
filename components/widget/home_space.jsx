"use client";

// Home (spec §9): greeting, "Send us a message", the most recent conversation and a help search box.
// Brand, greeting, team and assistant all come from the server config; the conversation list comes from the app root.

import {
  AiBadge,
  ArrowRight,
  Avatar,
  AvatarStack,
  BrandLogo,
  Cap,
  ChevronRight,
  CloseButton,
  ErrorState,
  LoadingState,
  Presence,
  Search,
  Sparkles,
  UnreadCount,
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

// "Hi there. How can we help?" splits into a bright salutation over a muted question, after the first sentence or emoji.
function splitGreeting(greeting) {
  const text = String(greeting || "").trim();
  const m = /[.!?\p{Extended_Pictographic}](?=\s+\S)/u.exec(text);
  if (!m) return [text, ""];
  const end = m.index + m[0].length;
  return [text.slice(0, end), text.slice(end).trim()];
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
  const team = config?.team ?? [];
  const teamKnown = typeof config?.teamOnline === "boolean";
  const [salutation, question] = splitGreeting(config?.greeting);
  const recent = conversations?.[0];
  const recentUnread = recent ? unreadMap?.[recent.id] || 0 : 0;
  const recentName = recent ? recent.agentName || recent.subject || "Your conversation" : "";
  const helpAvailable = config?.spaces?.help !== false && content?.help === true;

  return (
    <>
      <header className="gc-hero">
        <div className="gc-hero__bar">
          <BrandLogo name={brand} logoUrl={config?.logoUrl} />
          <span className="gc-hero__brand">{brand}</span>
          <CloseButton onClose={() => postToHost?.("close")} />
        </div>
        <h1 className="gc-hero__title">
          <span>{salutation}</span>
          {question ? <span>{question}</span> : null}
        </h1>
      </header>

      <div className="gc-home">
        <button type="button" className="gc-ticket" onClick={() => navigate({ space: "messages", compose: true })}>
          <span className="gc-ticket__main">
            <span className="gc-ticket__text">
              <span className="gc-ticket__title">Send us a message</span>
              <span className="gc-ticket__desc">
                {config?.officeHoursNote || "We'll reply here as soon as we can."}
              </span>
            </span>
            <span className="gc-ticket__go" aria-hidden="true">
              <ArrowRight />
            </span>
          </span>
          {team.length || teamKnown ? (
            <>
              <span className="gc-ticket__perf" aria-hidden="true" />
              <span className="gc-ticket__foot">
                {team.length ? <AvatarStack people={team} /> : null}
                {teamKnown ? (
                  <Presence team={team} online={config.teamOnline} backAt={config?.backAt} />
                ) : (
                  <span className="gc-presence">A teammate will reply in this conversation.</span>
                )}
              </span>
            </>
          ) : null}
        </button>

        {assistant ? (
          <button type="button" className="gc-linkcard" onClick={() => navigate({ space: "ask" })}>
            <span className="gc-linkcard__tile" aria-hidden="true">
              <Sparkles size={16} />
            </span>
            <span className="gc-linkcard__text">
              <span className="gc-linkcard__title">
                Ask {assistant}
                <AiBadge />
              </span>
              <span className="gc-linkcard__sub">
                {config?.assistantTagline || "Get an instant answer from our AI assistant."}
              </span>
            </span>
            <ChevronRight className="gc-linkcard__chev" />
          </button>
        ) : null}

        {conversations === null && !conversationsFailed ? (
          <LoadingState label="Checking for conversations…" />
        ) : conversationsFailed ? (
          <ErrorState title="Couldn't load your conversations" onRetry={reloadConversations} />
        ) : recent ? (
          <section className="gc-section">
            <div className="gc-section__head">
              <Cap>Recent</Cap>
              <button type="button" className="gc-link" onClick={() => navigate({ space: "messages" })}>
                See all
              </button>
            </div>
            <button
              type="button"
              className="gc-recent"
              data-unread={recentUnread > 0}
              onClick={() => navigate({ space: "messages", conversationId: recent.id })}
            >
              <Avatar
                name={recent.agentName || recent.subject || brand}
                size="lg"
                showStatus={Boolean(recent.agentName) && recent.state !== "closed"}
                online={config?.teamOnline === true}
              />
              <span className="gc-recent__body">
                <span className="gc-recent__top">
                  <span className="gc-recent__name">{recentName}</span>
                  <span className="gc-recent__time">{relativeShort(recent.lastActivityAt || recent.updatedAt)}</span>
                </span>
                <span className="gc-recent__bottom">
                  <span className="gc-recent__preview">{recent.preview || "Tap to open"}</span>
                  {recentUnread ? <UnreadCount count={recentUnread} /> : null}
                </span>
              </span>
            </button>
          </section>
        ) : null}

        {helpAvailable ? (
          <form
            role="search"
            onSubmit={(e) => {
              e.preventDefault();
              const input = e.currentTarget.elements.namedItem("q");
              navigate({ space: "help", query: input?.value || "" });
            }}
          >
            <label className="gc-search">
              <Search />
              <span className="gc-sr">Search for help</span>
              <input name="q" type="search" className="gc-search__input" placeholder="Search for help" />
            </label>
          </form>
        ) : null}
      </div>
    </>
  );
}
