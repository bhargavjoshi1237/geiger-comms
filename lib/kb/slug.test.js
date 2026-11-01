import test from "node:test";
import assert from "node:assert/strict";
import { slugify } from "./slug.js";

test("slugify: lowercases, joins words and trims separators", () => {
  assert.equal(slugify("  Reset your Password! "), "reset-your-password");
  assert.equal(slugify("Refunds & billing changes"), "refunds-and-billing-changes");
  assert.equal(slugify("Enable SSO (SAML/OIDC)"), "enable-sso-saml-oidc");
});

test("slugify: folds accents and keeps other scripts", () => {
  assert.equal(slugify("Café déjà vu"), "cafe-deja-vu");
  assert.equal(slugify("Über uns"), "uber-uns");
  assert.equal(slugify("ログイン方法"), "ログイン方法");
});

test("slugify: empty input and length cap", () => {
  assert.equal(slugify(""), "");
  assert.equal(slugify(null), "");
  assert.equal(slugify("---"), "");
  const long = slugify("word ".repeat(40));
  assert.ok(long.length <= 80);
  assert.ok(!long.endsWith("-"));
});
