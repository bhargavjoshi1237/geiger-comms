"use client";

// Customers lookups, formatters and segment-rule config (comms.contact_matches_rules mirrors SEGMENT_FIELDS).

import {
  Mail,
  MessageCircle,
  MessagesSquare,
  Share2,
  Smartphone,
  Ticket as TicketIcon,
  Tag as TagIcon,
  StickyNote,
  ListChecks,
  UserPlus,
} from "lucide-react";

export const LIFECYCLE_MAP = {
  lead: { label: "Lead", variant: "info", dotClass: "bg-sky-400" },
  trial: { label: "Trial", variant: "warning", dotClass: "bg-amber-400" },
  customer: { label: "Customer", variant: "success", dotClass: "bg-emerald-400" },
  vip: { label: "VIP", variant: "purple", dotClass: "bg-violet-400" },
  churned: { label: "Churned", variant: "neutral", dotClass: "bg-slate-400" },
};

export const LIFECYCLE_FILTER_OPTIONS = [
  { value: "all", label: "All lifecycle stages" },
  ...Object.entries(LIFECYCLE_MAP).map(([value, meta]) => ({
    value,
    label: meta.label,
  })),
];

const CHANNEL_ICON = {
  Email: Mail,
  Chat: MessageCircle,
  Slack: MessagesSquare,
  WhatsApp: Smartphone,
  Instagram: Share2,
  Social: Share2,
};

export function channelIcon(channel) {
  return CHANNEL_ICON[channel] || MessageCircle;
}

export function initialsOf(name, email) {
  const base = (name || "").trim() || (email || "").split("@")[0] || "?";
  return base
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || "")
    .join("");
}

export function tagLabel(t) {
  return typeof t === "string" ? t : t?.name || "";
}

export function formatDate(dateStr) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatDateTime(dateStr) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "—";
  return (
    d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }) +
    " " +
    d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
  );
}

export function formatRelativeTime(dateStr) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "—";
  const diffMs = Date.now() - d.getTime();
  if (diffMs < 0) return "just now";
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

// Puts a row back where an optimistic removal took it from (rollback).
export function restoreRow(rows, row, index) {
  if (!row || rows.some((r) => r.id === row.id)) return rows;
  const at = Math.min(Math.max(index, 0), rows.length);
  return [...rows.slice(0, at), row, ...rows.slice(at)];
}

// ---- custom attributes ------------------------------------------------------

export const ATTRIBUTE_TYPES = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
  { value: "boolean", label: "True / false" },
  { value: "select", label: "List" },
];

// Coerces a raw (CSV or input) value to the attribute's type; undefined = unusable.
export function coerceAttribute(type, raw) {
  const text = String(raw ?? "").trim();
  if (text === "") return undefined;
  if (type === "number") {
    const n = Number(text.replace(/[\s,$€£¥]/g, ""));
    return Number.isFinite(n) ? n : undefined;
  }
  if (type === "boolean") {
    if (/^(true|yes|y|1)$/i.test(text)) return true;
    if (/^(false|no|n|0)$/i.test(text)) return false;
    return undefined;
  }
  if (type === "date") {
    const d = new Date(text);
    return Number.isNaN(d.getTime()) ? undefined : d.toISOString().slice(0, 10);
  }
  return text;
}

// ---- companies ----------------------------------------------------------------

// Company rows for the list: the record plus its linked people and thread counts.
export function summarizeCompanies(companies, people, conversations) {
  const peopleByCompany = new Map();
  for (const p of people || []) {
    if (!p.companyId) continue;
    if (!peopleByCompany.has(p.companyId)) peopleByCompany.set(p.companyId, []);
    peopleByCompany.get(p.companyId).push(p);
  }
  const convos = conversations || [];
  return (companies || []).map((company) => {
    const members = peopleByCompany.get(company.id) || [];
    const ids = new Set(members.map((p) => p.id));
    const emails = new Set(
      members.map((p) => (p.email || "").toLowerCase()).filter(Boolean),
    );
    const related = convos.filter(
      (cv) =>
        ids.has(cv.contactId) ||
        (cv.contactEmail && emails.has(cv.contactEmail.toLowerCase())),
    );
    const last = related
      .map((cv) => cv.lastMessageAt || cv.createdAt)
      .filter(Boolean)
      .sort()
      .reverse()[0];
    return {
      ...company,
      people: members,
      conversations: related,
      contactCount: members.length,
      conversationCount: related.length,
      openCount: related.filter(
        (cv) => (cv.status || "").toLowerCase() !== "closed",
      ).length,
      lastActivityAt: last || company.updatedAt,
    };
  });
}

// People carrying a company name with no company record link, grouped by name.
export function unlinkedCompanyGroups(people) {
  const groups = new Map();
  for (const p of people || []) {
    const name = (p.company || "").trim();
    if (!name || p.companyId) continue;
    const key = name.toLowerCase();
    if (!groups.has(key)) groups.set(key, { name, people: [] });
    groups.get(key).people.push(p);
  }
  return [...groups.values()];
}

// ---- segments -----------------------------------------------------------------

export const SEGMENT_OPERATOR_LABELS = {
  is: "is",
  is_not: "is not",
  contains: "contains",
  within_days: "within the last",
};

const TEXT_OPERATORS = ["is", "is_not", "contains"];

const SEGMENT_FIELDS = [
  { value: "lifecycle", label: "Lifecycle stage", operators: ["is", "is_not"], input: "lifecycle" },
  { value: "tag", label: "Tag", operators: TEXT_OPERATORS, input: "text" },
  { value: "company", label: "Company", operators: TEXT_OPERATORS, input: "text" },
  { value: "location", label: "Location", operators: TEXT_OPERATORS, input: "text" },
  { value: "emailOpt", label: "Email subscription", operators: ["is"], input: "subscription" },
  { value: "created", label: "Created", operators: ["within_days"], input: "days" },
];

export const SUBSCRIPTION_OPTIONS = [
  { value: "in", label: "Subscribed" },
  { value: "out", label: "Unsubscribed" },
];

// Built-in fields plus one per contact custom attribute (custom:<key>).
export function segmentFields(attributes) {
  return [
    ...SEGMENT_FIELDS,
    ...(attributes || [])
      .filter((a) => a.entity === "contact")
      .map((a) => ({
        value: `custom:${a.key}`,
        label: a.label,
        operators: a.type === "boolean" || a.type === "select" ? ["is", "is_not"] : TEXT_OPERATORS,
        input: a.type === "boolean" ? "boolean" : a.type === "select" ? "options" : "text",
        options: a.options,
      })),
  ];
}

export function blankRule(fields = SEGMENT_FIELDS) {
  const field = fields[0];
  return { field: field.value, operator: field.operators[0], value: "" };
}

// Rules worth saving: a field and a value ("created" defaults to 7 days in SQL).
export function completeRules(rules) {
  return (rules || []).filter(
    (r) => r.field && (r.field === "created" || String(r.value ?? "").trim() !== ""),
  );
}

export function ruleSummary(rule, fields = SEGMENT_FIELDS) {
  const field = fields.find((f) => f.value === rule.field);
  const op = SEGMENT_OPERATOR_LABELS[rule.operator] || rule.operator;
  let value = rule.value || "—";
  if (rule.field === "lifecycle") value = LIFECYCLE_MAP[rule.value]?.label || value;
  if (rule.field === "emailOpt") {
    return rule.value === "out" ? "Unsubscribed from email" : "Subscribed to email";
  }
  if (rule.field === "created") return `Created within the last ${rule.value || 7} days`;
  return `${field?.label || rule.field.replace(/^custom:/, "")} ${op} ${value}`;
}

export function rulesSummary(rules, fields) {
  const complete = completeRules(rules);
  return complete.length
    ? complete.map((r) => ruleSummary(r, fields)).join(" · ")
    : "Everyone";
}

// Built-in audiences are config, not rows: they always exist and are read-only.
export const DEFAULT_SEGMENTS = [
  {
    id: "builtin-all",
    name: "All people",
    description: "Everyone with a contact record in this workspace.",
    rules: [],
  },
  {
    id: "builtin-vip",
    name: "VIPs",
    description: "Lifecycle stage is VIP.",
    rules: [{ field: "lifecycle", operator: "is", value: "vip" }],
  },
  {
    id: "builtin-new",
    name: "New this week",
    description: "Created in the last 7 days.",
    rules: [{ field: "created", operator: "within_days", value: "7" }],
  },
  {
    id: "builtin-trials",
    name: "Trials",
    description: "Lifecycle stage is Trial.",
    rules: [{ field: "lifecycle", operator: "is", value: "trial" }],
  },
  {
    id: "builtin-unsubscribed",
    name: "Unsubscribed from email",
    description: "Email opt-outs — exclude from campaigns.",
    rules: [{ field: "emailOpt", operator: "is", value: "out" }],
  },
].map((s) => ({ ...s, builtIn: true, createdAt: null, updatedAt: null }));

// ---- timeline ---------------------------------------------------------------

export const TIMELINE_META = {
  conversation: { label: "Conversation", icon: MessagesSquare, tone: "text-sky-400" },
  ticket: { label: "Ticket", icon: TicketIcon, tone: "text-amber-400" },
  note: { label: "Note", icon: StickyNote, tone: "text-violet-400" },
  tag: { label: "Tag", icon: TagIcon, tone: "text-emerald-400" },
  task: { label: "Task", icon: ListChecks, tone: "text-pink-400" },
  person: { label: "Contact", icon: UserPlus, tone: "text-text-secondary" },
};

export function buildTimeline({ person, conversations, tickets }) {
  const events = [];
  for (const c of conversations || []) {
    events.push({
      id: `conv-${c.id}`,
      kind: "conversation",
      at: c.lastMessageAt || c.createdAt,
      title: c.subject || "Conversation",
      body: c.preview || "",
      meta: `${c.channel || "Chat"} · ${c.status || "Open"}`,
      refId: c.id,
    });
    for (const t of c.tags || []) {
      events.push({
        id: `tag-${c.id}-${t.id || t.name}`,
        kind: "tag",
        at: c.lastMessageAt || c.createdAt,
        title: `Tagged ${typeof t === "string" ? t : t.name}`,
        body: `On “${c.subject || "conversation"}”.`,
        meta: "",
      });
    }
  }
  for (const t of tickets || []) {
    events.push({
      id: `ticket-${t.id}`,
      kind: "ticket",
      at: t.updatedAt || t.createdAt,
      title: t.title || "Ticket",
      body: t.description || "",
      meta: `${t.type || "customer"} · ${t.state || "submitted"}`,
      refId: t.id,
    });
  }
  for (const n of person?.notes || []) {
    events.push({
      id: `note-${n.id}`,
      kind: "note",
      at: n.createdAt,
      title: `Note by ${n.author || "teammate"}`,
      body: n.body || "",
      meta: "",
    });
  }
  for (const t of person?.tasks || []) {
    events.push({
      id: `task-${t.id}`,
      kind: "task",
      at: t.dueAt || person.updatedAt,
      title: `${t.done ? "Completed task" : "Task"}: ${t.title}`,
      body: t.done ? "Marked done." : `Due ${formatDate(t.dueAt)}.`,
      meta: "",
    });
  }
  events.push({
    id: `created-${person?.id}`,
    kind: "person",
    at: person?.createdAt,
    title: "Contact created",
    body: `${person?.name || "Contact"} was added${person?.company ? ` from ${person.company}` : ""}.`,
    meta: "",
  });
  return events
    .filter((e) => e.at)
    .sort((a, b) => new Date(b.at) - new Date(a.at));
}
