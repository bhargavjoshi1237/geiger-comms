"use client";

// Section nav + bodies for the ticket editor. Mirrors the channels editor:
// NAV_GROUPS drives the right-hand nav, SECTIONS maps a key to its body.

import {
  ExternalLink,
  LayoutDashboard,
  MessagesSquare,
  ShieldAlert,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";
import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from "@geiger/ui";
import {
  Field,
  SectionCard,
  SettingRow,
  SettingsList,
  StatGrid,
  StatusPill,
} from "@/components/internal/shared/screen_kit";
import {
  TICKET_STATE_MAP,
  TICKET_STATE_OPTIONS,
  TICKET_TYPE_MAP,
  TICKET_TYPE_OPTIONS,
  ageInDays,
  formatDate,
} from "./constants";

// Radix Select can't hold an empty value, so "unassigned" stands in for null.
const UNASSIGNED = "unassigned";

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
        label: "Conversation",
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
  return teammates.find((t) => t.id === id)?.name || "Unknown teammate";
}

function OverviewSection({ ticket, teammates, linkedIds, onOpenConversation }) {
  const age = ageInDays(ticket.createdAt);
  const stats = [
    { label: "Type", value: TICKET_TYPE_MAP[ticket.type]?.label || ticket.type },
    { label: "State", value: TICKET_STATE_MAP[ticket.state]?.label || ticket.state },
    { label: "Age", value: age == null ? "—" : `${age}d`, hint: "Since it was raised" },
    { label: "Linked threads", value: String(linkedIds.length), hint: "Conversations pointing here" },
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
            description={assigneeName(teammates, ticket.assigneeId)}
            control={<StatusPill status={ticket.type} map={TICKET_TYPE_MAP} />}
          />
          <SettingRow
            title="Linked conversation"
            description={
              ticket.conversationId
                ? "The thread this ticket was raised from."
                : "This ticket isn't attached to a thread."
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

function ConversationSection({ ticket, linkedIds, onOpenConversation }) {
  const ids = linkedIds.length
    ? linkedIds
    : ticket.conversationId
      ? [ticket.conversationId]
      : [];

  return (
    <SectionCard
      title="Linked conversations"
      description="A tracker ticket spans many customer conversations — everyone reporting this issue links back to here."
    >
      <div className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface-subtle">
        {ids.length === 0 ? (
          <p className="px-3 py-4 text-sm text-text-secondary">
            No linked conversations yet.
          </p>
        ) : (
          ids.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => onOpenConversation(id)}
              className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-text-secondary transition-colors hover:bg-surface-hover hover:text-foreground"
            >
              <MessagesSquare className="h-4 w-4 shrink-0 text-text-tertiary" />
              <span className="font-mono text-xs text-text-tertiary">
                {id.slice(0, 8)}
              </span>
              <span className="truncate">Open linked conversation</span>
              <ExternalLink className="ml-auto h-3.5 w-3.5 shrink-0" />
            </button>
          ))
        )}
      </div>
    </SectionCard>
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
