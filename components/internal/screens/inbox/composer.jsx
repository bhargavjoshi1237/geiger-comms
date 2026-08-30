"use client";

// Reply / internal-note composer with @mention autocomplete (spec §5.5).
// Disabled (with a tooltip reason) when the user lacks
// comms.conversation.reply. The send is optimistic — InboxShell owns it.

import { useMemo, useRef, useState } from "react";
import { Button, Textarea, Tooltip, TooltipContent, TooltipTrigger } from "@geiger/ui";
import { SendHorizonal, StickyNote } from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@geiger/ui";

// A mention token is an @name at the very end of the draft — the natural
// typing position. No ref reads during render.
const MENTION_TRIGGER = /@([\w.-]*)$/;

export function Composer({ conversationId, teammates, disabled, disabledReason, onSend }) {
  const [tab, setTab] = useState("reply"); // reply | note
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const inputRef = useRef(null);

  // Active @mention token: null when not mentioning; else the query text.
  const mentionQuery = useMemo(() => {
    if (tab !== "reply") return null;
    const match = draft.match(MENTION_TRIGGER);
    return match ? match[1].toLowerCase() : null;
  }, [draft, tab]);

  const suggestions = useMemo(() => {
    if (mentionQuery == null) return [];
    return teammates
      .filter((t) => t.name.toLowerCase().includes(mentionQuery))
      .slice(0, 5);
  }, [mentionQuery, teammates]);

  function applyMention(teammate) {
    setDraft(draft.replace(MENTION_TRIGGER, `${teammate.name} `));
    inputRef.current?.focus();
  }

  async function send() {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      // Shell resolves mentions and persists; on a falsy return we keep the
      // draft so nothing the customer should see is silently lost.
      const ok = await onSend?.({ body, messageType: tab === "note" ? "note" : "comment", draft });
      if (ok !== false) setDraft("");
    } finally {
      setSending(false);
    }
  }

  function onKeyDown(event) {
    // Mention picker keyboard support.
    if (mentionQuery != null && suggestions.length > 0) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Enter") {
        event.preventDefault();
        applyMention(suggestions[0]);
        return;
      }
      if (event.key === "Escape") {
        setDraft(draft.replace(MENTION_TRIGGER, ""));
        return;
      }
    }
    // Cmd/Ctrl+Enter sends.
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      void send();
    }
  }

  const isNote = tab === "note";

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
            onClick={() => setTab(t.value)}
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
          {isNote ? "Never sent to the customer" : "@ to mention a teammate"}
        </span>
      </div>

      {disabled ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <div>
              <Textarea
                ref={inputRef}
                disabled
                rows={3}
                placeholder={disabledReason || "You don't have permission to reply."}
                className="resize-none bg-surface-card border-border opacity-60"
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
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            rows={3}
            placeholder={
              isNote
                ? "Add an internal note for your team…"
                : `Reply to the customer… (Cmd/Ctrl+Enter to send)`
            }
            className={cn(
              "resize-none border-border bg-surface-card",
              isNote && "border-amber-400/30 focus-visible:border-amber-400/50",
            )}
          />

          {/* Mention autocomplete */}
          {suggestions.length > 0 ? (
            <div className="absolute bottom-full left-3 z-20 mb-1 w-56 overflow-hidden rounded-md border border-border bg-surface-subtle shadow-lg">
              {suggestions.map((teammate) => (
                <button
                  key={teammate.id}
                  type="button"
                  onClick={() => applyMention(teammate)}
                  className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left transition-colors hover:bg-surface-hover"
                >
                  <Avatar className="h-5 w-5">
                    <AvatarFallback className="text-[8px]">{teammate.name?.[0]?.toUpperCase() ?? "?"}</AvatarFallback>
                  </Avatar>
                  <span className="truncate text-xs text-foreground">{teammate.name}</span>
                </button>
              ))}
            </div>
          ) : null}

          <div className="mt-2 flex items-center justify-end">
            <Button
              type="button"
              size="sm"
              onClick={() => void send()}
              disabled={!draft.trim() || sending}
            >
              {sending ? (
                <span className="h-3 w-3 animate-spin rounded-full border border-current border-t-transparent" />
              ) : (
                <SendHorizonal className="h-3.5 w-3.5" />
              )}
              {isNote ? "Add note" : "Send"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default Composer;
