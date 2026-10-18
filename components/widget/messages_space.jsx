"use client";

// Messages — conversation list → thread → composer (spec §9). The list and unread counts come from the app root, which owns realtime;
// the open thread re-fetches on every body-less realtime notification and resume tick (§6). Rendering stays text-only via MarkdownView.

import { useEffect, useRef, useState } from "react";
import {
  AiBadge,
  Avatar,
  AvatarStack,
  Banner,
  CheckCheck,
  ErrorState,
  HeaderBar,
  LoadingState,
  Plus,
  safeHref,
  Sparkles,
  StatusPill,
  UnreadCount,
  User,
} from "./widget_primitives";
import { Composer } from "./composer";
import { stripMetadata } from "./image";
import { MarkdownView } from "./markdown_view";
import { NewConversationView } from "./new_conversation";
import { RatingCard } from "./rating";

const PAGE_SIZE = 50; // the API's thread page size

function formatTime(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

function relativeShort(iso) {
  if (!iso) return "";
  try {
    const diff = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    if (diff < 1) return "now";
    if (diff < 60) return `${diff}m`;
    if (diff < 60 * 24) return `${Math.round(diff / 60)}h`;
    return `${Math.round(diff / (60 * 24))}d`;
  } catch {
    return "";
  }
}

// The API's author roles collapse into the three the design draws.
function authorKind(role) {
  if (role === "customer" || role === "visitor" || role === "user") return "visitor";
  if (role === "ai_agent" || role === "ai" || role === "bot") return "ai";
  if (role === "system" || role === "note") return "system";
  return "agent";
}

const isOptimistic = (m) => typeof m?.id === "string" && m.id.startsWith("optimistic-");

function timeOf(m) {
  const t = Date.parse(m?.createdAt || "");
  return Number.isNaN(t) ? 0 : t;
}

// Server rows win by id, earlier pages already loaded are kept, unconfirmed optimistic sends stay at the end.
function mergeMessages(current, incoming) {
  const byId = new Map();
  for (const m of current) if (m?.id && !isOptimistic(m)) byId.set(m.id, m);
  for (const m of incoming || []) if (m?.id) byId.set(m.id, m);
  const confirmed = [...byId.values()].sort((a, b) => timeOf(a) - timeOf(b));
  return [...confirmed, ...current.filter(isOptimistic)];
}

// The API's keyset cursor only accepts a Z-suffixed ISO timestamp.
function cursorOf(iso) {
  const t = Date.parse(iso || "");
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

function optimisticId() {
  return `optimistic-${globalThis.crypto?.randomUUID?.() ?? Date.now()}`;
}

export function MessagesSpace({
  getApi,
  config,
  route,
  navigate,
  conversations,
  conversationsFailed,
  reloadConversations,
  unreadMap,
  threadTicks,
  syncTick,
  sessionKey,
  onSeen,
  visible = true,
}) {
  if (route.compose || route.newAbout) {
    return (
      <NewConversationView
        getApi={getApi}
        config={config}
        initialKind={route.newAbout}
        initialDraft={route.draft}
        onBack={() => navigate({ space: "messages" })}
        onSent={(conversation) => {
          reloadConversations?.();
          navigate({ space: "messages", conversationId: conversation.id });
        }}
      />
    );
  }

  if (route.conversationId) {
    return (
      <ThreadScreen
        key={route.conversationId}
        conversationId={route.conversationId}
        conversation={conversations?.find((c) => c.id === route.conversationId) ?? null}
        initialBody={route.draft || ""}
        getApi={getApi}
        config={config}
        liveTick={threadTicks?.[route.conversationId] || 0}
        syncTick={syncTick}
        sessionKey={sessionKey}
        visible={visible}
        onBack={() => navigate({ space: "messages" })}
        onSeen={onSeen}
        onConversationsChanged={reloadConversations}
      />
    );
  }

  return (
    <ConversationsList
      conversations={conversations}
      failed={conversationsFailed}
      unreadMap={unreadMap}
      config={config}
      load={reloadConversations}
      open={(c) => navigate({ space: "messages", conversationId: c.id })}
      onNew={() => navigate({ space: "messages", compose: true })}
    />
  );
}

function ConversationsList({ conversations, failed, unreadMap, config, load, open, onNew }) {
  const [filter, setFilter] = useState("open");

  const rows = conversations ?? [];
  const openRows = rows.filter((c) => c.state !== "closed");
  const closedRows = rows.filter((c) => c.state === "closed");
  const shown = filter === "open" ? openRows : closedRows;
  const team = config?.team ?? [];
  const assistant = config?.assistantName || "";
  const teamKnown = typeof config?.teamOnline === "boolean";

  return (
    <>
      <header className="gc-listhead">
        <span className="gc-listhead__title">Your conversations</span>
        <button type="button" className="gc-primarybtn" onClick={onNew}>
          <Plus />
          New
        </button>
      </header>

      <div className="gc-panel__body gc-panel__body--stack">
        <div className="gc-filters" role="tablist" aria-label="Filter conversations">
          <button
            type="button"
            role="tab"
            className="gc-filter"
            aria-selected={filter === "open"}
            onClick={() => setFilter("open")}
          >
            Open · {openRows.length}
          </button>
          <button
            type="button"
            role="tab"
            className="gc-filter"
            aria-selected={filter === "closed"}
            onClick={() => setFilter("closed")}
          >
            Closed · {closedRows.length}
          </button>
        </div>

        {conversations === null && !failed ? (
          <LoadingState label="Loading conversations…" />
        ) : failed ? (
          <ErrorState title="Couldn't load your messages" onRetry={load} />
        ) : (
          <>
            {shown.map((c, i) => {
              const unread = unreadMap?.[c.id] || 0;
              return (
                <button
                  key={c.id}
                  type="button"
                  className="gc-convo"
                  data-active={i === 0 && filter === "open"}
                  data-closed={c.state === "closed"}
                  onClick={() => open(c)}
                >
                  {c.aiOnly ? (
                    <div className="gc-avatar gc-avatar--lg" aria-hidden="true">
                      <Sparkles size={14} />
                    </div>
                  ) : (
                    <Avatar name={c.agentName || c.subject || config?.name} size="lg" />
                  )}
                  <div className="gc-convo__body">
                    <div className="gc-convo__top">
                      <span className="gc-convo__title">{c.subject || "Your conversation"}</span>
                      <span className="gc-convo__time">{relativeShort(c.lastActivityAt || c.updatedAt)}</span>
                    </div>
                    <p className={unread ? "gc-convo__preview gc-convo__preview--unread" : "gc-convo__preview"}>
                      {c.previewAuthor ? <strong>{c.previewAuthor}:</strong> : null} {c.preview || "—"}
                    </p>
                    <div className="gc-convo__meta">
                      <StatusPill status={c.state === "closed" ? "closed" : "open"} />
                      {unread ? <UnreadCount count={unread} /> : null}
                    </div>
                  </div>
                </button>
              );
            })}

            {shown.length === 0 ? (
              <div className="gc-state">
                <p className="gc-state__title">
                  {filter === "open" ? "No open conversations" : "No closed conversations"}
                </p>
                {filter === "open" ? <p className="gc-state__hint">Tap New to start one.</p> : null}
              </div>
            ) : null}

            {teamKnown ? (
              <div className="gc-listfoot">
                <div className="gc-teamcard">
                  {team.length ? <AvatarStack people={team} /> : null}
                  <span>
                    {config.teamOnline
                      ? "The team is online"
                      : `The team is away${assistant ? ` — ${assistant} can still help` : ""}`}
                  </span>
                </div>
              </div>
            ) : null}
          </>
        )}
      </div>
    </>
  );
}

function ThreadScreen({
  conversationId,
  conversation,
  initialBody,
  getApi,
  config,
  liveTick,
  syncTick,
  sessionKey,
  visible,
  onBack,
  onSeen,
  onConversationsChanged,
}) {
  const [state, setState] = useState({ status: "loading", messages: [], hasOlder: false });
  const [reloadKey, setReloadKey] = useState(0);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [draft, setDraft] = useState(initialBody);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [sendError, setSendError] = useState("");
  const [rating, setRating] = useState(null);
  const threadRef = useRef(null);

  // Latest page on open, on every realtime notification for this thread, on resume and after a re-boot.
  useEffect(() => {
    const api = getApi();
    if (!api) return undefined;
    let active = true;
    api
      .messages(conversationId)
      .then((rows) => {
        if (!active) return;
        const page = Array.isArray(rows) ? rows : [];
        setState((s) => ({
          status: "done",
          messages: mergeMessages(s.messages, page),
          hasOlder: s.status === "done" ? s.hasOlder : page.length >= PAGE_SIZE,
        }));
      })
      .catch(() => {
        if (active) setState((s) => (s.status === "done" ? s : { ...s, status: "failed" }));
      });
    return () => {
      active = false;
    };
  }, [conversationId, getApi, liveTick, syncTick, sessionKey, reloadKey]);

  const loaded = state.status === "done";
  const newestId = state.messages.length ? state.messages[state.messages.length - 1].id : null;

  // On screen means read: clear the unread count and mark it server-side whenever something new lands.
  useEffect(() => {
    if (visible && loaded) onSeen?.(conversationId);
  }, [visible, loaded, newestId, conversationId, onSeen]);

  // Keep the newest message in view as the thread grows (not when an earlier page is prepended).
  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [newestId, rating]);

  async function loadOlder() {
    const api = getApi();
    const cursor = cursorOf(state.messages.find((m) => !isOptimistic(m))?.createdAt);
    if (!api || !cursor || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const rows = await api.messages(conversationId, cursor);
      const page = Array.isArray(rows) ? rows : [];
      setState((s) => ({ ...s, messages: mergeMessages(s.messages, page), hasOlder: page.length >= PAGE_SIZE }));
    } catch {
      // The button stays so the visitor can try again.
    } finally {
      setLoadingOlder(false);
    }
  }

  async function send(text, { attachments = [], fromComposer = true } = {}) {
    const trimmed = (text ?? "").trim();
    const api = getApi();
    if (!trimmed || sending || !api) return;
    setSending(true);
    setSendError("");
    const optimistic = {
      id: optimisticId(),
      authorRole: "customer",
      authorName: "",
      body: trimmed,
      attachments,
      createdAt: new Date().toISOString(),
    };
    setState((s) => ({ ...s, messages: [...s.messages, optimistic] }));
    if (fromComposer) setDraft("");
    try {
      const res = await api.sendMessage(conversationId, trimmed, attachments);
      const saved = res?.message?.id ? res.message : res?.id ? res : null;
      setState((s) => ({
        ...s,
        messages: mergeMessages(
          s.messages.filter((m) => m.id !== optimistic.id),
          saved ? [saved] : [],
        ),
      }));
      if (!saved) setReloadKey((n) => n + 1);
      onConversationsChanged?.();
    } catch {
      setState((s) => ({ ...s, messages: s.messages.filter((m) => m.id !== optimistic.id) }));
      if (fromComposer) setDraft(trimmed);
      setSendError("Message not sent. Check your connection and try again.");
    } finally {
      setSending(false);
    }
  }

  async function upload(file) {
    const api = getApi();
    if (!file || uploading || !api) return;
    setUploading(true);
    setSendError("");
    try {
      const result = await api.upload(await stripMetadata(file));
      const url = safeHref(result?.url);
      if (!url) throw new Error("upload_failed");
      // The send route accepts back exactly what /upload returned for this session.
      const name = result?.name || file.name || "Attachment";
      const attachment = { url, name, size: result?.size ?? file.size, contentType: result?.contentType ?? file.type };
      await send(name, { attachments: [attachment], fromComposer: false });
    } catch {
      setSendError("Couldn't upload that file. Images and PDFs up to 10 MB work.");
    } finally {
      setUploading(false);
    }
  }

  const assistant = config?.assistantName || "";
  const closed = conversation?.state === "closed";
  const handedOver = conversation?.state === "human" || Boolean(conversation?.handedOverAt);
  const aiThread = Boolean(assistant) && !handedOver && Boolean(conversation?.aiOnly);
  const lastAgent = [...state.messages].reverse().find((m) => authorKind(m.authorRole) === "agent");
  const person = {
    name: aiThread ? assistant : conversation?.agentName || lastAgent?.authorName || config?.name || "Support",
    role: closed ? "Closed" : aiThread ? "AI assistant" : config?.officeHoursNote || "The team will reply here",
  };

  return (
    <>
      {closed ? (
        <header className="gc-header gc-header--bar">
          <Avatar name={person.name} size="sm" />
          <span className="gc-header__title">{person.name}</span>
          <StatusPill status="closed" />
        </header>
      ) : (
        <HeaderBar onBack={onBack}>
          {aiThread ? (
            <div className="gc-avatar" aria-hidden="true">
              <Sparkles size={14} />
            </div>
          ) : (
            <Avatar name={person.name} showStatus online={config?.teamOnline === true} />
          )}
          <div className="gc-header__ident">
            <div className="gc-header__identtop">
              <span className="gc-header__name">{person.name}</span>
              {aiThread ? <AiBadge /> : null}
            </div>
            <span className="gc-header__sub">{person.role}</span>
          </div>
          {aiThread ? (
            <button
              type="button"
              className="gc-ghostbtn"
              onClick={() => send("I'd like to talk to a person, please.", { fromComposer: false })}
            >
              <User />
              Get a human
            </button>
          ) : null}
        </HeaderBar>
      )}

      {handedOver && !closed && assistant ? (
        <Banner tone="info">{assistant} handed this conversation to a teammate</Banner>
      ) : null}

      <div
        ref={threadRef}
        className={aiThread && !closed ? "gc-thread" : "gc-thread gc-thread--tight"}
        role="log"
        aria-live="polite"
        aria-label={`Conversation with ${person.name}`}
      >
        {state.status === "loading" ? (
          <LoadingState label="Loading messages…" />
        ) : state.status === "failed" ? (
          <ErrorState
            title="Couldn't load this conversation"
            onRetry={() => {
              setState((s) => ({ ...s, status: "loading" }));
              setReloadKey((n) => n + 1);
            }}
          />
        ) : state.messages.length === 0 ? (
          <div className="gc-state">
            <p className="gc-state__title">Say hello</p>
            <p className="gc-state__hint">The team will reply right here.</p>
          </div>
        ) : (
          <>
            {state.hasOlder ? (
              <button type="button" className="gc-textbtn" onClick={loadOlder} disabled={loadingOlder}>
                {loadingOlder ? "Loading…" : "Show earlier messages"}
              </button>
            ) : conversation?.createdAt ? (
              <div className="gc-daymark">
                {new Date(conversation.createdAt).toLocaleDateString([], { month: "short", day: "numeric" })}{" "}
                {formatTime(conversation.createdAt)}
              </div>
            ) : null}

            {state.messages.map((m) => (
              <MessageRow key={m.id} message={m} assistant={assistant} />
            ))}

            {closed && !rating ? (
              <RatingCard
                agentName={person.name.split(" ")[0]}
                onSubmit={(payload) => {
                  setRating(payload);
                  getApi()?.rate?.(conversationId, payload.score, payload.comment);
                  onConversationsChanged?.();
                }}
                onSkip={() => setRating({})}
              />
            ) : null}
          </>
        )}
      </div>

      {sendError ? <Banner tone="warn">{sendError}</Banner> : null}

      {closed ? null : (
        <Composer
          placeholder={aiThread ? "Message…" : `Message ${person.name.split(" ")[0]}…`}
          note={aiThread ? `${assistant} is an AI assistant. Ask for a person any time.` : undefined}
          allowImages={aiThread}
          value={draft}
          onValueChange={setDraft}
          sending={sending}
          uploading={uploading}
          onSend={(text) => send(text)}
          onAttach={upload}
        />
      )}
    </>
  );
}

function MessageRow({ message, assistant }) {
  const kind = authorKind(message.authorRole);
  const files = message.attachments || [];

  if (kind === "system") {
    return (
      <div className="gc-rule">
        <span className="gc-rule__label">{message.body}</span>
      </div>
    );
  }

  if (kind === "visitor") {
    return (
      <div className="gc-sent">
        <div className="gc-bubble gc-bubble--user">
          {message.body ? <MarkdownView text={message.body} /> : null}
          <Attachments files={files} />
        </div>
        <span className="gc-receipt">
          {isOptimistic(message)
            ? "Sending…"
            : message.readAt
              ? `Read ${formatTime(message.readAt)}`
              : formatTime(message.createdAt)}
          {isOptimistic(message) ? null : <CheckCheck />}
        </span>
      </div>
    );
  }

  if (kind === "agent") {
    return (
      <div className="gc-msgrow">
        <Avatar name={message.authorName || "Support"} size="sm" />
        <div className="gc-bubble gc-bubble--agent">
          <MarkdownView text={message.body} />
          <Attachments files={files} />
          <span className="gc-bubble__time">{formatTime(message.createdAt)}</span>
        </div>
      </div>
    );
  }

  // AI replies are always labelled as AI in the thread itself (spec §13, EU AI Act Art. 50).
  return (
    <div className="gc-msgrow">
      <div className="gc-avatar gc-avatar--sm" aria-hidden="true">
        <Sparkles size={12} />
      </div>
      <div className="gc-bubble gc-bubble--agent">
        <MarkdownView text={message.body} />
        <Attachments files={files} />
        <span className="gc-row-meta">
          <span className="gc-bubble__time">
            {message.authorName || assistant || "AI assistant"} · {formatTime(message.createdAt)}
          </span>
          <AiBadge />
          <span className="gc-sr">This reply was written by AI.</span>
        </span>
      </div>
    </div>
  );
}

function Attachments({ files }) {
  const links = (files || [])
    .map((a) => ({ href: safeHref(a?.url), name: typeof a?.name === "string" ? a.name : "" }))
    .filter((a) => a.href);
  if (!links.length) return null;
  return (
    <ul className="gc-bubble__files">
      {links.map((a, i) => (
        <li key={`${a.href}-${i}`}>
          <a href={a.href} target="_blank" rel="noopener noreferrer nofollow">
            {a.name || "Attachment"}
          </a>
        </li>
      ))}
    </ul>
  );
}
