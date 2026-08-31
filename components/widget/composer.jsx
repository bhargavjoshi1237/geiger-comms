"use client";

// The message composer that anchors the AI and human threads. Auto-grows to a
// 96px cap (the design's four-ish lines), sends on Enter and keeps Shift+Enter
// for a newline. The paperclip and image buttons share one hidden file input —
// the widget only ever uploads one attachment at a time.

import { useLayoutEffect, useRef, useState } from "react";
import { ArrowUp, ImageIcon, Paperclip, Spinner } from "./widget_primitives";

const ACCEPT = "image/png,image/jpeg,image/webp,image/gif,application/pdf";

export function Composer({
  placeholder = "Message…",
  note,
  allowImages = true,
  value,
  onValueChange,
  sending = false,
  uploading = false,
  onSend,
  onAttach,
}) {
  const [internal, setInternal] = useState("");
  const text = value ?? internal;
  const setText = onValueChange ?? setInternal;
  const ref = useRef(null);
  const fileRef = useRef(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Reset first so the box can shrink again when text is deleted.
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 96)}px`;
  }, [text]);

  const busy = sending || uploading;

  function send() {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    onSend?.(trimmed);
    setText("");
  }

  return (
    <div className="gc-panel__footer gc-composer">
      <div className="gc-composer__box">
        <textarea
          ref={ref}
          className="gc-composer__input"
          rows={1}
          value={text}
          placeholder={placeholder}
          aria-label={placeholder}
          disabled={busy}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
        />
        {onAttach ? (
          <>
            <input
              ref={fileRef}
              type="file"
              className="gc-sr"
              accept={ACCEPT}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) onAttach(file);
              }}
            />
            <button
              type="button"
              className="gc-composer__btn"
              onClick={() => fileRef.current?.click()}
              disabled={busy}
              aria-label="Attach file"
            >
              {uploading ? <Spinner className="gc-spinner--sm" /> : <Paperclip />}
            </button>
            {allowImages ? (
              <button
                type="button"
                className="gc-composer__btn"
                onClick={() => fileRef.current?.click()}
                disabled={busy}
                aria-label="Add image"
              >
                <ImageIcon />
              </button>
            ) : null}
          </>
        ) : null}
        <button
          type="button"
          className="gc-composer__btn gc-composer__send"
          onClick={send}
          disabled={!text.trim() || busy}
          aria-label="Send message"
        >
          {sending ? <Spinner className="gc-spinner--sm" /> : <ArrowUp />}
        </button>
      </div>
      {note ? <p className="gc-composer__note">{note}</p> : null}
    </div>
  );
}
