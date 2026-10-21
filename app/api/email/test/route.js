import { errorResponse, jsonResponse, readJsonBody } from "@/lib/widget/respond";
import { isUuid } from "@/lib/widget/apps";
import { rateLimit } from "@/lib/widget/ratelimit";
import { canInProject, isSameOriginRequest, workspaceSession } from "@/lib/widget/workspace_auth";
import { isEmailConfigured, sendSuiteEmail } from "@/lib/email/client";
import { channelSender } from "@/lib/email/channel";
import { testEmail } from "@/lib/email/templates";

// POST /api/email/test { channelId } — really sends a test email from the channel's address, to the signed-in teammate only
// (never a typed address, so this can't relay mail). -> { to, from } or { error, message? } with the email service's reason.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const CHANNELS_VIEW = "comms.channels.view";

export async function POST(request) {
  if (!isSameOriginRequest(request)) return errorResponse(403, "cross_site");
  const session = await workspaceSession();
  if (!session) return errorResponse(401, "unauthorized");
  if (!isEmailConfigured()) return errorResponse(503, "email_not_configured");

  const body = await readJsonBody(request);
  if (!isUuid(body?.channelId)) return errorResponse(400, "bad_request");

  // Read as the user, so a channel outside their projects reads as nonexistent.
  const { data: channel, error } = await session.db
    .from("channels")
    .select("id, name, kind, config, project_id")
    .eq("id", body.channelId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) console.error("[email.test]", error.message);
  if (!channel || channel.kind !== "email") return errorResponse(404, "not_found");
  if (!(await canInProject(session, channel.project_id, CHANNELS_VIEW))) return errorResponse(403, "forbidden");

  const sender = channelSender(channel);
  if (!sender) return errorResponse(400, "from_address_required");
  const to = session.user.email;
  if (!to) return errorResponse(400, "no_recipient");
  if (!rateLimit(`email-test:${session.user.id}`, 5, 600_000)) return errorResponse(429, "rate_limited");

  const { subject, html } = testEmail({ channelName: channel.name || "Email", from: sender.from });
  const sent = await sendSuiteEmail({
    to,
    from: sender.from,
    subject,
    html,
    template: "comms.channel_test",
    signal: AbortSignal.timeout(15_000),
  });
  if (!sent.ok) {
    return jsonResponse({ error: sent.uncertain ? "send_unconfirmed" : "send_failed", message: sent.error }, 502);
  }
  return jsonResponse({ to, from: sender.from });
}
