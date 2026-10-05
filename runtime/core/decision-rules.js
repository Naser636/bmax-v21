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
    // --- Local SYSTEM / environment capabilities (reuse existing governed capability modules). ------
    // Declared FIRST (first-match-wins) so a legitimate local request resolves to its governed local
    // capability instead of falling through every LOCAL tier to the EXTERNAL_AI last resort. Without
    // these rules a request like "run a governed diagnostic", "inspect the repository state", a known
    // Git action, or a known Bash/Linux command matched no rule, so the Capability Router saw no LOCAL
    // tier and routed a local system request to external AI (resolvedCapability=null, MISSING_CAPABILITY).
    // Each maps to an EXISTING capability — self-diagnostic.js, git-branch-integration.js (V5),
    // bash-command-governor.js (V6), the Connectivity Audit executor, runtime-context-loader.js — and
    // introduces NO new executor, registry or primitive. The chosen capability is still governed by the
    // existing action-gate / authority / risk stages; recognition here is not authorization.
    { all: ["diagnos"], capability: "self-diagnostic" },                                   // diagnose / diagnostic
    { all: ["integrate", "branch"], capability: "Governed Git Branch Integration" },       // V5 Git capability
    { all: ["merge", "branch"], capability: "Governed Git Branch Integration" },
    { all: ["branch", "into"], capability: "Governed Git Branch Integration" },
    { all: ["git"], capability: "Governed Git Branch Integration" },                       // a known Git request
    { all: ["bash"], capability: "Governed Bash/Linux Command" },                          // V6 Bash capability
    { all: ["shell"], capability: "Governed Bash/Linux Command" },
    { all: ["command"], capability: "Governed Bash/Linux Command" },                       // run a known command
    { all: ["connectivity"], capability: "Connectivity Audit" },
    { all: ["repository"], capability: "runtime-context-loader" },                         // inspect repo/workspace state
    { all: ["repo", "state"], capability: "runtime-context-loader" },
    { all: ["dépôt"], capability: "runtime-context-loader" },                              // FR: "état du dépôt" (reuse, no new capability)
    { all: ["depot"], capability: "runtime-context-loader" },                              // FR without accent
    { all: ["workspace", "state"], capability: "runtime-context-loader" },
    { all: ["system", "state"], capability: "runtime-context-loader" },
    // --- Code-fix / build capabilities (pre-existing) ---------------------------------------------
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
