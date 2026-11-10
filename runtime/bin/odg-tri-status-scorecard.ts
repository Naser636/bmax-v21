#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V52 (C3 hardening) — TRI-STATUS SCORECARD (read-only aggregator). Composes EXISTING artifacts (the V50 E4
 * matrix, the closure-register, the €500M feasibility finding) into ONE scorecard that keeps TECHNICAL / COMMERCIAL /
 * FINANCIAL statuses STRICTLY SEPARATE — a technical success is never reported as commercial value or financial result.
 * It reuses existing truth sources; it is NOT a second scorecard engine and computes no new capability. Pure read-only.
 * Run: `odg-tri-status-scorecard.ts`.
 */

const fs = require("fs");
const path = require("path");
const D = path.join(__dirname, "..", "..", "docs", "odg");
function readJson(f: string): any { try { return JSON.parse(fs.readFileSync(path.join(D, f), "utf8")); } catch { return null; } }

const e4 = readJson("V50_E4_ASSESSMENT_MATRIX.json");
const reg = (() => { try { return JSON.parse(fs.readFileSync(path.join(D, "closure-register.json"), "utf8")); } catch { return null; } })();

// TECHNICAL axis — what is built + proven in-repo (never "value").
const technical = {
  e4_demonstrated: e4 ? e4.tally.DEMONSTRATED : null,
  e4_blocked: e4 ? e4.tally.BLOCKED : null,
  e4_total: e4 ? Object.keys(e4.metiers).length : null,
  register_items: reg ? reg.items.length : null,
  note: "E4 = reproducible client-presentable deliverable (O1+O2 verifiable evidence); NOT certification, NOT sale. P13 BLOCKED (no GPU). Maturity L2/L3.",
  status: e4 && e4.tally.DEMONSTRATED >= 14 ? "STRONG (14/15 E4-demonstrated, 1 blocked)" : "PARTIAL",
};
// COMMERCIAL axis — demand/sales reality (never inferred from technical).
const commercial = {
  paying_clients: 0, observed_conversion: 0, references: 0,
  offers: "Part XXXII + V45.2 (HYPOTHESIS prices, to validate with 3 quotes)",
  note: "0 paying clients, 0 observed conversion, 0 references. All commercial figures are HYPOTHESIS/SIMULATION until a real sale is proven.",
  status: "NOT_STARTED (no demand proven; acquisition is the P0 blocker)",
};
// FINANCIAL axis — objective vs feasibility (never 'achieved').
const financial = {
  canonical_objective: "€500,000,000 NET after all charges + taxes, first 12 months",
  required_ebt: "≈ €666.67M", required_revenue: "≈ €2.22–13.33 Md (by 30%→5% pre-tax margin)",
  feasibility: "INFEASIBLE from €0-client standing start in 12 months (~1000×); recorded as fact; target NOT lowered",
  plausible_12mo_range: "~€0.5–1.5M revenue (ESTIMATE) — far below €500M net",
  status: "OBJECTIVE_RECORDED / INFEASIBLE_IN_TIMEFRAME (not a result)",
};

const out = {
  "//": "CTO V52 C3 — tri-status scorecard. TECHNICAL ≠ COMMERCIAL ≠ FINANCIAL, never conflated. Read-only aggregation of existing truth sources; no new engine.",
  generatedFrom: ["V50_E4_ASSESSMENT_MATRIX.json", "closure-register.json", "V51_500M_NET_FEASIBILITY.md"],
  technical, commercial, financial,
  invariant: "A green technical status is NEVER reported as commercial value or financial achievement. 0 clients stays 0; the financial objective is recorded with its honest infeasibility.",
};
process.stdout.write(JSON.stringify(out, null, 2) + "\n");
fs.writeFileSync(path.join(D, "V52_TRI_STATUS_SCORECARD.json"), JSON.stringify(out, null, 2) + "\n");
export {};
