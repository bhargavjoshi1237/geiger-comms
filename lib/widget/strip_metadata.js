import "server-only";

// Server-side metadata stripping for uploaded images (spec §10.7): EXIF/XMP/IPTC/comments go, pixels stay byte-identical.
// Returns the stripped Buffer, or null when the file cannot be parsed (the upload is then refused rather than stored un-stripped).

function hasAscii(buf, offset, text) {
  return buf.length >= offset + text.length && buf.toString("latin1", offset, offset + text.length) === text;
}

// JPEG: keep APP0 (JFIF), APP2 ICC profile and APP14 Adobe; drop every other APPn (EXIF, XMP, IPTC, MPF) and COM.
function isJpegMetadata(buf, i, marker) {
  if (marker === 0xfe) return true;
  if (marker < 0xe1 || marker > 0xef) return false;
  if (marker === 0xe2 && hasAscii(buf, i + 4, "ICC_PROFILE\0")) return false;
  if (marker === 0xee && hasAscii(buf, i + 4, "Adobe")) return false;
  return true;
}

function isRestartMarker(byte) {
  return byte >= 0xd0 && byte <= 0xd7;
}

function stripJpeg(buf) {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  const out = [buf.subarray(0, 2)];
  let i = 2;
  while (i + 1 < buf.length) {
    if (buf[i] !== 0xff) return null;
    const marker = buf[i + 1];
    if (marker === 0xff) {
      i += 1;
      continue;
    }
    // EOI ends the image; anything appended after it (MPO secondaries, trailers) is dropped.
    if (marker === 0xd9) {
      out.push(buf.subarray(i, i + 2));
      return Buffer.concat(out);
    }
    if (isRestartMarker(marker) || marker === 0x01) {
      out.push(buf.subarray(i, i + 2));
      i += 2;
      continue;
    }
    if (i + 4 > buf.length) return null;
    const end = i + 2 + buf.readUInt16BE(i + 2);
    if (end < i + 4 || end > buf.length) return null;
    if (!isJpegMetadata(buf, i, marker)) out.push(buf.subarray(i, end));
    i = end;
    if (marker === 0xda) {
      // Entropy-coded scan data runs until a marker that is neither byte stuffing (FF00) nor a restart marker.
      let j = i;
      while (j + 1 < buf.length && !(buf[j] === 0xff && buf[j + 1] !== 0x00 && !isRestartMarker(buf[j + 1]))) j += 1;
      if (j + 1 >= buf.length) return null;
      out.push(buf.subarray(i, j));
      i = j;
    }
  }
  return null;
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const PNG_METADATA_CHUNKS = new Set(["eXIf", "tEXt", "zTXt", "iTXt", "tIME"]);

// PNG: drop the textual/EXIF/time ancillary chunks; every other chunk keeps its own CRC untouched.
function stripPng(buf) {
  if (buf.length < 8 || !PNG_SIGNATURE.every((b, k) => buf[k] === b)) return null;
  const out = [buf.subarray(0, 8)];
  let i = 8;
  while (i + 12 <= buf.length) {
    const length = buf.readUInt32BE(i);
    const type = buf.toString("latin1", i + 4, i + 8);
    const end = i + 12 + length;
    if (end > buf.length) return null;
    if (!PNG_METADATA_CHUNKS.has(type)) out.push(buf.subarray(i, end));
    i = end;
    if (type === "IEND") return Buffer.concat(out);
  }
  return null;
}

// WebP: drop the EXIF and XMP chunks, clear their VP8X flag bits and rewrite the RIFF size.
function stripWebp(buf) {
  if (!hasAscii(buf, 0, "RIFF") || !hasAscii(buf, 8, "WEBP")) return null;
  const riffEnd = Math.min(buf.length, 8 + buf.readUInt32LE(4));
  const chunks = [];
  let i = 12;
  while (i + 8 <= riffEnd) {
    const type = buf.toString("latin1", i, i + 4);
    const size = buf.readUInt32LE(i + 4);
    if (i + 8 + size > riffEnd) return null;
    const end = Math.min(riffEnd, i + 8 + size + (size & 1));
    if (type !== "EXIF" && type !== "XMP ") chunks.push(Buffer.from(buf.subarray(i, end)));
    i = end;
  }
  if (!chunks.length) return null;
  const vp8x = chunks.find((c) => hasAscii(c, 0, "VP8X"));
  if (vp8x && vp8x.length >= 9) vp8x[8] &= ~0x0c;
  const body = Buffer.concat(chunks);
  const header = Buffer.alloc(12);
  header.write("RIFF", 0, "latin1");
  header.writeUInt32LE(4 + body.length, 4);
  header.write("WEBP", 8, "latin1");
  return Buffer.concat([header, body]);
}

// GIF and PDF carry no EXIF block and pass through unchanged; they are still served download-only.
export function stripImageMetadata(bytes, ext) {
  try {
    if (ext === "jpg") return stripJpeg(bytes);
    if (ext === "png") return stripPng(bytes);
    if (ext === "webp") return stripWebp(bytes);
    return bytes;
  } catch {
    return null;
  }
}
