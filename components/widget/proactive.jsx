"use client";

// Proactive message popup — a small, dismissible card that the messenger
// shows when the team has outbound context to share (recent order update,
// returns window, policy change). Lives at the bottom-right corner of the
// iframe so the launcher stays accessible.

import { useEffect, useState } from "react";
import { XIcon, ArrowUpIcon } from "./widget_primitives";
import { Avatar } from "./home_space";

export function ProactivePopup({ message, onReply, onDismiss }) {
  const [reply, setReply] = useState("");

  useEffect(() => {
    if (!message) return undefined;
    const t = setTimeout(() => onDismiss?.(), 60_000);
    return () => clearTimeout(t);
  }, [message, onDismiss]);

  if (!message) return null;

  function submit(e) {
    e.preventDefault();
    const text = reply.trim();
    if (!text) return;
    onReply?.(text);
    setReply("");
  }

  return (
    <div className="absolute inset-x-2 bottom-2 z-20 max-w-sm rounded-xl border border-border bg-surface-card p-3 shadow-2xl">
      <header className="mb-2 flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <Avatar name={message.author || "Maya"} size={28} />
          <span>
            <span className="block text-sm font-semibold leading-tight">{message.author || "Maya from Northwind"}</span>
            <span className="text-[11px] text-muted-foreground">{message.subtitle || "Just now"}</span>
          </span>
        </div>
        <button
          type="button"
          aria-label="Dismiss"
          onClick={() => onDismiss?.()}
          className="grid h-7 w-7 place-items-center rounded-full text-muted-foreground hover:bg-surface-hover"
        >
          <XIcon className="h-4 w-4" />
        </button>
      </header>

      <p className="text-sm leading-snug">{message.body}</p>

      {message.actions?.length ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {message.actions.map((a) => (
            <button
              key={a.label}
              type="button"
              onClick={() => (a.action ? a.action() : onReply?.(a.label))}
              className={`rounded-full px-3 py-1.5 text-[12px] font-medium ${
                a.primary
                  ? "bg-primary text-primary-foreground"
                  : "border border-border bg-surface-card hover:bg-surface-hover"
              }`}
            >
              {a.label}
            </button>
          ))}
        </div>
      ) : null}

      <form onSubmit={submit} className="mt-3 flex items-center gap-2 rounded-full border border-border bg-surface-base px-3 py-1.5">
        <input
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          placeholder="Reply…"
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
        <button
          type="submit"
          aria-label="Send"
          disabled={!reply.trim()}
          className="grid h-7 w-7 place-items-center rounded-full bg-primary text-primary-foreground disabled:opacity-40"
        >
          <ArrowUpIcon className="h-3.5 w-3.5" />
        </button>
      </form>
    </div>
  );
}
