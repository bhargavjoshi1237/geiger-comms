// Durations and wall-clock times for the engine: wait steps, quiet-period triggers and snooze presets.

const UNIT_MS = { minutes: 60_000, hours: 3_600_000, days: 86_400_000 };

export function durationMs(amount, unit) {
  const n = Number(amount);
  return Number.isFinite(n) && n > 0 && UNIT_MS[unit] ? n * UNIT_MS[unit] : null;
}

// 1 + "days" → "1 day", 4 + "hours" → "4 hours".
export function durationLabel(amount, unit) {
  const n = Number(amount);
  const singular = String(unit || "").replace(/s$/, "");
  return `${n} ${n === 1 ? singular : `${singular}s`}`;
}

function safeZone(timeZone) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return timeZone;
  } catch {
    return "UTC";
  }
}

function zonedParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(date);
  const get = (type) => Number(parts.find((p) => p.type === type)?.value);
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour"), minute: get("minute") };
}

// The instant a wall-clock time happens in a zone; the second pass corrects for a DST change between guess and answer.
function zonedTimeToUtc({ year, month, day, hour, minute }, timeZone) {
  const wanted = Date.UTC(year, month - 1, day, hour, minute);
  let guess = wanted;
  for (let i = 0; i < 2; i += 1) {
    const p = zonedParts(new Date(guess), timeZone);
    guess += wanted - Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  }
  return new Date(guess);
}

// The inbox's snooze presets, with "9am" read in the project's timezone; null for an unknown preset.
export function snoozeUntil(preset, timeZone, now = new Date()) {
  if (preset === "1h") return new Date(now.getTime() + UNIT_MS.hours);
  if (preset === "3h") return new Date(now.getTime() + 3 * UNIT_MS.hours);
  const days = { tomorrow9: 1, nextweek: 7 }[preset];
  if (!days) return null;
  const zone = safeZone(timeZone);
  const today = zonedParts(now, zone);
  const target = new Date(Date.UTC(today.year, today.month - 1, today.day + days));
  return zonedTimeToUtc(
    { year: target.getUTCFullYear(), month: target.getUTCMonth() + 1, day: target.getUTCDate(), hour: 9, minute: 0 },
    zone,
  );
}

export function formatInZone(date, timeZone) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: safeZone(timeZone),
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
}
