#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V78 — CAMPAIGN RUN. Feeds the continuous campaign engine a 30-mission queue (mix of Level A/B/C, deps,
 * already-ACCEPTED) to PROVE it processes far more than 4 missions with no hardcoded cap and continues past blocked ones.
 * Records §12 metrics. Reuses campaign-engine; no new orchestrator. Run: `odg-campaign-run.ts`.
 */

const ENGINE = require("../core/campaign-engine.js");
const fs = require("fs");
const path = require("path");

// 30 synthetic missions. Level A (local) dominate; some B (human), some C (external); a dependency chain; 2 pre-ACCEPTED.
const A_ACTIONS = [["read", "test"], ["code_edit_local", "test"], ["benchmark", "doc"], ["refactor", "test", "commit_local"], ["synthetic_data", "test"]];
const missions: any[] = [];
for (let i = 1; i <= 24; i++) missions.push({ id: `A-${i}`, actions: A_ACTIONS[i % A_ACTIONS.length], strategicImportance: 0.5 + (i % 5) / 10, roadmapPriority: 0.5 + (i % 4) / 10, unblocks: [], risk: 0.1 + (i % 3) / 20, immediatelyExecutable: true, operationalValue: 0.6, closureWithProof: true, deps: i > 20 ? [`A-${i - 1}`] : [], status: "OPEN" });
missions.push({ id: "B-sign", actions: ["doc", "canonization"], strategicImportance: 0.8, roadmapPriority: 0.7, unblocks: [], risk: 0.3, immediatelyExecutable: false, operationalValue: 0.6, closureWithProof: false, deps: [], status: "OPEN" });
missions.push({ id: "B-legal", actions: ["doc", "legal_validation"], strategicImportance: 0.7, roadmapPriority: 0.6, unblocks: [], risk: 0.3, immediatelyExecutable: false, operationalValue: 0.5, closureWithProof: false, deps: [], status: "OPEN" });
missions.push({ id: "C-deploy", actions: ["deploy", "vps"], strategicImportance: 0.9, roadmapPriority: 0.6, unblocks: [], risk: 0.9, immediatelyExecutable: false, operationalValue: 0.5, closureWithProof: false, deps: [], status: "OPEN" });
missions.push({ id: "C-spend", actions: ["spend", "subscription"], strategicImportance: 0.6, roadmapPriority: 0.5, unblocks: [], risk: 0.9, immediatelyExecutable: false, operationalValue: 0.4, closureWithProof: false, deps: [], status: "OPEN" });
missions.push({ id: "A-done-1", actions: ["test"], strategicImportance: 0.9, roadmapPriority: 0.9, unblocks: [], risk: 0.1, immediatelyExecutable: true, operationalValue: 0.9, closureWithProof: true, deps: [], status: "ACCEPTED" });
missions.push({ id: "A-done-2", actions: ["doc"], strategicImportance: 0.9, roadmapPriority: 0.9, unblocks: [], risk: 0.1, immediatelyExecutable: true, operationalValue: 0.9, closureWithProof: true, deps: [], status: "ACCEPTED" });

// one mission whose executor fails (to prove failure handling without global stop).
const failing = new Set(["A-7"]);
const execute = (m: any) => failing.has(m.id) ? { mission: m.id, validated: false, status: "FAILED" } : { mission: m.id, validated: true, status: "SUCCESS" };

const result = ENGINE.runCampaign(missions, { execute });
const out = {
  "//": "CTO V78 — campaign run over a 30-mission queue. Proves >4 missions processed with no hardcoded cap, continuation past blocked/failed, Level-C refused, Level-B prepared. Reuses campaign-engine; no new orchestrator.",
  queueSize: missions.length, metrics: result.metrics, stopReason: result.stopReason,
  moreThanFourExecuted: result.metrics.accepted > 4,
  honestConclusion: `Campaign over a ${missions.length}-mission queue: ${result.metrics.accepted} EXECUTED+ACCEPTED (Level-A), ${result.metrics.failed} FAILED (incl. induced A-7, not accepted), ${result.metrics.refusedC} Level-C REFUSED, ${result.metrics.preparedB} Level-B PREPARED, ${result.metrics.quarantined} quarantined. Stop reason: ${result.stopReason}. ${result.metrics.accepted} > 4 ⇒ the V77 4-mission limit (a hardcoded candidate list, not a model/time cap) is removed; the engine consumes the whole queue and continues past blocked/failed missions.`,
  logTail: result.log.slice(-6),
  invariant: "no hardcoded mission cap; stop only on QUEUE_EXHAUSTED/ALL_DEFERRED/BUDGET/SAFETY_CAP (logged); blocked/failed never cause a global stop; ODG selects, owner mandate authorizes Level-A, gates intact.",
};
fs.writeFileSync(path.join(__dirname, "..", "..", "docs", "odg", "V78_CAMPAIGN_RUN.json"), JSON.stringify(out, null, 2) + "\n");
process.stdout.write(JSON.stringify({ queue: missions.length, accepted: result.metrics.accepted, failed: result.metrics.failed, refusedC: result.metrics.refusedC, preparedB: result.metrics.preparedB, stop: result.stopReason, moreThanFour: out.moreThanFourExecuted }, null, 2) + "\n");
export {};
