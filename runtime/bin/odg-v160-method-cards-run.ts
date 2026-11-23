#!/usr/bin/env node
"use strict";
/* V16.0 — METHOD CARDS + selection-matrix INPUT from the PINNED V160 engineering-practices collection. OFFLINE, deterministic.
 * Every card field has an explicit basis:
 *   QUOTE             — the field IS one or more verbatim quotes, resolved here from the pinned collection by patternId (never
 *                       retyped), each with the claim's epistemic status from V160_PRACTICES_KNOWLEDGE.json;
 *   COLLECTION_RECORD — a fact about the collection itself (e.g. a pre-registered question that matched nothing);
 *   HYPOTHESIS        — ODG's own reading/mapping (primitives, components, conditions, the demonstrating test): NOT evidence.
 * The selection-matrix input carries NO score (a score would be invented): only the recorded epistemic statuses, counts,
 * the primitives (HYPOTHESIS) and whether the mapped ODG files exist. demonstrated is always false (no test has run).
 * Usage: [--write] | [--check] (exit 1 on drift). */
const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..", "..");
const ATT = require("../core/odg-knowledge-attestation.js");
const CA = require("../core/capability-attribution.js");   // canonical list of the 9 primitives (no 10th)

const COLLECTION_PATH = "docs/odg/evidence/V160_PRACTICES_COLLECTION.json";
const KNOWLEDGE_PATH = "docs/odg/evidence/V160_PRACTICES_KNOWLEDGE.json";
const REGISTRY_PATH = "docs/odg/evidence/COLLECTION_REGISTRY.json";
const OUT_PATH = "docs/odg/evidence/V160_METHOD_CARDS.json";
const H = (text: string) => ({ basis: "HYPOTHESIS", text });
const Q = (...patternIds: string[]) => ({ basis: "QUOTE", patternIds });

/* AUTHORED card specs. Quote-backed fields reference pattern ids ONLY; free text is always HYPOTHESIS. */
const CARDS = Object.freeze([
  { id: "MC-CR-APPROVAL-STANDARD", title: "Approve when the change improves overall code health (not when perfect)", practiceArea: "code review",
    problemSolved: Q("G_STD_PURPOSE"), howItWorks: Q("G_STD_HEALTH", "G_STD_PERFECT", "G_STD_FACTS"),
    conditions: [H("a measurable code-health signal exists for the change (the recorded quotes give no metric or threshold)")],
    limits: [H("'improves code health' is a reviewer judgement in the quotes; ODG would need an explicit, measured proxy")],
    primitives: ["POLICY", "EVIDENCE"], odgComponents: ["runtime/core/code-review-service.ts", "runtime/core/evaluator-independence.ts"],
    demonstrationTest: H("a review gate ACCEPTS a change that raises a measured health proxy while carrying only non-blocking remarks, and REJECTS one that lowers it; both decisions cite the measured evidence") },
  { id: "MC-CR-LATENCY", title: "Respond to a review request within one business day", practiceArea: "code review",
    problemSolved: Q("G_SPD_SLOW"), howItWorks: Q("G_SPD_ONEDAY", "G_SPD_FOCUS"),
    conditions: [{ basis: "QUOTE", patternIds: ["G_SPD_FOCUS"], note: "stated condition: not in the middle of a focused task" }],
    limits: [H("a maximum response time, not a review-completion time; ODG reviewers are agents whose 'business day' needs an explicit clock")],
    primitives: ["ALLOCATOR", "POLICY"], odgComponents: ["runtime/core/odg-mission-scheduler.ts"],
    demonstrationTest: H("a review-queue monitor flags every review request without a first response after the configured window, and the flag is recorded as evidence (fake clock, offline)") },
  { id: "MC-SMALL-CHANGES", title: "Keep each change one self-contained unit, with its tests", practiceArea: "code review",
    problemSolved: H("small changes are easier to review (the recorded list item 'Reviewed more quickly.' is too short to verify as a citation)"),
    howItWorks: Q("G_SMALL_ONE", "G_SMALL_TESTS", "G_SMALL_SIZE"),
    conditions: [H("ODG missions can be split along write-set boundaries")],
    limits: [{ basis: "QUOTE", patternIds: ["G_SMALL_SIZE"], note: "no hard rule; size thresholds are left to the reviewer's judgement" }],
    primitives: ["CONTRACT", "ALLOCATOR"], odgComponents: ["runtime/core/odg-writeset-contention.ts", "runtime/core/patch-executor.ts"],
    demonstrationTest: H("a mission contract whose diff exceeds a configured line budget, or that changes code without a related test, is flagged for split / reviewer override before execution") },
  { id: "MC-REVIEW-FOCUS", title: "Review design first; reject over-engineering; require appropriate tests", practiceArea: "code review",
    problemSolved: H("reviews that only check style miss design-level and test-coverage defects"),
    howItWorks: Q("G_LOOK_DESIGN", "G_LOOK_OVERENG", "G_LOOK_TESTS"),
    conditions: [H("a design description is available to the reviewer (e.g. the mission contract)")],
    limits: [{ basis: "COLLECTION_RECORD", text: "the functionality question was recorded only as a question ('Does this CL do what the developer intended?') — no key authored" }],
    primitives: ["EVIDENCE", "POLICY"], odgComponents: ["runtime/core/code-review-service.ts"],
    demonstrationTest: H("the review checklist emitted for a change contains design, over-engineering and test items, and a change adding unused generic code is flagged") },
  { id: "MC-PEER-REVIEW-EVERY-PR", title: "Peer review on every pull request", practiceArea: "code review",
    problemSolved: H("unreviewed changes reach shared branches"), howItWorks: Q("M_CR_PR"),
    conditions: [H("the reviewer is independent of the author (author ≠ reviewer)")],
    limits: [{ basis: "COLLECTION_RECORD", text: "the playbook's review goals, automation and turnaround questions matched nothing on the fetched page (M_CR_GOAL, M_CR_AUTO, M_CR_TIME)" }],
    primitives: ["POLICY", "IDENTITY"], odgComponents: ["runtime/core/evaluator-independence.ts"],
    demonstrationTest: H("a merge request authored and approved by the same identity is refused; one approved by an independent identity passes") },
  { id: "MC-CI-BEFORE-REVIEW", title: "CI must pass (protected main) before code review starts; failed builds report logs", practiceArea: "continuous integration",
    problemSolved: Q("M_CI_DEF"), howItWorks: Q("M_CI_MAIN", "M_CI_BROKEN"),
    conditions: [H("branch protection is configurable on the repository (on this repo main is PR-protected with a required CI check)")],
    limits: [{ basis: "QUOTE", patternIds: ["M_CI_GATE"], note: "the linter/style gate is only a cross-reference to another section (fragment, CANDIDATE)" }],
    primitives: ["POLICY", "EVIDENCE", "EXECUTOR"], odgComponents: ["runtime/bin/odg-test-report.ts", "runtime/core/validation-engine.ts"],
    demonstrationTest: H("a review request on a change whose CI status is not 'passed' is refused, and a failed build record always carries its logs") },
  { id: "MC-MERGE-QUEUE", title: "Merge queue: group PRs, build+test them, never update main to a failing commit", practiceArea: "delivery engineering",
    problemSolved: H("concurrent merges can each pass alone yet break main together"), howItWorks: Q("GH_MQ_MAIN"),
    conditions: [{ basis: "QUOTE", patternIds: ["GH_MQ_SCALE", "GH_MQ_WHAT"], note: "adopted progressively: small internal repositories first, phased rollout" }],
    limits: [{ basis: "QUOTE", patternIds: ["GH_MQ_TRAINS"], note: "earlier approach recorded; what made it insufficient is not in the recorded quotes" }],
    primitives: ["RESOLVER", "EXECUTOR", "RECOVERY", "STATE"], odgComponents: ["runtime/core/odg-writeset-contention.ts", "runtime/core/mission-scheduler.ts"],
    demonstrationTest: H("two changes that pass separately but fail together are queued; the combined candidate fails, main is not advanced, and the failing group is split and retried") },
  { id: "MC-LESSONS-LEARNED", title: "Document lessons learned from failures in reports", practiceArea: "systems engineering",
    problemSolved: H("the same failure causes recur when lessons are not captured"), howItWorks: Q("N_LESSONS"),
    conditions: [H("failures/incidents are recorded with causes")],
    limits: [{ basis: "COLLECTION_RECORD", text: "only the handbook INDEX page is inside the admitted prefix; verification & validation, technical review and risk-management questions matched nothing there (N_VV, N_REVIEW, N_RISK)" }],
    primitives: ["EVIDENCE", "RECOVERY"], odgComponents: ["runtime/core/odg-lesson-decision-loop.ts", "runtime/core/incident-recurrence.ts"],
    demonstrationTest: H("a recurring incident class is linked to a recorded lesson and the next mission of that class is required to cite it") },
]);

function loadJson(p: string): any { return JSON.parse(fs.readFileSync(path.join(ROOT, p), "utf8")); }

/** build(col, knowledge, registry, exists?): PURE given its inputs. Fails closed on an unpinned collection or an unknown id. */
function build(col: any, knowledge: any, registry: any, exists?: (p: string) => boolean): any {
  const pin = (registry.collections || []).find((c: any) => c.path === COLLECTION_PATH);
  if (!pin || ATT.contentSha256(col) !== pin.sha256) throw new Error("V160 collection not pinned (digest ≠ COLLECTION_REGISTRY)");
  if (knowledge.collectionSha256 !== pin.sha256) throw new Error("knowledge file was not derived from the pinned collection");
  const fileExists = typeof exists === "function" ? exists : (p: string) => fs.existsSync(path.join(ROOT, p));
  const quote: Record<string, any> = {};
  for (const s of col.sources) (s.quotePatterns || []).forEach((id: string, i: number) => { quote[id] = { url: s.url, org: s.org, quote: s.quotes[i], sha256: s.sha256 }; });
  const status: Record<string, string> = {};
  for (const r of knowledge.results) { const m = String(r.query).match(/::\s*([A-Z_]+)$/); if (m) status[m[1]] = r.dimensions.epistemic; }
  const resolve = (f: any) => {
    if (!f || typeof f !== "object") throw new Error("card field missing");
    if (f.basis === "HYPOTHESIS" || f.basis === "COLLECTION_RECORD") return { ...f };
    if (f.basis !== "QUOTE") throw new Error("unknown basis " + f.basis);
    return { basis: "QUOTE", ...(f.note ? { note: f.note } : {}), quotes: f.patternIds.map((id: string) => { const q = quote[id]; if (!q) throw new Error("pattern " + id + " has no pinned quote"); return { patternId: id, url: q.url, quote: q.quote, pageSha256: q.sha256, epistemic: status[id] || "UNKNOWN" }; }) };
  };
  const cards = CARDS.map((c: any) => {
    if (!c.primitives.every((p: string) => CA.PRIMITIVES.includes(p))) throw new Error(c.id + ": unknown primitive");
    const how = resolve(c.howItWorks);
    const orgs = Array.from(new Set<string>(how.quotes.map((q: any) => quote[q.patternId].org)));
    const fields = [c.problemSolved, c.howItWorks, ...c.conditions, ...c.limits].map(resolve);
    const quoted = fields.flatMap((f: any) => f.quotes || []);
    return {
      id: c.id, title: { basis: "HYPOTHESIS", text: c.title }, org: orgs.join(", "), practiceArea: c.practiceArea,
      source: Array.from(new Set<string>(how.quotes.map((q: any) => q.url))).map((u: string) => ({ url: u, consultedDate: col.consultedDate })),
      problemSolved: resolve(c.problemSolved), howItWorks: how, conditions: c.conditions.map(resolve), limits: c.limits.map(resolve),
      primitives: { basis: "HYPOTHESIS", values: c.primitives.slice() },
      odgComponents: { basis: "HYPOTHESIS", files: c.odgComponents.map((f: string) => ({ path: f, exists: fileExists(f) })) },
      demonstrationTest: { ...c.demonstrationTest, status: "PROPOSED — not implemented, not run" },
      matrixInput: {
        howItWorksEpistemic: how.quotes.map((q: any) => q.epistemic),
        quotedFields: fields.filter((f: any) => f.basis === "QUOTE").length, hypothesisFields: fields.filter((f: any) => f.basis === "HYPOTHESIS").length,
        supportedQuotes: quoted.filter((q: any) => q.epistemic === "SUPPORTED").length, candidateOrUnknownQuotes: quoted.filter((q: any) => q.epistemic !== "SUPPORTED").length,
        primitives: c.primitives.slice(), odgComponentsExist: c.odgComponents.every((f: string) => fileExists(f)), demonstrated: false, score: "NOT_MEASURED",
      },
    };
  });
  const used = new Set<string>(); for (const c of CARDS) for (const f of [c.problemSolved, c.howItWorks, ...c.conditions, ...c.limits]) for (const id of ((f as any).patternIds || [])) used.add(id);
  return {
    lot: "V16.0 — METHOD CARDS + selection-matrix input from the pinned V160 engineering-practices collection",
    inputs: { collection: COLLECTION_PATH, collectionSha256: pin.sha256, knowledge: KNOWLEDGE_PATH, consultedDate: col.consultedDate },
    basisLegend: { QUOTE: "verbatim pinned quote(s), resolved by patternId; epistemic status from the knowledge file", COLLECTION_RECORD: "fact about the collection itself", HYPOTHESIS: "ODG's own reading/mapping — NOT evidence" },
    primitivesVocabulary: CA.PRIMITIVES.slice(),
    cards,
    notCarded: {
      quotesNotUsed: Object.keys(quote).filter((id) => !used.has(id)).sort(),
      pagesWithoutQuotes: col.sources.filter((s: any) => !(s.quotes || []).length).map((s: any) => ({ url: s.url, org: s.org, reason: "no pre-registered pattern matched (NOT_MEASURED)" })),
    },
    honesty: [
      "no card is a fact: quoted statements are at most SUPPORTED ('what the publisher states'), single-source, never CORROBORATED",
      "primitives, ODG components, conditions and demonstrating tests are HYPOTHESES (ODG mapping), not findings; no demonstrating test has been implemented or run",
      "the selection matrix input carries no score (NOT_MEASURED) — ranking needs measured ODG outcomes",
    ],
  };
}

function main(): void {
  const argv = process.argv.slice(2);
  const json = JSON.stringify(build(loadJson(COLLECTION_PATH), loadJson(KNOWLEDGE_PATH), loadJson(REGISTRY_PATH)), null, 2) + "\n";
  if (argv.includes("--check")) {
    const cur = fs.existsSync(path.join(ROOT, OUT_PATH)) ? fs.readFileSync(path.join(ROOT, OUT_PATH), "utf8") : null;
    if (cur !== json) { process.stderr.write("DRIFT: " + OUT_PATH + "\n"); process.exit(1); }
    process.stdout.write("OK: " + OUT_PATH + " re-derives\n"); return;
  }
  if (argv.includes("--write")) fs.writeFileSync(path.join(ROOT, OUT_PATH), json);
  const o = JSON.parse(json);
  process.stdout.write(o.cards.map((c: any) => `${c.id} org=${c.org} how=${c.matrixInput.howItWorksEpistemic.join("/")} prim=${c.matrixInput.primitives.join("+")} comps=${c.matrixInput.odgComponentsExist}`).join("\n") + "\nnotCarded=" + JSON.stringify(o.notCarded) + "\n");
}
if (require.main === module) main();
module.exports = { CARDS, build, OUT_PATH, COLLECTION_PATH, KNOWLEDGE_PATH };
export {};
