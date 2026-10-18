// POST /api/widget/upload — attachment upload (spec §10.7), multipart field "file".
// Allowlisted types verified by magic bytes, 10 MB cap, metadata stripped server-side, stored as application/octet-stream so a file
// only ever downloads. Returns { url, name, size, contentType }: pass that object back in a message's attachments to send it.

import { errorResponse, jsonResponse } from "@/lib/widget/respond";
import { requirePrincipal } from "@/lib/widget/auth";
import { serviceClient, isWidgetApiConfigured } from "@/lib/widget/service";
import { clientIp, ownerKey, rateLimitAll } from "@/lib/widget/ratelimit";
import { ATTACHMENT_BUCKET, ATTACHMENT_TYPES, attachmentDir, cleanFileName, publicUrlFor } from "@/lib/widget/attachments";
import { stripImageMetadata } from "@/lib/widget/strip_metadata";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 10 * 1024 * 1024;

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
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BYTES + 64 * 1024) return errorResponse(413, "too_large");

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

  // EXIF/XMP/IPTC never reach storage; a file the stripper cannot parse is refused, not stored as-is.
  const bytes = stripImageMetadata(Buffer.from(await file.arrayBuffer()), spec.ext);
  if (!bytes) return errorResponse(415, "unsupported_type");

  try {
    const path = `${dir}/${crypto.randomUUID()}.${spec.ext}`;
    // octet-stream on purpose — downloads only, never inline-rendered.
    const uploaded = await serviceClient()
      .storage.from(ATTACHMENT_BUCKET)
      .upload(path, bytes, { contentType: "application/octet-stream", cacheControl: "3600" });
    if (uploaded.error) {
      console.error("[widget.upload]", uploaded.error.message);
      return errorResponse(500, "write_failed");
    }
    const url = publicUrlFor(path);
    if (!url) return errorResponse(500, "sign_failed");
    return jsonResponse(
      { url, name: cleanFileName(file.name, spec.ext), size: bytes.length, contentType: ATTACHMENT_TYPES[spec.ext] },
      201,
    );
  } catch (e) {
    console.error("[widget.upload]", e);
    return errorResponse(500, "write_failed");
  }
}
