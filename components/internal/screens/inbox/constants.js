// Lookups, filter option lists and small helpers for the Inbox area. These are
// config, not row data. Status/priority/channel lookups stay owned by the
// Overview screen's constants (inbox spec §1) and are re-exported here so the
// inbox imports from one place.

import {
  CONVERSATION_CHANNELS,
  CONVERSATION_STATUS_MAP,
  PRIORITY_META,
  PRIORITY_WEIGHT,
} from "../overview/constants";

export { CONVERSATION_CHANNELS, CONVERSATION_STATUS_MAP, PRIORITY_META, PRIORITY_WEIGHT };

// ---- filter options -----------------------------------------------------------

export const STATUS_FILTER_OPTIONS = [
  { value: "Open", label: "Open" },
  { value: "Snoozed", label: "Snoozed" },
  { value: "Closed", label: "Closed" },
];

export const CHANNEL_FILTER_OPTIONS = CONVERSATION_CHANNELS.map((c) => ({
  value: c,
  label: c,
}));

export const PRIORITY_FILTER_OPTIONS = [
  { value: "Urgent", label: "Urgent" },
  { value: "Normal", label: "Normal" },
  { value: "Low", label: "Low" },
];

// assignee: "me" | "unassigned" | "<teammateId>" | null (null = no constraint)
export const ASSIGNEE_FILTER_OPTIONS = [
  { value: "", label: "Anyone" },
  { value: "me", label: "Assigned to me" },
  { value: "unassigned", label: "Unassigned" },
];

export const SORT_OPTIONS = [
  { value: "newest", label: "Newest activity" },
  { value: "oldest", label: "Oldest activity" },
  { value: "priority", label: "Priority" },
];

// The §3.3 filter shape, defaulted. Omitted/empty keys mean "no constraint";
// `teammateId` is transport for "me" resolution at query time and never part
// of a saved view.
export function defaultFilter() {
  return {
    status: [],
    channel: [],
    priority: [],
    assignee: null,
    tagIds: [],
    unread: null,
    search: "",
    sort: "newest",
  };
}

// Client-side mirror of comms.list_conversations' predicate — used by realtime
// handlers to drop rows that just left the active filter (spec §5.4).
export function matchesFilter(conversation, filter, teammateId) {
  if (!conversation) return false;
  const f = { ...defaultFilter(), ...filter };
  if (f.status?.length && !f.status.includes(conversation.status)) return false;
  if (f.channel?.length && !f.channel.includes(conversation.channel)) return false;
  if (f.priority?.length && !f.priority.includes(conversation.priority)) return false;
  if (f.assignee === "me") {
    if (!teammateId || conversation.assigneeId !== teammateId) return false;
  } else if (f.assignee === "unassigned") {
    if (conversation.assigneeId) return false;
  } else if (
    f.assignee &&
    conversation.assigneeId !== f.assignee
  ) {
    return false;
  }
  if (f.unread != null && Boolean(conversation.unread) !== f.unread) return false;
  const q = (f.search || "").trim().toLowerCase();
  if (
    q &&
    !(conversation.subject || "").toLowerCase().includes(q) &&
    !(conversation.preview || "").toLowerCase().includes(q)
  ) {
    return false;
  }
  return true;
}

// ---- snooze presets -------------------------------------------------------------

// value → an absolute ISO instant. "custom" is handled by the shell (a
// datetime input); anything unrecognized means "don't snooze".
export const SNOOZE_PRESETS = [
  { value: "1h", label: "In 1 hour" },
  { value: "3h", label: "In 3 hours" },
  { value: "tomorrow9", label: "Tomorrow 9am" },
  { value: "nextweek", label: "Next week" },
];

export function snoozeUntil(preset, nowMs) {
  const base = nowMs ?? Date.now();
  const d = new Date(base);
  switch (preset) {
    case "1h":
      d.setHours(d.getHours() + 1);
      break;
    case "3h":
      d.setHours(d.getHours() + 3);
      break;
    case "tomorrow9":
      d.setDate(d.getDate() + 1);
      d.setHours(9, 0, 0, 0);
      break;
    case "nextweek":
      d.setDate(d.getDate() + 7);
      d.setHours(9, 0, 0, 0);
      break;
    default:
      return null;
  }
  return d.toISOString();
}

// ---- tickets ---------------------------------------------------------------------

export const TICKET_TYPE_OPTIONS = [
  { value: "customer", label: "Customer" },
  { value: "back_office", label: "Back-office" },
  { value: "tracker", label: "Tracker" },
];

export const TICKET_STATE_OPTIONS = [
  { value: "submitted", label: "Submitted" },
  { value: "in_progress", label: "In progress" },
  { value: "waiting", label: "Waiting" },
  { value: "resolved", label: "Resolved" },
];

export const TICKET_TYPE_MAP = {
  customer: { label: "Customer", variant: "neutral", dotClass: "bg-sky-300" },
  back_office: { label: "Back-office", variant: "warning", dotClass: "bg-amber-400" },
  tracker: { label: "Tracker", variant: "info", dotClass: "bg-violet-400" },
};

export const TICKET_STATE_MAP = {
  submitted: { label: "Submitted", variant: "neutral", dotClass: "bg-slate-300" },
  in_progress: { label: "In progress", variant: "info", dotClass: "bg-sky-300" },
  waiting: { label: "Waiting", variant: "warning", dotClass: "bg-amber-400" },
  resolved: { label: "Resolved", variant: "success", dotClass: "bg-emerald-400" },
};

// Toolbar filters — the "all" sentinel first, the shape FilterDropdown wants.
export const TICKET_TYPE_FILTER_OPTIONS = [
  { value: "all", label: "All types" },
  ...TICKET_TYPE_OPTIONS,
];

export const TICKET_STATE_FILTER_OPTIONS = [
  { value: "all", label: "All states" },
  ...TICKET_STATE_OPTIONS,
];

// Everything that still needs work — the queue behind the "Open" KPI.
export const TICKET_OPEN_STATES = ["submitted", "in_progress", "waiting"];

export const isTicketOpen = (ticket) => ticket?.state !== "resolved";

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

// Whole days since `value`, rounded down. Null for a missing/invalid date.
export function ageInDays(value, nowMs) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return Math.max(0, Math.floor(((nowMs ?? Date.now()) - d.getTime()) / 86400000));
}

// ---- tags --------------------------------------------------------------------------

// Tag color name → tailwind badge utilities (semantic /10 bg + /20 border rule).
export const TAG_COLOR_MAP = {
  slate: "text-slate-300 bg-slate-400/10 border-slate-400/20",
  red: "text-red-300 bg-red-400/10 border-red-400/20",
  amber: "text-amber-300 bg-amber-400/10 border-amber-400/20",
  emerald: "text-emerald-300 bg-emerald-400/10 border-emerald-400/20",
  sky: "text-sky-300 bg-sky-400/10 border-sky-400/20",
  violet: "text-violet-300 bg-violet-400/10 border-violet-400/20",
  pink: "text-pink-300 bg-pink-400/10 border-pink-400/20",
};

// ---- keyboard shortcuts --------------------------------------------------------------

// j/k move selection · Enter opens · e closes/reopens · a assigns · s snoozes ·
// "/" focuses search · Esc clears selection. Skipped while typing (spec §5.5).
