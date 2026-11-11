#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V62 (§7) — SYNTHETIC-ENTERPRISE LIFECYCLE ENGINE. A PURE, deterministic engine that runs a full SYNTHETIC
 * commercial+operational lifecycle for a virtual company against a métier:
 *   prospection → qualification → quote → order → production → delivery → invoicing(TEST) → support → renewal.
 * It REUSES client-journey-sim (delivery/cost/satisfaction, which itself reuses cost-engine) — no new cost model. Every
 * company, order, contract and invoice is SYNTHETIC/FICTIF, clearly labelled; nothing here is a real client, sale, or
 * payment. Difficulty tiers (SMALL/MID/LARGE/INTERNATIONAL/HIGH_VOLUME/ADVERSARIAL) scale volume + objection/incident
 * pressure. No clock/random (deterministic). Dual export. Fail-closed on malformed input.
 */

const CJ = require("./client-journey-sim.js");

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function num(v: any): number { return typeof v === "number" && isFinite(v) ? v : 0; }
function round(n: number): number { return Number(n.toFixed(2)); }

const STAGES = Object.freeze(["prospection", "qualification", "quote", "order", "production", "delivery", "invoicing", "support", "renewal"]);
const TIERS = Object.freeze({
  SMALL: { volume: 1, objectionResistance: 0.1, incidentRate: 0.05 },
  MID: { volume: 4, objectionResistance: 0.2, incidentRate: 0.1 },
  LARGE: { volume: 20, objectionResistance: 0.35, incidentRate: 0.15 },
  INTERNATIONAL: { volume: 40, objectionResistance: 0.45, incidentRate: 0.2 },
  HIGH_VOLUME: { volume: 200, objectionResistance: 0.3, incidentRate: 0.25 },
  ADVERSARIAL: { volume: 10, objectionResistance: 0.8, incidentRate: 0.6 },
});

/*
 * simulateEnterpriseLifecycle(input) -> full synthetic lifecycle. input:
 *   { metier, company:{ name, sector, size }, tier, unitPriceEur, journeyParams:{...client-journey-sim fields...} }
 * Deterministic: qualification/renewal gates are threshold functions of the tier (no randomness). Fail-closed.
 */
function simulateEnterpriseLifecycle(input: any): any {
  if (!isObj(input) || typeof input.metier !== "string" || !isObj(input.company)) {
    return Object.freeze({ ok: false, code: "INVALID_INPUT", reason: "input { metier, company:{name} } required", basis: "SIMULATED" });
  }
  const tierKey = typeof input.tier === "string" && (TIERS as any)[input.tier] ? input.tier : "MID";
  const tier = (TIERS as any)[tierKey];
  const units = Math.max(1, Math.floor(num(input.units) || tier.volume));
  const unitPrice = num(input.unitPriceEur) || 5000;

  const trace: any[] = [];
  const stage = (name: string, ok: boolean, detail: string, data: any = {}) => { trace.push({ stage: name, ok, detail, ...data }); return ok; };

  // 1 prospection — a synthetic lead exists (always, it's a test company).
  stage("prospection", true, `synthetic lead: ${input.company.name} (${input.company.sector || "sector?"}, ${input.company.size || tierKey})`);
  // 2 qualification — passes unless adversarial resistance is extreme (deterministic threshold).
  const qualified = tier.objectionResistance < 0.75;
  stage("qualification", qualified, qualified ? "need qualified; budget plausible (simulated)" : "ADVERSARIAL: qualification fails (objection resistance too high) — lead parked");
  if (!qualified) return finalize(input, tierKey, units, unitPrice, trace, null, "LOST_AT_QUALIFICATION");
  // 3 quote — produced (synthetic pricing).
  const quoteEur = round(units * unitPrice);
  stage("quote", true, `quote €${quoteEur} for ${units} units (SYNTHETIC pricing)`, { quoteEur });
  // 4 order — accepted if objection resistance below a deterministic bar.
  const ordered = tier.objectionResistance <= 0.5;
  stage("order", ordered, ordered ? `fictif order accepted (€${quoteEur})` : "objections not overcome ⇒ no order (synthetic)");
  if (!ordered) return finalize(input, tierKey, units, unitPrice, trace, null, "LOST_AT_ORDER");
  // 5+6 production + delivery — delegate to client-journey-sim (reuses cost-engine).
  const journey = CJ.simulateJourney({
    metier: input.metier, profile: { segment: input.company.sector, size: input.company.size || tierKey },
    need: { description: `${input.metier} engagement`, volume: units },
    order: { units, unitPriceEur: unitPrice },
    manualMinutesPerUnit: num(input.manualMinutesPerUnit) || 600, automatedMinutesPerUnit: num(input.automatedMinutesPerUnit) || 60,
    manualRateEurPerHour: num(input.manualRateEurPerHour) || 90, automatedCostPerUnitEur: num(input.automatedCostPerUnitEur) || 120,
    qualityScore: num(input.qualityScore) || 0.9, slaDays: num(input.slaDays) || 20,
    incident: { severity: tier.incidentRate >= 0.5 ? "HIGH" : tier.incidentRate >= 0.15 ? "MEDIUM" : "LOW", resolvedWithinSla: tier.incidentRate < 0.6 },
  });
  stage("production", journey.ok, journey.ok ? `produced ${units} units; automated cost €${journey.automatedCostEur}` : "production failed");
  stage("delivery", journey.ok && journey.slaMet !== false, journey.ok ? `delivered; SLA met=${journey.slaMet}; saving €${journey.savingsEur} (${Math.round((journey.savingsPct || 0) * 100)}%)` : "delivery failed", { savingsEur: journey.savingsEur });
  // 7 invoicing — TEST-mode only (no real payment).
  stage("invoicing", true, `TEST-mode invoice €${quoteEur} issued (no real payment; prepared≠sent≠cashed)`, { invoiceEur: quoteEur });
  // 8 support — incident handled per tier.
  const supportOk = journey.ok && (tier.incidentRate < 0.6);
  stage("support", supportOk, supportOk ? `incident ${journey.incidentSeverity} resolved within SLA` : "ADVERSARIAL: incident unresolved within SLA (synthetic)");
  // 9 renewal — depends on satisfaction + support.
  const renewed = journey.ok && supportOk && num(journey.satisfaction) >= 0.7;
  stage("renewal", renewed, renewed ? `renewed (satisfaction ${journey.satisfaction})` : `not renewed (satisfaction ${journey.ok ? journey.satisfaction : "n/a"})`);
  return finalize(input, tierKey, units, unitPrice, trace, journey, renewed ? "RENEWED" : "DELIVERED_NO_RENEWAL");
}

function finalize(input: any, tierKey: string, units: number, unitPrice: number, trace: any[], journey: any, outcome: string): any {
  const completed = trace.filter((t) => t.ok).length;
  return Object.freeze({
    ok: true, basis: "SIMULATED (virtual company, fictif contract/invoice — never a real client/sale/payment)",
    metier: input.metier, company: input.company.name, tier: tierKey, units, unitPriceEur: unitPrice,
    outcome, stagesCompleted: completed, totalStages: STAGES.length,
    revenueEur: journey ? journey.revenueEur : 0, savingsEur: journey ? journey.savingsEur : 0,
    satisfaction: journey ? journey.satisfaction : null, slaMet: journey ? journey.slaMet : null,
    trace: Object.freeze(trace),
    invariant: "every company/order/contract/invoice is SYNTHETIC/FICTIF; nothing is a real client, sale, or payment",
  });
}

const SYNTHETIC_ENTERPRISE_CONTRACT = Object.freeze({
  id: "V62-SYNTHETIC-ENTERPRISE", source: "CTO V62 §7 — synthetic virtual-enterprise lifecycle for commercial/operational testing",
  reuses: Object.freeze(["client-journey-sim.simulateJourney (which composes cost-engine)"]),
  stages: STAGES, tiers: Object.keys(TIERS),
  notAuthority: "a synthetic simulator; it produces no real company, order, contract, invoice or payment",
  invariants: Object.freeze([
    "pure/deterministic: same synthetic input ⇒ identical lifecycle (no clock/random)",
    "every artifact is SYNTHETIC/FICTIF — never a real client/sale/payment; invoicing is TEST-mode only",
    "qualification/order/renewal gates are deterministic thresholds of the difficulty tier",
    "fail-closed: malformed input ⇒ ok:false",
  ]),
});

module.exports = { STAGES, TIERS, simulateEnterpriseLifecycle, SYNTHETIC_ENTERPRISE_CONTRACT };
if (require.main === module) { process.stdout.write(JSON.stringify(SYNTHETIC_ENTERPRISE_CONTRACT, null, 2) + "\n"); }
export {};
