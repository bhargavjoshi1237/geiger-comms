import { errorResponse, jsonResponse, readJsonBody } from "@/lib/widget/respond";
import { isUuid } from "@/lib/widget/apps";
import { rateLimit } from "@/lib/widget/ratelimit";
import { canInProject, isSameOriginRequest, workspaceSession } from "@/lib/widget/workspace_auth";
import { isAdminConfigured } from "@/lib/server/admin";
import { isEmailConfigured } from "@/lib/email/client";
import { EMAIL_RE } from "@/lib/email/channel";
import {
  ASSIGN_PERMISSION,
  INVITE_PERMISSION,
  inviteLink,
  inviterName,
  sendInviteEmail,
} from "@/lib/email/team_invites";
import { normalizeMember } from "@/lib/supabase/team";

// POST /api/team/invites { projectId, emails[], roleId, groupId?, message? } — needs comms.team.invite in the project.
// Each address gets a pending roster row, the suite org invite its project needs, and an email with the accept link.
// Per address: { email, member, emailed, inviteUrl? (only when it wasn't emailed), error? }.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_INVITES = 20;

// A role an invite may carry: live, this project's, never owner-grade; anything but Member also needs comms.team.assign.
async function invitableRole(session, projectId, roleId) {
  const { data: role, error } = await session.db
    .schema("public")
    .from("roles")
    .select("id, key, permissions")
    .eq("id", roleId)
    .eq("project_id", projectId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) console.error("[team.invites.role]", error.message);
  if (!role || role.key === "owner" || (role.permissions || []).includes("*")) return { error: "role_not_allowed" };
  if (role.key !== "member" && !(await canInProject(session, projectId, ASSIGN_PERMISSION))) {
    return { error: "role_needs_assign" };
  }
  return { role };
}

// Roster emails are stored lowercased (auth and this route both do); the lower(email) unique index catches the rest as 23505.
async function inviteOne(session, request, { project, email, roleId, groupIds, message, inviter }) {
  const { data: existing, error: readError } = await session.db
    .from("project_members")
    .select("id, status")
    .eq("project_id", project.id)
    .eq("email", email)
    .is("deleted_at", null)
    .limit(1);
  if (readError) {
    console.error("[team.invites.read]", readError.message);
    return { email, error: "write_failed" };
  }
  if (existing?.length) {
    return { email, error: existing[0].status === "invited" ? "already_invited" : "already_member" };
  }

  const { data: row, error: insertError } = await session.db
    .from("project_members")
    .insert({
      project_id: project.id,
      email,
      status: "invited",
      role_id: roleId,
      group_ids: groupIds,
      invited_by: session.user.id,
      invited_at: new Date().toISOString(),
      created_by: session.user.id,
      metadata: message ? { message } : {},
    })
    .select("*")
    .single();
  if (insertError) {
    console.error("[team.invites.insert]", insertError.message);
    return { email, error: insertError.code === "23505" ? "already_invited" : "write_failed" };
  }

  const link = await inviteLink(session, request, project, email);
  if (link.error) {
    // Without a link nobody can accept, so the row is withdrawn rather than left pending.
    await session.db.from("project_members").update({ deleted_at: new Date().toISOString() }).eq("id", row.id);
    return { email, error: link.error };
  }

  const delivery = await sendInviteEmail(request, {
    project,
    email,
    acceptUrl: link.acceptUrl,
    inviter,
    message,
  });

  const { error: auditError } = await session.db.from("member_activity").insert({
    project_id: project.id,
    actor_user_id: session.user.id,
    actor_name: inviter,
    target_member_id: row.id,
    target_name: email,
    action: "invited",
    detail: { email, emailed: delivery.emailed },
  });
  if (auditError) console.error("[team.invites.audit]", auditError.message);

  return {
    email,
    member: normalizeMember(row),
    emailed: delivery.emailed,
    ...(delivery.emailed ? {} : { inviteUrl: link.acceptUrl, emailError: delivery.emailError }),
  };
}

export async function POST(request) {
  if (!isAdminConfigured()) return errorResponse(503, "not_configured");
  if (!isSameOriginRequest(request)) return errorResponse(403, "cross_site");
  const session = await workspaceSession();
  if (!session) return errorResponse(401, "unauthorized");

  const body = await readJsonBody(request);
  const projectId = body?.projectId;
  if (!isUuid(projectId) || !isUuid(body?.roleId)) return errorResponse(400, "bad_request");
  if (!(await canInProject(session, projectId, INVITE_PERMISSION))) return errorResponse(403, "forbidden");

  const emails = [
    ...new Set(
      (Array.isArray(body.emails) ? body.emails : [])
        .map((e) => (typeof e === "string" ? e.trim().toLowerCase() : ""))
        .filter(Boolean),
    ),
  ];
  if (!emails.length) return errorResponse(400, "emails_required");
  if (emails.length > MAX_INVITES) return errorResponse(400, "too_many");
  const invalid = emails.filter((e) => !EMAIL_RE.test(e));
  if (invalid.length) return jsonResponse({ error: "invalid_email", emails: invalid }, 400);
  if (!rateLimit(`team-invites:${session.user.id}`, 60, 3_600_000)) return errorResponse(429, "rate_limited");

  const role = await invitableRole(session, projectId, body.roleId);
  if (role.error) return errorResponse(403, role.error);

  let groupIds = [];
  if (body.groupId && body.groupId !== "none") {
    if (!isUuid(body.groupId)) return errorResponse(400, "bad_request");
    const { data: group } = await session.db
      .from("member_groups")
      .select("id")
      .eq("id", body.groupId)
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .maybeSingle();
    if (!group) return errorResponse(400, "bad_request");
    groupIds = [group.id];
  }

  const { data: project, error: projectError } = await session.db
    .schema("public")
    .from("projects")
    .select("id, name, organization_id")
    .eq("id", projectId)
    .maybeSingle();
  if (projectError) console.error("[team.invites.project]", projectError.message);
  if (!project) return errorResponse(404, "not_found");

  const message = typeof body.message === "string" ? body.message.trim().slice(0, 500) : "";
  const inviter = inviterName(session.user);
  const results = [];
  for (const email of emails) {
    results.push(
      await inviteOne(session, request, { project, email, roleId: role.role.id, groupIds, message, inviter }),
    );
  }
  return jsonResponse({ results, emailConfigured: isEmailConfigured() });
}
