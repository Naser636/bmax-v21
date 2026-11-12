#!/usr/bin/env node
"use strict";
/* V147 MÉTIER 1 — CRA remediation-engine battery (SYNTHETIC findings/SBOM states, labelled ≠ real repo). Proves: finding
 * classification (CONFIRMED/POTENTIAL/MISSING_INFO/NOT_APPLICABLE), fix availability from VERIFIED data only (no invented
 * CVE/score/version), priority ordering, no-known-fix ⇒ investigation, before/after SBOM diff, closure derived from the
 * AFTER state (never a declaration), new-HIGH blocks closure, no auto-fix. Fail-closed on malformed input. */
const R = require("./cra-remediation-engine.js");
let failures = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) failures++; }
const byId = (items: any[], id: string) => items.find((i: any) => i.finding.id === id);

const FINDINGS = [
  { id: "VULN-1", severity: "HIGH", component: "lodash", version: "4.17.11", evidence: "GHSA-xxxx", cve: "CVE-2020-8203", fixedVersion: "4.17.21", fixVerified: true, direct: true, dependents: ["app-core"] },
  { id: "VULN-2", severity: "MEDIUM", component: "left-pad", version: "1.0.0", evidence: "maintainer gone" },      // no fix
  { id: "VULN-3", severity: "HIGH", component: "foo", version: "2.0.0", fixedVersion: "2.1.0" },                   // unverified fix
  { id: "VULN-4", severity: "LOW", evidence: "something" },                                                        // missing component
  { id: "VULN-5", severity: "HIGH", component: "bar", version: "1.0.0", applicable: false },                      // not applicable
];

function main() {
  const plan = R.buildRemediationPlan(FINDINGS);
  check("plan ok, 5 items", plan.ok === true && plan.items.length === 5);
  check("classification exact", byId(plan.items, "VULN-1").status === "CONFIRMED" && byId(plan.items, "VULN-3").status === "POTENTIAL" && byId(plan.items, "VULN-4").status === "MISSING_INFO" && byId(plan.items, "VULN-5").status === "NOT_APPLICABLE");
  check("verified fix only when fixVerified===true", byId(plan.items, "VULN-1").fixAvailability.state === "VERIFIED_FIX" && byId(plan.items, "VULN-3").fixAvailability.state === "PROPOSED_UNVERIFIED_FIX");
  check("no verified fix ⇒ investigation (not a fabricated solution)", /INVESTIGATE/.test(byId(plan.items, "VULN-2").recommendedAction) && byId(plan.items, "VULN-2").fixAvailability.state === "NO_KNOWN_FIX");
  check("missing info ⇒ identify component first", /identify the exact component/.test(byId(plan.items, "VULN-4").recommendedAction));
  check("invents no CVE/score/version — only carries supplied", byId(plan.items, "VULN-2").finding.cve === null && byId(plan.items, "VULN-2").finding.cvss === null && byId(plan.items, "VULN-2").fixAvailability.targetVersion === null);
  check("priority: verified-fix HIGH direct ranks first; not-applicable last", plan.items[0].finding.id === "VULN-1" && plan.items[plan.items.length - 1].status === "NOT_APPLICABLE");
  check("remediation state is RECOMMENDATION (APPLIED/VERIFIED owner-gated)", plan.items.every((i: any) => i.remediationState === "RECOMMENDATION") && plan.items[0].validation.status === "PENDING");
  check("every item carries regression risk + proof-to-close + tests", plan.items.every((i: any) => typeof i.regressionRisk === "string" && /NEW SBOM/.test(i.proofToClose) && i.testsRequired.length >= 2));
  check("summary counts + execution order (excludes not-applicable)", plan.summary.byFix.VERIFIED_FIX === 1 && plan.summary.needInvestigation >= 2 && plan.summary.executionOrder.indexOf("VULN-5") < 0);

  // ---- §2.3 before/after closure ----
  const before = { components: [{ name: "lodash", version: "4.17.11" }, { name: "left-pad", version: "1.0.0" }, { name: "foo", version: "2.0.0" }] };
  const afterPartial = { components: [{ name: "lodash", version: "4.17.21" }, { name: "foo", version: "2.0.0" }, { name: "newdep", version: "1.0.0" }] };
  const v = R.verifyRemediation({ before, after: afterPartial, findings: FINDINGS, afterFindings: [{ id: "VULN-9", severity: "HIGH", component: "newdep" }] });
  check("diff: removed/updated/added computed", v.diff.removed.indexOf("left-pad@1.0.0") >= 0 && v.diff.updated.some((u: any) => u.name === "lodash" && u.to === "4.17.21") && v.diff.added.indexOf("newdep@1.0.0") >= 0);
  check("resolution: upgraded-past-verified-fix ⇒ RESOLVED_UPGRADED", byIdRes(v.resolutions, "VULN-1") === "RESOLVED_UPGRADED");
  check("resolution: component gone ⇒ RESOLVED_REMOVED", byIdRes(v.resolutions, "VULN-2") === "RESOLVED_REMOVED");
  check("resolution: still present (no verified fix) ⇒ STILL_PRESENT", byIdRes(v.resolutions, "VULN-3") === "STILL_PRESENT");
  check("NOT closed when still-present / new-HIGH introduced", v.closure.verdict === "NOT_CLOSED" && v.closure.newHighIntroduced === 1 && v.residualRisk.some((r: string) => /regression/.test(r)));

  // all resolved ⇒ CLOSED_VERIFIED (positive AFTER evidence only).
  const afterFull = { components: [{ name: "lodash", version: "4.17.21" }, { name: "foo", version: "2.1.0" }] };
  const f2 = [{ id: "A", component: "lodash", version: "4.17.11", fixedVersion: "4.17.21", fixVerified: true }, { id: "B", component: "left-pad", version: "1.0.0" }];
  check("CLOSED_VERIFIED only when all resolved + no new HIGH", R.verifyRemediation({ before, after: afterFull, findings: f2 }).closure.verdict === "CLOSED_VERIFIED");
  check("non-semver after-version vs fixed ⇒ NEEDS_REVIEW (never a guessed resolution)", (() => { const r = R.verifyRemediation({ before: { components: [{ name: "x", version: "1.0.0" }] }, after: { components: [{ name: "x", version: "trunk" }] }, findings: [{ id: "Z", component: "x", version: "1.0.0", fixedVersion: "1.2.0", fixVerified: true }] }); return byIdRes(r.resolutions, "Z") === "NEEDS_REVIEW" && r.closure.verdict === "NOT_CLOSED"; })());
  check("closure declaration-proof: basis cites AFTER SBOM, not a claim", /NOT from a declaration/.test(v.closure.basis));

  // semver compare primitive
  check("cmpSemver deterministic + null on non-semver", R.cmpSemver("1.2.3", "1.2.2") === 1 && R.cmpSemver("1.0.0", "1.0.0") === 0 && R.cmpSemver("x", "1.0.0") === null);

  // fail-closed
  check("no findings array ⇒ NO_FINDINGS", R.buildRemediationPlan("x").code === "NO_FINDINGS" && R.buildRemediationPlan(null).code === "NO_FINDINGS");
  check("empty findings ⇒ ok empty plan", R.buildRemediationPlan([]).ok === true && R.buildRemediationPlan([]).items.length === 0);
  check("missing before/after state ⇒ MISSING_STATE", R.verifyRemediation({ before: {} }).code === "MISSING_STATE" && R.verifyRemediation(null).code === "MISSING_STATE");
  check("no auto-fix: note states no real repo modified", /No real repo was modified/.test(R.verifyRemediation({ before, after: afterFull, findings: f2 }).note) && /no auto-fix applied/.test(plan.note));

  process.stdout.write("\n" + (failures === 0 ? "ALL PASS — cra-remediation-engine (classify/prioritise; no invented CVE/score/version; no-known-fix⇒investigate; before/after SBOM diff; closure from AFTER evidence only; new-HIGH blocks; no auto-fix; fail-closed)" : failures + " FAIL") + "\n");
  process.exit(failures === 0 ? 0 : 1);
}
function byIdRes(resolutions: any[], id: string): string { const r = resolutions.find((x: any) => x.id === id); return r ? r.resolution : "(none)"; }
main();
export {};
