"use client";

// One presentational list row (spec §4.2): who + when, subject — latest (or matched) message, then flags; the avatar doubles as a bulk checkbox.

import { memo, useEffect, useRef } from "react";
import { Avatar, AvatarFallback, AvatarImage, Checkbox } from "@geiger/ui";
import { AlertTriangle, Clock, Tag, User } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  CONVERSATION_STATUS_MAP,
  channelMeta,
  contactLabel,
  formatElapsed,
  initials,
  isKnownContact,
} from "./constants";

// Every flag on line 3 shares this shape: a 12px icon and a muted label.
function Flag({ icon: Icon, iconClassName, title, className, children }) {
  return (
    <span title={title} className={cn("inline-flex shrink-0 items-center gap-1", className)}>
      <Icon className={cn("size-3 shrink-0", iconClassName)} />
      {children}
    </span>
  );
}

// Search hits highlighted inside `text`; the query is matched case-insensitively.
function Highlight({ text, query }) {
  if (!query || !text) return text;
  const lower = text.toLowerCase();
  const parts = [];
  let from = 0;
  for (let at = lower.indexOf(query); at !== -1; at = lower.indexOf(query, from)) {
    if (at > from) parts.push(text.slice(from, at));
    parts.push(
      <mark key={at} className="rounded-sm bg-amber-400/20 text-foreground">
        {text.slice(at, at + query.length)}
      </mark>,
    );
    from = at + query.length;
  }
  if (from < text.length) parts.push(text.slice(from));
  return parts;
}

// A one-line window onto a matched message, starting a little before the first hit so it survives truncation.
function matchSnippet(body, query) {
  const text = (body || "").replace(/\s+/g, " ").trim();
  const at = text.toLowerCase().indexOf(query);
  return at > 32 ? `…${text.slice(at - 24)}` : text;
}

export const ConversationRow = memo(function ConversationRow({
  conversation,
  active,
  focused,
  showStatus,
  selected,
  selecting,
  searchQuery,
  onSelect,
  onToggleSelect,
}) {
  const ref = useRef(null);
  const tags = conversation.tags || [];
  const channel = conversation.channel || "Chat";
  const ChannelIcon = channelMeta(channel).icon;
  const subject = (conversation.subject || "").trim();
  const preview = (conversation.preview || "").trim();
  const waiting = conversation.waitingOnUs && conversation.status !== "Closed";
  const statusMeta = showStatus && conversation.status !== "Open" ? CONVERSATION_STATUS_MAP[conversation.status] : null;
  const query = (searchQuery || "").trim().toLowerCase();
  // A body hit the subject/preview don't already show; the server sends it only while searching.
  const match =
    query && conversation.searchMatch?.body && ![subject, preview].some((t) => t.toLowerCase().includes(query))
      ? conversation.searchMatch
      : null;

  // Keep the j/k keyboard cursor visible as it moves.
  useEffect(() => {
    if (focused) ref.current?.scrollIntoView({ block: "nearest" });
  }, [focused]);

  return (
    <div className="group relative">
      <button
        ref={ref}
        type="button"
        data-conversation-row=""
        onClick={() => onSelect?.(conversation.id)}
        aria-current={active ? "true" : undefined}
        className={cn(
          "flex w-full gap-3 rounded-lg p-2.5 text-left transition-colors",
          active || selected ? "bg-surface-active" : "hover:bg-surface-card",
          focused && "ring-1 ring-inset ring-border-strong",
        )}
      >
        {/* Avatar box is fixed to the avatar's size so the channel badge sits on the avatar, not the row's bottom edge */}
        <span className="relative mt-0.5 size-9 shrink-0 self-start">
          <Avatar className="size-9">
            <AvatarImage src={conversation.contactAvatar || undefined} alt="" />
            <AvatarFallback className="bg-surface-hover text-xs font-medium text-foreground">
              {isKnownContact(conversation) ? initials(conversation.contactName) : <User className="size-4 text-muted-foreground" />}
            </AvatarFallback>
          </Avatar>
          <span
            title={channel}
            className={cn(
              "absolute -bottom-1 -right-1 flex size-4 items-center justify-center rounded-full border-2 bg-surface-strong text-foreground",
              active || selected ? "border-surface-active" : "border-background group-hover:border-surface-card",
            )}
          >
            <ChannelIcon className="size-2.5" strokeWidth={2.4} aria-label={channel} />
          </span>
        </span>

        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex h-5 items-center gap-2">
            <span className={cn("truncate text-sm text-foreground", conversation.unread ? "font-semibold" : "font-medium")}>
              {contactLabel(conversation)}
            </span>
            <span className="ml-auto flex shrink-0 items-center gap-1.5">
              {conversation.unread ? (
                <span role="img" aria-label="Unread" className="size-[7px] rounded-full bg-notification-dot" />
              ) : null}
              <span className="text-xs tabular-nums text-muted-foreground">{formatListTime(conversation.lastMessageAt)}</span>
            </span>
          </span>

          <span className="mt-0.5 truncate text-[13px] leading-[18px]">
            {subject ? (
              <span className={cn("text-foreground", conversation.unread && "font-medium")}>
                <Highlight text={subject} query={query} />
              </span>
            ) : null}
            {match ? (
              <span className="text-muted-foreground">
                {subject ? " — " : ""}
                {match.type === "note" ? <span className="text-amber-300">Note: </span> : null}
                <Highlight text={matchSnippet(match.body, query)} query={query} />
              </span>
            ) : preview && preview !== subject ? (
              <span className="text-muted-foreground">
                {subject ? " — " : ""}
                <Highlight text={preview} query={query} />
              </span>
            ) : null}
            {!subject && !preview && !match ? <span className="text-muted-foreground">No messages yet</span> : null}
          </span>

          <span className="mt-1.5 flex h-5 min-w-0 items-center gap-3 text-xs text-muted-foreground">
            {statusMeta ? (
              <span className="inline-flex shrink-0 items-center gap-1.5">
                <span className={cn("size-1.5 rounded-full", statusMeta.dotClass)} />
                {statusMeta.label}
              </span>
            ) : null}
            {conversation.priority === "Urgent" ? (
              <Flag icon={AlertTriangle} iconClassName="text-red-400" className="text-foreground">
                Urgent
              </Flag>
            ) : null}
            {waiting ? (
              <Flag icon={Clock} title="Waiting on your team">
                Waiting {formatElapsed(conversation.lastMessageAt)}
              </Flag>
            ) : null}
            {tags.length > 0 ? (
              <Flag icon={Tag} title={tags.map((t) => t.name).join(", ")} className="min-w-0 shrink">
                <span className="truncate">{tags[0].name}</span>
                {tags.length > 1 ? <span className="shrink-0">+{tags.length - 1}</span> : null}
              </Flag>
            ) : null}

            {conversation.assignee ? (
              <Avatar className="ml-auto size-5 shrink-0" title={`Assigned to ${conversation.assignee}`}>
                <AvatarFallback className="bg-surface-strong text-[9px] font-semibold text-foreground">
                  {initials(conversation.assignee)}
                </AvatarFallback>
              </Avatar>
            ) : (
              <span
                title="Unassigned"
                aria-label="Unassigned"
                role="img"
                className="ml-auto size-5 shrink-0 rounded-full border border-dashed border-border-strong"
              />
            )}
          </span>
        </span>
      </button>

      {/* Bulk-select checkbox over the avatar: on hover or focus, and on every row once anything is selected */}
      {onToggleSelect ? (
        <span
          className={cn(
            "absolute left-2.5 top-3 flex size-9 items-center justify-center rounded-full bg-surface-strong transition-opacity",
            selecting || selected
              ? "opacity-100"
              : "pointer-events-none opacity-0 focus-within:pointer-events-auto focus-within:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100",
          )}
        >
          <Checkbox
            checked={Boolean(selected)}
            aria-label={`Select conversation with ${contactLabel(conversation)}`}
            title="Select (X) · shift-click selects a range"
            onClick={(e) => {
              e.preventDefault();
              onToggleSelect(conversation.id, e.shiftKey);
            }}
          />
        </span>
      ) : null}
    </div>
  );
});

// Compact relative time for the list row; full timestamps live in the thread.
function formatListTime(dateStr) {
  const t = new Date(dateStr).getTime();
  if (!Number.isFinite(t)) return "";
  const diff = Date.now() - t;
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default ConversationRow;
