// Exact-origin allowlist matching (spec §10.2). Origins are scheme://host[:port]
// compared as full strings — no wildcard subdomains, no suffix matches, so
// evil-acme.com never matches acme.com. URL.origin normalises default ports.

export function normalizeOrigin(value) {
  if (typeof value !== "string" || !value) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function originAllowed(allowedOrigins, origin) {
  if (!origin) return false;
  return (allowedOrigins || []).some((o) => normalizeOrigin(o) === origin);
}
