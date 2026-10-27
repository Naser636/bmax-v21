#!/usr/bin/env node
/**
 * entry-diagnostic-offer — axis A (CTO V26 Priority B): the finalized ENTRY diagnostic offer specification +
 * effort-derived economics + a synthetic end-to-end acceptance run. It COMPOSES existing modules and invents
 * nothing sellable:
 *   - assurance-pilot-runner.runPilot      → the actual (synthetic) delivery engine (findings + seal + acceptance)
 *   - self-serve-assurance.triage          → AUTO_COMPLETE vs NEEDS_HUMAN_REVIEW routing
 *   - sarif-report.toSarif                 → interoperable SARIF 2.1.0 deliverable
 *   - assurance-pilot-metrics.unitEconomics/netPerDelivery → price-from-effort margin + net contribution
 *
 * HONESTY (mandate): every price / hour / automation share / margin / net is an ASSUMPTION until validated by
 * REAL delivery + actual cash — flagged `assumptions:true`. The synthetic acceptance run proves the DELIVERY
 * MECHANICS, not a sold engagement or a real customer. No outbound, no deployment, no collection. Pure/deterministic.
 */
"use strict";

const RUNNER = require("./assurance-pilot-runner.js");
const SELF = require("./self-serve-assurance.js");
const SARIF = require("./sarif-report.js");
const METRICS = require("./assurance-pilot-metrics.js");

// The finalized entry offer. Prices/hours/turnaround are HYPOTHESIS inputs (a human estimate), not measured cash.
const OFFER = Object.freeze({
  code: "A-ENTRY-DIAG",
  name: "Entry Software-Assurance Diagnostic",
  target: "small/mid software teams shipping dependencies + (optionally) AI features, needing a fast external assurance snapshot",
  problem: "no quick, evidence-backed read on dependency/license/AI-Act/test-coverage risk before a release or a customer security review",
  scope: ["SBOM-level dependency + license review", "outdated/maintenance flags", "EU AI-Act Art.50 transparency check (declared activities)", "test-coverage ratio read", "actionable findings with remediation + evidence", "SARIF 2.1.0 export"],
  exclusions: ["penetration testing", "source-level SAST/secret scanning", "legal opinion / certification", "runtime/production assessment", "remediation implementation (that is axis B)"],
  requiredInputs: ["dependency manifest (name/version/license/outdated)", "test totals (passing/total)", "declared AI activities (if any)"],
  deliverables: ["findings dossier (markdown) with provenance seal", "SARIF 2.1.0 file", "triage verdict (auto-complete vs needs-human-review) with reasons"],
  evidence: "each finding carries area + severity + remediation + evidence; dossier sealed (sha256) + audit-chainable",
  format: "markdown dossier + SARIF 2.1.0 JSON",
  limitations: ["SYNTHETIC/declared inputs only — not a live scan of private infrastructure", "structure-level, not a legal/accredited assessment", "no certification implied"],
  acceptanceCriteria: ["every finding is actionable (severity + remediation + evidence)", "a valid SARIF 2.1.0 log is produced", "unknown-license / AI-Act-HIGH / failed-run / >8 findings route to human review (not silently auto-completed)"],
  // --- ASSUMPTIONS (validate against real delivery + cash) ---
  turnaroundDays: 2,
  priceEUR: 900,
  humanHours: 6,
  hourlyCost: 50,
  automationShareNote: "machine analysis ≈ €0 (measured); human time = scoping/interpretation/readout (assumption)",
  // --- lifecycle ---
  onboarding: "client submits the structured descriptor; no credentials/secrets collected; synthetic/declared data only",
  dataHandling: "inputs treated as confidential; no cross-client reuse of data (only generic methods/assets per reuse-ledger)",
  retention: "dossier + seal retained for the engagement; purged on request",
  escalation: "NEEDS_HUMAN_REVIEW ⇒ human analyst; out-of-scope asks ⇒ decline or quote axis B/C/E",
  upgradePathToB: "recurring/packaged audit + remediation (reuses the same engine + validated assets)",
  referralToCE: "enterprise scope / €8k–€50k ⇒ qualify via C/E (enterprise-mission-model); never price to a target",
});

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }

/** economics(opts?): price-from-effort margin + net contribution for the entry offer (ASSUMPTIONS until validated). */
function economics(opts: any = {}): any {
  const price = typeof opts.priceEUR === "number" ? opts.priceEUR : OFFER.priceEUR;
  const humanHours = typeof opts.humanHours === "number" ? opts.humanHours : OFFER.humanHours;
  const hourlyCost = typeof opts.hourlyCost === "number" ? opts.hourlyCost : OFFER.hourlyCost;
  const ue = METRICS.unitEconomics({ price, humanHours, hourlyCost });
  const net = METRICS.netPerDelivery({ price, humanHours, hourlyCost });
  return {
    price, humanHours, hourlyCost,
    grossMargin: ue.grossMargin, marginPct: ue.marginPct, deliveryCostRate: ue.deliveryCostRate,
    netContributionPerDelivery: net.netAvailablePerDelivery, netFactor: net.netFactor,
    assumptions: true,
    note: "price/hours/margin/net are ASSUMPTIONS until validated by REAL delivery + actual collected cash. Gross machine cost ≈ €0 (measured); human time dominates. NET per delivery routed through economic-profiles.",
  };
}

/**
 * runEntryDiagnostic(syntheticProject, opts?): the synthetic END-TO-END acceptance run — delivery mechanics only.
 * Returns { ok, triageStatus, machineVerdict, sarifValid, acceptancePassed, dossier } or fail-closed.
 */
function runEntryDiagnostic(syntheticProject: any, opts: any = {}): any {
  if (!isObj(syntheticProject) || !Array.isArray(syntheticProject.dependencies)) {
    return { ok: false, code: "INVALID_INPUT", detail: "structured synthetic project descriptor with dependencies[] required" };
  }
  const result = RUNNER.runPilot(syntheticProject, { at: opts.at });
  if (!result.ok) return { ok: false, code: "RUN_FAILED", detail: result.detail, needsHuman: true };
  const triage = SELF.triage(result);
  const sarif = SARIF.toSarif(result, { toolName: "ODG-Assurance", version: "1" });
  const sarifValid = sarif.ok && SARIF.isValidSarif(sarif.sarif);
  const everyFindingActionable = result.acceptance && result.acceptance.everyFindingActionable === true;
  // Acceptance per the offer's own criteria: actionable findings + valid SARIF + exceptions correctly routed to human.
  const acceptancePassed = everyFindingActionable && sarifValid;
  return {
    ok: true,
    triageStatus: triage.status,
    machineVerdict: triage.status === "AUTO_COMPLETE" ? "DELIVERABLE_WITHOUT_HUMAN" : "HOLD_FOR_HUMAN_REVIEW",
    reviewReasons: triage.reasons,
    sarifValid,
    acceptancePassed,
    dossier: { seal: result.seal, findingCount: result.findings.length, markdown: result.markdown, sarif: sarif.sarif },
    note: "SYNTHETIC acceptance run — proves the DELIVERY MECHANICS, NOT a sold engagement or a real customer. No outbound, no deployment, no collection.",
  };
}

export { OFFER, economics, runEntryDiagnostic };
module.exports = { OFFER, economics, runEntryDiagnostic };

// Read-only CLI: print the offer spec summary; mutates nothing.
if (require.main === module) {
  process.stdout.write(JSON.stringify({ model: "entry-diagnostic-offer/1", code: OFFER.code, priceEUR: OFFER.priceEUR, economics: economics(), note: "prices/hours = ASSUMPTIONS until validated by real delivery + cash" }, null, 2) + "\n");
}
