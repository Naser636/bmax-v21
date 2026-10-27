#!/usr/bin/env node
/**
 * assurance-pilot-metrics — turns the MEASURED cost of the productized assurance pilot into honest unit economics.
 * Measurement (2026-10-27, scripts/assurance-pilot-bench.ts, process.hrtime over synthetic fixtures): the
 * assurance-pilot-runner analysis costs ≈0.343 ms machine time per dossier (~2,900 runs/s) ⇒ **machine/analysis cost is
 * effectively €0**. The real delivery cost is therefore HUMAN time (scoping, interpretation, readout, verification,
 * report finalisation) — which automation does NOT eliminate in a SERVICE model. This module computes delivery cost
 * from measured machine time + an EXPLICIT human-hours assumption, derives the margin/net factor (feeding the MEASURED
 * deliveryCostRate into economic-profiles — it does NOT assume V18's optimistic 0.56), and the deliveries needed for a
 * net target. Pure/deterministic. Human-hours + hourly cost are HYPOTHESIS inputs (a human estimate, not machine-measured).
 */
"use strict";

const EP = require("./economic-profiles.js");

const MEASURED_MACHINE_MS_PER_RUN = 0.343;   // measured 2026-10-27 (synthetic 40-dep fixture); recorded, not assumed

function num(v: any, d = 0): number { return typeof v === "number" && isFinite(v) && v >= 0 ? v : d; }
function r2(x: number): number { return Math.round(x * 100) / 100; }

/** deliveryCost({ humanHours, hourlyCost, varTech, runsPerDelivery }): machine cost (measured, ~0) + human + variable. */
function deliveryCost(opts: any): any {
  const o = opts || {};
  const runs = num(o.runsPerDelivery, 1) || 1;
  const hourlyCost = num(o.hourlyCost, 50);
  const humanHours = num(o.humanHours);
  const machineHours = (runs * MEASURED_MACHINE_MS_PER_RUN) / 1000 / 3600;
  const machineCost = r2(machineHours * hourlyCost);         // ≈ €0 at the measured speed
  const humanCost = r2(humanHours * hourlyCost);
  const varTech = num(o.varTech);
  return { machineCost, humanCost, varTech: r2(varTech), total: r2(machineCost + humanCost + varTech), machineMsPerRun: MEASURED_MACHINE_MS_PER_RUN };
}

/**
 * unitEconomics({ price, humanHours, hourlyCost, varTech, runsPerDelivery }): margin per delivery from MEASURED cost.
 */
function unitEconomics(opts: any): any {
  const o = opts || {};
  const price = num(o.price);
  const cost = deliveryCost(o);
  const grossMargin = r2(price - cost.total);
  const marginPct = price > 0 ? r2((grossMargin / price) * 100) : 0;
  const deliveryCostRate = price > 0 ? cost.total / price : 1;
  return { price: r2(price), cost, grossMargin, marginPct, deliveryCostRate: r2(deliveryCostRate) };
}

/**
 * netPerDelivery({ price, humanHours, hourlyCost, profile }): feed the MEASURED deliveryCostRate into the chosen
 * economic profile (micro/SASU) ⇒ honest net available per delivery (NOT V18's assumed 0.56 unless measurement supports it).
 */
function netPerDelivery(opts: any): any {
  const o = opts || {};
  const ue = unitEconomics(o);
  // Fail-closed: if measured cost ≥ price (rate ≥ 1), the engagement is loss-making — do NOT route a >1 rate through
  // the profile (whose pct() would clamp it to 0 and hide the loss). Report the loss directly.
  if (ue.grossMargin <= 0 || ue.deliveryCostRate >= 1) {
    return { price: r2(o.price), measuredDeliveryCostRate: ue.deliveryCostRate, marginPct: ue.marginPct, netAvailablePerDelivery: ue.grossMargin, netFactor: r2(o.price > 0 ? ue.grossMargin / o.price : 0), levies: { note: "cost ≥ price ⇒ loss-making before any levy" }, lossMaking: true };
  }
  const baseProfile = o.profile || EP.PROFILES.find((p: any) => p.id === "E-productized");
  const profile = Object.assign({}, baseProfile, { deliveryCostRate: ue.deliveryCostRate });  // MEASURED delivery rate
  const net = EP.netForProfile(o.price, profile);
  return { price: r2(o.price), measuredDeliveryCostRate: ue.deliveryCostRate, marginPct: ue.marginPct, netAvailablePerDelivery: net.netAvailable, netFactor: net.netFactor, levies: net.levies };
}

/** deliveriesForNetTarget(netTarget, perDelivery, monthlyHumanHoursCapacity?): count + capacity/months implied. */
function deliveriesForNetTarget(netTarget: number, perDelivery: any, monthlyHumanHoursCapacity = 120): any {
  const net = perDelivery && num(perDelivery.netAvailablePerDelivery);
  if (!(net > 0)) return { achievable: false, note: "net per delivery ≤ 0 — not achievable at this price/cost" };
  const count = Math.ceil(num(netTarget) / net);
  const humanHoursTotal = count * num((perDelivery as any).humanHours, 0);
  return { achievable: true, netTarget, netAvailablePerDelivery: net, deliveriesNeeded: count, note: `${count} delivered engagements net ~${netTarget} at this measured unit economics (HYPOTHESIS human-hours)` };
}

export { MEASURED_MACHINE_MS_PER_RUN, deliveryCost, unitEconomics, netPerDelivery, deliveriesForNetTarget };
module.exports = { MEASURED_MACHINE_MS_PER_RUN, deliveryCost, unitEconomics, netPerDelivery, deliveriesForNetTarget };
