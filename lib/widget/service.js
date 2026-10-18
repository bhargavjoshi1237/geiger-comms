import "server-only";
import { createClient } from "@supabase/supabase-js";
import { hasStrongSessionSecret, serviceRoleKey, supabaseUrl } from "./env";

// Widget public API: server-only Supabase access via the service-role key, which bypasses RLS and is never browser-safe.

let client = null;

export function isWidgetApiConfigured() {
  const ok = Boolean(supabaseUrl() && serviceRoleKey() && hasStrongSessionSecret());
  if (!ok && process.env.WIDGET_SESSION_SECRET && !hasStrongSessionSecret()) {
    console.error("[widget.config] WIDGET_SESSION_SECRET must be at least 32 characters");
  }
  return ok;
}

export function serviceClient() {
  if (!client) {
    client = createClient(supabaseUrl(), serviceRoleKey(), {
      db: { schema: "comms" },
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}
