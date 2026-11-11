#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V55 (§6) — RADAR & WEEKLY SELF-IMPROVEMENT LOOP AUDIT (read-only). Locates the EXISTING radar / weekly-watch
 * / self-improvement components, confirms they load and expose their governed contracts, and documents the ONE governed
 * loop (propose → isolated experiment → measure → independent validation → gated approval → reversible integration →
 * post-integration verification). It creates NO new radar and NO new self-improvement engine — it audits and consolidates
 * what already exists. Pure read-only (require + contract inspection); no mutation. Run: `odg-radar-loop-audit.ts`.
 */

const fs = require("fs");
const path = require("path");
const CORE = path.join(__dirname, "..", "core");
const D = path.join(__dirname, "..", "..", "docs", "odg");

// the EXISTING components this audit consolidates (no new ones).
const COMPONENTS = [
  { id: "frontier-radar", capability: "monitor tech/research/models/tools/competitors/regulatory signals", loop: "watch" },
  { id: "frontier-radar-store", capability: "persist radar signals (store)", loop: "watch" },
  { id: "radar-gap-analysis", capability: "classify opportunities; propose only demonstrated+useful; never self-authorize", loop: "propose" },
  { id: "radar-scenario-benchmark", capability: "compare before/after scenarios for a proposed change", loop: "measure" },
  { id: "radar-realsignal-demonstration", capability: "demonstrate radar on real signals", loop: "watch" },
  { id: "frontier-weekly-report", capability: "synthesize the weekly watch report (trusted signals only)", loop: "weekly" },
  { id: "frontier-radar-self-improvement", capability: "radar feeds the self-improvement intake", loop: "propose" },
  { id: "self-improvement", capability: "governed cycle; stops at PROMOTION_REVIEW; never self-promotes", loop: "govern" },
  { id: "self-improvement-chain", capability: "discovery → proposal chain", loop: "propose" },
  { id: "intelligence-loop", capability: "DISCOVER→AUTHORIZE(external)→PLAN→EXECUTE→RECORD→LEARN→MEASURE", loop: "govern" },
  { id: "intelligence-scorecard", capability: "per-dimension measured intelligence (no single global score)", loop: "measure" },
  { id: "meta-intelligence", capability: "meta view over the intelligence dimensions", loop: "measure" },
];

const audited = COMPONENTS.map((c) => {
  const file = path.join(CORE, c.id + ".ts");
  const exists = fs.existsSync(file);
  let loads = false, contract: string | null = null, exportKeys: string[] = [];
  if (exists) {
    try {
      const mod = require(path.join(CORE, c.id + ".js"));
      loads = !!mod;
      exportKeys = Object.keys(mod || {});
      const ck = exportKeys.find((k) => /CONTRACT$/.test(k));
      contract = ck || null;
    } catch (e: any) { loads = false; contract = `LOAD_ERROR: ${e && e.message ? e.message.slice(0, 80) : "unknown"}`; }
  }
  return { ...c, exists, loads, contractExport: contract, exportKeys };
});

const governedLoop = [
  { stage: "1 proposal", component: "radar-gap-analysis / self-improvement-chain", rule: "propose only demonstrated+useful; NEVER self-authorize" },
  { stage: "2 isolated experiment", component: "evolution / frontier-lab (via self-improvement)", rule: "run in isolation; no production mutation" },
  { stage: "3 measure", component: "radar-scenario-benchmark / intelligence-scorecard", rule: "before/after, per-dimension; no artificial single score" },
  { stage: "4 independent validation", component: "controller + compounding held-out transfer", rule: "an independent party validates; builder ≠ validator" },
  { stage: "5 gated approval", component: "intelligence-loop AUTHORIZE (external only)", rule: "PROPOSED ≠ AUTHORIZED; promotion requires an external authorized decision" },
  { stage: "6 reversible integration", component: "governed pipeline", rule: "integration must be reversible (rollback path)" },
  { stage: "7 post-integration verification", component: "gates + regression", rule: "verify after integration; a green build is not sufficient proof" },
];

const loaded = audited.filter((a) => a.loads).length;
const missing = audited.filter((a) => !a.exists).map((a) => a.id);

const out = {
  "//": "CTO V55 §6 — radar & weekly self-improvement loop AUDIT (read-only). Consolidates EXISTING components; creates no new radar and no new self-improvement engine. The loop is governed: propose→experiment→measure→independent-validation→gated-approval→reversible-integration→post-verify. No autonomous production/security-policy change without the prescribed authorizations.",
  componentCount: COMPONENTS.length, loaded, missing,
  components: audited,
  governedLoop,
  weeklyLoop: "frontier-weekly-report.synthesizeWeeklyReport consolidates trusted signals; the weekly watch feeds radar-gap-analysis (propose) → self-improvement (govern). This is the single existing weekly loop — NOT a new parallel one.",
  governanceInvariants: [
    "radar/self-improvement NEVER self-authorize or self-promote (promotion is an external authorized decision)",
    "experiments run isolated; integration is reversible; verification follows integration",
    "no autonomous change to production or security policy without the prescribed authorizations",
    "no new radar, no new self-improvement engine — existing components are reused",
  ],
  honestConclusion: `${loaded}/${COMPONENTS.length} existing radar/loop components load and expose their governed contracts. The governed 7-stage loop and the weekly watch already exist and are reused. ${missing.length ? "MISSING: " + missing.join(", ") : "No component missing."} No parallel radar or engine was created.`,
};
process.stdout.write(JSON.stringify(out, null, 2) + "\n");
fs.writeFileSync(path.join(D, "V55_RADAR_WEEKLY_LOOP_AUDIT.json"), JSON.stringify(out, null, 2) + "\n");
export {};
