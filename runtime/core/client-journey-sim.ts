#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V60 (§3) — CLIENT-JOURNEY SIMULATION ENGINE. A PURE, deterministic engine that runs a complete SYNTHETIC
 * client journey for a métier — profile → need → order → subscription → delivery → support/incident → quality/delay/cost
 * metrics → manual-vs-automated comparison → savings per operation → satisfaction. It REUSES the canonical cost-engine
 * for all cost arithmetic (no new cost model). Every output is SIMULATED on synthetic inputs and is NEVER a real client,
 * a real sale, or an observed saving. No clock / no randomness (determinism is the point: a journey reproduces exactly).
 * Dual export. Used by odg-client-journey-sim.ts (runner). Fail-closed on malformed input.
 */

const COST = require("./cost-engine.js");

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function num(v: any): number { return typeof v === "number" && isFinite(v) ? v : 0; }
function round(n: number): number { return Number(n.toFixed(2)); }

const STAGES = Object.freeze(["profile", "need", "order", "subscription", "delivery", "support", "satisfaction"]);
const INCIDENT_SEVERITY = Object.freeze(["NONE", "LOW", "MEDIUM", "HIGH"]);

/*
 * simulateJourney(input) -> a full synthetic journey. input:
 *   { metier, profile:{ segment, size }, need:{ description, volume }, order:{ units, unitPriceEur },
 *     manualMinutesPerUnit, automatedMinutesPerUnit, manualRateEurPerHour, automatedCostPerUnitEur,
 *     qualityScore (0..1), slaDays, incident:{ severity, resolvedWithinSla } }
 * Fail-closed: a malformed input ⇒ { ok:false }.
 */
function simulateJourney(input: any): any {
  if (!isObj(input) || typeof input.metier !== "string" || !isObj(input.order)) {
    return Object.freeze({ ok: false, code: "INVALID_INPUT", reason: "input { metier, order:{units} } required", basis: "SIMULATED" });
  }
  const units = Math.max(0, Math.floor(num(input.order.units)));
  const unitPrice = num(input.order.unitPriceEur);
  const revenue = round(units * unitPrice);

  // manual vs automated cost of producing `units` (reuse cost-engine.estimate for the arithmetic, kind=SIMULATED).
  const manualRate = num(input.manualRateEurPerHour);                       // €/h of human labour
  const manualMin = num(input.manualMinutesPerUnit);
  const manualCostLine = COST.estimate({ resource: "manual_labour", units: units * (manualMin / 60), kind: "SIMULATED" }, { manual_labour: manualRate });
  const manualCost = round(manualCostLine.cost);
  const autoPerUnit = num(input.automatedCostPerUnitEur);
  const autoCostLine = COST.estimate({ resource: "automated_unit", units, kind: "SIMULATED" }, { automated_unit: autoPerUnit });
  const automatedCost = round(autoCostLine.cost);

  const savings = round(manualCost - automatedCost);
  const savingsPct = manualCost > 0 ? Number((savings / manualCost).toFixed(4)) : 0;

  // delivery: automated minutes/unit vs manual; SLA check.
  const autoMin = num(input.automatedMinutesPerUnit);
  const manualDeliveryHours = round((units * manualMin) / 60);
  const autoDeliveryHours = round((units * autoMin) / 60);
  const slaDays = num(input.slaDays);
  const autoDeliveryDays = round(autoDeliveryHours / 8);                     // 8 working-hours/day
  const slaMet = slaDays > 0 ? autoDeliveryDays <= slaDays : null;

  // quality + incident + satisfaction (deterministic from declared inputs).
  const quality = Math.min(1, Math.max(0, num(input.qualityScore)));
  const inc = isObj(input.incident) ? input.incident : { severity: "NONE", resolvedWithinSla: true };
  const incidentSeverity = INCIDENT_SEVERITY.includes(inc.severity) ? inc.severity : "NONE";
  const incidentResolved = inc.resolvedWithinSla !== false;
  // satisfaction: quality-weighted, penalised by SLA miss / unresolved incident. Deterministic, bounded [0,1].
  let satisfaction = quality;
  if (slaMet === false) satisfaction -= 0.2;
  if (!incidentResolved) satisfaction -= 0.3;
  if (incidentSeverity === "HIGH") satisfaction -= 0.1;
  satisfaction = Number(Math.min(1, Math.max(0, satisfaction)).toFixed(3));

  const stages = {
    profile: isObj(input.profile) ? input.profile : { segment: "UNKNOWN", size: "UNKNOWN" },
    need: isObj(input.need) ? input.need : { description: "(not provided)" },
    order: { units, unitPriceEur: unitPrice, revenueEur: revenue },
    subscription: input.subscription || { model: "one-off" },
    delivery: { manualDeliveryHours, autoDeliveryHours, autoDeliveryDays, slaDays: slaDays || null, slaMet },
    support: { incidentSeverity, incidentResolvedWithinSla: incidentResolved },
    satisfaction: { score: satisfaction, qualityScore: quality },
  };

  return Object.freeze({
    ok: true, metier: input.metier, basis: "SIMULATED (synthetic client; never a real sale or observed saving)",
    revenueEur: revenue, manualCostEur: manualCost, automatedCostEur: automatedCost,
    savingsEur: savings, savingsPct, savingsPerUnitEur: units > 0 ? round(savings / units) : 0,
    slaMet, satisfaction, incidentSeverity, stages,
    invariant: "SIMULATED: synthetic client, synthetic order; savings are a modelled comparison, never an observed or client-validated saving",
  });
}

/* scaleJourney(journey, clients) -> aggregate over N synthetic clients (linear, deterministic). */
function scaleJourney(journey: any, clients: any): any {
  if (!isObj(journey) || journey.ok !== true) return Object.freeze({ ok: false, reason: "needs a valid journey" });
  const n = Math.max(0, Math.floor(num(clients)));
  return Object.freeze({
    ok: true, clients: n, basis: "SIMULATED",
    totalRevenueEur: round(journey.revenueEur * n), totalManualCostEur: round(journey.manualCostEur * n),
    totalAutomatedCostEur: round(journey.automatedCostEur * n), totalSavingsEur: round(journey.savingsEur * n),
    note: "linear scale over N SYNTHETIC clients — a capacity/economics projection, NOT a demand forecast or observed result",
  });
}

const CLIENT_JOURNEY_SIM_CONTRACT = Object.freeze({
  id: "V60-CLIENT-JOURNEY-SIM", source: "CTO V60 §3 — synthetic client-journey simulation for OWNER_GATED preparation",
  reuses: Object.freeze(["cost-engine.estimate (THE canonical cost model — composed, not duplicated)"]),
  stages: STAGES,
  notAuthority: "a synthetic simulator for preparation/testing; it produces no real client, no real sale, no observed/validated saving",
  invariants: Object.freeze([
    "pure/deterministic: same synthetic input ⇒ identical journey (no clock/random)",
    "every figure is SIMULATED — never OBSERVED, never CLIENT_VALIDATED",
    "cost arithmetic is delegated to the canonical cost-engine (no second cost model)",
    "fail-closed: malformed input ⇒ ok:false, never a fabricated journey",
  ]),
});

module.exports = { STAGES, INCIDENT_SEVERITY, simulateJourney, scaleJourney, CLIENT_JOURNEY_SIM_CONTRACT };

if (require.main === module) {
  process.stdout.write(JSON.stringify(CLIENT_JOURNEY_SIM_CONTRACT, null, 2) + "\n");
}
export {};
