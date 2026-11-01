// The workflow builder's catalog: triggers, conditions and actions (Intercom's workflow surface), the starter templates, and canvas settings.
// Trigger keys mirror the comms.workflows trigger check (20261018184859_workflow_builder); step keys are what lib/automation runs, except those lib/workflows/availability.js marks unavailable.

import {
  AlarmClock,
  Bot,
  CheckCircle2,
  ClipboardCheck,
  Flag,
  GitBranch,
  Hourglass,
  MessageSquare,
  MessageSquarePlus,
  MessageSquareReply,
  PencilLine,
  RefreshCw,
  Reply,
  Star,
  StickyNote,
  Tag,
  Ticket,
  Timer,
  UserCheck,
  UserPlus,
  Webhook,
} from "lucide-react";

import { CONVERSATION_CHANNELS } from "../overview/constants";

export const CANVAS_FIT_VIEW = { padding: 0.35, maxZoom: 0.75 };

export const SNAP_SIZES = [8, 16, 24];

const WAIT_UNITS = ["minutes", "hours", "days"];

export const TRIGGER_CATALOG = [
  {
    key: "created",
    label: "New conversation",
    icon: MessageSquarePlus,
    group: "Conversations",
    description: "A customer starts a new conversation.",
  },
  {
    key: "replied",
    label: "Customer replies",
    icon: Reply,
    group: "Conversations",
    description: "A customer sends a message in an existing conversation.",
  },
  {
    key: "teammate_replied",
    label: "Teammate replies",
    icon: MessageSquareReply,
    group: "Conversations",
    description: "A teammate replies to the customer.",
  },
  {
    key: "assigned",
    label: "Conversation assigned",
    icon: UserCheck,
    group: "Conversations",
    description: "A conversation is assigned to a teammate or team.",
  },
  {
    key: "tagged",
    label: "Tag added",
    icon: Tag,
    group: "Conversations",
    description: "A tag is added to a conversation.",
    fields: [{ key: "tag", label: "Tag (blank = any tag)", type: "text", default: "" }],
  },
  {
    key: "state_changed",
    label: "State changes",
    icon: RefreshCw,
    group: "Conversations",
    description: "A conversation is closed, snoozed or reopened.",
    fields: [
      {
        key: "to",
        label: "Changes to",
        type: "select",
        options: ["Any state", "Closed", "Snoozed", "Reopened"],
        default: "Any state",
      },
    ],
  },
  {
    key: "customer_unresponsive",
    label: "Customer unresponsive",
    icon: Hourglass,
    group: "Time-based",
    description: "The customer hasn't replied for a while.",
    fields: [
      { key: "amount", label: "After", type: "number", default: "2" },
      { key: "unit", label: "Unit", type: "select", options: WAIT_UNITS, default: "days" },
    ],
  },
  {
    key: "teammate_unresponsive",
    label: "Teammate unresponsive",
    icon: Timer,
    group: "Time-based",
    description: "The customer is waiting on a teammate's reply.",
    fields: [
      { key: "amount", label: "After", type: "number", default: "4" },
      { key: "unit", label: "Unit", type: "select", options: WAIT_UNITS, default: "hours" },
    ],
  },
  {
    key: "ticket_created",
    label: "Ticket created",
    icon: Ticket,
    group: "Tickets",
    description: "A customer, back-office or tracker ticket is created.",
  },
  {
    key: "ticket_state_changed",
    label: "Ticket state changes",
    icon: ClipboardCheck,
    group: "Tickets",
    description: "A ticket moves to a new state.",
    fields: [
      {
        key: "to",
        label: "Changes to",
        type: "select",
        options: ["Any state", "Submitted", "In progress", "Waiting", "Resolved"],
        default: "Any state",
      },
    ],
  },
];

export const CONDITION_CATALOG = [
  {
    key: "if.channel",
    label: "Channel is",
    icon: GitBranch,
    description: "Continue only for conversations on a channel.",
    fields: [
      { key: "channel", label: "Channel", type: "select", options: CONVERSATION_CHANNELS, default: "Chat" },
    ],
  },
  {
    key: "if.priority",
    label: "Priority is",
    icon: GitBranch,
    description: "Continue only at a priority.",
    fields: [
      { key: "priority", label: "Priority", type: "select", options: ["Urgent", "Normal", "Low"], default: "Urgent" },
    ],
  },
  {
    key: "if.tag",
    label: "Has tag",
    icon: GitBranch,
    description: "Continue only when the conversation has a tag.",
    fields: [{ key: "tag", label: "Tag", type: "text", default: "" }],
  },
  {
    key: "if.state",
    label: "State is",
    icon: GitBranch,
    description: "Continue only in a conversation state.",
    fields: [
      { key: "state", label: "State", type: "select", options: ["Open", "Snoozed", "Closed"], default: "Open" },
    ],
  },
  {
    key: "if.office_hours",
    label: "Office hours",
    icon: GitBranch,
    description: "Branch on whether your team is in office hours.",
    fields: [
      {
        key: "when",
        label: "When",
        type: "select",
        options: [
          { value: "inside", label: "Inside office hours" },
          { value: "outside", label: "Outside office hours" },
        ],
        default: "outside",
      },
    ],
  },
  {
    key: "if.assignee",
    label: "Assignment",
    icon: GitBranch,
    description: "Continue only if the conversation is (un)assigned.",
    fields: [
      {
        key: "assignee",
        label: "Conversation is",
        type: "select",
        options: [
          { value: "unassigned", label: "Unassigned" },
          { value: "assigned", label: "Assigned" },
        ],
        default: "unassigned",
      },
    ],
  },
  {
    key: "if.message_contains",
    label: "Message contains",
    icon: GitBranch,
    description: "Continue only when the message mentions a phrase.",
    fields: [{ key: "text", label: "Phrase", type: "text", default: "" }],
  },
  {
    key: "if.contact_attribute",
    label: "Contact attribute",
    icon: GitBranch,
    description: "Branch on a contact or company attribute.",
    fields: [
      {
        key: "attribute",
        label: "Attribute",
        type: "select",
        options: ["Plan", "Company", "Lifecycle", "Location", "Email domain"],
        default: "Plan",
      },
      { key: "operator", label: "Operator", type: "select", options: ["is", "is not", "contains"], default: "is" },
      { key: "value", label: "Value", type: "text", default: "" },
    ],
  },
];

export const ACTION_CATALOG = [
  {
    key: "reply",
    label: "Send a reply",
    icon: MessageSquare,
    group: "Conversation",
    description: "Reply to the customer.",
    fields: [{ key: "message", label: "Message", type: "textarea", default: "" }],
  },
  {
    key: "note",
    label: "Add a note",
    icon: StickyNote,
    group: "Conversation",
    description: "Leave an internal note for your team.",
    fields: [{ key: "note", label: "Note", type: "textarea", default: "" }],
  },
  {
    key: "assign",
    label: "Assign",
    icon: UserPlus,
    group: "Conversation",
    description: "Route the conversation to a teammate or team.",
    fields: [
      {
        key: "strategy",
        label: "Assign by",
        type: "select",
        options: [
          { value: "round_robin", label: "Round robin" },
          { value: "load", label: "Balanced workload" },
          { value: "direct", label: "A specific teammate or team" },
        ],
        default: "round_robin",
      },
      { key: "to", label: "Teammate or team (blank = anyone available)", type: "text", default: "" },
    ],
  },
  {
    key: "tag.add",
    label: "Add tag",
    icon: Tag,
    group: "Conversation",
    description: "Tag the conversation.",
    fields: [{ key: "tag", label: "Tag", type: "text", default: "" }],
  },
  {
    key: "tag.remove",
    label: "Remove tag",
    icon: Tag,
    group: "Conversation",
    description: "Remove a tag from the conversation.",
    fields: [{ key: "tag", label: "Tag", type: "text", default: "" }],
  },
  {
    key: "priority",
    label: "Set priority",
    icon: Flag,
    group: "Conversation",
    description: "Change the conversation's priority.",
    fields: [
      { key: "priority", label: "Priority", type: "select", options: ["Urgent", "Normal", "Low"], default: "Urgent" },
    ],
  },
  {
    key: "snooze",
    label: "Snooze",
    icon: AlarmClock,
    group: "Conversation",
    description: "Snooze the conversation.",
    fields: [
      {
        key: "duration",
        label: "For",
        type: "select",
        options: [
          { value: "1h", label: "1 hour" },
          { value: "3h", label: "3 hours" },
          { value: "tomorrow9", label: "Until tomorrow 9am" },
          { value: "nextweek", label: "Until next week" },
        ],
        default: "tomorrow9",
      },
    ],
  },
  {
    key: "close",
    label: "Close conversation",
    icon: CheckCircle2,
    group: "Conversation",
    description: "Close the conversation.",
  },
  {
    key: "sla",
    label: "Apply SLA",
    icon: Timer,
    group: "Conversation",
    description: "Start an SLA policy's response and resolution clock.",
    fields: [{ key: "policy", label: "SLA policy", type: "text", default: "" }],
  },
  {
    key: "ticket",
    label: "Convert to ticket",
    icon: Ticket,
    group: "Conversation",
    description: "Create a ticket from the conversation.",
    fields: [
      {
        key: "type",
        label: "Ticket type",
        type: "select",
        options: [
          { value: "customer", label: "Customer" },
          { value: "back_office", label: "Back-office" },
          { value: "tracker", label: "Tracker" },
        ],
        default: "customer",
      },
    ],
  },
  {
    key: "survey",
    label: "Send CSAT survey",
    icon: Star,
    group: "Conversation",
    description: "Ask the customer to rate the conversation.",
  },
  {
    key: "ai_answer",
    label: "Let the AI agent answer",
    icon: Bot,
    group: "Advanced",
    description: "The AI agent replies first; unresolved conversations continue to the next step.",
  },
  {
    key: "wait",
    label: "Wait",
    icon: Hourglass,
    group: "Advanced",
    description: "Pause before the next step.",
    fields: [
      { key: "amount", label: "Amount", type: "number", default: "1" },
      { key: "unit", label: "Unit", type: "select", options: WAIT_UNITS, default: "hours" },
    ],
  },
  {
    key: "webhook",
    label: "Send webhook",
    icon: Webhook,
    group: "Advanced",
    description: "Make an HTTP request to an external URL.",
    fields: [
      { key: "method", label: "Method", type: "select", options: ["POST", "GET", "PUT"], default: "POST" },
      { key: "url", label: "URL", type: "text", default: "https://" },
    ],
  },
  {
    key: "contact.update",
    label: "Update contact",
    icon: PencilLine,
    group: "Advanced",
    description: "Set an attribute on the contact.",
    fields: [
      { key: "attribute", label: "Attribute", type: "text", default: "" },
      { key: "value", label: "Value", type: "text", default: "" },
    ],
  },
];

const ENTRY_BY_KEY = Object.fromEntries(
  [...TRIGGER_CATALOG, ...CONDITION_CATALOG, ...ACTION_CATALOG].map((e) => [e.key, e]),
);

export function catalogEntry(key) {
  return ENTRY_BY_KEY[key] || null;
}

export const TRIGGER_FILTER_OPTIONS = [
  { value: "all", label: "All triggers" },
  ...TRIGGER_CATALOG.map((t) => ({ value: t.key, label: t.label })),
];

// Select options may be plain strings or { value, label } pairs.
export function fieldOptions(field) {
  return (field?.options || []).map((o) => (typeof o === "string" ? { value: o, label: o } : o));
}

export function optionLabel(field, value) {
  return fieldOptions(field).find((o) => o.value === value)?.label ?? value;
}

export function groupByGroup(entries) {
  const groups = [];
  const index = new Map();
  for (const entry of entries) {
    const name = entry.group || "Other";
    if (!index.has(name)) {
      index.set(name, { group: name, items: [] });
      groups.push(index.get(name));
    }
    index.get(name).items.push(entry);
  }
  return groups;
}

export function defaultConfig(entry) {
  const config = {};
  for (const field of entry?.fields || []) config[field.key] = field.default ?? "";
  return config;
}

export function summarizeConfig(entry, config) {
  if (!entry?.fields?.length) return entry?.description || "";
  const parts = entry.fields
    .map((f) => {
      const v = config?.[f.key];
      if (v === undefined || v === null || v === "") return null;
      return `${f.label}: ${optionLabel(f, v)}`;
    })
    .filter(Boolean);
  return parts.length ? parts.join(" · ") : entry?.description || "Not configured";
}

// Steps after the trigger, for "When X · N steps" meta lines.
export function stepCount(steps) {
  return Math.max(0, (steps?.length || 1) - 1);
}

export function stepCountLabel(steps) {
  const n = stepCount(steps);
  return `${n} step${n === 1 ? "" : "s"}`;
}

// ---- templates -------------------------------------------------------------------

export const WORKFLOW_TEMPLATE_CATEGORY_MAP = {
  Routing: { label: "Routing", variant: "info" },
  Escalation: { label: "Escalation", variant: "warning" },
  "Customer experience": { label: "Customer experience", variant: "purple" },
  Tickets: { label: "Tickets", variant: "neutral" },
  AI: { label: "AI", variant: "success" },
};

export const WORKFLOW_TEMPLATE_CATEGORY_OPTIONS = [
  { value: "all", label: "All categories" },
  ...Object.keys(WORKFLOW_TEMPLATE_CATEGORY_MAP).map((c) => ({ value: c, label: c })),
];

export const WORKFLOW_TEMPLATES = [
  {
    id: "tmpl_round_robin",
    name: "Auto-assign new conversations",
    description: "Share new conversations evenly across the teammates who are available.",
    category: "Routing",
    trigger: "created",
    steps: [
      { kind: "trigger", type: "created", config: {} },
      { kind: "action", type: "assign", config: { strategy: "round_robin", to: "" } },
    ],
  },
  {
    id: "tmpl_out_of_office",
    name: "Out-of-office reply",
    description: "Let customers know when you'll be back if they write in outside office hours.",
    category: "Customer experience",
    trigger: "created",
    steps: [
      { kind: "trigger", type: "created", config: {} },
      { kind: "condition", type: "if.office_hours", config: { when: "outside" } },
      {
        kind: "action",
        type: "reply",
        config: {
          message:
            "Thanks for reaching out! We're offline right now — we'll reply first thing when we're back.",
        },
      },
    ],
  },
  {
    id: "tmpl_urgent_escalation",
    name: "Escalate urgent conversations",
    description: "Send urgent conversations straight to your second line and start the tightest SLA.",
    category: "Escalation",
    trigger: "created",
    steps: [
      { kind: "trigger", type: "created", config: {} },
      { kind: "condition", type: "if.priority", config: { priority: "Urgent" } },
      { kind: "action", type: "assign", config: { strategy: "direct", to: "Tier 2" } },
      { kind: "action", type: "sla", config: { policy: "VIP Urgent" } },
      { kind: "action", type: "note", config: { note: "Urgent — escalated to Tier 2." } },
    ],
  },
  {
    id: "tmpl_bug_tracker",
    name: "Bug reports to a tracker",
    description: "Turn conversations tagged as bugs into a tracker ticket and tell the customer.",
    category: "Tickets",
    trigger: "tagged",
    steps: [
      { kind: "trigger", type: "tagged", config: { tag: "bug" } },
      { kind: "action", type: "ticket", config: { type: "tracker" } },
      {
        kind: "action",
        type: "reply",
        config: { message: "Thanks for the report — we're tracking this and will update you here." },
      },
    ],
  },
  {
    id: "tmpl_nudge_customer",
    name: "Nudge unresponsive customers",
    description: "Check in when a customer goes quiet, then close the conversation if they stay quiet.",
    category: "Customer experience",
    trigger: "customer_unresponsive",
    steps: [
      { kind: "trigger", type: "customer_unresponsive", config: { amount: "2", unit: "days" } },
      {
        kind: "action",
        type: "reply",
        config: { message: "Just checking in — is there anything else we can help with?" },
      },
      { kind: "action", type: "wait", config: { amount: "1", unit: "days" } },
      { kind: "action", type: "close", config: {} },
    ],
  },
  {
    id: "tmpl_reassign_quiet",
    name: "Reassign when a teammate goes quiet",
    description: "Move a waiting conversation to whoever has the lightest load and leave a note.",
    category: "Escalation",
    trigger: "teammate_unresponsive",
    steps: [
      { kind: "trigger", type: "teammate_unresponsive", config: { amount: "4", unit: "hours" } },
      { kind: "action", type: "assign", config: { strategy: "load", to: "" } },
      { kind: "action", type: "note", config: { note: "Reassigned — no teammate reply in 4 hours." } },
    ],
  },
  {
    id: "tmpl_csat",
    name: "CSAT survey after close",
    description: "Ask for a rating as soon as a conversation is closed.",
    category: "Customer experience",
    trigger: "state_changed",
    steps: [
      { kind: "trigger", type: "state_changed", config: { to: "Closed" } },
      { kind: "action", type: "survey", config: {} },
    ],
  },
  {
    id: "tmpl_ai_first",
    name: "AI agent answers first",
    description: "Let the AI agent take new chats, and route anything it can't resolve to the team.",
    category: "AI",
    trigger: "created",
    steps: [
      { kind: "trigger", type: "created", config: {} },
      { kind: "condition", type: "if.channel", config: { channel: "Chat" } },
      { kind: "action", type: "ai_answer", config: {} },
      { kind: "action", type: "assign", config: { strategy: "round_robin", to: "" } },
    ],
  },
];
