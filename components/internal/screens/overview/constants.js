// Lookups & formatters for the Comms Overview screen. Values mirror the
// comms.conversations column contracts (see supabase/migrations — channel:
// Chat | Email | Slack | WhatsApp | Instagram, status: Open | Snoozed |
// Closed, priority: Urgent | Normal | Low).

import { AlertTriangle, Minus, TrendingDown } from "lucide-react";

// Conversation status → badge styling for StatusPill (EVENT_STATUS_MAP shape).
export const CONVERSATION_STATUS_MAP = {
  Open: { label: "Open", variant: "success", dotClass: "bg-emerald-400" },
  Snoozed: { label: "Snoozed", variant: "warning", dotClass: "bg-amber-400" },
  Closed: { label: "Closed", variant: "outline", dotClass: "bg-[#737373]" },
};

// Known support channels, in display order. Conversations may carry other
// values (the column is free text), so widgets derive the list from rows and
// fall back to this for demo/empty cases.
export const CONVERSATION_CHANNELS = [
  "Chat",
  "Email",
  "Slack",
  "WhatsApp",
  "Instagram",
];

// Priority → icon + tone for the conversations table (MOMENTUM_META shape).
export const PRIORITY_META = {
  Urgent: { label: "Urgent", icon: AlertTriangle, className: "text-red-400" },
  Normal: { label: "Normal", icon: Minus, className: "text-sky-300" },
  Low: { label: "Low", icon: TrendingDown, className: "text-text-secondary" },
};

export const PRIORITY_WEIGHT = { Urgent: 3, Normal: 2, Low: 1 };

// Chart palette shared by every Overview widget (line, donut, radar, gauge).
export const CHART_COLORS = {
  primary: "#ffffff",
  appBackground: "#161616",
};

export const CHART_SERIES_COLORS = ["#ffffff", "#d4d4d4", "#a3a3a3", "#737373", "#525252"];

// Compact age of a timestamp ("3h ago"). `nowMs` lets callers pin the base
// time to a load snapshot so renders stay pure; it falls back to Date.now()
// when no snapshot exists (demo data).
export function formatRelativeTime(dateStr, nowMs) {
  const t = new Date(dateStr).getTime();
  if (!Number.isFinite(t)) return "—";
  const diff = Math.max(0, (nowMs || Date.now()) - t);
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}
