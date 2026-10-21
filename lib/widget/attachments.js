import "server-only";
import { serviceClient } from "./service";
import { stripImageMetadata } from "./strip_metadata";

// Message attachments (spec §10.7): the Messenger and inbox upload routes write them through storeAttachment; the widget
// send route accepts only what its upload route produced for this caller.

export const ATTACHMENT_BUCKET = "comms-widget";
export const MAX_ATTACHMENTS = 5;
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

export const ATTACHMENT_TYPES = {
  png: "image/png",
  jpg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  pdf: "application/pdf",
};

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

// Allowlisted type verified by magic bytes, size cap, metadata stripped, stored as application/octet-stream under `dir`
// so a file only ever downloads. Returns { attachment: { url, name, size, contentType } } or { status, error }.
export async function storeAttachment(file, dir) {
  if (!file || typeof file === "string") return { status: 400, error: "bad_request" };
  if (file.size > MAX_ATTACHMENT_BYTES || file.size === 0) return { status: 413, error: "too_large" };

  const header = Buffer.from(await file.slice(0, 16).arrayBuffer());
  const spec = sniffType(header, file.type);
  if (!spec) return { status: 415, error: "unsupported_type" };

  // EXIF/XMP/IPTC never reach storage; a file the stripper cannot parse is refused, not stored as-is.
  const bytes = stripImageMetadata(Buffer.from(await file.arrayBuffer()), spec.ext);
  if (!bytes) return { status: 415, error: "unsupported_type" };

  try {
    const path = `${dir}/${crypto.randomUUID()}.${spec.ext}`;
    const uploaded = await serviceClient()
      .storage.from(ATTACHMENT_BUCKET)
      .upload(path, bytes, { contentType: "application/octet-stream", cacheControl: "3600" });
    if (uploaded.error) {
      console.error("[attachments.store]", uploaded.error.message);
      return { status: 500, error: "write_failed" };
    }
    const url = publicUrlFor(path);
    if (!url) return { status: 500, error: "sign_failed" };
    return {
      attachment: { url, name: cleanFileName(file.name, spec.ext), size: bytes.length, contentType: ATTACHMENT_TYPES[spec.ext] },
    };
  } catch (e) {
    console.error("[attachments.store]", e);
    return { status: 500, error: "write_failed" };
  }
}

const FILE_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|gif|webp|pdf)$/;

// One folder per app + person (contact when identified, so a re-boot keeps the same folder).
export function attachmentDir(principal) {
  const owner = principal?.contactId ?? principal?.visitorId;
  return principal?.appId && owner ? `${principal.appId}/${owner}` : null;
}

export function publicUrlFor(path) {
  return serviceClient().storage.from(ATTACHMENT_BUCKET).getPublicUrl(path).data?.publicUrl ?? null;
}

export function cleanFileName(name, ext) {
  const cleaned = typeof name === "string"
    ? name.replace(/[\u0000-\u001f\u007f<>"\\/]/g, "").replace(/\s+/g, " ").trim().slice(0, 120)
    : "";
  return cleaned || `attachment.${ext}`;
}

// Returns the server-built attachment list, or null when any entry is not a file this caller uploaded.
export async function validateAttachments(principal, input) {
  if (input === undefined || input === null) return [];
  if (!Array.isArray(input) || input.length > MAX_ATTACHMENTS) return null;
  if (!input.length) return [];
  const dir = attachmentDir(principal);
  const prefix = dir ? publicUrlFor(`${dir}/`) : null;
  if (!prefix) return null;

  const wanted = [];
  for (const item of input) {
    const url = typeof item === "string" ? item : item && typeof item === "object" ? item.url : null;
    if (typeof url !== "string" || !url.startsWith(prefix)) return null;
    const file = url.slice(prefix.length);
    const match = FILE_RE.exec(file);
    if (!match) return null;
    wanted.push({ file, ext: match[1], url, name: item && typeof item === "object" ? item.name : null });
  }

  try {
    const bucket = serviceClient().storage.from(ATTACHMENT_BUCKET);
    const found = await Promise.all(
      wanted.map(async (w) => {
        const { data, error } = await bucket.list(dir, { search: w.file, limit: 2 });
        if (error) {
          console.error("[widget.attachments]", error.message);
          return null;
        }
        return (data ?? []).find((entry) => entry.name === w.file) ?? null;
      }),
    );
    const out = [];
    for (const [index, w] of wanted.entries()) {
      const entry = found[index];
      if (!entry) return null;
      const size = Number(entry.metadata?.size);
      out.push({
        url: w.url,
        name: cleanFileName(w.name, w.ext),
        size: Number.isFinite(size) ? size : null,
        contentType: ATTACHMENT_TYPES[w.ext],
      });
    }
    return out;
  } catch (e) {
    console.error("[widget.attachments]", e);
    return null;
  }
}
