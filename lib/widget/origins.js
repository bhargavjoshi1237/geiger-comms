import "server-only";
import { publicOrigin } from "./env";

// Exact-origin allowlist matching (spec §10.2): scheme://host[:port] compared as whole strings, so evil-acme.com never matches acme.com.

export function normalizeOrigin(value) {
  if (typeof value !== "string" || !value || value.length > 2048) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function originAllowed(allowedOrigins, origin) {
  const wanted = normalizeOrigin(origin);
  if (!wanted) return false;
  return (allowedOrigins || []).some((o) => normalizeOrigin(o) === wanted);
}

// The origins this deployment itself answers on: the configured public origin and the one the request arrived at.
export function selfOrigins(request) {
  const out = new Set();
  const configured = normalizeOrigin(publicOrigin());
  if (configured) out.add(configured);
  try {
    out.add(new URL(request.url).origin);
  } catch {
    // request.url is always absolute in route handlers
  }
  return out;
}

// A call from one of our own pages (the widget iframe): the browser-set Sec-Fetch-Site, which page script cannot forge, or an Origin we serve.
export function fromOwnPage(request) {
  if (request.headers.get("sec-fetch-site") === "same-origin") return true;
  const origin = normalizeOrigin(request.headers.get("origin"));
  return Boolean(origin) && selfOrigins(request).has(origin);
}

// The iframe's own URL carries ?parentOrigin=; a same-origin fetch from it sends that URL as Referer.
function refererParentOrigin(request, ownOrigin) {
  const referer = request.headers.get("referer");
  if (!referer) return null;
  try {
    const url = new URL(referer);
    if (url.origin !== ownOrigin || !url.pathname.endsWith("/widget")) return null;
    return normalizeOrigin(url.searchParams.get("parentOrigin"));
  } catch {
    return null;
  }
}

// The host page a call speaks for (§10.2): a direct call's own Origin, or — when our iframe calls — the parent origin its bridge verified.
// Framing itself is enforced by the per-app frame-ancestors CSP (proxy.js), so only an allowlisted page can host that iframe.
export function embedOrigin(request, parentOrigin) {
  const origin = normalizeOrigin(request.headers.get("origin"));
  if (!origin) return null;
  if (!fromOwnPage(request)) return origin;
  return normalizeOrigin(parentOrigin) || refererParentOrigin(request, origin) || origin;
}
