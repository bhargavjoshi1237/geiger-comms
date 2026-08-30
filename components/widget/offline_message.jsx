"use client";

// "Leave a message" surface used when the team is offline or AI is asleep.
// Submits a lead via /api/widget/leads which the workspace's Lead Inbox
// catches and turns into a fresh conversation on the next business day.

import { useState } from "react";
import {
  ChevronLeft,
  SendIcon,
  SparklesIcon,
} from "./widget_primitives";
import { Avatar } from "./home_space";

export function OfflineMessageView({ config, onClose }) {
  const greeting = config?.greeting || "Hi there";
  const teamOnline = config?.teamOnline !== false;
  const note = config?.officeHoursNote || "The team is away — back at 09:00 GMT, in about 11 hours.";
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function submit(e) {
    e?.preventDefault?.();
    if (!email.trim() || !message.trim() || sending) return;
    setSending(true);
    setError("");
    try {
      // The shared API client knows about /leads already; we can't pass it
      // via props here, so issue a fetch directly through the public route.
      const base = process.env.NEXT_PUBLIC_BASE_PATH || "";
      const res = await fetch(`${base}/api/widget/leads`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: email.trim(), message: message.trim() }),
      });
      if (!res.ok) throw new Error("send_failed");
      setSent(true);
    } catch {
      setError("Couldn't send right now. Try again in a moment.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center gap-2 border-b border-border px-4 py-3">
        <button
          type="button"
          aria-label="Back"
          onClick={onClose}
          className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground hover:bg-surface-hover"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-sm font-semibold">{config?.name || "Northwind Help"}</span>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {teamOnline ? (
          <p className="mb-4 rounded-lg bg-surface-card px-3 py-2 text-[12px] text-muted-foreground">{greeting}. How can we help?</p>
        ) : (
          <p className="mb-4 rounded-lg bg-surface-card px-3 py-2 text-[12px] text-muted-foreground">⏳ {note}</p>
        )}

        {!teamOnline ? (
          <section className="rounded-xl border border-border bg-surface-card p-3">
            <header className="mb-2 flex items-center gap-2">
              <span className="grid h-7 w-7 place-items-center rounded-full bg-primary/10 text-primary">
                <SparklesIcon className="h-4 w-4" />
              </span>
              <span className="text-sm font-semibold">Aria is still awake</span>
            </header>
            <p className="mb-3 text-[12px] text-muted-foreground">
              She can answer most questions right now. Anything she can't solve, we flag for the morning.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-full bg-primary py-2 text-sm font-medium text-primary-foreground"
            >
              Ask Aria now
            </button>
          </section>
        ) : null}

        <div className="my-5 flex items-center gap-3 text-[10px] uppercase tracking-wider text-muted-foreground">
          <span className="h-px flex-1 bg-border" />
          <span>or leave a message</span>
          <span className="h-px flex-1 bg-border" />
        </div>

        {sent ? (
          <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-[12px] text-emerald-400">
            Thanks — we'll email you back at <strong>{email}</strong> as soon as a teammate is online.
          </div>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Email</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="sam@example.com"
                className="rounded-lg border border-border bg-surface-card px-3 py-2 text-sm outline-none focus:border-border-strong"
                required
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Message</span>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={6}
                placeholder="What can we help with?"
                className="resize-none rounded-lg border border-border bg-surface-card px-3 py-2 text-sm outline-none focus:border-border-strong"
                required
              />
            </label>
            {error ? <p className="text-xs text-red-400">{error}</p> : null}
            <button
              type="submit"
              disabled={!email.trim() || !message.trim() || sending}
              className="w-full rounded-full bg-primary py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              {sending ? "Sending…" : "Send and email me the reply"}
            </button>
          </form>
        )}
      </main>
    </div>
  );
}
