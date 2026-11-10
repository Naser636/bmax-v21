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
    provenance: ["V51", "V55", "V56", "V57", "V63 (confirmed canonical floor)"], status: "CANONICAL ABSOLUTE FLOOR — confirmed by V63",
    feasibility: "necessary conditions NOT MET (V57 ledger); recorded, not lowered" },
  { id: "FLOOR_5K_V62", amountEur: 5000, unit: "(none — ERROR)", horizon: "n/a",
    provenance: ["V62 §12 (stated)", "V63 §1 (corrected)"], status: "ERROR — V63 §1 declares the €5,000 figure an ERROR; SUPERSEDED, no longer an objective. Canonical floor = €5,000,000 (MINIMUM_5M).",
    feasibility: "VOID — not an objective; retained only for historical traceability of the correction" },
];

const reconciliation = {
  discrepancy: "V62 §12 stated a €5,000 net floor; V51→V61 used a €5,000,000 net minimum — a 1000× difference.",
  resolution: "RESOLVED by V63 §1 (owner authority): the €5,000 figure is an ERROR and is no longer an objective. The canonical ABSOLUTE FLOOR is €5,000,000 net; the strategic AMBITION is €500,000,000 net (first 12 months). Both kept, neither lowered.",
  ownerDecisionNeeded: "NONE — resolved by V63 §1. Historical traceability of the €5,000 error is preserved (not erased).",
  invariant: "Objectives are recorded at their canonical levels with provenance; the €5,000 error is superseded by V63, not silently deleted — the correction is traceable.",
};

const out = {
  "//": "CTO V62 §12 — canonical financial-objective register. Reconciles €500M ambition / €5M minimum / €5,000 V62-floor by provenance; surfaces the €5M-vs-€5,000 discrepancy for owner decision. No figure fabricated, no feasibility declared. Keeps objective LEVELS distinct from historical HYPOTHESES.",
  objectives: OBJECTIVES,
  reconciliation,
  canonicalLevels: ["ABSOLUTE FLOOR = €5,000,000 net (confirmed V63)", "STRATEGIC AMBITION = €500,000,000 net (12 months)"],
  historicalHypothesesNote: "scenario figures (prudent/central/ambitious) live in V55_ECONOMIC_SCENARIOS.json as HYPOTHESES — they are not objectives and are not reconciled here.",
  honestConclusion: "V63 §1 resolves the discrepancy: €5,000 was an ERROR and is superseded (no longer an objective). Canonical ABSOLUTE FLOOR = €5,000,000 net; STRATEGIC AMBITION = €500,000,000 net (12 months). Both kept, neither lowered; the error correction is traceable; no feasibility declared.",
};
fs.writeFileSync(path.join(D, "V62_FINANCIAL_OBJECTIVE_REGISTER.json"), JSON.stringify(out, null, 2) + "\n");
process.stdout.write(JSON.stringify({ objectives: OBJECTIVES.map((o) => ({ id: o.id, amountEur: o.amountEur })), discrepancyFlagged: true }, null, 2) + "\n");
export {};
