import "server-only";

// Server-only widget configuration; never import from the iframe/browser bundle (spec §10.10).

// HS256 needs at least 256 bits of key material; anything shorter is treated as unconfigured.
export const MIN_SESSION_SECRET_LENGTH = 32;

// Signs our own 15-minute session JWTs and derives the signing-secret sealing key.
export function widgetSessionSecret() {
  return process.env.WIDGET_SESSION_SECRET || "";
}

export function hasStrongSessionSecret() {
  return widgetSessionSecret().length >= MIN_SESSION_SECRET_LENGTH;
}

// Supabase project's JWT secret, used solely to sign realtime tokens Realtime accepts (spec §4.1).
export function supabaseJwtSecret() {
  return process.env.SUPABASE_JWT_SECRET || "";
}

// Service-role key for the public API's DB access.
export function serviceRoleKey() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || "";
}

export function supabaseUrl() {
  return stripTrailingSlash(process.env.NEXT_PUBLIC_SUPABASE_URL || "");
}

// Public origin of this deployment ("https://app.geiger.dev"), baked into the loader so customers never configure a URL (spec §2).
export function publicOrigin() {
  return stripTrailingSlash(process.env.NEXT_PUBLIC_APP_ORIGIN || "");
}

export function basePath() {
  return process.env.NEXT_PUBLIC_BASE_PATH || "";
}

function stripTrailingSlash(value) {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}
