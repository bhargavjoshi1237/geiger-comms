import test from "node:test";
import assert from "node:assert/strict";
import { MAX_QUESTION_LENGTH, cleanQuestion, redactPii } from "./gap_text.js";

test("redactPii replaces emails, URLs, phone numbers and card numbers", () => {
  assert.equal(
    redactPii("Mail ana.b+x@acme.co.uk or see https://acme.dev/reset?u=ana@acme.dev"),
    "Mail [email] or see [url]",
  );
  assert.equal(redactPii("Call +1 (415) 555-0134 today"), "Call [phone] today");
  assert.equal(redactPii("Card 4242 4242 4242 4242 was charged"), "Card [card] was charged");
  assert.equal(redactPii("visit www.acme.dev/help"), "visit [url]");
});

test("redactPii keeps short numbers and ISO dates", () => {
  assert.equal(redactPii("Order 12345 on 2026-10-21 for 3 seats"), "Order 12345 on 2026-10-21 for 3 seats");
});

test("cleanQuestion collapses whitespace and caps the length", () => {
  assert.equal(cleanQuestion("  How do\n\nI   reset? "), "How do I reset?");
  assert.equal(cleanQuestion("x".repeat(900)).length, MAX_QUESTION_LENGTH);
  assert.equal(cleanQuestion(null), "");
});
