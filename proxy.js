import { NextResponse } from "next/server";

// CSP frame-ancestors for the widget iframe route (spec §10.3): only the app's own allowlisted origins may frame /widget.
// Fails closed to 'self' (the workspace preview) for an unknown, revoked or channel-disconnected app, or any lookup error.

const CACHE_MS = 60_000;
const MAX_CACHE = 1000;
const cache = new Map(); // publicId -> { origins, cachedAt }

// Only a clean scheme://host[:port] may enter the header, so a stored value can never inject a CSP directive.
function cspOrigin(value) {
  try {
    const url = new URL(String(value));
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return /^https?:\/\/[a-z0-9.-]+(:\d+)?$/i.test(url.origin) ? url.origin : null;
  } catch {
    return null;
  }
}

function remember(publicId, origins) {
  if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value);
  cache.set(publicId, { origins, cachedAt: Date.now() });
  return origins;
}

async function allowedOriginsFor(publicId) {
  if (!publicId || !/^wg_[a-z0-9]{1,32}$/i.test(publicId)) return [];
  const hit = cache.get(publicId);
  if (hit && Date.now() - hit.cachedAt < CACHE_MS) return hit.origins;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return [];
  try {
    const select = "allowed_origins,channel:channels(kind,status,deleted_at)";
    const endpoint = `${url.replace(/\/$/, "")}/rest/v1/widget_apps?public_id=eq.${encodeURIComponent(publicId)}&deleted_at=is.null&select=${encodeURIComponent(select)}`;
    // widget_apps lives in the comms schema; without Accept-Profile PostgREST looks in public and finds nothing.
    const res = await fetch(endpoint, {
      headers: { apikey: key, authorization: `Bearer ${key}`, "accept-profile": "comms" },
      cache: "no-store",
    });
    if (!res.ok) return [];
    const rows = await res.json();
    const row = Array.isArray(rows) ? rows[0] : null;
    const channel = row?.channel;
    const live = Boolean(channel && !channel.deleted_at && channel.kind === "messenger" && channel.status !== "disconnected");
    const origins = live && Array.isArray(row.allowed_origins) ? row.allowed_origins.map(cspOrigin).filter(Boolean) : [];
    return remember(publicId, [...new Set(origins)]);
  } catch {
    return [];
  }
}

export default async function proxy(request) {
  const appId = new URL(request.url).searchParams.get("appId") || "";
  const origins = await allowedOriginsFor(appId);
  const response = NextResponse.next();
  response.headers.set("content-security-policy", `frame-ancestors 'self' ${origins.join(" ")}`.trim());
  return response;
}

export const config = {
  matcher: ["/widget"],
};
