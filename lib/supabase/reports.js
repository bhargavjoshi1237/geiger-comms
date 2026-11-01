// Geiger Comms reports data layer: reads the comms.report_* aggregates (20261021104932_report_analytics) so only totals reach the browser; calls take { projectId, from, to, filter, tz }.
// DB snake_case ↔ UI camelCase at this boundary; pure data access — console.error and return null on failure (incl. before that migration is pushed), never throw or toast.

import { createClient } from "./client";
import { isSupabaseConfigured } from "./comms";

const FILTER_KEYS = ["channel", "teamId", "teammateId"];

function rpcFilter(filter) {
  const out = {};
  for (const key of FILTER_KEYS) {
    if (filter?.[key]) out[key] = filter[key];
  }
  return out;
}

const count = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const measure = (value) => {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const list = (value) => (Array.isArray(value) ? value : []);

function normalizeDurations(row) {
  return { median: measure(row?.median), p90: measure(row?.p90), count: count(row?.n) };
}

async function callReport(fn, args, normalize) {
  if (!args.p_project || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await createClient().rpc(fn, args);
    if (error) {
      console.error(`[reports.${fn}]`, error.message);
      return null;
    }
    return normalize(data);
  } catch (e) {
    console.error(`[reports.${fn}]`, e);
    return null;
  }
}

function baseArgs({ projectId, from, to, filter }) {
  return { p_project: projectId ?? null, p_from: from, p_to: to, p_filter: rpcFilter(filter) };
}

// ---- normalize (snake -> camel) ---------------------------------------------

export function normalizeConversationReport(data) {
  if (!data || typeof data !== "object") return null;
  return {
    unit: data.unit ?? "day",
    created: count(data.new),
    closed: count(data.closed),
    open: count(data.open),
    snoozed: count(data.snoozed),
    byChannel: list(data.by_channel).map((row) => ({
      channel: row.channel ?? "Chat",
      created: count(row.new),
      closed: count(row.closed),
    })),
    series: list(data.series).map((row) => ({
      bucket: row.bucket,
      created: count(row.new),
      closed: count(row.closed),
    })),
  };
}

export function normalizeResponsivenessReport(data) {
  if (!data || typeof data !== "object") return null;
  return {
    unit: data.unit ?? "day",
    firstResponse: normalizeDurations(data.first_response),
    unanswered: count(data.unanswered),
    timeToClose: normalizeDurations(data.time_to_close),
    series: list(data.series).map((row) => ({
      bucket: row.bucket,
      firstResponseMedian: measure(row.first_response_median),
      firstResponseCount: count(row.first_response_n),
      timeToCloseMedian: measure(row.time_to_close_median),
      timeToCloseCount: count(row.time_to_close_n),
    })),
  };
}

export function normalizeSlaRow(row) {
  return {
    policyId: row.policy_id,
    name: row.name ?? "",
    enabled: row.enabled ?? true,
    deleted: Boolean(row.deleted),
    conversations: count(row.conversations),
    firstResponse: {
      met: count(row.first_response_met),
      missed: count(row.first_response_missed),
      pending: count(row.first_response_pending),
    },
    resolution: {
      met: count(row.resolution_met),
      missed: count(row.resolution_missed),
      pending: count(row.resolution_pending),
    },
  };
}

export function normalizeCsatReport(data) {
  if (!data || typeof data !== "object") return null;
  return {
    unit: data.unit ?? "day",
    count: count(data.n),
    average: measure(data.average),
    positive: count(data.positive),
    distribution: list(data.distribution).map((row) => ({ score: count(row.score), count: count(row.n) })),
    series: list(data.series).map((row) => ({
      bucket: row.bucket,
      average: measure(row.average),
      count: count(row.n),
    })),
    recent: list(data.recent).map((row) => ({
      conversationId: row.conversation_id,
      subject: row.subject ?? "",
      channel: row.channel ?? "Chat",
      contactName: row.contact_name ?? "",
      teammateName: row.teammate_name ?? "",
      score: count(row.score),
      comment: row.comment ?? "",
      ratedAt: row.rated_at ?? null,
    })),
  };
}

export function normalizeTeammateRow(row) {
  return {
    teammateId: row.teammate_id,
    name: row.name ?? "",
    email: row.email ?? "",
    avatarUrl: row.avatar_url ?? "",
    assigned: count(row.assigned),
    closed: count(row.closed),
    replies: count(row.replies),
    firstResponseMedian: measure(row.first_response_median),
    firstResponseCount: count(row.first_response_n),
    csatAverage: measure(row.csat_average),
    csatCount: count(row.csat_n),
  };
}

// ---- reports -------------------------------------------------------------------

export function getConversationReport(query) {
  return callReport(
    "report_conversations",
    { ...baseArgs(query), p_tz: query.tz ?? "UTC" },
    normalizeConversationReport,
  );
}

export function getResponsivenessReport(query) {
  return callReport(
    "report_responsiveness",
    { ...baseArgs(query), p_tz: query.tz ?? "UTC" },
    normalizeResponsivenessReport,
  );
}

export function getSlaReport(query) {
  return callReport("report_sla", baseArgs(query), (data) =>
    Array.isArray(data) ? data.map(normalizeSlaRow) : null,
  );
}

export function getCsatReport(query) {
  return callReport(
    "report_csat",
    { ...baseArgs(query), p_tz: query.tz ?? "UTC", p_limit: query.limit ?? 10 },
    normalizeCsatReport,
  );
}

export function getTeammateReport(query) {
  return callReport("report_teammates", baseArgs(query), (data) =>
    Array.isArray(data) ? data.map(normalizeTeammateRow) : null,
  );
}
