// POST /api/widget/leads — capture an offline lead so the workspace Inbox
// can follow up by email. Validates email shape, length-limits the message
// body, and rate-limits per session. Anonymous (no session) leads are
// permitted; they're held under the originating app's project so the
// workspace can match them when a teammate logs in.

import { errorResponse, jsonResponse, readJsonBody } from "@/lib/widget/respond";
import { isWidgetApiConfigured } from "@/lib/widget/service";
import { serviceClient } from "@/lib/widget/service";
import { rateLimit } from "@/lib/widget/ratelimit";
import { requirePrincipal } from "@/lib/widget/auth";
import { getAppById, getAppByPublicId } from "@/lib/widget/apps";
import { originAllowed } from "@/lib/widget/origins";

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

  // Two paths: a logged-in visitor uses the widget session; an anonymous
  // submission uses the originating appId + origin.
  let app = null;
  const principal = await requirePrincipal(request);
  if (principal) {
    app = await getAppById(principal.appId);
  } else {
    const url = new URL(request.url);
    const appId = url.searchParams.get("appId");
    if (!appId) return errorResponse(400, "missing_app");
    app = await getAppByPublicId(appId);
    const origin = request.headers.get("origin");
    if (!app || !origin || !originAllowed(app.allowed_origins, origin)) {
      return errorResponse(403, "origin_not_allowed");
    }
  }
  if (!app) return errorResponse(404, "app_not_found");

  if (!rateLimit(`leads:${app.public_id}`, 20, 60_000)) {
    return errorResponse(429, "rate_limited");
  }

  try {
    const sb = serviceClient();
    const { data, error } = await sb
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
