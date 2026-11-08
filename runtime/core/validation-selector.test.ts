#!/usr/bin/env node
"use strict";
const assert = require("assert");
const V = require("./validation-selector");
let failures = 0;
function check(c: any, label: any) { if (c) { console.log("  ok -", label); } else { failures++; console.log("  FAIL", label); } assert.ok(c, label); }
console.log("V5-E / VALIDATION SELECTOR (Validation Economics)");
const all = ["a.test.ts", "b.test.ts", "c.test.ts", "d.test.ts"];
// targeted: only impacted suites selected; rest NOT_RUN.
{
  const r = V.selectValidation({ changedFiles: ["runtime/core/a.ts"], impactedSuites: ["a.test.ts", "b.test.ts"], allSuites: all, riskLevel: "LOW" });
  check(r.mode === "TARGETED" && r.selectedCount === 2 && r.unrunCount === 2, "targeted selects impacted subset");
  check(r.certificationStillRequired === true, "TARGETED never certifies — full gate still required");
  check(r.unrun.includes("c.test.ts") && !r.selected.includes("c.test.ts"), "unimpacted suites are NOT_RUN (never PASS)");
}
// critical path change ⇒ FULL (uncertainty widens validation).
{
  const r = V.selectValidation({ changedFiles: ["runtime/core/campaign-controller.ts"], impactedSuites: ["a.test.ts"], allSuites: all });
  check(r.mode === "FULL" && r.selectedCount === 4 && r.unrunCount === 0, "governance/critical change ⇒ FULL");
  check(r.reasons.some((x: any) => /critical\/governance/.test(x)), "reason cites critical surface");
}
// HIGH risk ⇒ FULL.
check(V.selectValidation({ changedFiles: ["x.ts"], impactedSuites: ["a.test.ts"], allSuites: all, riskLevel: "HIGH" }).mode === "FULL", "HIGH risk ⇒ FULL");
// undeterminable impact ⇒ FULL (fail-closed).
check(V.selectValidation({ changedFiles: ["x.ts"], allSuites: all }).mode === "FULL", "undeterminable impact ⇒ FULL (fail-closed)");
// governance file patterns detected.
check(V.touchesCritical(["docs/odg/closure-register.json", "runtime/core/x.ts"]).length === 1, "touchesCritical detects register/governance");
// tsconfig/package/CI changes ⇒ FULL.
check(V.selectValidation({ changedFiles: ["package.json"], impactedSuites: ["a.test.ts"], allSuites: all }).mode === "FULL", "package.json change ⇒ FULL");
check(V.VALIDATION_SELECTOR_CONTRACT.invariants.some((i: any) => /NEVER declared PASS/.test(i)), "contract: unrun never PASS");
console.log(failures === 0 ? "ALL PASS — V5-E VALIDATION SELECTOR" : "FAILURES: " + failures);
process.exit(failures === 0 ? 0 : 1);
export {};
