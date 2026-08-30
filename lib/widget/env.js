// Server-only widget configuration. Everything in lib/widget runs on the Node
// runtime inside app/api/widget/** and app/widget/v1.js — never import these
// files from anything under the browser bundle (spec §10.10).

// Secret that signs our own 15-minute session JWTs. Server-only.
export function widgetSessionSecret() {
  return process.env.WIDGET_SESSION_SECRET || "";
}

// Supabase project's JWT secret, used solely to sign realtime tokens Realtime
// accepts (spec §4.1). Server-only.
export function supabaseJwtSecret() {
  return process.env.SUPABASE_JWT_SECRET || "";
}

// Service-role key for the public API's DB access. Server-only.
export function serviceRoleKey() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || "";
}

export function supabaseUrl() {
  return process.env.NEXT_PUBLIC_SUPABASE_URL || "";
}

// Public origin of this deployment ("https://app.geiger.dev"), baked into the
// served loader at serve time so customers never configure a URL (spec §2).
export function publicOrigin() {
  return stripTrailingSlash(process.env.NEXT_PUBLIC_APP_ORIGIN || "");
}

function stripTrailingSlash(value) {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}
