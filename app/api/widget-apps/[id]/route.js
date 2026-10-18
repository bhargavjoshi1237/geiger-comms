import { errorResponse, jsonResponse, readJsonBody } from "@/lib/widget/respond";
import { isWidgetApiConfigured, serviceClient } from "@/lib/widget/service";
import { MANAGE_WIDGETS_PERMISSION, isSameOriginRequest, workspaceSession } from "@/lib/widget/workspace_auth";
import {
  ROTATION_GRACE_MS,
  authorizedApp,
  generateSigningSecret,
  last4,
  sealSigningSecret,
  validateAllowedOrigins,
} from "@/lib/widget/widget_app_server";
import { normalizeWidgetApp } from "@/lib/supabase/widget_apps";

// PATCH  /api/widget-apps/:id — rename / replace allowed origins.
// DELETE /api/widget-apps/:id — revoke (soft delete).
// POST   /api/widget-apps/:id — rotate the signing secret (shown once); the old one verifies for 24h only.
// All three need comms.settings.manage in the app's project; anything else answers 404, never 403 (§10.8).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function guard(request, params) {
  if (!isWidgetApiConfigured()) return { response: errorResponse(503, "not_configured") };
  if (!isSameOriginRequest(request)) return { response: errorResponse(403, "cross_site") };
  const session = await workspaceSession();
  if (!session) return { response: errorResponse(401, "unauthorized") };
  const { id } = await params;
  const app = await authorizedApp(session, id, MANAGE_WIDGETS_PERMISSION);
  if (!app) return { response: errorResponse(404, "not_found") };
  return { app };
}

export async function PATCH(request, { params }) {
  const { app, response } = await guard(request, params);
  if (response) return response;

  const body = await readJsonBody(request);
  const patch = {};
  if (typeof body?.name === "string" && body.name.trim()) patch.name = body.name.trim().slice(0, 60);
  if ("allowedOrigins" in (body || {})) {
    const origins = validateAllowedOrigins(body.allowedOrigins);
    if (!origins.ok) return errorResponse(400, "allowed_origins must be exact scheme://host[:port] values");
    patch.allowed_origins = origins.origins;
  }
  if (!Object.keys(patch).length) return errorResponse(400, "nothing_to_update");

  const { data, error } = await serviceClient()
    .from("widget_apps")
    .update(patch)
    .eq("id", app.id)
    .select("*")
    .single();
  if (error) {
    console.error("[widget-apps.update]", error.message);
    return errorResponse(500, "write_failed");
  }
  return jsonResponse(normalizeWidgetApp(data));
}

export async function DELETE(request, { params }) {
  const { app, response } = await guard(request, params);
  if (response) return response;

  const { error } = await serviceClient()
    .from("widget_apps")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", app.id);
  if (error) {
    console.error("[widget-apps.delete]", error.message);
    return errorResponse(500, "write_failed");
  }
  return new Response(null, { status: 204 });
}

export async function POST(request, { params }) {
  const { app, response } = await guard(request, params);
  if (response) return response;

  const secret = generateSigningSecret();
  const { data, error } = await serviceClient()
    .from("widget_apps")
    .update({
      secret_hash: sealSigningSecret(secret),
      secret_last4: last4(secret),
      previous_secret_hash: app.secret_hash,
      previous_secret_expires_at: new Date(Date.now() + ROTATION_GRACE_MS).toISOString(),
    })
    .eq("id", app.id)
    // Compare-and-swap: a concurrent rotation must not silently orphan the secret it just showed.
    .eq("secret_hash", app.secret_hash)
    .select("*")
    .maybeSingle();
  if (error) {
    console.error("[widget-apps.rotate]", error.message);
    return errorResponse(500, "write_failed");
  }
  if (!data) return errorResponse(409, "rotation_conflict");

  // Show the new secret once; it is never retrievable again.
  return jsonResponse({ ...normalizeWidgetApp(data), signingSecret: secret });
}
