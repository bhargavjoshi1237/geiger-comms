import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// lib/{engine,ai,kb,markdown,inbox} run under plain `node --test` (spec §3.2), which can't resolve the @/ alias,
// server-only or next/*: relative .js imports only.
const lib = fileURLToPath(new URL("..", import.meta.url));
const FORBIDDEN = /(?:from\s+|import\s*\(\s*|import\s+)["'](@\/|server-only|next\/|next["'])/;

function* sources(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* sources(path);
    else if (/\.(c|m)?js$/.test(entry.name)) yield path;
  }
}

test("pure modules import nothing Node can't resolve on its own", () => {
  const offenders = [];
  for (const area of ["engine", "ai", "kb", "markdown", "inbox"]) {
    const dir = join(lib, area);
    if (!existsSync(dir)) continue;
    for (const file of sources(dir)) {
      readFileSync(file, "utf8").split("\n").forEach((line, i) => {
        if (FORBIDDEN.test(line)) offenders.push(`${file}:${i + 1}`);
      });
    }
  }
  assert.deepEqual(offenders, []);
});
