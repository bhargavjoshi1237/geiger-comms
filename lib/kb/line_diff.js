// Line diff for version history and suggested edits: [{ type: "same" | "added" | "removed", text }].
// Common prefix and suffix are trimmed first; the middle is an LCS diff, or a plain replace past MAX_CELLS.

const MAX_CELLS = 4_000_000;

const splitLines = (text) => String(text ?? "").replace(/\r\n?/g, "\n").split("\n");

function lcsDiff(a, b) {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const table = new Uint32Array(rows * cols);
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      table[i * cols + j] =
        a[i] === b[j]
          ? table[(i + 1) * cols + j + 1] + 1
          : Math.max(table[(i + 1) * cols + j], table[i * cols + j + 1]);
    }
  }
  const out = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      out.push({ type: "same", text: a[i] });
      i += 1;
      j += 1;
    } else if (table[(i + 1) * cols + j] >= table[i * cols + j + 1]) {
      out.push({ type: "removed", text: a[i] });
      i += 1;
    } else {
      out.push({ type: "added", text: b[j] });
      j += 1;
    }
  }
  while (i < a.length) out.push({ type: "removed", text: a[i++] });
  while (j < b.length) out.push({ type: "added", text: b[j++] });
  return out;
}

export function lineDiff(before, after) {
  const a = splitLines(before);
  const b = splitLines(after);
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start += 1;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA -= 1;
    endB -= 1;
  }
  const midA = a.slice(start, endA);
  const midB = b.slice(start, endB);
  const middle =
    (midA.length + 1) * (midB.length + 1) > MAX_CELLS
      ? [
          ...midA.map((line) => ({ type: "removed", text: line })),
          ...midB.map((line) => ({ type: "added", text: line })),
        ]
      : lcsDiff(midA, midB);
  return [
    ...a.slice(0, start).map((line) => ({ type: "same", text: line })),
    ...middle,
    ...a.slice(endA).map((line) => ({ type: "same", text: line })),
  ];
}

export function hasChanges(diff) {
  return diff.some((line) => line.type !== "same");
}
