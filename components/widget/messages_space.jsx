"use client";

// Messages space (§9): conversation list → thread → composer, plus the
// "New conversation" screen used when the route's newAbout flag is set.
//
// The thread is the realtime surface (notifications re-fetch through the API),
// shows typing dots while the teammate is composing, surfaces a rating prompt
// when the conversation is closed, and renders a "handed over" badge when the
// AI escalated to a human.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ChevronLeft,
  PaperclipIcon,
  ArrowUpIcon,
  LoadingState,
  EmptyState,
  ErrorState,
  StarIcon,
  Spinner,
  PlusIcon,
} from "./widget_primitives";
import { Avatar } from "./home_space";
import { stripMetadata } from "./image";
import { MarkdownView } from "./markdown_view";
import { NewConversationView } from "./new_conversation";
import { OfflineMessageView } from "./offline_message";
import { RatingPrompt } from "./rating";

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
    const d = Math.round(diff / (60 * 24));
    return `${d}d`;
  } catch {
    return "";
  }
}

export function MessagesSpace({ getApi, route, navigate, refreshSignal, onUnread }) {
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

  useEffect(load, [load, refreshSignal]);

  // New conversation flow (Hub "Quick actions" → Message a person)
  if (route.newAbout || route.newLabel) {
    return (
      <NewConversationView
        getApi={getApi}
        initialKind={route.newAbout}
        initialLabel={route.newLabel}
        initialDraft={route.draft}
        onClose={() => navigate({ space: "home" })}
        onSent={(conversation) =>
          navigate({ space: "messages", conversationId: conversation.id })
        }
      />
    );
  }

  if (route.conversationId) {
    return (
      <ThreadView
        key={route.conversationId}
        conversationId={route.conversationId}
        initialBody={route.draft || ""}
        getApi={getApi}
        onBack={() => navigate({ space: "messages" })}
        onSeen={() => onUnread?.(0)}
        onConversationsChanged={load}
      />
    );
  }

  return (
    <ConversationsList
      conversations={conversations}
      failed={failed}
      load={load}
      open={(c) => {
        onUnread?.(0);
        navigate({ space: "messages", conversationId: c.id });
      }}
      start={() => navigate({ space: "messages", newAbout: "general" })}
    />
  );
}

function ConversationsList({ conversations, failed, load, open, start }) {
  const [tab, setTab] = useState("open");
  const openCount = conversations?.filter((c) => c.state !== "closed").length ?? 0;
  const closedCount = conversations?.filter((c) => c.state === "closed").length ?? 0;
  const visible = conversations?.filter((c) => (tab === "open" ? c.state !== "closed" : c.state === "closed")) ?? [];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <h1 className="text-sm font-semibold">Your conversations</h1>
        <button
          type="button"
          onClick={start}
          className="flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-[11px] font-medium text-primary-foreground"
        >
          + New
        </button>
      </header>

      <div className="flex items-center gap-3 border-b border-border px-4 py-2 text-[12px]">
        <button
          type="button"
          onClick={() => setTab("open")}
          className={`pb-1 ${tab === "open" ? "border-b-2 border-primary font-semibold" : "text-muted-foreground"}`}
        >
          Open · {openCount}
        </button>
        <button
          type="button"
          onClick={() => setTab("closed")}
          className={`pb-1 ${tab === "closed" ? "border-b-2 border-primary font-semibold" : "text-muted-foreground"}`}
        >
          Closed · {closedCount}
        </button>
      </div>

      {conversations === null && !failed ? (
        <LoadingState label="Loading conversations…" />
      ) : failed ? (
        <ErrorState title="Couldn't load your messages" onRetry={load} />
      ) : visible.length === 0 ? (
        <EmptyState
          title={tab === "open" ? "No open conversations" : "No closed conversations"}
          hint={tab === "open" ? "Tap + New to start one." : undefined}
        />
      ) : (
        <ul className="flex flex-col gap-1 px-4 py-3">
          {visible.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => open(c)}
                className="flex w-full items-center gap-3 rounded-lg border border-border bg-surface-card p-3 text-left hover:bg-surface-hover"
              >
                <Avatar name={c.agentName || c.subject} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium">{c.subject || "Your conversation"}</span>
                    <span className="shrink-0 text-[11px] text-muted-foreground">{relativeShort(c.lastActivityAt)}</span>
                  </span>
                  <span className="mt-1 flex items-center gap-1.5 text-[12px] text-muted-foreground">
                    <span className="truncate">{c.preview || "—"}</span>
                    {c.state === "closed" ? (
                      <span className="ml-1 rounded-full bg-surface-subtle px-1.5 py-0.5 text-[10px] font-medium">
                        Closed
                      </span>
                    ) : null}
                    {c.unread ? (
                      <span className="ml-auto grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                        {c.unread}
                      </span>
                    ) : null}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ThreadView({
  conversationId,
  initialBody,
  getApi,
  onBack,
  onSeen,
  onConversationsChanged,
}) {
  const [state, setState] = useState({ status: "loading", conversation: null, messages: [] });
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [draft, setDraft] = useState(initialBody);
  const [typing, setTyping] = useState(false);
  const [rating, setRating] = useState(null);
  const bottomRef = useRef(null);

  const load = useCallback(() => {
    setState((s) => ({ ...s, status: "loading" }));
    Promise.all([
      getApi()?.conversations?.(),
      getApi()?.messages?.(conversationId),
    ])
      .then(([rows, messages]) => {
        const conversation = (rows ?? []).find((c) => c.id === conversationId) ?? null;
        onSeen?.();
        getApi()?.markRead?.(conversationId).catch(() => {});
        setState({ status: "done", conversation, messages: messages ?? [] });
      })
      .catch(() => setState((s) => ({ ...s, status: "failed" })));
  }, [conversationId, getApi, onSeen]);

  useEffect(load, [load]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [state.messages?.length, typing, rating]);

  // Typing indicator flip — true while a teammate is composing. For the demo
  // we toggle it after the user sends a message to mimic the signal.
  useEffect(() => {
    if (!state.messages?.length) return;
    const last = state.messages[state.messages.length - 1];
    if (last?.authorRole === "customer") {
      setTyping(true);
      const t = setTimeout(() => setTyping(false), 3500);
      return () => clearTimeout(t);
    }
  }, [state.messages?.length]);

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
        // Mark thread closed after the customer's reply if the bot resolved.
        conversation: s.conversation ? { ...s.conversation, lastActivityAt: new Date().toISOString() } : s.conversation,
      }));
      onConversationsChanged?.();
    } catch {
      setState((s) => ({
        ...s,
        messages: (s.messages ?? []).filter((m) => m.id !== optimistic.id),
      }));
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
      // Composer keeps its text; a failed upload simply doesn't attach.
    } finally {
      setUploading(false);
    }
  }

  const conv = state.conversation;
  const isHandedOver = conv?.state === "human" || conv?.handedOverAt;
  const isClosed = conv?.state === "closed";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center gap-2 border-b border-border px-4 py-3">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to conversations"
          className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground hover:bg-surface-hover"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <Avatar name={conv?.agentName || "Maya"} />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold leading-tight">{conv?.agentName || "Maya Chen"}</span>
          <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className={`h-1.5 w-1.5 rounded-full ${isClosed ? "bg-zinc-500" : "bg-emerald-400"}`} />
            {isClosed ? "Closed" : isHandedOver ? "Northwind support · typically 2m" : "Northwind · typically 2m"}
          </span>
        </span>
        <button
          type="button"
          aria-label="Conversations"
          className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground hover:bg-surface-hover"
          onClick={onBack}
        >
          <span className="text-base">⋯</span>
        </button>
      </header>

      {isHandedOver ? (
        <Banner tone="info" text="Aria handed this thread to Maya · just now" />
      ) : null}
      {isClosed ? (
        <Banner tone="muted" text={`Closed ${formatTime(conv?.closedAt) || "earlier"}`} />
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {state.status === "loading" ? (
          <LoadingState label="Loading messages…" />
        ) : state.status === "failed" ? (
          <ErrorState title="Couldn't load this conversation" onRetry={load} />
        ) : state.messages.length === 0 ? (
          <EmptyState title="Say hello 👋" hint="Your team will reply right here." />
        ) : (
          <ul className="flex flex-col gap-3">
            {state.messages.map((m) => (
              <li key={m.id} className={`flex ${m.authorRole === "customer" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[80%] rounded-xl px-3 py-2 text-sm ${m.authorRole === "customer" ? "rounded-br-sm bg-primary text-primary-foreground" : "rounded-bl-sm bg-surface-card"}`}>
                  {m.authorRole !== "customer" && m.authorName ? (
                    <p className="mb-1 text-xs font-semibold opacity-80">{m.authorName}</p>
                  ) : null}
                  <MarkdownView
                    text={m.body}
                    className={m.authorRole === "customer" ? "[&_a]:text-primary-foreground [&_code]:bg-primary-foreground/10" : ""}
                  />
                  {(m.attachments || []).length ? (
                    <ul className="mt-1 space-y-0.5 text-xs underline underline-offset-2">
                      {m.attachments.map((a) => (
                        <li key={a.url}>
                          <a href={a.url} target="_blank" rel="noopener noreferrer nofollow">
                            {a.name || a.url}
                          </a>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  <p className="mt-1 text-right text-[10px] opacity-70">
                    {formatTime(m.createdAt)}{" "}
                    {m.authorRole === "customer" && m.readAt ? <span> · Read {formatTime(m.readAt)}</span> : null}
                  </p>
                </div>
              </li>
            ))}

            {typing ? (
              <li className="flex justify-start">
                <div className="flex items-center gap-1.5 rounded-xl bg-surface-card px-3 py-2">
                  <span className="grid h-6 w-6 place-items-center rounded-full bg-primary/15 text-[10px] font-bold uppercase text-primary">
                    {initials(conv?.agentName || "Maya")}
                  </span>
                  <span className="flex items-center gap-0.5">
                    <Dot delay={0} />
                    <Dot delay={150} />
                    <Dot delay={300} />
                  </span>
                </div>
              </li>
            ) : null}
          </ul>
        )}
        <div ref={bottomRef} />
      </div>

      {isClosed && !rating ? (
        <RatingPrompt onRated={(payload) => {
          setRating(payload);
          getApi()?.rate?.(conversationId, payload.score, payload.comment);
          onConversationsChanged?.();
        }} />
      ) : null}

      {!isClosed ? (
        <form
          className="flex items-end gap-2 border-t border-border p-3"
          onSubmit={(e) => {
            e.preventDefault();
            void send(draft);
          }}
        >
          <label className="grid h-9 w-9 cursor-pointer place-items-center rounded-full text-muted-foreground hover:bg-surface-hover" aria-label="Attach a file">
            <PaperclipIcon className="h-4 w-4" />
            <input
              type="file"
              className="hidden"
              accept="image/png,image/jpeg,image/webp,image/gif,application/pdf"
              onChange={(e) => {
                void upload(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </label>
          <div className="flex min-h-[40px] flex-1 items-end rounded-2xl border border-border bg-surface-card px-3 py-2 focus-within:border-border-strong">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send(draft);
                }
              }}
              placeholder="Type a reply…"
              rows={1}
              className="min-h-[24px] w-full resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              disabled={uploading || sending}
            />
          </div>
          <button
            type="submit"
            aria-label="Send"
            disabled={!draft.trim() || sending || uploading}
            className="grid h-9 w-9 place-items-center rounded-full bg-primary text-primary-foreground disabled:opacity-40"
          >
            {sending ? <Spinner className="h-4 w-4" /> : <ArrowUpIcon className="h-4 w-4" />}
          </button>
        </form>
      ) : null}
    </div>
  );
}

function Banner({ tone = "muted", text }) {
  const map = {
    info: "bg-primary/10 text-primary",
    muted: "bg-surface-card text-muted-foreground",
    warn: "bg-amber-500/10 text-amber-400",
  };
  return (
    <div className={`flex items-center justify-center gap-2 px-3 py-1.5 text-center text-[11px] ${map[tone]}`}>
      {text}
    </div>
  );
}

function Dot({ delay = 0 }) {
  return (
    <span
      className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/60"
      style={{ animationDelay: `${delay}ms` }}
    />
  );
}

function initials(name) {
  return (name?.match(/\S/g) || ["M"]).slice(0, 2).join("").toUpperCase();
}
