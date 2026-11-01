import test from "node:test";
import assert from "node:assert/strict";
import { articleLexer } from "./lexer.js";
import { markdownToBlocks } from "../ai/markdown_blocks.js";

const BODY = [
  "# Reset your password",
  "Open **Settings** and pick [Security](https://acme.dev/security).",
  "",
  "1. Click *Reset*",
  "2. Check your email",
  "",
  "> Links expire after 1 hour",
  "",
  "```sh",
  "acme reset --user me",
  "```",
  "",
  "---",
  "",
  "![Screen](https://cdn.acme.dev/reset.png)",
].join("\n");

test("articleLexer emits marked-shaped tokens with raw markdown", () => {
  assert.deepEqual(articleLexer(BODY), [
    { type: "heading", depth: 2, text: "Reset your password", raw: "## Reset your password" },
    {
      type: "paragraph",
      raw: "Open **Settings** and pick [Security](https://acme.dev/security).",
      text: "Open **Settings** and pick [Security](https://acme.dev/security).",
    },
    { type: "list", raw: "1. Click *Reset*\n2. Check your email", text: "1. Click *Reset*\n2. Check your email" },
    { type: "blockquote", raw: "> Links expire after 1 hour", text: "Links expire after 1 hour" },
    { type: "code", lang: "sh", text: "acme reset --user me", raw: "```sh\nacme reset --user me\n```" },
    { type: "hr", raw: "---" },
    {
      type: "paragraph",
      raw: "![Screen](https://cdn.acme.dev/reset.png)",
      text: "![Screen](https://cdn.acme.dev/reset.png)",
    },
  ]);
});

test("unsafe links reach the tokens as plain text", () => {
  assert.deepEqual(articleLexer("[x](javascript:alert(1))"), [
    { type: "paragraph", raw: "[x](javascript:alert(1))", text: "[x](javascript:alert(1))" },
  ]);
});

test("markdownToBlocks chunks article bodies through articleLexer", () => {
  const blocks = markdownToBlocks(BODY, { lexer: articleLexer });
  assert.deepEqual(
    blocks.map((b) => b.type),
    ["heading", "paragraph", "list", "blockquote", "code", "paragraph"],
  );
  assert.equal(blocks[0].text, "Reset your password");
  assert.equal(blocks[0].depth, 2);
});
