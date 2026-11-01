import { test } from "node:test";
import assert from "node:assert/strict";
import { escapeHtml, inviteEmail, replyEmail, replySubject, testEmail } from "./templates.js";
import { channelSender } from "./channel.js";

test("escapeHtml neutralises markup and attribute breakouts", () => {
  assert.equal(escapeHtml(`<a href="x">'&'</a>`), "&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;");
  assert.equal(escapeHtml(null), "");
});

test("replySubject prefixes Re: once and never carries a line break", () => {
  assert.equal(replySubject("Refund for order 1042"), "Re: Refund for order 1042");
  assert.equal(replySubject("RE: Refund"), "RE: Refund");
  assert.equal(replySubject("Line one\r\nBcc: x@y.z"), "Re: Line one Bcc: x@y.z");
  assert.equal(replySubject("  "), "Re: Your conversation");
});

test("replyEmail escapes the body, keeps paragraphs and links only web attachments", () => {
  const html = replyEmail({
    body: "Hi <b>Sam</b>,\n\nSecond paragraph\nsame paragraph",
    signature: "— Acme",
    attachments: [
      { url: "https://cdn.example.com/a.pdf", name: "Invoice <1>.pdf" },
      { url: "javascript:alert(1)", name: "evil" },
    ],
  });
  assert.ok(html.includes("Hi &lt;b&gt;Sam&lt;/b&gt;,"));
  assert.ok(html.includes("Second paragraph<br>same paragraph"));
  assert.ok(html.includes('href="https://cdn.example.com/a.pdf"'));
  assert.ok(html.includes("Invoice &lt;1&gt;.pdf"));
  assert.ok(!html.includes("javascript:"));
  assert.ok(html.includes("— Acme"));
});

test("inviteEmail escapes every interpolated value and links the accept URL", () => {
  const { subject, html } = inviteEmail({
    inviterName: "Ana <script>",
    projectName: "Acme & Co",
    email: "sam@example.com",
    acceptUrl: "https://geiger.studio/invite/abc?x=1&y=2",
    workspaceUrl: "https://geiger.studio/comms/project/p1",
    message: "Welcome\naboard",
  });
  assert.equal(subject, "Ana <script> invited you to Acme & Co on Geiger Comms");
  assert.ok(!html.includes("<script>"));
  assert.ok(html.includes('href="https://geiger.studio/invite/abc?x=1&amp;y=2"'));
  assert.ok(html.includes("Welcome<br>aboard"));
  assert.ok(html.includes("https://geiger.studio/comms/project/p1"));
});

test("testEmail names the channel and sender", () => {
  const { subject, html } = testEmail({ channelName: "Support", from: '"Acme" <support@acme.com>' });
  assert.equal(subject, "Test email from Support");
  assert.ok(html.includes("&quot;Acme&quot; &lt;support@acme.com&gt;"));
});

test("channelSender builds a safe From header or refuses", () => {
  assert.deepEqual(channelSender({ config: { address: " Support@Acme.com ", replyToName: 'Acme "Help" <x>' } }), {
    address: "support@acme.com",
    name: "Acme Help x",
    from: '"Acme Help x" <support@acme.com>',
  });
  assert.equal(channelSender({ config: { address: "support@acme.com" } }).from, "support@acme.com");
  assert.equal(channelSender({ config: { address: "not-an-address" } }), null);
  assert.equal(channelSender({ config: { address: "a@b.com\r\nBcc: c@d.com" } }), null);
  assert.equal(channelSender(null), null);
});
