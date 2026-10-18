// GET /comms/widget/v1.js — the embeddable loader (spec §7). Origin and base path are baked at serve time; the customer never configures a URL.

import { buildLoaderScript } from "@/lib/widget/loader";
import { basePath, publicOrigin } from "@/lib/widget/env";
import { normalizeOrigin } from "@/lib/widget/origins";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  // Production bakes NEXT_PUBLIC_APP_ORIGIN and may be shared-cached. Without it (dev) the origin comes from the request URL only —
  // never X-Forwarded-* — and the response is no-store, so a forged Host can never poison a cache that customers' pages load from.
  const configured = normalizeOrigin(publicOrigin());
  const origin = configured || new URL(request.url).origin;
  if (!configured && process.env.NODE_ENV === "production") {
    console.error("[widget.loader] NEXT_PUBLIC_APP_ORIGIN is unset; serving an uncacheable loader");
  }
  const script = buildLoaderScript(origin, basePath());
  return new Response(script, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": configured ? "public, max-age=300" : "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
