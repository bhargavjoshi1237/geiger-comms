"use client";

// XSS boundary (spec §9): React text nodes only, never dangerouslySetInnerHTML; "message" is a strict subset, "article" the lib/markdown grammar.

import { useMemo } from "react";
import { parseMarkdown } from "@/lib/markdown/parse";

function renderInline(text, keyPrefix) {
  const pattern = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|https?:\/\/[^\s]+)/g;
  const nodes = [];
  let last = 0;
  let match;
  let i = 0;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    const token = match[0];
    const key = `${keyPrefix}-${i++}`;
    if (token.startsWith("**")) {
      nodes.push(<strong key={key}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith("`")) {
      nodes.push(<code key={key}>{token.slice(1, -1)}</code>);
    } else if (token.startsWith("*")) {
      nodes.push(<em key={key}>{token.slice(1, -1)}</em>);
    } else {
      nodes.push(
        <a key={key} href={token} target="_blank" rel="noopener noreferrer nofollow">
          {token}
        </a>,
      );
    }
    last = match.index + token.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

function MessageMarkdown({ text, className }) {
  const blocks = useMemo(() => String(text).replace(/\r\n/g, "\n").split(/\n{2,}/), [text]);

  return (
    <div className={`gc-md ${className}`.trim()}>
      {blocks.map((block, bi) => {
        const lines = block.split("\n");
        if (lines.every((line) => /^\s*[-•]\s+/.test(line))) {
          return (
            <ul key={bi}>
              {lines.map((line, li) => (
                <li key={li}>{renderInline(line.replace(/^\s*[-•]\s+/, ""), `${bi}-${li}`)}</li>
              ))}
            </ul>
          );
        }
        return (
          <p key={bi}>
            {lines.flatMap((line, li) => {
              const inline = renderInline(line, `${bi}-${li}`);
              return li < lines.length - 1 ? [...inline, <br key={`br-${bi}-${li}`} />] : inline;
            })}
          </p>
        );
      })}
    </div>
  );
}

// URLs reaching href/src here already passed the parser's scheme allowlist.
function renderArticleInline(nodes, keyPrefix) {
  return nodes.map((node, i) => {
    const key = `${keyPrefix}-${i}`;
    switch (node.type) {
      case "strong":
        return <strong key={key}>{renderArticleInline(node.children, key)}</strong>;
      case "em":
        return <em key={key}>{renderArticleInline(node.children, key)}</em>;
      case "code":
        return <code key={key}>{node.text}</code>;
      case "link":
        return (
          <a key={key} href={node.href} target="_blank" rel="noopener noreferrer nofollow">
            {renderArticleInline(node.children, key)}
          </a>
        );
      case "image":
        // eslint-disable-next-line @next/next/no-img-element
        return <img key={key} src={node.src} alt={node.alt} loading="lazy" referrerPolicy="no-referrer" />;
      case "break":
        return <br key={key} />;
      default:
        return node.text;
    }
  });
}

function ArticleMarkdown({ text, className }) {
  const blocks = useMemo(() => parseMarkdown(text), [text]);

  return (
    <div className={`gc-md ${className}`.trim()}>
      {blocks.map((block, bi) => {
        const key = String(bi);
        switch (block.type) {
          case "heading":
            return block.level === 2 ? (
              <h2 key={key}>{renderArticleInline(block.inline, key)}</h2>
            ) : (
              <h3 key={key}>{renderArticleInline(block.inline, key)}</h3>
            );
          case "list": {
            const items = block.items.map((item, li) => (
              <li key={li}>{renderArticleInline(item, `${key}-${li}`)}</li>
            ));
            return block.ordered ? (
              <ol key={key} start={block.start ?? undefined}>
                {items}
              </ol>
            ) : (
              <ul key={key}>{items}</ul>
            );
          }
          case "callout":
            return <blockquote key={key}>{renderArticleInline(block.inline, key)}</blockquote>;
          case "code":
            return (
              <pre key={key}>
                <code>{block.text}</code>
              </pre>
            );
          case "hr":
            return <hr key={key} />;
          case "image":
            return (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={key} src={block.src} alt={block.alt} loading="lazy" referrerPolicy="no-referrer" />
            );
          default:
            return <p key={key}>{renderArticleInline(block.inline, key)}</p>;
        }
      })}
    </div>
  );
}

export function MarkdownView({ text = "", className = "", variant = "message" }) {
  return variant === "article" ? (
    <ArticleMarkdown text={text} className={className} />
  ) : (
    <MessageMarkdown text={text} className={className} />
  );
}
