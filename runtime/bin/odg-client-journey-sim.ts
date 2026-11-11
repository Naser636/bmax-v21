#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V60 (§3) — CLIENT-JOURNEY SIMULATION RUNNER. Runs the synthetic client-journey engine (client-journey-sim)
 * over several métiers with realistic SYNTHETIC profiles (segment, need, objections, order, incident) and a scale-up
 * scenario, producing per-journey savings + satisfaction and a manual-vs-automated comparison. Reuses cost-engine (via the
 * engine) + O1 report. Everything is SIMULATED — no real client, no real sale, no observed saving. Run: `odg-client-journey-sim.ts`.
 */

const CJ = require("../core/client-journey-sim.js");
const O1 = require("../core/shared-report-generator.js");
const fs = require("fs");
const path = require("path");
const D = path.join(__dirname, "..", "..", "docs", "odg");

// synthetic client scenarios per métier (profile + objections + order + incident). Clearly synthetic.
const SCENARIOS = [
  { metier: "P3", profile: { segment: "IoT manufacturer", size: "ETI" }, need: { description: "CRA/SBOM readiness for a device line", volume: 1 }, objections: ["is this a certification? (no — readiness evidence)", "who files the CRA report? (you — owner duty)"],
    order: { units: 4, unitPriceEur: 6000 }, manualMinutesPerUnit: 1200, automatedMinutesPerUnit: 90, manualRateEurPerHour: 90, automatedCostPerUnitEur: 120, qualityScore: 0.9, slaDays: 20, incident: { severity: "LOW", resolvedWithinSla: true } },
  { metier: "P9", profile: { segment: "SaaS scale-up", size: "PME" }, need: { description: "FinOps cloud-cost audit", volume: 1 }, objections: ["are the savings guaranteed? (no — estimated, validate on metering)"],
    order: { units: 1, unitPriceEur: 8000 }, manualMinutesPerUnit: 2400, automatedMinutesPerUnit: 120, manualRateEurPerHour: 95, automatedCostPerUnitEur: 200, qualityScore: 0.88, slaDays: 15, incident: { severity: "NONE", resolvedWithinSla: true } },
  { metier: "P10", profile: { segment: "org running AI in prod", size: "ETI" }, need: { description: "AI-Act governance readiness", volume: 1 }, objections: ["is this legal advice? (no — qualified counsel confirms)", "is it certified? (no — NOT_CERTIFIED)"],
    order: { units: 3, unitPriceEur: 7000 }, manualMinutesPerUnit: 1800, automatedMinutesPerUnit: 150, manualRateEurPerHour: 100, automatedCostPerUnitEur: 180, qualityScore: 0.85, slaDays: 25, incident: { severity: "MEDIUM", resolvedWithinSla: true } },
  { metier: "P11", profile: { segment: "B2B supplier", size: "PME" }, need: { description: "e-invoicing EN16931 readiness", volume: 1 }, objections: ["does ODG transmit via a PDP? (no — owner/accredited)"],
    order: { units: 10, unitPriceEur: 1500 }, manualMinutesPerUnit: 240, automatedMinutesPerUnit: 20, manualRateEurPerHour: 70, automatedCostPerUnitEur: 25, qualityScore: 0.92, slaDays: 10, incident: { severity: "NONE", resolvedWithinSla: true } },
];

const journeys = SCENARIOS.map((s) => {
  const j = CJ.simulateJourney(s);
  const scale10 = CJ.scaleJourney(j, 10);
  return { metier: s.metier, objections: s.objections, journey: j, scaleTo10Clients: scale10 };
});

const totalSavings = journeys.reduce((n, x) => n + (x.journey.ok ? x.journey.savingsEur : 0), 0);
const avgSatisfaction = Number((journeys.reduce((n, x) => n + (x.journey.ok ? x.journey.satisfaction : 0), 0) / journeys.length).toFixed(3));

// one O1 client-presentable report over the simulation (clearly synthetic).
const rep = O1.generateReport({
  metier: "COMMERCIAL", title: "Client-Journey Simulation — manual vs automated (synthetic)",
  status: `SIMULATION — ${journeys.length} synthetic journeys; avg satisfaction ${avgSatisfaction}; total modelled saving €${totalSavings.toFixed(2)} vs manual`,
  summary: `Per-métier synthetic journeys (profile→need→order→delivery→support→satisfaction). Each compares manual vs automated production cost (cost-engine), reporting a SIMULATED saving and SLA/satisfaction. No real client, no real sale, no observed saving.`,
  controls: journeys.map((x) => ({ name: `${x.metier} journey`, status: x.journey.ok ? (x.journey.slaMet === false ? "SLA-MISS" : "OK") : "INVALID", detail: x.journey.ok ? `rev €${x.journey.revenueEur}, saving €${x.journey.savingsEur} (${Math.round(x.journey.savingsPct * 100)}%), satisfaction ${x.journey.satisfaction}` : x.journey.reason })),
  findings: journeys.filter((x) => x.journey.ok && x.journey.incidentSeverity !== "NONE").map((x) => ({ severity: x.journey.incidentSeverity, detail: `${x.metier}: incident ${x.journey.incidentSeverity} (resolved within SLA)`, basis: "SIMULATED" })),
  recommendations: ["validate unit economics on a real authorized pilot (E5) before any commercial claim", "keep objection answers aligned with the honesty limits (no certification/guarantee)"],
  limits: ["ALL clients/orders/incidents are SYNTHETIC", "savings are a modelled manual-vs-automated comparison — never observed or client-validated", "satisfaction is deterministic from declared inputs, not a real NPS"],
  evidence: [{ claim: `${journeys.length} reproducible synthetic journeys with manual-vs-automated savings`, basis: "SIMULATED", sourceRef: "V60_CLIENT_JOURNEY_SIM.json" }],
  validationConditions: ["re-run reproduces identical journeys (deterministic)", "evidence digest independently verifiable"],
});

const out = {
  "//": "CTO V60 §3 — client-journey simulation. Synthetic journeys per métier + scale-up; manual-vs-automated savings via cost-engine; O1 report. SIMULATED only — no real client/sale/saving. Reuses client-journey-sim + cost-engine + O1; no new engine.",
  journeyCount: journeys.length, avgSatisfaction, totalModelledSavingsEur: round2(totalSavings),
  journeys, report: rep.json,
};
function round2(n: number): number { return Number(n.toFixed(2)); }
fs.mkdirSync(D, { recursive: true });
fs.writeFileSync(path.join(D, "V60_CLIENT_JOURNEY_SIM.json"), JSON.stringify(out, null, 2) + "\n");
process.stdout.write(`=== client-journey simulation: ${journeys.length} journeys, avg satisfaction ${avgSatisfaction}, total modelled saving €${round2(totalSavings)} ===\n`);
process.stdout.write(JSON.stringify(journeys.map((x) => ({ metier: x.metier, ok: x.journey.ok, savingsPct: x.journey.ok ? x.journey.savingsPct : null, satisfaction: x.journey.ok ? x.journey.satisfaction : null, slaMet: x.journey.slaMet })), null, 2) + "\n");
export {};
