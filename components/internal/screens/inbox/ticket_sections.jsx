"use client";

// Ticket editor nav + sections, plus the linked-conversations list and the picker that links more threads to a ticket.

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  ExternalLink,
  LayoutDashboard,
  Link2,
  MessagesSquare,
  ShieldAlert,
  SlidersHorizontal,
  Trash2,
  Unlink,
} from "lucide-react";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
  LogoLoading,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from "@geiger/ui";
import {
  EmptyState,
  Field,
  SearchInput,
  SectionCard,
  SettingRow,
  SettingsList,
  StatGrid,
  StatusPill,
} from "@/components/internal/shared/screen_kit";
import { listConversations } from "@/lib/supabase/comms";
import { formatRelativeTime } from "../overview/constants";
import {
  CONVERSATION_STATUS_MAP,
  TICKET_STATE_MAP,
  TICKET_STATE_OPTIONS,
  TICKET_TYPE_MAP,
  TICKET_TYPE_OPTIONS,
  ageInDays,
  formatDate,
} from "./constants";

// Radix Select can't hold an empty value, so "unassigned" stands in for null.
const UNASSIGNED = "unassigned";
const PICKER_LIMIT = 20;
const PICKER_DEBOUNCE_MS = 250;

export const NAV_GROUPS = [
  {
    group: null,
    items: [
      {
        key: "overview",
        label: "Overview",
        icon: LayoutDashboard,
        desc: "A snapshot of this ticket — where it sits, who owns it, and how old it is.",
      },
    ],
  },
  {
    group: "Ticket",
    items: [
      {
        key: "details",
        label: "Details",
        icon: SlidersHorizontal,
        desc: "Title, description and classification. Changes save automatically.",
      },
    ],
  },
  {
    group: "Links",
    items: [
      {
        key: "conversation",
        label: "Conversations",
        icon: MessagesSquare,
        desc: "The threads reporting this ticket. A tracker can span many of them.",
      },
    ],
  },
  {
    group: "Advanced",
    items: [
      {
        key: "advanced",
        label: "Advanced",
        icon: ShieldAlert,
        desc: "Resolution state and destructive actions for this ticket.",
      },
    ],
  },
];

function assigneeName(teammates, id) {
  if (!id) return "Unassigned";
  return teammates.find((t) => t.id === id)?.name || "Former teammate";
}

function initials(name) {
  return (name || "?")
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || "")
    .join("");
}

// ---- linked conversations ------------------------------------------------------

function ConversationLine({ conversation, onOpen, trailing }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5">
      <Avatar className="h-8 w-8 shrink-0">
        <AvatarImage src={conversation.contactAvatar || undefined} alt="" />
        <AvatarFallback className="text-xs">{initials(conversation.contactName)}</AvatarFallback>
      </Avatar>
      <button
        type="button"
        onClick={onOpen}
        disabled={!onOpen}
        className="group min-w-0 flex-1 text-left disabled:cursor-default"
      >
        <span className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-foreground group-enabled:group-hover:underline">
            {conversation.subject || "No subject"}
          </span>
          {conversation.isOrigin ? (
            <Badge variant="outline" className="shrink-0 text-[10px]">
              Origin
            </Badge>
          ) : null}
        </span>
        <span className="block truncate text-xs text-text-secondary">
          {[
            conversation.contactName,
            conversation.contactEmail,
            conversation.channel,
            conversation.lastMessageAt ? formatRelativeTime(conversation.lastMessageAt) : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </span>
      </button>
      <StatusPill
        status={conversation.status}
        map={CONVERSATION_STATUS_MAP}
        className="hidden shrink-0 sm:inline-flex"
      />
      {trailing}
    </div>
  );
}

// The ticket's threads with open/unlink per row; `conversations` is { loading, items }.
export function LinkedConversationsCard({
  conversations,
  onOpenConversation,
  onUnlink,
  onLinkRequest,
  title = "Linked conversations",
  description = "A tracker ticket spans many customer conversations — everyone reporting this issue links back to here.",
}) {
  const { loading, items } = conversations;
  const linkButton = onLinkRequest ? (
    <Button
      variant="outline"
      size="sm"
      className="border-border bg-transparent text-muted-foreground hover:bg-surface-active hover:text-foreground"
      onClick={onLinkRequest}
    >
      <Link2 className="h-3.5 w-3.5" /> Link conversation
    </Button>
  ) : null;

  return (
    <SectionCard title={title} description={description} action={linkButton}>
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <LogoLoading size={40} aria-label="Loading linked conversations" />
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={MessagesSquare}
          title="No linked conversations yet"
          description="Link the threads where customers reported this, so one update reaches all of them."
          action={linkButton}
          className="py-8"
        />
      ) : (
        <div className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface-subtle">
          {items.map((conversation) => (
            <ConversationLine
              key={conversation.id}
              conversation={conversation}
              onOpen={() => onOpenConversation(conversation.id)}
              trailing={
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Open ${conversation.subject || "conversation"} in the inbox`}
                    className="text-muted-foreground hover:bg-surface-active hover:text-foreground"
                    onClick={() => onOpenConversation(conversation.id)}
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </Button>
                  {onUnlink ? (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Unlink ${conversation.subject || "conversation"}`}
                      className="text-muted-foreground hover:bg-red-500/10 hover:text-red-400"
                      onClick={() => onUnlink(conversation)}
                    >
                      <Unlink className="h-3.5 w-3.5" />
                    </Button>
                  ) : null}
                </div>
              }
            />
          ))}
        </div>
      )}
    </SectionCard>
  );
}

// Search recent conversations and link them one by one; stays open so several can be linked in a row.
export function LinkConversationDialog({ open, onOpenChange, projectId, linkedIds, onLink }) {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState({ key: null, items: [] });
  const q = search.trim();
  const requestKey = `${projectId ?? ""}|${q}`;
  const loading = open && results.key !== requestKey;

  useEffect(() => {
    if (!open) return;
    let alive = true;
    const timer = setTimeout(
      () => {
        listConversations({
          projectId,
          filter: { search: q, sort: "newest" },
          limit: PICKER_LIMIT,
        }).then((rows) => {
          if (!alive) return;
          setResults({ key: requestKey, items: rows ?? [] });
          if (rows === null) toast.error("Couldn't load conversations.");
        });
      },
      q ? PICKER_DEBOUNCE_MS : 0,
    );
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [open, q, projectId, requestKey]);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setSearch("");
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Link conversations</DialogTitle>
          <DialogDescription>
            Search by subject or last message. Linked threads show up on this ticket and open straight into the inbox.
          </DialogDescription>
        </DialogHeader>
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search conversations…"
          expanded
        />
        <div className="max-h-[50vh] min-h-40 overflow-y-auto rounded-lg border border-border bg-surface-card">
          {loading ? (
            <div className="flex h-40 items-center justify-center">
              <LogoLoading size={36} aria-label="Loading conversations" />
            </div>
          ) : results.items.length === 0 ? (
            <EmptyState
              icon={MessagesSquare}
              title={q ? "No conversations match" : "No conversations yet"}
              description={q ? "Try a different word from the subject or last message." : undefined}
              className="py-10"
            />
          ) : (
            <div className="divide-y divide-border">
              {results.items.map((conversation) => {
                const linked = linkedIds.has(conversation.id);
                return (
                  <ConversationLine
                    key={conversation.id}
                    conversation={conversation}
                    trailing={
                      linked ? (
                        <span className="shrink-0 text-xs text-text-tertiary">Linked</span>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          className="shrink-0 border-border bg-transparent text-muted-foreground hover:bg-surface-active hover:text-foreground"
                          onClick={() => onLink(conversation)}
                        >
                          <Link2 className="h-3.5 w-3.5" /> Link
                        </Button>
                      )
                    }
                  />
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---- sections --------------------------------------------------------------------

function OverviewSection({
  ticket,
  teammates,
  conversations,
  onOpenConversation,
  onUnlink,
  onLinkRequest,
}) {
  const age = ageInDays(ticket.createdAt);
  const origin = conversations.items.find((c) => c.isOrigin);
  const stats = [
    { label: "Type", value: TICKET_TYPE_MAP[ticket.type]?.label || ticket.type },
    { label: "State", value: TICKET_STATE_MAP[ticket.state]?.label || ticket.state },
    { label: "Age", value: age == null ? "—" : `${age}d`, hint: "Since it was raised" },
    {
      label: "Linked threads",
      value: conversations.loading ? "…" : String(conversations.items.length),
      hint: "Conversations pointing here",
    },
  ];

  return (
    <div className="space-y-6">
      <StatGrid stats={stats} />
      <SectionCard
        title="Summary"
        description={ticket.description || "No description yet."}
      >
        <SettingsList>
          <SettingRow
            title="State"
            description="Where this ticket sits in the queue."
            control={<StatusPill status={ticket.state} map={TICKET_STATE_MAP} />}
          />
          <SettingRow
            title="Assignee"
            description="The teammate who owns the next step."
            control={
              <span className="text-sm text-text-secondary">
                {assigneeName(teammates, ticket.assigneeId)}
              </span>
            }
          />
          <SettingRow
            title="Origin conversation"
            description={
              ticket.conversationId
                ? origin
                  ? `${origin.subject || "No subject"} · ${origin.contactName}`
                  : "The thread this ticket was raised from."
                : "This ticket wasn't raised from a thread."
            }
            control={
              ticket.conversationId ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="border-border bg-transparent text-muted-foreground hover:bg-surface-active hover:text-foreground"
                  onClick={() => onOpenConversation(ticket.conversationId)}
                >
                  <ExternalLink className="h-3.5 w-3.5" /> Open
                </Button>
              ) : (
                <span className="text-xs text-text-tertiary">None</span>
              )
            }
          />
          <SettingRow
            title="Created"
            description={formatDate(ticket.createdAt) || "—"}
            control={
              <span className="text-xs text-text-secondary">
                Updated {formatDate(ticket.updatedAt) || "—"}
              </span>
            }
          />
        </SettingsList>
      </SectionCard>

      {/* A tracker's whole point is its linked threads, so they lead its overview too. */}
      {ticket.type === "tracker" ? (
        <LinkedConversationsCard
          conversations={conversations}
          onOpenConversation={onOpenConversation}
          onUnlink={onUnlink}
          onLinkRequest={onLinkRequest}
        />
      ) : null}
    </div>
  );
}

function DetailsSection({ ticket, teammates, onField, onImmediate }) {
  return (
    <div className="space-y-6">
      <SectionCard title="Ticket" description="Changes save automatically.">
        <div className="grid gap-4">
          <Field label="Title" htmlFor="ticket-title" hint="Shown on the queue row.">
            <Input
              id="ticket-title"
              value={ticket.title}
              onChange={(e) => onField({ title: e.target.value })}
              placeholder="Refund double charge"
              className="h-9 sm:max-w-lg"
            />
          </Field>
          <Field
            label="Description"
            htmlFor="ticket-description"
            hint="What needs doing, in the words the next teammate needs."
          >
            <Textarea
              id="ticket-description"
              value={ticket.description}
              onChange={(e) => onField({ description: e.target.value })}
              placeholder="Add the context an assignee would need…"
              rows={5}
            />
          </Field>
        </div>
      </SectionCard>

      <SectionCard
        title="Classification"
        description="Type drives which queue this shows up in; state drives its progress."
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Type" htmlFor="ticket-type">
            <Select
              value={ticket.type}
              onValueChange={(type) => onImmediate({ type })}
            >
              <SelectTrigger id="ticket-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TICKET_TYPE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="State" htmlFor="ticket-state">
            <Select
              value={ticket.state}
              onValueChange={(state) => onImmediate({ state })}
            >
              <SelectTrigger id="ticket-state">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TICKET_STATE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Assignee" htmlFor="ticket-assignee">
            <Select
              value={ticket.assigneeId || UNASSIGNED}
              onValueChange={(value) =>
                onImmediate({ assigneeId: value === UNASSIGNED ? null : value })
              }
            >
              <SelectTrigger id="ticket-assignee">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
                {teammates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name || t.email || "Teammate"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
      </SectionCard>
    </div>
  );
}

function ConversationSection({ conversations, onOpenConversation, onUnlink, onLinkRequest }) {
  return (
    <LinkedConversationsCard
      conversations={conversations}
      onOpenConversation={onOpenConversation}
      onUnlink={onUnlink}
      onLinkRequest={onLinkRequest}
    />
  );
}

function AdvancedSection({ ticket, onImmediate, onDelete }) {
  const resolved = ticket.state === "resolved";
  return (
    <div className="space-y-6">
      <SectionCard title="Resolution">
        <SettingsList>
          <SettingRow
            title="Resolved"
            description={
              resolved
                ? "This ticket is done and drops out of the open queue."
                : "Mark it resolved once the work is finished."
            }
            checked={resolved}
            onCheckedChange={(next) =>
              onImmediate({ state: next ? "resolved" : "in_progress" })
            }
          />
        </SettingsList>
      </SectionCard>

      <SectionCard
        title="Danger zone"
        description="Deleting removes this ticket from the queue. Linked conversations keep their history."
      >
        <Button
          type="button"
          className="bg-red-500/90 text-white hover:bg-red-500"
          onClick={onDelete}
        >
          <Trash2 className="h-4 w-4" /> Delete ticket
        </Button>
      </SectionCard>
    </div>
  );
}

export const SECTIONS = {
  overview: OverviewSection,
  details: DetailsSection,
  conversation: ConversationSection,
  advanced: AdvancedSection,
};
