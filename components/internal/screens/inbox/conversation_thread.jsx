"use client";

// The presentational centre pane (spec §5.2): header actions, copilot summary, message stream and composer; InboxShell owns the mutations.

import { useEffect, useMemo, useRef } from "react";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  LogoLoading,
} from "@geiger/ui";
import {
  AlarmClock,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCheck,
  ChevronDown,
  CircleDot,
  Loader2,
  Mail,
  MailOpen,
  Merge,
  MessageSquareOff,
  MessagesSquare,
  MoreHorizontal,
  PanelRight,
  RotateCcw,
  Sparkles,
  Ticket as TicketIcon,
  UserMinus,
  UserPlus,
} from "lucide-react";

import { Gated } from "@/components/internal/shared/gated";
import { cn } from "@/lib/utils";
import MessageBubble from "./message_bubble";
import { Composer } from "./composer";
import { SlaTimer } from "./sla_timer";
import { SummaryPanel } from "./copilot";
import { useThreadCopilot } from "./use_thread_copilot";
import {
  SNOOZE_PRESETS,
  channelMeta,
  contactLabel,
  dayKey,
  formatClock,
  formatDayLabel,
  formatDayTime,
  formatWhen,
  initials,
} from "./constants";

// Consecutive messages from one author within this window share a header.
const GROUP_WINDOW_MS = 5 * 60 * 1000;

function CenteredNotice({ icon: Icon, title, description, action }) {
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-border bg-surface-card text-muted-foreground">
        <Icon className="h-6 w-6" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="mx-auto max-w-sm text-sm text-muted-foreground">{description}</p>
      </div>
      {action}
    </div>
  );
}

// Just the clock time when it's today, otherwise "Tue, Oct 22, 9:00 AM".
function snoozeLabel(value) {
  return dayKey(value) === dayKey(Date.now()) ? formatClock(value) : formatDayTime(value);
}

// Day dividers, the "started" event, then messages; same-author follow-ups are marked `grouped`.
function buildTimeline(conversation, messages) {
  const items = [];
  let lastDay = "";
  let previous = null;
  const divideAt = (at) => {
    const key = dayKey(at);
    if (!key || key === lastDay) return;
    lastDay = key;
    previous = null;
    items.push({ kind: "day", key: `day-${key}`, label: formatDayLabel(at) });
  };
  if (conversation?.createdAt) {
    divideAt(conversation.createdAt);
    items.push({ kind: "start", key: "start", at: conversation.createdAt });
  }
  for (const message of messages || []) {
    divideAt(message.createdAt);
    const grouped = Boolean(
      previous &&
        previous.authorRole === message.authorRole &&
        previous.authorName === message.authorName &&
        previous.messageType === message.messageType &&
        Date.parse(message.createdAt) - Date.parse(previous.createdAt) < GROUP_WINDOW_MS,
    );
    items.push({ kind: "message", key: message.id, message, grouped });
    previous = message;
  }
  return items;
}

export function ConversationThread({
  conversation,
  loading,
  activeLoading,
  missing,
  messages,
  teammates,
  me,
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
  onToggleRead,
  onCreateTicket,
  onMerge,
  onOpenConversation,
  macros,
  onResolveMacro,
  onRunMacro,
  onUpload,
}) {
  const scroller = useRef(null);
  const composerRef = useRef(null);
  const copilot = useThreadCopilot(conversation?.id ?? null, messages);

  // Keep the newest message in view — only when the message set grows, so scrolling up never fights the user.
  const lastMessageId = messages?.[messages.length - 1]?.id;
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lastMessageId, conversation?.id]);

  const timeline = useMemo(() => buildTimeline(conversation, messages), [conversation, messages]);
  const mentionNames = useMemo(() => teammates.map((t) => t.name).filter(Boolean), [teammates]);

  const backButton = onBack ? (
    <Button variant="outline" size="sm" className="border-border bg-surface-card lg:hidden" onClick={onBack}>
      <ArrowLeft /> Back to list
    </Button>
  ) : null;

  if (!conversation) {
    if (activeLoading) {
      return (
        <div className="flex h-full min-h-0 flex-1 items-center justify-center">
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

  const closed = conversation.status === "Closed";
  const snoozed = conversation.status === "Snoozed";
  const assignOpen = menu === "assign";
  const snoozeOpen = menu === "snooze";
  const contact = contactLabel(conversation);
  const channel = conversation.channel || "Chat";
  const ChannelIcon = channelMeta(channel).icon;
  const assignee = teammates.find((t) => t.id === conversation.assigneeId) ?? null;
  const assigneeName = assignee?.name || conversation.assignee || "";
  const summarizing = copilot.summary?.state === "loading";

  const assignTrigger = (
    <Button
      variant="outline"
      size="sm"
      disabled={Boolean(assignDisabledReason)}
      className="h-8 gap-2 border-border bg-surface-card pl-1.5 pr-2"
      aria-label={assigneeName ? `Assignee: ${assigneeName}. Change assignee (A)` : "Assign (A)"}
    >
      {assigneeName ? (
        <Avatar className="size-5">
          <AvatarImage src={assignee?.avatarUrl || undefined} alt="" />
          <AvatarFallback className="bg-surface-strong text-[9px] font-semibold text-foreground">
            {initials(assigneeName)}
          </AvatarFallback>
        </Avatar>
      ) : (
        <span className="flex size-5 items-center justify-center rounded-full border border-dashed border-border-strong text-muted-foreground">
          <UserPlus className="size-3" />
        </span>
      )}
      <span className="hidden max-w-[120px] truncate md:inline">{assigneeName || "Assign"}</span>
      <ChevronDown className="text-muted-foreground" />
    </Button>
  );

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      {/* Header (shrink-0) */}
      <div className="flex h-16 shrink-0 items-center gap-3 border-b border-border px-4 sm:gap-4 sm:px-5">
        {onBack ? (
          <Button variant="ghost" size="icon-sm" className="-ml-1 lg:hidden" aria-label="Back to list" onClick={onBack}>
            <ArrowLeft />
          </Button>
        ) : null}

        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex min-w-0 items-center gap-2">
            <h2 className="truncate text-[15px] font-semibold tracking-tight text-foreground">
              {conversation.subject || `Conversation with ${contact}`}
            </h2>
            {conversation.priority === "Urgent" ? (
              <span className="inline-flex h-5 shrink-0 items-center gap-1 rounded bg-red-400/10 px-1.5 text-[11px] font-medium text-red-300">
                <AlertTriangle className="size-[11px]" strokeWidth={2.4} />
                Urgent
              </span>
            ) : null}
            {snoozed ? (
              <span className="inline-flex h-5 shrink-0 items-center gap-1 rounded bg-amber-400/10 px-1.5 text-[11px] font-medium text-amber-300">
                <AlarmClock className="size-[11px]" strokeWidth={2.4} />
                {conversation.snoozedUntil ? `Snoozed until ${snoozeLabel(conversation.snoozedUntil)}` : "Snoozed"}
              </span>
            ) : null}
            {closed ? (
              <span className="inline-flex h-5 shrink-0 items-center gap-1 rounded bg-surface-strong px-1.5 text-[11px] font-medium text-muted-foreground">
                <CheckCheck className="size-[11px]" strokeWidth={2.4} />
                Closed
              </span>
            ) : null}
            <SlaTimer conversation={conversation} />
          </div>
          <p className="truncate text-xs text-muted-foreground">
            {contact} · {channel}
            {conversation.createdAt ? ` · Started ${formatWhen(conversation.createdAt)}` : ""}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {/* Assign (a) */}
          {assignDisabledReason ? (
            <Gated reason={assignDisabledReason}>{assignTrigger}</Gated>
          ) : (
            <DropdownMenu open={assignOpen} onOpenChange={(open) => onMenuChange?.(open ? "assign" : null)}>
              <DropdownMenuTrigger asChild>{assignTrigger}</DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="max-h-72 w-56 overflow-y-auto border-border bg-surface-subtle">
                <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
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
                  <p className="px-2 py-2 text-xs text-muted-foreground">No teammates yet</p>
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

          {/* Snooze (s) — nothing to snooze once closed */}
          {closed ? null : closeDisabledReason ? (
            <Gated reason={closeDisabledReason}>
              <Button variant="outline" size="icon-sm" disabled className="border-border bg-surface-card" aria-label="Snooze">
                <AlarmClock />
              </Button>
            </Gated>
          ) : (
            <DropdownMenu open={snoozeOpen} onOpenChange={(open) => onMenuChange?.(open ? "snooze" : null)}>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="icon-sm"
                  className="border-border bg-surface-card"
                  aria-label="Snooze (S)"
                  title="Snooze (S)"
                >
                  <AlarmClock />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="border-border bg-surface-subtle">
                <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
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

          {/* Close / reopen (e) — the one primary action */}
          <Gated reason={closeDisabledReason}>
            <Button
              size="sm"
              disabled={Boolean(closeDisabledReason)}
              className="font-semibold"
              aria-label={closed ? "Reopen conversation (E)" : "Close conversation (E)"}
              title={closed ? "Reopen (E)" : "Close (E)"}
              onClick={() => (closed ? onReopen : onClose)?.(conversation)}
            >
              {closed ? <RotateCcw /> : <Check />}
              <span className="hidden sm:inline">{closed ? "Reopen" : "Close"}</span>
            </Button>
          </Gated>

          {onOpenContact ? (
            <Button
              variant="ghost"
              size="icon-sm"
              className="lg:hidden"
              aria-label="Show conversation details"
              title="Details"
              onClick={onOpenContact}
            >
              <PanelRight />
            </Button>
          ) : null}

          {/* Summarize with AI — the panel opens under the header */}
          <Gated reason={replyDisabledReason}>
            <Button
              variant="ghost"
              size="icon-sm"
              disabled={Boolean(replyDisabledReason) || copilot.loading || summarizing}
              aria-label="Summarize conversation"
              title="Summarize conversation"
              onClick={() => void copilot.summarize()}
            >
              {summarizing ? <Loader2 className="animate-spin" /> : <Sparkles />}
            </Button>
          </Gated>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="More conversation actions">
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="border-border bg-surface-subtle">
              <DropdownMenuItem className="text-xs" disabled={!canTrackRead} onClick={() => onToggleRead?.(conversation)}>
                {conversation.unread ? <MailOpen /> : <Mail />}
                {conversation.unread ? "Mark as read" : "Mark as unread"}
              </DropdownMenuItem>
              <DropdownMenuItem className="text-xs" onClick={() => onCreateTicket?.(conversation)}>
                <TicketIcon /> Create ticket from thread
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-xs"
                disabled={Boolean(closeDisabledReason) || Boolean(conversation.mergedIntoId)}
                title={closeDisabledReason || undefined}
                onClick={() => onMerge?.(conversation)}
              >
                <Merge /> Merge into another conversation…
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {conversation.mergedIntoId ? (
        <div className="flex shrink-0 items-center gap-2 border-b border-border bg-surface-subtle px-4 py-2 text-xs text-muted-foreground sm:px-5">
          <Merge className="h-3.5 w-3.5 shrink-0" />
          <span className="min-w-0 flex-1 truncate">This conversation was merged into another one and closed.</span>
          <Button
            variant="ghost"
            size="xs"
            className="shrink-0"
            onClick={() => onOpenConversation?.(conversation.mergedIntoId)}
          >
            Open it <ArrowRight />
          </Button>
        </div>
      ) : null}

      {copilot.summary ? (
        <SummaryPanel
          summary={copilot.summary}
          status={copilot.status}
          canInsert={canReply}
          onInsert={() => {
            composerRef.current?.insertNote(copilot.summary.text, { model: copilot.summary.model });
            copilot.dismissSummary();
          }}
          onRetry={() => void copilot.summarize()}
          onDismiss={copilot.dismissSummary}
        />
      ) : null}

      {/* Messages (flex-1, overflow-y-auto) */}
      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto px-4 pb-2 pt-6 sm:px-6">
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <LogoLoading size={48} />
          </div>
        ) : messages.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No messages in this thread yet.</p>
        ) : (
          <div className="mx-auto flex max-w-[760px] flex-col gap-5">
            {timeline.map((item) =>
              item.kind === "day" ? (
                <div key={item.key} className="flex items-center gap-3" role="separator" aria-label={item.label}>
                  <span className="h-px flex-1 bg-surface-hover" />
                  <span className="text-xs font-medium text-muted-foreground">{item.label}</span>
                  <span className="h-px flex-1 bg-surface-hover" />
                </div>
              ) : item.kind === "start" ? (
                <p key={item.key} className="flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
                  <ChannelIcon className="h-3.5 w-3.5 shrink-0" />
                  {contact} started this conversation {channelMeta(channel).via} · {formatClock(item.at)}
                </p>
              ) : (
                <MessageBubble
                  key={item.key}
                  message={item.message}
                  grouped={item.grouped}
                  mentionNames={mentionNames}
                  translatable={canReply && !copilot.loading && copilot.translatable.has(item.message.id)}
                  translation={copilot.translations[item.message.id]}
                  aiStatus={copilot.translations[item.message.id]?.state === "unavailable" ? copilot.status : undefined}
                  onTranslate={copilot.translate}
                  onToggleOriginal={copilot.toggleOriginal}
                  onDismissTranslation={copilot.dismissTranslation}
                />
              ),
            )}
          </div>
        )}
      </div>

      {/* Composer (shrink-0); keyed so a draft never leaks into another conversation */}
      <Composer
        key={conversation.id}
        ref={composerRef}
        conversationId={conversation.id}
        teammates={teammates}
        me={me}
        recipient={contact}
        channel={channel}
        macros={macros}
        disabled={!canReply}
        disabledReason={replyDisabledReason}
        onSend={onSend}
        onResolveMacro={onResolveMacro}
        onRunMacro={onRunMacro}
        onUpload={onUpload}
      />
    </div>
  );
}

export default ConversationThread;
