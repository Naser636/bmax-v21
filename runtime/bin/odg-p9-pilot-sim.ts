#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V53 — P9 FINOPS FIRST-PILOT INTERNAL SIMULATION (READINESS ONLY). Runs ONE complete synthetic FinOps audit
 * parcours end-to-end by composing ODG's EXISTING P9 guard (cost-engine: estimate/attribute/alerts/detectAnomalies/
 * compareScenarios) and the shared O1 report + O2 evidence layers. INPUTS ARE SYNTHETIC (clearly labelled; no client
 * data). Every cost figure is ESTIMATED; the savings figure is SIMULATED under EXPLICIT hypotheses — NEVER presented as a
 * real, realised saving. This is an E4 readiness rehearsal, NOT a sold or client-validated engagement (E5 = NOT_STARTED).
 * Pure; no network; no clock-dependence beyond the generatedAt stamp (digest excludes it). Run: `odg-p9-pilot-sim.ts [out]`.
 */

const COST = require("../core/cost-engine.js");
const O1 = require("../core/shared-report-generator.js");
const O2 = require("../core/shared-evidence-wrapper.js");
const fs = require("fs");
const path = require("path");

const OUT = process.argv[2] || path.join(__dirname, "..", "..", "docs", "odg", "demonstrators", "P9_FINOPS_PILOT_SIM.json");
function nowIso(): string { return new Date().toISOString(); }

// ── STEP 1 — SYNTHETIC input (clearly labelled). A mid-size SaaS monthly cloud bill across 3 services × 3 resources. ──
const SYNTHETIC = true;
const rates = { compute_hr: 0.05, storage_gb: 0.02, egress_gb: 0.09 };   // €/unit, DECLARED (not metered)
const usage = [
  { missionId: "svc-api", metier: "P9", resource: "compute_hr", unit: "hour", units: 5200, kind: "ESTIMATED" },
  { missionId: "svc-api", metier: "P9", resource: "egress_gb", unit: "GB", units: 9000, kind: "ESTIMATED" },
  { missionId: "svc-worker", metier: "P9", resource: "compute_hr", unit: "hour", units: 3100, kind: "ESTIMATED" },
  { missionId: "svc-worker", metier: "P9", resource: "storage_gb", unit: "GB", units: 12000, kind: "ESTIMATED" },
  { missionId: "data-lake", metier: "P9", resource: "storage_gb", unit: "GB", units: 48000, kind: "ESTIMATED" },
  { missionId: "data-lake", metier: "P9", resource: "egress_gb", unit: "GB", units: 2600, kind: "ESTIMATED" },
];

// ── STEP 2 — COST ANALYSIS (attribution by mission / resource; total). ──
const attribution = COST.attribute(usage, rates);
const total = attribution.total;
const budgets = { "svc-api": 700, "svc-worker": 500, "data-lake": 1100 };   // DECLARED per-service monthly budgets
const budgetTotal = Object.values(budgets).reduce((s: number, v: any) => s + Number(v), 0);
const overBudget = COST.alerts(attribution.byMission, budgets);             // fail-closed: surfaces over-budget services

// ── STEP 3 — ANOMALY DETECTION (resource-level cost outliers, deterministic z-score). ──
const resourceCosts = Object.keys(attribution.byResource).sort().map((r) => attribution.byResource[r]);
const resourceNames = Object.keys(attribution.byResource).sort();
const anomalyIdx = COST.detectAnomalies(resourceCosts, 1.0);                // k=1.0 (hypothesis, explicit below)
const anomalies = anomalyIdx.map((i: number) => ({ resource: resourceNames[i], cost: resourceCosts[i] }));

// ── STEP 4 — RECOMMENDATIONS + SIMULATED savings under EXPLICIT hypotheses (NOT realised savings). ──
// Hypotheses (SIMULATED, to be validated against OBSERVED metering + client sign-off before any real figure is claimed):
const HYP = Object.freeze({
  storage_cold_tiering_pct: 0.40,   // H1: 40% of data-lake storage is cold → tier to cheaper class (−60% on that slice)
  storage_cold_discount: 0.60,
  compute_rightsize_pct: 0.15,      // H2: 15% compute over-provisioned → right-size
  egress_cache_pct: 0.20,           // H3: 20% egress removable via caching/CDN
});
const byRes = attribution.byResource;
const saveStorage = Number((Number(byRes.storage_gb || 0) * HYP.storage_cold_tiering_pct * HYP.storage_cold_discount).toFixed(2));
const saveCompute = Number((Number(byRes.compute_hr || 0) * HYP.compute_rightsize_pct).toFixed(2));
const saveEgress = Number((Number(byRes.egress_gb || 0) * HYP.egress_cache_pct).toFixed(2));
const simulatedMonthlySaving = Number((saveStorage + saveCompute + saveEgress).toFixed(2));
const simulatedPostTotal = Number((total - simulatedMonthlySaving).toFixed(2));

// scenario compare: current vs simulated-optimized (deterministic rank by cost then cost/throughput).
const scenarios = COST.compareScenarios([
  { name: "current", cost: total, throughput: 1000, kind: "ESTIMATED" },
  { name: "optimized(SIMULATED)", cost: simulatedPostTotal, throughput: 1000, kind: "SIMULATED" },
]);

// ── STEP 5 — DELIVERABLE via the shared O1 report layer (+O2 evidence). ──
const rep = O1.generateReport({
  metier: "P9", title: "FinOps Cloud-Cost Audit — PILOT SIMULATION (synthetic)",
  status: `SIMULATION — estimated spend €${total}/mo vs declared budgets €${budgetTotal}; ${overBudget.length} service(s) over budget; simulated optimization −€${simulatedMonthlySaving}/mo (HYPOTHESIS)`,
  summary: `Synthetic monthly cloud bill €${total} attributed across ${Object.keys(attribution.byMission).length} services and ${resourceNames.length} resources (ESTIMATED from declared rates). ${overBudget.length} service(s) over declared budget. Simulated optimization of €${simulatedMonthlySaving}/mo (${total > 0 ? Math.round((simulatedMonthlySaving / total) * 100) : 0}%) under explicit hypotheses → simulated run-rate €${simulatedPostTotal}. Figures are ESTIMATED/SIMULATED, never OBSERVED or realised.`,
  controls: [
    { name: "Cost attribution (cost-engine.attribute)", status: "COMPUTED", detail: resourceNames.map((r) => `${r}:€${byRes[r]}`).join(", ") },
    { name: "Budget alerts (cost-engine.alerts, fail-closed)", status: overBudget.length ? "OVER" : "WITHIN", detail: overBudget.length ? overBudget.map((a: any) => `${a.id}+€${a.overBy}`).join(", ") : "all services within budget" },
    { name: "Anomaly scan (detectAnomalies k=1.0)", status: "RUN", detail: anomalies.length ? anomalies.map((a: any) => `${a.resource}:€${a.cost}`).join(", ") : "0 flagged" },
    { name: "Scenario compare (current vs optimized)", status: "RANKED", detail: scenarios.map((s: any) => `${s.name}:€${s.cost}`).join(" < ") },
  ],
  findings: [
    ...overBudget.map((a: any) => ({ severity: "HIGH", detail: `${a.id} over declared budget by €${a.overBy} (€${a.spent} vs €${a.budget})`, basis: "ESTIMATED" })),
    ...anomalies.map((a: any) => ({ severity: "MEDIUM", detail: `${a.resource} is a cost outlier (€${a.cost}) — optimization candidate`, basis: "ESTIMATED" })),
    { severity: "INFO", detail: `simulated saving €${simulatedMonthlySaving}/mo is a HYPOTHESIS (H1 cold-tiering ${HYP.storage_cold_tiering_pct * 100}%, H2 right-size ${HYP.compute_rightsize_pct * 100}%, H3 egress-cache ${HYP.egress_cache_pct * 100}%) — NOT a realised saving`, basis: "SIMULATED" },
  ],
  recommendations: [
    `tier cold storage (H1): simulated −€${saveStorage}/mo — validate cold-data ratio against OBSERVED access logs first`,
    `right-size over-provisioned compute (H2): simulated −€${saveCompute}/mo — validate against OBSERVED utilization`,
    `cache/CDN removable egress (H3): simulated −€${saveEgress}/mo — validate against OBSERVED traffic`,
    "set budget alerts at 80% run-rate per service (cost-engine.alerts)",
    "re-run on OBSERVED metering + client sign-off before stating any real figure (E5 precondition)",
  ],
  limits: [
    "ALL inputs are SYNTHETIC — no client data; no real cloud account was read",
    "costs are ESTIMATED from declared rates; savings are SIMULATED under stated hypotheses — never OBSERVED or realised",
    "a FinOps readiness rehearsal, NOT a certified cost audit and NOT a sold engagement",
    "ODG maturity L2 for P9; 0 paying clients; E5 (client-validated) = NOT_STARTED",
  ],
  evidence: [
    { claim: `attributed monthly spend €${total} across ${resourceNames.length} resources`, basis: "ESTIMATED", sourceRef: path.basename(OUT) },
    { claim: `${overBudget.length} over-budget service(s) via fail-closed alerts`, basis: "ESTIMATED", sourceRef: path.basename(OUT) },
    { claim: `simulated optimization €${simulatedMonthlySaving}/mo under explicit hypotheses`, basis: "SIMULATED", sourceRef: path.basename(OUT) },
  ],
  validationConditions: [
    "re-run reproduces identical figures from identical synthetic inputs (digest stable)",
    "evidence digest independently verifiable via O2.verifyEvidence (no producer trust needed)",
    "before E5: replace SIMULATED hypotheses with OBSERVED metering and obtain documented client validation",
  ],
});

// independent evidence verification (O2) — an auditor re-derives the digest without trusting this producer.
const verify = O2.verifyEvidence(rep.json.evidence);

const artifact = {
  "//": "CTO V53 — P9 FinOps FIRST-PILOT internal simulation. SYNTHETIC inputs. Costs ESTIMATED, savings SIMULATED (hypotheses explicit) — NEVER realised. E4 rehearsal; E5=NOT_STARTED. Reuses cost-engine + O1/O2; no new engine, no CRM.",
  demonstrator: "P9 FinOps — first-pilot internal simulation (readiness only)",
  generatedAt: nowIso(), synthetic: SYNTHETIC,
  parcours: ["1 synthetic input", "2 cost attribution", "3 anomaly detection", "4 recommendations + SIMULATED savings (explicit hypotheses)", "5 O1 deliverable", "6 independent O2 evidence verification"],
  analysis: { total, budgetTotal, byMission: attribution.byMission, byResource: attribution.byResource, overBudget },
  anomalies, savingsHypotheses: HYP, simulatedMonthlySaving, simulatedPostTotal, scenarios,
  independentEvidenceVerification: verify,
  e5Status: "NOT_STARTED — simulation only; no real client, no real data, no client validation",
  report: rep.json,
};
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(artifact, null, 2) + "\n");
fs.writeFileSync(OUT.replace(/\.json$/, ".md"), rep.markdown);
process.stdout.write(`=== P9 FinOps PILOT SIMULATION written: ${OUT} (+ ${OUT.replace(/\.json$/, ".md")}) ===\n`);
process.stdout.write(JSON.stringify({ total, overBudgetCount: overBudget.length, anomalyCount: anomalies.length, simulatedMonthlySaving, reportOk: rep.ok, evidenceVerified: verify.ok, evidenceDigest: rep.json.evidence.integrity.digest, e5: "NOT_STARTED" }, null, 2) + "\n");

export {};
