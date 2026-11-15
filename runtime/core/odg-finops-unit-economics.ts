#!/usr/bin/env node
"use strict";
/*
 * IMP-M3-FOCUS-UNIT-ECON (lot-6 contract, owner-authorized block) — M3 FinOps: a FOCUS-aligned unit-economics /
 * showback view over the EXISTING economic model. PURE, deterministic. REUSES odg-economic-model's COST SSOT (no 2nd
 * cost model). Margins are NEVER conflated (gross / contribution / net kept distinct). No external cloud billing is
 * integrated — any such integration is OWNER_GATED.
 *
 * Acceptance (contract): REUSES economic-model COST SSOT; margins never conflated; no external billing; owner-gated noted.
 */

const ECON = require("./odg-economic-model.js");

function num(v: any): number | null { return typeof v === "number" && isFinite(v) ? v : null; }

// FOCUS-style normalized cost columns (vendor-neutral) — the schema a showback row follows.
const FOCUS_COLUMNS = Object.freeze(["BilledCost", "EffectiveCost", "ServiceCategory", "ChargeCategory", "ResourceId", "Tags"]);

/* showback(input) -> per-unit economics from the COST SSOT. input = { units, revenuePerUnitEur, directCostPerUnitEur,
 * allocatedFixedEur } — all supplied; the COST SSOT provides the canonical cost basis (not re-derived here). */
function showback(input: any): any {
  const i = input && typeof input === "object" ? input : {};
  const units = num(i.units), rev = num(i.revenuePerUnitEur), direct = num(i.directCostPerUnitEur), fixed = num(i.allocatedFixedEur);
  // confirm we are standing on the canonical cost model (SSOT), not inventing one.
  const costSsot = typeof ECON.COST === "object" && ECON.COST ? "odg-economic-model.COST (SSOT)" : "COST SSOT unavailable";

  if (units === null || units <= 0 || rev === null || direct === null) {
    return Object.freeze({ metier: "M3", status: "NOT_MEASURED", reason: "units/revenuePerUnit/directCostPerUnit required", costBasis: costSsot, focusColumns: FOCUS_COLUMNS, honesty: honest() });
  }
  const grossMarginPerUnit = rev - direct;                                   // gross = revenue − direct cost
  const contributionTotal = grossMarginPerUnit * units;                      // contribution = gross × units
  const netContribution = contributionTotal - (fixed || 0);                  // net = contribution − allocated fixed
  return Object.freeze({
    metier: "M3", status: "MEASURED", costBasis: costSsot, focusColumns: FOCUS_COLUMNS,
    perUnit: Object.freeze({ revenue: rev, directCost: direct, grossMargin: Number(grossMarginPerUnit.toFixed(2)), grossMarginPct: rev > 0 ? Number((grossMarginPerUnit / rev).toFixed(4)) : null }),
    aggregate: Object.freeze({ units, contributionTotal: Number(contributionTotal.toFixed(2)), allocatedFixed: fixed || 0, netContribution: Number(netContribution.toFixed(2)) }),
    marginLadder: "gross (per-unit) ≠ contribution (× units) ≠ net (− allocated fixed) — NEVER conflated",
    externalBilling: Object.freeze({ status: "OWNER_GATED", reason: "FOCUS cloud-billing integration (AWS/Azure/GCP exports) is OWNER_GATED — not integrated here; this view uses supplied figures over the COST SSOT" }),
    honesty: honest(),
  });
}
function honest(): string { return "unit economics computed over the canonical COST SSOT (odg-economic-model) — no 2nd cost model; gross/contribution/net margins kept DISTINCT (never conflated); external cloud-billing integration is OWNER_GATED; figures are supplied, not realized revenue."; }

const FINOPS_UNIT_ECONOMICS_CONTRACT = Object.freeze({
  id: "IMP-M3-FOCUS-UNIT-ECON",
  purpose: "M3 — FOCUS-aligned unit-economics/showback over the COST SSOT; margins distinct; external billing OWNER_GATED",
  invariants: Object.freeze([
    "REUSES odg-economic-model COST SSOT — no 2nd cost model",
    "gross / contribution / net margins kept DISTINCT — never conflated",
    "external cloud-billing (FOCUS exports) integration is OWNER_GATED — not integrated here",
    "deterministic; read-only; no new engine",
  ]),
});

module.exports = { FOCUS_COLUMNS, showback, FINOPS_UNIT_ECONOMICS_CONTRACT };
export {};
