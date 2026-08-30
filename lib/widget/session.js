// Boot and refresh orchestration (spec §4). The customer's JWT is verified
// exactly once here; afterwards only our own 15-minute session token speaks.

import { randomUUID } from "node:crypto";
import { originAllowed } from "./origins";
import { rateLimit } from "./ratelimit";
import {
  signRealtimeToken,
  signSessionToken,
  verifyCustomerJwt,
} from "./jwt";
import { verificationSecrets } from "./secrets";
import { getAppByPublicId, buildWidgetConfig } from "./apps";
import { serviceClient } from "./service";
import { mergeVisitor, upsertContact, upsertVisitor } from "./data";
import { contactVm } from "./viewmodels";

const SESSION_TTL_S = 15 * 60;

export const BOOT_ERRORS = {
  APP_NOT_FOUND: "app_not_found", // 404 — never confirm an app id exists
  ORIGIN_NOT_ALLOWED: "origin_not_allowed", // 403
  RATE_LIMITED: "rate_limited", // 429
  INVALID_TOKEN: "invalid_token", // 401
  BAD_REQUEST: "bad_request", // 400
};

function cleanAnonymousId(value) {
  return typeof value === "string" && value.length >= 8 && value.length <= 128 ? value : null;
}

async function mintTokens(principal) {
  const sid = randomUUID();
  const sessionToken = await signSessionToken({
    sid,
    appId: principal.appId,
    contactId: principal.contactId ?? null,
    visitorId: principal.visitorId ?? null,
    scope: "widget",
  });
  const realtimeToken = await signRealtimeToken({
    visitorId: principal.visitorId,
    contactId: principal.contactId,
    appId: principal.appId,
  });
  return { sessionToken, realtimeToken, sid };
}

// Returns { ok, status, code, body } — the route maps this straight to JSON.
export async function bootSession({ appId, jwt, anonymousId }, { origin, userAgent }) {
  if (typeof appId !== "string" || !appId) {
    return { ok: false, status: 400, code: BOOT_ERRORS.BAD_REQUEST };
  }
  // Boot is the expensive path (JWT verify + DB) — rate limit before any of it.
  if (!rateLimit(`boot:${appId}`, 30, 60_000)) {
    return { ok: false, status: 429, code: BOOT_ERRORS.RATE_LIMITED };
  }

  const app = await getAppByPublicId(appId);
  if (!app) return { ok: false, status: 404, code: BOOT_ERRORS.APP_NOT_FOUND };

  // Exact-match allowlist on every call; no wildcard or suffix matching.
  if (!originAllowed(app.allowed_origins, origin)) {
    return { ok: false, status: 403, code: BOOT_ERRORS.ORIGIN_NOT_ALLOWED };
  }

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

    // Anonymous history merges onto the signed-in account one-way; a browser
    // already claimed by a different contact starts fresh instead (§4.2).
    const anonId = cleanAnonymousId(anonymousId);
    if (anonId) {
      visitor = await upsertVisitor({ anonymousId: anonId, appId: app.id, userAgent });
      if (visitor && visitor.contact_id !== contact.id) {
        const merged = await mergeVisitor(visitor.id, contact.id);
        if (!merged) {
          visitor = await upsertVisitor({ anonymousId: anonId, appId: app.id, userAgent });
        }
      }
    }
  } else {
    const anonId = cleanAnonymousId(anonymousId);
    if (!anonId) return { ok: false, status: 400, code: BOOT_ERRORS.BAD_REQUEST };
    visitor = await upsertVisitor({ anonymousId: anonId, appId: app.id, userAgent });
    if (!visitor) return { ok: false, status: 500, code: "identity_failed" };
  }

  const principal = { appId: app.id, contactId: contact?.id ?? null, visitorId: visitor?.id ?? null };
  const tokens = await mintTokens(principal);
  await stampBoot(app);

  return {
    ok: true,
    body: {
      sessionToken: tokens.sessionToken,
      realtimeToken: tokens.realtimeToken, // null when SUPABASE_JWT_SECRET unset
      expiresIn: SESSION_TTL_S,
      contact: contactVm(contact),
      visitorId: principal.visitorId,
      config: await buildWidgetConfig(app),
    },
  };
}

// Installation status for the workspace's Install section (spec §12): whether
// a boot has ever been seen, and last seen at. Best-effort — a failed write
// never blocks a boot.
async function stampBoot(app) {
  const meta = app.metadata && typeof app.metadata === "object" ? app.metadata : {};
  try {
    const { error } = await serviceClient()
      .from("widget_apps")
      .update({ metadata: { ...meta, last_boot_at: new Date().toISOString() } })
      .eq("id", app.id);
    if (error) console.error("[widget.stampBoot]", error.message);
  } catch (e) {
    console.error("[widget.stampBoot]", e);
  }
}

// Refresh mints a fresh token pair from a still-valid session (§4.1).
export async function refreshSession(claims) {
  if (!rateLimit(`refresh:${claims.sid}`, 10, 60_000)) {
    return { ok: false, status: 429, code: "rate_limited" };
  }
  const tokens = await mintTokens({
    appId: claims.appId,
    contactId: claims.contactId,
    visitorId: claims.visitorId,
  });
  return {
    ok: true,
    body: { sessionToken: tokens.sessionToken, realtimeToken: tokens.realtimeToken, expiresIn: SESSION_TTL_S },
  };
}
