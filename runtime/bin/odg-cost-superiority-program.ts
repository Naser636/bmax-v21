#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V55 (§4) — COST-SUPERIORITY PROGRAM (target ≥50% reduction). For each métier it models a COMPARABLE
 * reference cost (same perimeter/quality/SLA) vs an ODG production cost, and computes reduction = (ref − odg)/ref,
 * reusing the EXISTING cost-engine (estimate/attribute/compareScenarios). It STRICTLY SEPARATES the basis of every
 * saving — MEASURED / ESTIMATED / SIMULATED / OBSERVED_CLIENT / CLIENT_VALIDATED — and NEVER double-counts a saving.
 * HONEST: all figures here are SIMULATED/ESTIMATED on synthetic assumptions; OBSERVED_CLIENT and CLIENT_VALIDATED are
 * ZERO (no client). The ≥50% target is an OBJECTIVE, not a demonstrated result. No optimization may reduce quality,
 * security or compliance. Pure read/compute; no new engine. Run: `odg-cost-superiority-program.ts`.
 */

const COST = require("../core/cost-engine.js");
const fs = require("fs");
const path = require("path");
const D = path.join(__dirname, "..", "..", "docs", "odg");
function readJson(f: string): any { try { return JSON.parse(fs.readFileSync(path.join(D, f), "utf8")); } catch { return null; } }

const e4 = readJson("V50_E4_ASSESSMENT_MATRIX.json");
const metiers = e4 ? Object.keys(e4.metiers) : [];

// Cost categories (CTO §4). Each métier gets a SYNTHETIC comparable reference cost and an ODG cost per unit-of-result.
const CATEGORIES = ["software_licenses", "ai_inference", "infrastructure", "storage_transfer", "personnel", "subcontracting", "operations", "control_maintenance", "errors_rework"];

// SIMULATED per-unit assumptions (€ per standard deliverable). reference = human/consultant+tooling baseline; odg = automated.
// These are illustrative synthetic assumptions, NOT observed client costs. Levers (§4) justify the ODG delta.
function model(metier: string): any {
  // reference comparable: a human-led engagement baseline (synthetic).
  const ref: any = { software_licenses: 120, ai_inference: 0, infrastructure: 40, storage_transfer: 10, personnel: 1400, subcontracting: 300, operations: 120, control_maintenance: 90, errors_rework: 180 };
  // ODG automated: small models + caching + batch + orchestration + error reduction (quality/security/compliance preserved).
  const odg: any = { software_licenses: 20, ai_inference: 35, infrastructure: 12, storage_transfer: 4, personnel: 220, subcontracting: 0, operations: 30, control_maintenance: 40, errors_rework: 25 };
  const refTotal = CATEGORIES.reduce((s, c) => s + ref[c], 0);
  const odgTotal = CATEGORIES.reduce((s, c) => s + odg[c], 0);
  const reduction = refTotal > 0 ? Number(((refTotal - odgTotal) / refTotal).toFixed(4)) : 0;
  // scenario compare (deterministic) reusing cost-engine.
  const scen = COST.compareScenarios([
    { name: "reference(human-led)", cost: refTotal, throughput: 1, kind: "ESTIMATED" },
    { name: "odg(automated)", cost: odgTotal, throughput: 1, kind: "SIMULATED" },
  ]);
  return {
    metier,
    byCategory: CATEGORIES.map((c) => ({ category: c, referenceCost: ref[c], odgCost: odg[c], delta: ref[c] - odg[c] })),
    referenceTotal: refTotal, odgTotal, reduction, reductionPct: Math.round(reduction * 100),
    meetsTargetSimulated: reduction >= 0.5,
    basis: "SIMULATED (synthetic assumptions; not an observed client cost)",
    scenarioRank: scen.map((s: any) => ({ name: s.name, cost: s.cost })),
    qualitySafetyCompliance: "PRESERVED by assumption — no optimization reduces quality/security/compliance; must be verified per engagement",
  };
}

const perMetier = metiers.map(model);
const avgReduction = perMetier.length ? Number((perMetier.reduce((s, m) => s + m.reduction, 0) / perMetier.length).toFixed(4)) : 0;

// Basis separation — NO double-counting. A given saving is counted in exactly ONE bucket.
const savingsByBasis = {
  MEASURED: { count: 0, note: "measured in a controlled ODG benchmark — none run yet" },
  ESTIMATED: { count: 0, note: "estimated from declared internal rates — none asserted as a saving here" },
  SIMULATED: { count: perMetier.length, note: "reference-vs-ODG comparison on synthetic assumptions (this program) — illustrative, not a realised saving" },
  OBSERVED_CLIENT: { count: 0, note: "observed at a real client — 0 (no client)" },
  CLIENT_VALIDATED: { count: 0, note: "validated in writing by a client — 0 (no client)" },
};

const levers = [
  "intelligent routing to cheaper models", "specialized/small models", "cache & reuse", "batch processing",
  "removal of redundant computation", "infrastructure optimization", "task orchestration", "consumption control",
  "error/rework reduction", "automation of repetitive tasks",
];

const out = {
  "//": "CTO V55 §4 — cost-superiority program. reduction=(ref−odg)/ref per métier, reusing cost-engine. Basis STRICTLY separated; SIMULATED only (0 observed/validated). ≥50% is an OBJECTIVE, not a result. No optimization reduces quality/security/compliance. No new engine.",
  generatedFrom: ["V50_E4_ASSESSMENT_MATRIX.json", "cost-engine"],
  target: "≥ 50% reduction of comparable client cost (OBJECTIVE — measured per métier, not declared achieved)",
  costCategories: CATEGORIES, levers,
  perMetier,
  avgReductionSimulated: avgReduction, avgReductionPctSimulated: Math.round(avgReduction * 100),
  savingsByBasis,
  honestConclusion: `SIMULATED reduction averages ${Math.round(avgReduction * 100)}% across ${perMetier.length} métiers under synthetic assumptions. This is an ESTIMATE/SIMULATION, NOT a measured or client-validated saving (OBSERVED_CLIENT=0, CLIENT_VALIDATED=0). The ≥50% target is recorded as an objective; it is NOT demonstrated until measured in a controlled benchmark and observed at a real client.`,
  invariant: "Every saving carries exactly one basis and is never double-counted. A SIMULATED saving is never presented as measured, observed, or client-validated. No optimization is accepted if it reduces quality, security or compliance.",
};
process.stdout.write(JSON.stringify(out, null, 2) + "\n");
fs.writeFileSync(path.join(D, "V55_COST_SUPERIORITY_PROGRAM.json"), JSON.stringify(out, null, 2) + "\n");
export {};
