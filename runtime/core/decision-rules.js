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
    // External Research Acquisition — the EXISTING governed external-data node (capability-executors.js,
    // dry-run default = ZERO network). Same resolver-gap class as the rules above: the capability,
    // executor and probes (external-research-dry-run-planned / research-acquired) all exist, but NO rule
    // mapped a natural-language research request to it, so the Router routed it to the external-ai last
    // resort (MISSING_CAPABILITY). Both words required (tight), so only a genuine external-research
    // request matches. Recognition is NOT authorization — it is a CONSEQUENTIAL capability and still
    // requires an explicit human grant (capability-authorization) before any engagement.
    { all: ["external", "research"], capability: "External Research Acquisition" },
    { all: ["research", "acquisition"], capability: "External Research Acquisition" },
    // Governed Source Edit — a bounded local file WRITE applied by the EXISTING Patch Executor. Same
    // resolver-recognition pattern: recognition is NOT authorization — it is a CONSEQUENTIAL capability
    // that still requires an explicit human grant (whose scope carries the authorized paths AND the
    // concrete edit) before anything is written. Tight (both words) so only an explicit edit intent matches.
    { all: ["edit", "file"], capability: "Governed Source Edit" },
    { all: ["modify", "file"], capability: "Governed Source Edit" },
    { all: ["apply", "edit"], capability: "Governed Source Edit" },
    { all: ["repository"], capability: "runtime-context-loader" },                         // inspect repo/workspace state
    { all: ["repo", "state"], capability: "runtime-context-loader" },
    { all: ["dépôt"], capability: "runtime-context-loader" },                              // FR: "état du dépôt" (reuse, no new capability)
    { all: ["depot"], capability: "runtime-context-loader" },                              // FR without accent
    { all: ["workspace", "state"], capability: "runtime-context-loader" },
    { all: ["system", "state"], capability: "runtime-context-loader" },
    // Runtime-internal AUDIT / CONVERGENCE vocabulary. Same defect class as the diagnose/git/repo
    // rules above (a V7 reliquat): a read-only local inspection the runtime already performs itself
    // (self-diagnostic.js / runtime-context-loader / `odg converge`) matched no rule, so the Router
    // saw no LOCAL tier and routed it to the external-ai last resort. Declared AFTER "connectivity"
    // so "connectivity audit" still wins Connectivity Audit (first-match). Maps ONLY to existing
    // capabilities — no new executor/registry/primitive. Kept tight to runtime-internal audit terms;
    // bare "verify"/"check" are deliberately NOT signals (they would swallow a genuine provider need).
    { all: ["audit"], capability: "self-diagnostic" },                                     // audit the runtime/carnet
    { all: ["false", "success"], capability: "self-diagnostic" },                          // false-success forensics
    { all: ["honest"], capability: "self-diagnostic" },                                    // "is the state honest"
    { all: ["converge"], capability: "runtime-context-loader" },                           // converge/convergence/converged
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
