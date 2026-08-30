"use client";

// One row in the conversation list pane. Presentational — everything arrives
// via props from InboxShell (spec §4.2).

import { memo } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@geiger/ui";
import { CheckCheck, Pin } from "lucide-react";
import { StatusPill } from "@/components/internal/shared/screen_kit";
import { cn } from "@/lib/utils";
import {
  CONVERSATION_STATUS_MAP,
  PRIORITY_META,
} from "./constants";

function initials(name) {
  return (name || "?")
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || "")
    .join("");
}

export const ConversationRow = memo(function ConversationRow({
  conversation,
  active,
  onSelect,
}) {
  const priority = PRIORITY_META[conversation.priority] || PRIORITY_META.Normal;
  const PriorityIcon = priority.icon;

  return (
    <button
      type="button"
      onClick={() => onSelect?.(conversation.id)}
      aria-current={active ? "true" : undefined}
      className={cn(
        "flex w-full gap-3 border-b border-border px-4 py-3 text-left transition-colors last:border-b-0",
        active ? "bg-surface-active" : "hover:bg-surface-hover",
      )}
    >
      <Avatar className="mt-0.5 h-8 w-8 shrink-0">
        <AvatarImage src={conversation.contactAvatar || undefined} alt="" />
        <AvatarFallback className="text-xs">{initials(conversation.contactName)}</AvatarFallback>
      </Avatar>

      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "truncate text-sm",
              conversation.unread
                ? "font-semibold text-foreground"
                : "font-medium text-text-secondary",
            )}
          >
            {conversation.subject || conversation.contactName}
          </span>
          <span className="ml-auto shrink-0 text-[11px] tabular-nums text-text-tertiary">
            {formatListTime(conversation.lastMessageAt)}
          </span>
        </div>

        <p
          className={cn(
            "truncate text-xs",
            conversation.unread ? "text-text-secondary" : "text-text-tertiary",
          )}
        >
          {(conversation.preview || "No messages yet").trim()}
        </p>

        <div className="mt-1 flex items-center gap-1.5">
          <StatusPill
            status={conversation.status}
            map={CONVERSATION_STATUS_MAP}
            className="h-5 px-1.5 text-[10px]"
          />
          <span
            className={cn(
              "inline-flex items-center gap-0.5 text-[10px] font-medium",
              priority.className,
            )}
          >
            <PriorityIcon className="h-3 w-3" />
          </span>
          <span className="truncate rounded-full border border-border bg-surface-hover px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            {conversation.channel || "Chat"}
          </span>
          {conversation.assignee ? (
            <span className="truncate text-[10px] text-text-tertiary">
              {conversation.assignee}
            </span>
          ) : null}
          <span className="ml-auto flex items-center gap-1 text-text-tertiary">
            {conversation.waitingOnUs && conversation.status !== "Closed" ? (
              <Pin className="h-3 w-3 text-amber-400" aria-label="Waiting on us" />
            ) : null}
            {conversation.unread ? (
              <CheckCheck className="h-3 w-3 text-primary" aria-label="Unread" />
            ) : null}
          </span>
        </div>
      </div>
    </button>
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
