#!/usr/bin/env node
"use strict";

/*
 * `odg learn` — READ-ONLY §V S5 surface: the workflow CALLS the learning evaluation on REAL repo signals and
 * ACTS on the result. It captures a live improvement-baseline (S4) — composing the migration-campaign
 * inventory, the incident-recurrence summary, and capability-metrics — grades the campaign's learning
 * records through the learning-chain (S2), and runs learning-review to produce a GATE decision.
 *
 * THE DECISION IT INFLUENCES: exit 1 (block) when the evaluation finds a real debt REGRESSION (a FROZEN_LOOP
 * / recurring incidents ⇒ prior fixes did not hold) or an OVER-CLAIM; exit 0 otherwise. Usable as a CI /
 * post-event gate exactly like `odg diagnose`. Writes nothing, spawns nothing, no network. OBSERVED signals
 * are printed separately from HYPOTHESES (signals that could not be measured in this context).
 */

const baselineMod: any = require("../../runtime/core/improvement-baseline");
const { reviewLearning }: any = require("./learning-review");

// The campaign's shipped §V learnings, with their REAL evidence (same records the S2/S4 tests grade). Claims
// are HONEST: a learning claims only the state its evidence reaches — reviewLearning flags any over-claim.
const RECORDS = [
  {
    id: "evidence-provenance", claim: "EFFECTIVE",
    captured: { description: "C5-A2: executor evidence was mtime-only, unattributed, not tamper-evident" },
    persisted: { file: "memory/evidence-provenance-capability.md", commit: "8b1c5b5" },
    discoverable: { index: "MEMORY.md + roadmap §V-B-LOG B1" },
    reused: { refs: ["capability-executors.writeEvidence (single chokepoint — all evidence writers)"] },
    effective: { metric: "provenance fields per evidence artifact", baseline: 0, after: 1 },
  },
  {
    id: "incident-recurrence", claim: "EFFECTIVE",
    captured: { description: "recurrence was implicit in per-incident attempts; no explicit signal" },
    persisted: { file: "runtime/core/incident-recurrence.js", commit: "3c2c528" },
    discoverable: { index: "roadmap §V-B-LOG B3 + compass; exported + wired into odg diagnose" },
    reused: { refs: ["odg diagnose (computes loadRecurrence every run)"] },
    effective: { metric: "recurrence signal", baseline: "implicit (attempts only)", after: "explicit FROZEN_LOOP verdict" },
  },
  {
    id: "dispatch-authorization-invariant", claim: "REUSED",
    captured: { description: "C5-A1: no central dispatch authorization chokepoint; a future executor could omit its gate" },
    persisted: { file: "runtime/core/dispatch-authorization-invariant.test.js", commit: "816dae5" },
    discoverable: { index: "roadmap §V-B-LOG B2 + compass" },
    reused: { refs: ["npm test (guards every future executor in the dispatch registry each run)"] },
  },
];

function main(): number {
  const baseline = baselineMod.captureBaseline(baselineMod.defaultCollectors({}));
  const review = reviewLearning({ baseline, records: RECORDS });

  console.log("======================================");
  console.log("ODG LEARN (§V verified-learning review)");
  console.log("======================================");
  console.log("Signals (OBSERVED):");
  for (const [k, v] of Object.entries(baseline.signals)) console.log(`  ${k.padEnd(20)} ${v === null ? "(unmeasured — hypothesis)" : v}`);
  console.log("Learning records :");
  for (const r of review.records) console.log(`  ${String(r.id).padEnd(34)} ${r.state}${r.overClaim ? ` (OVER-CLAIM: claims ${r.claim})` : ""}${r.complete ? " ✓EFFECTIVE" : ""}`);
  if (review.hypotheses.length) { console.log("Hypotheses (NOT observed):"); for (const h of review.hypotheses) console.log(`  - ${h}`); }
  console.log("Verdict          :", review.verdict, review.block ? "⇒ BLOCK (gate)" : "⇒ proceed");
  console.log("Reason           :", review.reason);
  console.log("Decision         :", review.block ? "exit 1 — learning not demonstrably EFFECTIVE (regression/over-claim); act before claiming done" : "exit 0 — no regression, learning review clean");
  console.log("======================================");
  return review.block ? 1 : 0;
}

process.exit(main());

export {};
