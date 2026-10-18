// POST /api/widget/leads — capture an offline lead { email, message } so the workspace can follow up by email.
// With a session the app comes from the token; without one (?appId=) the host origin must be allowlisted exactly like boot (§10.2).

import { errorResponse, jsonResponse, readJsonBody } from "@/lib/widget/respond";
import { isWidgetApiConfigured, serviceClient } from "@/lib/widget/service";
import { clientIp, rateLimitAll } from "@/lib/widget/ratelimit";
import { requirePrincipal } from "@/lib/widget/auth";
import { getAppById, getAppByPublicId } from "@/lib/widget/apps";
import { embedOrigin, originAllowed } from "@/lib/widget/origins";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request) {
  if (!isWidgetApiConfigured()) return errorResponse(503, "not_configured");

  const body = (await readJsonBody(request)) ?? {};
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!EMAIL_RE.test(email) || email.length > 254) return errorResponse(400, "bad_email");
  if (!message || message.length > 5000) return errorResponse(400, "bad_message");

  let app = null;
  const principal = await requirePrincipal(request);
  if (principal) {
    app = await getAppById(principal.appId);
  } else {
    const appId = new URL(request.url).searchParams.get("appId");
    if (!appId) return errorResponse(400, "missing_app");
    app = await getAppByPublicId(appId);
    if (!app) return errorResponse(404, "app_not_found");
    const hostOrigin = embedOrigin(request, typeof body.parentOrigin === "string" ? body.parentOrigin : null);
    if (!hostOrigin || !originAllowed(app.allowed_origins, hostOrigin)) {
      return errorResponse(403, "origin_not_allowed");
    }
  }
  if (!app) return errorResponse(404, "app_not_found");

  const allowed = rateLimitAll([
    [`leads:ip:${clientIp(request)}`, 10, 60_000],
    [`leads:app:${app.id}`, 300, 60_000],
  ]);
  if (!allowed) return errorResponse(429, "rate_limited");

  try {
    const { data, error } = await serviceClient()
      .from("leads")
      .insert({
        app_id: app.id,
        project_id: app.project_id ?? null,
        contact_id: principal?.contactId ?? null,
        visitor_id: principal?.visitorId ?? null,
        email,
        body: message,
        source: "widget",
        state: "new",
      })
      .select("id")
      .single();
    if (error) {
      console.error("[widget.leads]", error.message);
      return errorResponse(500, "write_failed");
    }
    return jsonResponse({ id: data?.id ?? null }, 201);
  } catch (e) {
    console.error("[widget.leads]", e);
    return errorResponse(500, "write_failed");
  }
}
