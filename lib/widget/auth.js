import "server-only";
import { verifySessionToken } from "./jwt";
import { fromOwnPage, normalizeOrigin } from "./origins";

// Bearer-session extraction shared by every authenticated widget route; ownership always derives from this token, never from request parameters.
// §10.2 on every call: a browser Origin must be our own (the iframe) or the host origin the session was booted for.
export async function requirePrincipal(request) {
  const header = request.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : null;
  if (!token) return null;
  const claims = await verifySessionToken(token);
  if (!claims) return null;

  const rawOrigin = request.headers.get("origin");
  if (rawOrigin) {
    const origin = normalizeOrigin(rawOrigin);
    if (!origin || (!fromOwnPage(request) && origin !== claims.po)) return null;
  }

  return {
    sid: claims.sid,
    appId: claims.appId,
    contactId: claims.contactId || null,
    visitorId: claims.visitorId || null,
    parentOrigin: typeof claims.po === "string" ? claims.po : null,
    sessionStartedAt: typeof claims.sat === "number" ? claims.sat : null,
  };
}
