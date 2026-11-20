#!/usr/bin/env node
"use strict";
/*
 * V360 §7/§18 — NATIVE LEARNING PASS. PURE, deterministic, fail-closed. The PRIORITY-1 inventory found learning-loop
 * (RESULT→EVIDENCE→LESSON→REUSE) EXISTING but with no live consumer. The real missing link: nothing runs the learning loop
 * over ODG's OWN accumulated native-build outcomes. This is the thin adapter — it maps the EXISTING native-build-outcome
 * records into learning-loop.learn's result shape and runs the loop, so recurring REAL failures become consolidated,
 * provenanced lessons. REUSES learning-loop + the native-build-outcome store; NO new memory, NO second learning engine.
 *
 * Honesty (inherited from learning-loop): only INDEPENDENTLY-VERIFIED outcomes are REAL facts (others ⇒ SIMULATED, excluded
 * from facts); UNKNOWN/undecided outcomes are censored; a lesson is NOT an improvement (native-build records carry no
 * before/after metric ⇒ measured:false — never a fabricated gain); only consolidated+provenanced prior lessons are reusable.
 */

const LL = require("./learning-loop.js");

function freeze<T>(o: T): T { return Object.freeze(o) as T; }
function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }

/**
 * learnFromNativeOutcomes(outcomes, opts?) -> learning-loop result + { mappedFrom, counted }.
 *   outcomes: native-build-outcome records [{ missionId, type, outcome:"SUCCESS"|"FAILURE"|"UNKNOWN", independentlyVerified, evidence? }].
 * Maps SUCCESS/FAILURE (UNKNOWN censored) → learn()'s { missionId, outcome:"pass"|"fail", kind, failureKind, evidence }.
 * A FAILURE's failureKind is its native-build class `type` ⇒ recurring same-class failures become lessons.
 */
function learnFromNativeOutcomes(outcomes: any, opts: any = {}): any {
  const o = isObj(opts) ? opts : {};
  const all = Array.isArray(outcomes) ? outcomes.filter(isObj) : [];
  const results = all.map((r: any) => {
    if (r.outcome !== "SUCCESS" && r.outcome !== "FAILURE") return null; // UNKNOWN / undecided ⇒ censored
    const base: any = {
      missionId: typeof r.missionId === "string" ? r.missionId : (typeof r.id === "string" ? r.id : "native:?"),
      outcome: r.outcome === "SUCCESS" ? "pass" : "fail",
      kind: r.independentlyVerified === true ? "REAL" : "SIMULATED",   // only independently-verified count as REAL facts
      evidence: [typeof r.evidence === "string" && r.evidence ? r.evidence : (typeof r.type === "string" ? r.type : "native-outcome")],
    };
    if (r.outcome === "FAILURE") base.failureKind = typeof r.type === "string" && r.type ? r.type : "UNSPECIFIED";
    return base;
  }).filter(Boolean);
  const res = LL.learn({ results, priorLessons: o.priorLessons });
  return freeze({ ...res, mappedFrom: all.length, counted: results.length });
}

const NATIVE_LEARNING_PASS_CONTRACT = Object.freeze({
  id: "V360-NATIVE-LEARNING-PASS",
  purpose: "§7/§18 — run the EXISTING learning-loop over ODG's accumulated native-build outcomes so recurring REAL failures become consolidated lessons; closes the learning-loop connect-gap with no new memory",
  reuses: Object.freeze(["learning-loop.learn (the loop — now consumed)", "native-build-outcome accumulated store (read-only; NO new memory)"]),
  invariants: Object.freeze([
    "only INDEPENDENTLY-VERIFIED outcomes are REAL facts; others ⇒ SIMULATED (excluded from facts); UNKNOWN censored",
    "a recurring (≥2) same-class REAL failure becomes a consolidated, provenanced lesson (via learning-loop → memory-taxonomy)",
    "native-build records carry no before/after metric ⇒ measured:false (a lesson is NOT a fabricated improvement)",
    "PURE/deterministic/frozen; read-only over the existing store; no second learning engine / no new memory",
  ]),
});

module.exports = { learnFromNativeOutcomes, NATIVE_LEARNING_PASS_CONTRACT };

if (require.main === module) { process.stdout.write(JSON.stringify(NATIVE_LEARNING_PASS_CONTRACT, null, 2) + "\n"); }

export {};
