"use client";

// Start a new conversation — topic chips, an order picker (only when the topic
// needs one) and a free-text box, with the response-time expectation set just
// above the send button. Posts one message and hands the created conversation
// back so the caller can open its thread.

import { useCallback, useEffect, useMemo, useState } from "react";
import { AvatarStack, Cap, ErrorState, HeaderBar, LoadingState } from "./widget_primitives";

const CATEGORIES = [
  { id: "order", label: "An order" },
  { id: "returns", label: "Returns" },
  { id: "billing", label: "Billing" },
  { id: "account", label: "Account" },
  { id: "other", label: "Something else" },
];

// Quick-action ids from Home map onto the closest category.
const ALIASES = { track: "order", return: "returns", general: "other" };

export function NewConversationView({
  getApi,
  config,
  initialKind,
  initialLabel,
  initialDraft,
  onBack,
  onSent,
}) {
  const [kind, setKind] = useState(initialKind || "order");
  const [orders, setOrders] = useState(null);
  const [orderId, setOrderId] = useState(null);
  const [body, setBody] = useState(initialDraft || "");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const assistant = config?.assistantName || "Aria";
  const team = config?.team ?? [];

  const topic = useMemo(() => {
    if (CATEGORIES.some((c) => c.id === kind)) return kind;
    return ALIASES[kind] || "other";
  }, [kind]);

  const needsOrder = topic === "order" || topic === "returns";

  const load = useCallback(() => {
    getApi()
      ?.recentOrders?.()
      .then((rows) => {
        setOrders(rows ?? []);
        setOrderId((prev) => prev ?? rows?.[0]?.id ?? null);
      })
      .catch(() => setOrders([]));
  }, [getApi]);

  useEffect(() => {
    load();
  }, [load]);

  async function send() {
    const trimmed = body.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setError("");
    const order = orders?.find((o) => o.id === orderId);
    try {
      const label = CATEGORIES.find((c) => c.id === topic)?.label || "Conversation";
      const conversation = await getApi().createConversation(
        initialLabel || `${label}: ${trimmed.slice(0, 60)}`,
        topic,
        needsOrder ? orderId : null,
        order ? `#${order.reference} · ${order.title}` : null,
      );
      await getApi().sendMessage(conversation.id, trimmed, []);
      onSent(conversation);
    } catch {
      setError("Couldn't send — try again or come back later.");
      setSending(false);
    }
  }

  return (
    <>
      <HeaderBar onBack={onBack}>
        <span className="gc-header__title">New conversation</span>
      </HeaderBar>

      <div className="gc-newconvo">
        <div>
          <Cap>What&rsquo;s it about?</Cap>
          <div className="gc-chips">
            {CATEGORIES.map((c) => (
              <button
                key={c.id}
                type="button"
                className="gc-chip"
                aria-pressed={c.id === topic}
                onClick={() => setKind(c.id)}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        {needsOrder ? (
          <div>
            <Cap>Which order?</Cap>
            {orders === null ? (
              <LoadingState label="Loading orders…" />
            ) : orders.length === 0 ? (
              <p className="gc-state__hint" style={{ marginTop: 8 }}>
                No orders in the last 90 days — a teammate will find them for you.
              </p>
            ) : (
              <div className="gc-radiogroup" role="radiogroup" aria-label="Which order?">
                {orders.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    className="gc-radio"
                    role="radio"
                    aria-checked={o.id === orderId}
                    onClick={() => setOrderId(o.id)}
                  >
                    <span className="gc-radio__mark" aria-hidden="true" />
                    <span className="gc-radio__body">
                      <span className="gc-radio__title">
                        #{o.reference} · {o.title}
                      </span>
                      <span className="gc-radio__sub">
                        {o.status} · {o.items} item{o.items === 1 ? "" : "s"}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : null}

        <div className="gc-field gc-field--grow">
          <Cap>Your message</Cap>
          <textarea
            className="gc-textarea"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            aria-label="Your message"
            placeholder="Tell us what's happened — the more detail, the fewer questions back."
          />
        </div>

        {error ? <ErrorState title={error} /> : null}
      </div>

      <footer className="gc-panel__footer gc-newconvofoot">
        <div className="gc-newconvofoot__eta">
          <AvatarStack people={team.length ? team : [{ name: "Support" }]} />
          <span>{assistant} answers first · a person within ~2 minutes</span>
        </div>
        <button
          type="button"
          className="gc-primarybtn gc-primarybtn--block"
          disabled={!body.trim() || sending}
          onClick={send}
        >
          {sending ? "Sending…" : "Send message"}
        </button>
      </footer>
    </>
  );
}
