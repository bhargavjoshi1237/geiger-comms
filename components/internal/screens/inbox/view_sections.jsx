"use client";

// Saved-view editor nav + sections (inbox spec §6), plus the Views-only lookups and the §3.3 filter builder shared by the create dialog and the editor.

import {
  LayoutDashboard,
  ListFilter,
  ShieldAlert,
  Trash2,
  Users,
} from "lucide-react";
import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
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
  CHANNEL_FILTER_OPTIONS,
  PRIORITY_FILTER_OPTIONS,
  SORT_OPTIONS,
  STATUS_FILTER_OPTIONS,
} from "./constants";

// ---- lookups ----------------------------------------------------------------

export const SHARED_FILTER_OPTIONS = [
  { value: "all", label: "All views" },
  { value: "mine", label: "Owned by me" },
  { value: "shared", label: "Shared" },
  { value: "private", label: "Private" },
];

export const VIEW_SHARED_MAP = {
  shared: { label: "Shared", variant: "success", dotClass: "bg-emerald-400" },
  private: { label: "Private", variant: "neutral", dotClass: "bg-slate-400" },
};

export const sharedKey = (view) => (view?.shared ? "shared" : "private");

export const sortLabel = (sort) =>
  SORT_OPTIONS.find((o) => o.value === sort)?.label ?? sort ?? "Newest activity";

// The empty §3.3 filter a new view starts from (sort lives on the view row, not in the filter).
export const EMPTY_VIEW_FILTER = {
  status: [],
  channel: [],
  priority: [],
  channelId: null,
  assignee: null,
  tagIds: [],
  unread: null,
  search: "",
};

// Normalises a builder filter for storage: trimmed search, arrays kept arrays, unset keys null.
export function cleanFilter(filter = {}) {
  const f = { ...EMPTY_VIEW_FILTER, ...filter };
  return {
    status: f.status ?? [],
    channel: f.channel ?? [],
    priority: f.priority ?? [],
    channelId: f.channelId || null,
    assignee: f.assignee || null,
    tagIds: f.tagIds ?? [],
    unread: f.unread ? true : null,
    search: (f.search || "").trim(),
  };
}

export function formatDate(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// "You" for the current teammate, the teammate's name otherwise; legacy ownerless views read as the workspace's.
export function ownerLabel(view, { teammates = [], meId } = {}) {
  if (!view?.ownerId) return "Workspace";
  if (meId && view.ownerId === meId) return "You";
  return teammates.find((t) => t.id === view.ownerId)?.name || "Former teammate";
}

const nameOf = (rows, id) => rows?.find((r) => r.id === id)?.name;

// One-line description of a saved filter; `lookups` ({ teammates, tags, channels }) turns ids into names.
export function filterSummary(filter = {}, lookups = {}) {
  const { teammates = [], tags = [], channels = [] } = lookups;
  const parts = [];
  if (filter.status?.length) parts.push(`Status: ${filter.status.join(", ")}`);
  if (filter.channel?.length) parts.push(`Channel type: ${filter.channel.join(", ")}`);
  if (filter.channelId) parts.push(`Channel: ${nameOf(channels, filter.channelId) || "a specific channel"}`);
  if (filter.priority?.length) parts.push(`Priority: ${filter.priority.join(", ")}`);
  if (filter.assignee === "me") parts.push("Assigned to me");
  else if (filter.assignee === "unassigned") parts.push("Unassigned");
  else if (filter.assignee) {
    parts.push(`Assigned to ${nameOf(teammates, filter.assignee) || "a teammate"}`);
  }
  if (filter.tagIds?.length) {
    const names = filter.tagIds.map((id) => nameOf(tags, id)).filter(Boolean);
    parts.push(
      names.length === filter.tagIds.length
        ? `Tagged: ${names.join(" or ")}`
        : `Tagged (${filter.tagIds.length})`,
    );
  }
  if (filter.unread) parts.push("Unread only");
  if (filter.search?.trim()) parts.push(`Matching “${filter.search.trim()}”`);
  return parts.length ? parts.join(" · ") : "All conversations";
}

// How many constraints a view narrows on — drives the KPI bar.
export function filterCount(filter = {}) {
  let n = 0;
  if (filter.status?.length) n += 1;
  if (filter.channel?.length) n += 1;
  if (filter.channelId) n += 1;
  if (filter.priority?.length) n += 1;
  if (filter.assignee) n += 1;
  if (filter.tagIds?.length) n += 1;
  if (filter.unread) n += 1;
  if (filter.search?.trim()) n += 1;
  return n;
}

// ---- shared controls ---------------------------------------------------------

// Radix Select can't hold an empty value, so "any" stands in for "no constraint".
const ANY = "any";

// Checkbox-style chip group used by the filter builder.
export function MultiCheck({ label, options, selected = [], onChange, empty }) {
  return (
    <fieldset>
      <legend className="mb-1.5 text-sm font-medium text-muted-foreground">
        {label}
      </legend>
      {options.length === 0 && empty ? (
        <p className="text-xs text-text-tertiary">{empty}</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {options.map((option) => {
            const active = selected.includes(option.value);
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={active}
                onClick={() =>
                  onChange(
                    active
                      ? selected.filter((v) => v !== option.value)
                      : [...selected, option.value],
                  )
                }
                className={
                  "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors " +
                  (active
                    ? "border-primary/40 bg-primary/10 text-foreground"
                    : "border-border bg-surface-card text-text-secondary hover:text-foreground")
                }
              >
                {option.label}
              </button>
            );
          })}
        </div>
      )}
    </fieldset>
  );
}

// The §3.3 filter builder (everything but unread and sort, which each host renders in its own idiom).
export function FilterBuilder({ filter = {}, onChange, lookups = {}, idPrefix = "view" }) {
  const { teammates = [], tags = [], channels = [] } = lookups;
  const patch = (key) => (value) => onChange({ ...filter, [key]: value });
  const assignee = filter.assignee || ANY;
  const knownAssignee =
    [ANY, "me", "unassigned"].includes(assignee) ||
    teammates.some((t) => t.id === assignee);
  const channelId = filter.channelId || ANY;
  const knownChannel = channelId === ANY || channels.some((c) => c.id === channelId);

  return (
    <div className="grid gap-5">
      <MultiCheck
        label="Status"
        options={STATUS_FILTER_OPTIONS}
        selected={filter.status ?? []}
        onChange={patch("status")}
      />
      <MultiCheck
        label="Channel type"
        options={CHANNEL_FILTER_OPTIONS}
        selected={filter.channel ?? []}
        onChange={patch("channel")}
      />
      <MultiCheck
        label="Priority"
        options={PRIORITY_FILTER_OPTIONS}
        selected={filter.priority ?? []}
        onChange={patch("priority")}
      />
      <MultiCheck
        label="Tags (any of)"
        options={[
          ...tags.map((t) => ({ value: t.id, label: t.name })),
          // A deleted tag stays selectable so it can be cleared.
          ...(filter.tagIds ?? [])
            .filter((id) => !tags.some((t) => t.id === id))
            .map((id) => ({ value: id, label: "Removed tag" })),
        ]}
        selected={filter.tagIds ?? []}
        onChange={patch("tagIds")}
        empty="No tags yet — tag a conversation from its thread to filter on it."
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Assignee"
          htmlFor={`${idPrefix}-assignee`}
          hint="“Assigned to me” resolves per teammate."
        >
          <Select
            value={assignee}
            onValueChange={(value) => patch("assignee")(value === ANY ? null : value)}
          >
            <SelectTrigger id={`${idPrefix}-assignee`} className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>Anyone</SelectItem>
              <SelectItem value="me">Assigned to me</SelectItem>
              <SelectItem value="unassigned">Unassigned</SelectItem>
              {teammates.length || !knownAssignee ? <SelectSeparator /> : null}
              {teammates.length ? (
                <SelectGroup>
                  <SelectLabel>Teammates</SelectLabel>
                  {teammates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name || t.email || "Teammate"}
                    </SelectItem>
                  ))}
                </SelectGroup>
              ) : null}
              {knownAssignee ? null : (
                <SelectItem value={assignee}>Former teammate</SelectItem>
              )}
            </SelectContent>
          </Select>
        </Field>

        <Field
          label="Channel"
          htmlFor={`${idPrefix}-channel-id`}
          hint={channels.length ? "One connected inbox." : "No channels connected yet."}
        >
          <Select
            value={channelId}
            onValueChange={(value) => patch("channelId")(value === ANY ? null : value)}
          >
            <SelectTrigger id={`${idPrefix}-channel-id`} className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>Any channel</SelectItem>
              {channels.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name || c.kind}
                </SelectItem>
              ))}
              {knownChannel ? null : (
                <SelectItem value={channelId}>Removed channel</SelectItem>
              )}
            </SelectContent>
          </Select>
        </Field>
      </div>

      <Field
        label="Search"
        htmlFor={`${idPrefix}-search`}
        hint="Matches the conversation subject or last message."
      >
        <Input
          id={`${idPrefix}-search`}
          value={filter.search ?? ""}
          onChange={(e) => patch("search")(e.target.value)}
          placeholder="refund"
          className="h-9"
        />
      </Field>
    </div>
  );
}

// Sort picker shared by the create dialog and the editor's Overview.
export function SortSelect({ id, value, onChange, className }) {
  return (
    <Select value={value || "newest"} onValueChange={onChange}>
      <SelectTrigger id={id} className={className ?? "h-9"}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {SORT_OPTIONS.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// ---- nav ---------------------------------------------------------------------

export const NAV_GROUPS = [
  {
    group: null,
    items: [
      {
        key: "overview",
        label: "Overview",
        icon: LayoutDashboard,
        desc: "A snapshot of this view — what it narrows to and how it is sorted.",
      },
    ],
  },
  {
    group: "Configuration",
    items: [
      {
        key: "filters",
        label: "Filters",
        icon: ListFilter,
        desc: "The saved conversation filter. Changes save automatically.",
      },
      {
        key: "sharing",
        label: "Sharing",
        icon: Users,
        desc: "Whether the rest of the team sees this view in their inbox.",
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
        desc: "Destructive actions for this saved view.",
      },
    ],
  },
];

// ---- sections ----------------------------------------------------------------

function countLabel(count) {
  if (count === undefined) return "…";
  if (count === null) return "—";
  return String(count);
}

function OverviewSection({ view, lookups, count, onName, onSort }) {
  const stats = [
    { label: "Matching", value: countLabel(count), hint: "Conversations right now" },
    { label: "Filters", value: String(filterCount(view.filter)), hint: "Constraints applied" },
    { label: "Sharing", value: view.shared ? "Shared" : "Private" },
    { label: "Owner", value: ownerLabel(view, lookups) },
  ];

  return (
    <div className="space-y-6">
      <StatGrid stats={stats} />
      <SectionCard title="View" description="Changes save automatically.">
        <div className="grid gap-4">
          <Field
            label="Name"
            htmlFor="view-name"
            hint="Shown on the Views list and when the view is applied."
          >
            <Input
              id="view-name"
              value={view.name}
              onChange={(e) => onName(e.target.value)}
              placeholder="Urgent & unassigned"
              className="h-9 sm:max-w-sm"
            />
          </Field>
          <Field label="Sort" htmlFor="view-sort" hint="Ordering applied when the view opens.">
            <SortSelect
              id="view-sort"
              value={view.sort}
              onChange={onSort}
              className="h-9 sm:max-w-sm"
            />
          </Field>
        </div>
      </SectionCard>
      <SectionCard title="Summary">
        <SettingsList>
          <SettingRow
            title="Matches"
            description={filterSummary(view.filter, lookups)}
            control={<StatusPill status={sharedKey(view)} map={VIEW_SHARED_MAP} />}
          />
          <SettingRow
            title="Created"
            description={formatDate(view.createdAt) || "—"}
            control={
              <span className="text-xs text-text-secondary">
                Owned by {ownerLabel(view, lookups)}
              </span>
            }
          />
        </SettingsList>
      </SectionCard>
    </div>
  );
}

function FiltersSection({ view, lookups, onFilter }) {
  const filter = view.filter ?? {};

  return (
    <div className="space-y-6">
      <SectionCard
        title="Conversation filter"
        description="Leave a group empty to put no constraint on it."
      >
        <FilterBuilder
          filter={filter}
          onChange={onFilter}
          lookups={lookups}
          idPrefix="view-filter"
        />
      </SectionCard>

      <SectionCard title="Read state">
        <SettingsList>
          <SettingRow
            title="Unread only"
            description="Only conversations with activity you haven't read yet — resolved per teammate."
            checked={Boolean(filter.unread)}
            onCheckedChange={(next) =>
              onFilter({ ...filter, unread: next ? true : null })
            }
          />
        </SettingsList>
      </SectionCard>
    </div>
  );
}

function SharingSection({ view, onShared }) {
  return (
    <SectionCard
      title="Team access"
      description="Shared views appear for every teammate in this workspace. Private views are visible only to their owner."
    >
      <SettingsList>
        <SettingRow
          title="Share with the team"
          description={
            view.shared
              ? "Everyone in the workspace can apply this view."
              : "Only the owner can see and apply this view."
          }
          checked={Boolean(view.shared)}
          onCheckedChange={onShared}
        />
      </SettingsList>
    </SectionCard>
  );
}

function AdvancedSection({ view, onDelete }) {
  return (
    <SectionCard
      title="Danger zone"
      description={`Deleting “${view.name}” removes it from the workspace. Conversations are untouched.`}
    >
      <Button
        type="button"
        className="bg-red-500/90 text-white hover:bg-red-500"
        onClick={onDelete}
      >
        <Trash2 className="h-4 w-4" /> Delete view
      </Button>
    </SectionCard>
  );
}

export const SECTIONS = {
  overview: OverviewSection,
  filters: FiltersSection,
  sharing: SharingSection,
  advanced: AdvancedSection,
};
