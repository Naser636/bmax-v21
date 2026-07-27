#!/usr/bin/env node

/*
 * P4 — Rule-based Decision Templates.
 *
 * The "Rules" tier of the permanent architecture: a deterministic table that maps an objective's
 * natural-language goal to a KNOWN local capability (and, where relevant, the deterministic fixers
 * to run) — consulted BEFORE any LLM. Lets the Decision Engine resolve standardized objectives with
 * zero AI. Reuses the P2 fixer names and the existing local capability modules; invents nothing new.
 *
 * A rule matches when every one of its `all` keywords appears (case-insensitively) in the goal.
 * Rules are tried in declared order; the first match wins. Pure ⇒ deterministic.
 */

"use strict";

const RULES = [
    { all: ["unused", "import"], capability: "local-fixers", fixers: ["removeUnusedNamedImports"] },
    { all: ["trailing", "whitespace"], capability: "local-fixers", fixers: ["stripTrailingWhitespace"] },
    { all: ["final", "newline"], capability: "local-fixers", fixers: ["ensureFinalNewline"] },
    { all: ["format"], capability: "local-fixers", fixers: ["stripTrailingWhitespace", "collapseBlankLines", "ensureFinalNewline"] },
    { all: ["lint"], capability: "local-fixers", fixers: ["stripTrailingWhitespace", "ensureFinalNewline"] },
    { all: ["test"], capability: "local-test-gate" },
    { all: ["checkpoint"], capability: "checkpoint-engine" },
    { all: ["resume"], capability: "checkpoint-engine" },
    { all: ["runtimecontext"], capability: "runtime-context-loader" },
    { all: ["runtime", "context"], capability: "runtime-context-loader" },
    { all: ["build"], capability: "build-recovery-engine" },
    { all: ["typescript"], capability: "build-recovery-engine" },
];

function norm(s) {
    return String(s || "").toLowerCase();
}

// Return the first matching template, or null (a miss ⇒ fall through to Patch Memory / LLM / AI).
function match(goal) {
    const g = norm(goal);
    for (const rule of RULES) {
        if (rule.all.every((kw) => g.includes(kw))) {
            return { capability: rule.capability, fixers: rule.fixers || null };
        }
    }
    return null;
}

module.exports = { match, RULES };
