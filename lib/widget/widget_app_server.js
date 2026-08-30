import { randomBytes } from "crypto";
import { serviceClient } from "@/lib/widget/service";

// Server-side helpers for the workspace's widget-app management routes
// (/api/widget-apps/*). Secret generation/sealing lives in ./secrets so the
// boot path and the management path share one implementation.

export { generateSigningSecret, sealSigningSecret, last4 } from "./secrets";

// Short URL-safe public id: wg_ plus 8 unambiguous base32 chars.
export function generatePublicId() {
  const alphabet = "abcdefghjkmnpqrstvwxyz23456789";
  let id = "";
  const bytes = randomBytes(8);
  for (const byte of bytes) id += alphabet[byte % alphabet.length];
  return `wg_${id}`;
}

// Exact origins only — a bare hostname, a path or a wildcard is rejected
// (spec §12). Returns { ok, origins }.
export function validateAllowedOrigins(input) {
  if (!Array.isArray(input)) return { ok: false };
  const origins = [];
  for (const value of input) {
    if (typeof value !== "string") return { ok: false };
    const trimmed = value.trim();
    if (!trimmed || trimmed.includes("*")) return { ok: false };
    let url;
    try {
      url = new URL(trimmed);
    } catch {
      return { ok: false };
    }
    const normalized = `${url.protocol}//${url.host}`.toLowerCase();
    // Require the normalized form to round-trip so bare hostnames ("acme.com",
    // no scheme) or values with paths never pass.
    if (normalized !== trimmed.replace(/\/$/, "").toLowerCase()) return { ok: false };
    origins.push(normalized);
  }
  return { ok: true, origins: [...new Set(origins)] };
}

// Resolves an app row by id for the workspace management routes.
export async function loadAppRow(id) {
  if (!id) return null;
  try {
    const db = serviceClient();
    const { data, error } = await db
      .from("widget_apps")
      .select("*")
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle();
    if (error || !data) return null;
    return data;
  } catch (e) {
    console.error("[widget.loadAppRow]", e);
    return null;
  }
}
