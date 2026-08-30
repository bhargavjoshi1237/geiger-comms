// GET /api/widget/quick-actions — the four-card grid shown on the Hub. The
// set is workspace-configurable; an unconfigured workspace gets the default
// four "shell" actions (matching the Hub screenshot).

import { errorResponse, jsonResponse } from "@/lib/widget/respond";
import { requirePrincipal } from "@/lib/widget/auth";
import { isWidgetApiConfigured } from "@/lib/widget/service";
import { getAppById } from "@/lib/widget/apps";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_ACTIONS = [
  { id: "track", label: "Track an order", icon: "package" },
  { id: "return", label: "Start a return", icon: "undo" },
  { id: "billing", label: "Billing question", icon: "receipt" },
  { id: "account", label: "Account & login", icon: "user" },
];

export async function GET(request) {
  if (!isWidgetApiConfigured()) return errorResponse(503, "not_configured");
  const principal = await requirePrincipal(request);
  if (!principal) return errorResponse(401, "invalid_token");

  const app = await getAppById(principal.appId);
  if (!app) return errorResponse(404, "app_not_found");

  const cfg = await buildConfig(app);
  return jsonResponse({ actions: cfg });
}

async function buildConfig(app) {
  // The action list lives in messenger channel config. Missing field → default.
  try {
    const { data, error } = await (
      await import("@/lib/widget/service")
    ).serviceClient()
      .from("channels")
      .select("config")
      .eq("id", app.channel_id ?? "")
      .maybeSingle();
    if (error || !data?.config || !Array.isArray(data.config.quickActions)) {
      return DEFAULT_ACTIONS;
    }
    return data.config.quickActions;
  } catch {
    return DEFAULT_ACTIONS;
  }
}
