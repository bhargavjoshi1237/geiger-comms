// Lookups & formatters for the Reports screens (Analytics, Quality & CSAT). Ranges are whole local days [from, to).

import { addDays, format, parseISO, startOfDay } from "date-fns";
import { CONVERSATION_CHANNELS } from "../overview/constants";

export const ALL = "all";

export const RANGE_OPTIONS = [
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
  { value: "custom", label: "Custom range" },
];

export const CHANNEL_OPTIONS = [
  { value: ALL, label: "All channels" },
  ...CONVERSATION_CHANNELS.map((c) => ({ value: c, label: c })),
];

export const RESPONSE_METRIC_OPTIONS = [
  { value: "firstResponse", label: "First response" },
  { value: "timeToClose", label: "Time to close" },
];

// comms.report_unit() picks the bucket from the range length.
export const BUCKET_LABELS = { day: "per day", week: "per week", month: "per month" };

// Series colors come from the design system's chart tokens (blue / amber are the CVD-safe pair).
export const SERIES_COLORS = { primary: "var(--chart-1)", secondary: "var(--chart-3)" };

// The last `days` days including today; `to` is the start of tomorrow.
export function presetRange(days, now = new Date()) {
  const to = addDays(startOfDay(now), 1);
  return { from: addDays(to, -days), to };
}

// A picked { from, to } of calendar days (to inclusive) as a report window.
export function customRange({ from, to }) {
  return { from: startOfDay(from), to: addDays(startOfDay(to ?? from), 1) };
}

export function formatRange({ from, to }) {
  const last = addDays(to, -1);
  if (format(from, "yyyy-MM-dd") === format(last, "yyyy-MM-dd")) return format(from, "MMM d, yyyy");
  return `${format(from, "MMM d")} – ${format(last, "MMM d, yyyy")}`;
}

// A report bucket ("YYYY-MM-DD", local) as an axis label for its unit.
export function formatBucket(bucket, unit) {
  const date = parseISO(bucket);
  return format(date, unit === "month" ? "MMM yyyy" : "MMM d");
}

// "2026-09-21_to_2026-10-21" — stamps CSV exports with the window they cover.
export function rangeSlug({ from, to }) {
  return `${format(from, "yyyy-MM-dd")}_to_${format(addDays(to, -1), "yyyy-MM-dd")}`;
}

// Seconds as a compact duration: 45s, 12m, 2h 5m, 3d 4h.
export function formatDuration(seconds) {
  if (seconds == null || !Number.isFinite(seconds)) return "—";
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s}s`;
  const minutes = Math.round(s / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return minutes % 60 ? `${hours}h ${minutes % 60}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  return hours % 24 ? `${days}d ${hours % 24}h` : `${days}d`;
}

export function formatPercent(part, whole) {
  return whole > 0 ? `${Math.round((part / whole) * 100)}%` : "—";
}

export function formatScore(average) {
  return average == null ? "—" : average.toFixed(1);
}

export const formatCount = (n) => n.toLocaleString("en-US");
