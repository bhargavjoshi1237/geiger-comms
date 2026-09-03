"use client";

// Section nav + bodies for the saved-view editor (inbox spec §6). Mirrors the
// channels editor: NAV_GROUPS drives the right-hand nav, SECTIONS maps a key to
// its body. Also owns the small Views-only lookups (shared filter options, the
// shared status pill map, the filter summary line) so views.jsx and the editor
// read them from one place.

import {
  LayoutDashboard,
  ListFilter,
  ShieldAlert,
  Trash2,
  Users,
} from "lucide-react";
import { Button, Input } from "@geiger/ui";
import {
  Field,
  SectionCard,
  SettingRow,
  SettingsList,
  StatGrid,
  StatusPill,
} from "@/components/internal/shared/screen_kit";
import {
  ASSIGNEE_FILTER_OPTIONS,
  CHANNEL_FILTER_OPTIONS,
  PRIORITY_FILTER_OPTIONS,
  SORT_OPTIONS,
  STATUS_FILTER_OPTIONS,
} from "./constants";

// ---- lookups ----------------------------------------------------------------

// Shared-vs-private is the only axis worth filtering the (small) views list on.
export const SHARED_FILTER_OPTIONS = [
  { value: "all", label: "All views" },
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

// One-line description of a saved filter set, used on rows and in the editor.
export function filterSummary(filter = {}) {
  const parts = [];
  if (filter.status?.length) parts.push(`Status: ${filter.status.join(", ")}`);
  if (filter.channel?.length) parts.push(`Channel: ${filter.channel.join(", ")}`);
  if (filter.priority?.length) parts.push(`Priority: ${filter.priority.join(", ")}`);
  if (filter.assignee === "me") parts.push("Assigned to me");
  else if (filter.assignee === "unassigned") parts.push("Unassigned");
  else if (filter.assignee) parts.push("Assigned to a teammate");
  if (filter.unread) parts.push("Unread only");
  return parts.length ? parts.join(" · ") : "All conversations";
}

// How many constraints a view actually narrows on — drives the KPI bar.
export function filterCount(filter = {}) {
  let n = 0;
  if (filter.status?.length) n += 1;
  if (filter.channel?.length) n += 1;
  if (filter.priority?.length) n += 1;
  if (filter.assignee) n += 1;
  if (filter.unread) n += 1;
  return n;
}

// ---- shared controls ---------------------------------------------------------

const SELECT_CLASS =
  "h-9 w-full rounded-md border border-border bg-surface-card px-3 text-sm text-foreground outline-none focus-visible:border-border-strong focus-visible:ring-2 focus-visible:ring-border sm:max-w-sm";

// Checkbox group used by both the create dialog and the editor's Filters tab.
export function MultiCheck({ label, options, selected = [], onChange }) {
  return (
    <fieldset>
      <legend className="mb-1.5 text-sm font-medium text-muted-foreground">
        {label}
      </legend>
      <div className="flex flex-wrap gap-1.5">
        {options.map((option) => {
          const active = selected.includes(option.value);
          return (
            <button
              key={option.value}
              type="button"
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
    </fieldset>
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

function OverviewSection({ view, onName, onSort }) {
  const stats = [
    { label: "Filters", value: String(filterCount(view.filter)), hint: "Constraints applied" },
    { label: "Sharing", value: view.shared ? "Shared" : "Private" },
    { label: "Sort", value: sortLabel(view.sort) },
    { label: "Created", value: formatDate(view.createdAt) || "—" },
  ];

  return (
    <div className="space-y-6">
      <StatGrid stats={stats} />
      <SectionCard title="View" description="Changes save automatically.">
        <div className="grid gap-4">
          <Field
            label="Name"
            htmlFor="view-name"
            hint="Shown in the inbox sidebar and on the Views list."
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
            <select
              id="view-sort"
              value={view.sort ?? "newest"}
              onChange={(e) => onSort(e.target.value)}
              className={SELECT_CLASS}
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </SectionCard>
      <SectionCard title="Summary">
        <SettingsList>
          <SettingRow
            title="Matches"
            description={filterSummary(view.filter)}
            control={
              <StatusPill status={sharedKey(view)} map={VIEW_SHARED_MAP} />
            }
          />
        </SettingsList>
      </SectionCard>
    </div>
  );
}

function FiltersSection({ view, onFilter }) {
  const filter = view.filter ?? {};
  const patch = (key) => (value) => onFilter({ ...filter, [key]: value });

  return (
    <div className="space-y-6">
      <SectionCard
        title="Conversation filter"
        description="Leave a group empty to put no constraint on it."
      >
        <div className="grid gap-5">
          <MultiCheck
            label="Status"
            options={STATUS_FILTER_OPTIONS}
            selected={filter.status ?? []}
            onChange={patch("status")}
          />
          <MultiCheck
            label="Channel"
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
          <Field
            label="Assignee"
            htmlFor="view-assignee"
            hint="“Assigned to me” resolves per teammate, so the view means the right thing for everyone."
          >
            <select
              id="view-assignee"
              value={filter.assignee ?? ""}
              onChange={(e) =>
                onFilter({ ...filter, assignee: e.target.value || null })
              }
              className={SELECT_CLASS}
            >
              {ASSIGNEE_FILTER_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </SectionCard>

      <SectionCard title="Read state">
        <SettingsList>
          <SettingRow
            title="Unread only"
            description="Hide conversations everyone has already read."
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
      description="Shared views appear for every teammate in this workspace. Private views stay yours."
    >
      <SettingsList>
        <SettingRow
          title="Share with the team"
          description={
            view.shared
              ? "Everyone in the workspace can apply this view."
              : "Only you can see and apply this view."
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
