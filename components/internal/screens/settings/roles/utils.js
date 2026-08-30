// Pure helpers shared by the Roles & Permissions tabs, matrix, and drawer.

import { matchesAny } from "@geiger/rbac";
import { ALL_PERMISSION_KEYS } from "@/lib/rbac";
import { PERMISSION_GROUPS } from "../constants";

// Owner is the one role the screen refuses to touch: its "*" is what keeps a
// project administrable, and it is the only permission list that keeps granting
// new keys as the catalog grows. Every other seeded role is a starting point the
// project owner is free to rewrite.
export function isOwnerRole(role) {
  return role?.key === "owner" || (role?.permissions || []).includes("*");
}

// Does this role actually grant `key`? Roles store PATTERNS, so a literal
// includes() reports Owner as holding nothing at all.
export function grantsKey(role, key) {
  return matchesAny(role?.permissions || [], key);
}

export function grantedCount(role) {
  return ALL_PERMISSION_KEYS.filter((k) => grantsKey(role, k)).length;
}

// Filter the catalog down to what the toolbar/search asks for, dropping groups
// that end up empty so neither the matrix nor the drawer renders a bare header.
export function filterGroups(query, group = "all") {
  const q = query.trim().toLowerCase();
  return PERMISSION_GROUPS.filter((g) => group === "all" || g.group === group)
    .map(({ group: name, permissions }) => ({
      group: name,
      permissions: q
        ? permissions.filter(
            (p) =>
              p.label.toLowerCase().includes(q) ||
              p.key.toLowerCase().includes(q),
          )
        : permissions,
    }))
    .filter((g) => g.permissions.length);
}
