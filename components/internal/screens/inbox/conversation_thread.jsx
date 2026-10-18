"use client";

// The centre pane: thread header (subject + conversation actions), the message scroller and the composer.
// Presentational — InboxShell owns the mutations. Renders a placeholder when nothing is open (spec §5.2).

import { useEffect, useRef } from "react";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  LogoLoading,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@geiger/ui";
import {
  AlarmClock,
  ArrowLeft,
  CheckCheck,
  ChevronDown,
  CircleDot,
  Mail,
  MailOpen,
  MessageSquareOff,
  MessagesSquare,
  MoreHorizontal,
  PanelRight,
  RotateCcw,
  Tag,
  Ticket as TicketIcon,
  UserMinus,
  UserPlus,
} from "lucide-react";
import { StatusPill } from "@/components/internal/shared/screen_kit";
import { cn } from "@/lib/utils";
import MessageBubble from "./message_bubble";
import { Composer } from "./composer";
import { TagPicker } from "./tag_picker";
import {
  CONVERSATION_STATUS_MAP,
  PRIORITY_FILTER_OPTIONS,
  PRIORITY_META,
  SNOOZE_PRESETS,
  TAG_COLOR_MAP,
} from "./constants";

// Wraps a disabled control so its permission reason still shows on hover/focus (disabled buttons get no pointer events).
function Gated({ reason, children }) {
  if (!reason) return children;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} className="inline-flex rounded-md">
          {children}
        </span>
      </TooltipTrigger>
      <TooltipContent>{reason}</TooltipContent>
    </Tooltip>
  );
}

function CenteredNotice({ icon: Icon, title, description, action }) {
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col items-center justify-center gap-3 bg-background/20 px-6 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-border bg-surface-card text-text-secondary">
        <Icon className="h-6 w-6" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="mx-auto max-w-sm text-sm text-text-secondary">{description}</p>
      </div>
      {action}
    </div>
  );
}

export function ConversationThread({
  conversation,
  loading,
  activeLoading,
  missing,
  messages,
  teammates,
  me,
  tags,
  canReply,
  replyDisabledReason,
  assignDisabledReason,
  closeDisabledReason,
  canTrackRead,
  menu,
  onMenuChange,
  onBack,
  onOpenContact,
  onSend,
  onAssign,
  onSnooze,
  onClose,
  onReopen,
  onPriority,
  onToggleRead,
  onToggleTag,
  onCreateTag,
  onCreateTicket,
}) {
  const scroller = useRef(null);

  // Keep the newest message in view — only when the message set grows, so scrolling up never fights the user.
  const lastMessageId = messages?.[messages.length - 1]?.id;
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lastMessageId, conversation?.id]);

  const backButton = onBack ? (
    <Button variant="outline" size="sm" className="border-border bg-surface-card lg:hidden" onClick={onBack}>
      <ArrowLeft /> Back to list
    </Button>
  ) : null;

  if (!conversation) {
    if (activeLoading) {
      return (
        <div className="flex h-full min-h-0 flex-1 items-center justify-center bg-background/20">
          <LogoLoading size={56} />
        </div>
      );
    }
    if (missing) {
      return (
        <CenteredNotice
          icon={MessageSquareOff}
          title="Conversation not found"
          description="It may have been deleted, or it belongs to another project."
          action={backButton}
        />
      );
    }
    return (
      <CenteredNotice
        icon={MessagesSquare}
        title="No conversation selected"
        description="Pick a conversation from the list to read the thread and reply."
      />
    );
  }

  const priority = PRIORITY_META[conversation.priority] || PRIORITY_META.Normal;
  const PriorityIcon = priority.icon;
  const closed = conversation.status === "Closed";
  const assignOpen = menu === "assign";
  const snoozeOpen = menu === "snooze";

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col bg-background/20">
      {/* Header (shrink-0) */}
      <div className="shrink-0 space-y-2 border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          {onBack ? (
            <Button variant="ghost" size="icon-sm" className="lg:hidden" aria-label="Back to list" onClick={onBack}>
              <ArrowLeft />
            </Button>
          ) : null}
          <h2 className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
            {conversation.subject || `Conversation with ${conversation.contactName}`}
          </h2>

          <div className="flex shrink-0 items-center gap-1">
            <Gated reason={canTrackRead ? null : "Sign in to track read state."}>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={conversation.unread ? "Mark as read" : "Mark as unread"}
                title={conversation.unread ? "Mark as read" : "Mark as unread"}
                disabled={!canTrackRead}
                onClick={() => onToggleRead?.(conversation)}
              >
                {conversation.unread ? <MailOpen /> : <Mail />}
              </Button>
            </Gated>

            {/* Assign (a) */}
            {assignDisabledReason ? (
              <Gated reason={assignDisabledReason}>
                <Button variant="outline" size="sm" disabled className="border-border bg-surface-card">
                  <UserPlus />
                  <span className="hidden max-w-[120px] truncate md:inline">{conversation.assignee || "Unassigned"}</span>
                </Button>
              </Gated>
            ) : (
              <DropdownMenu open={assignOpen} onOpenChange={(open) => onMenuChange?.(open ? "assign" : null)}>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="border-border bg-surface-card" aria-label="Assign (a)">
                    <UserPlus />
                    <span className="hidden max-w-[120px] truncate md:inline">{conversation.assignee || "Unassigned"}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="max-h-72 w-56 overflow-y-auto border-border bg-surface-subtle">
                  <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-text-tertiary">
                    Assign to
                  </DropdownMenuLabel>
                  {me && conversation.assigneeId !== me.id ? (
                    <DropdownMenuItem className="text-xs" onClick={() => onAssign?.(conversation, me)}>
                      <UserPlus /> Assign to me
                    </DropdownMenuItem>
                  ) : null}
                  {conversation.assigneeId ? (
                    <DropdownMenuItem className="text-xs" onClick={() => onAssign?.(conversation, null)}>
                      <UserMinus /> Unassign
                    </DropdownMenuItem>
                  ) : null}
                  <DropdownMenuSeparator className="bg-border" />
                  {teammates.length === 0 ? (
                    <p className="px-2 py-2 text-xs text-text-tertiary">No teammates yet</p>
                  ) : (
                    teammates.map((t) => (
                      <DropdownMenuItem
                        key={t.id}
                        className={cn("text-xs", conversation.assigneeId === t.id && "bg-surface-active")}
                        onClick={() => onAssign?.(conversation, t)}
                      >
                        <span className="truncate">{t.name || t.email || "Teammate"}</span>
                        {conversation.assigneeId === t.id ? <CircleDot className="ml-auto h-3 w-3" /> : null}
                      </DropdownMenuItem>
                    ))
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            {/* Snooze (s) */}
            {closeDisabledReason ? (
              <Gated reason={closeDisabledReason}>
                <Button variant="ghost" size="icon-sm" disabled aria-label="Snooze">
                  <AlarmClock />
                </Button>
              </Gated>
            ) : (
              <DropdownMenu open={snoozeOpen} onOpenChange={(open) => onMenuChange?.(open ? "snooze" : null)}>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-sm" aria-label="Snooze (s)" title="Snooze (s)">
                    <AlarmClock />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="border-border bg-surface-subtle">
                  <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-text-tertiary">
                    Snooze until
                  </DropdownMenuLabel>
                  {SNOOZE_PRESETS.map((preset) => (
                    <DropdownMenuItem key={preset.value} className="text-xs" onClick={() => onSnooze?.(conversation, preset.value)}>
                      <AlarmClock /> {preset.label}
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuItem className="text-xs" onClick={() => onSnooze?.(conversation, "custom")}>
                    <AlarmClock /> Custom…
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            {/* Close / reopen (e) */}
            <Gated reason={closeDisabledReason}>
              <Button
                variant="outline"
                size="sm"
                disabled={Boolean(closeDisabledReason)}
                className="border-border bg-surface-card"
                aria-label={closed ? "Reopen (e)" : "Close (e)"}
                onClick={() => (closed ? onReopen : onClose)?.(conversation)}
              >
                {closed ? <RotateCcw /> : <CheckCheck />}
                <span className="hidden sm:inline">{closed ? "Reopen" : "Close"}</span>
              </Button>
            </Gated>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label="More conversation actions">
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="border-border bg-surface-subtle">
                <DropdownMenuItem className="text-xs" onClick={() => onCreateTicket?.(conversation)}>
                  <TicketIcon /> Create ticket from thread
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <StatusPill status={conversation.status} map={CONVERSATION_STATUS_MAP} className="h-5 px-1.5 text-[10px]" />

          {/* Priority */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="xs"
                className={cn("h-5 gap-1 px-1 text-[11px] font-medium", priority.className)}
                aria-label={`Priority: ${priority.label}. Change priority`}
              >
                <PriorityIcon /> {priority.label}
                <ChevronDown className="text-text-tertiary" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="border-border bg-surface-subtle">
              <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-text-tertiary">
                Priority
              </DropdownMenuLabel>
              <DropdownMenuRadioGroup value={conversation.priority} onValueChange={(value) => onPriority?.(conversation, value)}>
                {PRIORITY_FILTER_OPTIONS.map((option) => {
                  const meta = PRIORITY_META[option.value];
                  const Icon = meta?.icon;
                  return (
                    <DropdownMenuRadioItem key={option.value} value={option.value} className="text-xs">
                      {Icon ? <Icon className={cn("h-3.5 w-3.5", meta.className)} /> : null}
                      {option.label}
                    </DropdownMenuRadioItem>
                  );
                })}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>

          <span className="truncate text-[11px] text-text-tertiary">
            {conversation.channel || "Chat"} · {conversation.contactName || "Unknown contact"}
          </span>

          <div className="flex min-w-0 flex-wrap items-center gap-1">
            {(conversation.tags || []).map((tag) => (
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
            <TagPicker
              tags={tags}
              selected={conversation.tags || []}
              onToggle={(tag) => onToggleTag?.(conversation, tag)}
              onCreate={(name) => onCreateTag?.(conversation, name)}
              align="start"
            >
              <Button variant="ghost" size="xs" className="h-5 px-1.5 text-[11px] text-text-secondary" aria-label="Edit tags">
                <Tag /> {(conversation.tags || []).length === 0 ? "Add tag" : null}
              </Button>
            </TagPicker>
          </div>

          {onOpenContact ? (
            <Button
              variant="ghost"
              size="xs"
              className="ml-auto h-5 px-1.5 text-[11px] text-text-secondary lg:hidden"
              onClick={onOpenContact}
              aria-label="Show contact details"
            >
              <PanelRight /> Contact
            </Button>
          ) : null}
        </div>
      </div>

      {/* Messages (flex-1, overflow-y-auto) */}
      <div ref={scroller} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <LogoLoading size={48} />
          </div>
        ) : messages.length === 0 ? (
          <p className="py-8 text-center text-sm text-text-secondary">No messages in this thread yet.</p>
        ) : (
          messages.map((message) => <MessageBubble key={message.id} message={message} />)
        )}
      </div>

      {/* Composer (shrink-0); keyed so a draft never leaks into another conversation */}
      <Composer
        key={conversation.id}
        teammates={teammates}
        me={me}
        disabled={!canReply}
        disabledReason={replyDisabledReason}
        onSend={onSend}
      />
    </div>
  );
}

export default ConversationThread;
