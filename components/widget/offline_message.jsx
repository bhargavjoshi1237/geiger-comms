"use client";

// Offline — the away notice in the header, the AI offered as the immediate
// path, and an email-and-message fallback for anything it can't close out.
// Submits a lead through /api/widget/leads, which the workspace turns into a
// conversation on the next business day.

import { useState } from "react";
import { Clock, Sparkles, X } from "./widget_primitives";

const BASE = process.env.NEXT_PUBLIC_BASE_PATH || "";

export function OfflineMessageView({ config, contact, onAsk, onClose }) {
  const brand = config?.name || "Northwind Help";
  const assistant = config?.assistantName || "Aria";
  const backAt = config?.backAt || config?.officeHoursNote || "";
  const [email, setEmail] = useState(contact?.email || "");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    if (!email.trim() || !body.trim() || sending) return;
    setSending(true);
    setError("");
    try {
      const res = await fetch(`${BASE}/api/widget/leads`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: email.trim(), message: body.trim() }),
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
    <>
      <header className="gc-offlinehead">
        <div className="gc-header__row">
          <div className="gc-header__brand">
            <div className="gc-header__logo" style={{ width: 22, height: 22, fontSize: 10 }} aria-hidden="true">
              {(brand.match(/[A-Z]/g) || ["N"]).slice(0, 2).join("")}
            </div>
            <span className="gc-header__brandname" style={{ fontSize: 12.5 }}>
              {brand}
            </span>
          </div>
          <button
            type="button"
            className="gc-iconbtn gc-iconbtn--sm"
            onClick={onClose}
            aria-label="Close messenger"
          >
            <X />
          </button>
        </div>
        <div className="gc-awaybar">
          <Clock />
          <span>
            The team is away{backAt ? <> — back at <strong>{backAt}</strong></> : null}.
          </span>
        </div>
      </header>

      <div className="gc-offline">
        <div className="gc-offercard">
          <Sparkles size={15} className="gc-offercard__icon" />
          <div style={{ minWidth: 0, flex: 1 }}>
            <p className="gc-offercard__title">{assistant} is still awake</p>
            <p className="gc-offercard__desc">
              {assistant} can answer most questions now and flags anything she can&rsquo;t for the morning.
            </p>
            <button type="button" className="gc-primarybtn" onClick={onAsk}>
              Ask {assistant} now
            </button>
          </div>
        </div>

        <div className="gc-rule">
          <span className="gc-rule__label">OR LEAVE A MESSAGE</span>
        </div>

        {sent ? (
          <div className="gc-state">
            <p className="gc-state__title">Message sent</p>
            <p className="gc-state__hint">
              We&rsquo;ll email you back at {email} as soon as a teammate is online.
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, flex: 1 }}>
            <div className="gc-field">
              <label className="gc-field__label" htmlFor="gc-offline-email">
                Email
              </label>
              <input
                id="gc-offline-email"
                type="email"
                className="gc-input"
                value={email}
                placeholder="you@example.com"
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="gc-field gc-field--grow">
              <label className="gc-field__label" htmlFor="gc-offline-body">
                Message
              </label>
              <textarea
                id="gc-offline-body"
                className="gc-textarea"
                style={{ marginTop: 0, borderColor: "var(--gc-border)" }}
                value={body}
                placeholder="What can we help with?"
                onChange={(e) => setBody(e.target.value)}
              />
            </div>
            {error ? <p className="gc-state__hint" style={{ color: "var(--gc-danger)" }}>{error}</p> : null}
          </div>
        )}
      </div>

      {sent ? null : (
        <footer className="gc-panel__footer" style={{ padding: "12px 14px" }}>
          <button
            type="button"
            className="gc-outlinebtn"
            style={{ height: 38, borderRadius: 10, fontSize: 13, width: "100%" }}
            disabled={!email.trim() || !body.trim() || sending}
            onClick={submit}
          >
            {sending ? "Sending…" : "Send and email me the reply"}
          </button>
        </footer>
      )}
    </>
  );
}
