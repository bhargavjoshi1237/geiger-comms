// URL slug for an article or collection, derived from its title (Intercom's rule: not user-editable).

const MAX_LENGTH = 80;

export function slugify(title) {
  // Latin accents fold away; other combining marks (Japanese voicing, Indic vowel signs) recompose with NFC.
  const slug = String(title ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .normalize("NFC")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  return slug.slice(0, MAX_LENGTH).replace(/-+$/, "");
}
