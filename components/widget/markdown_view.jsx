"use client";

// Message/article/post rendering is an XSS boundary (spec §9): everything
// renders as React text nodes — there is no dangerouslySetInnerHTML anywhere.
// Supports a strict markdown subset: paragraphs, **bold**, *italic*, `code`,
// - bullets and bare http(s) links.

import { useMemo } from "react";

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
      nodes.push(
        <code key={key} className="rounded bg-surface-card px-1 py-0.5 font-mono text-[0.85em]">
          {token.slice(1, -1)}
        </code>,
      );
    } else if (token.startsWith("*")) {
      nodes.push(<em key={key}>{token.slice(1, -1)}</em>);
    } else {
      nodes.push(
        <a
          key={key}
          href={token}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="text-primary underline underline-offset-2"
        >
          {token}
        </a>,
      );
    }
    last = match.index + token.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

export function MarkdownView({ text = "", className = "" }) {
  const blocks = useMemo(() => String(text).replace(/\r\n/g, "\n").split(/\n{2,}/), [text]);

  return (
    <div className={`space-y-2 text-sm leading-relaxed ${className}`}>
      {blocks.map((block, bi) => {
        const lines = block.split("\n");
        if (lines.every((line) => /^\s*[-•]\s+/.test(line))) {
          return (
            <ul key={bi} className="list-disc space-y-1 pl-4">
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
