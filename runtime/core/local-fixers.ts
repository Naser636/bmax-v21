#!/usr/bin/env node

/*
 * P2 — Local Deterministic Fixer Library (TypeScript port; parity with runtime/core/local-fixers.js).
 *
 * A registry of pure, deterministic source transforms the Runtime can apply WITHOUT any AI. Each fixer
 * is `(src: string) => string` — pure and idempotent. `applyFixers(target, names)` reads a file, runs
 * the named fixers, and writes ONLY if the content changed (returns whether it changed).
 *
 * Strict TS port: the exact regexes, the public exports (the four fixers, FIXERS, run, applyFixers,
 * names), signatures, idempotency, the "unknown fixer" throw and the write-if-changed side effect are
 * preserved EXACTLY. The historical .js remains the behavioural reference.
 */

"use strict";

import * as fs from "fs";

// Drop lines that are pure trailing-whitespace noise; trim trailing spaces/tabs on every line.
export function stripTrailingWhitespace(src: string): string {
  return src.replace(/[ \t]+(\r?\n)/g, "$1").replace(/[ \t]+$/g, "");
}

// Guarantee exactly one terminating newline (no missing / no doubled blank tail).
export function ensureFinalNewline(src: string): string {
  return src.replace(/\n*$/, "") + "\n";
}

// Collapse 3+ consecutive blank lines down to a single blank line.
export function collapseBlankLines(src: string): string {
  return src.replace(/\n{3,}/g, "\n\n");
}

// Remove named unused import specifiers from an ES `import { a, b } from "x"` line. If every specifier
// is removed, the whole import line is dropped.
export function removeUnusedNamedImports(src: string, unused: string[]): string {
  if (!Array.isArray(unused) || unused.length === 0) return src;
  const drop = new Set(unused);
  return src
    .split("\n")
    .map((line): string | null => {
      const m = line.match(/^(\s*import\s*\{)([^}]*)(\}\s*from\s*["'][^"']+["'];?\s*)$/);
      if (!m) return line;
      const kept = m[2].split(",").map((s) => s.trim()).filter((s) => s && !drop.has(s));
      if (kept.length === 0) return null; // whole import removed
      return `${m[1]} ${kept.join(", ")} ${m[3]}`;
    })
    .filter((line): line is string => line !== null)
    .join("\n");
}

export const FIXERS: Record<string, Function> = {
  stripTrailingWhitespace,
  ensureFinalNewline,
  collapseBlankLines,
  removeUnusedNamedImports,
};

// Run a chain of no-arg fixers over `src`. Unknown names throw (fail loud, never silently skip).
export function run(src: string, names: string[]): string {
  let out = src;
  for (const name of names) {
    const fixer = FIXERS[name];
    if (typeof fixer !== "function") throw new Error(`unknown fixer: ${name}`);
    out = (fixer as (s: string) => string)(out);
  }
  return out;
}

export function applyFixers(target: string, names: string[]): { target: string; changed: boolean } {
  const before = fs.readFileSync(target, "utf8");
  const after = run(before, names);
  if (after === before) return { target, changed: false };
  fs.writeFileSync(target, after);
  return { target, changed: true };
}

export function names(): string[] {
  return Object.keys(FIXERS);
}
