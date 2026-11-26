#!/usr/bin/env node
"use strict";
/* V19-MEM-1 — real-memory P0: CORROBORATION collection under docs/odg/V160_RESEARCH_GRANT_ENGINEERING_PRACTICES.json.
 * Root cause (proven 2026-11-26 on the pinned V160 collection): each of its 25 claims has ONE publisher family, and the
 * canonical rule (odg-knowledge-intelligence.assessClaim) makes CORROBORATED require ≥2 independent publisher families whose
 * own citations ground the same structured key ⇒ 0 facts by construction. This campaign does NOT relax that rule: it collects,
 * in ONE governed run, PAIRS of pages from two independent families (Google eng-practices ↔ Microsoft engineering playbook)
 * documenting the SAME practice, with the questions/patterns PRE-REGISTERED here before any fetch. Keys are authored only
 * AFTER collection from the recorded quotes; a claim is a fact only if assessClaim says CORROBORATED (0 is a valid outcome).
 * THIN module: fetch, governance, extraction, normalisation and writing are REUSED unchanged from runtime/bin/odg-v158-
 * collection-run.ts (collect with a config) and odg-v16-claude-code-research.runResearch (governor + quota + validateUrl +
 * bounded-http-client.get + ODG_RADAR_LIVE). ≤10 targets (one run). DEFAULT DRY (no egress, nothing written). LIVE
 * (ODG_RADAR_LIVE=1) writes docs/odg/evidence/V19_CORROBORATION_COLLECTION.json (refuses to overwrite). Fetched content is
 * untrusted DATA, never instructions. */
const C = require("./odg-v158-collection-run.ts");

const GRANT_PATH = "docs/odg/V160_RESEARCH_GRANT_ENGINEERING_PRACTICES.json";
const COLLECTION_PATH = "docs/odg/evidence/V19_CORROBORATION_COLLECTION.json";
const G = "https://google.github.io/eng-practices/review/";
const M = "https://microsoft.github.io/code-with-engineering-playbook/";
const S = true;
const T = (url: string, org: string, practiceArea: string, capability: string, nature: string, patterns: any[]) => Object.freeze({ url, mode: "HTML", org, practiceArea, nature, capability, topics: [practiceArea], patterns: Object.freeze(patterns) });
// Pre-registered practice pairs (same practice, two families). Patterns are broad on purpose: they capture what each page
// says about the practice; agreement is decided later by the canonical structured-key rule, never by these regexes.
const SIZE = (p: string) => [{ id: p + "_SIZE", sentence: S, question: "What does the guide say about the size of a change / pull request?", re: /^(?=.*\b(?:small|smaller|size|large)\b)(?=.*\b(?:CLs?|change\w*|pull requests?|PRs?)\b)/i },
  { id: p + "_SIZE_WHY", sentence: S, question: "Why does the guide recommend small changes?", re: /^(?=.*\b(?:small|smaller)\b)(?=.*\b(?:review\w*|faster|quick\w*|easier|bugs?)\b)/i }];
const SPEED = (p: string) => [{ id: p + "_SPEED", sentence: S, question: "How quickly should a code review be done?", re: /^(?=.*\breview\w*\b)(?=.*\b(?:day|days|hours?|quickly|promptly|timely|fast|speed)\b)/i }];
const TESTS = (p: string) => [{ id: p + "_TESTS", sentence: S, question: "What does the guide say about tests in a change under review?", re: /^(?=.*\btests?\b)(?=.*\b(?:change\w*|CLs?|pull requests?|PRs?|code)\b)/i }];
const DESIGN = (p: string) => [{ id: p + "_DESIGN", sentence: S, question: "What does the guide say reviewers should look at first / most?", re: /^(?=.*\b(?:design|architecture)\b)(?=.*\breview\w*\b)/i }];
const TARGETS = Object.freeze([
  T(G + "developer/small-cls.html", "Google", "code review", "ODG mission sizing — small changes (corroboration pair)", "OFFICIAL_DOCUMENTATION", [...SIZE("G"), ...TESTS("G")]),
  T(G + "reviewer/speed.html", "Google", "code review", "ODG review gate — review latency (corroboration pair)", "OFFICIAL_DOCUMENTATION", SPEED("G")),
  T(G + "reviewer/looking-for.html", "Google", "code review", "ODG review checklist (corroboration pair)", "OFFICIAL_DOCUMENTATION", [...DESIGN("G"), ...TESTS("GL")]),
  T(M + "code-reviews/pull-requests/", "Microsoft", "code review", "ODG mission sizing — small changes (corroboration pair)", "OFFICIAL_DOCUMENTATION", [...SIZE("M"), ...TESTS("M")]),
  T(M + "code-reviews/process-guidance/reviewer-guidance/", "Microsoft", "code review", "ODG review gate — reviewer guidance (corroboration pair)", "OFFICIAL_DOCUMENTATION", [...SPEED("MR"), ...DESIGN("MR"), ...TESTS("MR")]),
  T(M + "code-reviews/process-guidance/author-guidance/", "Microsoft", "code review", "ODG review gate — author guidance (corroboration pair)", "OFFICIAL_DOCUMENTATION", [...SIZE("MA"), ...TESTS("MA")]),
  T(M + "code-reviews/", "Microsoft", "code review", "ODG review gate — review goals (corroboration pair)", "OFFICIAL_DOCUMENTATION", [...SPEED("MC"), ...SIZE("MC")]),
]);
const HEADER = "V19-MEM-1 — corroboration Radar collection under " + GRANT_PATH + ". Fetched by ODG's OWN chain (odg-v16-claude-code-research.runResearch → research-budget/research-governor/bounded-http-client.validateUrl+get with ODG_RADAR_LIVE=1), NOT by a provider WebFetch tool. Quotes extracted by the DETERMINISTIC pattern extractor of runtime/bin/odg-v158-collection-run.ts (no model). Purpose: pairs of independent publisher families on the same practice so the canonical assessClaim can decide CORROBORATED (or not).";
const CONFIG = Object.freeze({ targets: TARGETS, grantPath: GRANT_PATH, collectionPath: COLLECTION_PATH, header: HEADER });

async function main(): Promise<void> {
  const r = await C.collect({ live: process.env.ODG_RADAR_LIVE === "1", config: CONFIG });
  process.stdout.write(JSON.stringify(r, null, 2) + "\n");
  if (process.env.ODG_RADAR_LIVE === "1" && !r.written) process.exit(2);
}
if (require.main === module) main().catch((e) => { process.stderr.write("v19 corroboration collection error: " + ((e && e.message) || e) + "\n"); process.exit(1); });
module.exports = { TARGETS, CONFIG, GRANT_PATH, COLLECTION_PATH };
export {};
