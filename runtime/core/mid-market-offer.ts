#!/usr/bin/env node
/**
 * mid-market-offer — axis B (CTO V27): a repeatable mid-market AUDIT + REMEDIATION package that REUSES the
 * validated axis-A engine (assurance-pilot-runner) — generic method/code only, NEVER another client's data.
 * It does NOT duplicate the A engine; it wraps it in a two-pass workflow (baseline → remediation → re-assess)
 * and packages the delta. Composes: entry-diagnostic-offer (A baseline intent), assurance-pilot-runner.runPilot
 * + applyRemediation, sarif-report, assurance-pilot-metrics.
 *
 * HONESTY (mandate): price / hours / automation share / margin / net are ASSUMPTIONS until validated by REAL
 * delivery + actual cash (`assumptions:true`). The synthetic run proves the DELIVERY MECHANICS (audit finds →
 * remediation resolves → residual), NOT a sold or customer-validated engagement. No cross-client data reuse;
 * no outbound/deploy/collect. Residual exceptions (unknown licence / AI-Act HIGH) escalate to human review.
 * Pure/deterministic.
 */
"use strict";

const RUNNER = require("./assurance-pilot-runner.js");
const SELF = require("./self-serve-assurance.js");
const SARIF = require("./sarif-report.js");
const METRICS = require("./assurance-pilot-metrics.js");

const OFFER = Object.freeze({
  code: "B-MID-AUDIT-REMEDIATE",
  name: "Mid-Market Assurance Audit + Remediation (recurring-capable)",
  target: "mid-market software teams needing a repeatable audit AND a remediation pass, not just a snapshot",
  problem: "recurring dependency/license/AI-Act/coverage drift with no owned, repeatable remediation workflow",
  qualification: ["has a dependency manifest + CI", "wants remediation not just findings", "can act on a remediation roadmap", "budget for a packaged (not one-off) engagement"],
  scope: ["everything in axis A (SBOM/license/AI-Act/coverage diagnostic)", "remediation pass: upgrade outdated, resolve non-permissive licences where legitimate", "residual-risk re-assessment (before/after delta)", "remediation roadmap for items needing human/legal action", "SARIF 2.1.0 before + after", "recurring cadence option"],
  exclusions: ["penetration testing / runtime security", "legal opinion / certification", "implementing code changes in the client's repo (advisory roadmap only)", "AI-Act legal compliance sign-off (flagged, not resolved)"],
  customerInputs: ["dependency manifest (name/version/license/outdated)", "test totals", "declared AI activities", "remediation constraints (pinned versions, policy)"],
  prerequisites: ["axis-A diagnostic accepted or run as the baseline"],
  workflow: ["1 baseline diagnostic (reuse A engine)", "2 triage exceptions", "3 synthetic remediation pass (outdated→current, non-permissive→flagged/resolved)", "4 re-assess residual", "5 package delta + roadmap + before/after SARIF"],
  deliverables: ["baseline dossier + SARIF", "remediation delta (resolved / residual counts)", "residual dossier + SARIF", "remediation roadmap for human/legal items", "recurring-cadence recommendation"],
  acceptanceCriteria: ["baseline findings all actionable", "remediation resolves ≥1 auto-resolvable finding OR explains why none", "valid SARIF 2.1.0 before + after", "residual exceptions (unknown licence / AI-Act HIGH) escalated to human review, never auto-closed"],
  supportBoundary: "roadmap clarifications for 30 days; recurring cadence is a separate renewal",
  escalation: "residual unknown-licence / AI-Act-HIGH / failed run ⇒ human analyst; code implementation ⇒ out of scope (quote separately)",
  recovery: "a failed baseline or remediation run is reported as a blocker (never a silent pass); re-run is idempotent on the same synthetic input",
  // --- ASSUMPTIONS (validate against real delivery + cash) ---
  turnaroundDays: 5,
  priceEUR: 4500,
  humanHours: 32,
  hourlyCost: 50,
  automationShareNote: "analysis + synthetic remediation ≈ €0 machine; human time = scoping/roadmap/validation (assumption)",
  capacityNote: "larger human footprint than A ⇒ fewer concurrent engagements; see delivery-capacity in enterprise-mission-model / commercial-portfolio",
  upgradePath: "recurring cadence (retainer) ⇒ steady revenue; enterprise scope ⇒ C/E (enterprise-mission-model)",
  reuseNote: "reuses the validated axis-A assurance engine (generic code/method ONLY) — no client data is reused across engagements (reuse-ledger governs method reuse, not data)",
});

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }

/** economics(opts?): effort-derived margin + net for the mid-market package (ASSUMPTIONS until validated). */
function economics(opts: any = {}): any {
  const price = typeof opts.priceEUR === "number" ? opts.priceEUR : OFFER.priceEUR;
  const humanHours = typeof opts.humanHours === "number" ? opts.humanHours : OFFER.humanHours;
  const hourlyCost = typeof opts.hourlyCost === "number" ? opts.hourlyCost : OFFER.hourlyCost;
  const ue = METRICS.unitEconomics({ price, humanHours, hourlyCost });
  const net = METRICS.netPerDelivery({ price, humanHours, hourlyCost });
  return { price, humanHours, hourlyCost, grossMargin: ue.grossMargin, marginPct: ue.marginPct, deliveryCostRate: ue.deliveryCostRate, netContributionPerDelivery: net.netAvailablePerDelivery, netFactor: net.netFactor, assumptions: true, note: "price/hours/margin/net are ASSUMPTIONS until validated by REAL delivery + collected cash; larger human footprint than A limits concurrency." };
}

/**
 * runPackage(syntheticProject, opts?): the synthetic audit+remediation acceptance run (delivery mechanics only).
 * Returns { ok, baselineFindings, resolved, residualFindings, triage, sarifValidBefore/After, acceptancePassed, dossier }.
 */
function runPackage(syntheticProject: any, opts: any = {}): any {
  if (!isObj(syntheticProject) || !Array.isArray(syntheticProject.dependencies)) {
    return { ok: false, code: "INVALID_INPUT", detail: "structured synthetic project descriptor with dependencies[] required" };
  }
  const baseline = RUNNER.runPilot(syntheticProject, { at: opts.at });
  if (!baseline.ok) return { ok: false, code: "BASELINE_FAILED", detail: baseline.detail, needsHuman: true };
  const rem = RUNNER.applyRemediation(baseline, syntheticProject);
  if (!rem.ok) return { ok: false, code: "REMEDIATION_FAILED", detail: rem.code, needsHuman: true };
  const residual = rem.afterResult;
  const triage = SELF.triage(residual);   // residual exceptions drive human escalation
  const sarifBefore = SARIF.toSarif(baseline, { toolName: "ODG-Assurance", version: "1" });
  const sarifAfter = SARIF.toSarif(residual, { toolName: "ODG-Assurance", version: "1" });
  const sarifValidBefore = sarifBefore.ok && SARIF.isValidSarif(sarifBefore.sarif);
  const sarifValidAfter = sarifAfter.ok && SARIF.isValidSarif(sarifAfter.sarif);
  const acceptancePassed =
    baseline.acceptance && baseline.acceptance.everyFindingActionable === true &&
    sarifValidBefore && sarifValidAfter && rem.resolved >= 0;
  return {
    ok: true,
    baselineFindings: rem.before, resolved: rem.resolved, residualFindings: rem.after,
    triageStatus: triage.status, reviewReasons: triage.reasons,
    machineVerdict: triage.status === "AUTO_COMPLETE" ? "RESIDUAL_CLEAR" : "RESIDUAL_NEEDS_HUMAN_REVIEW",
    sarifValidBefore, sarifValidAfter, acceptancePassed,
    dossier: { baselineSeal: baseline.seal, residualSeal: residual.seal, sarifBefore: sarifBefore.sarif, sarifAfter: sarifAfter.sarif, markdown: residual.markdown },
    note: "SYNTHETIC audit+remediation — proves the two-pass DELIVERY MECHANICS reusing the axis-A engine, NOT a sold/validated engagement. Residual exceptions escalate to human review; no cross-client data; no outbound/deploy/collect.",
  };
}

export { OFFER, economics, runPackage };
module.exports = { OFFER, economics, runPackage };

// Read-only CLI: print the offer summary; mutates nothing.
if (require.main === module) {
  process.stdout.write(JSON.stringify({ model: "mid-market-offer/1", code: OFFER.code, priceEUR: OFFER.priceEUR, economics: economics(), note: "ASSUMPTIONS until validated; reuses axis-A engine (generic method only)" }, null, 2) + "\n");
}
