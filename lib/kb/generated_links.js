// Removes links and images a model added to generated markdown (KB spec §9.6): any URL that does not appear
// verbatim in the grounding input goes. A link keeps its text, an image is dropped, a bare URL is deleted.
// This stops a crafted customer question from planting a phishing link or tracking image in help content.
// Code spans and fenced code are left alone — the renderer never turns them into links.

const TOKEN_RE =
  /(!\[([^\]\n]*)\]\(([^\s)]+)\))|(\[([^\]\n]+)\]\(([^\s)]+)\))|(https?:\/\/[^\s<>()[\]]*[^\s<>()[\].,;:!?'"])/g;
const BARE_URL_RE = /https?:\/\/[^\s<>()[\]]*[^\s<>()[\].,;:!?'"]/g;
const FENCE_RE = /^\s{0,3}(`{3,}|~{3,})/;

function stripBare(text, grounded, removed) {
  return text.replace(BARE_URL_RE, (url) => {
    if (grounded(url)) return url;
    removed.push({ kind: "url", url, text: "" });
    return "";
  });
}

function stripSegment(text, grounded, removed) {
  return text.replace(TOKEN_RE, (match, image, alt, imageUrl, link, label, linkUrl, bare) => {
    if (image) {
      if (grounded(imageUrl)) return match;
      removed.push({ kind: "image", url: imageUrl, text: alt });
      return "";
    }
    if (link) {
      if (grounded(linkUrl)) return match;
      removed.push({ kind: "link", url: linkUrl, text: label });
      return stripBare(label, grounded, removed);
    }
    if (grounded(bare)) return match;
    removed.push({ kind: "url", url: bare, text: "" });
    return "";
  });
}

// -> { text, removed: [{ kind: "link" | "image" | "url", url, text }] }
export function stripUngroundedLinks(markdown, grounding = "") {
  const source = String(grounding ?? "");
  const grounded = (url) => source.includes(url);
  const removed = [];
  let fence = null;
  const lines = String(markdown ?? "").split("\n").map((line) => {
    const open = FENCE_RE.exec(line);
    if (fence) {
      if (open && open[1][0] === fence[0] && open[1].length >= fence.length) fence = null;
      return line;
    }
    if (open) {
      fence = open[1];
      return line;
    }
    // Odd segments sit inside `inline code`.
    return line
      .split("`")
      .map((part, i) => (i % 2 ? part : stripSegment(part, grounded, removed)))
      .join("`");
  });
  return { text: lines.join("\n"), removed };
}
