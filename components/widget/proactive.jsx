"use client";

// Proactive message — a compact card from a named teammate with two answers
// and a reply box. Inside the iframe it floats over the panel (see the framed
// overrides in app/widget/widget.css); on a host page the same markup sits
// above the launcher.

import { useEffect, useState } from "react";
import { ArrowUp, Avatar, X } from "./widget_primitives";

export function ProactivePopup({ message, onReply, onDismiss }) {
  const [reply, setReply] = useState("");

  useEffect(() => {
    if (!message) return undefined;
    const t = setTimeout(() => onDismiss?.(), 60_000);
    return () => clearTimeout(t);
  }, [message, onDismiss]);

  if (!message) return null;

  const author = message.author || "Maya from Northwind";
  const [confirm, dismiss] = message.actions || [];

  function send() {
    const text = reply.trim();
    if (!text) return;
    onReply?.(text);
    setReply("");
  }

  return (
    <section className="gc-proactive" aria-label={`Message from ${author}`}>
      <div className="gc-proactive__head">
        <Avatar name={author} size="sm" showStatus online />
        <div className="gc-proactive__who">
          <span className="gc-proactive__name">{author}</span>
          <span className="gc-proactive__when">{(message.subtitle || "Just now").toUpperCase()}</span>
        </div>
        <button
          type="button"
          className="gc-proactive__dismiss"
          onClick={() => onDismiss?.()}
          aria-label="Dismiss message"
        >
          <X size={13} />
        </button>
      </div>

      <div className="gc-proactive__body">
        <p className="gc-proactive__msg">{message.body}</p>
        <div className="gc-proactive__actions">
          <button type="button" className="gc-proactive__yes" onClick={() => onReply?.(confirm?.label || "Yes")}>
            {confirm?.label || "Yes, please"}
          </button>
          <button type="button" className="gc-proactive__no" onClick={() => onDismiss?.()}>
            {dismiss?.label || "No thanks"}
          </button>
        </div>
      </div>

      <div className="gc-proactive__reply">
        <div className="gc-proactive__replybox">
          <input
            value={reply}
            placeholder="Reply…"
            aria-label={`Reply to ${author}`}
            onChange={(e) => setReply(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                send();
              }
            }}
          />
          <button type="button" className="gc-proactive__send" onClick={send} aria-label="Send reply">
            <ArrowUp size={12} />
          </button>
        </div>
      </div>
    </section>
  );
}
