import "server-only";
import { createClient } from "@supabase/supabase-js";
import { serviceRoleKey, supabaseUrl } from "@/lib/widget/env";

// Service-role access for the automation engine (bypasses RLS; never browser-safe).
// Every client stamps its writes with origin headers so comms.automation_enqueue can tell which workflow caused an event and how deep the chain is.

let base = null;

export function isAutomationConfigured() {
  return Boolean(supabaseUrl() && serviceRoleKey());
}

export function automationClient({ depth = 0, workflowId = null } = {}) {
  const headers = { "x-comms-automation-depth": String(depth) };
  if (workflowId) headers["x-comms-automation-workflow"] = workflowId;
  return createClient(supabaseUrl(), serviceRoleKey(), {
    db: { schema: "comms" },
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers },
  });
}

// Reads, claims and system writes (snooze wake); events it causes count as depth 0, like a person's.
export function baseClient() {
  if (!base) base = automationClient();
  return base;
}
