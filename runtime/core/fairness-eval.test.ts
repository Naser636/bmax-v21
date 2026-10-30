#!/usr/bin/env node
// @ts-nocheck — runs under tsx. Proves the fairness harness is FAIL-CLOSED and honest: NO_DATA on self-authored /
// underpowered / non-comparable sets (never a fairness claim), a real disparity is SURFACED on an independently-
// labelled comparable set, and ODG's deterministic code capabilities are classified NOT_APPLICABLE (no bias claim).
"use strict";
const assert = require("assert");
const F = require("./fairness-eval.js");
let pass = 0; const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); pass++; };

const indep = { author: "third-party:fairness-lab", independentOfEvaluee: true, sourceRef: "https://flab/set#1", devValidationSeparated: true, labellingMethod: "human-third-party" };
const mk = (group, fav, unfav) => [].concat(Array.from({ length: fav }, () => ({ group, outcome: "FAVOURABLE" })), Array.from({ length: unfav }, () => ({ group, outcome: "UNFAVOURABLE" })));

// (1) self-authored labels ⇒ NO_DATA (cannot self-certify fairness).
ok("self-authored labels ⇒ NO_DATA", F.assessFairness({ results: mk("a", 30, 0).concat(mk("b", 30, 0)), comparable: true, independentProvenance: { author: "odg" } }).status === "NO_DATA");

// (2) non-comparable inputs ⇒ NO_DATA.
ok("non-comparable inputs ⇒ NO_DATA", F.assessFairness({ results: mk("a", 30, 0).concat(mk("b", 30, 0)), comparable: false, independentProvenance: indep }).status === "NO_DATA");

// (3) underpowered group ⇒ NO_DATA (not a fairness claim on a tiny sample).
ok("under minPerGroup ⇒ NO_DATA", F.assessFairness({ results: mk("a", 5, 0).concat(mk("b", 5, 0)), comparable: true, independentProvenance: indep }).status === "NO_DATA");

// (4) independent + comparable + powered, EQUAL rates ⇒ MEASURED, no disparity (but NOT 'fair in general').
const equal = F.assessFairness({ results: mk("a", 24, 16).concat(mk("b", 24, 16)), comparable: true, independentProvenance: indep, dimension: "ethnicity" });
ok("equal rates ⇒ MEASURED, no disparity, no fairness guarantee", equal.status === "MEASURED" && equal.disparityDetected === false && /NOT a guarantee/.test(equal.note));

// (5) a real DISPARITY is surfaced (group a favoured 90% vs b 30%).
const biased = F.assessFairness({ results: mk("a", 36, 4).concat(mk("b", 12, 28)), comparable: true, independentProvenance: indep, dimension: "gender" });
ok("large outcome-rate gap ⇒ disparity SURFACED", biased.status === "MEASURED" && biased.disparityDetected === true && biased.maxOutcomeRateGap > 0.1);

// (5b) C-2 REGRESSION (recon V2 Pole C): EQUAL favourable rate but a large REFUSAL-rate disparity must be SURFACED
// (previously missed — only outcome_rate_parity was computed despite refusal_rate_parity being declared + tallied).
const refusalBias = F.assessFairness({ results: [].concat(
    Array.from({ length: 15 }, () => ({ group: "a", outcome: "FAVOURABLE" })),
    Array.from({ length: 15 }, () => ({ group: "a", outcome: "REFUSED" })),
    Array.from({ length: 15 }, () => ({ group: "b", outcome: "FAVOURABLE" })),
    Array.from({ length: 15 }, () => ({ group: "b", outcome: "UNFAVOURABLE" }))),
  comparable: true, independentProvenance: indep, dimension: "disability" });
ok("equal favourable rate but REFUSAL-rate disparity ⇒ SURFACED (was missed)", refusalBias.status === "MEASURED" && refusalBias.maxOutcomeRateGap === 0 && refusalBias.maxRefusalRateGap > 0.1 && refusalBias.disparityDetected === true && /refusal-rate gap/.test(refusalBias.note));

// (6) capability surface: ODG's code capabilities are NOT_APPLICABLE (no bias claim either way).
const s = F.capabilitySurface();
ok("code capabilities ⇒ NOT_APPLICABLE (no protected-attribute surface), not 'bias-free'", s.assessed.every((c) => c.biasStatus === "NOT_APPLICABLE" && c.protectedAttributeSurface === false) && /NOT 'proven absent'/.test(s.note) && s.futureRequiresHarness.length > 0);

// (7) methodology scope documented.
ok("protected dimensions + disparity metrics documented", F.PROTECTED_DIMENSIONS.length >= 5 && F.DISPARITY_METRICS.includes("outcome_rate_parity") && F.FAIRNESS_THRESHOLD.requireIndependentLabels === true);

console.log(`\nFAIRNESS-EVAL suite — ${pass} assertions passed. (fail-closed NO_DATA on self-authored/underpowered/non-comparable; disparity surfaced on independent set; code capabilities NOT_APPLICABLE; never claims bias-free)`);
