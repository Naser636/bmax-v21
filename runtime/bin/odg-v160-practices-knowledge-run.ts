#!/usr/bin/env node
"use strict";
/* V16.0 — assess the V160 engineering-practices collection (docs/odg/evidence/V160_PRACTICES_COLLECTION.json) with the
 * CANONICAL knowledge path, REUSING runtime/bin/odg-v158-knowledge-run.ts derive()/main() with a V160 config (no second
 * engine): attestCollection (repo pin) → assessClaim → toMemory / admissible / usableFor. OFFLINE, deterministic.
 * Structured keys are AUTHORED from the recorded quotes AFTER the live collection (never before, never model-inferred);
 * fragment:true marks title/heading/TOC/index/list fragments (capped at CANDIDATE by assessClaim). A cycle without an authored
 * key stays UNKNOWN (cannot ground) — reported, never filled in. Nature per target: OFFICIAL_DOCUMENTATION for guides/
 * playbooks/handbook/blog, SCIENTIFIC_PUBLICATION for research.google paper abstracts (findings need methodology review).
 * Usage: [--write] | [--check] (exit 1 on drift). */
const KR = require("./odg-v158-knowledge-run.ts");
const V160 = require("./odg-v160-practices-collection-run.ts");

const OUT_PATH = "docs/odg/evidence/V160_PRACTICES_KNOWLEDGE.json";
// pattern id → key, AUTHORED from the committed quotes of the pinned LIVE collection (2026-11-23). VALUE = a contiguous phrase
// of the citation; SUBJECT words in the citation or the recorded page title (grounding enforced by assessClaim).
const STRUCT: Record<string, any> = {
  // Google Engineering Practices
  G_STD_HEALTH: { subject: "reviewers", relation: "states", value: "favor approving a CL once it is in a state where it definitely improves the overall code health of the system being worked on", scope: "Google eng-practices — The Standard of Code Review", qualifiers: ["same quote: even if the CL is not perfect"] },
  G_STD_PERFECT: { subject: "code", relation: "states", value: "no such thing as perfect code", scope: "Google eng-practices — The Standard of Code Review", qualifiers: ["same quote: there is only better code"] },
  G_STD_FACTS: { subject: "Technical facts and data", relation: "states", value: "overrule opinions and personal preferences", scope: "Google eng-practices — The Standard of Code Review", qualifiers: [] },
  G_STD_PURPOSE: { subject: "primary purpose of code review", relation: "states", value: "the overall code health of Google code base is improving over time", scope: "Google eng-practices — The Standard of Code Review", qualifiers: ["stated for Google's code base"] },
  G_SPD_ONEDAY: { subject: "code review request", relation: "states", value: "one business day is the maximum time it should take to respond", scope: "Google eng-practices — Speed of Code Reviews", qualifiers: ["maximum, not target"] },
  G_SPD_SLOW: { subject: "reviews", relation: "states", value: "increased pressure to allow developers to submit CLs that are not as good as they could be", scope: "Google eng-practices — Speed of Code Reviews", qualifiers: ["one of the stated consequences of slow reviews"] },
  G_SPD_FOCUS: { subject: "code review", relation: "states", value: "do a code review shortly after it comes in", scope: "Google eng-practices — Speed of Code Reviews", qualifiers: ["condition in the same quote: if not in the middle of a focused task"] },
  G_SMALL_WHY: { fragment: true, subject: "Small CLs", relation: "states", value: "reviewed more quickly", scope: "Google eng-practices — Small CLs (list item)", qualifiers: ["bullet-list fragment: one listed benefit, no context"] },
  G_SMALL_ONE: { subject: "right size for a CL", relation: "states", value: "one self-contained change", scope: "Google eng-practices — Small CLs", qualifiers: ["'In general' in the same quote"] },
  G_SMALL_TESTS: { subject: "CL", relation: "states", value: "include related test code", scope: "Google eng-practices — Small CLs", qualifiers: [] },
  G_SMALL_SIZE: { subject: "CL", relation: "states", value: "100 lines is usually a reasonable size for a CL", scope: "Google eng-practices — Small CLs", qualifiers: ["same quote: no hard and fast rules; 1000 lines usually too large; up to the reviewer's judgment"] },
  G_LOOK_DESIGN: { subject: "review", relation: "states", value: "the overall design of the CL", scope: "Google eng-practices — What to look for in a code review", qualifiers: ["stated as the most important thing to cover"] },
  G_LOOK_OVERENG: { subject: "over-engineering", relation: "states", value: "made the code more generic than it needs to be", scope: "Google eng-practices — What to look for in a code review", qualifiers: ["or added functionality not presently needed (same quote)"] },
  G_LOOK_TESTS: { subject: "tests", relation: "states", value: "unit, integration, or end-to-end tests as appropriate for the change", scope: "Google eng-practices — What to look for in a code review", qualifiers: [] },
  // G_LOOK_FUNC: the recorded quote is a QUESTION ("Does this CL do what the developer intended?") ⇒ no key authored.
  // Microsoft Code With Engineering Playbook
  M_CR_PR: { subject: "Developers", relation: "states", value: "conduct peer code reviews on every pull request", scope: "Microsoft playbook — Code Reviews", qualifiers: ["or check-in to a shared branch (same quote)"] },
  M_CI_DEF: { subject: "Continuous integration automation", relation: "states", value: "reduce build integration errors and maximize velocity", scope: "Microsoft playbook — Continuous Integration", qualifiers: [] },
  M_CI_BROKEN: { subject: "build pipeline run status", relation: "states", value: "reported as failed including relevant logs and stack traces", scope: "Microsoft playbook — Continuous Integration", qualifiers: ["condition: the build step fails"] },
  M_CI_MAIN: { subject: "main branch", relation: "states", value: "ensure that CI stage(s) have passed prior to starting a code review", scope: "Microsoft playbook — Continuous Integration", qualifiers: ["via protected branch policies (same quote)"] },
  M_CI_GATE: { fragment: true, subject: "Code Review recipes section", relation: "states", value: "suggestions for linters and preferred styles", scope: "Microsoft playbook — Continuous Integration (cross-reference)", qualifiers: ["cross-reference sentence pointing to another section; no gate is defined here"] },
  // GitHub engineering blog
  GH_MQ_WHAT: { subject: "merge queue", relation: "states", value: "small, internal repositories started testing merge queue", scope: "GitHub blog — merge queue post (history, mid-2021)", qualifiers: ["history: the monorepo moved later (same quote)"] },
  GH_MQ_SCALE: { subject: "monorepo", relation: "states", value: "rolling out changes to the process in phases", scope: "GitHub blog — merge queue post (rollout)", qualifiers: ["completed by 2023 per the same quote"] },
  GH_MQ_TRAINS: { subject: "GitHub", relation: "states", value: "solution at this time was trains", scope: "GitHub blog — merge queue post (earlier approach)", qualifiers: ["earlier approach; what replaced it is not in this quote"] },
  GH_MQ_MAIN: { subject: "merge queue", relation: "states", value: "ensures our main branch is never updated to a failing commit by enforcing branch protection rules", scope: "GitHub blog — merge queue post", qualifiers: ["forms groups of PRs and runs builds/tests via GitHub Actions (same quote)"] },
  // NASA Systems Engineering Handbook (index page)
  N_LESSONS: { subject: "Lessons learned on systems engineering", relation: "states", value: "documented in reports such as those by the NASA Integrated Action Team", scope: "NASA SE handbook index page", qualifiers: ["also CAIB and the Diaz Report (same quote)"] },
};
const NATURE_BY_URL: Record<string, string> = {}; for (const t of V160.TARGETS) NATURE_BY_URL[t.url] = t.nature;
/** natureOf(source): from the pre-registered target; an unknown url gets an INVALID nature ⇒ never SUPPORTED (fail-closed). */
function natureOf(source: any): string { return (source && NATURE_BY_URL[source.url]) || "UNREGISTERED_TARGET"; }

const CONFIG = Object.freeze({
  collectionPath: V160.COLLECTION_PATH, outPath: OUT_PATH, struct: STRUCT, natureOf, freshnessDays: {}, sourceMetaKeys: ["org", "practiceArea"],
  lot: "V16.0 — V160 engineering-practices Radar collection → canonical knowledge assessment (KI-V2 four dimensions)",
  limits: [
    "each claim is SINGLE-SOURCE (one page) ⇒ at most SUPPORTED ('what the publisher states'), never CORROBORATED on its own; same-family pages (e.g. two Google sites, or GitHub + Microsoft) never corroborate each other",
    "fragment quotes (titles, headings, TOC/index entries, checklist lines) are capped at CANDIDATE",
    "research.google abstracts are SCIENTIFIC_PUBLICATION ⇒ CANDIDATE until a methodology/reproducibility review",
    "structured keys authored by the provider from the recorded quotes, not model-inferred; quotes from a deterministic pattern extractor, verbatim w.r.t. the documented normalisation",
    "knowledge usefulness for ODG is NOT_MEASURED until a mission applies it",
  ],
});

function derive(col: any, registry: any): any { return KR.derive(col, registry, CONFIG); }
if (require.main === module) KR.main(CONFIG);
module.exports = { CONFIG, STRUCT, OUT_PATH, natureOf, derive };
export {};
