// Lookups, filter options and formatters for the Automation area (Workflows, Run History, Macros, Routing Rules, SLA Policies).
// Config only — never row data. Values mirror the comms column contracts adopted in 20261018184858_adopt_automation.

import { CONVERSATION_CHANNELS } from "../overview/constants";

// ---- permissions ------------------------------------------------------------------

// Writes to workflows, routing rules, SLA policies and shared macros need this (20261021114846_automation_write_hardening).
export const MANAGE_PERMISSION = "comms.settings.manage";

export const NEEDS_MANAGE_WORKFLOWS = "Only teammates who can manage settings can change workflows.";
export const NEEDS_MANAGE_ROUTING = "Only teammates who can manage settings can change routing rules.";
export const NEEDS_MANAGE_SLA = "Only teammates who can manage settings can change SLA policies.";
export const NEEDS_MANAGE_MACROS = "Only teammates who can manage settings can share macros or change shared ones.";

// ---- workflows ------------------------------------------------------------------

export const WORKFLOW_STATUS_MAP = {
  live: { label: "Live", variant: "success", dotClass: "bg-emerald-400" },
  paused: { label: "Paused", variant: "warning", dotClass: "bg-amber-400" },
  draft: { label: "Draft", variant: "neutral", dotClass: "bg-text-secondary" },
  archived: { label: "Archived", variant: "outline", dotClass: "bg-text-tertiary" },
};

export const WORKFLOW_STATUS_FILTER_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "live", label: "Live" },
  { value: "paused", label: "Paused" },
  { value: "draft", label: "Draft" },
];

// workflow_runs.status is free text; the engine contract is ok | failed | running | skipped.
export const RUN_STATUS_MAP = {
  ok: {
    label: "Success",
    variant: "success",
    dotClass: "bg-emerald-400",
    iconClass: "text-emerald-600 dark:text-emerald-400",
  },
  failed: {
    label: "Failed",
    variant: "danger",
    dotClass: "bg-red-400",
    iconClass: "text-red-600 dark:text-red-400",
  },
  running: {
    label: "Running",
    variant: "info",
    dotClass: "bg-sky-400",
    iconClass: "text-sky-600 dark:text-sky-400",
  },
  skipped: {
    label: "Skipped",
    variant: "neutral",
    dotClass: "bg-text-secondary",
    iconClass: "text-[#737373]",
  },
};

export const RUN_STATUS_FILTER_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "ok", label: "Success" },
  { value: "failed", label: "Failed" },
  { value: "running", label: "Running" },
  { value: "skipped", label: "Skipped" },
];

// ---- conversation attributes rules match on ----------------------------------------

export const CHANNEL_OPTIONS = CONVERSATION_CHANNELS.map((c) => ({ value: c, label: c }));

export const PRIORITY_OPTIONS = [
  { value: "Urgent", label: "Urgent" },
  { value: "Normal", label: "Normal" },
  { value: "Low", label: "Low" },
];

export const CONVERSATION_STATE_OPTIONS = [
  { value: "Open", label: "Open" },
  { value: "Snoozed", label: "Snoozed" },
  { value: "Closed", label: "Closed" },
];

// One line for a { channel(s), priority/priorities, tags } match or scope bag; "All conversations" when empty.
export function summarizeMatch(match) {
  const m = match && typeof match === "object" ? match : {};
  const channels = m.channels ?? m.channel ?? [];
  const priorities = m.priorities ?? m.priority ?? [];
  const tags = m.tags ?? [];
  const parts = [];
  if (Array.isArray(channels) && channels.length) parts.push(channels.join(", "));
  if (Array.isArray(priorities) && priorities.length) parts.push(priorities.join(", "));
  if (Array.isArray(tags) && tags.length) parts.push(tags.map((t) => `#${t}`).join(" "));
  return parts.length ? parts.join(" · ") : "All conversations";
}

// ---- macros ----------------------------------------------------------------------

export const MACRO_SCOPE_MAP = {
  team: { label: "Everyone", variant: "info", dotClass: "bg-sky-400" },
  personal: { label: "Only me", variant: "neutral", dotClass: "bg-text-secondary" },
};

export const MACRO_SCOPE_FILTER_OPTIONS = [
  { value: "all", label: "All macros" },
  { value: "team", label: "Shared with everyone" },
  { value: "personal", label: "Only mine" },
];

// Placeholders a macro body may use; resolved against the open conversation when the macro is applied.
export const MACRO_VARIABLES = [
  { token: "{{contact.name}}", label: "Contact name", sample: "Maya Chen" },
  { token: "{{contact.email}}", label: "Contact email", sample: "maya@lumen.io" },
  { token: "{{contact.company}}", label: "Company", sample: "Lumen" },
  { token: "{{contact.plan}}", label: "Plan", sample: "Pro" },
  { token: "{{teammate.name}}", label: "Your name", sample: "Danielle Reyes" },
  { token: "{{conversation.subject}}", label: "Conversation subject", sample: "Billing question" },
  { token: "{{ticket.title}}", label: "Ticket title", sample: "Refund for March invoice" },
];

// Swap every known {{token}} for its sample so the editor can preview the reply.
export function renderMacroPreview(body) {
  let out = String(body || "");
  for (const v of MACRO_VARIABLES) out = out.split(v.token).join(v.sample);
  return out;
}

// What a macro can do besides inserting its reply. Stored as macros.actions [{ action, ...config }].
export const MACRO_ACTION_CATALOG = [
  { key: "assign", label: "Assign to", description: "Hand the conversation to a teammate.", field: "teammate" },
  { key: "tag.add", label: "Add tag", description: "Tag the conversation.", field: "tag" },
  { key: "tag.remove", label: "Remove tag", description: "Remove a tag from the conversation.", field: "tag" },
  { key: "priority.set", label: "Set priority", description: "Change the conversation's priority.", field: "priority" },
  { key: "state.snooze", label: "Snooze", description: "Snooze the conversation.", field: "snooze" },
  { key: "state.close", label: "Close", description: "Close the conversation after replying.", field: null },
  { key: "state.reopen", label: "Reopen", description: "Reopen a closed conversation.", field: null },
  { key: "ticket.state", label: "Set ticket state", description: "Move the linked ticket to a state.", field: "ticketState" },
];

export const MACRO_SNOOZE_OPTIONS = [
  { value: "1h", label: "1 hour" },
  { value: "3h", label: "3 hours" },
  { value: "tomorrow9", label: "Tomorrow 9am" },
  { value: "nextweek", label: "Next week" },
];

// ---- routing rules ------------------------------------------------------------------

export const ROUTING_STRATEGY_MAP = {
  round_robin: {
    label: "Round robin",
    variant: "info",
    dotClass: "bg-sky-400",
    description: "Rotate through available teammates in turn.",
  },
  load: {
    label: "Balanced",
    variant: "purple",
    dotClass: "bg-violet-400",
    description: "Give it to whoever has the fewest open conversations.",
  },
  direct: {
    label: "Direct",
    variant: "neutral",
    dotClass: "bg-text-secondary",
    description: "Always assign to one teammate (skipped while they're offline, or away outside their hours).",
  },
};

export const ROUTING_STRATEGY_FILTER_OPTIONS = [
  { value: "all", label: "All strategies" },
  ...Object.entries(ROUTING_STRATEGY_MAP).map(([value, s]) => ({ value, label: s.label })),
];

export const ENABLED_MAP = {
  on: { label: "Enabled", variant: "success", dotClass: "bg-emerald-400" },
  off: { label: "Disabled", variant: "neutral", dotClass: "bg-text-secondary" },
};

export const ENABLED_FILTER_OPTIONS = [
  { value: "all", label: "Enabled & disabled" },
  { value: "on", label: "Enabled" },
  { value: "off", label: "Disabled" },
];

export const AVAILABILITY_MAP = {
  available: { label: "Available", variant: "success", dotClass: "bg-emerald-400" },
  away: { label: "Away", variant: "warning", dotClass: "bg-amber-400" },
  offline: { label: "Offline", variant: "neutral", dotClass: "bg-text-secondary" },
};

// ---- SLA policies -----------------------------------------------------------------

// conversations.sla_state, set by the conversations_apply_sla trigger.
export const SLA_STATE_MAP = {
  on_track: { label: "On track", variant: "success", dotClass: "bg-emerald-400" },
  approaching: { label: "Approaching", variant: "warning", dotClass: "bg-amber-400" },
  breached: { label: "Breached", variant: "danger", dotClass: "bg-red-400" },
  paused: { label: "Paused", variant: "neutral", dotClass: "bg-text-secondary" },
  none: { label: "No SLA", variant: "outline", dotClass: "bg-text-tertiary" },
};

// ---- durations -------------------------------------------------------------------

export const DURATION_UNITS = [
  { value: "minutes", label: "minutes", factor: 1 },
  { value: "hours", label: "hours", factor: 60 },
  { value: "days", label: "days", factor: 1440 },
];

// Minutes → the largest unit that divides evenly, for editing ({ amount: 4, unit: "hours" }).
export function splitMinutes(mins) {
  const n = Number(mins);
  if (!Number.isFinite(n) || n <= 0) return { amount: "", unit: "hours" };
  for (const u of [...DURATION_UNITS].reverse()) {
    if (n % u.factor === 0) return { amount: String(n / u.factor), unit: u.value };
  }
  return { amount: String(n), unit: "minutes" };
}

export function joinMinutes(amount, unit) {
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) return null;
  const factor = DURATION_UNITS.find((u) => u.value === unit)?.factor ?? 1;
  return Math.round(n * factor);
}

// 45 → "45m", 90 → "1h 30m", 1440 → "1d", null → "—".
export function formatMinutes(mins) {
  const n = Number(mins);
  if (mins == null || !Number.isFinite(n) || n <= 0) return "—";
  const d = Math.floor(n / 1440);
  const h = Math.floor((n % 1440) / 60);
  const m = Math.round(n % 60);
  return [d && `${d}d`, h && `${h}h`, m && `${m}m`].filter(Boolean).join(" ");
}

// ---- dates -------------------------------------------------------------------------

export function formatDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });
}

export function formatDateTime(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-US", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatDuration(ms) {
  const n = Number(ms);
  if (!n || Number.isNaN(n) || n < 0) return "—";
  if (n < 1000) return `${Math.round(n)}ms`;
  const s = n / 1000;
  if (s < 60) return `${s.toFixed(s < 10 ? 1 : 0)}s`;
  const m = Math.floor(s / 60);
  const rem = Math.round(s % 60);
  return `${m}m ${rem}s`;
}

// ---- macros (added) ----

// One line naming a macro's configured actions, e.g. "Assign to · Close"; "Reply only" when it has none.
export function summarizeMacroActions(actions) {
  const list = Array.isArray(actions) ? actions : [];
  if (!list.length) return "Reply only";
  return list
    .map((a) => MACRO_ACTION_CATALOG.find((c) => c.key === a?.action)?.label || a?.action)
    .filter(Boolean)
    .join(" · ");
}
