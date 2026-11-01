import "server-only";
import { basePath, publicOrigin } from "@/lib/widget/env";
import { isEmailConfigured, sendSuiteEmail } from "./client";
import { inviteEmail } from "./templates";

// Teammate invitations. The roster row (comms.project_members, status 'invited') is the Comms half; a project inside a
// suite org also needs the suite's own org invite, since only org members can reach it (comms.can_access_project).
// geiger-dash's /invite/<token> accepts that one (signing the person in first), after which Comms claims the roster row.

export const INVITE_PERMISSION = "comms.team.invite";
export const ASSIGN_PERMISSION = "comms.team.assign";

function stripSlash(value) {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

// The suite shares one origin in production (dash at "/", Comms under its basePath); GEIGER_SUITE_URL points elsewhere in dev.
function suiteOrigin(request) {
  return stripSlash(process.env.GEIGER_SUITE_URL || "") || new URL(request.url).origin;
}

export function workspaceUrl(request, projectId) {
  return `${publicOrigin() || new URL(request.url).origin}${basePath()}/project/${projectId}`;
}

// -> { acceptUrl } or { error }. Minting the org invite runs as the inviter, so the suite's own members.add rule applies.
export async function inviteLink(session, request, project, email) {
  if (!project.organization_id) return { acceptUrl: workspaceUrl(request, project.id) };
  const { data, error } = await session.db.schema("public").rpc("invite_to_organization", {
    p_org: project.organization_id,
    p_emails: [email],
    p_role: "User",
  });
  if (error) {
    console.error("[team.invites.org]", error.message);
    return { error: error.code === "42501" ? "org_invite_forbidden" : "org_invite_failed" };
  }
  const token = (Array.isArray(data) ? data : []).find((row) => row.email === email)?.token;
  if (!token) return { error: "org_invite_failed" };
  return { acceptUrl: `${suiteOrigin(request)}/invite/${encodeURIComponent(token)}` };
}

export function inviterName(user) {
  const meta = user?.user_metadata ?? {};
  return String(meta.full_name || meta.name || user?.email || "A teammate").trim();
}

// -> { emailed: true } | { emailed: false, emailError } — the caller hands out the link itself when it wasn't emailed.
export async function sendInviteEmail(request, { project, email, acceptUrl, inviter, message }) {
  if (!isEmailConfigured()) return { emailed: false, emailError: "email_not_configured" };
  const { subject, html } = inviteEmail({
    inviterName: inviter,
    projectName: project.name || "your team",
    email,
    acceptUrl,
    workspaceUrl: project.organization_id ? workspaceUrl(request, project.id) : null,
    message,
  });
  const sent = await sendSuiteEmail({
    to: email,
    subject,
    html,
    template: "comms.team_invite",
    signal: AbortSignal.timeout(15_000),
  });
  return sent.ok ? { emailed: true } : { emailed: false, emailError: sent.error };
}
