"use client";

// Start a new conversation — topic chips, an order picker (only when the visitor has orders) and a free-text box.
// Creates the conversation, posts the first message and hands the conversation back so the caller can open its thread.

import { useCallback, useEffect, useMemo, useState } from "react";
import { AvatarStack, Cap, ErrorState, HeaderBar } from "./widget_primitives";

// Topic ids match the API's accepted aboutKind values; order topics only show when there are orders to pick.
const CATEGORIES = [
  { id: "order", label: "An order", needsOrder: true },
  { id: "returns", label: "Returns", needsOrder: true },
  { id: "billing", label: "Billing" },
  { id: "account", label: "Account" },
  { id: "other", label: "Something else" },
];

// Quick-action ids map onto the closest category.
const ALIASES = { track: "order", return: "returns", general: "other" };

export function NewConversationView({ getApi, config, initialKind, initialDraft, onBack, onSent }) {
  const [kind, setKind] = useState(initialKind || "other");
  const [orders, setOrders] = useState(null);
  const [orderId, setOrderId] = useState(null);
  const [body, setBody] = useState(initialDraft || "");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const assistant = config?.assistantName || "";
  const team = config?.team ?? [];
  const hasOrders = Array.isArray(orders) && orders.length > 0;
  const categories = CATEGORIES.filter((c) => !c.needsOrder || hasOrders);

  const topic = useMemo(() => {
    const id = CATEGORIES.some((c) => c.id === kind) ? kind : ALIASES[kind] || "other";
    // An order topic without orders to attach falls back to a general conversation.
    return CATEGORIES.find((c) => c.id === id)?.needsOrder && !hasOrders ? "other" : id;
  }, [kind, hasOrders]);

  const needsOrder = hasOrders && CATEGORIES.find((c) => c.id === topic)?.needsOrder === true;

  const load = useCallback(() => {
    getApi()
      ?.recentOrders?.()
      .then((rows) => {
        const list = Array.isArray(rows) ? rows.filter((o) => o && typeof o.id === "string") : [];
        setOrders(list);
        setOrderId((prev) => prev ?? list[0]?.id ?? null);
      })
      .catch(() => setOrders([]));
  }, [getApi]);

  useEffect(() => {
    load();
  }, [load]);

  async function send() {
    const trimmed = body.trim();
    const api = getApi();
    if (!trimmed || sending || !api) return;
    setSending(true);
    setError("");
    const order = needsOrder ? orders?.find((o) => o.id === orderId) : null;
    try {
      const label = CATEGORIES.find((c) => c.id === topic)?.label || "Conversation";
      const subject = topic === "other" ? trimmed.slice(0, 80) : `${label}: ${trimmed.slice(0, 60)}`;
      const conversation = await api.createConversation(
        subject,
        topic,
        order ? order.id : null,
        order ? `#${order.reference} · ${order.title}` : null,
      );
      if (!conversation?.id) throw new Error("create_failed");
      await api.sendMessage(conversation.id, trimmed, []);
      onSent(conversation);
    } catch {
      setError("Couldn't send — check your connection and try again.");
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
            {categories.map((c) => (
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
          {team.length ? <AvatarStack people={team} /> : null}
          <span>{assistant ? `${assistant} answers first, then a teammate` : "A teammate will reply in this conversation"}</span>
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
