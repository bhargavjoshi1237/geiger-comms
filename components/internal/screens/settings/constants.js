import {
  UserPlus,
  ShieldCheck,
  Activity,
  UserMinus,
  UsersRound,
  Ban,
  Sparkles,
} from "lucide-react";

import { WORKSPACE_PERMISSIONS } from "@/lib/rbac";
import { AI_FEATURES } from "@/lib/ai/features";
import { PROVIDER_KINDS, PROVIDER_PRESETS } from "@/lib/ai/provider_kinds";

// Lookups & formatters for the Settings area (team, roles, AI providers); config only, no row data.

// --- Member status ---------------------------------------------------------

export const MEMBER_STATUS_MAP = {
  active: { label: "Active", variant: "success", dotClass: "bg-emerald-400" },
  invited: { label: "Invited", variant: "info", dotClass: "bg-sky-400" },
  suspended: { label: "Suspended", variant: "danger", dotClass: "bg-red-400" },
};

export const MEMBER_STATUS_FILTER_OPTIONS = [
  { value: "all", label: "All Statuses" },
  { value: "active", label: "Active" },
  { value: "invited", label: "Invited" },
  { value: "suspended", label: "Suspended" },
];

// Roles and groups have no accent palette; their `color` column is still normalized but nothing reads it.

// --- Domain status ---------------------------------------------------------

export const DOMAIN_STATUS_MAP = {
  connected: { label: "Connected", variant: "success", dotClass: "bg-emerald-400" },
  pending_dns: { label: "Pending DNS", variant: "warning", dotClass: "bg-amber-400" },
  pending_ssl: { label: "Pending SSL", variant: "info", dotClass: "bg-sky-400" },
  failed: { label: "Failed", variant: "danger", dotClass: "bg-red-400" },
};

export const DOMAIN_STATUS_FILTER_OPTIONS = [
  { value: "all", label: "All Statuses" },
  { value: "connected", label: "Connected" },
  { value: "pending_dns", label: "Pending DNS" },
  { value: "pending_ssl", label: "Pending SSL" },
  { value: "failed", label: "Failed" },
];

// --- Activity feed ---------------------------------------------------------

export const ACTIVITY_ACTION_MAP = {
  invited: { label: "invited", icon: UserPlus, tone: "text-sky-400" },
  role_changed: { label: "changed the role of", icon: ShieldCheck, tone: "text-violet-300" },
  status_changed: { label: "updated the status of", icon: Activity, tone: "text-amber-400" },
  suspended: { label: "suspended", icon: Ban, tone: "text-red-400" },
  removed: { label: "removed", icon: UserMinus, tone: "text-red-400" },
  group_changed: { label: "updated groups for", icon: UsersRound, tone: "text-emerald-400" },
  role_created: { label: "created role", icon: Sparkles, tone: "text-violet-300" },
  role_updated: { label: "updated role", icon: ShieldCheck, tone: "text-violet-300" },
  role_deleted: { label: "deleted role", icon: UserMinus, tone: "text-red-400" },
  group_created: { label: "created group", icon: UsersRound, tone: "text-emerald-400" },
};

// --- Permissions -----------------------------------------------------------

// WORKSPACE_PERMISSIONS grouped by `group`, preserving first-seen order. Powers
// the permission matrix (one SettingRow per key, one section per group).
export const PERMISSION_GROUPS = (() => {
  const order = [];
  const byGroup = new Map();
  for (const perm of WORKSPACE_PERMISSIONS) {
    if (!byGroup.has(perm.group)) {
      byGroup.set(perm.group, []);
      order.push(perm.group);
    }
    byGroup.get(perm.group).push(perm);
  }
  return order.map((group) => ({ group, permissions: byGroup.get(group) }));
})();

export const ROLE_TABS = [
  { key: "roles", label: "Roles" },
  { key: "matrix", label: "Permission matrix" },
];

export const ROLE_TYPE_FILTER_OPTIONS = [
  { value: "all", label: "All Types" },
  { value: "system", label: "System" },
  { value: "custom", label: "Custom" },
];

export const PERMISSION_GROUP_FILTER_OPTIONS = [
  { value: "all", label: "All Groups" },
  ...PERMISSION_GROUPS.map(({ group }) => ({ value: group, label: group })),
];

// --- Seats -----------------------------------------------------------------

// Default seat allowance until Billing wires a real plan limit (read from
// project metadata `seatLimit` when present).
export const DEFAULT_SEAT_LIMIT = 25;

// --- AI Providers ----------------------------------------------------------

export const PROVIDER_STATUS_MAP = {
  unverified: { label: "Unverified", variant: "neutral", dotClass: "bg-text-tertiary" },
  ok: { label: "Connected", variant: "success", dotClass: "bg-emerald-400" },
  error: { label: "Error", variant: "danger", dotClass: "bg-red-400" },
};

// What the connect dialog offers: every kind, then the presets that prefill an OpenAI-compatible connection.
// `local` presets (Ollama, vLLM, LM Studio) are shown only when the deployment allows local providers.
export const PROVIDER_TEMPLATES = [
  ...Object.entries(PROVIDER_KINDS).map(([value, kind]) => ({
    value,
    kind: value,
    preset: null,
    label: kind.label,
    capabilities: kind.capabilities === "user" ? ["chat"] : kind.capabilities,
    baseUrl: kind.baseUrl,
    models: (kind.suggestedModels.chat || []).map((m) => m.id),
    local: false,
  })),
  ...PROVIDER_PRESETS.map((preset) => ({
    value: `preset:${preset.id}`,
    kind: preset.kind,
    preset: preset.id,
    label: preset.label,
    capabilities: preset.capabilities,
    baseUrl: preset.baseUrl,
    models: (preset.suggestedModels?.chat || []).map((m) => m.id),
    local: Boolean(preset.local),
  })),
];

// ai_usage_events.feature -> label, for the Usage card's by-feature list.
export const USAGE_FEATURE_LABELS = {
  ...Object.fromEntries(Object.values(AI_FEATURES).map((f) => [f.usage, f.label])),
  test: "Connection tests",
  models: "Model listings",
  detect_dims: "Dimension detection",
  embed_index: "Knowledge indexing",
  embed_query: "Knowledge search",
};

// --- Formatters ------------------------------------------------------------

export function formatDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function formatRelativeTime(value) {
  if (!value) return "Never";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "Never";
  const diff = Date.now() - d.getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(value);
}

export function initialsOf(name, email) {
  const src = (name || email || "?").trim();
  const parts = src.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return src.slice(0, 2).toUpperCase();
}
