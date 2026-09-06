"use client";

// Shared constants + demo fallback + segment matching for the Customers area.
// People is the hub (the contact record + its unified lifelong timeline);
// Companies groups people by company; Segments is a saved filter over people.

import {
  Building2,
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
  lead: { label: "Lead", tone: "sky" },
  trial: { label: "Trial", tone: "amber" },
  customer: { label: "Customer", tone: "emerald" },
  vip: { label: "VIP", tone: "violet" },
  churned: { label: "Churned", tone: "slate" },
};

export const LIFECYCLE_FILTER_OPTIONS = [
  { value: "all", label: "All lifecycle stages" },
  ...Object.entries(LIFECYCLE_MAP).map(([value, meta]) => ({
    value,
    label: meta.label,
  })),
];

export const CHANNEL_ICON = {
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

export function domainOf(email) {
  const domain = (email || "").split("@")[1] || "";
  return domain.toLowerCase();
}

// ---- demo fallback ----------------------------------------------------------
// Shown when Supabase is unconfigured or the project has no contacts yet, so
// the screens still demonstrate the full surface.

const now = Date.now();
const daysAgo = (n) => new Date(now - n * 86400000).toISOString();
const hoursAgo = (n) => new Date(now - n * 3600000).toISOString();

export const DEMO_PEOPLE = [
  {
    id: "demo-person-1",
    name: "Maya Chen",
    email: "maya@northwind.io",
    avatarUrl: "",
    company: "Northwind",
    phone: "+1 (415) 555-0132",
    location: "San Francisco, CA",
    timezone: "PT (UTC−8)",
    language: "English",
    title: "Head of Support",
    lifecycle: "vip",
    owner: "Aria Sharma",
    website: "northwind.io",
    tags: ["vip", "billing"],
    notes: [
      {
        id: "n1",
        body: "Prefers email over chat. Renewing in Q4 — loop in Marco before quoting.",
        author: "Aria Sharma",
        createdAt: daysAgo(2),
      },
    ],
    tasks: [
      {
        id: "t1",
        title: "Send refund confirmation",
        done: false,
        dueAt: daysAgo(-1),
      },
    ],
    subscribedEmail: true,
    subscribedSms: false,
    custom: { plan: "Pro", seats: 48, mrr: "$1,920" },
    createdAt: daysAgo(210),
    updatedAt: hoursAgo(3),
  },
  {
    id: "demo-person-2",
    name: "Devon Parker",
    email: "devon@lumen.app",
    avatarUrl: "",
    company: "Lumen",
    phone: "+1 (212) 555-0184",
    location: "New York, NY",
    timezone: "ET (UTC−5)",
    language: "English",
    title: "Ops Manager",
    lifecycle: "trial",
    owner: "Aria Sharma",
    website: "lumen.app",
    tags: ["feature-request"],
    notes: [],
    tasks: [
      { id: "t2", title: "Share SSO setup guide", done: true, dueAt: daysAgo(6) },
    ],
    subscribedEmail: true,
    subscribedSms: true,
    custom: { plan: "Trial", seats: 12, mrr: "$0" },
    createdAt: daysAgo(12),
    updatedAt: hoursAgo(1),
  },
  {
    id: "demo-person-3",
    name: "Priya Nair",
    email: "priya@grovehq.com",
    avatarUrl: "",
    company: "Grove HQ",
    phone: "",
    location: "Austin, TX",
    timezone: "CT (UTC−6)",
    language: "English",
    title: "Developer",
    lifecycle: "customer",
    owner: "June Park",
    website: "grovehq.com",
    tags: [],
    notes: [],
    tasks: [],
    subscribedEmail: true,
    subscribedSms: false,
    custom: { plan: "Growth", seats: 25, mrr: "$875" },
    createdAt: daysAgo(96),
    updatedAt: daysAgo(1),
  },
  {
    id: "demo-person-4",
    name: "Tomas Ruiz",
    email: "tomas@fielded.co",
    avatarUrl: "",
    company: "Fielded",
    phone: "+34 600 123 456",
    location: "Madrid, ES",
    timezone: "CET (UTC+1)",
    language: "Spanish",
    title: "Field Operations",
    lifecycle: "lead",
    owner: "",
    website: "fielded.co",
    tags: ["bug"],
    notes: [],
    tasks: [{ id: "t3", title: "Follow up on mobile logout bug", done: false, dueAt: daysAgo(-3) }],
    subscribedEmail: false,
    subscribedSms: false,
    custom: { plan: "—", seats: 6, mrr: "$0" },
    createdAt: daysAgo(4),
    updatedAt: hoursAgo(5),
  },
  {
    id: "demo-person-5",
    name: "Hannah Feld",
    email: "hannah@brightloop.io",
    avatarUrl: "",
    company: "Brightloop",
    phone: "",
    location: "Berlin, DE",
    timezone: "CET (UTC+1)",
    language: "German",
    title: "Product Designer",
    lifecycle: "customer",
    owner: "Marco Diaz",
    website: "brightloop.io",
    tags: [],
    notes: [
      {
        id: "n2",
        body: "Loves the new dashboard — candidate for a testimonial.",
        author: "Marco Diaz",
        createdAt: daysAgo(9),
      },
    ],
    tasks: [],
    subscribedEmail: true,
    subscribedSms: false,
    custom: { plan: "Team", seats: 18, mrr: "$540" },
    createdAt: daysAgo(140),
    updatedAt: daysAgo(3),
  },
  {
    id: "demo-person-6",
    name: "Owen Blake",
    email: "owen@harborline.com",
    avatarUrl: "",
    company: "Harborline",
    phone: "+1 (206) 555-0119",
    location: "Seattle, WA",
    timezone: "PT (UTC−8)",
    language: "English",
    title: "Finance Lead",
    lifecycle: "churned",
    owner: "Aria Sharma",
    website: "harborline.com",
    tags: ["billing"],
    notes: [],
    tasks: [],
    subscribedEmail: false,
    subscribedSms: false,
    custom: { plan: "Cancelled", seats: 0, mrr: "$0" },
    createdAt: daysAgo(320),
    updatedAt: daysAgo(12),
  },
];

export const DEFAULT_SEGMENTS = [
  {
    id: "seg-all",
    name: "All contacts",
    description: "Everyone with a contact record in this workspace.",
    rules: [],
    builtIn: true,
    createdAt: daysAgo(90),
    updatedAt: hoursAgo(26),
  },
  {
    id: "seg-vip",
    name: "VIPs",
    description: "Lifecycle is VIP or tagged vip.",
    rules: [{ field: "tag", operator: "is", value: "vip" }],
    builtIn: true,
    createdAt: daysAgo(60),
    updatedAt: daysAgo(4),
  },
  {
    id: "seg-new",
    name: "New this week",
    description: "Created in the last 7 days.",
    rules: [{ field: "created", operator: "within_days", value: "7" }],
    builtIn: true,
    createdAt: daysAgo(30),
    updatedAt: daysAgo(2),
  },
  {
    id: "seg-trials",
    name: "Active trials",
    description: "Lifecycle trial or customer without a recent reply.",
    rules: [{ field: "lifecycle", operator: "is", value: "trial" }],
    builtIn: true,
    createdAt: daysAgo(45),
    updatedAt: daysAgo(6),
  },
  {
    id: "seg-unsub",
    name: "Unsubscribed from email",
    description: "Email opt-outs — exclude from campaigns.",
    rules: [{ field: "emailOpt", operator: "is", value: "out" }],
    builtIn: true,
    createdAt: daysAgo(20),
    updatedAt: daysAgo(1),
  },
];

// ---- segment matching -------------------------------------------------------

export const SEGMENT_FIELDS = [
  { value: "lifecycle", label: "Lifecycle stage" },
  { value: "tag", label: "Tag" },
  { value: "company", label: "Company" },
  { value: "location", label: "Location" },
  { value: "emailOpt", label: "Email subscription" },
  { value: "created", label: "Created" },
];

export const SEGMENT_OPERATORS = [
  { value: "is", label: "is" },
  { value: "is_not", label: "is not" },
  { value: "contains", label: "contains" },
  { value: "within_days", label: "within last (days)" },
];

export function personMatchesRule(person, rule) {
  if (!rule?.field) return true;
  const v = (rule.value || "").toLowerCase();
  switch (rule.field) {
    case "lifecycle":
      return rule.operator === "is_not"
        ? (person.lifecycle || "") !== rule.value
        : (person.lifecycle || "") === rule.value;
    case "tag": {
      const tags = (person.tags || []).map((t) =>
        typeof t === "string" ? t.toLowerCase() : (t.name || "").toLowerCase(),
      );
      const hit = tags.some((t) => (rule.operator === "contains" ? t.includes(v) : t === v));
      return rule.operator === "is_not" ? !hit : hit;
    }
    case "company": {
      const c = (person.company || "").toLowerCase();
      const hit = rule.operator === "contains" ? c.includes(v) : c === v;
      return rule.operator === "is_not" ? !hit : hit;
    }
    case "location": {
      const loc = (person.location || "").toLowerCase();
      const hit = rule.operator === "contains" ? loc.includes(v) : loc === v;
      return rule.operator === "is_not" ? !hit : hit;
    }
    case "emailOpt": {
      const out = person.subscribedEmail === false;
      return rule.value === "out" ? out : !out;
    }
    case "created": {
      const days = Number(rule.value) || 7;
      const created = new Date(person.createdAt).getTime();
      if (Number.isNaN(created)) return false;
      return Date.now() - created <= days * 86400000;
    }
    default:
      return true;
  }
}

export function personMatchesSegment(person, segment) {
  const rules = segment?.rules || [];
  if (rules.length === 0) return true;
  return rules.every((r) => personMatchesRule(person, r));
}

export function ruleSummary(rule) {
  const field = SEGMENT_FIELDS.find((f) => f.value === rule.field)?.label || rule.field;
  const op = SEGMENT_OPERATORS.find((o) => o.value === rule.operator)?.label || rule.operator;
  return `${field} ${op} ${rule.value || "—"}`;
}

// ---- timeline ---------------------------------------------------------------

export const TIMELINE_META = {
  conversation: { label: "Conversation", icon: MessagesSquare, tone: "text-sky-400" },
  ticket: { label: "Ticket", icon: TicketIcon, tone: "text-amber-400" },
  note: { label: "Note", icon: StickyNote, tone: "text-violet-400" },
  tag: { label: "Tag", icon: TagIcon, tone: "text-emerald-400" },
  task: { label: "Task", icon: ListChecks, tone: "text-pink-400" },
  person: { label: "Contact", icon: UserPlus, tone: "text-text-secondary" },
};

export function buildTimeline({ person, conversations, tickets, tagsByConversation }) {
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
    for (const t of c.tags || tagsByConversation?.[c.id] || []) {
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

export function deriveCompanies(people, conversations) {
  const byCompany = new Map();
  for (const p of people || []) {
    const name = (p.company || "").trim() || "No company";
    if (!byCompany.has(name)) {
      byCompany.set(name, {
        id: `company-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
        name,
        domain: domainOf(p.email) || (p.website || ""),
        website: p.website || (domainOf(p.email) ? `www.${domainOf(p.email)}` : ""),
        owner: p.owner || "",
        people: [],
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
      });
    }
    const c = byCompany.get(name);
    c.people.push(p);
    if (!c.owner && p.owner) c.owner = p.owner;
    if (p.createdAt && (!c.createdAt || p.createdAt < c.createdAt)) c.createdAt = p.createdAt;
    if (p.updatedAt && (!c.updatedAt || p.updatedAt > c.updatedAt)) c.updatedAt = p.updatedAt;
  }
  const convos = conversations || [];
  return [...byCompany.values()].map((c) => {
    const emails = new Set(c.people.map((p) => (p.email || "").toLowerCase()));
    const ids = new Set(c.people.map((p) => p.id));
    const related = convos.filter(
      (cv) =>
        ids.has(cv.contactId) ||
        (cv.contactEmail && emails.has((cv.contactEmail || "").toLowerCase())),
    );
    const open = related.filter((cv) => (cv.status || "").toLowerCase() !== "closed");
    const last = related
      .map((cv) => cv.lastMessageAt || cv.createdAt)
      .filter(Boolean)
      .sort()
      .reverse()[0];
    return {
      ...c,
      contactCount: c.people.length,
      conversationCount: related.length,
      openCount: open.length,
      lastActivityAt: last || c.updatedAt,
    };
  });
}

export { Building2 };
