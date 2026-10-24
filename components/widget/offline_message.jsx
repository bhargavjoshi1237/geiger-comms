"use client";

// Offline — the away notice, the AI offered as the immediate path when one is configured, and an email-and-message fallback.
// Submits a lead through the session-authenticated API and tells the host the visitor supplied their email (spec §8).

import { useState } from "react";
import {
  AiBadge,
  BookOpen,
  BrandLogo,
  Check,
  ChevronRight,
  CloseButton,
  Mail,
  Moon,
  Sparkles,
} from "./widget_primitives";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function OfflineMessageView({ getApi, config, contact, onAsk, onHelp, onClose, onEmailSupplied }) {
  const brand = config?.name || "Support";
  const assistant = config?.assistantName || "";
  const backAt = config?.backAt || "";
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
      <header className="gc-hero gc-hero--away">
        <div className="gc-hero__bar">
          <BrandLogo name={brand} logoUrl={config?.logoUrl} />
          <span className="gc-hero__brand">{brand}</span>
          <CloseButton onClose={onClose} />
        </div>
        <div className="gc-hero__lede">
          <h1>We&rsquo;re away right now.</h1>
          <p>
            Leave a message and we&rsquo;ll email you the reply.
            {config?.officeHoursNote ? ` ${config.officeHoursNote}` : ""}
          </p>
        </div>
        <div className="gc-awaybar">
          <Moon />
          <span className="gc-awaybar__text">The team is away</span>
          {backAt ? <span className="gc-awaybar__when">Back {backAt}</span> : null}
        </div>
      </header>

      <div className="gc-away">
        {assistant && onAsk ? (
          <button type="button" className="gc-linkcard" onClick={onAsk}>
            <span className="gc-linkcard__tile" aria-hidden="true">
              <Sparkles size={16} />
            </span>
            <span className="gc-linkcard__text">
              <span className="gc-linkcard__title">
                {assistant} can help now
                <AiBadge />
              </span>
              <span className="gc-linkcard__sub">Our AI assistant answers most questions and passes the rest on.</span>
            </span>
            <ChevronRight className="gc-linkcard__chev" />
          </button>
        ) : null}

        {sent ? (
          <section className="gc-sentcard" role="status">
            <span className="gc-okmark gc-okmark--lg" aria-hidden="true">
              <Check size={18} />
            </span>
            <span className="gc-sentcard__text">
              <span className="gc-sentcard__title">Message sent</span>
              <span className="gc-sentcard__sub">
                We&rsquo;ll reply to {email.trim()} as soon as a teammate is online.
              </span>
            </span>
            <button
              type="button"
              className="gc-btn gc-btn--outline gc-btn--sm"
              onClick={() => {
                setBody("");
                setSent(false);
              }}
            >
              Send another
            </button>
          </section>
        ) : (
          <form
            className="gc-away__form"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <div className="gc-field">
              <label className="gc-label" htmlFor="gc-offline-email">
                Email
              </label>
              <input
                id="gc-offline-email"
                type="email"
                autoComplete="email"
                className="gc-input"
                value={email}
                placeholder="you@company.com"
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="gc-field">
              <label className="gc-label" htmlFor="gc-offline-body">
                Message
              </label>
              <textarea
                id="gc-offline-body"
                className="gc-textarea gc-textarea--short"
                value={body}
                maxLength={5000}
                placeholder="What can we help with?"
                onChange={(e) => setBody(e.target.value)}
              />
            </div>
            {error ? (
              <p className="gc-formerror" role="alert">
                {error}
              </p>
            ) : null}
            <button
              type="submit"
              className="gc-btn gc-btn--accent gc-btn--block"
              disabled={!email.trim() || !body.trim() || sending}
            >
              <Mail />
              {sending ? "Sending…" : "Send and email me the reply"}
            </button>
          </form>
        )}

        {onHelp ? (
          <button type="button" className="gc-linkcard gc-linkcard--end" onClick={onHelp}>
            <span className="gc-linkcard__tile" aria-hidden="true">
              <BookOpen />
            </span>
            <span className="gc-linkcard__text">
              <span className="gc-linkcard__title">Browse the help centre</span>
              <span className="gc-linkcard__sub">Answers are available any time.</span>
            </span>
            <ChevronRight className="gc-linkcard__chev" />
          </button>
        ) : null}
      </div>
    </>
  );
}
