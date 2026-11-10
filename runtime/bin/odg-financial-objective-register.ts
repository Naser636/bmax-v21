#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V62 (§12) — CANONICAL FINANCIAL-OBJECTIVE REGISTER. Reconciles the DISTINCT net-profit figures stated
 * across directives WITHOUT silently collapsing them: the €500M ambition (V51→V61), the €5M minimum (V51→V61), and the
 * €5,000 floor stated in V62 §12. It records each with its provenance and status, flags the €5M-vs-€5,000 discrepancy as
 * an OWNER-RECONCILIATION item (not resolved unilaterally), and keeps objective LEVELS separate from historical
 * HYPOTHESES. It fabricates no figure and declares no feasibility. Read-only aggregation; no new engine.
 * Run: `odg-financial-objective-register.ts`.
 */

const fs = require("fs");
const path = require("path");
const D = path.join(__dirname, "..", "..", "docs", "odg");

const OBJECTIVES = [
  { id: "AMBITION", amountEur: 500000000, unit: "NET after all charges + taxes", horizon: "first 12 months",
    provenance: ["V51", "V52", "V55", "V57", "V61"], status: "CANONICAL AMBITION — stable across directives",
    feasibility: "INFEASIBLE from €0 in 12 months (recorded V51/V52); objective kept, not lowered" },
  { id: "MINIMUM_5M", amountEur: 5000000, unit: "NET after all charges + taxes", horizon: "first 12 months",
    provenance: ["V51", "V55", "V56", "V57"], status: "CANONICAL MINIMUM (as used V51→V61)",
    feasibility: "necessary conditions NOT MET (V57 ledger); recorded, not lowered" },
  { id: "FLOOR_5K_V62", amountEur: 5000, unit: "NET", horizon: "first 12 months",
    provenance: ["V62 §12"], status: "NEWLY STATED in V62 §12 — DISCREPANT with MINIMUM_5M (factor 1000)",
    feasibility: "not assessed; may be a typo for €5M or a genuinely lower floor — OWNER must reconcile" },
];

const reconciliation = {
  discrepancy: "V62 §12 states a €5,000 net floor; V51→V61 used a €5,000,000 net minimum — a 1000× difference.",
  handling: "BOTH recorded with provenance; NEITHER silently overrides the other. V62 §12 itself asks to keep objective levels and historical hypotheses DISTINCT and reconcile here.",
  ownerDecisionNeeded: "confirm whether the minimum net-profit floor for year 1 is €5,000 or €5,000,000 (or another value). Until confirmed, both stand as stated; no model result changes.",
  invariant: "Objectives are recorded at their stated levels with provenance; a discrepancy is surfaced for owner reconciliation, never resolved by fabricating or silently picking a value.",
};

const out = {
  "//": "CTO V62 §12 — canonical financial-objective register. Reconciles €500M ambition / €5M minimum / €5,000 V62-floor by provenance; surfaces the €5M-vs-€5,000 discrepancy for owner decision. No figure fabricated, no feasibility declared. Keeps objective LEVELS distinct from historical HYPOTHESES.",
  objectives: OBJECTIVES,
  reconciliation,
  distinctLevels: ["AMBITION (€500M)", "MINIMUM (€5M — historical canonical)", "FLOOR (€5,000 — V62 §12, discrepant)"],
  historicalHypothesesNote: "scenario figures (prudent/central/ambitious) live in V55_ECONOMIC_SCENARIOS.json as HYPOTHESES — they are not objectives and are not reconciled here.",
  honestConclusion: "Three distinct stated net-profit figures are registered with provenance. The €5M-vs-€5,000 minimum discrepancy (V62 §12) is flagged for OWNER reconciliation — not resolved unilaterally. The €500M ambition is unchanged. No feasibility is declared; no figure invented.",
};
fs.writeFileSync(path.join(D, "V62_FINANCIAL_OBJECTIVE_REGISTER.json"), JSON.stringify(out, null, 2) + "\n");
process.stdout.write(JSON.stringify({ objectives: OBJECTIVES.map((o) => ({ id: o.id, amountEur: o.amountEur })), discrepancyFlagged: true }, null, 2) + "\n");
export {};
