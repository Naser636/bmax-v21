#!/usr/bin/env node
"use strict";

/*
 * SÉRIE 13 (P1 excellence) — SEMANTIC-REGRESSION GUARD. PURE, deterministic. Addresses the measured frontier gap in
 * autonomous software engineering: on SWE-bench Verified the best agents "solve" ~94% of issues, yet ~19.78% of those
 * "solved" cases are SEMANTICALLY WRONG — they PASS the stated test but change behaviour on inputs the stated test
 * doesn't cover. A green stated-test is NOT proof of correctness (ODG doctrine: "a green build is never sufficient").
 * This guard COMPOSES the stated-test signal with P1's characterization baseline (reusing
 * profession-p1-fullstack-reference.refactorPreservesBehaviour — NO new engine): a change is SAFE only when the stated
 * tests pass AND the held-out observed behaviour is preserved. Tests-pass + behaviour-changed ⇒ SEMANTIC_REGRESSION
 * (the dangerous 19.78% case), surfaced fail-closed. Dual export.
 */

const P1 = require("./profession-p1-fullstack-reference");

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }

/** assess({statedTestsPass, before, after, target}) -> { verdict, safe, statedTestsPass, behaviour }.
 * verdict: SAFE | SEMANTIC_REGRESSION | TEST_FAILURE | INCOMPLETE. Fail-closed: SAFE needs BOTH signals green. */
function assess(input: any): any {
  const o = isObj(input) ? input : {};
  const statedTestsPass = o.statedTestsPass === true;
  const beh = P1.refactorPreservesBehaviour(o.before, o.after, typeof o.target === "string" ? o.target : "p1-change");
  const preserved = beh.verdict === "BEHAVIOR_PRESERVED";
  const incomplete = beh.verdict === "INCOMPLETE" || beh.verdict === "NO_BASELINE";

  let verdict: string;
  if (!statedTestsPass) verdict = "TEST_FAILURE";                 // the stated tests already fail
  else if (incomplete) verdict = "INCOMPLETE";                    // behaviour coverage gap — cannot certify (not a pass)
  else if (!preserved) verdict = "SEMANTIC_REGRESSION";          // tests pass BUT held-out behaviour changed — the 19.78% case
  else verdict = "SAFE";                                          // tests pass AND behaviour preserved

  return Object.freeze({
    verdict, safe: verdict === "SAFE", statedTestsPass,
    behaviour: Object.freeze({ verdict: beh.verdict, changed: beh.changed, missing: beh.missing }),
    note: verdict === "SEMANTIC_REGRESSION"
      ? "stated tests PASS but held-out observed behaviour CHANGED — a semantically-wrong 'solved' change (the SWE-bench 19.78% failure mode); fail-closed NOT safe"
      : "SAFE requires BOTH stated-tests-pass AND behaviour-preserved; a green stated-test alone is not proof of correctness",
  });
}

const P1_SEMANTIC_REGRESSION_GUARD_CONTRACT = Object.freeze({
  id: "V124-P1-SEMANTIC-REGRESSION-GUARD",
  source: "SÉRIE 13 P1 — guards the SWE-bench 'passes-tests-but-semantically-wrong' failure mode (~19.78% of solved cases)",
  reference: Object.freeze({ benchmark: "SWE-bench Verified", finding: "~19.78% of 'solved' cases semantically wrong (2026)", sources: Object.freeze(["arXiv 2609.08149 SWE-Bench Pro Verified", "Beyond SWE-Bench 2026"]) }),
  reuses: Object.freeze(["profession-p1-fullstack-reference.refactorPreservesBehaviour (characterization baseline)"]),
  notAuthority: "composes the stated-test signal with P1's behaviour baseline; it builds no new engine and ships nothing",
  invariants: Object.freeze([
    "SAFE requires BOTH stated-tests-pass AND held-out behaviour preserved — a green stated-test alone is not proof",
    "tests-pass + behaviour-changed ⇒ SEMANTIC_REGRESSION (the dangerous 19.78% case) — fail-closed, NOT safe",
    "a behaviour coverage gap ⇒ INCOMPLETE (not a pass); failing stated tests ⇒ TEST_FAILURE",
    "reuses P1's characterization baseline; no second baseline/evaluator engine",
  ]),
});

module.exports = { assess, P1_SEMANTIC_REGRESSION_GUARD_CONTRACT };

if (require.main === module) { process.stdout.write(JSON.stringify({ ...P1_SEMANTIC_REGRESSION_GUARD_CONTRACT, demo: assess({ statedTestsPass: true, before: [{ input: 1, observedOutput: "a" }], after: [{ input: 1, observedOutput: "a" }] }) }, null, 2) + "\n"); }

export {};
