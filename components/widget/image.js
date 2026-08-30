"use client";

// Client-side re-encode for image attachments (spec §10.7): drawing through a
// canvas and re-encoding strips EXIF (GPS, serials…) before anything leaves
// the browser. Animated GIFs are passed through untouched — canvas would
// flatten them to a single frame, and GIF EXIF is rare.

const REENCODABLE = new Set(["image/png", "image/jpeg", "image/webp"]);

export async function stripMetadata(file) {
  if (!REENCODABLE.has(file.type)) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const max = 2048;
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("encode_failed"))), file.type)
    );
    bitmap.close();
    // The server sniffs magic bytes against the declared type, so keep it.
    return new File([blob], file.name, { type: file.type });
  } catch {
    return file; // a failed re-encode degrades to the original file
  }
}
