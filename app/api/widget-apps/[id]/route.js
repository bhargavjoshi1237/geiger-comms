import { errorResponse, jsonResponse, readJsonBody } from "@/lib/widget/respond";
import { serviceClient } from "@/lib/widget/service";
import { requireWorkspaceUser } from "@/lib/widget/workspace_auth";
import {
  generateSigningSecret,
  last4,
  loadAppRow,
  sealSigningSecret,
  validateAllowedOrigins,
} from "@/lib/widget/widget_app_server";
import { normalizeWidgetApp } from "@/lib/supabase/widget_apps";

// PATCH  /api/widget-apps/:id — rename / replace allowed origins.
// DELETE /api/widget-apps/:id — revoke (soft delete).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(request, { params }) {
  const user = await requireWorkspaceUser();
  if (!user) return errorResponse(401, "unauthorized");

  const { id } = await params;
  const app = await loadAppRow(id);
  if (!app) return errorResponse(404, "not_found");

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
    .eq("id", id)
    .select("*")
    .single();
  if (error) {
    console.error("[widget-apps.update]", error.message);
    return errorResponse(500, "write_failed");
  }
  return jsonResponse(normalizeWidgetApp(data));
}

export async function DELETE(request, { params }) {
  const user = await requireWorkspaceUser();
  if (!user) return errorResponse(401, "unauthorized");

  const { id } = await params;
  const app = await loadAppRow(id);
  if (!app) return errorResponse(404, "not_found");

  const { error } = await serviceClient()
    .from("widget_apps")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) {
    console.error("[widget-apps.delete]", error.message);
    return errorResponse(500, "write_failed");
  }
  return new Response(null, { status: 204 });
}

// POST /api/widget-apps/:id/rotate — new signing secret (shown once); the old
// one stays verifiable for a grace period so live sessions don't break
// (spec §10.1). Implemented here rather than PATCH because rotation is not an
// ordinary field edit.
export async function POST(request, { params }) {
  const user = await requireWorkspaceUser();
  if (!user) return errorResponse(401, "unauthorized");

  const { id } = await params;
  const app = await loadAppRow(id);
  if (!app) return errorResponse(404, "not_found");

  const secret = generateSigningSecret();
  const meta = app.metadata && typeof app.metadata === "object" ? app.metadata : {};
  // Grace period: the current sealed secret moves aside and keeps verifying
  // until the next rotation replaces it.
  const { data, error } = await serviceClient()
    .from("widget_apps")
    .update({
      secret_hash: sealSigningSecret(secret),
      secret_last4: last4(secret),
      metadata: { ...meta, previous_secret: app.secret_hash },
    })
    .eq("id", id)
    .select("*")
    .single();
  if (error) {
    console.error("[widget-apps.rotate]", error.message);
    return errorResponse(500, "write_failed");
  }

  // Show the new secret once; it is never retrievable again.
  return jsonResponse({ ...normalizeWidgetApp(data), signingSecret: secret });
}
