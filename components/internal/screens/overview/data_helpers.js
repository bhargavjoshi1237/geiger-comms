// Pure helpers that turn fetched comms.conversations rows into the shapes the
// Comms Overview widgets render — weekly trend buckets, channel mix, period
// deltas. No React, no fetching; keyed purely off the rows/params passed in.

import { CONVERSATION_CHANNELS } from "./constants";

export const ACTIVE_STATUSES = new Set(["Open", "Snoozed"]);

export const URGENCY_ORDER = ["urgent", "soon", "routine"];
export const URGENCY_LABELS = { urgent: "Urgent", soon: "Soon", routine: "Routine" };

export function startOfWeek(date) {
  const d = new Date(date);
  const day = (d.getDay() + 6) % 7; // Monday = 0
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - day);
  return d;
}

export function buildWeeklyBuckets(weeks) {
  const end = startOfWeek(new Date());
  const buckets = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const start = new Date(end);
    start.setDate(start.getDate() - i * 7);
    buckets.push(start);
  }
  return buckets;
}

export function weekLabel(date) {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// Adds `amount` into the last bucket whose start is <= the row's date; rows
// older than the whole window are dropped rather than lumped into bucket 0.
export function addToBucket(totals, buckets, dateStr, amount) {
  const t = new Date(dateStr).getTime();
  if (!Number.isFinite(t)) return;
  for (let i = buckets.length - 1; i >= 0; i--) {
    if (t >= buckets[i].getTime()) {
      totals[i] += amount;
      return;
    }
  }
}

export function buildWeeklyTrendSeries(conversations, weeks) {
  const created = weeks.map(() => 0);
  const activity = weeks.map(() => 0);
  for (const c of conversations) {
    addToBucket(created, weeks, c.createdAt, 1);
    addToBucket(activity, weeks, c.lastMessageAt || c.createdAt, 1);
  }
  return { created, activity };
}

export function filterByChannel(rows, scope) {
  return scope.length ? rows.filter((r) => scope.includes(r.channel)) : rows;
}

export function sumInWindow(rows, dateKey, valueFn, startMs, endMs) {
  let total = 0;
  for (const row of rows) {
    const t = new Date(row[dateKey]).getTime();
    if (Number.isFinite(t) && t >= startMs && t < endMs) total += valueFn(row);
  }
  return total;
}

// No prior-period data to compare against -> omit the delta chip rather than
// showing a misleading +/-100%.
export function periodDelta(current, previous) {
  if (previous <= 0) return { delta: null, trend: "up" };
  const pct = Math.round(((current - previous) / previous) * 100);
  return { delta: `${pct >= 0 ? "+" : ""}${pct}%`, trend: pct >= 0 ? "up" : "down" };
}

export function buildChannelMix(conversations) {
  const totals = new Map();
  for (const c of conversations) {
    const label = c.channel || "Chat";
    totals.set(label, (totals.get(label) || 0) + 1);
  }
  return [...totals.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([label, value]) => ({ key: label, label, value }));
}

export function channelsIn(rows) {
  const set = new Set(rows.map((c) => c.channel || "Chat"));
  return CONVERSATION_CHANNELS.filter((ch) => set.has(ch)).concat(
    [...set].filter((ch) => !CONVERSATION_CHANNELS.includes(ch)),
  );
}
