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
  CircleCheck,
  ErrorState,
  FileCard,
  firstName,
  HeaderBar,
  LoadingState,
  PageHead,
  Plus,
  Presence,
  safeHref,
  Spinner,
  Tag,
  UnreadCount,
  User,
} from "./widget_primitives";
import { Composer } from "./composer";
import { stripMetadata } from "./image";
import { MarkdownView } from "./markdown_view";
import { NewConversationView, splitSubject } from "./new_conversation";
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

// "Today · 10:24", "Yesterday · 16:02", "12 Oct · 09:15" — the divider a thread opens with.
function dayStamp(iso) {
  const t = Date.parse(iso || "");
  if (Number.isNaN(t)) return "";
  const d = new Date(t);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const same = (a, b) => a.toDateString() === b.toDateString();
  const day = same(d, today)
    ? "Today"
    : same(d, yesterday)
      ? "Yesterday"
      : d.toLocaleDateString([], { day: "numeric", month: "short" });
  return `${day} · ${formatTime(iso)}`;
}

function relativeShort(iso) {
  if (!iso) return "";
  try {
    const diff = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    if (diff < 1) return "now";
    if (diff < 60) return `${diff}m`;
    if (diff < 60 * 24) return `${Math.round(diff / 60)}h`;
    const days = Math.round(diff / (60 * 24));
    if (days < 7) return `${days}d`;
    return new Date(iso).toLocaleDateString([], { day: "numeric", month: "short" });
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
  postToHost,
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
  const close = () => postToHost?.("close");

  if (route.compose || route.newAbout) {
    return (
      <NewConversationView
        getApi={getApi}
        config={config}
        initialKind={route.newAbout}
        initialDraft={route.draft}
        onBack={() => navigate({ space: "messages" })}
        onClose={close}
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
        onClose={close}
        onNew={() => navigate({ space: "messages", compose: true })}
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
      onClose={close}
    />
  );
}

// "Maya: I've voided…" / "You: I added the record…" — who spoke last, ahead of the preview.
function previewAuthor(c, assistant) {
  const kind = c.lastAuthorRole ? authorKind(c.lastAuthorRole) : null;
  if (kind === "visitor") return "You";
  if (kind === "agent") return firstName(c.agentName);
  if (kind === "ai") return assistant;
  return "";
}

function ConversationsList({ conversations, failed, unreadMap, config, load, open, onNew, onClose }) {
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
      <PageHead title="Messages" onClose={onClose}>
        <button type="button" className="gc-btn gc-btn--accent gc-btn--sm" onClick={onNew}>
          <Plus />
          New
        </button>
      </PageHead>

      <div className="gc-segwrap">
        <div className="gc-seg" role="tablist" aria-label="Filter conversations">
          {[
            ["open", "Open", openRows.length],
            ["closed", "Closed", closedRows.length],
          ].map(([id, label, n]) => (
            <button
              key={id}
              type="button"
              role="tab"
              className="gc-seg__btn"
              aria-selected={filter === id}
              onClick={() => setFilter(id)}
            >
              {label}
              <span className="gc-seg__n">{n}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="gc-panel__body gc-panel__body--stack">
        {conversations === null && !failed ? (
          <LoadingState label="Loading conversations…" />
        ) : failed ? (
          <ErrorState title="Couldn't load your messages" onRetry={load} />
        ) : shown.length === 0 ? (
          <div className="gc-state">
            <p className="gc-state__title">
              {filter === "open" ? "No open conversations" : "No closed conversations"}
            </p>
            {filter === "open" ? <p className="gc-state__hint">Tap New to start one.</p> : null}
          </div>
        ) : (
          <div className="gc-list">
            {shown.map((c) => {
              const unread = unreadMap?.[c.id] || 0;
              const closed = c.state === "closed";
              const { topic, title } = splitSubject(c.subject);
              const who = previewAuthor(c, assistant);
              return (
                <button
                  key={c.id}
                  type="button"
                  className="gc-convo"
                  data-unread={unread > 0}
                  data-closed={closed}
                  onClick={() => open(c)}
                >
                  {c.aiOnly ? (
                    <Avatar size="lg" ai />
                  ) : (
                    <Avatar
                      name={c.agentName || c.subject || config?.name}
                      size="lg"
                      muted={closed}
                      showStatus={!closed && Boolean(c.agentName)}
                      online={config?.teamOnline === true}
                    />
                  )}
                  <span className="gc-convo__body">
                    <span className="gc-convo__top">
                      <span className="gc-convo__title">{title || "Your conversation"}</span>
                      <span className="gc-convo__time">{relativeShort(c.lastActivityAt || c.updatedAt)}</span>
                    </span>
                    <span className="gc-convo__line">
                      <span className="gc-convo__preview">
                        {who ? `${who}: ` : ""}
                        {c.preview || "—"}
                      </span>
                      {unread ? <UnreadCount count={unread} /> : null}
                    </span>
                    {closed || topic ? (
                      <span className="gc-convo__tags">
                        {closed ? (
                          <Tag>
                            <CircleCheck />
                            Closed
                          </Tag>
                        ) : null}
                        {topic ? <Tag>{topic}</Tag> : null}
                      </span>
                    ) : null}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {teamKnown && !failed && conversations !== null ? (
        <div className="gc-listfoot">
          <div className="gc-teamcard">
            {team.length ? <AvatarStack people={team} /> : null}
            <span className="gc-teamcard__text">
              <span className="gc-teamcard__title">
                <Presence online={config.teamOnline} backAt={config?.backAt} />
              </span>
              <span className="gc-teamcard__sub">
                {config.teamOnline
                  ? config?.officeHoursNote || "We'll reply here as soon as we can."
                  : assistant
                    ? `${assistant} can still help in the meantime.`
                    : "Leave a message and we'll reply here."}
              </span>
            </span>
          </div>
        </div>
      ) : null}
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
  onClose,
  onNew,
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
  const name = aiThread ? assistant : conversation?.agentName || lastAgent?.authorName || config?.name || "Support";
  const subject = splitSubject(conversation?.subject).title;
  const online = config?.teamOnline === true && !closed && !aiThread;
  const sub = aiThread
    ? "AI assistant"
    : [online ? "Active now" : "", subject || (closed ? "" : config?.officeHoursNote || "The team will reply here")]
        .filter(Boolean)
        .join(" · ");
  const lastAt = state.messages.length ? state.messages[state.messages.length - 1].createdAt : null;

  return (
    <>
      <HeaderBar
        onBack={onBack}
        backLabel="Back to messages"
        onClose={onClose}
        action={
          closed ? (
            <Tag>
              <CircleCheck />
              Closed
            </Tag>
          ) : aiThread ? (
            <button
              type="button"
              className="gc-ghostbtn"
              onClick={() => send("I'd like to talk to a person, please.", { fromComposer: false })}
            >
              <User />
              Get a human
            </button>
          ) : null
        }
      >
        <Avatar name={name} ai={aiThread} muted={closed} showStatus online={online} />
        <span className="gc-bar__ident">
          <span className="gc-bar__name">
            <span className="gc-bar__nametext">{name}</span>
            {aiThread ? <AiBadge /> : null}
          </span>
          {sub ? <span className="gc-bar__sub">{sub}</span> : null}
        </span>
      </HeaderBar>

      {handedOver && !closed && assistant ? (
        <Banner tone="info">{assistant} handed this conversation to a teammate</Banner>
      ) : null}

      <div
        ref={threadRef}
        className="gc-thread"
        role="log"
        aria-live="polite"
        aria-label={`Conversation with ${name}`}
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
              <button type="button" className="gc-older" onClick={loadOlder} disabled={loadingOlder}>
                {loadingOlder ? <Spinner className="gc-spinner--sm" /> : "Show earlier messages"}
              </button>
            ) : conversation?.createdAt || state.messages[0]?.createdAt ? (
              <div className="gc-divider">{dayStamp(conversation?.createdAt || state.messages[0].createdAt)}</div>
            ) : null}

            {state.messages.map((m) => (
              <MessageRow key={m.id} message={m} assistant={assistant} />
            ))}

            {closed ? (
              <>
                <div className="gc-divider">
                  {lastAt ? `Conversation closed · ${formatTime(lastAt)}` : "Conversation closed"}
                </div>
                <RatingCard
                  agentName={aiThread ? "" : firstName(name)}
                  result={rating}
                  onSubmit={(payload) => {
                    setRating(payload);
                    getApi()?.rate?.(conversationId, payload.score, payload.comment);
                    onConversationsChanged?.();
                  }}
                  onSkip={() => setRating({ skipped: true })}
                />
              </>
            ) : null}
          </>
        )}
      </div>

      {sendError ? <Banner tone="warn">{sendError}</Banner> : null}

      {closed ? (
        <div className="gc-closedfoot">
          <button type="button" className="gc-btn gc-btn--outline gc-btn--block" onClick={onNew}>
            <Plus />
            Start a new conversation
          </button>
        </div>
      ) : (
        <Composer
          placeholder={aiThread ? "Message…" : "Write a reply…"}
          label={aiThread ? `Message ${assistant}` : `Reply to ${firstName(name) || name}`}
          note={aiThread ? `${assistant} is an AI assistant. Ask for a person any time.` : undefined}
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

// An upload is sent as a message whose body is the file name; the card already says it, so the bubble is dropped.
function bodyIsFileName(message) {
  const files = message.attachments || [];
  return files.length > 0 && files.some((f) => f?.name && f.name === String(message.body || "").trim());
}

function Files({ files, mine }) {
  const cards = (files || []).filter((f) => safeHref(f?.url));
  if (!cards.length) return null;
  return cards.map((f, i) => <FileCard key={`${f.url}-${i}`} file={f} mine={mine} />);
}

function MessageRow({ message, assistant }) {
  const kind = authorKind(message.authorRole);
  const files = message.attachments || [];
  const showBody = Boolean(message.body) && !bodyIsFileName(message);

  if (kind === "system") {
    return <div className="gc-syspill">{message.body}</div>;
  }

  if (kind === "visitor") {
    const pending = isOptimistic(message);
    return (
      <div className="gc-sent">
        {showBody ? (
          <div className="gc-bubble gc-bubble--user">
            <MarkdownView text={message.body} />
          </div>
        ) : null}
        <Files files={files} mine />
        <span className="gc-receipt" data-read={Boolean(message.readAt)}>
          {pending ? null : <CheckCheck />}
          {pending ? "Sending…" : message.readAt ? `Read ${formatTime(message.readAt)}` : formatTime(message.createdAt)}
        </span>
      </div>
    );
  }

  const ai = kind === "ai";
  const author = ai ? message.authorName || assistant || "AI assistant" : message.authorName || "Support";

  // AI replies are always labelled as AI in the thread itself (spec §13, EU AI Act Art. 50).
  return (
    <div className="gc-msgrow">
      <Avatar name={author} size="sm" ai={ai} />
      <div className="gc-msgcol">
        {showBody ? (
          <div className="gc-bubble">
            <MarkdownView text={message.body} />
          </div>
        ) : null}
        <Files files={files} />
        <span className="gc-msgmeta">
          {ai ? author : firstName(author)} · {formatTime(message.createdAt)}
          {ai ? (
            <>
              <AiBadge />
              <span className="gc-sr">This reply was written by AI.</span>
            </>
          ) : null}
        </span>
      </div>
    </div>
  );
}
