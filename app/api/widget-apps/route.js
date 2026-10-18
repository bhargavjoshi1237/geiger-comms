import { errorResponse, jsonResponse, readJsonBody } from "@/lib/widget/respond";
import { isWidgetApiConfigured, serviceClient } from "@/lib/widget/service";
import {
  MANAGE_WIDGETS_PERMISSION,
  VIEW_WIDGETS_PERMISSION,
  canInProject,
  isSameOriginRequest,
  workspaceSession,
} from "@/lib/widget/workspace_auth";
import {
  generatePublicId,
  generateSigningSecret,
  last4,
  loadChannelRow,
  sealSigningSecret,
  validateAllowedOrigins,
} from "@/lib/widget/widget_app_server";
import { isUuid } from "@/lib/widget/apps";
import { normalizeWidgetApp } from "@/lib/supabase/widget_apps";

// GET  /api/widget-apps?channelId=…|projectId=… — widget apps in projects the signed-in user can see.
// POST /api/widget-apps — create one (needs comms.settings.manage); the signing secret is returned exactly once (spec §10.1).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  if (!isWidgetApiConfigured()) return errorResponse(503, "not_configured");
  const session = await workspaceSession();
  if (!session) return errorResponse(401, "unauthorized");

  const url = new URL(request.url);
  const channelId = url.searchParams.get("channelId");
  const projectId = url.searchParams.get("projectId");
  if ((channelId && !isUuid(channelId)) || (projectId && !isUuid(projectId))) return jsonResponse([]);

  try {
    let query = serviceClient()
      .from("widget_apps")
      .select("*")
      .is("deleted_at", null)
      .not("project_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(200);
    if (channelId) query = query.eq("channel_id", channelId);
    if (projectId) query = query.eq("project_id", projectId);
    const { data, error } = await query;
    if (error) {
      console.error("[widget-apps.list]", error.message);
      return errorResponse(500, "read_failed");
    }
    // One permission check per distinct project; apps in projects the user cannot see are simply absent.
    const rows = data || [];
    const projects = [...new Set(rows.map((r) => r.project_id))];
    const visible = new Set();
    await Promise.all(
      projects.map(async (id) => {
        if (await canInProject(session, id, VIEW_WIDGETS_PERMISSION)) visible.add(id);
      }),
    );
    return jsonResponse(rows.filter((r) => visible.has(r.project_id)).map(normalizeWidgetApp));
  } catch (e) {
    console.error("[widget-apps.list]", e);
    return errorResponse(500, "read_failed");
  }
}

export async function POST(request) {
  if (!isWidgetApiConfigured()) return errorResponse(503, "not_configured");
  if (!isSameOriginRequest(request)) return errorResponse(403, "cross_site");
  const session = await workspaceSession();
  if (!session) return errorResponse(401, "unauthorized");

  const body = await readJsonBody(request);
  if (!body?.channelId) return errorResponse(400, "channel_id_required");
  const origins = validateAllowedOrigins(body.allowedOrigins || []);
  if (!origins.ok || origins.origins.length === 0) {
    return errorResponse(400, "allowed_origins must be exact scheme://host[:port] values");
  }

  // The channel pins the project scope; a channel the user cannot manage reads as nonexistent.
  const channel = await loadChannelRow(body.channelId);
  if (!channel || channel.kind !== "messenger") return errorResponse(404, "not_found");
  if (!(await canInProject(session, channel.project_id, MANAGE_WIDGETS_PERMISSION))) {
    return errorResponse(404, "not_found");
  }

  const secret = generateSigningSecret();
  const { data, error } = await serviceClient()
    .from("widget_apps")
    .insert({
      public_id: generatePublicId(),
      name: typeof body.name === "string" && body.name.trim() ? body.name.trim().slice(0, 60) : "Website",
      secret_hash: sealSigningSecret(secret),
      secret_last4: last4(secret),
      allowed_origins: origins.origins,
      channel_id: channel.id,
      project_id: channel.project_id,
      created_by: session.user.id,
    })
    .select("*")
    .single();
  if (error) {
    console.error("[widget-apps.create]", error.message);
    return errorResponse(500, "write_failed");
  }

  // Show the secret once; it is never retrievable again.
  return jsonResponse({ ...normalizeWidgetApp(data), signingSecret: secret }, 201);
}
