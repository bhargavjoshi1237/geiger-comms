import { test } from "node:test";
import assert from "node:assert/strict";
import { customerLanguage, detectLanguage, languageCode } from "./language.js";

test("language codes come from locales and from language names", () => {
  assert.equal(languageCode("en-US"), "en");
  assert.equal(languageCode("pt_BR"), "pt");
  assert.equal(languageCode("FR"), "fr");
  assert.equal(languageCode("French"), "fr");
  assert.equal(languageCode("  deutsch "), "de");
  assert.equal(languageCode("Français (Canada)"), "fr");
  assert.equal(languageCode("日本語"), "ja");
  assert.equal(languageCode("iw"), "he");
  assert.equal(languageCode("zz"), null);
  assert.equal(languageCode("Klingon"), null);
  assert.equal(languageCode(""), null);
  assert.equal(languageCode(undefined), null);
  assert.equal(languageCode(42), null);
});

test("detection reads the common Latin-script languages from a sentence", () => {
  const samples = {
    en: "I cannot log in to my account, please help",
    es: "Hola, no puedo entrar a mi cuenta, ¿me pueden ayudar?",
    fr: "Bonjour, je n’arrive pas à me connecter à mon compte",
    de: "Hallo, ich kann mich nicht in mein Konto einloggen",
    pt: "Olá, não consigo entrar na minha conta, podem me ajudar?",
    it: "Ciao, non riesco ad accedere al mio account",
    nl: "Hallo, ik kan niet inloggen op mijn account",
    sv: "Hej, jag kan inte logga in på mitt konto",
    pl: "Dzień dobry, nie mogę się zalogować do konta",
    tr: "Merhaba, hesabıma giriş yapamıyorum, lütfen yardım edin",
    id: "Halo, saya tidak bisa masuk ke akun saya",
  };
  for (const [code, text] of Object.entries(samples)) assert.equal(detectLanguage(text), code, text);
});

test("detection reads other scripts, including their neighbours", () => {
  assert.equal(detectLanguage("アカウントにログインできません"), "ja");
  assert.equal(detectLanguage("ログインの問題があります"), "ja");
  assert.equal(detectLanguage("我无法登录我的账户"), "zh");
  assert.equal(detectLanguage("계정에 로그인할 수 없습니다"), "ko");
  assert.equal(detectLanguage("Не могу войти в аккаунт"), "ru");
  assert.equal(detectLanguage("Не можу увійти в обліковий запис"), "uk");
  assert.equal(detectLanguage("لا أستطيع تسجيل الدخول"), "ar");
  assert.equal(detectLanguage("نمی‌توانم وارد حساب کاربری‌ام شوم"), "fa");
  assert.equal(detectLanguage("Δεν μπορώ να συνδεθώ"), "el");
});

test("detection says nothing when it can't be sure", () => {
  assert.equal(detectLanguage(""), null);
  assert.equal(detectLanguage(null), null);
  assert.equal(detectLanguage("ok"), null);
  assert.equal(detectLanguage("Gracias"), null);
  assert.equal(detectLanguage("ok thanks https://example.com/the/and/is"), null);
  assert.equal(detectLanguage("Order 4411 / SKU-22 / 2026-10-21"), null);
});

test("the customer's language prefers their profile, then their recent messages", () => {
  assert.deepEqual(customerLanguage({ contactLanguage: "German", customerMessages: ["I cannot log in to my account"] }), { code: "de", source: "contact" });
  assert.deepEqual(customerLanguage({ contactLanguage: "", customerMessages: ["ok", "Hola, necesito ayuda con mi cuenta"] }), { code: "es", source: "messages" });
  assert.deepEqual(customerLanguage({ contactLanguage: "Elvish", customerMessages: ["Bonjour, je ne peux pas me connecter à mon compte"] }), { code: "fr", source: "messages" });
  assert.equal(customerLanguage({ customerMessages: ["ok", "thx"] }), null);
  assert.equal(customerLanguage(), null);
});
