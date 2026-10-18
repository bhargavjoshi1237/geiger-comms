import "server-only";
import { serviceClient } from "./service";

// Widget attachments (spec §10.7): the upload route writes them, the send route accepts only what that route produced for this caller.

export const ATTACHMENT_BUCKET = "comms-widget";
export const MAX_ATTACHMENTS = 5;

export const ATTACHMENT_TYPES = {
  png: "image/png",
  jpg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  pdf: "application/pdf",
};

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
