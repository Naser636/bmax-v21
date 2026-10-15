#!/usr/bin/env node

/*
 * P4 — Rule-based Decision Templates (TypeScript port; parity with runtime/core/decision-rules.js).
 *
 * The "Rules" tier: a deterministic table mapping an objective's goal to a KNOWN local capability
 * (and relevant fixers), consulted BEFORE any LLM. A rule matches when every `all` keyword appears at
 * a WORD BOUNDARY (case-insensitively) in the goal; rules are tried in declared order, first match wins.
 *
 * Strict TS port: the RULES table (order + contents), word-boundary matching, the {capability, fixers}
 * return shape and the miss ⇒ null behaviour are preserved EXACTLY. The historical .js is the reference.
 */

"use strict";

interface DecisionRule {
  all: string[];
  capability: string;
  fixers?: string[];
}

const RULES: DecisionRule[] = [
  // --- Local SYSTEM / environment capabilities (reuse existing governed capability modules). ------
  { all: ["diagnos"], capability: "self-diagnostic" },                                   // diagnose / diagnostic
  { all: ["integrate", "branch"], capability: "Governed Git Branch Integration" },       // V5 Git capability
  { all: ["merge", "branch"], capability: "Governed Git Branch Integration" },
  { all: ["branch", "into"], capability: "Governed Git Branch Integration" },
  { all: ["git"], capability: "Governed Git Branch Integration" },                       // a known Git request
  { all: ["bash"], capability: "Governed Bash/Linux Command" },                          // V6 Bash capability
  { all: ["shell"], capability: "Governed Bash/Linux Command" },
  { all: ["command"], capability: "Governed Bash/Linux Command" },                       // run a known command
  { all: ["connectivity"], capability: "Connectivity Audit" },
  { all: ["external", "research"], capability: "External Research Acquisition" },
  { all: ["research", "acquisition"], capability: "External Research Acquisition" },
  { all: ["edit", "file"], capability: "Governed Source Edit" },
  { all: ["modify", "file"], capability: "Governed Source Edit" },
  { all: ["apply", "edit"], capability: "Governed Source Edit" },
  { all: ["repository"], capability: "runtime-context-loader" },                         // inspect repo/workspace state
  { all: ["repo", "state"], capability: "runtime-context-loader" },
  { all: ["dépôt"], capability: "runtime-context-loader" },                              // FR: "état du dépôt" (reuse, no new capability)
  { all: ["depot"], capability: "runtime-context-loader" },                              // FR without accent
  { all: ["workspace", "state"], capability: "runtime-context-loader" },
  { all: ["system", "state"], capability: "runtime-context-loader" },
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

function norm(s: unknown): string {
  return String(s || "").toLowerCase();
}

// A keyword matches only at a WORD BOUNDARY start, never as a mid-word substring. Metacharacters are
// escaped defensively so a future keyword is safe.
function escapeRe(s: string): string {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function hasWord(g: string, kw: string): boolean {
  return new RegExp("\\b" + escapeRe(kw)).test(g);
}

// Return the first matching template, or null (a miss ⇒ fall through to Patch Memory / LLM / AI).
function match(goal: unknown): { capability: string; fixers: string[] | null } | null {
  const g = norm(goal);
  for (const rule of RULES) {
    if (rule.all.every((kw) => hasWord(g, kw))) {
      return { capability: rule.capability, fixers: rule.fixers || null };
    }
  }
  return null;
}

module.exports = { match, RULES };

// Module-scope marker (adds NO export): forces TypeScript MODULE scope so this file's internal helpers
// (norm / escapeRe / hasWord / match / RULES) are MODULE-scoped rather than polluting the global script
// scope and colliding with same-named helpers in sibling lots compiled into the same tsconfig program
// (TS2393). The CommonJS API above (module.exports = { match, RULES }) is unchanged, as is the compiled
// require() surface and the behavioural parity with the .js reference.
export {};
