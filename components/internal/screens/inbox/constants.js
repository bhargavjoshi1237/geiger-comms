// Lookups, filter option lists and small helpers for the Inbox area. These are
// config, not row data. Status/priority/channel lookups stay owned by the
// Overview screen's constants (inbox spec §1) and are re-exported here so the
// inbox imports from one place.

import { Mail, MessageCircle, MessageSquare, Share2, Slack, Smartphone } from "lucide-react";
import {
  CONVERSATION_CHANNELS,
  CONVERSATION_STATUS_MAP,
  PRIORITY_META,
  PRIORITY_WEIGHT,
} from "../overview/constants";
import { MACRO_ACTION_CATALOG, MACRO_SNOOZE_OPTIONS, MACRO_VARIABLES } from "../automation/constants";

export { CONVERSATION_CHANNELS, CONVERSATION_STATUS_MAP, PRIORITY_META, PRIORITY_WEIGHT };

// ---- filter options -----------------------------------------------------------

export const STATUS_FILTER_OPTIONS = [
  { value: "Open", label: "Open" },
  { value: "Snoozed", label: "Snoozed" },
  { value: "Closed", label: "Closed" },
];

// List-pane status tabs; "all" clears the status filter.
export const STATUS_TABS = [...STATUS_FILTER_OPTIONS, { value: "all", label: "All" }];

export const CHANNEL_FILTER_OPTIONS = CONVERSATION_CHANNELS.map((c) => ({
  value: c,
  label: c,
}));

// Connected-channel kind → the conversations.channel display text (Channels spec §2.1: set both).
const KIND_DISPLAY_CHANNEL = {
  email: "Email",
  messenger: "Chat",
  whatsapp: "WhatsApp",
  sms: "SMS",
  slack: "Slack",
};
const SOCIAL_NETWORK_CHANNEL = { instagram: "Instagram", facebook: "Facebook", x: "X" };

export function displayChannelFor(channel) {
  if (!channel) return "Chat";
  if (channel.kind === "social") {
    const network = Array.isArray(channel.accounts) ? channel.accounts[0]?.network : null;
    return SOCIAL_NETWORK_CHANNEL[network] ?? "Instagram";
  }
  return KIND_DISPLAY_CHANNEL[channel.kind] ?? "Chat";
}

// conversations.channel display text → glyph + how a message arrives ("started this conversation by email").
const CHANNEL_META = {
  Email: { icon: Mail, via: "by email" },
  Chat: { icon: MessageCircle, via: "in chat" },
  WhatsApp: { icon: Smartphone, via: "on WhatsApp" },
  SMS: { icon: MessageSquare, via: "by SMS" },
  Slack: { icon: Slack, via: "in Slack" },
};

export function channelMeta(channel) {
  const name = channel || "Chat";
  return CHANNEL_META[name] ?? { icon: Share2, via: `on ${name}` };
}

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
    channelId: null,
    assignee: null,
    tagIds: [],
    unread: null,
    search: "",
    sort: "newest",
  };
}

// Client mirror of comms.filter_conversations for realtime rows (spec §5.4); an unknown extra skips its check, `searchMatched` keeps a server body-match.
export function matchesFilter(conversation, filter, teammateId, extras = {}) {
  if (!conversation) return false;
  const f = { ...defaultFilter(), ...filter };
  if (f.status?.length && !f.status.includes(conversation.status)) return false;
  if (f.channel?.length && !f.channel.includes(conversation.channel)) return false;
  if (f.priority?.length && !f.priority.includes(conversation.priority)) return false;
  const channelIds = [].concat(f.channelId ?? []).filter(Boolean);
  if (channelIds.length && !channelIds.includes(conversation.channelId)) return false;
  if (f.tagIds?.length && Array.isArray(extras.tagIds)) {
    if (!f.tagIds.some((id) => extras.tagIds.includes(id))) return false;
  }
  if (f.mentioned === true && extras.mentionIds instanceof Set) {
    if (!extras.mentionIds.has(conversation.id)) return false;
  }
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
    !extras.searchMatched &&
    ![conversation.subject, conversation.preview, conversation.contactName, conversation.contactEmail].some((text) =>
      (text || "").toLowerCase().includes(q),
    )
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

// ---- display helpers ---------------------------------------------------------------

export function initials(name) {
  return (name || "?")
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || "")
    .join("");
}

// The data layer defaults a missing contact name to "Unknown"; fall back to the email, then a plain label.
export function contactLabel(conversation) {
  const name = conversation?.contactName;
  if (name && name !== "Unknown") return name;
  return conversation?.contactEmail || "Unknown visitor";
}

export function isKnownContact(conversation) {
  const name = conversation?.contactName;
  return Boolean(name && name !== "Unknown");
}

function toDate(value) {
  const d = value ? new Date(value) : null;
  return d && !Number.isNaN(d.getTime()) ? d : null;
}

// Local calendar day, used to group thread messages under day dividers.
export function dayKey(value) {
  const d = toDate(value);
  return d ? `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}` : "";
}

export function formatClock(value) {
  const d = toDate(value);
  return d ? d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : "";
}

// "Today" / "Yesterday" / "Mon, Oct 19" / "Oct 19, 2025".
export function formatDayLabel(value, nowMs) {
  const d = toDate(value);
  if (!d) return "";
  const now = new Date(nowMs ?? Date.now());
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (dayKey(d) === dayKey(now)) return "Today";
  if (dayKey(d) === dayKey(yesterday)) return "Yesterday";
  if (d.getFullYear() === now.getFullYear()) {
    return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  }
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// "Today, 9:12 AM" / "Mon, Oct 19, 9:12 AM".
export function formatDayTime(value, nowMs) {
  const day = formatDayLabel(value, nowMs);
  return day ? `${day}, ${formatClock(value)}` : "";
}

// A clock time for today, otherwise a date ("Oct 19", or "Oct 19, 2025" in another year).
export function formatWhen(value, nowMs) {
  const d = toDate(value);
  if (!d) return "";
  const now = new Date(nowMs ?? Date.now());
  if (dayKey(d) === dayKey(now)) return formatClock(d);
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }) });
}

// Compact time since `value` ("now", "14m", "3h", "2d").
export function formatElapsed(value, nowMs) {
  const d = toDate(value);
  if (!d) return "";
  const minutes = Math.max(0, Math.floor(((nowMs ?? Date.now()) - d.getTime()) / 60000));
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

// ---- macros (authored in Automation → Macros) -------------------------------------------

// Fills each known {{token}} from `values` (token → text); a token with no value stays put for the teammate to fill in.
export function fillMacroBody(body, values) {
  let out = String(body || "");
  for (const { token } of MACRO_VARIABLES) {
    const value = values[token] == null ? "" : String(values[token]).trim();
    if (value) out = out.split(token).join(value);
  }
  return out;
}

// Known {{tokens}} still in a draft; sending one would show the customer raw template text.
export function unfilledMacroTokens(text) {
  return MACRO_VARIABLES.map((v) => v.token).filter((token) => (text || "").includes(token));
}

// One macro action as a short label: "Assign to: Ann", "Add tag: billing", "Close".
export function macroActionLabel(action, teammates = []) {
  const label = MACRO_ACTION_CATALOG.find((c) => c.key === action?.action)?.label ?? action?.action ?? "Action";
  let value = null;
  switch (action?.action) {
    case "assign":
      value = teammates.find((t) => t.id === action.teammateId)?.name || action.teammateName || null;
      break;
    case "tag.add":
    case "tag.remove":
      value = action.tag || null;
      break;
    case "priority.set":
      value = action.priority || null;
      break;
    case "state.snooze":
      value = MACRO_SNOOZE_OPTIONS.find((o) => o.value === action.snooze)?.label ?? null;
      break;
    case "ticket.state":
      value = TICKET_STATE_OPTIONS.find((o) => o.value === action.state)?.label ?? null;
      break;
    default:
      break;
  }
  return value ? `${label}: ${value}` : label;
}

// ---- attachments -------------------------------------------------------------------------

// Mirrors lib/widget/attachments (the server re-checks by magic bytes): images and PDFs, 10 MB each, five per message.
export const ATTACHMENT_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp", "application/pdf"];
export const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
export const ATTACHMENT_MAX_COUNT = 5;

export function formatBytes(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  const mb = n / (1024 * 1024);
  return `${mb >= 10 ? Math.round(mb) : mb.toFixed(1)} MB`;
}
