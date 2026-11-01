import "server-only";
import { createClient } from "@supabase/supabase-js";

// Service-role client pinned to the comms schema. Used only for the knowledge-base-and-ai-providers spec §5.1
// whitelist (Vault RPCs, provider and ai_settings lookups after authorization, provider health writes, usage
// inserts and quota counts), always scoped by a project the route has already authorized.

let client = null;

export function isAdminConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function adminClient() {
  if (!isAdminConfigured()) return null;
  client ??= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    db: { schema: "comms" },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}
