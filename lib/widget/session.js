import "server-only";
import { randomUUID } from "node:crypto";
import { embedOrigin, originAllowed } from "./origins";
import { clientIp, rateLimitAll } from "./ratelimit";
import {
  MAX_SESSION_AGE_S,
  TOKEN_TTL_S,
  signRealtimeToken,
  signSessionToken,
  verifyCustomerJwt,
} from "./jwt";
import { verificationSecrets } from "./secrets";
import { getAppById, getAppByPublicId, buildWidgetConfig } from "./apps";
import { serviceClient } from "./service";
import { mergeVisitor, principalActive, releaseClaimedVisitor, upsertContact, upsertVisitor } from "./data";
import { contactVm } from "./viewmodels";

// Boot and refresh orchestration (spec §4): the customer's JWT is verified exactly once here; afterwards only our own 15-minute session token speaks.

const MINUTE = 60_000;

export const BOOT_ERRORS = {
  APP_NOT_FOUND: "app_not_found", // 404 — never confirm an app id exists
  ORIGIN_NOT_ALLOWED: "origin_not_allowed", // 403
  RATE_LIMITED: "rate_limited", // 429
  INVALID_TOKEN: "invalid_token", // 401
  BAD_REQUEST: "bad_request", // 400
};

const ANON_ID_RE = /^[A-Za-z0-9_-]{8,128}$/;

function cleanAnonymousId(value) {
  return typeof value === "string" && ANON_ID_RE.test(value) ? value : null;
}

function nowS() {
  return Math.floor(Date.now() / 1000);
}

// Field names here are the boot/refresh contract the widget client relies on.
async function mintTokens(principal) {
  const sessionToken = await signSessionToken({
    sid: principal.sid,
    appId: principal.appId,
    contactId: principal.contactId ?? null,
    visitorId: principal.visitorId ?? null,
    po: principal.parentOrigin ?? null,
    sat: principal.sessionStartedAt,
    scope: "widget",
  });
  const realtimeToken = await signRealtimeToken({
    visitorId: principal.visitorId,
    contactId: principal.contactId,
    appId: principal.appId,
  });
  return {
    sessionToken,
    realtimeToken, // null when SUPABASE_JWT_SECRET is unset
    expiresIn: TOKEN_TTL_S,
    realtimeExpiresIn: realtimeToken ? TOKEN_TTL_S : null,
  };
}

// Identified boot: resolve the contact, then make sure this browser's visitor row belongs to it (§4.2).
async function identifiedVisitor({ anonId, app, contact, userAgent }) {
  let visitor = await upsertVisitor({ anonymousId: anonId, appId: app.id, userAgent });
  if (!visitor || visitor.contact_id === contact.id) return visitor;
  if (await mergeVisitor(visitor.id, contact.id)) return { ...visitor, contact_id: contact.id };
  // Claimed by a different contact: merge_visitor freed the anonymous id, so mint a fresh row and claim it for this contact.
  visitor = await upsertVisitor({ anonymousId: anonId, appId: app.id, userAgent });
  if (visitor && (await mergeVisitor(visitor.id, contact.id))) return { ...visitor, contact_id: contact.id };
  return null;
}

// Anonymous boot never resumes a visitor row a contact has claimed: that history belongs to the signed-in account.
async function anonymousVisitor({ anonId, app, userAgent }) {
  const visitor = await upsertVisitor({ anonymousId: anonId, appId: app.id, userAgent });
  if (!visitor?.contact_id) return visitor;
  if (!(await releaseClaimedVisitor(visitor.id))) return null;
  const fresh = await upsertVisitor({ anonymousId: anonId, appId: app.id, userAgent });
  return fresh && !fresh.contact_id ? fresh : null;
}

// Returns { ok, status, code, body } — the route maps this straight to JSON.
export async function bootSession({ appId, jwt, anonymousId, parentOrigin }, request) {
  if (typeof appId !== "string" || !appId || appId.length > 64) {
    return { ok: false, status: 400, code: BOOT_ERRORS.BAD_REQUEST };
  }
  const anonId = cleanAnonymousId(anonymousId);
  const ip = clientIp(request);
  // Boot is the expensive path (JWT verify + DB): limit per IP, per browser and per app before any of it.
  const allowed = rateLimitAll([
    [`boot:ip:${ip}`, 60, MINUTE],
    [`boot:anon:${appId}:${anonId ?? ip}`, 12, MINUTE],
    [`boot:app:${appId}`, 3000, MINUTE],
  ]);
  if (!allowed) return { ok: false, status: 429, code: BOOT_ERRORS.RATE_LIMITED };

  const app = await getAppByPublicId(appId);
  if (!app) return { ok: false, status: 404, code: BOOT_ERRORS.APP_NOT_FOUND };

  // §10.2: the host page — a direct caller's Origin, or the parent our iframe verified — must be allowlisted exactly.
  const hostOrigin = embedOrigin(request, parentOrigin);
  if (!hostOrigin || !originAllowed(app.allowed_origins, hostOrigin)) {
    return { ok: false, status: 403, code: BOOT_ERRORS.ORIGIN_NOT_ALLOWED };
  }

  const userAgent = request.headers.get("user-agent");
  let contact = null;
  let visitor = null;

  if (typeof jwt === "string" && jwt) {
    let payload = null;
    for (const secret of verificationSecrets(app)) {
      payload = await verifyCustomerJwt(jwt, secret);
      if (payload) break;
    }
    if (!payload) return { ok: false, status: 401, code: BOOT_ERRORS.INVALID_TOKEN };

    contact = await upsertContact({
      externalId: payload.user_id,
      email: typeof payload.email === "string" ? payload.email : null,
      name: typeof payload.name === "string" ? payload.name : null,
      appId: app.id,
      projectId: app.project_id,
    });
    if (!contact) return { ok: false, status: 500, code: "identity_failed" };
    if (anonId) visitor = await identifiedVisitor({ anonId, app, contact, userAgent });
  } else {
    if (!anonId) return { ok: false, status: 400, code: BOOT_ERRORS.BAD_REQUEST };
    visitor = await anonymousVisitor({ anonId, app, userAgent });
    if (!visitor) return { ok: false, status: 500, code: "identity_failed" };
  }

  const principal = {
    sid: randomUUID(),
    appId: app.id,
    contactId: contact?.id ?? null,
    visitorId: visitor?.id ?? null,
    parentOrigin: hostOrigin,
    sessionStartedAt: nowS(),
  };
  const tokens = await mintTokens(principal);
  await stampBoot(app);

  return {
    ok: true,
    body: {
      ...tokens,
      contact: contactVm(contact),
      visitorId: principal.visitorId,
      config: await buildWidgetConfig(app),
    },
  };
}

// Installation status for the workspace's Install section (spec §12); best-effort, a failed write never blocks a boot.
async function stampBoot(app) {
  try {
    const { error } = await serviceClient()
      .from("widget_apps")
      .update({ last_boot_at: new Date().toISOString() })
      .eq("id", app.id);
    if (error) console.error("[widget.stampBoot]", error.message);
  } catch (e) {
    console.error("[widget.stampBoot]", e);
  }
}

// Refresh mints a fresh pair from a still-valid session, re-checking everything boot established (§4.1): the app, its allowlist, the identity.
export async function refreshSession(principal, request) {
  const allowed = rateLimitAll([
    [`refresh:sid:${principal.sid}`, 10, MINUTE],
    [`refresh:ip:${clientIp(request)}`, 120, MINUTE],
  ]);
  if (!allowed) return { ok: false, status: 429, code: "rate_limited" };

  if (!principal.sessionStartedAt || nowS() - principal.sessionStartedAt > MAX_SESSION_AGE_S) {
    return { ok: false, status: 401, code: "session_expired" };
  }
  const app = await getAppById(principal.appId);
  if (!app) return { ok: false, status: 401, code: "invalid_token" };
  if (principal.parentOrigin && !originAllowed(app.allowed_origins, principal.parentOrigin)) {
    return { ok: false, status: 401, code: "invalid_token" };
  }
  if (!(await principalActive(principal))) return { ok: false, status: 401, code: "invalid_token" };

  return { ok: true, body: await mintTokens(principal) };
}
