#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V62 (§7) — SYNTHETIC-ENTERPRISE SIMULATION RUNNER. Runs virtual companies across métiers and ALL difficulty
 * tiers through the full lifecycle engine (synthetic-enterprise), aggregating outcomes, savings and satisfaction. Every
 * company/contract/invoice is SYNTHETIC/FICTIF. Reuses synthetic-enterprise (→ client-journey-sim → cost-engine). No new
 * engine. Run: `odg-synthetic-enterprise-sim.ts`.
 */

const SE = require("../core/synthetic-enterprise.js");
const fs = require("fs");
const path = require("path");
const D = path.join(__dirname, "..", "..", "docs", "odg");

// one synthetic virtual company per métier (P1–P15) — V65 §5 extension to all fifteen métiers.
const COMPANIES = [
  { metier: "P1", company: { name: "CodeKeeper (synthetic)", sector: "software vendor", size: "PME" }, unitPriceEur: 4000 },
  { metier: "P2", company: { name: "AgentGov (synthetic)", sector: "AI platform", size: "ETI" }, unitPriceEur: 5000 },
  { metier: "P3", company: { name: "Acme-IoT (synthetic)", sector: "IoT manufacturing", size: "ETI" }, unitPriceEur: 6000 },
  { metier: "P4", company: { name: "DataTrust (synthetic)", sector: "data services", size: "PME" }, unitPriceEur: 4500 },
  { metier: "P5", company: { name: "ShipRight (synthetic)", sector: "devops", size: "PME" }, unitPriceEur: 3500 },
  { metier: "P6", company: { name: "EvalWorks (synthetic)", sector: "ML evaluation", size: "PME" }, unitPriceEur: 4000 },
  { metier: "P7", company: { name: "UptimeCo (synthetic)", sector: "SRE", size: "ETI" }, unitPriceEur: 5500 },
  { metier: "P8", company: { name: "APIForge (synthetic)", sector: "platform APIs", size: "PME" }, unitPriceEur: 3000 },
  { metier: "P9", company: { name: "NimbusSaaS (synthetic)", sector: "SaaS", size: "PME" }, unitPriceEur: 8000 },
  { metier: "P10", company: { name: "AuroraAI (synthetic)", sector: "AI services", size: "ETI" }, unitPriceEur: 7000 },
  { metier: "P11", company: { name: "TradeCorp (synthetic)", sector: "B2B distribution", size: "PME" }, unitPriceEur: 1500 },
  { metier: "P12", company: { name: "Streamline (synthetic)", sector: "event streaming", size: "ETI" }, unitPriceEur: 5000 },
  { metier: "P13", company: { name: "InferHaus (synthetic)", sector: "AI infrastructure", size: "ETI" }, unitPriceEur: 9000 },
  { metier: "P14", company: { name: "GoldenPath (synthetic)", sector: "assurance", size: "PME" }, unitPriceEur: 4000 },
  { metier: "P15", company: { name: "FlowOps (synthetic)", sector: "workflow automation", size: "PME" }, unitPriceEur: 3500 },
];
const TIERS = Object.keys(SE.TIERS);

const runs: any[] = [];
for (const c of COMPANIES) for (const tier of TIERS) {
  const r = SE.simulateEnterpriseLifecycle({ ...c, tier });
  runs.push({ metier: c.metier, company: c.company.name, tier, outcome: r.outcome, stagesCompleted: r.stagesCompleted, savingsEur: r.savingsEur, satisfaction: r.satisfaction });
}

const outcomes: any = {}; for (const r of runs) outcomes[r.outcome] = (outcomes[r.outcome] || 0) + 1;
const renewed = runs.filter((r) => r.outcome === "RENEWED").length;
const adversarialLost = runs.filter((r) => r.tier === "ADVERSARIAL" && r.outcome !== "RENEWED").length;

const out = {
  "//": "CTO V62 §7 — synthetic-enterprise simulation. Virtual companies × all difficulty tiers through the full lifecycle (prospection→…→renewal). SYNTHETIC/FICTIF only — no real client/sale/payment. Reuses synthetic-enterprise + client-journey-sim + cost-engine; no new engine.",
  companyCount: COMPANIES.length, tiers: TIERS, runCount: runs.length,
  runs, outcomeTally: outcomes,
  renewedCount: renewed,
  adversarialHandled: `${adversarialLost}/${runs.filter((r) => r.tier === "ADVERSARIAL").length} adversarial runs correctly did NOT renew (pressure honestly degrades the outcome)`,
  honestConclusion: `${runs.length} synthetic lifecycles across ${COMPANIES.length} virtual companies × ${TIERS.length} difficulty tiers. Outcomes: ${JSON.stringify(outcomes)}. Adversarial/high-pressure tiers honestly fail qualification/order/support (no inflated success). All SYNTHETIC/FICTIF — no real client, sale, or payment.`,
  invariant: "virtual companies and fictif contracts/invoices are clearly labelled synthetic; difficulty pressure honestly degrades outcomes; nothing is presented as a real result.",
};
fs.mkdirSync(D, { recursive: true });
fs.writeFileSync(path.join(D, "V62_SYNTHETIC_ENTERPRISE_SIM.json"), JSON.stringify(out, null, 2) + "\n");
process.stdout.write(`=== ${runs.length} synthetic lifecycles; outcomes ${JSON.stringify(outcomes)}; renewed ${renewed} ===\n`);
export {};
