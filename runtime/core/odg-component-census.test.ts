#!/usr/bin/env node
"use strict";
/* Tests for odg-component-census (V361-A Chantier-1). Injected graph/scan/source ⇒ deterministic, zero fs. Proves: CONNECTED
 * needs a real non-test consumer; NO_CONSUMER carries a HEURISTIC why (demonstrator/app/producer/library/genuinely-dormant);
 * a consumer is never fabricated; the GENUINELY_DORMANT set is the actionable pool; no auto-activation. */
const M = require("./odg-component-census.js");
let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }
const rec = (r: any, m: string) => r.records.find((x: any) => x.module === m);

function main(): void {
  const graph = {
    modules: ["connected", "lib-x", "demo-run", "producer-y", "dormant-z", "app-used", "testonly", "connected.test"],
    consumers: { connected: ["campaign-engine"], "lib-x": [], "demo-run": [], "producer-y": [], "dormant-z": [], "app-used": [], testonly: ["testonly.test"] },
  };
  const src: Record<string, string> = {
    "lib-x": "module.exports = { helper, format };",                  // library (exports API)
    "producer-y": "const fs=require('fs'); fs.writeFileSync('out.json','x'); export {};", // producer artifact (no API export)
    "dormant-z": "function internal(){} // no exports surface",       // genuinely dormant candidate
    "app-used": "module.exports = { run };",
  };
  const r = M.census({ graph, scanned: [], sourceOf: (m: string) => src[m] || "", appText: 'import x from "./app-used.js"', binExists: () => false });

  check("CONNECTED needs a real non-test consumer", rec(r, "connected").status === "CONNECTED" && r.counts.CONNECTED === 1);
  check("TEST_ONLY: consumed only by a test ⇒ not CONNECTED", rec(r, "testonly").status === "TEST_ONLY");
  check("demonstrator-named NO_CONSUMER ⇒ why DEMONSTRATOR_NAMED", rec(r, "demo-run").status === "NO_CONSUMER" && rec(r, "demo-run").why === "DEMONSTRATOR_NAMED");
  check("exports-API-no-consumer ⇒ why EXPORTS_API_NO_CONSUMER (liveness UNKNOWN, NOT 'harmless library')", rec(r, "lib-x").why === "EXPORTS_API_NO_CONSUMER");
  check("producer (writes artifact, no API) ⇒ why PRODUCER_ARTIFACT_HEURISTIC", rec(r, "producer-y").why === "PRODUCER_ARTIFACT_HEURISTIC");
  check("app-referenced ⇒ why APP_REFERENCED_HEURISTIC", rec(r, "app-used").why === "APP_REFERENCED_HEURISTIC");
  check("no-API no-consumer ⇒ why NO_API_NO_CONSUMER (in the decision surface)", rec(r, "dormant-z").why === "NO_API_NO_CONSUMER" && r.decisionSurface.indexOf("dormant-z") >= 0);
  check("decisionSurface = exports-api-no-consumer + no-api-no-consumer (NOT a cleared bucket); excludes demo/app/producer", r.decisionSurface.indexOf("lib-x") >= 0 && r.decisionSurface.indexOf("dormant-z") >= 0 && r.decisionSurface.indexOf("demo-run") < 0 && r.decisionSurface.indexOf("app-used") < 0 && r.decisionSurface.indexOf("producer-y") < 0);
  check("test module excluded from the census", rec(r, "connected.test") === undefined && r.total === 7);
  check("noConsumerWhy reconciles (5 NO_CONSUMER modules classified)", Object.values(r.noConsumerWhy).reduce((a: any, b: any) => a + b, 0) === 5);

  // CHANTIER-2 connection: architecture-audit (previously dormant) is now a real consumer — fed the census metadata, it
  // surfaces circular dependencies over the REAL deps. Seed a cycle a->b->a and confirm it is detected.
  const cyc = { modules: ["a", "b", "x"], deps: { a: ["b"], b: ["a"], x: [] }, consumers: { a: ["campaign-engine"], b: ["campaign-engine"], x: ["campaign-engine"] } };
  const ra = M.census({ graph: cyc, scanned: [], sourceOf: () => "module.exports = { f };", hasTest: () => true });
  check("architecture-audit CONSUMED by census: a real circular dependency (a↔b) is detected", Array.isArray(ra.architecture.circularDeps) && ra.architecture.circularDeps.length >= 1);
  check("architecture findings present (duplicationGroups, trulyUnused numbers)", typeof ra.architecture.duplicationGroups === "number" && typeof ra.architecture.trulyUnused === "number");
  check("no cycle ⇒ empty circularDeps (honest, not fabricated)", r.architecture.circularDeps.length === 0);

  // V361-D P2-B: a REVIEWED duplication family (the 3 sealed-corpus evals) is annotated INTENTIONAL_SPECIALIZATION, while an
  // un-audited overlap stays UNREVIEWED. The raw NEEDS_REVIEW duplicationCandidate is NOT removed in either case.
  const evalExports = "module.exports = { evaluate, corpusProvenance, CORPUS, CORPUS_VERSION };";
  const otherExports = "module.exports = { alpha, beta };";
  const dupGraph = {
    modules: ["code-check-eval", "generative-repair-eval", "repair-eval", "widget-a", "widget-b", "solo"],
    deps: {}, consumers: Object.fromEntries(["code-check-eval", "generative-repair-eval", "repair-eval", "widget-a", "widget-b", "solo"].map((m) => [m, ["campaign-engine"]])),
  };
  const dsrc: Record<string, string> = {
    "code-check-eval": evalExports, "generative-repair-eval": evalExports, "repair-eval": evalExports,
    "widget-a": otherExports, "widget-b": otherExports, "solo": "module.exports = { only };",
  };
  const rd = M.census({ graph: dupGraph, scanned: [], sourceOf: (m: string) => dsrc[m] || "", hasTest: () => true });
  const reviews = rd.architecture.duplicationReviews;
  const evalReview = reviews.find((x: any) => x.members.indexOf("code-check-eval") >= 0);
  const widgetReview = reviews.find((x: any) => x.members.indexOf("widget-a") >= 0);
  check("eval family reviewed ⇒ verdict INTENTIONAL_SPECIALIZATION (members = the 3 evals)", !!evalReview && evalReview.reviewed === true && evalReview.verdict === "INTENTIONAL_SPECIALIZATION" && evalReview.members.length === 3);
  check("reviewed verdict carries reviewedBy + rationale (not an empty acknowledgement)", !!evalReview && evalReview.reviewedBy === "V361-D P2-B" && /DISTINCT subjects/.test(evalReview.rationale));
  check("un-audited overlap stays UNREVIEWED (not silently cleared)", !!widgetReview && widgetReview.reviewed === false && widgetReview.verdict === "UNREVIEWED");
  check("raw NEEDS_REVIEW duplicationCandidate is KEPT for the reviewed family (finding not suppressed)", rd.architecture.duplicationCandidates.some((d: any) => d.members.indexOf("code-check-eval") >= 0 && d.decision === "NEEDS_REVIEW"));

  // FAIL-CLOSED: if a genuinely-new module later acquires the SAME exports signature, the member-set changes, its reviewKey
  // no longer matches the registry, and the group must REVERT to UNREVIEWED (a new real duplicate re-opens the finding; it is
  // NEVER silently absorbed into the "INTENTIONAL_SPECIALIZATION" verdict). Exact member-set keying, not subset matching.
  const dupGraph4 = {
    modules: ["code-check-eval", "generative-repair-eval", "repair-eval", "sneaky-copy"],
    deps: {}, consumers: Object.fromEntries(["code-check-eval", "generative-repair-eval", "repair-eval", "sneaky-copy"].map((m) => [m, ["campaign-engine"]])),
  };
  const rd4 = M.census({ graph: dupGraph4, scanned: [], sourceOf: () => evalExports, hasTest: () => true });
  const review4 = rd4.architecture.duplicationReviews.find((x: any) => x.members.indexOf("code-check-eval") >= 0);
  check("a 4th module joining the same signature REVERTS the group to UNREVIEWED (not silently absorbed)", !!review4 && review4.members.length === 4 && review4.reviewed === false && review4.verdict === "UNREVIEWED");

  check("frozen + contract: no fabricated consumer; NO_CONSUMER over-reports (misses dynamic); decisionSurface≠cleared-bucket; no auto-activate",
    Object.isFrozen(r) &&
    /NEVER fabricated to inflate connectivity/.test(JSON.stringify(M.COMPONENT_CENSUS_CONTRACT.invariants)) &&
    /can MISS dynamic\/spawn\/app-dynamic consumers, so it OVER-reports orphans/.test(JSON.stringify(M.COMPONENT_CENSUS_CONTRACT.invariants)) &&
    /NOT a cleared bucket and NOT 'no orphans'/.test(JSON.stringify(M.COMPONENT_CENSUS_CONTRACT.invariants)) &&
    /never auto-activates/.test(JSON.stringify(M.COMPONENT_CENSUS_CONTRACT.invariants)) &&
    /change-impact-graph/.test(JSON.stringify(M.COMPONENT_CENSUS_CONTRACT.reuses)));

  process.stdout.write(`\n${failures === 0 ? "ALL PASS — odg-component-census (V361-A C1: classify core modules CONNECTED/BIN_ENTRY/TEST_ONLY/NO_CONSUMER+heuristic-why over the real require-graph; heuristic=evidence not verdict; GENUINELY_DORMANT=actionable pool needing a decision; no fabricated consumer, no auto-activation; composes graph+scan, no 2nd graph)" : failures + " FAIL"}\n`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
