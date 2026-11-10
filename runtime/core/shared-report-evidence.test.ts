#!/usr/bin/env node
"use strict";
const O1 = require("./shared-report-generator");
const O2 = require("./shared-evidence-wrapper");
let failures = 0;
function check(c: any, l: any): void { if (!c) { failures++; process.stderr.write("FAIL: " + l + "\n"); } }

// ---- O2 shared-evidence-wrapper ----
const w = O2.wrapEvidence([{ claim: "a", basis: "PROVEN", sourceRef: "f.json" }, { claim: "b", basis: "guess" }, { claim: "c", basis: "SIMULATED" }]);
check(w.counts.PROVEN === 1 && w.counts.SIMULATED === 1 && w.counts.UNKNOWN === 1, "O2: basis normalized (unknown ⇒ UNKNOWN, never PROVEN)");
check(w.integrity.digest && w.integrity.primitive === "evidence-provenance", "O2: integrity via the canonical evidence-provenance primitive (not duplicated)");
check(O2.verifyEvidence(w).ok === true, "O2: untampered evidence verifies independently (digest matches)");
// tamper ⇒ verify fails
const tampered = { ...w, items: w.items.map((i: any, idx: number) => idx === 0 ? { ...i, basis: "SIMULATED" } : i) };
check(O2.verifyEvidence(tampered).ok === false, "O2: tampered evidence set ⇒ independent verification FAILS (fail-closed)");
check(O2.wrapEvidence([{ claim: "x" }]).counts.UNKNOWN === 1, "O2: an item with no basis ⇒ UNKNOWN (absence of proof never PROVEN)");

// ---- O1 shared-report-generator ----
const missing = O1.generateReport({ metier: "P3" });   // no title/status
check(missing.ok === false && missing.missingRequired.includes("title") && missing.missingRequired.includes("status"), "O1: missing required fields ⇒ ok:false (fail-closed)");
check(/\(not provided\)/.test(missing.markdown), "O1: a missing field renders '(not provided)' — never fabricated");

// ---- Phase D: reusability across P3, P11, P10, P9 (normalized reports; no métier coupling) ----
function metierReport(metier: string, findingBasis: string, evBasis: string): any {
  return { metier, title: `${metier} readiness`, status: "PREPARED", summary: `${metier} summary`,
    controls: [{ name: "control-1", status: "PASS", detail: "d" }],
    findings: [{ severity: "MEDIUM", detail: "a finding", basis: findingBasis }],
    recommendations: ["do X"], limits: ["readiness only, not certification"],
    evidence: [{ claim: `${metier} evidence`, basis: evBasis, sourceRef: `${metier}.json` }],
    validationConditions: ["independent controller decides"] };
}
for (const [m, fb, eb] of [["P3", "PROVEN", "PROVEN"], ["P11", "PROVEN", "PROVEN"], ["P10", "ESTIMATED", "OBSERVED"], ["P9", "SIMULATED", "SIMULATED"]]) {
  const rep = O1.generateReport(metierReport(m, fb, eb));
  check(rep.ok === true, `O1 reused on ${m}: valid report produced`);
  check(rep.json.metier === m && /readiness/.test(rep.json.title), `O1 on ${m}: métier specifics preserved (not altered)`);
  check(rep.json.findings[0].basis === fb, `O1 on ${m}: finding basis carried through unchanged (${fb})`);
  check(O2.verifyEvidence(rep.evidence).ok === true, `O1 on ${m}: evidence independently verifiable`);
  check(/## Evidence/.test(rep.markdown) && /## Limits of this analysis/.test(rep.markdown), `O1 on ${m}: PME report has evidence + limits sections`);
}
// isolation: O1 does NOT inject a PROVEN basis when the métier said SIMULATED (P9)
const p9 = O1.generateReport(metierReport("P9", "SIMULATED", "SIMULATED"));
check(p9.evidence.counts.PROVEN === 0 && p9.evidence.counts.SIMULATED === 1, "O1/O2: a SIMULATED métier result is NOT upgraded to PROVEN (no false evidence)");

// contract honesty
check(/alters no conclusion|invents no result/i.test(O1.SHARED_REPORT_GENERATOR_CONTRACT.notAuthority), "O1 contract: invents nothing, alters no conclusion");
check(/NO second source of truth/i.test(JSON.stringify(O2.SHARED_EVIDENCE_WRAPPER_CONTRACT.invariants)), "O2 contract: no second source of truth");

if (failures === 0) process.stdout.write("ALL PASS — V46.2 O1+O2 shared report+evidence (reused on P3/P11/P10/P9)\n");
process.exit(failures === 0 ? 0 : 1);

export {};
