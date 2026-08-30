// Bearer-session extraction shared by every authenticated widget route.
// Ownership always derives from this token — never from request parameters.

import { verifySessionToken } from "./jwt";

export async function requirePrincipal(request) {
  const header = request.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : null;
  if (!token) return null;
  const claims = await verifySessionToken(token);
  if (!claims) return null;
  return {
    sid: claims.sid,
    appId: claims.appId,
    contactId: claims.contactId || null,
    visitorId: claims.visitorId || null,
  };
}
