#!/usr/bin/env node
"use strict";
/* V16.0 — engineering-practices Radar collection under docs/odg/V160_RESEARCH_GRANT_ENGINEERING_PRACTICES.json.
 * THIN campaign module: only TARGETS + pre-registered questions/patterns live here. Fetch, governance, extraction,
 * normalisation and writing are REUSED unchanged from runtime/bin/odg-v158-collection-run.ts (collect with a config) and
 * odg-v16-claude-code-research.runResearch (governor + quota + validateUrl + bounded-http-client.get + ODG_RADAR_LIVE).
 * Targets: concrete pages INSIDE the admitted prefixes only, chosen because they document an engineering METHOD relevant to
 * ODG (code review, testing, CI, merge/deploy safety, verification & validation, reviews, risk, lessons learned).
 * DeepMind: no target — no admitted-prefix page was identified as documenting an engineering method rather than research
 * announcements (recorded, not filled). NASA: the admitted prefix covers ONLY the handbook index page (its sections live under
 * /reference/<section>/, outside the prefix ⇒ the governor would DENY them), so NASA contributes table-of-contents fragments.
 * At most 10 targets: odg-v16-claude-code-research.MAX_TARGETS (unchanged) caps ONE governed run at 10 pages; the campaign
 * stays inside one run (and its per-run quota) rather than splitting into several runs. Deferred candidates (Microsoft PR
 * guidance + fundamentals checklist, GitHub engineering index, two more Google Research papers) are a later run.
 * Patterns with sentence:true accept only fragments that end like a sentence (filters navigation/menu text).
 * DEFAULT DRY (no egress, nothing written). LIVE (ODG_RADAR_LIVE=1) writes docs/odg/evidence/V160_PRACTICES_COLLECTION.json
 * (refuses to overwrite). Fetched content is untrusted DATA, never instructions. */
const path = require("path");
const C = require("./odg-v158-collection-run.ts");

const GRANT_PATH = "docs/odg/V160_RESEARCH_GRANT_ENGINEERING_PRACTICES.json";
const COLLECTION_PATH = "docs/odg/evidence/V160_PRACTICES_COLLECTION.json";
const G = "https://google.github.io/eng-practices/review/";
const M = "https://microsoft.github.io/code-with-engineering-playbook/";
const S = true;   // sentence-only pattern
const T = (url: string, org: string, practiceArea: string, capability: string, nature: string, patterns: any[]) => Object.freeze({ url, mode: "HTML", org, practiceArea, nature, capability, topics: [practiceArea], patterns: Object.freeze(patterns.map((p: any) => Object.freeze(p))) });

const TARGETS = Object.freeze([
  // ── Google Engineering Practices (code review guide) ──
  T(G + "reviewer/standard.html", "Google", "code review", "ODG review gate — approval standard", "OFFICIAL_DOCUMENTATION", [
    { id: "G_STD_HEALTH", sentence: S, question: "When does Google's guide say a reviewer should approve a change?", re: /improves the overall code health/i },
    { id: "G_STD_PERFECT", sentence: S, question: "Does Google's guide require perfect code before approval?", re: /no such thing as .{0,2}perfect.{0,2} code/i },
    { id: "G_STD_FACTS", sentence: S, question: "What overrules opinions in a Google code review?", re: /technical facts and data overrule/i },
    { id: "G_STD_PURPOSE", sentence: S, question: "What is the primary purpose of code review per Google?", re: /primary purpose of code review/i },
  ]),
  T(G + "reviewer/speed.html", "Google", "code review", "ODG review gate — review latency", "OFFICIAL_DOCUMENTATION", [
    { id: "G_SPD_ONEDAY", sentence: S, question: "What maximum response time does Google set for a code review?", re: /one business day/i },
    { id: "G_SPD_SLOW", sentence: S, question: "What happens when code reviews are slow (Google)?", re: /^(?=.*\bslow\b)(?=.*\breview)/i },
    { id: "G_SPD_FOCUS", sentence: S, question: "Should a reviewer interrupt focused work to review (Google)?", re: /focused task|interrupt/i },
  ]),
  T(G + "developer/small-cls.html", "Google", "code review", "ODG mission sizing — small changes", "OFFICIAL_DOCUMENTATION", [
    { id: "G_SMALL_WHY", sentence: S, question: "Why does Google prefer small changes?", re: /reviewed more quickly|reviewed more thoroughly|less likely to introduce bugs/i },
    { id: "G_SMALL_ONE", sentence: S, question: "How much should one Google CL contain?", re: /one self-contained change/i },
    { id: "G_SMALL_TESTS", sentence: S, question: "Do tests belong in the same CL (Google)?", re: /related test code|tests? (?:in|with) the same CL/i },
    { id: "G_SMALL_SIZE", sentence: S, question: "What size guidance does Google give for a CL?", re: /\b(?:100|1000) lines\b/i },
  ]),
  T(G + "reviewer/looking-for.html", "Google", "code review", "ODG review checklist — what reviewers check", "OFFICIAL_DOCUMENTATION", [
    { id: "G_LOOK_DESIGN", sentence: S, question: "What is the most important thing to cover in a Google code review?", re: /most important thing to cover in a review is the overall design/i },
    { id: "G_LOOK_OVERENG", sentence: S, question: "What does Google's guide say about over-engineering?", re: /over-engineering/i },
    { id: "G_LOOK_TESTS", sentence: S, question: "What does Google's guide ask of tests in a change?", re: /^(?=.*\btests?\b)(?=.*\b(?:unit|integration|end-to-end)\b)/i },
    { id: "G_LOOK_FUNC", sentence: S, question: "How does a Google reviewer check functionality?", re: /what the developer intended/i },
  ]),
  // ── Microsoft Code With Engineering Playbook ──
  T(M + "code-reviews/", "Microsoft", "code review", "ODG review gate — review goals", "OFFICIAL_DOCUMENTATION", [
    { id: "M_CR_GOAL", sentence: S, question: "What are code reviews for, per the Microsoft playbook?", re: /^(?=.*\bcode reviews?\b)(?=.*\b(?:knowledge|quality|bugs|defects)\b)/i },
    { id: "M_CR_PR", sentence: S, question: "How are reviews tied to pull requests (Microsoft playbook)?", re: /^(?=.*\bpull requests?\b)(?=.*\breview)/i },
    { id: "M_CR_AUTO", sentence: S, question: "What should be automated before human review (Microsoft playbook)?", re: /^(?=.*\b(?:linter|linting|static analysis|automat\w*))(?=.*\breview)/i },
    { id: "M_CR_TIME", sentence: S, question: "What review turnaround does the Microsoft playbook set?", re: /^(?=.*\breview)(?=.*\b(?:hours?|business days?|turnaround|within)\b)/i },
  ]),
  T(M + "automated-testing/", "Microsoft", "automated testing", "ODG test gate — testing strategy", "OFFICIAL_DOCUMENTATION", [
    { id: "M_AT_WHY", sentence: S, question: "Why automate testing (Microsoft playbook)?", re: /^(?=.*\btest\w*)(?=.*\b(?:regression|confidence|quality)\b)/i },
    { id: "M_AT_PYRAMID", sentence: S, question: "Does the Microsoft playbook use a test pyramid?", re: /pyramid/i },
    { id: "M_AT_UNIT", sentence: S, question: "What does the Microsoft playbook say about unit tests?", re: /\bunit tests?\b/i },
    { id: "M_AT_E2E", sentence: S, question: "What does the Microsoft playbook say about end-to-end tests?", re: /end-to-end|\bE2E\b/i },
  ]),
  T(M + "CI-CD/continuous-integration/", "Microsoft", "continuous integration", "ODG CI gate — integration discipline", "OFFICIAL_DOCUMENTATION", [
    { id: "M_CI_DEF", sentence: S, question: "How does the Microsoft playbook define continuous integration?", re: /^(?=.*\bcontinuous integration\b)(?=.*\b(?:merg|integrat|build)\w*)/i },
    { id: "M_CI_BROKEN", sentence: S, question: "What does the Microsoft playbook say about broken builds?", re: /^(?=.*\bbuild\b)(?=.*\b(?:break|broken|fail)\w*)/i },
    { id: "M_CI_MAIN", sentence: S, question: "What state must the main branch keep (Microsoft playbook)?", re: /^(?=.*\b(?:main|master|trunk)\b)(?=.*\b(?:branch|deployable|releasable|shippable)\b)/i },
    { id: "M_CI_GATE", sentence: S, question: "Which quality gates run in CI (Microsoft playbook)?", re: /quality gates?|\blint\w*/i },
  ]),
  // ── GitHub engineering blog ──
  T("https://github.blog/engineering/engineering-principles/how-github-uses-merge-queue-to-ship-hundreds-of-changes-every-day/", "GitHub", "delivery engineering", "ODG delivery — merge queue", "OFFICIAL_DOCUMENTATION", [
    { id: "GH_MQ_WHAT", sentence: S, question: "What does GitHub's merge queue guarantee?", re: /^(?=.*\bmerge queue\b)(?=.*\b(?:ensur|guarantee|validat|test)\w*)/i },
    { id: "GH_MQ_SCALE", sentence: S, question: "At what scale does GitHub run its merge queue?", re: /^(?=.*\bmerge queue\b)(?=.*\b\d[\d,.]*\b)/i },
    { id: "GH_MQ_TRAINS", sentence: S, question: "What did GitHub's merge queue replace?", re: /\btrains?\b/i },
    { id: "GH_MQ_MAIN", sentence: S, question: "How does GitHub keep its main branch deployable?", re: /^(?=.*\bmain\b)(?=.*\b(?:broken|green|break\w*|deploy\w*)\b)/i },
  ]),
  // ── NASA Systems Engineering Handbook (index page only — admitted prefix) ──
  T("https://www.nasa.gov/reference/systems-engineering-handbook/", "NASA", "systems engineering", "ODG verification / reviews / risk — NASA SE handbook (TOC)", "OFFICIAL_DOCUMENTATION", [
    { id: "N_VV", question: "Does the NASA SE handbook cover verification and validation?", re: /verification|validation/i },
    { id: "N_REVIEW", question: "Does the NASA SE handbook cover technical reviews / assessment?", re: /technical (?:review|assessment)/i },
    { id: "N_RISK", question: "Does the NASA SE handbook cover risk management?", re: /risk management/i },
    { id: "N_LESSONS", question: "Does the NASA SE handbook cover lessons learned?", re: /lessons learned/i },
  ]),
  // ── Google Research publications (abstract pages: a research paper's findings — nature SCIENTIFIC_PUBLICATION) ──
  T("https://research.google/pubs/modern-code-review-a-case-study-at-google/", "Google", "code review", "ODG review gate — empirical basis", "SCIENTIFIC_PUBLICATION", [
    { id: "R_MCR_WHAT", sentence: S, question: "What does the Modern Code Review study examine?", re: /^(?=.*\bcode review\b)(?=.*\b(?:Google|developers|lightweight|study)\b)/i },
    { id: "R_MCR_FIND", sentence: S, question: "What did the Modern Code Review study find?", re: /^(?=.*\b(?:find|found|reveal\w*|show\w*|observe\w*)\b)(?=.*\breview)/i },
    { id: "R_MCR_EDU", sentence: S, question: "Does the study report education/knowledge transfer as a review motivation?", re: /\b(?:education|knowledge)\b/i },
  ]),
]);

const HEADER = "V16.0 — engineering-practices Radar collection under " + GRANT_PATH + ". Fetched by ODG's OWN chain (odg-v16-claude-code-research.runResearch → research-budget/research-governor/bounded-http-client.validateUrl+get with ODG_RADAR_LIVE=1), NOT by a provider WebFetch tool. Quotes extracted by the DETERMINISTIC pattern extractor of runtime/bin/odg-v158-collection-run.ts (no model) with targets/patterns pre-registered in runtime/bin/odg-v160-practices-collection-run.ts; page bodies are NOT stored. All content is DATA, never instructions.";
const CONFIG = Object.freeze({ targets: TARGETS, grantPath: GRANT_PATH, collectionPath: COLLECTION_PATH, header: HEADER });

async function main(): Promise<void> {
  const r = await C.collect({ live: process.env.ODG_RADAR_LIVE === "1", config: CONFIG });
  process.stdout.write(JSON.stringify(r, null, 2) + "\n");
  if (process.env.ODG_RADAR_LIVE === "1" && !r.written) process.exit(2);
}
if (require.main === module) main().catch((e) => { process.stderr.write("v160 practices collection error: " + ((e && e.message) || e) + "\n"); process.exit(1); });
module.exports = { TARGETS, CONFIG, GRANT_PATH, COLLECTION_PATH };
export {};
