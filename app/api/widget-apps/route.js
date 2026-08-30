import { errorResponse, jsonResponse, readJsonBody } from "@/lib/widget/respond";
import { serviceClient } from "@/lib/widget/service";
import { requireWorkspaceUser } from "@/lib/widget/workspace_auth";
import {
  generatePublicId,
  generateSigningSecret,
  last4,
  sealSigningSecret,
  validateAllowedOrigins,
} from "@/lib/widget/widget_app_server";
import { normalizeWidgetApp } from "@/lib/supabase/widget_apps";

// GET  /api/widget-apps?channelId=… — the signed-in workspace's widget apps.
// POST /api/widget-apps — create one; the plaintext signing secret is returned
// exactly once and only its sealed form + last4 are stored (spec §10.1).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const user = await requireWorkspaceUser();
  if (!user) return errorResponse(401, "unauthorized");

  const url = new URL(request.url);
  const channelId = url.searchParams.get("channelId");
  try {
    let query = serviceClient()
      .from("widget_apps")
      .select("*")
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (channelId) query = query.eq("channel_id", channelId);
    const { data, error } = await query;
    if (error) {
      console.error("[widget-apps.list]", error.message);
      return errorResponse(500, "read_failed");
    }
    return jsonResponse((data || []).map(normalizeWidgetApp));
  } catch (e) {
    console.error("[widget-apps.list]", e);
    return errorResponse(500, "read_failed");
  }
}

export async function POST(request) {
  const user = await requireWorkspaceUser();
  if (!user) return errorResponse(401, "unauthorized");

  const body = await readJsonBody(request);
  if (!body?.channelId) return errorResponse(400, "channel_id_required");
  const origins = validateAllowedOrigins(body.allowedOrigins || []);
  if (!origins.ok || origins.origins.length === 0) {
    return errorResponse(400, "allowed_origins must be exact scheme://host[:port] values");
  }

  // The channel pins the project scope.
  const channel = await serviceClient()
    .from("channels")
    .select("id, project_id")
    .eq("id", body.channelId)
    .is("deleted_at", null)
    .maybeSingle();
  if (channel.error) {
    console.error("[widget-apps.create]", channel.error.message);
    return errorResponse(500, "read_failed");
  }
  if (!channel.data) return errorResponse(400, "unknown_channel");

  const secret = generateSigningSecret();
  const { data, error } = await serviceClient()
    .from("widget_apps")
    .insert({
      public_id: generatePublicId(),
      name: typeof body.name === "string" && body.name.trim() ? body.name.trim().slice(0, 60) : "Website",
      secret_hash: sealSigningSecret(secret),
      secret_last4: last4(secret),
      allowed_origins: origins.origins,
      channel_id: channel.data.id,
      project_id: channel.data.project_id,
      created_by: user.id,
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
