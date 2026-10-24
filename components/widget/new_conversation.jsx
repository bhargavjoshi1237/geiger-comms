"use client";

// Start a conversation: topic chips, an order picker (only with orders), the message and up to five files; hands the new conversation back to open.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ATTACH_ACCEPT } from "./composer";
import { stripMetadata } from "./image";
import {
  AvatarStack,
  Check,
  FileText,
  formatBytes,
  HeaderBar,
  ImageIcon,
  Paperclip,
  safeHref,
  Spinner,
  X,
} from "./widget_primitives";

// Topic ids match the API's accepted aboutKind values; order topics only show when there are orders to pick.
const CATEGORIES = [
  { id: "order", label: "An order", tag: "Order", needsOrder: true },
  { id: "returns", label: "Returns", tag: "Returns", needsOrder: true },
  { id: "billing", label: "Billing", tag: "Billing" },
  { id: "account", label: "Account", tag: "Account" },
  { id: "other", label: "Something else" },
];

// Quick-action ids map onto the closest category.
const ALIASES = { track: "order", return: "returns", general: "other" };

const MAX_BODY = 5000;
const MAX_FILES = 5; // lib/widget/attachments.js MAX_ATTACHMENTS
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ACCEPTED = new Set(ATTACH_ACCEPT.split(","));

// Subjects written below read "Billing: …"; the list shows that prefix as a topic tag and the rest as the title.
export function splitSubject(subject) {
  const text = String(subject || "");
  for (const c of CATEGORIES) {
    if (c.tag && text.startsWith(`${c.label}: `)) return { topic: c.tag, title: text.slice(c.label.length + 2) };
  }
  return { topic: "", title: text };
}

export function NewConversationView({ getApi, config, initialKind, initialDraft, onBack, onClose, onSent }) {
  const [kind, setKind] = useState(initialKind || "other");
  const [orders, setOrders] = useState(null);
  const [orderId, setOrderId] = useState(null);
  const [body, setBody] = useState(initialDraft || "");
  const [files, setFiles] = useState([]); // { key, name, size, contentType, status: "uploading" | "done", result }
  const [dragOver, setDragOver] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef(null);

  const assistant = config?.assistantName || "";
  const team = config?.team ?? [];
  const hasOrders = Array.isArray(orders) && orders.length > 0;
  const categories = CATEGORIES.filter((c) => !c.needsOrder || hasOrders);
  const uploading = files.some((f) => f.status === "uploading");

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

  // Each file uploads as soon as it is picked, so a rejected type or size shows before the visitor hits send.
  async function addFiles(list) {
    const api = getApi();
    const picked = Array.from(list || []);
    if (!api || !picked.length) return;
    setError("");
    const room = MAX_FILES - files.length;
    if (room <= 0) {
      setError(`Up to ${MAX_FILES} files per message.`);
      return;
    }
    for (const file of picked.slice(0, room)) {
      if (!ACCEPTED.has(file.type) || file.size > MAX_FILE_BYTES) {
        setError("Images and PDFs up to 10 MB work.");
        continue;
      }
      const key = `${file.name}-${file.size}-${Date.now()}-${Math.random()}`;
      setFiles((prev) => [...prev, { key, name: file.name, size: file.size, contentType: file.type, status: "uploading" }]);
      try {
        const result = await api.upload(await stripMetadata(file));
        if (!safeHref(result?.url)) throw new Error("upload_failed");
        setFiles((prev) => prev.map((f) => (f.key === key ? { ...f, status: "done", result } : f)));
      } catch {
        setFiles((prev) => prev.filter((f) => f.key !== key));
        setError(`Couldn't upload ${file.name}. Images and PDFs up to 10 MB work.`);
      }
    }
    if (picked.length > room) setError(`Up to ${MAX_FILES} files per message.`);
  }

  async function send() {
    const trimmed = body.trim();
    const api = getApi();
    if (!trimmed || sending || uploading || !api) return;
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
      // The send route accepts back exactly what /upload returned for this session.
      const attachments = files
        .filter((f) => f.status === "done")
        .map(({ result: r, name, size, contentType }) => ({
          url: r.url,
          name: r.name || name,
          size: r.size ?? size,
          contentType: r.contentType ?? contentType,
        }));
      await api.sendMessage(conversation.id, trimmed, attachments);
      onSent(conversation);
    } catch {
      setError("Couldn't send. Check your connection and try again.");
      setSending(false);
    }
  }

  return (
    <>
      <HeaderBar onBack={onBack} backLabel="Back" onClose={onClose}>
        <h1 className="gc-bar__title">New conversation</h1>
      </HeaderBar>

      <form
        className="gc-formwrap"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <div className="gc-form">
          <fieldset className="gc-fieldset">
            <legend className="gc-label">What&rsquo;s it about?</legend>
            <div className="gc-chips">
              {categories.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className="gc-chip"
                  aria-pressed={c.id === topic}
                  onClick={() => setKind(c.id)}
                >
                  {c.id === topic ? <Check size={14} /> : null}
                  {c.label}
                </button>
              ))}
            </div>
          </fieldset>

          {needsOrder ? (
            <fieldset className="gc-fieldset">
              <legend className="gc-label">Which order?</legend>
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
            </fieldset>
          ) : null}

          <div className="gc-field">
            <label className="gc-label" htmlFor="gc-new-message">
              Your message
            </label>
            <textarea
              id="gc-new-message"
              className="gc-textarea"
              value={body}
              maxLength={MAX_BODY}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Tell us what happened. Include any invoice or order numbers so we can find it fast."
            />
            <span className="gc-counter" aria-live="polite">
              {body.length} / {MAX_BODY}
            </span>
          </div>

          <div
            className="gc-dropzone"
            data-over={dragOver}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              void addFiles(e.dataTransfer?.files);
            }}
          >
            <span className="gc-dropzone__tile" aria-hidden="true">
              <Paperclip />
            </span>
            <span className="gc-dropzone__text">
              <span className="gc-dropzone__title">Drop files here</span>
              <span className="gc-dropzone__hint">Images or PDFs, up to 10 MB</span>
            </span>
            <input
              ref={fileRef}
              type="file"
              multiple
              className="gc-sr"
              tabIndex={-1}
              accept={ATTACH_ACCEPT}
              onChange={(e) => {
                const picked = e.target.files;
                void addFiles(picked).finally(() => {
                  e.target.value = "";
                });
              }}
            />
            <button
              type="button"
              className="gc-btn gc-btn--outline gc-btn--sm"
              onClick={() => fileRef.current?.click()}
              disabled={files.length >= MAX_FILES}
            >
              Browse
            </button>
          </div>

          {files.length ? (
            <ul className="gc-attached" aria-label="Attached files">
              {files.map((f) => (
                <li key={f.key} className="gc-attached__item">
                  <span className="gc-attached__icon" aria-hidden="true">
                    {f.contentType.startsWith("image/") ? <ImageIcon size={15} /> : <FileText size={15} />}
                  </span>
                  <span className="gc-attached__name">{f.name}</span>
                  <span className="gc-attached__size">
                    {f.status === "uploading" ? <Spinner className="gc-spinner--sm" /> : formatBytes(f.size)}
                  </span>
                  <button
                    type="button"
                    className="gc-attached__remove"
                    aria-label={`Remove ${f.name}`}
                    disabled={f.status === "uploading"}
                    onClick={() => setFiles((prev) => prev.filter((x) => x.key !== f.key))}
                  >
                    <X size={14} />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          {error ? (
            <p className="gc-formerror" role="alert">
              {error}
            </p>
          ) : null}
        </div>

        <footer className="gc-formfoot">
          <span className="gc-eta">
            {team.length ? <AvatarStack people={team} /> : null}
            {assistant ? `${assistant} answers first, then a teammate.` : "A teammate will reply in this conversation."}
          </span>
          <button
            type="submit"
            className="gc-btn gc-btn--accent gc-btn--block"
            disabled={!body.trim() || sending || uploading}
          >
            {sending ? "Sending…" : "Send message"}
          </button>
        </footer>
      </form>
    </>
  );
}
