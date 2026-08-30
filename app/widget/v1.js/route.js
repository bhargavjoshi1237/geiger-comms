// GET /comms/widget/v1.js — the embeddable loader (spec §7). The origin and
// base path are baked at serve time; the customer never configures a URL.

import { buildLoaderScript } from "@/lib/widget/loader";
import { publicOrigin } from "@/lib/widget/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function requestOrigin(request) {
  // Env first (production); request headers only as a dev fallback.
  const configured = publicOrigin();
  if (configured) return configured;
  const url = new URL(request.url);
  const proto = request.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? url.host;
  return `${proto}://${host}`;
}

export async function GET(request) {
  const script = buildLoaderScript(requestOrigin(request), process.env.NEXT_PUBLIC_BASE_PATH ?? "");
  return new Response(script, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  });
}
