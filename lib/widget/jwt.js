// Token minting/verification for the widget auth flow (spec §4.1).
//
// sessionToken  — ours, HS256 with WIDGET_SESSION_SECRET, 15 min, claims
//                 { sid, appId, contactId?, visitorId, scope: "widget" }.
// customerJwt   — signed by the customer's backend; verified once at boot.
// realtimeToken — signed with the Supabase project JWT secret so Realtime
//                 accepts it; the authorisation claims ride in the token so
//                 the realtime.messages RLS policy needs no lookup.

import { SignJWT, jwtVerify } from "jose";

const TOKEN_TTL_S = 15 * 60;
export const MAX_CUSTOMER_JWT_LIFETIME_S = 24 * 60 * 60;
const CLOCK_TOLERANCE_S = 60;

function key(secret) {
  return new TextEncoder().encode(secret);
}

export async function signSessionToken(claims) {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${TOKEN_TTL_S}s`)
    .sign(key(process.env.WIDGET_SESSION_SECRET));
}

export async function verifySessionToken(token) {
  try {
    const { payload } = await jwtVerify(token, key(process.env.WIDGET_SESSION_SECRET), {
      algorithms: ["HS256"],
      clockTolerance: CLOCK_TOLERANCE_S,
    });
    if (payload.scope !== "widget") return null;
    return payload;
  } catch {
    return null;
  }
}

// HS256 only: alg "none" and every asymmetric algorithm are rejected here.
// Returns the payload or null; never throws.
export async function verifyCustomerJwt(token, signingSecret) {
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
  if (!payload.user_id || typeof payload.user_id !== "string") return null;
  const lifetime =
    typeof payload.iat === "number"
      ? payload.exp - payload.iat
      : payload.exp - Math.floor(Date.now() / 1000);
  if (lifetime > MAX_CUSTOMER_JWT_LIFETIME_S) return null;
  return payload;
}

export async function signRealtimeToken({ visitorId, contactId, appId }) {
  const projectSecret = process.env.SUPABASE_JWT_SECRET;
  if (!projectSecret || !visitorId) return null;
  const claims = { role: "anon", visitor_id: visitorId, app_id: appId };
  if (contactId) claims.contact_id = contactId;
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${TOKEN_TTL_S}s`)
    .sign(key(projectSecret));
}
