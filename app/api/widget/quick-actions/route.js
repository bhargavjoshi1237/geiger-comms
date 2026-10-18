// GET /api/widget/quick-actions — the Hub's quick-action cards from messenger channel config; an unconfigured workspace gets the default four.

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

// Only the fields the card renders, from a bounded list, so channel config never leaks wholesale.
function cleanActions(list) {
  if (!Array.isArray(list)) return DEFAULT_ACTIONS;
  const out = list
    .filter((a) => a && typeof a === "object" && typeof a.label === "string")
    .slice(0, 8)
    .map((a) => ({
      id: typeof a.id === "string" ? a.id.slice(0, 64) : a.label.slice(0, 64),
      label: a.label.slice(0, 80),
      icon: typeof a.icon === "string" ? a.icon.slice(0, 32) : null,
    }));
  return out.length ? out : DEFAULT_ACTIONS;
}

export async function GET(request) {
  if (!isWidgetApiConfigured()) return errorResponse(503, "not_configured");
  const principal = await requirePrincipal(request);
  if (!principal) return errorResponse(401, "invalid_token");

  const app = await getAppById(principal.appId);
  if (!app) return errorResponse(404, "app_not_found");

  return jsonResponse({ actions: cleanActions(app.channel?.config?.quickActions) });
}
