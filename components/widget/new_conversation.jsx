"use client";

// "New conversation" entry — used by the Hub Quick actions and the launcher
// "Get a human" link. Categorises the request with a chip row, optionally
// binds it to an order from the customer's history, and posts a single
// message that opens into the existing Thread view on success.

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronLeft,
  PaperclipIcon,
  ArrowUpIcon,
  LoadingState,
  ErrorState,
} from "./widget_primitives";
import { Avatar } from "./home_space";

const CATEGORIES = [
  { id: "order", label: "An order" },
  { id: "returns", label: "Returns" },
  { id: "billing", label: "Billing" },
  { id: "account", label: "Account" },
  { id: "other", label: "Something else" },
];

export function NewConversationView({ getApi, initialKind, initialLabel, initialDraft, onClose, onSent }) {
  const [kind, setKind] = useState(initialKind || "order");
  const [orders, setOrders] = useState(null);
  const [orderId, setOrderId] = useState(null);
  const [message, setMessage] = useState(initialDraft || "");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  // Map "track" / "return" / "billing" / "account" quick-actions into the
  // closest category id. Anything else falls into "other".
  const resolvedKind = useMemo(() => {
    if (CATEGORIES.some((c) => c.id === kind)) return kind;
    const map = { track: "order", return: "returns" };
    return map[kind] || "other";
  }, [kind]);

  const load = useCallback(() => {
    getApi()
      ?.recentOrders?.()
      .then((rows) => {
        setOrders(rows ?? []);
        if (!orderId && rows?.[0]?.id) setOrderId(rows[0].id);
      })
      .catch(() => setOrders([]));
  }, [getApi, orderId]);

  useEffect(() => {
    load();
  }, [load]);

  async function send() {
    const trimmed = message.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setError("");
    const order = orders?.find((o) => o.id === orderId);
    try {
      const conversation = await getApi().createConversation(
        initialLabel || `${CATEGORIES.find((c) => c.id === resolvedKind)?.label || "Conversation"}: ${trimmed.slice(0, 60)}`,
        resolvedKind,
        orderId,
        order ? `#${order.reference} · ${order.title}` : null,
      );
      await getApi().sendMessage(conversation.id, trimmed, []);
      onSent(conversation);
    } catch (e) {
      setError("Couldn't send — try again or come back later.");
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
        <h1 className="text-sm font-semibold">New conversation</h1>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <section>
          <h2 className="mb-2 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
            What's it about?
          </h2>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setKind(c.id)}
                className={`rounded-full border px-3 py-1.5 text-[12px] font-medium ${
                  resolvedKind === c.id
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-surface-card hover:bg-surface-hover"
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </section>

        <section className="mt-5">
          <h2 className="mb-2 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
            Which order?
          </h2>
          {orders === null ? (
            <LoadingState label="Loading orders…" />
          ) : orders.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border bg-surface-card/40 p-3 text-center text-[12px] text-muted-foreground">
              No orders in the last 90 days — you'll be matched with a teammate
              who'll find them.
            </p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {orders.map((o) => (
                <li key={o.id}>
                  <label
                    className={`flex cursor-pointer items-center gap-3 rounded-lg border border-border bg-surface-card px-3 py-2 text-left ${orderId === o.id ? "ring-1 ring-primary" : ""}`}
                  >
                    <input
                      type="radio"
                      name="order"
                      className="sr-only"
                      checked={orderId === o.id}
                      onChange={() => setOrderId(o.id)}
                    />
                    <span className="grid h-4 w-4 place-items-center rounded-full border border-border">
                      {orderId === o.id ? <span className="h-2 w-2 rounded-full bg-primary" /> : null}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">#{o.reference} · {o.title}</span>
                      <span className="text-[11px] text-muted-foreground">
                        {o.status} · {o.items} item{o.items === 1 ? "" : "s"}
                      </span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="mt-5">
          <h2 className="mb-2 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
            Your message
          </h2>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={6}
            placeholder="Tell us what's happened — the more detail, the fewer questions back."
            className="w-full resize-none rounded-lg border border-border bg-surface-card px-3 py-2 text-sm outline-none focus:border-border-strong"
          />
        </section>

        {error ? (
          <ErrorState title={error} />
        ) : null}
      </main>

      <footer className="border-t border-border bg-background/80 p-3 backdrop-blur">
        <p className="mb-2 flex items-center gap-2 px-2 text-[11px] text-muted-foreground">
          <Avatar name="Maya" size={20} />
          <span>
            Aria answers first · a person within ~2 minutes
          </span>
        </p>
        <button
          type="button"
          onClick={send}
          disabled={!message.trim() || sending}
          className="w-full rounded-full bg-primary py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          {sending ? "Sending…" : "Send message"}
        </button>
      </footer>
    </div>
  );
}
