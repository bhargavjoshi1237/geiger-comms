// articleLexer: the article-grammar AST (./parse.js) as `marked.lexer`-shaped tokens { type, raw, text, depth, lang },
// so lib/ai/markdown_blocks.js can chunk article bodies without a markdown dependency (KB spec §3.2, §7.7).
// Links and images that failed the parser's allowlist are already plain text here.

import { parseMarkdown } from "./parse.js";

export function inlineToMarkdown(nodes) {
  return (nodes || [])
    .map((node) => {
      switch (node.type) {
        case "strong":
          return `**${inlineToMarkdown(node.children)}**`;
        case "em":
          return `*${inlineToMarkdown(node.children)}*`;
        case "code":
          return `\`${node.text}\``;
        case "link":
          return `[${inlineToMarkdown(node.children)}](${node.href})`;
        case "image":
          return `![${node.alt}](${node.src})`;
        case "break":
          return "\n";
        default:
          return node.text ?? "";
      }
    })
    .join("");
}

function toToken(block) {
  switch (block.type) {
    case "heading": {
      const text = inlineToMarkdown(block.inline);
      return { type: "heading", depth: block.level, text, raw: `${"#".repeat(block.level)} ${text}` };
    }
    case "list": {
      const raw = block.items
        .map((item, i) => `${block.ordered ? `${(block.start ?? 1) + i}.` : "-"} ${inlineToMarkdown(item)}`)
        .join("\n");
      return { type: "list", raw, text: raw };
    }
    case "callout": {
      const text = inlineToMarkdown(block.inline);
      return { type: "blockquote", raw: text.split("\n").map((line) => `> ${line}`).join("\n"), text };
    }
    case "code":
      return { type: "code", lang: block.lang, text: block.text, raw: `\`\`\`${block.lang ?? ""}\n${block.text}\n\`\`\`` };
    case "hr":
      return { type: "hr", raw: "---" };
    case "image": {
      const raw = `![${block.alt}](${block.src})`;
      return { type: "paragraph", raw, text: raw };
    }
    default: {
      const text = inlineToMarkdown(block.inline);
      return { type: "paragraph", raw: text, text };
    }
  }
}

export function articleLexer(markdown) {
  return parseMarkdown(markdown).map(toToken);
}
