#!/usr/bin/env node
"use strict";
const assert = require("assert");
const A = require("./ai-act-annex-iv-completeness");
let failures = 0;
function check(c: any, label: any) { if (c) { console.log("  ok -", label); } else { failures++; console.log("  FAIL", label); } assert.ok(c, label); }
console.log("SÉRIE 23/W9 — AI-ACT ANNEX IV COMPLETENESS");
const provider = { developsOrPlacesAiSystemUnderOwnName: true };
function fullDoc() { const d: any = {}; for (const k of A.ANNEX_IV_SECTIONS.map((s: any) => s.key)) d[k] = "documented content"; return d; }
// provider + all 9 sections ⇒ COMPLETE_READINESS.
check(A.assessAnnexIvCompleteness({ activities: provider, techDoc: fullDoc() }).verdict === "COMPLETE_READINESS", "provider + all 9 sections ⇒ COMPLETE_READINESS");
// provider + missing sections ⇒ INCOMPLETE + HIGH findings.
{
  const r = A.assessAnnexIvCompleteness({ activities: provider, techDoc: { generalDescription: "x" } });
  check(r.verdict === "INCOMPLETE" && r.missing.length === 8 && r.findings.every((f: any) => f.severity === "HIGH"), `missing 8 ⇒ INCOMPLETE (got ${r.missing.length})`);
}
// placeholder content counts as absent.
{
  const d = fullDoc(); d.riskManagement = "TBD";
  check(A.assessAnnexIvCompleteness({ activities: provider, techDoc: d }).missing.includes("riskManagement"), "placeholder (TBD) ⇒ counted absent");
}
// non-provider ⇒ NOT_APPLICABLE.
check(A.assessAnnexIvCompleteness({ activities: { usesAiSystemUnderOwnAuthority: true }, techDoc: {} }).verdict === "NOT_APPLICABLE", "deployer ⇒ NOT_APPLICABLE");
// undetermined role ⇒ UNDETERMINED (deny-by-default).
check(A.assessAnnexIvCompleteness({ activities: {}, techDoc: {} }).verdict === "UNDETERMINED", "undetermined role ⇒ UNDETERMINED");
// GPAI provider also carries the duty.
check(A.assessAnnexIvCompleteness({ activities: { developsOrPlacesGpaiModel: true }, techDoc: {} }).verdict === "INCOMPLETE", "GPAI provider ⇒ subject (INCOMPLETE when empty)");
check(A.ANNEX_IV_COMPLETENESS_CONTRACT.invariants.some((i: any) => /no silent pass/.test(i)), "contract: no silent pass");
console.log(failures === 0 ? "ALL PASS — SÉRIE 23/W9 ANNEX IV COMPLETENESS" : "FAILURES: " + failures);
process.exit(failures === 0 ? 0 : 1);
export {};
