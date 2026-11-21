#!/usr/bin/env node
"use strict";
/* Tests for odg-v360-dimension-coverage (V360 §10/§14 Boussole completeness). Injected compass + module/consumer checks ⇒
 * deterministic, zero fs. Proves: COVERED needs a real backing module (TRACKED or OPERATIONAL_UNTRACKED); an orphan module ⇒
 * THIN; no backing module ⇒ BLIND; coverage never claimed without evidence. */
const M = require("./odg-v360-dimension-coverage.js");
let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }
const dim = (r: any, id: string) => r.dimensions.find((d: any) => d.id === id);

function main(): void {
  // a compass that tracks the newly-built capabilities as DONE_OPERATIONAL
  const compass = { capabilities: [
    { module: "odg-hybrid-reasoning", status: "DONE_OPERATIONAL" },
    { module: "odg-model-intelligence", status: "DONE_OPERATIONAL" },
    { module: "odg-multimodal-ingest", status: "DONE_OPERATIONAL" },
    { module: "odg-self-improvement-cycle", status: "DONE_OPERATIONAL" },
    { module: "knowledge-engine", status: "CONNECTED" },
    { module: "frontier-radar-self-improvement", status: "CONNECTED" }, // not in any dimension's module list — ignored
  ] };
  // real modules: meta-intelligence exists + consumed (untracked but operational); "ghostmod" exists but orphan; others absent
  const exists = new Set(["meta-intelligence", "evaluator-independence", "performance-observability"]);
  const consumed = new Set(["meta-intelligence", "evaluator-independence", "performance-observability"]);
  const r = M.buildDimensionCoverage({ compass, moduleExists: (n: string) => exists.has(n), hasConsumer: (n: string) => consumed.has(n) });

  check("15 dimensions", r.counts.total === 15);
  check("deep-reasoning COVERED via TRACKED odg-hybrid-reasoning", dim(r, "deep-reasoning").coverage === "COVERED" && dim(r, "deep-reasoning").modules.some((m: any) => m.module === "odg-hybrid-reasoning" && m.status === "TRACKED"));
  check("meta-intelligence COVERED via OPERATIONAL_UNTRACKED (exists + consumed, not a compass cap)", dim(r, "meta-intelligence").coverage === "COVERED" && dim(r, "meta-intelligence").modules.some((m: any) => m.module === "meta-intelligence" && m.status === "OPERATIONAL_UNTRACKED"));
  check("performance-speed COVERED via OPERATIONAL_UNTRACKED (performance-observability consumed)", dim(r, "performance-speed").coverage === "COVERED");
  check("multimodal COVERED via TRACKED odg-multimodal-ingest", dim(r, "multimodal").coverage === "COVERED");

  // a dimension whose modules are all ABSENT (not tracked, not existing) ⇒ BLIND
  check("multi-agent BLIND when its modules are absent/untracked (honest blind spot)", dim(r, "multi-agent").coverage === "BLIND" && r.blindSpots.indexOf("multi-agent") >= 0);

  // THIN: a module that EXISTS but has no consumer ⇒ EXISTS_ORPHAN ⇒ dimension THIN (not covered)
  const r2 = M.buildDimensionCoverage({ compass: { capabilities: [] }, moduleExists: (n: string) => n === "repair-planner", hasConsumer: () => false });
  check("orphan-only dimension ⇒ THIN (EXISTS_ORPHAN does not make it covered)", dim(r2, "self-diagnostic-repair").coverage === "THIN" && dim(r2, "self-diagnostic-repair").modules.some((m: any) => m.module === "repair-planner" && m.status === "EXISTS_ORPHAN"));

  // no evidence at all ⇒ everything BLIND (coverage never fabricated)
  const r3 = M.buildDimensionCoverage({ compass: { capabilities: [] }, moduleExists: () => false, hasConsumer: () => false });
  check("no evidence ⇒ all 15 BLIND (coverage never claimed without a backing module)", r3.counts.blind === 15 && r3.counts.covered === 0);

  check("frozen + contract: COVERED needs real backing; orphan≠covered; honest blind/thin; lens not 2nd roadmap",
    Object.isFrozen(r) &&
    /COVERED only with a real backing module/.test(JSON.stringify(M.DIMENSION_COVERAGE_CONTRACT.invariants)) &&
    /EXISTS_ORPHAN .*does NOT make a dimension covered/.test(JSON.stringify(M.DIMENSION_COVERAGE_CONTRACT.invariants)) &&
    /no second roadmap/.test(JSON.stringify(M.DIMENSION_COVERAGE_CONTRACT.invariants)) &&
    /odg-v360-compass/.test(JSON.stringify(M.DIMENSION_COVERAGE_CONTRACT.reuses)));

  process.stdout.write(`\n${failures === 0 ? "ALL PASS — odg-v360-dimension-coverage (V360 §10/§14: Boussole completeness over 15 dimensions; COVERED needs TRACKED or OPERATIONAL_UNTRACKED backing; orphan⇒THIN; none⇒BLIND; coverage never fabricated; lens over compass + real module/consumer graph, no 2nd roadmap)" : failures + " FAIL"}\n`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
