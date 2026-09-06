"use client";

// Section bodies for the contact (person) editor. The Overview pairs the
// record (identity, company, tags, segments, subscription) with the Recent
// Activities rail; Timeline is the unified lifelong thread; Conversations and
// Tickets are the linked queues; Notes keeps notes/tasks/files; Attributes
// holds the custom data model.

import { useMemo, useState } from "react";
import {
  AtSign,
  Building2,
  Check,
  Globe,
  History,
  IdCard,
  Languages,
  ListChecks,
  Mail,
  MapPin,
  MessagesSquare,
  Phone,
  Plus,
  SlidersHorizontal,
  StickyNote,
  Tags as TagsIcon,
  Ticket as TicketIcon,
  Trash2,
} from "lucide-react";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Badge,
  Button,
  Checkbox,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Textarea,
} from "@geiger/ui";
import {
  DataTable,
  EmptyState,
  Field,
  SectionCard,
  SettingRow,
  SettingsList,
  StatGrid,
  StatusPill,
} from "@/components/internal/shared/screen_kit";
import { cn } from "@/lib/utils";
import {
  DEFAULT_SEGMENTS,
  LIFECYCLE_MAP,
  TIMELINE_META,
  buildTimeline,
  channelIcon,
  formatDate,
  formatDateTime,
  formatRelativeTime,
  initialsOf,
  personMatchesSegment,
} from "./constants";

export const NAV_GROUPS = [
  {
    group: null,
    items: [
      {
        key: "overview",
        label: "Overview",
        icon: IdCard,
        desc: "The whole record — identity, company, tags, segments and recent activity.",
      },
    ],
  },
  {
    group: "History",
    items: [
      {
        key: "timeline",
        label: "Timeline",
        icon: History,
        desc: "One lifelong thread across every channel — no per-ticket fragmentation.",
      },
      {
        key: "conversations",
        label: "Conversations",
        icon: MessagesSquare,
        desc: "Every thread this person has written in.",
      },
      {
        key: "tickets",
        label: "Tickets",
        icon: TicketIcon,
        desc: "Customer, back-office and tracker tickets linked to them.",
      },
    ],
  },
  {
    group: "Workspace",
    items: [
      {
        key: "notes",
        label: "Notes & tasks",
        icon: StickyNote,
        desc: "Internal notes, follow-up tasks and shared files.",
      },
      {
        key: "attributes",
        label: "Attributes",
        icon: SlidersHorizontal,
        desc: "Custom fields on this contact record.",
      },
    ],
  },
];

const INPUT_CLASS = "h-9 sm:max-w-sm";

function tagLabel(t) {
  return typeof t === "string" ? t : t.name || "";
}

// Custom segments live in localStorage per project (there is no segments
// table yet); the editor reads the same key so membership agrees.
function loadCustomSegments(projectId) {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(
      `comms:segments:${projectId || "default"}`,
    );
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// ---- overview ----------------------------------------------------------------

function OverviewSection({
  person,
  conversations,
  tickets,
  allTags,
  segments,
  onField,
  onToggleTag,
  onToggleSubscription,
  onGoto,
}) {
  const timeline = useMemo(
    () => buildTimeline({ person, conversations, tickets }),
    [person, conversations, tickets],
  );
  const memberSegments = useMemo(() => {
    const custom =
      typeof window === "undefined" ? [] : loadCustomSegments(person.projectId);
    return [...DEFAULT_SEGMENTS, ...custom, ...(segments || [])].filter((s) =>
      personMatchesSegment(person, s),
    );
  }, [person, segments]);

  const personTags = (person.tags || []).map(tagLabel).filter(Boolean);
  const convoTags = useMemo(() => {
    const set = new Map();
    for (const c of conversations || []) {
      for (const t of c.tags || []) {
        const label = tagLabel(t);
        if (label) set.set(label.toLowerCase(), { label, color: t.color });
      }
    }
    return [...set.values()];
  }, [conversations]);

  const open = (conversations || []).filter(
    (c) => (c.status || "").toLowerCase() !== "closed",
  ).length;

  const stats = [
    { label: "Conversations", value: String(conversations.length) },
    { label: "Open", value: String(open) },
    { label: "Tickets", value: String(tickets.length) },
    { label: "Notes", value: String((person.notes || []).length) },
  ];

  return (
    <div className="space-y-6">
      <StatGrid stats={stats} />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-6">
          {/* Personal info */}
          <SectionCard
            title="Personal info"
            description="How this person is identified across the workspace."
          >
            <div className="flex items-center gap-4">
              <Avatar className="h-12 w-12 shrink-0">
                {person.avatarUrl ? (
                  <AvatarImage src={person.avatarUrl} alt={person.name} />
                ) : null}
                <AvatarFallback className="bg-surface-card text-sm text-text-secondary">
                  {initialsOf(person.name, person.email)}
                </AvatarFallback>
              </Avatar>
              <div className="grid flex-1 gap-3 sm:grid-cols-2">
                <Field label="Name" htmlFor="person-name">
                  <Input
                    id="person-name"
                    value={person.name || ""}
                    onChange={(e) => onField("name", e.target.value)}
                    placeholder="Full name"
                  />
                </Field>
                <Field label="Title" htmlFor="person-title">
                  <Input
                    id="person-title"
                    value={person.title || ""}
                    onChange={(e) => onField("title", e.target.value)}
                    placeholder="Head of Support"
                  />
                </Field>
              </div>
            </div>
            <div className="mt-4">
              <SettingsList>
                <SettingRow
                  title="Email"
                  description={person.email || "No email on file"}
                  control={
                    person.email ? (
                      <a
                        href={`mailto:${person.email}`}
                        className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
                      >
                        <Mail className="h-3 w-3" /> Write
                      </a>
                    ) : null
                  }
                />
                <SettingRow
                  title="Phone"
                  description={person.phone || "—"}
                  control={
                    <Input
                      value={person.phone || ""}
                      onChange={(e) => onField("phone", e.target.value)}
                      placeholder="+1 …"
                      className="h-8 w-40 text-xs"
                    />
                  }
                />
                <SettingRow
                  title="Lifecycle"
                  description="Where they sit in the customer journey."
                  control={
                    <Select
                      value={person.lifecycle || "lead"}
                      onValueChange={(v) => onField("lifecycle", v)}
                    >
                      <SelectTrigger className="h-8 w-36">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(LIFECYCLE_MAP).map(([value, meta]) => (
                          <SelectItem key={value} value={value}>
                            {meta.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  }
                />
                <SettingRow
                  title="Owner"
                  description={person.owner || "Unassigned"}
                  control={
                    <Input
                      value={person.owner || ""}
                      onChange={(e) => onField("owner", e.target.value)}
                      placeholder="Teammate"
                      className="h-8 w-40 text-xs"
                    />
                  }
                />
              </SettingsList>
            </div>
          </SectionCard>

          {/* Contact points */}
          <SectionCard title="Contact points" bodyPadding={false}>
            <SettingsList>
              <DetailLine
                icon={MapPin}
                label="Location"
                value={person.location}
                placeholder="City, Country"
                onChange={(v) => onField("location", v)}
              />
              <DetailLine
                icon={Globe}
                label="Timezone"
                value={person.timezone}
                placeholder="PT (UTC−8)"
                onChange={(v) => onField("timezone", v)}
              />
              <DetailLine
                icon={Languages}
                label="Language"
                value={person.language}
                placeholder="English"
                onChange={(v) => onField("language", v)}
              />
              <DetailLine
                icon={Building2}
                label="Company"
                value={person.company}
                placeholder="Company"
                onChange={(v) => onField("company", v)}
              />
            </SettingsList>
          </SectionCard>

          {/* Tags */}
          <SectionCard
            title="Tags"
            description="Direct tags plus tags inherited from their conversations."
            action={
              <TagPicker
                allTags={allTags}
                active={personTags}
                onToggle={onToggleTag}
              />
            }
          >
            <div className="flex flex-wrap gap-1.5">
              {personTags.length === 0 ? (
                <span className="text-sm text-text-tertiary">No tags yet</span>
              ) : (
                personTags.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => onToggleTag(t)}
                    title="Remove tag"
                    className="rounded-full border border-border bg-surface-hover px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:border-red-400/40 hover:text-red-300"
                  >
                    {t}
                  </button>
                ))
              )}
            </div>
            {convoTags.length ? (
              <div className="mt-3 border-t border-border pt-3">
                <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-text-tertiary">
                  From conversations
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {convoTags.map((t) => (
                    <Badge key={t.label} variant="outline">
                      {t.label}
                    </Badge>
                  ))}
                </div>
              </div>
            ) : null}
          </SectionCard>

          {/* Segments */}
          <SectionCard
            title="Segments"
            description="Every audience this person currently qualifies for."
          >
            {memberSegments.length ? (
              <div className="flex flex-wrap gap-1.5">
                {memberSegments.map((s) => (
                  <span
                    key={s.id}
                    className="rounded-full border border-violet-400/30 bg-violet-400/10 px-2.5 py-1 text-xs font-medium text-violet-200"
                  >
                    {s.name}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-sm text-text-tertiary">
                Not in any segment yet.
              </p>
            )}
          </SectionCard>

          {/* Subscription */}
          <SectionCard title="Subscription">
            <SettingsList>
              <SettingRow
                title="Email"
                description={
                  person.subscribedEmail === false
                    ? "Opted out — excluded from campaigns."
                    : "Subscribed to email."
                }
                control={
                  <Switch
                    checked={person.subscribedEmail !== false}
                    onCheckedChange={(v) => onToggleSubscription("email", v)}
                  />
                }
              />
              <SettingRow
                title="SMS"
                description={
                  person.subscribedSms
                    ? "Subscribed to SMS."
                    : "Not on any SMS list yet."
                }
                control={
                  <Switch
                    checked={!!person.subscribedSms}
                    onCheckedChange={(v) => onToggleSubscription("sms", v)}
                  />
                }
              />
            </SettingsList>
          </SectionCard>
        </div>

        {/* Recent activities rail */}
        <div className="min-w-0">
          <SectionCard
            title="Recent activities"
            description="Latest events on the lifelong timeline."
            action={
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-foreground"
                onClick={() => onGoto("timeline")}
              >
                View all
              </Button>
            }
          >
            {timeline.length ? (
              <ol className="relative space-y-5 border-l border-border pl-5">
                {timeline.slice(0, 8).map((e) => (
                  <TimelineDot key={e.id} event={e} compact />
                ))}
              </ol>
            ) : (
              <EmptyState
                icon={History}
                title="No activity yet"
                description="Conversations, tickets and notes land here."
              />
            )}
          </SectionCard>
        </div>
      </div>
    </div>
  );
}

function DetailLine({ icon: Icon, label, value, placeholder, onChange }) {
  return (
    <div className="flex items-center justify-between gap-3 px-5 py-3">
      <span className="inline-flex shrink-0 items-center gap-1.5 text-sm text-text-secondary">
        <Icon className="h-3.5 w-3.5 text-text-tertiary" /> {label}
      </span>
      <Input
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-8 max-w-52 text-right text-xs"
      />
    </div>
  );
}

function TagPicker({ allTags, active, onToggle }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const names = [...new Set([...(allTags || []).map(tagLabel), ...active])].filter(Boolean);
  return (
    <div className="relative">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="border-border bg-transparent text-muted-foreground hover:bg-surface-active hover:text-foreground"
        onClick={() => setOpen((o) => !o)}
      >
        <Plus className="h-3.5 w-3.5" /> Add
      </Button>
      {open ? (
        <div className="absolute right-0 z-20 mt-2 w-56 rounded-xl border border-border bg-surface-subtle p-2 shadow-xl">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="New tag…"
            className="mb-2 h-8 text-xs"
            onKeyDown={(e) => {
              if (e.key === "Enter" && draft.trim()) {
                onToggle(draft.trim());
                setDraft("");
              }
            }}
          />
          <div className="max-h-48 overflow-y-auto">
            {names.length === 0 ? (
              <p className="px-2 py-2 text-xs text-text-tertiary">
                Type a name and hit Enter.
              </p>
            ) : (
              names.map((n) => {
                const on = active.some(
                  (a) => a.toLowerCase() === n.toLowerCase(),
                );
                return (
                  <button
                    key={n}
                    type="button"
                    onClick={() => onToggle(n)}
                    className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-xs text-foreground transition-colors hover:bg-surface-active"
                  >
                    {n}
                    {on ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : null}
                  </button>
                );
              })
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function TimelineDot({ event, compact }) {
  const meta = TIMELINE_META[event.kind] || TIMELINE_META.person;
  const Icon = meta.icon;
  return (
    <li className="relative">
      <span className="absolute -left-8 top-0 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-surface-card">
        <Icon className={cn("h-3 w-3", meta.tone)} />
      </span>
      <p className="text-sm font-medium text-foreground">{event.title}</p>
      {event.body && !compact ? (
        <p className="mt-0.5 line-clamp-3 text-sm text-text-secondary">{event.body}</p>
      ) : event.body ? (
        <p className="mt-0.5 line-clamp-2 text-xs text-text-secondary">{event.body}</p>
      ) : null}
      <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[11px] text-text-tertiary">
        <span className="capitalize">{meta.label}</span>
        {event.meta ? <span>· {event.meta}</span> : null}
        <span>· {formatRelativeTime(event.at)}</span>
        <span>· {formatDateTime(event.at)}</span>
      </p>
    </li>
  );
}

// ---- timeline -----------------------------------------------------------------

function TimelineSection({ person, conversations, tickets }) {
  const [kind, setKind] = useState("all");
  const timeline = useMemo(
    () => buildTimeline({ person, conversations, tickets }),
    [person, conversations, tickets],
  );
  const rows = timeline.filter((e) => kind === "all" || e.kind === kind);
  return (
    <div className="space-y-6">
      <SectionCard
        title="Unified timeline"
        description="One continuous thread across every channel — the record is the person, not the ticket."
        action={
          <div className="flex gap-1.5">
            {["all", "conversation", "ticket", "note", "task"].map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-xs font-medium capitalize transition-colors",
                  kind === k
                    ? "border-border-strong bg-surface-card text-foreground"
                    : "border-border text-text-tertiary hover:text-foreground",
                )}
              >
                {k === "all" ? "All" : `${k}s`}
              </button>
            ))}
          </div>
        }
      >
        {rows.length ? (
          <ol className="relative space-y-6 border-l border-border pl-6">
            {rows.map((e) => (
              <TimelineDot key={e.id} event={e} />
            ))}
          </ol>
        ) : (
          <EmptyState
            icon={History}
            title="Nothing here yet"
            description="Activity of this kind lands on the timeline automatically."
          />
        )}
      </SectionCard>
    </div>
  );
}

// ---- conversations ---------------------------------------------------------------

function ConversationsSection({ conversations, onOpenConversation }) {
  const columns = [
    {
      key: "subject",
      header: "Conversation",
      render: (row) => {
        const Icon = channelIcon(row.channel);
        return (
          <div className="flex min-w-0 items-center gap-2">
            <Icon className="h-4 w-4 shrink-0 text-text-tertiary" />
            <div className="min-w-0">
              <p className="truncate font-medium text-foreground">
                {row.subject || "Conversation"}
              </p>
              {row.preview ? (
                <p className="truncate text-xs text-text-secondary">{row.preview}</p>
              ) : null}
            </div>
          </div>
        );
      },
    },
    {
      key: "status",
      header: "Status",
      render: (row) => (
        <span className="text-sm text-text-secondary">{row.status || "Open"}</span>
      ),
    },
    {
      key: "updated",
      header: "Last message",
      render: (row) => (
        <span className="whitespace-nowrap text-sm text-text-secondary">
          {formatRelativeTime(row.lastMessageAt || row.createdAt)}
        </span>
      ),
    },
  ];
  return (
    <SectionCard
      title={`Conversations (${conversations.length})`}
      description="Every thread this person has written in, newest first."
      bodyPadding={conversations.length > 0}
    >
      {conversations.length ? (
        <DataTable
          columns={columns}
          data={[...conversations].sort(
            (a, b) =>
              new Date(b.lastMessageAt || b.createdAt) -
              new Date(a.lastMessageAt || a.createdAt),
          )}
          getRowKey={(row) => row.id}
          onRowClick={(row) => onOpenConversation?.(row.id)}
        />
      ) : (
        <EmptyState
          icon={MessagesSquare}
          title="No conversations yet"
          description="Threads they start appear here automatically."
        />
      )}
    </SectionCard>
  );
}

// ---- tickets -------------------------------------------------------------------

function TicketsSection({ tickets, onOpenTicket }) {
  const columns = [
    {
      key: "title",
      header: "Ticket",
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-foreground">{row.title}</p>
          {row.description ? (
            <p className="truncate text-xs text-text-secondary">{row.description}</p>
          ) : null}
        </div>
      ),
    },
    {
      key: "state",
      header: "State",
      render: (row) => (
        <span className="text-sm capitalize text-text-secondary">
          {(row.state || "submitted").replace("_", " ")}
        </span>
      ),
    },
    {
      key: "updated",
      header: "Updated",
      render: (row) => (
        <span className="whitespace-nowrap text-sm text-text-secondary">
          {formatRelativeTime(row.updatedAt || row.createdAt)}
        </span>
      ),
    },
  ];
  return (
    <SectionCard
      title={`Tickets (${tickets.length})`}
      description="Linked through their conversations."
      bodyPadding={tickets.length > 0}
    >
      {tickets.length ? (
        <DataTable
          columns={columns}
          data={tickets}
          getRowKey={(row) => row.id}
          onRowClick={(row) => onOpenTicket?.(row.id)}
        />
      ) : (
        <EmptyState
          icon={TicketIcon}
          title="No tickets yet"
          description="Create one from the header to track work for this person."
        />
      )}
    </SectionCard>
  );
}

// ---- notes & tasks ---------------------------------------------------------------

function NotesSection({ person, onAddNote, onDeleteNote, onAddTask, onToggleTask, onDeleteTask }) {
  const [tab, setTab] = useState("notes");
  const [noteDraft, setNoteDraft] = useState("");
  const [taskDraft, setTaskDraft] = useState("");
  const files = useMemo(() => {
    const out = [];
    return out;
  }, []);

  const tabs = [
    { key: "notes", label: `Notes (${(person.notes || []).length})`, icon: StickyNote },
    { key: "tasks", label: `Tasks (${(person.tasks || []).length})`, icon: ListChecks },
    { key: "files", label: `Files (${files.length})`, icon: AtSign },
  ];

  return (
    <SectionCard
      title="Notes & tasks"
      description="Internal only — never shown to the contact."
    >
      <div className="mb-4 flex gap-1.5 border-b border-border pb-3">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
              tab === t.key
                ? "bg-surface-card text-foreground"
                : "text-text-secondary hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "notes" ? (
        <div className="space-y-4">
          <div className="flex flex-col gap-2">
            <Textarea
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              placeholder="Add a note…"
              rows={3}
            />
            <div className="flex justify-end">
              <Button
                type="button"
                size="sm"
                className="bg-primary text-primary-foreground hover:bg-primary/90"
                disabled={!noteDraft.trim()}
                onClick={() => {
                  onAddNote(noteDraft.trim());
                  setNoteDraft("");
                }}
              >
                Add note
              </Button>
            </div>
          </div>
          {(person.notes || []).length === 0 ? (
            <EmptyState
              icon={StickyNote}
              title="There are no notes"
              description="Context the next agent will thank you for."
            />
          ) : (
            <ol className="space-y-3">
              {(person.notes || []).map((n) => (
                <li
                  key={n.id}
                  className="rounded-xl border border-border bg-surface-subtle p-3.5"
                >
                  <p className="text-sm text-foreground">{n.body}</p>
                  <p className="mt-1.5 flex items-center justify-between text-[11px] text-text-tertiary">
                    <span>
                      {n.author || "Teammate"} · {formatRelativeTime(n.createdAt)}
                    </span>
                    <button
                      type="button"
                      onClick={() => onDeleteNote(n.id)}
                      className="inline-flex items-center gap-1 transition-colors hover:text-red-300"
                    >
                      <Trash2 className="h-3 w-3" /> Delete
                    </button>
                  </p>
                </li>
              ))}
            </ol>
          )}
        </div>
      ) : null}

      {tab === "tasks" ? (
        <div className="space-y-4">
          <div className="flex gap-2">
            <Input
              value={taskDraft}
              onChange={(e) => setTaskDraft(e.target.value)}
              placeholder="Add a task…"
              className="flex-1"
              onKeyDown={(e) => {
                if (e.key === "Enter" && taskDraft.trim()) {
                  onAddTask(taskDraft.trim());
                  setTaskDraft("");
                }
              }}
            />
            <Button
              type="button"
              size="sm"
              className="bg-primary text-primary-foreground hover:bg-primary/90"
              disabled={!taskDraft.trim()}
              onClick={() => {
                onAddTask(taskDraft.trim());
                setTaskDraft("");
              }}
            >
              <Plus className="h-4 w-4" /> Add
            </Button>
          </div>
          {(person.tasks || []).length === 0 ? (
            <EmptyState
              icon={ListChecks}
              title="No open tasks"
              description="Follow-ups for this person land here."
            />
          ) : (
            <ol className="space-y-2">
              {(person.tasks || []).map((t) => (
                <li
                  key={t.id}
                  className="flex items-center gap-3 rounded-xl border border-border bg-surface-subtle px-3.5 py-2.5"
                >
                  <Checkbox checked={!!t.done} onCheckedChange={() => onToggleTask(t.id)} />
                  <span
                    className={cn(
                      "flex-1 text-sm",
                      t.done ? "text-text-tertiary line-through" : "text-foreground",
                    )}
                  >
                    {t.title}
                  </span>
                  <span className="text-[11px] text-text-tertiary">
                    {t.dueAt ? formatDate(t.dueAt) : ""}
                  </span>
                  <button
                    type="button"
                    onClick={() => onDeleteTask(t.id)}
                    className="text-text-tertiary transition-colors hover:text-red-300"
                    aria-label="Delete task"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ol>
          )}
        </div>
      ) : null}

      {tab === "files" ? (
        <EmptyState
          icon={AtSign}
          title="No files yet"
          description="Attachments shared in conversations appear here."
        />
      ) : null}
    </SectionCard>
  );
}

// ---- attributes -------------------------------------------------------------------

function AttributesSection({ person, onField, onCustom, onDeleteCustom }) {
  const [keyDraft, setKeyDraft] = useState("");
  const [valueDraft, setValueDraft] = useState("");
  const custom = person.custom || {};
  return (
    <div className="space-y-6">
      <SectionCard
        title="Standard attributes"
        description="Synced from conversations and integrations where available."
      >
        <SettingsList>
          <SettingRow title="Email" description={person.email || "—"} />
          <SettingRow title="Phone" description={person.phone || "—"} />
          <SettingRow
            title="Company"
            description={person.company || "—"}
            control={
              <span className="text-xs text-text-secondary">{person.website || ""}</span>
            }
          />
          <SettingRow
            title="Created"
            description={formatDateTime(person.createdAt)}
            control={
              <span className="text-xs text-text-secondary">
                {formatRelativeTime(person.createdAt)}
              </span>
            }
          />
          <SettingRow
            title="Last seen"
            description={formatDateTime(person.updatedAt)}
            control={
              <span className="text-xs text-text-secondary">
                {formatRelativeTime(person.updatedAt)}
              </span>
            }
          />
        </SettingsList>
      </SectionCard>

      <SectionCard
        title="Custom attributes"
        description="Workspace-specific fields — plan, seats, anything the business tracks."
      >
        {Object.keys(custom).length === 0 ? (
          <EmptyState
            icon={TagsIcon}
            title="No custom attributes"
            description="Add the first field below."
          />
        ) : (
          <div className="mb-4">
            <SettingsList>
              {Object.entries(custom).map(([k, v]) => (
                <SettingRow
                  key={k}
                  title={k}
                  control={
                    <span className="flex items-center gap-2">
                      <Input
                        value={String(v ?? "")}
                        onChange={(e) => onCustom(k, e.target.value)}
                        className="h-8 w-40 text-xs"
                      />
                      <button
                        type="button"
                        onClick={() => onDeleteCustom(k)}
                        className="text-text-tertiary transition-colors hover:text-red-300"
                        aria-label={`Delete ${k}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  }
                />
              ))}
            </SettingsList>
          </div>
        )}
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={keyDraft}
            onChange={(e) => setKeyDraft(e.target.value)}
            placeholder="Field name…"
            className="h-9 flex-1"
          />
          <Input
            value={valueDraft}
            onChange={(e) => setValueDraft(e.target.value)}
            placeholder="Value…"
            className="h-9 flex-1"
          />
          <Button
            type="button"
            variant="outline"
            className="border-border bg-transparent text-muted-foreground hover:bg-surface-active hover:text-foreground"
            disabled={!keyDraft.trim()}
            onClick={() => {
              onCustom(keyDraft.trim(), valueDraft);
              setKeyDraft("");
              setValueDraft("");
            }}
          >
            <Plus className="h-4 w-4" /> Add field
          </Button>
        </div>
      </SectionCard>
    </div>
  );
}

export const SECTIONS = {
  overview: OverviewSection,
  timeline: TimelineSection,
  conversations: ConversationsSection,
  tickets: TicketsSection,
  notes: NotesSection,
  attributes: AttributesSection,
};
