#!/usr/bin/env node
"use strict";

/*
 * LEARNING REVIEW (§V S5) — hermetic unit proof. PURE: synthetic baselines + records, NO fs/clock/network.
 * Proves the DECISION (block) is driven by the evaluation: a real debt regression (FROZEN_LOOP) or an
 * over-claim gates; a clean, fully-EFFECTIVE portfolio proceeds; a null signal is a HYPOTHESIS (not a
 * regression); zero/negative debt is not a regression; and no fabricated effect slips through.
 *
 * Run: node_modules/.bin/tsx src/runtime/learning-review.test.ts
 */

const path = require("path");
const REPO = process.cwd();
const { reviewLearning } = require(path.join(REPO, "src", "runtime", "learning-review.ts"));

let failures = 0;
const check = (c: boolean, l: string) => { if (c) console.log(`  PASS ${l}`); else { failures++; console.log(`  FAIL ${l}`); } };

console.log("LEARNING REVIEW (§V S5) — hermetic unit proof");

const effectiveRecord = (id: string) => ({
  id, claim: "EFFECTIVE",
  captured: { description: "d" }, persisted: { commit: "c" }, discoverable: { index: "i" },
  reused: { refs: ["consumer"] }, effective: { baseline: 2, after: 5 },
});

// (1) REAL debt regression (FROZEN_LOOP) ⇒ block (the decision the evaluation drives)
const r1 = reviewLearning({ baseline: { signals: { frozenIncidents: 3, recurringIncidents: 4, hazardBlocked: 0 } }, records: [effectiveRecord("A")] });
check(r1.verdict === "REGRESSED" && r1.block === true, "FROZEN_LOOP debt (frozen=3) ⇒ REGRESSED + block (prior fixes did not hold)");
check(r1.observed.frozenIncidents === 3 && /debt regression/.test(r1.reason), "regression is an OBSERVED fact in the reason");

// (2) clean signals + all records EFFECTIVE ⇒ EFFECTIVE, proceed
const r2 = reviewLearning({ baseline: { signals: { frozenIncidents: 0, recurringIncidents: 0, hazardBlocked: 0 } }, records: [effectiveRecord("A"), effectiveRecord("B")] });
check(r2.verdict === "EFFECTIVE" && r2.block === false, "clean debt + all records EFFECTIVE ⇒ EFFECTIVE, no block");

// (3) clean signals but a record not yet EFFECTIVE ⇒ INCONCLUSIVE, proceed (not a regression)
const partial = { id: "P", captured: { description: "d" }, persisted: { commit: "c" }, discoverable: { index: "i" } }; // only DISCOVERABLE
const r3 = reviewLearning({ baseline: { signals: { frozenIncidents: 0, recurringIncidents: 0, hazardBlocked: 0 } }, records: [partial] });
check(r3.verdict === "INCONCLUSIVE" && r3.block === false, "clean debt + a not-yet-EFFECTIVE record ⇒ INCONCLUSIVE, no block");

// (4) OVER-CLAIM: a record claims EFFECTIVE with NO measurement ⇒ block (no fabricated progress)
const overclaim = { id: "X", claim: "EFFECTIVE", captured: { description: "d" }, persisted: { commit: "c" }, discoverable: { index: "i" }, reused: { refs: ["c"] }, effective: { baseline: 5, after: 5 } };
const r4 = reviewLearning({ baseline: { signals: { frozenIncidents: 0, recurringIncidents: 0, hazardBlocked: 0 } }, records: [overclaim] });
check(r4.verdict === "REGRESSED" && r4.block === true && /over-claim/.test(r4.reason), "over-claim (claims EFFECTIVE, flat measurement) ⇒ block (no fabricated progress)");

// (5) a NULL debt signal ⇒ HYPOTHESIS, not a regression
const r5 = reviewLearning({ baseline: { signals: { frozenIncidents: 0, recurringIncidents: null, hazardBlocked: 0 } }, records: [effectiveRecord("A")] });
check(r5.block === false && r5.hypotheses.some((h: string) => /recurringIncidents unmeasured/.test(h)), "null debt signal ⇒ HYPOTHESIS (not observed), never counted as regression");

// (6) zero/negative debt ⇒ not a regression
const r6 = reviewLearning({ baseline: { signals: { frozenIncidents: 0, recurringIncidents: -0, hazardBlocked: 0 } }, records: [effectiveRecord("A")] });
check(r6.block === false, "zero debt ⇒ no regression, no block");

// (7) empty input ⇒ INCONCLUSIVE, no block (no signals, no records)
const r7 = reviewLearning({});
check(r7.verdict === "INCONCLUSIVE" && r7.block === false, "empty input ⇒ INCONCLUSIVE, no block (fail-safe)");

console.log(failures === 0 ? "ALL PASS — learning-review (§V S5)" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);

// Module-scope marker (adds NO export): forces TypeScript MODULE scope (no global-script collisions).
export {};
