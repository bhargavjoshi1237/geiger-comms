// GET /api/widget/orders — recent orders for the signed-in contact. Surfaces
// under the New Conversation "Which order?" picker.

import { errorResponse, jsonResponse } from "@/lib/widget/respond";
import { requirePrincipal } from "@/lib/widget/auth";
import { isWidgetApiConfigured } from "@/lib/widget/service";
import { getAppById } from "@/lib/widget/apps";
import { serviceClient } from "@/lib/widget/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  if (!isWidgetApiConfigured()) return errorResponse(503, "not_configured");
  const principal = await requirePrincipal(request);
  if (!principal) return errorResponse(401, "invalid_token");

  const app = await getAppById(principal.appId);
  if (!app) return errorResponse(404, "app_not_found");

  // Orders hang off the contact — anonymous visitors see the demo two from
  // the channel seed so the New Conversation flow has something to pick.
  let rows = [];
  if (principal.contactId) {
    const { data, error } = await serviceClient()
      .from("orders")
      .select("id, reference, title, status, items:order_items(count)")
      .eq("contact_id", principal.contactId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(8);
    if (error) console.error("[widget.orders]", error.message);
    rows = data ?? [];
  } else {
    rows = DEMO_ORDERS;
  }

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

const DEMO_ORDERS = [
  { id: "demo-1", reference: "48120", title: "Blender, 2 items", status: "Out for delivery today", items: 2 },
  { id: "demo-2", reference: "47903", title: "Kettle", status: "Delivered 12 Aug", items: 1 },
];
