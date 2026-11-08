#!/usr/bin/env node
"use strict";
const assert = require("assert");
const T = require("./targeted-verify");
let failures = 0;
function check(c: any, label: any) { if (c) { console.log("  ok -", label); } else { failures++; console.log("  FAIL", label); } assert.ok(c, label); }
console.log("V5-E WAVE-2 / TARGETED-VERIFY PLANNER");
const all = ["a.test.ts", "b.test.ts", "c.test.ts"];
// low-risk change ⇒ TARGETED, unrun NOT_RUN, cert still required.
{
  const r = T.planTargetedVerify({ changedFiles: ["runtime/core/a.ts"], impactedSuites: ["a.test.ts"], allSuites: all, riskLevel: "LOW" });
  check(r.mode === "TARGETED" && r.selectedCount === 1 && r.unrunCount === 2, "low-risk ⇒ TARGETED subset");
  check(r.certificationStillRequired === true && /NOT PASS/.test(r.summary), "targeted never certifies; unrun NOT PASS in summary");
}
// certification ⇒ FULL (a certification never runs a subset).
{
  const r = T.planTargetedVerify({ changedFiles: ["runtime/core/a.ts"], impactedSuites: ["a.test.ts"], allSuites: all, certification: true });
  check(r.mode === "FULL" && r.selectedCount === 3, "certification ⇒ FULL (all suites)");
  check(r.reasons.some((x: any) => /certification point/.test(x)), "reason cites certification");
}
// governance change ⇒ FULL even without certification.
check(T.planTargetedVerify({ changedFiles: ["docs/odg/closure-register.json"], impactedSuites: ["a.test.ts"], allSuites: all }).mode === "FULL", "governance change ⇒ FULL");
// undeterminable impact ⇒ FULL.
check(T.planTargetedVerify({ changedFiles: ["x.ts"], allSuites: all }).mode === "FULL", "undeterminable impact ⇒ FULL");
check(T.TARGETED_VERIFY_CONTRACT.invariants.some((i: any) => /certification never runs a targeted subset/i.test(i)), "contract: certification forces FULL");
console.log(failures === 0 ? "ALL PASS — V5-E WAVE-2 TARGETED-VERIFY" : "FAILURES: " + failures);
process.exit(failures === 0 ? 0 : 1);
export {};
