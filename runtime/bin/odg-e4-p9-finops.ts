#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V50 (C2 — P9 E4) — FinOps / Cloud-cost readiness DEMONSTRATOR. Composes ODG's EXISTING cost-engine
 * (estimate / checkBudget / detectAnomalies — the P9 guard) over SYNTHETIC public cloud-usage data (no client data) and
 * emits a reproducible client deliverable via the shared O1 report layer (+O2 evidence). HONEST SCOPE: a FinOps readiness
 * assessment, NOT a certified cost audit; costs are ESTIMATED/SIMULATED from declared rates, never OBSERVED. Reuses, does
 * not duplicate. Run: `odg-e4-p9-finops.ts [outPath]`.
 */

const COST = require("../core/cost-engine.js");
const O1 = require("../core/shared-report-generator.js");
const fs = require("fs");
const path = require("path");

const OUT = process.argv[2] || path.join(__dirname, "..", "..", "docs", "odg", "demonstrators", "P9_FINOPS_READINESS.json");

// SYNTHETIC monthly cloud usage + declared rates (public example; no client data).
const rates = { compute_hr: 0.05, storage_gb: 0.02, egress_gb: 0.09 };          // €/unit (declared)
const usage = [
  { missionId: "svc-api", metier: "P9", resource: "compute_hr", units: 5000, kind: "ESTIMATED" },
  { missionId: "svc-api", metier: "P9", resource: "egress_gb", units: 8000, kind: "ESTIMATED" },
  { missionId: "data-lake", metier: "P9", resource: "storage_gb", units: 40000, kind: "ESTIMATED" },
];
const lines = usage.map((u) => ({ ...u, est: COST.estimate(u, rates) }));
const total = Number(lines.reduce((s, l) => s + l.est.cost, 0).toFixed(2));
const budget = 2500;                                                            // €/mo declared budget
const bud = COST.checkBudget(total, budget);
const anomalies = COST.detectAnomalies ? COST.detectAnomalies(lines.map((l) => ({ id: l.resource, cost: l.est.cost })), {}) : null;

const rep = O1.generateReport({
  metier: "P9", title: "FinOps / Cloud-Cost Readiness", status: `READINESS — monthly estimate €${total} vs budget €${budget} (${bud.withinBudget ? "within" : "OVER by €" + bud.overBy})`,
  summary: `Estimated monthly cloud cost €${total} across ${lines.length} resources (compute/storage/egress) from DECLARED rates (ESTIMATED, not metered). Budget €${budget} ⇒ ${bud.withinBudget ? "within budget" : "OVER by €" + bud.overBy}.`,
  controls: [
    { name: "Cost estimate (cost-engine)", status: "COMPUTED", detail: lines.map((l) => `${l.resource}:€${l.est.cost}`).join(", ") },
    { name: "Budget check", status: bud.withinBudget ? "WITHIN" : "OVER", detail: `€${total} vs €${budget}` },
    { name: "Anomaly scan", status: anomalies ? "RUN" : "N/A", detail: anomalies ? `${(anomalies.anomalies || []).length} flagged` : "detector absent" },
  ],
  findings: lines.filter((l) => l.est.cost > budget * 0.3).map((l) => ({ severity: "MEDIUM", detail: `${l.resource} is €${l.est.cost} (>30% of budget) — optimization candidate`, basis: "ESTIMATED" })),
  recommendations: ["right-size the largest cost driver", "set a budget alert at 80% run-rate (cost-engine.checkBudget)", "re-run on OBSERVED metering for a precise figure"],
  limits: ["costs are ESTIMATED from DECLARED rates, not OBSERVED metering", "readiness assessment, NOT a certified cost audit", "ODG maturity L2, 0 paying clients"],
  evidence: [{ claim: `monthly estimate €${total} (${lines.length} resources)`, basis: "ESTIMATED", sourceRef: path.basename(OUT) }, { claim: `budget check vs €${budget}`, basis: "SIMULATED", sourceRef: path.basename(OUT) }],
  validationConditions: ["re-run reproduces the estimate from the same inputs", "evidence digest independently verifiable"],
});
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({ "//": "CTO V50 P9 E4 FinOps readiness. SYNTHETIC inputs. ESTIMATED costs, not OBSERVED. Reuses cost-engine + O1/O2.", total, budget, withinBudget: bud.withinBudget, report: rep.json }, null, 2) + "\n");
fs.writeFileSync(OUT.replace(/\.json$/, ".md"), rep.markdown);
process.stdout.write(`=== P9 FinOps E4 written: ${OUT} (+ ${OUT.replace(/\.json$/, ".md")}) ===\n`);
process.stdout.write(JSON.stringify({ total, budget, withinBudget: bud.withinBudget, reportOk: rep.ok, evidenceVerifiable: rep.evidence.integrity.digest != null }, null, 2) + "\n");

export {};
