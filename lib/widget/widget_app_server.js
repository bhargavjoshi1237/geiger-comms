import "server-only";
import { randomBytes } from "node:crypto";
import { serviceClient } from "./service";
import { isUuid } from "./apps";
import { canInProject } from "./workspace_auth";

// Server-side helpers for the workspace's widget-app management routes (/api/widget-apps/*); secret sealing lives in ./secrets.

export { generateSigningSecret, sealSigningSecret, last4, ROTATION_GRACE_MS } from "./secrets";

// Short URL-safe public id: wg_ plus 8 unambiguous base32 chars.
export function generatePublicId() {
  const alphabet = "abcdefghjkmnpqrstvwxyz23456789";
  let id = "";
  const bytes = randomBytes(8);
  for (const byte of bytes) id += alphabet[byte % alphabet.length];
  return `wg_${id}`;
}

// Exact origins only — a bare hostname, a path or a wildcard is rejected (spec §12). Returns { ok, origins }.
export function validateAllowedOrigins(input) {
  if (!Array.isArray(input) || input.length > 50) return { ok: false };
  const origins = [];
  for (const value of input) {
    if (typeof value !== "string" || value.length > 255) return { ok: false };
    const trimmed = value.trim();
    if (!trimmed || trimmed.includes("*")) return { ok: false };
    let url;
    try {
      url = new URL(trimmed);
    } catch {
      return { ok: false };
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") return { ok: false };
    if (url.username || url.password) return { ok: false };
    const normalized = `${url.protocol}//${url.host}`.toLowerCase();
    // The normalized form must round-trip, so bare hostnames or values with paths/queries never pass.
    if (normalized !== trimmed.replace(/\/$/, "").toLowerCase()) return { ok: false };
    origins.push(normalized);
  }
  return { ok: true, origins: [...new Set(origins)] };
}

// Resolves an app row by id for the management routes (service role; callers authorise before acting).
export async function loadAppRow(id) {
  if (!isUuid(id)) return null;
  try {
    const { data, error } = await serviceClient()
      .from("widget_apps")
      .select("*")
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) {
      console.error("[widget.loadAppRow]", error.message);
      return null;
    }
    return data ?? null;
  } catch (e) {
    console.error("[widget.loadAppRow]", e);
    return null;
  }
}

export async function loadChannelRow(id) {
  if (!isUuid(id)) return null;
  try {
    const { data, error } = await serviceClient()
      .from("channels")
      .select("id, kind, project_id")
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) {
      console.error("[widget.loadChannelRow]", error.message);
      return null;
    }
    return data ?? null;
  } catch (e) {
    console.error("[widget.loadChannelRow]", e);
    return null;
  }
}

// The app when this user may act on it with `permission`, else null — the route answers 404 either way (§10.8).
export async function authorizedApp(session, id, permission) {
  const app = await loadAppRow(id);
  if (!app) return null;
  return (await canInProject(session, app.project_id, permission)) ? app : null;
}
