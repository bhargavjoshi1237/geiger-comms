import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { supabaseJwtSecret, widgetSessionSecret } from "./env";

// Token minting/verification for the widget auth flow (spec §4.1, §10.4).
// sessionToken: ours, HS256, 15 min, { sid, appId, contactId?, visitorId?, po, sat, scope: "widget" }.
// customerJwt: the customer's backend signs it; verified once at boot.
// realtimeToken: signed with the Supabase project secret so Realtime accepts it; claims ride in the token.

export const TOKEN_TTL_S = 15 * 60;
export const MAX_CUSTOMER_JWT_LIFETIME_S = 24 * 60 * 60;
// A session chain (boot + refreshes) never outlives the longest customer JWT the spec allows.
export const MAX_SESSION_AGE_S = 24 * 60 * 60;
const CLOCK_TOLERANCE_S = 60;
const MAX_USER_ID_LENGTH = 255;

function key(secret) {
  return new TextEncoder().encode(secret);
}

function nowS() {
  return Math.floor(Date.now() / 1000);
}

export async function signSessionToken(claims) {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt()
    .setExpirationTime(`${TOKEN_TTL_S}s`)
    .sign(key(widgetSessionSecret()));
}

export async function verifySessionToken(token) {
  if (typeof token !== "string" || token.length > 4096) return null;
  try {
    const { payload } = await jwtVerify(token, key(widgetSessionSecret()), {
      algorithms: ["HS256"],
      clockTolerance: CLOCK_TOLERANCE_S,
    });
    if (payload.scope !== "widget" || typeof payload.sid !== "string" || typeof payload.appId !== "string") return null;
    return payload;
  } catch {
    return null;
  }
}

// HS256 only (alg none and every asymmetric alg rejected), user_id + exp required, lifetime ≤ 24h, ≤ 60s skew. Never throws.
export async function verifyCustomerJwt(token, signingSecret) {
  if (typeof token !== "string" || token.length > 8192 || !signingSecret) return null;
  let payload;
  try {
    ({ payload } = await jwtVerify(token, key(signingSecret), {
      algorithms: ["HS256"],
      clockTolerance: CLOCK_TOLERANCE_S,
    }));
  } catch {
    return null;
  }
  if (typeof payload.exp !== "number") return null;
  const now = nowS();
  // Remaining life is bounded even when iat is absent or back-dated.
  if (payload.exp - now > MAX_CUSTOMER_JWT_LIFETIME_S + CLOCK_TOLERANCE_S) return null;
  if (payload.iat !== undefined) {
    if (typeof payload.iat !== "number" || payload.iat > now + CLOCK_TOLERANCE_S) return null;
    if (payload.exp - payload.iat > MAX_CUSTOMER_JWT_LIFETIME_S) return null;
  }
  const userId =
    typeof payload.user_id === "string"
      ? payload.user_id.trim()
      : Number.isSafeInteger(payload.user_id)
        ? String(payload.user_id)
        : "";
  if (!userId || userId.length > MAX_USER_ID_LENGTH) return null;
  return { ...payload, user_id: userId };
}

// Contact-only sessions get a token too; the realtime policy checks contact_id when present, else visitor_id.
export async function signRealtimeToken({ visitorId, contactId, appId }) {
  const projectSecret = supabaseJwtSecret();
  if (!projectSecret || (!visitorId && !contactId)) return null;
  const claims = { role: "anon", app_id: appId };
  if (visitorId) claims.visitor_id = visitorId;
  if (contactId) claims.contact_id = contactId;
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt()
    .setExpirationTime(`${TOKEN_TTL_S}s`)
    .sign(key(projectSecret));
}
