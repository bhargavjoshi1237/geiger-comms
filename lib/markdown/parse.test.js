import test from "node:test";
import assert from "node:assert/strict";
import { parseInline, parseMarkdown, safeUrl } from "./parse.js";

const text = (t) => ({ type: "text", text: t });
const para = (...inline) => ({ type: "paragraph", inline });

test("inline: emphasis, code and links", () => {
  assert.deepEqual(parseInline("**Bold** and *it* with `x = 1`"), [
    { type: "strong", children: [text("Bold")] },
    text(" and "),
    { type: "em", children: [text("it")] },
    text(" with "),
    { type: "code", text: "x = 1" },
  ]);
  assert.deepEqual(parseInline("See [the docs](https://acme.dev/a) now"), [
    text("See "),
    { type: "link", href: "https://acme.dev/a", children: [text("the docs")] },
    text(" now"),
  ]);
  assert.deepEqual(parseInline("[Write us](mailto:help@acme.dev)"), [
    { type: "link", href: "mailto:help@acme.dev", children: [text("Write us")] },
  ]);
});

test("inline: bare URLs leave a closing parenthesis and trailing punctuation outside", () => {
  assert.deepEqual(parseInline("(see https://acme.dev/a)."), [
    text("(see "),
    { type: "link", href: "https://acme.dev/a", children: [text("https://acme.dev/a")] },
    text(")."),
  ]);
});

test("inline: no emphasis inside words or arithmetic", () => {
  assert.deepEqual(parseInline("snake_case and 2*3*4"), [text("snake_case and 2*3*4")]);
});

test("inline: link text never nests a link or an image", () => {
  assert.deepEqual(parseInline("[go https://b.dev](https://a.dev)"), [
    { type: "link", href: "https://a.dev", children: [text("go https://b.dev")] },
  ]);
  assert.deepEqual(parseInline("[**Bold** link](https://a.dev)"), [
    {
      type: "link",
      href: "https://a.dev",
      children: [{ type: "strong", children: [text("Bold")] }, text(" link")],
    },
  ]);
});

test("inline: paragraph lines become breaks", () => {
  assert.deepEqual(parseInline("one\ntwo"), [text("one"), { type: "break" }, text("two")]);
});

test("blocks: headings map # to h2 and anything deeper than ### to h3", () => {
  assert.deepEqual(parseMarkdown("# Title\n## Two\n### Three\n#### Four"), [
    { type: "heading", level: 2, inline: [text("Title")] },
    { type: "heading", level: 2, inline: [text("Two")] },
    { type: "heading", level: 3, inline: [text("Three")] },
    { type: "heading", level: 3, inline: [text("Four")] },
  ]);
});

test("blocks: a closing run of #s is dropped, and a long heading line parses in linear time", () => {
  assert.deepEqual(parseMarkdown("## Two ##  "), [{ type: "heading", level: 2, inline: [text("Two")] }]);
  const started = Date.now();
  const [heading] = parseMarkdown(`# a${" ".repeat(50_000)}x`);
  assert.equal(heading.type, "heading");
  assert.ok(Date.now() - started < 1_000);
});

test("blocks: bulleted and numbered lists keep their start", () => {
  assert.deepEqual(parseMarkdown("- one\n- two\n\n3. three\n4. four"), [
    { type: "list", ordered: false, start: null, items: [[text("one")], [text("two")]] },
    { type: "list", ordered: true, start: 3, items: [[text("three")], [text("four")]] },
  ]);
});

test("blocks: a lazy line continues the list item", () => {
  assert.deepEqual(parseMarkdown("1. Open settings\n   then save"), [
    {
      type: "list",
      ordered: true,
      start: 1,
      items: [[text("Open settings"), { type: "break" }, text("then save")]],
    },
  ]);
});

test("blocks: callouts, dividers, fenced code and images", () => {
  assert.deepEqual(
    parseMarkdown("> Heads up\n> twice\n\n---\n\n```js\nconst a = `**x**`;\n```\n\n![Diagram](https://cdn.acme.dev/a.png)"),
    [
      { type: "callout", inline: [text("Heads up"), { type: "break" }, text("twice")] },
      { type: "hr" },
      { type: "code", lang: "js", text: "const a = `**x**`;" },
      { type: "image", alt: "Diagram", src: "https://cdn.acme.dev/a.png" },
    ],
  );
});

test("blocks: paragraphs stop at the next block", () => {
  assert.deepEqual(parseMarkdown("Intro line\n## Next"), [
    para(text("Intro line")),
    { type: "heading", level: 2, inline: [text("Next")] },
  ]);
});

test("blocks: an unclosed fence runs to the end", () => {
  assert.deepEqual(parseMarkdown("```\nline"), [{ type: "code", lang: null, text: "line" }]);
});

test("safeUrl: only the allowed schemes pass", () => {
  assert.equal(safeUrl("https://acme.dev"), "https://acme.dev");
  assert.equal(safeUrl("http://acme.dev"), "http://acme.dev");
  assert.equal(safeUrl("mailto:a@acme.dev"), "mailto:a@acme.dev");
  assert.equal(safeUrl("javascript:alert(1)"), null);
  assert.equal(safeUrl("JaVaScRiPt:alert(1)"), null);
  assert.equal(safeUrl("data:text/html,hi"), null);
  assert.equal(safeUrl("/relative"), null);
  assert.equal(safeUrl("https://a.dev/\"onmouseover=x"), null);
  assert.equal(safeUrl("http://a.dev/x.png", ["https:"]), null);
});

test("xss: markup and unsafe schemes stay literal text", () => {
  const corpus = [
    "<img src=x onerror=alert(1)>",
    "<script>alert(1)</script>",
    "[click](javascript:alert(1))",
    "[click](JAVASCRIPT:alert(1))",
    "[click](vbscript:msgbox(1))",
    "[click](data:text/html;base64,PHNjcmlwdD4=)",
    "![x](data:image/png;base64,iVBORw0KGgo=)",
    "![x](http://insecure.dev/a.png)",
    "![x](javascript:alert(1))",
    '<a href="javascript:alert(1)">x</a>',
  ];
  for (const input of corpus) {
    const blocks = parseMarkdown(input);
    assert.deepEqual(blocks, [para(text(input))], input);
  }
});

test("xss: an unsafe inline image or link keeps the surrounding text", () => {
  assert.deepEqual(parseInline("before ![t](data:image/svg+xml,<svg>) after"), [
    text("before ![t](data:image/svg+xml,<svg>) after"),
  ]);
});
