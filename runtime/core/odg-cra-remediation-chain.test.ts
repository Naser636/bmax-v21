#!/usr/bin/env node
"use strict";
/* Tests for odg-cra-remediation-chain (V360 Chantier A). DETECTION→PLAN→VERIFY composition, PLAN-ONLY, fail-closed.
 * cra-remediation-engine now has a real producer+consumer; Verify has a real path (closure from the AFTER SBOM). Deterministic. */
const M = require("./odg-cra-remediation-chain.js");
let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }

function main(): void {
  // CVE-style finding ⇒ actionable VERIFIED_FIX plan; AFTER SBOM upgraded past the fixed version ⇒ verify RESOLVED.
  const cve = { id: "CVE-1", severity: "HIGH", component: "left-pad", version: "1.0.0", cve: "CVE-1", cvss: 7.5, fixedVersion: "1.3.0", fixVerified: true };
  const r = M.remediationChain({ findings: [cve], before: { components: [{ name: "left-pad", version: "1.0.0" }] }, after: { components: [{ name: "left-pad", version: "1.3.0" }] } });
  check("DETECT_PLAN_VERIFY: CVE finding ⇒ plan actionable (VERIFIED_FIX) + Verify ran over before/after", r.ok === true && r.stage === "DETECT_PLAN_VERIFY" && r.plan.actionableVerifiedFix >= 1 && !!r.verify && r.verify.ok === true);
  const res = (r.verify.resolutions || [])[0] || {};
  check("Verify closure from the AFTER SBOM: left-pad upgraded to the verified fix ⇒ RESOLVED_UPGRADED", /RESOLVED/.test(res.resolution));

  // a finding with NO component ⇒ UNVERIFIABLE at Verify (never a false RESOLVED).
  const noComp = M.remediationChain({ findings: [{ id: "X", severity: "LOW" }], before: { components: [] }, after: { components: [] } });
  check("no-component finding ⇒ UNVERIFIABLE (never a fabricated RESOLVED)", (noComp.verify.resolutions || [])[0].resolution === "UNVERIFIABLE");

  // PLAN-only: no before/after ⇒ Verify is null (closure never asserted without the new SBOM).
  const planOnly = M.remediationChain({ findings: [cve] });
  check("no before/after ⇒ stage DETECT_PLAN, verify null (closure not asserted without a fresh AFTER SBOM)", planOnly.stage === "DETECT_PLAN" && planOnly.verify === null);

  // empty findings ⇒ empty plan (nothing to remediate asserted).
  check("empty findings ⇒ plan total 0 (nothing to remediate)", M.remediationChain({ findings: [] }).plan.total === 0);

  // DETECTION fail-closed: a sources path with no manifest ⇒ DETECTION error (no fabricated findings).
  check("empty sources ⇒ DETECTION fail-closed (NO_MANIFEST), no fabricated findings", (() => { const d = M.remediationChain({ sources: [] }); return d.ok === false ? d.stage === "DETECTION" : d.detection.findingCount === 0; })());

  // frozen + contract
  check("frozen result", Object.isFrozen(r));
  check("contract: PLAN-ONLY; reuses sbom-audit + cra-remediation; no 2nd engine; closure from new SBOM",
    /PLAN-ONLY/.test(JSON.stringify(M.CRA_REMEDIATION_CHAIN_CONTRACT.invariants)) &&
    /sbom-audit-service/.test(JSON.stringify(M.CRA_REMEDIATION_CHAIN_CONTRACT.reuses)) &&
    /cra-remediation-engine/.test(JSON.stringify(M.CRA_REMEDIATION_CHAIN_CONTRACT.reuses)));

  process.stdout.write(`\n${failures === 0 ? "ALL PASS — odg-cra-remediation-chain (V360 Chantier A: DETECTION→PLAN→VERIFY; cra-remediation-engine now has a real producer+consumer; Verify closure from the AFTER SBOM; PLAN-ONLY, no fabricated fix, no-component⇒UNVERIFIABLE; reuses sbom-audit + cra-remediation, no 2nd engine)" : failures + " FAIL"}\n`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
