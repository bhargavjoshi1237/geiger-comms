"use client";

// The thread composer: text on top, attach + hint + send beneath; grows to 120px, Enter sends, Shift+Enter breaks a line, one attachment at a time.

import { useLayoutEffect, useRef, useState } from "react";
import { ArrowUp, Paperclip, Spinner } from "./widget_primitives";

export const ATTACH_ACCEPT = "image/png,image/jpeg,image/webp,image/gif,application/pdf";

export function Composer({
  placeholder = "Message…",
  label,
  note,
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
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [text]);

  const busy = sending || uploading;

  function send() {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    onSend?.(trimmed);
    setText("");
  }

  return (
    <div className="gc-composer">
      <form
        className="gc-composer__box"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <textarea
          ref={ref}
          className="gc-composer__input"
          rows={1}
          value={text}
          placeholder={placeholder}
          aria-label={label || placeholder}
          disabled={busy}
          maxLength={5000}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              send();
            }
          }}
        />
        <div className="gc-composer__row">
          {onAttach ? (
            <>
              <input
                ref={fileRef}
                type="file"
                className="gc-sr"
                tabIndex={-1}
                accept={ATTACH_ACCEPT}
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
                aria-label="Attach a file"
              >
                {uploading ? <Spinner className="gc-spinner--sm" /> : <Paperclip />}
              </button>
            </>
          ) : null}
          <span className="gc-composer__hint">Shift + Enter for a new line</span>
          <button type="submit" className="gc-composer__send" disabled={!text.trim() || busy} aria-label="Send message">
            {sending ? <Spinner className="gc-spinner--sm" /> : <ArrowUp />}
          </button>
        </div>
      </form>
      {note ? <p className="gc-composer__note">{note}</p> : null}
    </div>
  );
}
