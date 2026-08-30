// Widget app signing-secret handling (spec §10.1).
//
// HS256 verification needs the raw secret — a one-way hash cannot recompute an
// HMAC — so the secret is stored SEALED: AES-256-GCM under a key derived from
// WIDGET_SESSION_SECRET. It is never plaintext at rest, never leaves the
// server, and only the public_id reaches any browser. Rotation keeps the old
// sealed secret alive for a grace period (metadata.previous_secret) so tokens
// signed before rotation keep verifying.

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { widgetSessionSecret } from "./env";

export function generateSigningSecret() {
  return `sk_${randomBytes(32).toString("base64url")}`;
}

function sealingKey() {
  return createHash("sha256").update(`geiger-comms-widget-seal:${widgetSessionSecret()}`).digest();
}

export function sealSigningSecret(secret) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", sealingKey(), iv);
  const sealed = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.aesgcm.${iv.toString("base64url")}.${tag.toString("base64url")}.${sealed.toString("base64url")}`;
}

// Returns the raw secret or null; never throws.
export function openSigningSecret(stored) {
  try {
    const [version, scheme, ivB64, tagB64, dataB64] = String(stored).split(".");
    if (version !== "v1" || scheme !== "aesgcm") {
      console.error("[widget.seal] unrecognised secret format");
      return null;
    }
    const decipher = createDecipheriv("aes-256-gcm", sealingKey(), Buffer.from(ivB64, "base64url"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    console.error("[widget.seal] failed to open signing secret");
    return null;
  }
}

export function last4(secret) {
  return typeof secret === "string" && secret.length >= 4 ? secret.slice(-4) : null;
}

// Every raw secret that may verify a customer JWT right now: the current one,
// then the previous one during a rotation grace period. Order matters — the
// current secret must be tried first.
export function verificationSecrets(appRow) {
  if (!appRow?.secret_hash) return [];
  const meta = appRow.metadata && typeof appRow.metadata === "object" ? appRow.metadata : {};
  const sealed = [appRow.secret_hash, meta.previous_secret].filter((s) => typeof s === "string" && s);
  return sealed.map(openSigningSecret).filter(Boolean);
}
