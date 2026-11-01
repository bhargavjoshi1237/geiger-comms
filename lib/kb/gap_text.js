// Customer questions before they are stored or sent to a model (KB spec §11.1): emails, phone numbers, card-like
// digit runs and URLs become tokens, whitespace collapses, and the text is cut to 500 characters.

export const MAX_QUESTION_LENGTH = 500;

const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>]+/gi;
const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
const CARD_RE = /\b(?:\d[ -]?){12,18}\d\b/g;
const PHONE_RE = /(?:\+?\d[\d ().-]{5,}\d)/g;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function redactPhone(match) {
  const digits = match.replace(/\D/g, "").length;
  if (ISO_DATE_RE.test(match) || digits < 7 || digits > 15) return match;
  return "[phone]";
}

export function redactPii(text) {
  return String(text ?? "")
    .replace(URL_RE, "[url]")
    .replace(EMAIL_RE, "[email]")
    .replace(CARD_RE, "[card]")
    .replace(PHONE_RE, redactPhone);
}

export function cleanQuestion(text) {
  return redactPii(text).replace(/\s+/g, " ").trim().slice(0, MAX_QUESTION_LENGTH);
}
