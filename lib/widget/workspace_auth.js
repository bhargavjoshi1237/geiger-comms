import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { normalizeOrigin, selfOrigins } from "./origins";

// Auth for the workspace's widget-app management routes (/api/widget-apps/*): the signed-in user's own Supabase session from
// cookies, and project permissions decided by the database (comms.can_access_project / comms.rbac_allows), never by the client.

// Installing, rotating and revoking widgets is administration: Owner ("*") and Admin hold it.
export const MANAGE_WIDGETS_PERMISSION = "comms.settings.manage";
// Seeing a project's widget apps (Install section, in-workspace test launcher).
export const VIEW_WIDGETS_PERMISSION = "comms.channels.view";

// Returns { user, db } where db is a comms-schema client acting as that user, or null when signed out.
export async function workspaceSession() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  const cookieStore = await cookies();
  const db = createServerClient(url, anonKey, {
    db: { schema: "comms" },
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) cookieStore.set(name, value, options);
        } catch {
          // Server Components can't set cookies; refresh still works via the client.
        }
      },
    },
  });
  const {
    data: { user },
  } = await db.auth.getUser();
  return user ? { user, db } : null;
}

// Back-compat: the signed-in user or null.
export async function requireWorkspaceUser() {
  return (await workspaceSession())?.user ?? null;
}

// Cookie-authenticated writes must come from our own pages, never a cross-site form or fetch.
// Sec-Fetch-Site is browser-set and decides when present; older browsers fall back to comparing Origin.
export function isSameOriginRequest(request) {
  const site = request.headers.get("sec-fetch-site");
  if (site) return site === "same-origin";
  const origin = request.headers.get("origin");
  return !origin || selfOrigins(request).has(normalizeOrigin(origin));
}

async function rpcTrue(db, fn, args) {
  try {
    const { data, error } = await db.rpc(fn, args);
    if (error) {
      console.error(`[widget-apps.${fn}]`, error.message);
      return false;
    }
    return data === true;
  } catch (e) {
    console.error(`[widget-apps.${fn}]`, e);
    return false;
  }
}

// Project membership alone, for reads every project member needs; a null project is nobody's.
export async function canAccessProject(session, projectId) {
  if (!session || !projectId) return false;
  return rpcTrue(session.db, "can_access_project", { target: projectId });
}

// Project member holding `permission` in that project.
export async function canInProject(session, projectId, permission) {
  if (!(await canAccessProject(session, projectId))) return false;
  return rpcTrue(session.db, "rbac_allows", { p_permission: permission, p_project: projectId });
}
