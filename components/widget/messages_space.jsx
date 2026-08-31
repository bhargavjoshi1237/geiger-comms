"use client";

// Messages — the conversation list, the thread and the "new conversation"
// screen, all in the drawn messenger shell.
//
// One thread renderer covers every case the design draws: an AI author gets a
// plain bubble and the "get a human" escape hatch, a human author gets an
// avatar and a read receipt, a closed thread swaps the composer for the rating
// card. What changes between them is the data, not the layout.

import { useCallback, useEffect, useRef, useState } from "react";
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

export function MessagesSpace({
  getApi,
  config,
  route,
  navigate,
  refreshSignal,
  onUnread,
  visible = true,
}) {
  const [conversations, setConversations] = useState(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(() => {
    getApi()
      ?.conversations()
      .then((rows) => {
        setConversations(rows ?? []);
        setFailed(false);
      })
      .catch(() => setFailed(true));
  }, [getApi]);

  // A hidden iframe keeps its last snapshot; polling resumes on the next show.
  useEffect(() => {
    if (visible) load();
  }, [load, refreshSignal, visible]);

  if (route.newAbout || route.newLabel) {
    return (
      <NewConversationView
        getApi={getApi}
        config={config}
        initialKind={route.newAbout}
        initialLabel={route.newLabel}
        initialDraft={route.draft}
        onBack={() => navigate({ space: "messages" })}
        onSent={(conversation) => navigate({ space: "messages", conversationId: conversation.id })}
      />
    );
  }

  if (route.conversationId) {
    return (
      <ThreadScreen
        key={route.conversationId}
        conversationId={route.conversationId}
        initialBody={route.draft || ""}
        getApi={getApi}
        config={config}
        onBack={() => navigate({ space: "messages" })}
        onSeen={() => onUnread?.(0)}
        onConversationsChanged={load}
      />
    );
  }

  return (
    <ConversationsList
      conversations={conversations}
      config={config}
      failed={failed}
      load={load}
      open={(c) => {
        onUnread?.(0);
        navigate({ space: "messages", conversationId: c.id });
      }}
      onNew={() => navigate({ space: "messages", newAbout: "general", newLabel: "Something else" })}
    />
  );
}

function ConversationsList({ conversations, config, failed, load, open, onNew }) {
  const [filter, setFilter] = useState("open");

  const rows = conversations ?? [];
  const openRows = rows.filter((c) => c.state !== "closed");
  const closedRows = rows.filter((c) => c.state === "closed");
  const shown = filter === "open" ? openRows : closedRows;
  const team = config?.team ?? [];
  const teamOnline = config?.teamOnline !== false;
  const assistant = config?.assistantName || "Aria";

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
            {shown.map((c, i) => (
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
                  <Avatar name={c.agentName || c.subject} size="lg" showStatus online={c.state !== "closed"} />
                )}
                <div className="gc-convo__body">
                  <div className="gc-convo__top">
                    <span className="gc-convo__title">{c.subject || "Your conversation"}</span>
                    <span className="gc-convo__time">{relativeShort(c.lastActivityAt || c.updatedAt)}</span>
                  </div>
                  <p className={c.unread ? "gc-convo__preview gc-convo__preview--unread" : "gc-convo__preview"}>
                    {c.previewAuthor ? <strong>{c.previewAuthor}:</strong> : null} {c.preview || "—"}
                  </p>
                  <div className="gc-convo__meta">
                    <StatusPill status={c.state === "closed" ? "closed" : "open"} />
                    {c.unread ? <UnreadCount count={c.unread} /> : null}
                  </div>
                </div>
              </button>
            ))}

            {shown.length === 0 ? (
              <div className="gc-state">
                <p className="gc-state__title">
                  {filter === "open" ? "No open conversations" : "No closed conversations"}
                </p>
                {filter === "open" ? <p className="gc-state__hint">Tap New to start one.</p> : null}
              </div>
            ) : null}

            <div className="gc-listfoot">
              <div className="gc-teamcard">
                <AvatarStack people={team.length ? team : [{ name: "Support" }]} />
                <span>{teamOnline ? "Team is online now" : `Team is away — ${assistant} can still help`}</span>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}

function ThreadScreen({
  conversationId,
  initialBody,
  getApi,
  config,
  onBack,
  onSeen,
  onConversationsChanged,
}) {
  const [state, setState] = useState({ status: "loading", conversation: null, messages: [] });
  const [draft, setDraft] = useState(initialBody);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [typing, setTyping] = useState(false);
  const [rating, setRating] = useState(null);
  const threadRef = useRef(null);

  const assistant = config?.assistantName || "Aria";

  const load = useCallback(() => {
    Promise.all([getApi()?.conversations?.(), getApi()?.messages?.(conversationId)])
      .then(([rows, messages]) => {
        const conversation = (rows ?? []).find((c) => c.id === conversationId) ?? null;
        onSeen?.();
        getApi()?.markRead?.(conversationId).catch(() => {});
        setState({ status: "done", conversation, messages: messages ?? [] });
      })
      .catch(() => setState((s) => ({ ...s, status: "failed" })));
  }, [conversationId, getApi, onSeen]);

  useEffect(load, [load]);

  // Keep the newest message in view as the thread grows.
  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [state.messages?.length, typing, rating]);

  // Typing dots while the other end composes; the demo signal flips shortly
  // after the visitor sends so the state is exercised end to end.
  useEffect(() => {
    if (!state.messages?.length) return undefined;
    const last = state.messages[state.messages.length - 1];
    if (authorKind(last?.authorRole) !== "visitor") return undefined;
    const on = setTimeout(() => setTyping(true), 300);
    const off = setTimeout(() => setTyping(false), 3800);
    return () => {
      clearTimeout(on);
      clearTimeout(off);
    };
  }, [state.messages?.length]); // eslint-disable-line react-hooks/exhaustive-deps

  async function send(text) {
    const trimmed = (text ?? "").trim();
    if (!trimmed || sending) return;
    setSending(true);
    const optimistic = {
      id: `optimistic-${Date.now()}`,
      authorRole: "customer",
      authorName: "",
      body: trimmed,
      attachments: [],
      createdAt: new Date().toISOString(),
    };
    setState((s) => ({ ...s, messages: [...(s.messages ?? []), optimistic] }));
    setDraft("");
    try {
      const saved = await getApi().sendMessage(conversationId, trimmed, []);
      setState((s) => ({
        ...s,
        messages: s.messages.map((m) => (m.id === optimistic.id ? saved : m)),
        conversation: s.conversation
          ? { ...s.conversation, lastActivityAt: new Date().toISOString() }
          : s.conversation,
      }));
      onConversationsChanged?.();
    } catch {
      setState((s) => ({ ...s, messages: (s.messages ?? []).filter((m) => m.id !== optimistic.id) }));
      setDraft(trimmed);
    } finally {
      setSending(false);
    }
  }

  async function upload(file) {
    if (!file || uploading) return;
    setUploading(true);
    try {
      const result = await getApi().upload(await stripMetadata(file));
      await send(`${file.name} — ${result.url ?? ""}`);
    } catch {
      // The composer keeps its text; a failed upload simply doesn't attach.
    } finally {
      setUploading(false);
    }
  }

  const conv = state.conversation;
  const closed = conv?.state === "closed";
  const handedOver = conv?.state === "human" || Boolean(conv?.handedOverAt);
  const aiThread = !handedOver && (conv?.aiOnly ?? false);
  const person = {
    name: aiThread ? assistant : conv?.agentName || "Support",
    role: closed ? "Closed" : handedOver ? "Support · typically 2m" : "Answers in seconds",
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
            <Avatar name={person.name} showStatus online />
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
              onClick={() => send("I'd like to talk to a person, please.")}
            >
              <User />
              Get a human
            </button>
          ) : null}
        </HeaderBar>
      )}

      {handedOver && !closed ? <Banner tone="info">{assistant} handed this thread to a teammate</Banner> : null}

      <div
        ref={threadRef}
        className={aiThread && !closed ? "gc-thread" : "gc-thread gc-thread--tight"}
        role="log"
        aria-label={`Conversation with ${person.name}`}
      >
        {state.status === "loading" ? (
          <LoadingState label="Loading messages…" />
        ) : state.status === "failed" ? (
          <ErrorState
            title="Couldn't load this conversation"
            onRetry={() => {
              setState((s) => ({ ...s, status: "loading" }));
              load();
            }}
          />
        ) : state.messages.length === 0 ? (
          <div className="gc-state">
            <p className="gc-state__title">Say hello</p>
            <p className="gc-state__hint">Your team will reply right here.</p>
          </div>
        ) : (
          <>
            {conv?.createdAt ? (
              <div className="gc-daymark">
                {new Date(conv.createdAt).toLocaleDateString([], { month: "short", day: "numeric" })}{" "}
                {formatTime(conv.createdAt)}
              </div>
            ) : null}

            {state.messages.map((m) => (
              <MessageRow key={m.id} message={m} />
            ))}

            {typing ? (
              <div className="gc-msgrow gc-msgrow--typing">
                <Avatar name={person.name} size="sm" />
                <div className="gc-typing" aria-hidden="true">
                  <span className="gc-dot" />
                  <span className="gc-dot" />
                  <span className="gc-dot" />
                </div>
                <span className="gc-typing__label">{person.name} is typing</span>
              </div>
            ) : null}

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

      {closed ? null : (
        <Composer
          placeholder={aiThread ? "Message…" : `Message ${person.name.split(" ")[0]}…`}
          note={aiThread ? `${assistant} is an AI assistant. Ask for a person any time.` : undefined}
          allowImages={aiThread}
          value={draft}
          onValueChange={setDraft}
          sending={sending}
          uploading={uploading}
          onSend={send}
          onAttach={upload}
        />
      )}
    </>
  );
}

function MessageRow({ message }) {
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
        {message.body ? (
          <div className="gc-bubble gc-bubble--user">
            <MarkdownView text={message.body} />
            <Attachments files={files} />
          </div>
        ) : (
          <div className="gc-bubble gc-bubble--user">
            <Attachments files={files} />
          </div>
        )}
        <span className="gc-receipt">
          {message.readAt ? `Read ${formatTime(message.readAt)}` : formatTime(message.createdAt)}
          <CheckCheck />
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

  return (
    <div className="gc-bubble">
      <MarkdownView text={message.body} />
      <Attachments files={files} />
    </div>
  );
}

function Attachments({ files }) {
  if (!files?.length) return null;
  return (
    <ul className="gc-bubble__files">
      {files.map((a) => (
        <li key={a.url}>
          <a href={a.url} target="_blank" rel="noopener noreferrer nofollow">
            {a.name || a.url}
          </a>
        </li>
      ))}
    </ul>
  );
}
