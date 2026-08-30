import rbacConfig, { navPermissionKey, navSlug } from "@/geiger-rbac.config";

// Bridge between the app and @geiger/rbac.
//
// The permission CATALOG lives in geiger-rbac.config.js — a single trusted
// declaration shared by the UI, the data layer and (as tables are tightened)
// the RLS policies. This module only re-shapes it for the screens that were
// written against the old flat list, so the Roles matrix and the nav filter
// keep working unchanged.
//
// Decisions do NOT happen here. Ask context/rbac-context.js — it holds the
// signed-in user's grants, which is the half this file never had.

export { navPermissionKey, navSlug };

// { key, label, group, scopeBy } entries, exactly the shape the settings
// screens expect.
export const WORKSPACE_PERMISSIONS = rbacConfig.permissions.map((p) => ({
  key: p.key,
  label: p.label,
  group: p.group,
  scopeBy: p.scopeBy,
  conditionText: p.conditionText,
}));

export const ALL_PERMISSION_KEYS = WORKSPACE_PERMISSIONS.map((p) => p.key);

// The system-role templates, for screens that offer "clone a system role".
export const SYSTEM_ROLE_SEED = rbacConfig.systemRoles;

// Slug used for role keys and nav-derived permission keys.
export function normalizeRoleId(value) {
  return navSlug(value);
}

// A nav title -> the permission key that gates it. Titles come from
// sidebar_nav.jsx and must match the catalog exactly.
export function tabPermissionKey(title) {
  return navPermissionKey(title);
}

export function getRoleById(roles, roleId) {
  return roles?.find((role) => role.id === roleId) || null;
}
