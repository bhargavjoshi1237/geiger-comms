"use client";

// Reply / internal-note composer (spec §5.5). @mentions live in internal notes (Intercom model); InboxShell turns them into mention rows.
// One card: mode tabs, the text, then the send row; note mode tints the whole card amber so a note never reads as a reply.
// Disabled with a tooltip reason when the user lacks comms.conversation.reply. The send is optimistic — InboxShell owns it.

import { useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Button,
  Kbd,
  KbdGroup,
  Textarea,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@geiger/ui";
import { AtSign, Loader2, SendHorizonal, StickyNote } from "lucide-react";
import { cn } from "@/lib/utils";
import { channelMeta } from "./constants";

// The active mention token: an "@query" at the very end of the draft (the natural typing position).
const MENTION_TRIGGER = /(^|\s)@([^\s@]*)$/;

const MODES = [
  { value: "reply", label: "Reply" },
  { value: "note", label: "Note", icon: StickyNote },
];

const noop = () => () => {};
const isMac = () => /Mac|iPhone|iPad/.test(navigator.platform);

export function Composer({ teammates, me, recipient, channel, disabled, disabledReason, onSend }) {
  const [tab, setTab] = useState("reply"); // reply | note
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [mentionDismissed, setMentionDismissed] = useState(false);
  const inputRef = useRef(null);
  const isNote = tab === "note";
  // Cmd on Apple keyboards, Ctrl elsewhere; the server render assumes Ctrl.
  const mod = useSyncExternalStore(noop, () => (isMac() ? "⌘" : "Ctrl"), () => "Ctrl");

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

  // The Mention button starts a fresh "@" token, which opens the autocomplete.
  function startMention() {
    changeDraft(`${draft}${draft && !/\s$/.test(draft) ? " " : ""}@`);
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

  const context = isNote
    ? "Only team can see notes"
    : recipient
      ? `To ${recipient} ${channelMeta(channel).via}`
      : "Sent to the customer";

  if (disabled) {
    const reason = disabledReason || "You don't have permission to reply.";
    return (
      <div className="shrink-0 px-4 pb-5 pt-2 sm:px-6">
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              tabIndex={0}
              className="mx-auto max-w-[760px] rounded-xl border border-border bg-surface-subtle px-4 py-5 text-sm text-muted-foreground"
            >
              {reason}
            </div>
          </TooltipTrigger>
          <TooltipContent>{reason}</TooltipContent>
        </Tooltip>
      </div>
    );
  }

  return (
    <div className="shrink-0 px-4 pb-5 pt-2 sm:px-6">
      <div
        className={cn(
          "relative mx-auto max-w-[760px] rounded-xl border transition-colors",
          isNote
            ? "border-amber-400/35 bg-amber-400/[0.06] focus-within:border-amber-400/60"
            : "border-border bg-surface-card focus-within:border-border-strong",
        )}
      >
        {/* Reply / note tabs */}
        <div className="flex items-center gap-0.5 px-1.5 pt-1.5" role="tablist" aria-label="Composer mode">
          {MODES.map((mode) => {
            const selected = tab === mode.value;
            const Icon = mode.icon;
            return (
              <button
                key={mode.value}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => {
                  setTab(mode.value);
                  setMentionDismissed(false);
                  inputRef.current?.focus();
                }}
                className={cn(
                  "inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[13px] font-medium transition-colors",
                  selected
                    ? mode.value === "note"
                      ? "bg-amber-400/15 text-amber-300"
                      : "bg-surface-strong text-foreground"
                    : "text-muted-foreground hover:bg-surface-hover hover:text-foreground",
                )}
              >
                {Icon ? <Icon className="h-3.5 w-3.5" /> : null}
                {mode.label}
              </button>
            );
          })}
          <span className={cn("ml-auto truncate pl-2 pr-2 text-xs", isNote ? "text-amber-300" : "text-muted-foreground")}>
            {context}
          </span>
        </div>

        <Textarea
          ref={inputRef}
          value={draft}
          onChange={(e) => changeDraft(e.target.value)}
          onKeyDown={onKeyDown}
          rows={3}
          aria-label={isNote ? "Internal note" : recipient ? `Reply to ${recipient}` : "Reply"}
          placeholder={isNote ? "Write a note. Type @ to mention a teammate." : "Write a reply…"}
          className="min-h-20 resize-none rounded-none border-0 bg-transparent px-3.5 py-2.5 leading-[1.55] placeholder:text-muted-foreground focus-visible:border-0 focus-visible:ring-0"
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
                <AtSign className="ml-auto h-3 w-3 text-muted-foreground" />
              </button>
            ))}
          </div>
        ) : null}

        {/* Send row */}
        <div className="flex items-center gap-2 px-2 pb-2">
          {isNote ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 gap-1 px-2 text-xs text-amber-300 hover:bg-amber-400/10 hover:text-amber-200"
              onMouseDown={(e) => e.preventDefault()}
              onClick={startMention}
            >
              <AtSign className="h-3.5 w-3.5" /> Mention
            </Button>
          ) : null}
          <span className="ml-auto hidden items-center gap-1.5 text-xs text-muted-foreground sm:inline-flex">
            <KbdGroup>
              <Kbd className="h-[18px] min-w-[18px] border border-border bg-transparent font-mono text-[11px]">{mod}</Kbd>
              <Kbd className="h-[18px] min-w-[18px] border border-border bg-transparent font-mono text-[11px]">↵</Kbd>
            </KbdGroup>
            to send
          </span>
          <Button
            type="button"
            size="sm"
            className="ml-auto font-semibold disabled:bg-surface-strong disabled:text-muted-foreground disabled:opacity-100 sm:ml-0"
            onClick={() => void send()}
            disabled={!draft.trim() || sending}
          >
            {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <SendHorizonal className="h-3.5 w-3.5" />}
            {isNote ? "Add note" : "Send"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default Composer;
