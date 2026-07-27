#!/usr/bin/env node

/*
 * P2 — Local Deterministic Fixer Library.
 *
 * A registry of pure, deterministic source transforms the Runtime can apply WITHOUT any AI. This is
 * the "Deterministic Fixers" tier of the permanent architecture. It complements the Build Recovery
 * Engine (which owns the tsc-driven repair loop): these are the reusable, content-level fixers, kept
 * in one place so no component duplicates them.
 *
 * Each fixer is `(src: string) => string` — pure and idempotent (applying twice == applying once).
 * `applyFixers(target, names)` reads a file, runs the named fixers, and writes only if the content
 * actually changed (returns whether it changed), so a no-op never dirties the tree.
 */

"use strict";

const fs = require("fs");

// Drop lines that are pure trailing-whitespace noise; trim trailing spaces/tabs on every line.
function stripTrailingWhitespace(src) {
    return src.replace(/[ \t]+(\r?\n)/g, "$1").replace(/[ \t]+$/g, "");
}

// Guarantee exactly one terminating newline (no missing / no doubled blank tail).
function ensureFinalNewline(src) {
    return src.replace(/\n*$/, "") + "\n";
}

// Collapse 3+ consecutive blank lines down to a single blank line.
function collapseBlankLines(src) {
    return src.replace(/\n{3,}/g, "\n\n");
}

// Remove named unused import specifiers from an ES `import { a, b } from "x"` line. Deterministic
// mirror of the Build Recovery unused-import fix, exposed here for reuse. If every specifier is
// removed, the whole import line is dropped.
function removeUnusedNamedImports(src, unused) {
    if (!Array.isArray(unused) || unused.length === 0) return src;
    const drop = new Set(unused);
    return src
        .split("\n")
        .map((line) => {
            const m = line.match(/^(\s*import\s*\{)([^}]*)(\}\s*from\s*["'][^"']+["'];?\s*)$/);
            if (!m) return line;
            const kept = m[2].split(",").map((s) => s.trim()).filter((s) => s && !drop.has(s));
            if (kept.length === 0) return null; // whole import removed
            return `${m[1]} ${kept.join(", ")} ${m[3]}`;
        })
        .filter((line) => line !== null)
        .join("\n");
}

const FIXERS = {
    stripTrailingWhitespace,
    ensureFinalNewline,
    collapseBlankLines,
    removeUnusedNamedImports,
};

// Run a chain of no-arg fixers over `src`. Unknown names throw (fail loud, never silently skip).
function run(src, names) {
    let out = src;
    for (const name of names) {
        const fixer = FIXERS[name];
        if (typeof fixer !== "function") throw new Error(`unknown fixer: ${name}`);
        out = fixer(out);
    }
    return out;
}

function applyFixers(target, names) {
    const before = fs.readFileSync(target, "utf8");
    const after = run(before, names);
    if (after === before) return { target, changed: false };
    fs.writeFileSync(target, after);
    return { target, changed: true };
}

module.exports = { ...FIXERS, FIXERS, run, applyFixers, names: () => Object.keys(FIXERS) };
