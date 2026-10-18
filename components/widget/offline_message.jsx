"use client";

// Offline — the away notice, the AI offered as the immediate path when one is configured, and an email-and-message fallback.
// Submits a lead through the session-authenticated API and tells the host the visitor supplied their email (spec §8).

import { useState } from "react";
import { BrandLogo, Clock, Sparkles, X } from "./widget_primitives";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function OfflineMessageView({ getApi, config, contact, onAsk, onClose, onEmailSupplied }) {
  const brand = config?.name || "Support";
  const assistant = config?.assistantName || "";
  const backAt = config?.backAt || config?.officeHoursNote || "";
  const [email, setEmail] = useState(contact?.email || "");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    const address = email.trim();
    const api = getApi?.();
    if (!address || !body.trim() || sending) return;
    if (!EMAIL_RE.test(address)) {
      setError("That email address doesn't look right.");
      return;
    }
    if (!api?.leaveMessage) {
      setError("Couldn't send right now. Try again in a moment.");
      return;
    }
    setSending(true);
    setError("");
    try {
      await api.leaveMessage(address, body.trim());
      setSent(true);
      onEmailSupplied?.(address);
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
            <BrandLogo name={brand} logoUrl={config?.logoUrl} style={{ width: 22, height: 22, fontSize: 10 }} />
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
        {assistant && onAsk ? (
          <>
            <div className="gc-offercard">
              <Sparkles size={15} className="gc-offercard__icon" />
              <div style={{ minWidth: 0, flex: 1 }}>
                <p className="gc-offercard__title">{assistant} can help now</p>
                <p className="gc-offercard__desc">
                  {assistant} is our AI assistant. It can answer most questions now and pass anything else to the team.
                </p>
                <button type="button" className="gc-primarybtn" onClick={onAsk}>
                  Ask {assistant} now
                </button>
              </div>
            </div>

            <div className="gc-rule">
              <span className="gc-rule__label">OR LEAVE A MESSAGE</span>
            </div>
          </>
        ) : null}

        {sent ? (
          <div className="gc-state">
            <p className="gc-state__title">Message sent</p>
            <p className="gc-state__hint">
              We&rsquo;ll email you back at {email.trim()} as soon as a teammate is online.
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
                autoComplete="email"
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
            {error ? (
              <p className="gc-state__hint" role="alert" style={{ color: "var(--gc-danger)" }}>
                {error}
              </p>
            ) : null}
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
