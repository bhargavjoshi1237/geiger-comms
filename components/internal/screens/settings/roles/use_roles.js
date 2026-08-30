"use client";

// Everything the Roles & Permissions screen knows about the catalog: the rows
// it loads, what it derives from them, and the writes that change them. The
// screen itself keeps only view state (tab, search, filters, dialogs) and
// renders what this returns. Mirrors settings/team/use_team.js.

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { expandPatterns } from "@geiger/rbac";

import { ALL_PERMISSION_KEYS } from "@/lib/rbac";
import { useProject } from "@/context/project-context";
import { useRbac } from "@/context/rbac-context";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { getUser } from "@/lib/supabase/user";
import { createRole, updateRole, softDeleteRole, ensureSystemRoles, listGrants } from "@/lib/supabase/rbac";
import { logActivity } from "@/lib/supabase/team";
import { PERMISSION_GROUPS } from "../constants";
import { grantsKey, isOwnerRole } from "./utils";

export function useRoles() {
  const { projectId } = useProject();
  const { setTab: setWorkspaceTab } = useWorkspaceUrl();
  const { can, refresh: refreshRbac } = useRbac();
  const canManage = can("comms.role.manage");

  const [roles, setRoles] = useState([]);
  const [grants, setGrants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState(null);
  const [userName, setUserName] = useState("");

  useEffect(() => {
    let alive = true;
    getUser().then((u) => {
      if (!alive) return;
      setUserId(u?.id || null);
      setUserName(u?.name || "");
    });
    (async () => {
      // Fill in whichever system roles this project is missing. The adopt_rbac
      // migration seeds only Owner (its "*" is stable); the rest are defined in
      // geiger-rbac.config.js, so seeding them here keeps the catalog their
      // single source of truth. Idempotent per key, so this is a no-op once the
      // project has them all.
      const rows = await ensureSystemRoles(projectId, null);
      if (!alive) return;
      setRoles(rows ?? []);
      setLoading(false);
    })();
    listGrants(projectId).then((rows) => alive && setGrants(rows ?? []));
    return () => {
      alive = false;
    };
  }, [projectId]);

  // Counted off grants, not the roster overlay — a grant is what authorizes, so
  // it is the only honest answer to "how many people hold this role".
  const memberCountByRole = useMemo(() => {
    const map = {};
    for (const g of grants) {
      if (g.roleId && g.status === "active") {
        map[g.roleId] = (map[g.roleId] || 0) + 1;
      }
    }
    return map;
  }, [grants]);

  const stats = useMemo(() => {
    const system = roles.filter((r) => r.isSystem).length;
    const assigned = Object.values(memberCountByRole).reduce((a, b) => a + b, 0);
    const unheld = roles.filter((r) => !memberCountByRole[r.id]).length;
    return [
      { label: "Roles", value: String(roles.length), footer: `${system} system · ${roles.length - system} custom` },
      { label: "People assigned", value: String(assigned), footer: "Across active grants" },
      { label: "Permissions", value: String(ALL_PERMISSION_KEYS.length), footer: `${PERMISSION_GROUPS.length} groups in the catalog` },
      { label: "Unheld roles", value: String(unheld), footer: "Nobody holds them yet" },
    ];
  }, [roles, memberCountByRole]);

  // --- Permission toggles (optimistic + persist) ---------------------------

  const persistPermissions = async (role, permissions) => {
    setRoles((prev) => prev.map((r) => (r.id === role.id ? { ...r, permissions } : r)));
    const saved = await updateRole(role.id, { permissions });
    if (saved) {
      // The editor may be editing their own role; re-resolve so the nav and the
      // gates on this very screen reflect the change without a reload.
      refreshRbac();
    } else {
      setRoles((prev) => prev.map((r) => (r.id === role.id ? { ...r, permissions: role.permissions } : r)));
      toast.error("Couldn't update permissions.");
    }
  };

  // Turning one key off inside a wildcard can't be expressed by removing a key,
  // so a role holding any pattern is first expanded to the concrete set it
  // currently reaches. What the user saw ticked is exactly what stays ticked.
  const concreteKeys = (role) =>
    (role.permissions || []).some((p) => p.includes("*"))
      ? expandPatterns(role.permissions, ALL_PERMISSION_KEYS)
      : [...(role.permissions || [])];

  const togglePermission = (role, key) => {
    if (!canManage || isOwnerRole(role)) return;
    const base = concreteKeys(role);
    const next = grantsKey(role, key) ? base.filter((k) => k !== key) : [...new Set([...base, key])];
    persistPermissions(role, next);
  };

  const toggleGroup = (role, keys, enable) => {
    if (!canManage || isOwnerRole(role)) return;
    const set = new Set(concreteKeys(role));
    keys.forEach((k) => (enable ? set.add(k) : set.delete(k)));
    persistPermissions(role, Array.from(set));
  };

  // --- Role CRUD -------------------------------------------------------------

  // `onOptimistic(id)` fires synchronously once the new row is minted and in
  // local state — before the persist call resolves — so the caller can open
  // its drawer immediately instead of waiting on the round trip.
  const saveRole = async (editing, draft, { onOptimistic } = {}) => {
    const name = draft.name.trim();
    if (!name) {
      toast.error("Give the role a name.");
      return null;
    }

    if (editing) {
      const patch = { name, description: draft.description };
      setRoles((prev) => prev.map((r) => (r.id === editing.id ? { ...r, ...patch } : r)));
      const saved = await updateRole(editing.id, patch);
      if (saved) {
        logActivity({ projectId, actorUserId: userId, actorName: userName, action: "role_updated", targetName: name });
      } else {
        toast.error("Couldn't save the role.");
      }
      return editing.id;
    }

    const source = roles.find((r) => r.id === draft.cloneFrom);
    const id = crypto.randomUUID();
    const optimistic = {
      id,
      projectId,
      name,
      description: draft.description,
      // Cloning Owner would copy "*" into a custom role, quietly minting a
      // second unrestricted role. Expand it to the concrete catalog instead.
      permissions: source ? expandPatterns(source.permissions, ALL_PERMISSION_KEYS) : [],
      isSystem: false,
      sort: roles.length,
      createdBy: userId,
    };
    setRoles((prev) => [...prev, optimistic]);
    onOptimistic?.(id);
    const saved = await createRole(optimistic);
    if (saved) {
      setRoles((prev) => prev.map((r) => (r.id === id ? saved : r)));
      logActivity({ projectId, actorUserId: userId, actorName: userName, action: "role_created", targetName: name });
      toast.success("Role created");
    } else {
      setRoles((prev) => prev.filter((r) => r.id !== id));
      toast.error("Couldn't create the role.");
    }
    return id;
  };

  const duplicateRole = async (role, { onOptimistic } = {}) => {
    const id = crypto.randomUUID();
    const optimistic = {
      id,
      projectId,
      name: `${role.name} copy`,
      description: role.description,
      permissions: expandPatterns(role.permissions, ALL_PERMISSION_KEYS),
      isSystem: false,
      sort: roles.length,
      createdBy: userId,
    };
    setRoles((prev) => [...prev, optimistic]);
    onOptimistic?.(id);
    const saved = await createRole(optimistic);
    if (saved) {
      setRoles((prev) => prev.map((r) => (r.id === id ? saved : r)));
      toast.success("Role duplicated");
    } else {
      setRoles((prev) => prev.filter((r) => r.id !== id));
      toast.error("Couldn't duplicate the role.");
    }
    return id;
  };

  const deleteRole = async (role) => {
    setRoles((prev) => prev.filter((r) => r.id !== role.id));
    const ok = await softDeleteRole(role.id);
    if (ok) {
      logActivity({ projectId, actorUserId: userId, actorName: userName, action: "role_deleted", targetName: role.name });
      toast.success("Role deleted");
    } else {
      setRoles((prev) => [...prev, role]);
      toast.error("Couldn't delete the role.");
    }
    return ok;
  };

  const goToTeam = (role) => {
    try {
      window.sessionStorage.setItem("team:roleFilter", role.id);
    } catch {
      // ignore storage failures
    }
    setWorkspaceTab("Teammates");
  };

  return {
    canManage,
    roles,
    loading,
    memberCountByRole,
    stats,
    togglePermission,
    toggleGroup,
    saveRole,
    duplicateRole,
    deleteRole,
    goToTeam,
  };
}
