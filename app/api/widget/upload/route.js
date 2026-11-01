// POST /api/widget/upload — attachment upload (spec §10.7), multipart field "file".
// Allowlisted types verified by magic bytes, 10 MB cap, metadata stripped server-side, stored as application/octet-stream so a file
// only ever downloads. Returns { url, name, size, contentType }: pass that object back in a message's attachments to send it.

import { errorResponse, jsonResponse } from "@/lib/widget/respond";
import { requirePrincipal } from "@/lib/widget/auth";
import { isWidgetApiConfigured } from "@/lib/widget/service";
import { clientIp, ownerKey, rateLimitAll } from "@/lib/widget/ratelimit";
import { MAX_ATTACHMENT_BYTES, attachmentDir, storeAttachment } from "@/lib/widget/attachments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request) {
  if (!isWidgetApiConfigured()) return errorResponse(503, "not_configured");
  const principal = await requirePrincipal(request);
  if (!principal) return errorResponse(401, "invalid_token");

  const allowed = rateLimitAll([
    [`upload:sid:${principal.sid}`, 10, 60_000],
    [`upload:owner:${ownerKey(principal)}`, 10, 60_000],
    [`upload:ip:${clientIp(request)}`, 30, 60_000],
  ]);
  if (!allowed) return errorResponse(429, "rate_limited");

  const dir = attachmentDir(principal);
  if (!dir) return errorResponse(401, "invalid_token");

  // Refuse oversized bodies before buffering the multipart form.
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_ATTACHMENT_BYTES + 64 * 1024) {
    return errorResponse(413, "too_large");
  }

  let form;
  try {
    form = await request.formData();
  } catch {
    return errorResponse(400, "bad_request");
  }

  const stored = await storeAttachment(form.get("file"), dir);
  if (!stored.attachment) return errorResponse(stored.status, stored.error);
  return jsonResponse(stored.attachment, 201);
}
