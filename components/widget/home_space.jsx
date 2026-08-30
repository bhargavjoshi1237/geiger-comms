"use client";

// Hub home space — the "command surface" variant from the spec. Header sits on
// top, then an AskAria card (the ask input doubles as the launcher), Quick
// actions grid, recent conversations and a "Popular right now" rail.
//
// "Ask Aria" here is an INPUT, not a button. Pressing Enter (or the up-arrow)
// opens the Ask space pre-filled with the query. The launcher label echo from
// the parent (via postMessage) is what lets the same AskAria element also
// surface unread-reply labels.

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronRight,
  PackageIcon,
  UndoIcon,
  ReceiptIcon,
  UserIcon,
  SparklesIcon,
  SearchIcon,
  LoadingState,
  ErrorState,
  ArrowUpCircle,
} from "./widget_primitives";

function formatRelative(iso) {
  if (!iso) return "now";
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

const QUICK_ACTIONS = [
  { id: "track", label: "Track an order", icon: PackageIcon },
  { id: "return", label: "Start a return", icon: UndoIcon },
  { id: "billing", label: "Billing question", icon: ReceiptIcon },
  { id: "account", label: "Account & login", icon: UserIcon },
];

export function HomeSpace({
  getApi,
  config,
  contact,
  navigate,
  launcherLabel,
}) {
  const [conversations, setConversations] = useState(null);
  const [actions, setActions] = useState(QUICK_ACTIONS);
  const [popular, setPopular] = useState([]);
  const [askText, setAskText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [failed, setFailed] = useState(false);

  const load = useCallback(() => {
    getApi()
      ?.conversations()
      .then((rows) => setConversations(rows ?? []))
      .catch(() => {
        setFailed(true);
        setConversations([]);
      });
    getApi()
      ?.quickActions?.()
      ?.then((rows) => {
        if (Array.isArray(rows) && rows.length) setActions(rows);
      })
      .catch(() => {});
    getApi()
      ?.popularArticles?.()
      ?.then((rows) => setPopular(rows ?? []))
      .catch(() => {});
  }, [getApi]);

  useEffect(() => {
    load();
  }, [load]);

  const onAsk = (e) => {
    e?.preventDefault?.();
    const q = askText.trim();
    if (!q) return;
    setSubmitting(true);
    // Defer to next tick so the spinner shows before we cross-fade the route.
    setTimeout(() => {
      navigate({ space: "ask", query: q, fresh: true });
      setAskText("");
      setSubmitting(false);
    }, 50);
  };

  const open = useCallback(
    (c) => navigate({ space: "messages", conversationId: c.id }),
    [navigate],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Header config={config} contact={contact} teamOnline />

      <main className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-3">
        {/* Ask Aria — input doubles as launcher */}
        <form
          onSubmit={onAsk}
          aria-label="Ask Aria"
          className="rounded-xl border border-border bg-surface-card p-3"
        >
          <div className="mb-2 flex items-center justify-between">
            <span className="flex items-center gap-2 text-sm font-semibold">
              <span className="grid h-7 w-7 place-items-center rounded-full bg-primary/10 text-primary">
                <SparklesIcon className="h-4 w-4" />
              </span>
              Ask Aria
              <span className="rounded-full border border-border bg-surface-subtle px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
                AI
              </span>
            </span>
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
              {submitting ? "thinking…" : "avg 4s"}
            </span>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-base px-3 py-2 focus-within:border-border-strong">
            <SearchIcon className="h-4 w-4 text-muted-foreground" />
            <input
              value={askText}
              onChange={(e) => setAskText(e.target.value)}
              placeholder="Ask anything about your order, return, or account…"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              aria-label="Ask Aria anything"
              disabled={submitting}
            />
            <button
              type="submit"
              aria-label="Ask"
              disabled={!askText.trim() || submitting}
              className="grid h-7 w-7 place-items-center rounded-full bg-primary text-primary-foreground transition disabled:opacity-40"
            >
              <ArrowUpCircle className="h-7 w-7" />
            </button>
          </div>
        </form>

        {/* Quick actions grid */}
        <section className="mt-6">
          <h2 className="mb-2 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
            Quick actions
          </h2>
          <div className="grid grid-cols-2 gap-2">
            {actions.map((a) => {
              const Icon = a.icon ?? PackageIcon;
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => navigate({ space: "messages", newAbout: a.id, newLabel: a.label })}
                  className="flex items-center gap-2.5 rounded-lg border border-border bg-surface-card px-3 py-2.5 text-left text-sm hover:bg-surface-hover"
                >
                  <span className="grid h-7 w-7 place-items-center rounded-md bg-surface-subtle text-muted-foreground">
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="flex-1 font-medium leading-tight">{a.label}</span>
                </button>
              );
            })}
          </div>
        </section>

        {/* Your conversations */}
        <section className="mt-6">
          <header className="mb-2 flex items-baseline justify-between">
            <h2 className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
              Your conversations
            </h2>
            <span className="text-[11px] text-muted-foreground">
              {conversations ? `${conversations.filter((c) => c.state !== "closed").length} open` : "…"}
            </span>
          </header>

          {conversations === null ? (
            <LoadingState label="Checking for conversations…" />
          ) : failed ? (
            <ErrorState title="Couldn't load your conversations" onRetry={load} />
          ) : conversations.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border bg-surface-card/40 p-4 text-center text-xs text-muted-foreground">
              Nothing here yet — say hello above and Maya will reply shortly.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {conversations.slice(0, 5).map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => open(c)}
                    className="flex w-full items-center gap-3 rounded-lg border border-border bg-surface-card p-3 text-left hover:bg-surface-hover"
                  >
                    <Avatar name={c.agentName || c.subject} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium">
                          {c.subject || c.topic || "Your conversation"}
                        </span>
                        <span className="shrink-0 text-[11px] text-muted-foreground">
                          {formatRelative(c.lastActivityAt || c.updatedAt)}
                        </span>
                      </span>
                      <span className="mt-0.5 flex items-center gap-1.5 text-[12px] text-muted-foreground">
                        <span className="truncate">{c.preview || "Tap to open"}</span>
                        {c.unread ? (
                          <span className="ml-1 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
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
        </section>

        {/* Popular right now */}
        {popular.length ? (
          <section className="mt-6">
            <h2 className="mb-2 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
              Popular right now
            </h2>
            <ul className="flex flex-col">
              {popular.slice(0, 4).map((a, i) => (
                <li key={a.id} className={i > 0 ? "border-t border-border" : ""}>
                  <button
                    type="button"
                    onClick={() => navigate({ space: "help", articleId: a.id })}
                    className="flex w-full items-center gap-3 px-1 py-3 text-left text-sm hover:bg-surface-hover"
                  >
                    <span className="grid h-7 w-7 place-items-center rounded bg-surface-subtle text-[10px] font-semibold uppercase text-muted-foreground">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{a.title}</span>
                      {a.collectionTitle ? (
                        <span className="text-[11px] text-muted-foreground">
                          {a.collectionTitle}
                        </span>
                      ) : null}
                    </span>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <footer className="mt-8 mb-4 text-center text-[10px] tracking-wide text-muted-foreground uppercase">
          Powered by Geiger Comms
        </footer>
      </main>
    </div>
  );
}

function Header({ config, contact, teamOnline }) {
  const name = config?.name || "Northwind Help";
  return (
    <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
      <span className="flex items-center gap-2.5">
        <span
          className="grid h-7 w-7 place-items-center rounded-md text-[11px] font-bold"
          style={{ background: "var(--brand-color, #6366f1)", color: "white" }}
          aria-hidden="true"
        >
          {(name.match(/[A-Z]/g) || ["N"]).slice(0, 2).join("")}
        </span>
        <span className="text-sm font-semibold tracking-tight">{name}</span>
      </span>
      <span className="flex items-center gap-1.5 rounded-full bg-surface-card px-2 py-1 text-[11px] font-medium text-muted-foreground">
        <span className={`h-1.5 w-1.5 rounded-full ${teamOnline ? "bg-emerald-400" : "bg-amber-400"}`} />
        {teamOnline ? "Team online" : "Reply within 2h"}
      </span>
    </header>
  );
}

export function Avatar({ name = "", color, size = 36 }) {
  const initials = (name.match(/\S/g) || ["?"]).slice(0, 2).join("").toUpperCase();
  const bg = color || `hsl(${(hashString(name) % 360)}, 60%, 35%)`;
  return (
    <span
      className="grid shrink-0 place-items-center rounded-full text-[11px] font-bold uppercase text-white"
      style={{ width: size, height: size, background: bg }}
      aria-hidden="true"
    >
      {initials}
    </span>
  );
}

function hashString(value) {
  const s = String(value || "");
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}
