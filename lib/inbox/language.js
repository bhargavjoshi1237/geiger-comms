// Language helpers for the inbox copilot (pure): a contact's language field ("fr-CA", "French", "Français") as an
// ISO 639 code, and a conservative guess at the language a text is written in — by script, then by common words for
// the Latin-script languages it knows. A guess it isn't sure of is null, never a coin flip.

const CODE_RE = /^([a-z]{2,3})(?:[-_][a-z0-9]{2,8})*$/i;
const DEPRECATED = { iw: "he", in: "id", ji: "yi" };
const NAMED = ["en", "es", "fr", "de", "pt", "it", "nl", "sv", "da", "no", "nb", "fi", "pl", "cs", "sk", "ro", "hu", "tr", "el", "ru", "uk", "bg", "sr", "hr", "ar", "he", "fa", "hi", "bn", "ur", "th", "vi", "id", "ms", "tl", "ja", "zh", "ko"];
const ALIASES = { mandarin: "zh", farsi: "fa" };

const known = new Intl.DisplayNames(["en"], { type: "language", fallback: "none" });
let names = null;

// English names and endonyms ("german", "deutsch") -> code, built on first use.
function nameTable() {
  if (names) return names;
  names = new Map(Object.entries(ALIASES));
  for (const code of NAMED) {
    names.set(known.of(code).toLowerCase(), code);
    names.set(new Intl.DisplayNames([code], { type: "language" }).of(code).toLowerCase(), code);
  }
  return names;
}

// "fr-CA" | "pt_BR" | "French" | "Français (Canada)" -> "fr"; anything unrecognised -> null.
export function languageCode(value) {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text || text.length > 64) return null;
  const match = CODE_RE.exec(text);
  if (match) {
    const primary = match[1].toLowerCase();
    const code = DEPRECATED[primary] || primary;
    return known.of(code) ? code : null;
  }
  const name = text.replace(/\(.*\)/, "").trim().toLowerCase();
  return nameTable().get(name) ?? null;
}

// A script that outweighs Latin letters decides on its own, through its default language.
const SCRIPTS = [
  ["ja", /[\p{Script=Hiragana}\p{Script=Katakana}]/gu],
  ["ko", /\p{Script=Hangul}/gu],
  ["zh", /\p{Script=Han}/gu],
  ["ru", /\p{Script=Cyrillic}/gu],
  ["ar", /\p{Script=Arabic}/gu],
  ["he", /\p{Script=Hebrew}/gu],
  ["hi", /\p{Script=Devanagari}/gu],
  ["th", /\p{Script=Thai}/gu],
  ["el", /\p{Script=Greek}/gu],
];
// Letters that move a script's default to a neighbour: kana beside Han is Japanese, and so on.
const VARIANTS = {
  zh: [["ja", /[\p{Script=Hiragana}\p{Script=Katakana}]/u]],
  ru: [["uk", /[іїєґ]/iu], ["sr", /[ђјљњћџ]/iu]],
  ar: [["ur", /[ٹڈڑںے]/u], ["fa", /[پچژگیک]/u]],
};
const LATIN_RE = /\p{Script=Latin}/gu;

// Frequent, fairly distinctive words per language; overlaps are fine because only a clear lead counts.
const WORDS = {
  en: "the and is are you your i my it to of for with have this that not can please thanks thank what how do does was be would will me we hi hello there",
  es: "el los las que es y por para con una un mi tu gracias hola cómo qué está estoy pero muy sí puedo necesito ayuda cuenta también porque tengo",
  fr: "le les des est et je vous une pas pour avec qui dans mon ma merci bonjour sur ce il elle nous mais très oui ne au du suis",
  de: "der die das und ist ich nicht sie ein eine mit für auf wir zu den dem mein meine bitte danke hallo aber auch wie kann haben habe noch",
  pt: "o os as que é não um uma com para por eu você obrigado obrigada olá meu minha mas está estou também muito sim como do da em na",
  it: "il lo gli che è non un una per con sono mi ti grazie ciao buongiorno ma anche molto sì come del della nel questo ho mio vorrei",
  nl: "de het een en is ik niet je jij u van met voor op dat die wat maar ook bedankt dank hallo mijn kan hebben heb zijn wij er",
  sv: "och att det är jag inte en ett med för på som vi du har kan tack hej min mitt men också mycket hur vad",
  pl: "i w nie na się jest to że z do mam jak ale czy dziękuję dzień dobry proszę mój moje bardzo też tak co",
  tr: "ve bir bu için ile değil ben sen var yok mi mı çok teşekkürler teşekkür merhaba ama nasıl ne lütfen",
  id: "dan yang di ini itu tidak saya anda dengan untuk ada bisa terima kasih halo tapi juga sangat apa bagaimana sudah belum mohon",
};
const WORD_SETS = Object.fromEntries(Object.entries(WORDS).map(([code, list]) => [code, new Set(list.split(" "))]));
// Letters only one of the languages above uses.
const MARKS = { es: /[ñ¿¡]/u, pt: /[ãõ]/u, de: /ß/u, pl: /[łąęśźżń]/u, tr: /[ğşı]/u };

const count = (text, re) => text.match(re)?.length ?? 0;

// -> an ISO 639-1 code, or null when the text is too short or too mixed to tell.
export function detectLanguage(text) {
  const clean = String(text ?? "")
    .slice(0, 4000)
    .replace(/https?:\/\/\S+|\S+@\S+|\{\{[^}]*\}\}/g, " ")
    .toLowerCase();
  const latin = count(clean, LATIN_RE);
  let best = null;
  for (const [code, re] of SCRIPTS) {
    const n = count(clean, re);
    if (n > (best?.n ?? 0)) best = { code, n };
  }
  if (best && best.n >= 2 && best.n >= latin) {
    const variant = VARIANTS[best.code]?.find(([, re]) => re.test(clean));
    return variant ? variant[0] : best.code;
  }

  const words = clean.match(/\p{L}+/gu) ?? [];
  if (words.length < 3) return null;
  const scores = Object.entries(WORD_SETS)
    .map(([code, set]) => [code, words.filter((w) => set.has(w)).length + (MARKS[code]?.test(clean) ? 2 : 0)])
    .sort((a, b) => b[1] - a[1]);
  const [[code, top], [, next]] = scores;
  return top >= 2 && top > next * 1.5 ? code : null;
}

// The language to write to a customer in: the contact's own language field, else what their recent messages are in.
// -> { code, source: "contact" | "messages" } | null
export function customerLanguage({ contactLanguage, customerMessages = [] } = {}) {
  const stated = languageCode(contactLanguage);
  if (stated) return { code: stated, source: "contact" };
  const recent = customerMessages
    .map((body) => String(body ?? "").trim())
    .filter(Boolean)
    .slice(-5)
    .join("\n");
  const detected = detectLanguage(recent);
  return detected ? { code: detected, source: "messages" } : null;
}
