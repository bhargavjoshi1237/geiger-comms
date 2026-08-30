import { NextResponse } from "next/server";

// CSP frame-ancestors for the widget iframe route (spec §10.3): only the app's
// own allowlisted customer origins may frame /widget. Runs pre-render so the
// document response carries the policy. The API routes enforce the same
// allowlist independently.
const ALLOWED_ORIGINS_CACHE_MS = 60_000;
const cache = new Map(); // publicId -> { origins, cachedAt }

async function allowedOriginsFor(publicId) {
  const hit = cache.get(publicId);
  if (hit && Date.now() - hit.cachedAt < ALLOWED_ORIGINS_CACHE_MS) return hit.origins;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || !publicId || !/^wg_[a-z0-9]+$/i.test(publicId)) return [];
  try {
    const endpoint = `${url}/rest/v1/widget_apps?public_id=eq.${encodeURIComponent(publicId)}&deleted_at=is.null&select=allowed_origins`;
    const res = await fetch(endpoint, {
      headers: { apikey: key, authorization: `Bearer ${key}` },
      cache: "no-store",
    });
    if (!res.ok) return [];
    const rows = await res.json();
    const origins = Array.isArray(rows?.[0]?.allowed_origins) ? rows[0].allowed_origins : [];
    cache.set(publicId, { origins, cachedAt: Date.now() });
    return origins;
  } catch {
    return [];
  }
}

export default async function proxy(request) {
  const { searchParams } = new URL(request.url);
  const appId = searchParams.get("appId") || "";
  const origins = (await allowedOriginsFor(appId)).map((o) => o.replace(/\/$/, ""));

  const response = NextResponse.next();
  // No appId (or unknown app): same-origin only — the workspace preview.
  response.headers.set("content-security-policy", `frame-ancestors 'self' ${origins.join(" ")}`.trim());
  return response;
}

export const config = {
  matcher: ["/widget"],
};
