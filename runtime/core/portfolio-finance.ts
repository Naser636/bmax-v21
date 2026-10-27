#!/usr/bin/env node
/**
 * portfolio-finance — consolidated A–F net-cash model (CTO V29). COMPOSES commercial-portfolio.projectPortfolio
 * (per-axis monthly signed/invoiced/cashed) + net-cash-model.netFromGross/requiredGrossForNet (gross→net with
 * taxes/social SEPARATE) — it does NOT build a competing financial system.
 *
 * HARD HONESTY (mandate): ACTUAL collected net (`actualNetCollected`, evidenced, default €0) is kept SEPARATE from
 * the MODEL's `forecastNetAvailable` (never cash). The €500k gap is measured against ACTUAL only. Taxes/social are
 * in `levies` (not in gross margin). Partner commissions flow through `netRates.commissionRate` into direct costs.
 * Signed ≠ invoiced ≠ cashed ≠ net; forecast ≠ actual; every price/conversion/rate is an ASSUMPTION. No axis input
 * ⇒ NO_DATA (never invented). €500k is never lowered to fit. Pure/deterministic.
 */
"use strict";

const CP = require("./commercial-portfolio.js");
const NCM = require("./net-cash-model.js");

const NET_TARGET_DEFAULT = 500000;
const SCENARIO_FACTOR: Readonly<Record<string, number>> = Object.freeze({ base: 1.0, downside: 0.6, upside: 1.3 });

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function r2(x: number): number { return Math.round(x * 100) / 100; }

/**
 * buildModel({ axes, scenario, netRates, collectedNet, netTarget }):
 * axes = { A:{...revenue-schedule params}, B:{...}, ... } (object keyed by axis id). scenario ∈ base|downside|upside
 * scales prospectsPerMonth (labeled). Returns consolidated + per-axis + actual-vs-forecast + required-gross + gap.
 */
function buildModel(input: any = {}): any {
  const netTarget = typeof input.netTarget === "number" && input.netTarget > 0 ? input.netTarget : NET_TARGET_DEFAULT;
  const scenario = SCENARIO_FACTOR[input.scenario] !== undefined ? input.scenario : "base";
  const factor = SCENARIO_FACTOR[scenario];

  if (!isObj(input.axes) || Object.keys(input.axes).length === 0) {
    return { ok: true, status: "NO_DATA", scenario, netTarget, note: "no axis inputs supplied — nothing modeled (unknown stays unknown, not zero-revenue invented)." };
  }

  // Scenario-scaled tracks (scale the demand assumption `monthlyProspects`, honestly labeled).
  const tracks = Object.keys(input.axes).map((id) => {
    const p = isObj(input.axes[id]) ? input.axes[id] : {};
    const scaled = Object.assign({}, p, { label: id, monthlyProspects: (typeof p.monthlyProspects === "number" ? p.monthlyProspects : 0) * factor });
    return scaled;
  });

  const port = CP.projectPortfolio(tracks);
  const grossCashed = port.consolidated.cashedWithinHorizon;
  const net = NCM.netFromGross(grossCashed, input.netRates);
  const required = NCM.requiredGrossForNet(netTarget, input.netRates);

  // Per-axis cashed + share (A–F totals must reconcile with the consolidated gross).
  const perAxis = port.trackShares.map((t: any) => ({ axis: t.label, cashedGross: t.cashed, sharePct: t.sharePct }));
  const sumAxis = r2(perAxis.reduce((s: number, a: any) => s + a.cashedGross, 0));
  const reconciles = Math.abs(sumAxis - grossCashed) < 1;

  // ACTUAL vs FORECAST — the central honesty boundary.
  const actualNetCollected = typeof input.collectedNet === "number" && input.collectedNet >= 0 ? input.collectedNet : 0;

  return {
    ok: true,
    scenario, scenarioFactor: factor, netTarget,
    consolidated: {
      grossCashedForecast: grossCashed,               // MODEL (cashed within horizon), NOT actual cash
      monthlyCashedForecast: port.monthlyCashed,
      collectedAfterBadDebt: net.collected,
      directCosts: net.directCosts,                   // incl. partner commissions (netRates.commissionRate)
      operatingNet: net.operatingNet,
      levies: net.levies,                             // social + income tax SEPARATE (estimates, professional validation)
      forecastNetAvailable: net.netAvailable,         // MODEL net — NOT collected cash
      netFactor: net.netFactor,
      concentrationRisk: port.concentrationRisk,
      capacityFlag: port.capacityFlag,
    },
    perAxis,
    reconciliation: { sumPerAxisGross: sumAxis, consolidatedGross: grossCashed, reconciles },
    actualVsForecast: {
      actualNetCollected,                             // evidenced receipts ONLY (default €0)
      forecastNetAvailable: net.netAvailable,         // model — never counted as cash
      gapToTargetOnActual: r2(Math.max(0, netTarget - actualNetCollected)),
      note: "gapToTargetOnActual uses ACTUAL collected net only; forecastNetAvailable is a MODEL output, NOT cash. Signed≠invoiced≠cashed≠net.",
    },
    required,                                         // requiredGrossForNet(netTarget)
    notes: [
      "ASSUMPTIONS: prices, conversions, sales cycle, payment lag, churn, rates — all unvalidated. Scenario scales demand (base/downside/upside).",
      "Taxes/social in levies are SEPARATE estimates requiring qualified professional validation; NOT embedded in gross margin.",
      "Partner commissions flow via netRates.commissionRate into directCosts (reduce net).",
      "€500k NET is binding and never lowered; the gap is measured against ACTUAL collected net (currently €0 unless evidenced).",
    ],
  };
}

/** scenarios({ axes, netRates, collectedNet, netTarget }): base + downside + upside for sensitivity. */
function scenarios(input: any = {}): any {
  const mk = (s: string) => buildModel(Object.assign({}, input, { scenario: s }));
  return { base: mk("base"), downside: mk("downside"), upside: mk("upside") };
}

export { buildModel, scenarios, NET_TARGET_DEFAULT, SCENARIO_FACTOR };
module.exports = { buildModel, scenarios, NET_TARGET_DEFAULT, SCENARIO_FACTOR };

if (require.main === module) {
  process.stdout.write(JSON.stringify({ model: "portfolio-finance/1", composes: ["commercial-portfolio", "net-cash-model"], rule: "forecast≠actual; levies separate; commissions in cost; €500k never lowered; gap on actual" }, null, 2) + "\n");
}
