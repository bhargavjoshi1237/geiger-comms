// GET /api/widget/orders — recent orders for the signed-in contact (New Conversation "Which order?" picker).
// Anonymous visitors have no orders: the list is empty and the widget should hide the picker.

import { errorResponse, jsonResponse } from "@/lib/widget/respond";
import { requirePrincipal } from "@/lib/widget/auth";
import { isWidgetApiConfigured } from "@/lib/widget/service";
import { getAppById } from "@/lib/widget/apps";
import { listContactOrders } from "@/lib/widget/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  if (!isWidgetApiConfigured()) return errorResponse(503, "not_configured");
  const principal = await requirePrincipal(request);
  if (!principal) return errorResponse(401, "invalid_token");

  const app = await getAppById(principal.appId);
  if (!app) return errorResponse(404, "app_not_found");

  const rows = principal.contactId ? await listContactOrders(principal.contactId) : [];
  return jsonResponse({
    orders: rows.map((o) => ({
      id: o.id,
      reference: o.reference,
      title: o.title,
      status: o.status ?? "—",
      items: Array.isArray(o.items) ? o.items?.[0]?.count ?? 1 : 1,
    })),
  });
}
