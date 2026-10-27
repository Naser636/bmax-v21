#!/usr/bin/env node
/**
 * recurring-offer — axis B recurrence (CTO V28 Priority B): a recurring cadence WRAPPER over the mid-market
 * audit+remediation package (mid-market-offer) — it REUSES that package per cycle, does not duplicate it, and
 * reuses assurance-pilot-metrics for economics.
 *
 * HONESTY (mandate): this is NOT an SLA, NOT continuous monitoring, NOT certification — response is BEST-EFFORT
 * per cycle (explicitly disclaimed). Price / workload / retention / margin are ASSUMPTIONS until real delivery +
 * cash. A recurring run is SYNTHETIC — it proves the re-assessment cadence mechanics, not a sold retainer or a
 * real customer. Pure/deterministic; no outbound/deploy/collect.
 */
"use strict";

const MID = require("./mid-market-offer.js");
const METRICS = require("./assurance-pilot-metrics.js");

const OFFER = Object.freeze({
  code: "B-RECURRING",
  name: "Recurring Assurance Retainer (audit + evidence refresh)",
  basis: "wraps the B-MID-AUDIT-REMEDIATE package on a cadence",
  cadence: "MONTHLY or QUARTERLY (client choice)",
  includedWork: ["re-run the audit each cycle", "remediation delta vs last cycle", "evidence/SBOM refresh", "updated before/after SARIF", "trend of resolved vs residual"],
  boundaries: ["fixed scope per cycle (same as B)", "N cycles per renewal term"],
  responseExpectation: "BEST-EFFORT within the agreed cycle window — NOT a contractual SLA, NOT real-time/continuous monitoring",
  exclusions: ["24/7 monitoring", "incident response", "guaranteed response times (no SLA)", "certification", "code implementation (advisory only)"],
  reassessmentWorkflow: ["each cycle: baseline → remediation → residual (reuse B runPackage)", "compare residual vs previous cycle", "flag new exceptions for human review"],
  reporting: "per-cycle dossier (dossier + before/after SARIF) + a trend summary across cycles",
  evidenceRefresh: "each cycle refreshes the SBOM/findings so operational evidence stays current (ties to control-evidence-freshness TTL)",
  renewalCriteria: ["residual trend improving or stable", "client acts on roadmap", "scope unchanged"],
  // --- ASSUMPTIONS ---
  monthlyPriceEUR: 1500,
  workloadHoursPerCycle: 10,
  hourlyCost: 50,
  retentionAssumptionPct: 70,   // HYPOTHESIS monthly retention
  supportCapacityNote: "recurring load competes with new delivery — see commercial-portfolio capacity ceiling",
  marginSensitivity: "net recurring revenue is highly sensitive to retention; a drop from 70%→50% materially cuts annualized value",
  upgradePath: "scope growth ⇒ C/E (enterprise-mission-model)",
  disclaimer: "ODG does NOT provide an SLA, continuous monitoring, or certification; recurring = periodic re-assessment only",
});

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function r2(x: number): number { return Math.round(x * 100) / 100; }

/** economics(opts?): per-cycle margin + retention-adjusted annualized recurring value (ASSUMPTIONS). */
function economics(opts: any = {}): any {
  const monthlyPrice = typeof opts.monthlyPriceEUR === "number" ? opts.monthlyPriceEUR : OFFER.monthlyPriceEUR;
  const hours = typeof opts.workloadHoursPerCycle === "number" ? opts.workloadHoursPerCycle : OFFER.workloadHoursPerCycle;
  const hourlyCost = typeof opts.hourlyCost === "number" ? opts.hourlyCost : OFFER.hourlyCost;
  const retentionPct = typeof opts.retentionAssumptionPct === "number" ? opts.retentionAssumptionPct : OFFER.retentionAssumptionPct;
  const ue = METRICS.unitEconomics({ price: monthlyPrice, humanHours: hours, hourlyCost });
  // Retention-adjusted expected months billed over a year (geometric-ish, simplified): sum of retention^m, m=0..11.
  const ret = Math.max(0, Math.min(1, retentionPct / 100));
  let expectedMonthsBilled = 0, p = 1; for (let m = 0; m < 12; m++) { expectedMonthsBilled += p; p *= ret; }
  return {
    monthlyPrice, workloadHoursPerCycle: hours, retentionPct,
    perCycleGrossMargin: ue.grossMargin, perCycleMarginPct: ue.marginPct,
    expectedMonthsBilledYr1: r2(expectedMonthsBilled),
    annualizedGrossRevenue: r2(monthlyPrice * expectedMonthsBilled),
    annualizedGrossMargin: r2(ue.grossMargin * expectedMonthsBilled),
    assumptions: true,
    note: "ASSUMPTIONS until validated by real delivery + collected cash. Retention-adjusted (not 12× flat). GROSS not net (convert via net-cash-model); taxes/social separate. NOT an SLA.",
  };
}

/**
 * runCycles(syntheticProject, opts?): run N synthetic re-assessment cycles (reusing the B package) + a trend.
 * opts: { cycles=3, at:[isoDates] }. Returns per-cycle residual counts + a resolved/residual trend.
 */
function runCycles(syntheticProject: any, opts: any = {}): any {
  if (!isObj(syntheticProject) || !Array.isArray(syntheticProject.dependencies)) return { ok: false, code: "INVALID_INPUT" };
  const n = Number.isInteger(opts.cycles) && opts.cycles > 0 ? opts.cycles : 3;
  const dates = Array.isArray(opts.at) ? opts.at : [];
  const cycles: any[] = [];
  for (let i = 0; i < n; i++) {
    const pkg = MID.runPackage(syntheticProject, { at: dates[i] });
    if (!pkg.ok) return { ok: false, code: "CYCLE_FAILED", cycle: i, detail: pkg.code };
    cycles.push({ cycle: i + 1, at: dates[i] || null, baselineFindings: pkg.baselineFindings, resolved: pkg.resolved, residualFindings: pkg.residualFindings, residualNeedsHuman: pkg.triageStatus === "NEEDS_HUMAN_REVIEW" });
  }
  const trend = { cycles: cycles.length, residualStart: cycles[0].residualFindings, residualEnd: cycles[cycles.length - 1].residualFindings, improvingOrStable: cycles[cycles.length - 1].residualFindings <= cycles[0].residualFindings };
  return { ok: true, cycles, trend, note: "SYNTHETIC recurring cadence — proves periodic re-assessment mechanics (reusing the B package), NOT a sold retainer, NOT an SLA, NOT monitoring." };
}

export { OFFER, economics, runCycles };
module.exports = { OFFER, economics, runCycles };

if (require.main === module) {
  process.stdout.write(JSON.stringify({ model: "recurring-offer/1", code: OFFER.code, economics: economics(), disclaimer: OFFER.disclaimer }, null, 2) + "\n");
}
