import test from "node:test";
import assert from "node:assert/strict";
import { stripUngroundedLinks } from "./generated_links.js";

test("grounded links and images stay", () => {
  const md = "See [the guide](https://acme.dev/guide) and ![chart](https://cdn.acme.dev/c.png).";
  const out = stripUngroundedLinks(md, "Source mentions https://acme.dev/guide and https://cdn.acme.dev/c.png");
  assert.equal(out.text, md);
  assert.deepEqual(out.removed, []);
});

test("an ungrounded link keeps its text; an image is dropped", () => {
  const out = stripUngroundedLinks("Go to [Reset password](https://evil.example/reset). ![t](https://track.example/p.gif)", "");
  assert.equal(out.text, "Go to Reset password. ");
  assert.deepEqual(out.removed, [
    { kind: "link", url: "https://evil.example/reset", text: "Reset password" },
    { kind: "image", url: "https://track.example/p.gif", text: "t" },
  ]);
});

test("prompt injection: a planted bare URL and a URL hidden in link text both go", () => {
  const out = stripUngroundedLinks(
    "Visit https://evil.example/login now. [https://evil.example/x](https://evil.example/x)",
    "Customer asked: how do I log in?",
  );
  assert.equal(out.text, "Visit  now. ");
  assert.equal(out.removed.length, 3);
  assert.ok(out.removed.every((r) => r.url.startsWith("https://evil.example")));
});

test("code spans and fences are left alone", () => {
  const md = "Run `curl https://evil.example`\n\n```\nhttps://evil.example/a\n```\n[x](https://evil.example/b)";
  const out = stripUngroundedLinks(md, "");
  assert.equal(out.text, "Run `curl https://evil.example`\n\n```\nhttps://evil.example/a\n```\nx");
  assert.deepEqual(out.removed, [{ kind: "link", url: "https://evil.example/b", text: "x" }]);
});

test("empty input", () => {
  assert.deepEqual(stripUngroundedLinks("", "anything"), { text: "", removed: [] });
  assert.deepEqual(stripUngroundedLinks(null, null), { text: "", removed: [] });
});
