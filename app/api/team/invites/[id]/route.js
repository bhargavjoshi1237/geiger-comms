import { errorResponse, jsonResponse } from "@/lib/widget/respond";
import { isUuid } from "@/lib/widget/apps";
import { rateLimit } from "@/lib/widget/ratelimit";
import { canInProject, isSameOriginRequest, workspaceSession } from "@/lib/widget/workspace_auth";
import { adminClient, isAdminConfigured } from "@/lib/server/admin";
import { INVITE_PERMISSION, inviteLink, inviterName, sendInviteEmail } from "@/lib/email/team_invites";
import { normalizeMember } from "@/lib/supabase/team";

// GET /api/team/invites/:id -> { inviteUrl }; POST resends it -> { member, emailed, inviteUrl? }; all need comms.team.invite in its project.
// DELETE revokes it and the pending suite org invite -> { revoked, link: "revoked" | "shared" (another project still invites them) | "failed" }.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

async function guard(request, params) {
  if (!isAdminConfigured()) return { response: errorResponse(503, "not_configured") };
  if (!isSameOriginRequest(request)) return { response: errorResponse(403, "cross_site") };
  const session = await workspaceSession();
  if (!session) return { response: errorResponse(401, "unauthorized") };
  const { id } = await params;
  if (!isUuid(id)) return { response: errorResponse(404, "not_found") };

  // Read as the user, so an invitation outside their projects reads as nonexistent.
  const { data: invite, error } = await session.db
    .from("project_members")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) console.error("[team.invites.read]", error.message);
  if (!invite) return { response: errorResponse(404, "not_found") };
  if (invite.status !== "invited") return { response: errorResponse(409, "not_pending") };
  if (!(await canInProject(session, invite.project_id, INVITE_PERMISSION))) {
    return { response: errorResponse(403, "forbidden") };
  }

  const { data: project } = await session.db
    .schema("public")
    .from("projects")
    .select("id, name, organization_id")
    .eq("id", invite.project_id)
    .maybeSingle();
  if (!project) return { response: errorResponse(404, "not_found") };
  return { session, invite, project };
}

export async function GET(request, { params }) {
  const { session, invite, project, response } = await guard(request, params);
  if (response) return response;
  const link = await inviteLink(session, request, project, invite.email);
  if (link.error) return errorResponse(403, link.error);
  return jsonResponse({ inviteUrl: link.acceptUrl });
}

export async function POST(request, { params }) {
  const { session, invite, project, response } = await guard(request, params);
  if (response) return response;
  if (!rateLimit(`team-invites:${session.user.id}`, 60, 3_600_000)) return errorResponse(429, "rate_limited");

  const link = await inviteLink(session, request, project, invite.email);
  if (link.error) return errorResponse(403, link.error);

  const delivery = await sendInviteEmail(request, {
    project,
    email: invite.email,
    acceptUrl: link.acceptUrl,
    inviter: inviterName(session.user),
    message: invite.metadata?.message,
  });

  const { data: row, error } = await session.db
    .from("project_members")
    .update({ invited_at: new Date().toISOString() })
    .eq("id", invite.id)
    .select("*")
    .single();
  if (error) console.error("[team.invites.resend]", error.message);

  return jsonResponse({
    member: normalizeMember(row ?? invite),
    emailed: delivery.emailed,
    ...(delivery.emailed ? {} : { inviteUrl: link.acceptUrl, emailError: delivery.emailError }),
  });
}

export async function DELETE(request, { params }) {
  const { session, invite, project, response } = await guard(request, params);
  if (response) return response;

  const { error } = await session.db
    .from("project_members")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", invite.id);
  if (error) {
    console.error("[team.invites.revoke]", error.message);
    return errorResponse(500, "write_failed");
  }

  if (!project.organization_id) return jsonResponse({ revoked: true, link: "revoked" });
  return jsonResponse({ revoked: true, link: await revokeOrgInvite(project.organization_id, invite) });
}

// The org invite is what the emailed link redeems; it is shared by every project in the org, so it stays while another
// project still has this address invited. Revoking only narrows access, so it runs past the suite's members.add rule.
async function revokeOrgInvite(organizationId, invite) {
  const db = adminClient();
  const email = invite.email.toLowerCase();
  const { data: projects, error: projectsError } = await db
    .schema("public")
    .from("projects")
    .select("id")
    .eq("organization_id", organizationId);
  if (projectsError) {
    console.error("[team.invites.revoke-org]", projectsError.message);
    return "failed";
  }
  const { data: others, error: othersError } = await db
    .from("project_members")
    .select("id")
    .in("project_id", (projects || []).map((p) => p.id))
    .eq("email", email)
    .eq("status", "invited")
    .is("deleted_at", null)
    .limit(1);
  if (othersError) {
    console.error("[team.invites.revoke-org]", othersError.message);
    return "failed";
  }
  if (others?.length) return "shared";

  const { error } = await db
    .schema("public")
    .from("organization_invites")
    .update({ status: "revoked" })
    .eq("organization_id", organizationId)
    .eq("email", email)
    .eq("status", "pending");
  if (error) {
    console.error("[team.invites.revoke-org]", error.message);
    return "failed";
  }
  return "revoked";
}
