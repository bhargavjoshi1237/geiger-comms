// POST /api/widget/upload — attachment upload (spec §10.7).
//
// Allowlisted content types verified against magic bytes and a 10 MB cap; the
// declared mime is never trusted. Files land in the comms-widget bucket
// (20260822051915_widget_upload.sql) stored as application/octet-stream so an
// uploaded file can never execute or inline-render — it only ever downloads.
// Images are re-encoded in the iframe before upload (components/widget/image),
// which strips EXIF; this route never trusts that alone — the octet-stream
// serving policy above is the real boundary.

import { errorResponse, jsonResponse } from "@/lib/widget/respond";
import { requirePrincipal } from "@/lib/widget/auth";
import { serviceClient, isWidgetApiConfigured } from "@/lib/widget/service";
import { rateLimit } from "@/lib/widget/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 10 * 1024 * 1024;
const BUCKET = "comms-widget";

const ALLOWED_TYPES = {
  "image/png": { ext: "png", magic: [0x89, 0x50, 0x4e, 0x47] },
  "image/jpeg": { ext: "jpg", magic: [0xff, 0xd8, 0xff] },
  "image/gif": { ext: "gif", magic: [0x47, 0x49, 0x46, 0x38] }, // "GIF8"
  "image/webp": { ext: "webp", riff: true },
  "application/pdf": { ext: "pdf", ascii: "%PDF-" },
};

function sniffType(bytes, declared) {
  const spec = ALLOWED_TYPES[declared];
  if (!spec) return null;
  if (spec.magic && !spec.magic.every((b, i) => bytes[i] === b)) return null;
  if (spec.riff) {
    const riff = String.fromCharCode(...bytes.slice(0, 4));
    const webp = String.fromCharCode(...bytes.slice(8, 12));
    if (riff !== "RIFF" || webp !== "WEBP") return null;
  }
  if (spec.ascii && !Buffer.from(bytes.subarray(0, 5)).equals(Buffer.from(spec.ascii))) return null;
  return spec;
}

export async function POST(request) {
  if (!isWidgetApiConfigured()) return errorResponse(503, "not_configured");
  const principal = await requirePrincipal(request);
  if (!principal) return errorResponse(401, "invalid_token");

  if (!rateLimit(`upload:${principal.sid}`, 10, 60_000)) {
    return errorResponse(429, "rate_limited");
  }

  let form;
  try {
    form = await request.formData();
  } catch {
    return errorResponse(400, "bad_request");
  }
  const file = form.get("file");
  if (!file || typeof file === "string") return errorResponse(400, "bad_request");
  if (file.size > MAX_BYTES || file.size === 0) return errorResponse(413, "too_large");

  const header = Buffer.from(await file.slice(0, 16).arrayBuffer());
  const spec = sniffType(header, file.type);
  if (!spec) return errorResponse(415, "unsupported_type");

  try {
    const owner = principal.visitorId ?? principal.contactId ?? "anon";
    const path = `${principal.appId}/${owner}/${crypto.randomUUID()}.${spec.ext}`;
    const bytes = Buffer.from(await file.arrayBuffer());
    // octet-stream on purpose — downloads only, never inline-rendered.
    const uploaded = await serviceClient()
      .storage.from(BUCKET)
      .upload(path, bytes, { contentType: "application/octet-stream", cacheControl: "3600" });
    if (uploaded.error) {
      console.error("[widget.upload]", uploaded.error.message);
      return errorResponse(500, "write_failed");
    }
    const url = serviceClient().storage.from(BUCKET).getPublicUrl(path).data?.publicUrl;
    if (!url) return errorResponse(500, "sign_failed");
    return jsonResponse({ url, size: bytes.length }, 201);
  } catch (e) {
    console.error("[widget.upload]", e);
    return errorResponse(500, "write_failed");
  }
}
