"use client";

// The centre pane: thread header (subject + conversation actions), the message
// scroller, and the composer. Presentational — InboxShell owns the mutations.
// When no conversation is open it renders a centred placeholder, never a blank
// area (spec §5.2).

import { useEffect, useRef } from "react";
import { Button, Skeleton } from "@geiger/ui";
import {
  AlarmClock,
  CheckCheck,
  CircleDot,
  MailOpen,
  MessagesSquare,
  MoreHorizontal,
  Ticket as TicketIcon,
  Tag,
  UserPlus,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@geiger/ui";
import { StatusPill } from "@/components/internal/shared/screen_kit";
import { cn } from "@/lib/utils";
import MessageBubble from "./message_bubble";
import { Composer } from "./composer";
import {
  CONVERSATION_STATUS_MAP,
  PRIORITY_META,
  SNOOZE_PRESETS,
  TAG_COLOR_MAP,
} from "./constants";

export function ConversationThread({
  conversation,
  loading,
  messages,
  teammates,
  canReply,
  replyDisabledReason,
  onSend,
  onAssign,
  onSnooze,
  onClose,
  onReopen,
  onPriority,
  onMarkUnread,
  onToggleTags,
  onCreateTicket,
}) {
  const scroller = useRef(null);

  // Keep the newest message in view — but only when the message set actually
  // grows, so scrolling up to read never fights the user.
  const lastMessageId = messages?.[messages.length - 1]?.id;
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lastMessageId, conversation?.id]);

  if (!conversation) {
    return (
      <div className="flex h-full min-h-0 flex-1 flex-col items-center justify-center gap-3 bg-background/20 px-6 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-border bg-surface-card text-text-secondary">
          <MessagesSquare className="h-6 w-6" />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-semibold text-foreground">No conversation selected</p>
          <p className="mx-auto max-w-sm text-sm text-text-secondary">
            Pick a conversation from the list to read the thread and reply.
          </p>
        </div>
      </div>
    );
  }

  const priority = PRIORITY_META[conversation.priority] || PRIORITY_META.Normal;
  const PriorityIcon = priority.icon;

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col bg-background/20">
      {/* Header (shrink-0) */}
      <div className="flex shrink-0 items-start gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold text-foreground">
            {conversation.subject || `Conversation with ${conversation.contactName}`}
          </h2>
          <div className="mt-1 flex items-center gap-2">
            <StatusPill
              status={conversation.status}
              map={CONVERSATION_STATUS_MAP}
              className="h-5 px-1.5 text-[10px]"
            />
            <span
              className={cn("inline-flex items-center gap-1 text-[11px] font-medium", priority.className)}
            >
              <PriorityIcon className="h-3 w-3" /> {priority.label}
            </span>
            <span className="truncate text-[11px] text-text-tertiary">
              {conversation.channel || "Chat"} ·{" "}
              {conversation.contactName || "Unknown contact"}
            </span>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {(conversation.tags || []).length > 0 ? (
            <div className="mr-1 hidden items-center gap-1 md:flex">
              {conversation.tags.slice(0, 3).map((tag) => (
                <span
                  key={tag.id}
                  className={cn(
                    "rounded-full border px-2 py-0.5 text-[10px] font-medium",
                    TAG_COLOR_MAP[tag.color] || TAG_COLOR_MAP.slate,
                  )}
                >
                  {tag.name}
                </span>
              ))}
            </div>
          ) : null}

          <Button variant="ghost" size="icon-sm" aria-label="Edit tags" onClick={() => onToggleTags?.(conversation)}>
            <Tag />
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label="Create ticket" onClick={() => onCreateTicket?.(conversation)}>
            <TicketIcon />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={conversation.unread ? "Mark read" : "Mark unread"}
            onClick={() =>
              conversation.unread ? onMarkUnread?.(conversation) : null
            }
            disabled={!conversation.unread}
          >
            <MailOpen />
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Conversation actions">
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="border-border bg-surface-subtle">
              {/* Assign */}
              <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-text-tertiary">
                Assign to
              </DropdownMenuLabel>
              {teammates.map((t) => (
                <DropdownMenuItem
                  key={t.id}
                  className={cn("text-xs", conversation.assigneeId === t.id && "bg-surface-active")}
                  onClick={() => onAssign?.(conversation, t)}
                >
                  <UserPlus /> {t.name}
                  {conversation.assigneeId === t.id ? <CircleDot className="ml-auto h-3 w-3" /> : null}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator className="bg-border" />

              {/* Snooze presets (spec §5.5) */}
              <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-text-tertiary">
                Snooze until
              </DropdownMenuLabel>
              {SNOOZE_PRESETS.map((preset) => (
                <DropdownMenuItem
                  key={preset.value}
                  className="text-xs"
                  onClick={() => onSnooze?.(conversation, preset.value)}
                >
                  <AlarmClock /> {preset.label}
                </DropdownMenuItem>
              ))}
              <DropdownMenuItem className="text-xs" onClick={() => onSnooze?.(conversation, "custom")}>
                <AlarmClock /> Custom…
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-border" />

              {/* Close / reopen */}
              {conversation.status === "Closed" ? (
                <DropdownMenuItem className="text-xs" onClick={() => onReopen?.(conversation)}>
                  <CheckCheck /> Reopen conversation
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem className="text-xs" onClick={() => onClose?.(conversation)}>
                  <CheckCheck /> Close conversation
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Messages (flex-1, overflow-y-auto) */}
      <div ref={scroller} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className={cn("flex gap-3", i % 2 === 1 && "flex-row-reverse")}>
              <Skeleton className="h-7 w-7 shrink-0 rounded-full" />
              <Skeleton className="h-14 w-2/3" />
            </div>
          ))
        ) : messages.length === 0 ? (
          <p className="py-8 text-center text-sm text-text-secondary">
            No messages in this thread yet.
          </p>
        ) : (
          messages.map((message) => <MessageBubble key={message.id} message={message} />)
        )}
      </div>

      {/* Composer (shrink-0) */}
      <Composer
        conversationId={conversation.id}
        teammates={teammates}
        disabled={!canReply}
        disabledReason={replyDisabledReason}
        onSend={onSend}
      />
    </div>
  );
}

export default ConversationThread;
