// Fixed showcase dataset for the Comms Overview screen's `demo` mode (the
// public landing-page playground, which has no real project/session). The
// live workspace never reads from this file — see data_helpers.js.

import { AlarmClock, AlertTriangle, Clock, Inbox, UserPlus } from "lucide-react";

function minutesAgo(m) {
  return new Date(Date.now() - m * 60000).toISOString();
}

export const DEMO_WORKSPACE_SUMMARY = [
  { label: "Conversations", value: "1,286" },
  { label: "Unread", value: "34" },
  { label: "Waiting on Us", value: "58" },
];

export const DEMO_STATS = [
  { label: "Conversations", value: "1,286", delta: "+9.4%", trend: "up", footer: "VS Last Period" },
  { label: "Unread", value: "34", delta: "+4.2%", trend: "down", footer: "VS Last Period" },
  { label: "Awaiting Reply", value: "58", delta: "-6.8%", trend: "down", footer: "VS Last Period" },
  { label: "Resolved", value: "1,072", delta: "+11.2%", trend: "up", footer: "VS Last Period" },
];

export const DEMO_TREND_SERIES = {
  created: [38, 44, 41, 52, 48, 60, 66, 62, 74, 80, 86, 92],
  activity: [52, 60, 58, 70, 66, 78, 84, 82, 92, 100, 108, 118],
};

export const DEMO_CHANNEL_MIX = [
  { key: "Email", label: "Email", value: 520 },
  { key: "Chat", label: "Chat", value: 430 },
  { key: "WhatsApp", label: "WhatsApp", value: 180 },
  { key: "Slack", label: "Slack", value: 96 },
  { key: "Instagram", label: "Instagram", value: 60 },
];

// Support lifecycle — how much of the inbox has made it to a resolution.
// `short` is the compact label used around the radar's polar axis.
export const DEMO_LIFECYCLE_FUNNEL = [
  { key: "received", label: "Conversations received", short: "Received", value: 1286 },
  { key: "active", label: "Still active (open or snoozed)", short: "Active", value: 214 },
  { key: "resolved", label: "Resolved (closed)", short: "Resolved", value: 1072 },
];

export const DEMO_RESOLUTION = { value: 83, resolved: 1072, received: 1286 };
export const DEMO_BACKLOG = { value: 27, waiting: 58, active: 214 };

// Conversations ranked by recency/priority for the selected period.
export const DEMO_TOP_CONVERSATIONS = [
  { id: "demo-c1", subject: "Refund for double-charged invoice", contactName: "Maya Chen", channel: "Email", status: "Open", priority: "Urgent", lastMessageAt: minutesAgo(12), waitingOnUs: true },
  { id: "demo-c2", subject: "Can't log in after password reset", contactName: "Jonas Weber", channel: "Chat", status: "Open", priority: "Normal", lastMessageAt: minutesAgo(38), waitingOnUs: true },
  { id: "demo-c3", subject: "Bulk import of contacts failing", contactName: "Priya Nair", channel: "Slack", status: "Snoozed", priority: "Normal", lastMessageAt: minutesAgo(180), waitingOnUs: false },
  { id: "demo-c4", subject: "Template approval question", contactName: "Diego Alvarez", channel: "WhatsApp", status: "Open", priority: "Low", lastMessageAt: minutesAgo(320), waitingOnUs: true },
  { id: "demo-c5", subject: "Invoice PDF missing VAT number", contactName: "Amara Okafor", channel: "Instagram", status: "Closed", priority: "Low", lastMessageAt: minutesAgo(1500), waitingOnUs: false },
];

// Operational threads waiting on the team — the reason to open this screen.
export const DEMO_ATTENTION_ITEMS = [
  { key: "unread", label: "Unread conversations", hint: "Needs a first look", value: "34", count: 34, cta: "Review", icon: Inbox, urgency: "urgent" },
  { key: "waiting", label: "Awaiting our reply", hint: "Last message from customer", value: "58", count: 58, cta: "Reply", icon: Clock, urgency: "urgent" },
  { key: "priority", label: "Urgent priority threads", hint: "Marked urgent", value: "7", count: 7, cta: "Triage", icon: AlertTriangle, urgency: "soon" },
  { key: "unassigned", label: "Unassigned threads", hint: "No owner yet", value: "15", count: 15, cta: "Assign", icon: UserPlus, urgency: "soon" },
  { key: "snoozed", label: "Snoozed conversations", hint: "Scheduled to reopen", value: "22", count: 22, cta: "Reopen", icon: AlarmClock, urgency: "routine" },
];
