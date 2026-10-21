import { createClient } from "./client";
import { isSupabaseConfigured } from "./comms";

// Team & Members data layer: owns comms.project_members (the roster overlay comms.sync_project_team() fills from the org), member_groups and member_activity.
// Pure: validate, console.error on failure, return null / false / []; invitations go through /api/team/invites instead.

const MEMBERS = "project_members";
const GROUPS = "member_groups";
const ACTIVITY = "member_activity";

// --- Members ---------------------------------------------------------------

export function normalizeMember(row) {
  if (!row) return null;
  const meta =
    row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  return {
    id: row.id,
    projectId: row.project_id ?? null,
    userId: row.user_id ?? null,
    roleId: row.role_id ?? null,
    status: row.status ?? "active",
    email: row.email ?? "",
    name: row.name ?? "",
    avatarUrl: row.avatar_url ?? "",
    groupIds: Array.isArray(row.group_ids) ? row.group_ids : [],
    invitedBy: row.invited_by ?? null,
    invitedAt: row.invited_at ?? null,
    joinedAt: row.joined_at ?? null,
    lastActiveAt: row.last_active_at ?? null,
    createdAt: row.created_at ?? null,
    ...meta,
  };
}

function memberToRow(input) {
  const row = {};
  const map = {
    projectId: "project_id",
    userId: "user_id",
    roleId: "role_id",
    status: "status",
    email: "email",
    name: "name",
    avatarUrl: "avatar_url",
    invitedBy: "invited_by",
  };
  for (const [key, col] of Object.entries(map)) {
    if (key in input) row[col] = input[key];
  }
  if ("groupIds" in input) {
    row.group_ids = Array.isArray(input.groupIds) ? input.groupIds : [];
  }
  if ("invitedAt" in input) row.invited_at = input.invitedAt || null;
  if ("joinedAt" in input) row.joined_at = input.joinedAt || null;
  if ("lastActiveAt" in input) row.last_active_at = input.lastActiveAt || null;
  return row;
}

// Best-effort: project real org members into the overlay before listing. Never
// blocks — a shared-schema mismatch resolves to a no-op inside the RPC.
export async function syncTeam(projectId, defaultRoleId) {
  if (!projectId || !isSupabaseConfigured()) return 0;
  try {
    const sb = createClient();
    const { data, error } = await sb.rpc("sync_project_team", {
      p_project_id: projectId,
      p_default_role: defaultRoleId ?? null,
    });
    if (error) {
      console.error("[team.sync]", error.message);
      return 0;
    }
    return Number(data) || 0;
  } catch (e) {
    console.error("[team.sync]", e);
    return 0;
  }
}

export async function listMembers(projectId) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const sb = createClient();
    const { data, error } = await sb
      .from(MEMBERS)
      .select("*")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .order("created_at", { ascending: true });
    if (error) {
      console.error("[team.listMembers]", error.message);
      return null;
    }
    return (data || []).map(normalizeMember);
  } catch (e) {
    console.error("[team.listMembers]", e);
    return null;
  }
}

// --- Invitations -----------------------------------------------------------
// Inviting goes through the /api/team/invites routes: they check comms.team.invite, mint the suite org invite and
// send the email. Each call resolves to { ok: true, ...payload } or { ok: false, error, ... } and never throws.

// fetch() is not basePath-aware ("/comms" in production).
const API_BASE = process.env.NEXT_PUBLIC_BASE_PATH || "";

async function inviteRequest(path, init) {
  try {
    const res = await fetch(`${API_BASE}${path}`, init);
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) return { ...payload, ok: false, error: payload?.error || `http_${res.status}` };
    return { ...payload, ok: true };
  } catch (e) {
    console.error("[team.invites]", e);
    return { ok: false, error: "request_failed" };
  }
}

// -> { ok, results: [{ email, member?, emailed, inviteUrl?, emailError?, error? }], emailConfigured }
export function sendInvitations({ projectId, emails, roleId, groupId, message }) {
  return inviteRequest("/api/team/invites", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ projectId, emails, roleId, groupId, message }),
  });
}

// -> { ok, member, emailed, inviteUrl?, emailError? }
export function resendInvitation(id) {
  return inviteRequest(`/api/team/invites/${encodeURIComponent(id)}`, { method: "POST" });
}

// -> { ok, inviteUrl } without sending anything.
export function getInvitationLink(id) {
  return inviteRequest(`/api/team/invites/${encodeURIComponent(id)}`);
}

// -> { ok, revoked, link: "revoked" | "shared" | "failed" }
export function revokeInvitation(id) {
  return inviteRequest(`/api/team/invites/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function updateMember(id, patch) {
  if (!id || !isSupabaseConfigured()) return null;
  try {
    const sb = createClient();
    const { data, error } = await sb
      .from(MEMBERS)
      .update(memberToRow(patch))
      .eq("id", id)
      .select("*")
      .single();
    if (error) {
      console.error("[team.updateMember]", error.message);
      return null;
    }
    return normalizeMember(data);
  } catch (e) {
    console.error("[team.updateMember]", e);
    return null;
  }
}

export async function softDeleteMember(id) {
  if (!id || !isSupabaseConfigured()) return false;
  try {
    const sb = createClient();
    const { error } = await sb
      .from(MEMBERS)
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      console.error("[team.deleteMember]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[team.deleteMember]", e);
    return false;
  }
}

// --- Groups ----------------------------------------------------------------

export function normalizeGroup(row) {
  if (!row) return null;
  const meta =
    row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  return {
    id: row.id,
    projectId: row.project_id ?? null,
    name: row.name ?? "",
    description: row.description ?? "",
    color: row.color ?? "slate",
    createdBy: row.created_by ?? null,
    createdAt: row.created_at ?? null,
    ...meta,
  };
}

function groupToRow(input) {
  const row = {};
  const map = {
    projectId: "project_id",
    name: "name",
    description: "description",
    color: "color",
    createdBy: "created_by",
  };
  for (const [key, col] of Object.entries(map)) {
    if (key in input) row[col] = input[key];
  }
  return row;
}

export async function listGroups(projectId) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const sb = createClient();
    const { data, error } = await sb
      .from(GROUPS)
      .select("*")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .order("created_at", { ascending: true });
    if (error) {
      console.error("[team.listGroups]", error.message);
      return null;
    }
    return (data || []).map(normalizeGroup);
  } catch (e) {
    console.error("[team.listGroups]", e);
    return null;
  }
}

export async function createGroup(input) {
  if (!isSupabaseConfigured()) return null;
  try {
    const sb = createClient();
    const payload = groupToRow(input);
    if (input.id) payload.id = input.id;
    const { data, error } = await sb
      .from(GROUPS)
      .insert(payload)
      .select("*")
      .single();
    if (error) {
      console.error("[team.createGroup]", error.message);
      return null;
    }
    return normalizeGroup(data);
  } catch (e) {
    console.error("[team.createGroup]", e);
    return null;
  }
}

export async function updateGroup(id, patch) {
  if (!id || !isSupabaseConfigured()) return null;
  try {
    const sb = createClient();
    const { data, error } = await sb
      .from(GROUPS)
      .update(groupToRow(patch))
      .eq("id", id)
      .select("*")
      .single();
    if (error) {
      console.error("[team.updateGroup]", error.message);
      return null;
    }
    return normalizeGroup(data);
  } catch (e) {
    console.error("[team.updateGroup]", e);
    return null;
  }
}

export async function softDeleteGroup(id) {
  if (!id || !isSupabaseConfigured()) return false;
  try {
    const sb = createClient();
    const { error } = await sb
      .from(GROUPS)
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      console.error("[team.deleteGroup]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[team.deleteGroup]", e);
    return false;
  }
}

// --- Activity (append-only audit) ------------------------------------------

export function normalizeActivity(row) {
  if (!row) return null;
  return {
    id: row.id,
    projectId: row.project_id ?? null,
    actorUserId: row.actor_user_id ?? null,
    actorName: row.actor_name ?? "",
    targetMemberId: row.target_member_id ?? null,
    targetName: row.target_name ?? "",
    action: row.action ?? "",
    detail: row.detail && typeof row.detail === "object" ? row.detail : {},
    createdAt: row.created_at ?? null,
  };
}

export async function listActivity(projectId, limit = 50) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const sb = createClient();
    const { data, error } = await sb
      .from(ACTIVITY)
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) {
      console.error("[team.listActivity]", error.message);
      return null;
    }
    return (data || []).map(normalizeActivity);
  } catch (e) {
    console.error("[team.listActivity]", e);
    return null;
  }
}

// Fire-and-forget audit write. Returns the row or null; callers don't block on it.
export async function logActivity(input) {
  if (!input?.projectId || !isSupabaseConfigured()) return null;
  try {
    const sb = createClient();
    const { data, error } = await sb
      .from(ACTIVITY)
      .insert({
        project_id: input.projectId,
        actor_user_id: input.actorUserId ?? null,
        actor_name: input.actorName ?? "",
        target_member_id: input.targetMemberId ?? null,
        target_name: input.targetName ?? "",
        action: input.action,
        detail: input.detail ?? {},
      })
      .select("*")
      .single();
    if (error) {
      console.error("[team.logActivity]", error.message);
      return null;
    }
    return normalizeActivity(data);
  } catch (e) {
    console.error("[team.logActivity]", e);
    return null;
  }
}
