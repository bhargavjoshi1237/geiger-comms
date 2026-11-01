// Text edits behind the markdown toolbar (KB spec §9.3). Each reads the textarea behind `ref` and returns
// { value, start, end }: the next text and the selection to restore once it renders.

function selectionOf(ref) {
  const el = ref.current;
  if (!el) return null;
  return { value: el.value, start: el.selectionStart ?? 0, end: el.selectionEnd ?? 0 };
}

// Wraps the selection (or a placeholder) and selects the wrapped text.
export function wrapSelection(ref, before, after = before, placeholder = "") {
  const sel = selectionOf(ref);
  if (!sel) return null;
  const { value, start, end } = sel;
  const inner = value.slice(start, end) || placeholder;
  const next = value.slice(0, start) + before + inner + after + value.slice(end);
  const caret = start + before.length;
  return { value: next, start: caret, end: caret + inner.length };
}

// Prefixes every line the selection touches; "1. " numbers them in order.
export function prefixLines(ref, prefix) {
  const sel = selectionOf(ref);
  if (!sel) return null;
  const { value, start, end } = sel;
  const lineStart = value.lastIndexOf("\n", start - 1) + 1;
  const found = value.indexOf("\n", end);
  const lineEnd = found === -1 ? value.length : found;
  const numbered = prefix === "1. ";
  const lines = value
    .slice(lineStart, lineEnd)
    .split("\n")
    .map((line, i) => `${numbered ? `${i + 1}. ` : prefix}${line}`);
  const block = lines.join("\n");
  const next = value.slice(0, lineStart) + block + value.slice(lineEnd);
  return { value: next, start: lineStart, end: lineStart + block.length };
}

// Inserts a block on its own lines at the caret (code fence, divider, image) and selects `select` within it.
export function insertBlock(ref, block, select = "") {
  const sel = selectionOf(ref);
  if (!sel) return null;
  const { value, start, end } = sel;
  const before = value.slice(0, start);
  const after = value.slice(end);
  const lead = before && !before.endsWith("\n\n") ? (before.endsWith("\n") ? "\n" : "\n\n") : "";
  const trail = after.startsWith("\n") ? "" : "\n";
  const next = before + lead + block + trail + after;
  const offset = select ? block.indexOf(select) : block.length;
  const caret = before.length + lead.length + Math.max(0, offset);
  return { value: next, start: caret, end: caret + (select && offset >= 0 ? select.length : 0) };
}
