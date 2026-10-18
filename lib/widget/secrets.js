import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { widgetSessionSecret } from "./env";

// Widget app signing secrets (spec §10.1). HS256 verification needs the raw secret, so it is stored SEALED (AES-256-GCM), never hashed.
// The sealing key derives from WIDGET_SESSION_SECRET: rotating that env var invalidates every stored secret.

// Every customer JWT is ≤ 24h, so a day of grace covers all tokens signed before a rotation.
export const ROTATION_GRACE_MS = 24 * 60 * 60 * 1000;

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

export function previousSecretActive(appRow, now = Date.now()) {
  if (!appRow?.previous_secret_hash || !appRow.previous_secret_expires_at) return false;
  const expires = Date.parse(appRow.previous_secret_expires_at);
  return Number.isFinite(expires) && expires > now;
}

// Raw secrets that may verify a customer JWT right now: the current one first, then the previous one inside its grace window.
export function verificationSecrets(appRow) {
  if (!appRow?.secret_hash) return [];
  const sealed = [appRow.secret_hash];
  if (previousSecretActive(appRow)) sealed.push(appRow.previous_secret_hash);
  return sealed.map(openSigningSecret).filter(Boolean);
}
