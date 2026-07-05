// Lookups & demo config for the Inbox overview. Config only — never row data
// (conversations are fetched through lib/supabase/comms.js).

import {
  Mail,
  MessageSquare,
  Hash,
  Phone,
  Instagram,
} from "lucide-react";

// Grayscale series palette, matching the suite's charts (#161616 canvas).
export const CHART_SERIES_COLORS = [
  "#ffffff",
  "#d4d4d4",
  "#a3a3a3",
  "#737373",
  "#525252",
];

// Channel → icon + accent classes (tailwind color utilities at /10 bg + /20 border).
export const CHANNEL_META = {
  Email: { label: "Email", icon: Mail, className: "border-sky-500/20 bg-sky-500/10 text-sky-300", dot: "bg-sky-400" },
  Chat: { label: "Chat", icon: MessageSquare, className: "border-emerald-500/20 bg-emerald-500/10 text-emerald-300", dot: "bg-emerald-400" },
  Slack: { label: "Slack", icon: Hash, className: "border-violet-500/20 bg-violet-500/10 text-violet-300", dot: "bg-violet-400" },
  WhatsApp: { label: "WhatsApp", icon: Phone, className: "border-green-500/20 bg-green-500/10 text-green-300", dot: "bg-green-400" },
  Instagram: { label: "Instagram", icon: Instagram, className: "border-pink-500/20 bg-pink-500/10 text-pink-300", dot: "bg-pink-400" },
};

export const CHANNEL_ORDER = ["Email", "Chat", "Slack", "WhatsApp", "Instagram"];

// Status → pill classes.
export const STATUS_META = {
  Open: { label: "Open", className: "border-emerald-500/20 bg-emerald-500/10 text-emerald-400", dot: "bg-emerald-400" },
  Snoozed: { label: "Snoozed", className: "border-amber-500/20 bg-amber-500/10 text-amber-400", dot: "bg-amber-400" },
  Closed: { label: "Closed", className: "border-border bg-surface-card text-muted-foreground", dot: "bg-text-tertiary" },
};

// Priority → accent (used for the leading rail on urgent rows).
export const PRIORITY_META = {
  Urgent: { label: "Urgent", className: "text-red-400", rail: "bg-red-500" },
  Normal: { label: "Normal", className: "text-text-secondary", rail: "bg-transparent" },
  Low: { label: "Low", className: "text-text-tertiary", rail: "bg-transparent" },
};

// Inbox filter segments (client-side filter over the fetched list).
export const INBOX_FILTERS = [
  { value: "all", label: "All" },
  { value: "unassigned", label: "Unassigned" },
  { value: "waiting", label: "Waiting" },
  { value: "closed", label: "Closed" },
];

// Demo 14-day conversation volume (new vs resolved) for the trend chart. This
// is dashboard config, not fetched row data — the six seeded threads can't
// produce a meaningful 14-day series on their own.
export const VOLUME_SERIES = [
  { day: "Jun 22", opened: 34, resolved: 28 },
  { day: "Jun 23", opened: 41, resolved: 33 },
  { day: "Jun 24", opened: 38, resolved: 40 },
  { day: "Jun 25", opened: 52, resolved: 44 },
  { day: "Jun 26", opened: 47, resolved: 49 },
  { day: "Jun 27", opened: 29, resolved: 31 },
  { day: "Jun 28", opened: 22, resolved: 24 },
  { day: "Jun 29", opened: 45, resolved: 38 },
  { day: "Jun 30", opened: 58, resolved: 47 },
  { day: "Jul 1", opened: 63, resolved: 55 },
  { day: "Jul 2", opened: 55, resolved: 60 },
  { day: "Jul 3", opened: 49, resolved: 52 },
  { day: "Jul 4", opened: 37, resolved: 41 },
  { day: "Jul 5", opened: 44, resolved: 39 },
];

// Demo 14-day median first-response time (minutes) for the response-time area
// chart. Dashboard config, not fetched row data.
export const RESPONSE_SERIES = [
  { day: "Jun 22", minutes: 4.2 },
  { day: "Jun 23", minutes: 3.8 },
  { day: "Jun 24", minutes: 4.6 },
  { day: "Jun 25", minutes: 3.1 },
  { day: "Jun 26", minutes: 2.7 },
  { day: "Jun 27", minutes: 3.4 },
  { day: "Jun 28", minutes: 5.1 },
  { day: "Jun 29", minutes: 3.9 },
  { day: "Jun 30", minutes: 2.9 },
  { day: "Jul 1", minutes: 2.4 },
  { day: "Jul 2", minutes: 2.8 },
  { day: "Jul 3", minutes: 3.2 },
  { day: "Jul 4", minutes: 2.6 },
  { day: "Jul 5", minutes: 2.2 },
];
