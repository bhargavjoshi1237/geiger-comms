import test from "node:test";
import assert from "node:assert/strict";
import { hasChanges, lineDiff } from "./line_diff.js";

const same = (text) => ({ type: "same", text });
const added = (text) => ({ type: "added", text });
const removed = (text) => ({ type: "removed", text });

test("lineDiff: identical text has no changes", () => {
  const diff = lineDiff("a\nb", "a\nb");
  assert.deepEqual(diff, [same("a"), same("b")]);
  assert.equal(hasChanges(diff), false);
});

test("lineDiff: an edited middle line reads as removed then added", () => {
  assert.deepEqual(lineDiff("a\nb\nc", "a\nB\nc"), [same("a"), removed("b"), added("B"), same("c")]);
});

test("lineDiff: insertions and deletions keep the common lines", () => {
  assert.deepEqual(lineDiff("a\nc", "a\nb\nc"), [same("a"), added("b"), same("c")]);
  assert.deepEqual(lineDiff("a\nb\nc", "a\nc"), [same("a"), removed("b"), same("c")]);
  assert.deepEqual(lineDiff("x\ny", "y\nz"), [removed("x"), same("y"), added("z")]);
});

test("lineDiff: empty sides and CRLF input", () => {
  assert.deepEqual(lineDiff("", "a"), [removed(""), added("a")]);
  assert.deepEqual(lineDiff("a\r\nb", "a\nb"), [same("a"), same("b")]);
  assert.equal(hasChanges(lineDiff("a", "")), true);
});
