"use client";

// Reply / internal-note composer (spec §5.5). @mentions live in internal notes (Intercom model); InboxShell turns them into mention rows.
// Disabled with a tooltip reason when the user lacks comms.conversation.reply. The send is optimistic — InboxShell owns it.

import { useMemo, useRef, useState } from "react";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Button,
  Textarea,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@geiger/ui";
import { AtSign, Loader2, SendHorizonal, StickyNote } from "lucide-react";
import { cn } from "@/lib/utils";

// The active mention token: an "@query" at the very end of the draft (the natural typing position).
const MENTION_TRIGGER = /(^|\s)@([^\s@]*)$/;

export function Composer({ teammates, me, disabled, disabledReason, onSend }) {
  const [tab, setTab] = useState("reply"); // reply | note
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [mentionDismissed, setMentionDismissed] = useState(false);
  const inputRef = useRef(null);
  const isNote = tab === "note";

  const mentionQuery = useMemo(() => {
    if (!isNote || mentionDismissed) return null;
    const match = draft.match(MENTION_TRIGGER);
    return match ? match[2].toLowerCase() : null;
  }, [draft, isNote, mentionDismissed]);

  const suggestions = useMemo(() => {
    if (mentionQuery == null) return [];
    return teammates
      .filter((t) => t.id !== me?.id && t.name && t.name.toLowerCase().includes(mentionQuery))
      .slice(0, 6);
  }, [mentionQuery, teammates, me?.id]);

  const highlighted = Math.min(mentionIndex, Math.max(suggestions.length - 1, 0));

  function changeDraft(value) {
    setDraft(value);
    setMentionIndex(0);
    setMentionDismissed(false);
  }

  // Replaces the trailing "@query" with "@Full Name " — the "@" stays so the shell can resolve the mention.
  function applyMention(teammate) {
    changeDraft(draft.replace(MENTION_TRIGGER, (_, lead) => `${lead}@${teammate.name} `));
    inputRef.current?.focus();
  }

  async function send() {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      // On a falsy return we keep the draft so nothing is silently lost.
      const ok = await onSend?.({ body, messageType: isNote ? "note" : "comment" });
      if (ok !== false) changeDraft("");
    } finally {
      setSending(false);
    }
  }

  function onKeyDown(event) {
    if (suggestions.length > 0) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setMentionIndex((highlighted + 1) % suggestions.length);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setMentionIndex((highlighted - 1 + suggestions.length) % suggestions.length);
        return;
      }
      if ((event.key === "Enter" && !event.metaKey && !event.ctrlKey) || event.key === "Tab") {
        event.preventDefault();
        applyMention(suggestions[highlighted]);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setMentionDismissed(true);
        return;
      }
    }
    // Cmd/Ctrl+Enter sends.
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      void send();
    }
  }

  return (
    <div className="shrink-0 border-t border-border p-3">
      {/* Reply / note tabs */}
      <div className="mb-2 flex items-center gap-1" role="tablist" aria-label="Composer mode">
        {[
          { value: "reply", label: "Reply" },
          { value: "note", label: "Internal note" },
        ].map((t) => (
          <button
            key={t.value}
            type="button"
            role="tab"
            aria-selected={tab === t.value}
            onClick={() => {
              setTab(t.value);
              setMentionDismissed(false);
            }}
            className={cn(
              "inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
              tab === t.value
                ? t.value === "note"
                  ? "border border-amber-400/20 bg-amber-400/10 text-amber-300"
                  : "bg-surface-active text-foreground"
                : "text-text-secondary hover:bg-surface-hover hover:text-foreground",
            )}
          >
            {t.value === "note" ? <StickyNote className="h-3 w-3" /> : null}
            {t.label}
          </button>
        ))}
        <span className="ml-auto text-[10px] text-text-tertiary">
          {isNote ? "Never sent to the customer · @ to mention a teammate" : "Sent to the customer"}
        </span>
      </div>

      {disabled ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <div>
              <Textarea
                disabled
                rows={3}
                placeholder={disabledReason || "You don't have permission to reply."}
                className="resize-none border-border bg-surface-card opacity-60"
              />
            </div>
          </TooltipTrigger>
          <TooltipContent>{disabledReason || "You don't have permission to reply."}</TooltipContent>
        </Tooltip>
      ) : (
        <div className="relative">
          <Textarea
            ref={inputRef}
            value={draft}
            onChange={(e) => changeDraft(e.target.value)}
            onKeyDown={onKeyDown}
            rows={3}
            aria-label={isNote ? "Internal note" : "Reply"}
            placeholder={
              isNote
                ? "Add an internal note — @ to mention a teammate…"
                : "Reply to the customer… (Cmd/Ctrl+Enter to send)"
            }
            className={cn(
              "resize-none border-border bg-surface-card",
              isNote && "border-amber-400/30 focus-visible:border-amber-400/50",
            )}
          />

          {/* Mention autocomplete */}
          {suggestions.length > 0 ? (
            <div
              role="listbox"
              aria-label="Mention a teammate"
              className="absolute bottom-full left-3 z-20 mb-1 w-60 overflow-hidden rounded-md border border-border bg-surface-subtle py-1 shadow-lg"
            >
              {suggestions.map((teammate, i) => (
                <button
                  key={teammate.id}
                  type="button"
                  role="option"
                  aria-selected={i === highlighted}
                  onMouseDown={(e) => e.preventDefault()} // keep textarea focus
                  onClick={() => applyMention(teammate)}
                  className={cn(
                    "flex w-full items-center gap-2 px-2.5 py-1.5 text-left transition-colors hover:bg-surface-hover",
                    i === highlighted && "bg-surface-active",
                  )}
                >
                  <Avatar className="h-5 w-5">
                    <AvatarImage src={teammate.avatarUrl || undefined} alt="" />
                    <AvatarFallback className="text-[8px]">{teammate.name?.[0]?.toUpperCase() ?? "?"}</AvatarFallback>
                  </Avatar>
                  <span className="truncate text-xs text-foreground">{teammate.name}</span>
                  <AtSign className="ml-auto h-3 w-3 text-text-tertiary" />
                </button>
              ))}
            </div>
          ) : null}

          <div className="mt-2 flex items-center justify-end">
            <Button type="button" size="sm" onClick={() => void send()} disabled={!draft.trim() || sending}>
              {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <SendHorizonal className="h-3.5 w-3.5" />}
              {isNote ? "Add note" : "Send"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default Composer;
