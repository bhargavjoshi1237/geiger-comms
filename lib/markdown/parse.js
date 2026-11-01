// Pure parser for the help-article markdown grammar (KB spec §9.3): the AST renders only as React nodes, and a URL failing the scheme allowlist stays text.
// Blocks: heading (level 2|3) | paragraph | code | list | callout | hr | image; inlines: text | code | strong | em | link | image | break.

export const LINK_SCHEMES = ["https:", "http:", "mailto:"];
export const IMAGE_SCHEMES = ["https:"];

const FENCE_RE = /^\s{0,3}(`{3,}|~{3,})\s*([\w+#.-]*)\s*$/;
const HR_RE = /^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/;
const HEADING_RE = /^\s{0,3}(#{1,6})\s+(.*)$/;
const QUOTE_RE = /^\s{0,3}>\s?/;
const BULLET_RE = /^\s{0,3}[-*+•]\s+(.*)$/;
const ORDERED_RE = /^\s{0,3}(\d{1,9})[.)]\s+(.*)$/;
const IMAGE_LINE_RE = /^\s*!\[([^\]\n]*)\]\(([^\s)]+)\)\s*$/;

const isBlank = (line) => !line.trim();

// A heading's text without its closing run of #s, trimmed in code: the equivalent backtracking regex is cubic on long lines.
function headingText(raw) {
  const text = raw.trimEnd();
  let end = text.length;
  while (end > 0 && text[end - 1] === "#") end -= 1;
  return text.slice(0, end).trimEnd();
}

// The URL as written when its scheme is allowed, else null. Quotes, whitespace and control characters never pass.
export function safeUrl(raw, schemes = LINK_SCHEMES) {
  const value = String(raw ?? "").trim();
  if (!value || /[\s\u0000-\u001f\u007f"'<>\\`]/.test(value)) return null;
  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  return schemes.includes(url.protocol) ? value : null;
}

// Earliest match wins; on a tie the earlier rule does (code before images before links before emphasis).
const INLINE_RULES = [
  { type: "code", re: /`([^`\n]+)`/ },
  { type: "image", re: /!\[([^\]\n]*)\]\(([^\s)]+)\)/, linkish: true },
  { type: "link", re: /\[([^\]\n]+)\]\(([^\s)]+)\)/, linkish: true },
  { type: "strong", re: /\*\*(?=\S)([\s\S]*?\S)\*\*/ },
  { type: "em", re: /(?<![\w*])\*(?=[^\s*])([^*\n]*?[^\s*])\*(?![\w*])/ },
  { type: "url", re: /https?:\/\/[^\s<>()[\]]*[^\s<>()[\].,;:!?'"]/, linkish: true },
];

function pushText(tokens, text) {
  if (!text) return;
  const last = tokens.at(-1);
  if (last?.type === "text") last.text += text;
  else tokens.push({ type: "text", text });
}

// Line breaks inside a paragraph become break tokens. Link text never holds another link or image.
export function parseInline(text, { inLink = false } = {}) {
  const tokens = [];
  const lines = String(text ?? "").split("\n");
  lines.forEach((line, index) => {
    if (index > 0) tokens.push({ type: "break" });
    parseLine(line, tokens, inLink);
  });
  return tokens;
}

function parseLine(line, tokens, inLink) {
  const rules = inLink ? INLINE_RULES.filter((r) => !r.linkish) : INLINE_RULES;
  let rest = line;
  while (rest) {
    let best = null;
    for (const rule of rules) {
      const match = rule.re.exec(rest);
      if (match && (!best || match.index < best.match.index)) best = { rule, match };
    }
    if (!best) {
      pushText(tokens, rest);
      break;
    }
    const { rule, match } = best;
    pushText(tokens, rest.slice(0, match.index));
    if (rule.type === "code") {
      tokens.push({ type: "code", text: match[1] });
    } else if (rule.type === "image") {
      const src = safeUrl(match[2], IMAGE_SCHEMES);
      if (src) tokens.push({ type: "image", alt: match[1], src });
      else pushText(tokens, match[0]);
    } else if (rule.type === "link") {
      const href = safeUrl(match[2], LINK_SCHEMES);
      if (href) tokens.push({ type: "link", href, children: parseInline(match[1], { inLink: true }) });
      else pushText(tokens, match[0]);
    } else if (rule.type === "url") {
      const href = safeUrl(match[0], LINK_SCHEMES);
      if (href) tokens.push({ type: "link", href, children: [{ type: "text", text: match[0] }] });
      else pushText(tokens, match[0]);
    } else {
      tokens.push({ type: rule.type, children: parseInline(match[1], { inLink }) });
    }
    rest = rest.slice(match.index + match[0].length);
  }
}

function startsBlock(line) {
  return (
    FENCE_RE.test(line) ||
    HR_RE.test(line) ||
    HEADING_RE.test(line) ||
    QUOTE_RE.test(line) ||
    BULLET_RE.test(line) ||
    ORDERED_RE.test(line) ||
    IMAGE_LINE_RE.test(line)
  );
}

function parseList(lines, start) {
  const ordered = ORDERED_RE.test(lines[start]);
  const itemRe = ordered ? ORDERED_RE : BULLET_RE;
  const first = itemRe.exec(lines[start]);
  const items = [];
  let i = start;
  while (i < lines.length) {
    const line = lines[i];
    if (isBlank(line)) {
      let j = i + 1;
      while (j < lines.length && isBlank(lines[j])) j += 1;
      if (j < lines.length && itemRe.test(lines[j]) && !HR_RE.test(lines[j])) {
        i = j;
        continue;
      }
      break;
    }
    const match = HR_RE.test(line) ? null : itemRe.exec(line);
    if (match) {
      items.push([ordered ? match[2] : match[1]]);
    } else if (items.length && !startsBlock(line)) {
      items.at(-1).push(line.trim());
    } else {
      break;
    }
    i += 1;
  }
  return {
    block: {
      type: "list",
      ordered,
      start: ordered ? Number.parseInt(first[1], 10) : null,
      items: items.map((item) => parseInline(item.join("\n"))),
    },
    next: i,
  };
}

export function parseMarkdown(text) {
  const lines = String(text ?? "").replace(/\r\n?/g, "\n").split("\n");
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (isBlank(line)) {
      i += 1;
      continue;
    }

    const fence = FENCE_RE.exec(line);
    if (fence) {
      const marker = fence[1];
      const closing = new RegExp(`^\\s{0,3}\\${marker[0]}{${marker.length},}\\s*$`);
      const body = [];
      i += 1;
      while (i < lines.length && !closing.test(lines[i])) {
        body.push(lines[i]);
        i += 1;
      }
      blocks.push({ type: "code", lang: fence[2] || null, text: body.join("\n") });
      i += 1;
      continue;
    }

    if (HR_RE.test(line)) {
      blocks.push({ type: "hr" });
      i += 1;
      continue;
    }

    // The article title is the page's h1, so `#` reads as h2 and anything past `###` as h3.
    const heading = HEADING_RE.exec(line);
    if (heading) {
      const level = Math.min(3, Math.max(2, heading[1].length));
      blocks.push({ type: "heading", level, inline: parseInline(headingText(heading[2])) });
      i += 1;
      continue;
    }

    const image = IMAGE_LINE_RE.exec(line);
    if (image) {
      const src = safeUrl(image[2], IMAGE_SCHEMES);
      blocks.push(
        src
          ? { type: "image", alt: image[1], src }
          : { type: "paragraph", inline: parseInline(line.trim()) },
      );
      i += 1;
      continue;
    }

    if (QUOTE_RE.test(line)) {
      const body = [];
      while (i < lines.length && QUOTE_RE.test(lines[i])) {
        body.push(lines[i].replace(QUOTE_RE, ""));
        i += 1;
      }
      blocks.push({ type: "callout", inline: parseInline(body.join("\n").trim()) });
      continue;
    }

    if (BULLET_RE.test(line) || ORDERED_RE.test(line)) {
      const { block, next } = parseList(lines, i);
      blocks.push(block);
      i = next;
      continue;
    }

    const body = [line.trim()];
    i += 1;
    while (i < lines.length && !isBlank(lines[i]) && !startsBlock(lines[i])) {
      body.push(lines[i].trim());
      i += 1;
    }
    blocks.push({ type: "paragraph", inline: parseInline(body.join("\n")) });
  }

  return blocks;
}
