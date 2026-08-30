// ===========================================================================
// Widget public API — server-only Supabase access via the service-role key.
// This module must never be imported from anything under app/widget/ (the
// iframe bundle): the service role bypasses RLS and is not browser-safe.
// ===========================================================================

import { createClient } from "@supabase/supabase-js";

let client = null;

export function isWidgetApiConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.SUPABASE_SERVICE_ROLE_KEY &&
      process.env.WIDGET_SESSION_SECRET
  );
}

export function serviceClient() {
  if (!client) {
    client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { db: { schema: "comms" }, auth: { persistSession: false } }
    );
  }
  return client;
}
