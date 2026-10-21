// Lookups and helpers for Settings → Business Hours. Config only — schedules themselves come from lib/supabase/business_hours.js.

import { WEEKDAYS } from "@/lib/supabase/business_hours";

export const WEEKDAY_LABELS = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday",
};

const SHORT = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" };

export const HOURS_STATE_MAP = {
  open: { label: "Open now", variant: "success", dotClass: "bg-emerald-400" },
  closed: { label: "Closed now", variant: "neutral", dotClass: "bg-text-tertiary" },
  holiday: { label: "Holiday", variant: "warning", dotClass: "bg-amber-400" },
  disabled: { label: "Disabled", variant: "outline", dotClass: "bg-text-tertiary" },
};

export function timeZoneOptions() {
  const zones = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [];
  return ["UTC", ...zones.filter((z) => z !== "UTC")];
}

export function browserTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

const toMinutes = (hhmm) => {
  const [h, m] = String(hhmm).split(":").map(Number);
  return h * 60 + m;
};

// A day is usable when it's open with a close time after its open time (same-day windows only, as the SLA engine reads them).
export function dayError(day) {
  if (!day || day.closed) return null;
  return toMinutes(day.close) > toMinutes(day.open) ? null : "Closing time must be after opening time.";
}

// "Mon–Fri 09:00–17:00 · Sat 10:00–14:00"; consecutive days with the same hours collapse into a range.
export function summarizeWeek(schedule) {
  const groups = [];
  for (const day of WEEKDAYS) {
    const d = schedule?.[day];
    const hours = !d || d.closed ? null : `${d.open}–${d.close}`;
    const last = groups[groups.length - 1];
    if (last && last.hours === hours) last.to = day;
    else groups.push({ from: day, to: day, hours });
  }
  const open = groups.filter((g) => g.hours);
  if (!open.length) return "Closed every day";
  return open
    .map((g) => `${g.from === g.to ? SHORT[g.from] : `${SHORT[g.from]}–${SHORT[g.to]}`} ${g.hours}`)
    .join(" · ");
}

// Local weekday, date and minute-of-day of an instant in a timezone.
function zonedNow(timeZone, at) {
  let parts;
  try {
    parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      weekday: "short",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).formatToParts(at);
  } catch {
    return zonedNow("UTC", at);
  }
  const get = (type) => parts.find((p) => p.type === type)?.value;
  return {
    day: String(get("weekday")).slice(0, 3).toLowerCase(),
    date: `${get("year")}-${get("month")}-${get("day")}`,
    minutes: Number(get("hour")) * 60 + Number(get("minute")),
  };
}

// open | closed | holiday | disabled, read the way comms.hours_open reads a row.
export function hoursStateAt(hours, at = new Date()) {
  if (!hours?.enabled) return "disabled";
  const now = zonedNow(hours.timezone || "UTC", at);
  if ((hours.holidays || []).some((h) => h.date === now.date)) return "holiday";
  const d = hours.schedule?.[now.day];
  if (!d || d.closed || dayError(d)) return "closed";
  return now.minutes >= toMinutes(d.open) && now.minutes < toMinutes(d.close) ? "open" : "closed";
}

// "YYYY-MM-DD" ↔ a local Date, so a picked calendar day never shifts across timezones.
export function toDateKey(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function fromDateKey(key) {
  const [y, m, d] = String(key).split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function formatDateKey(key) {
  return fromDateKey(key).toLocaleDateString("en-US", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
