#!/usr/bin/env node
"use strict";

/*
 * WI-INT-27 — INTER-MÉTIER PARCOURS C: P15 → P12 → P7. PURE, deterministic. Composes by contract: P15
 * workflow-engine runs a governed process that EMITS one event per completed step; P12 event-stream-engine +
 * P7 reliability (via integration-stream-reliability) publish/dedup/replay the events and measure reliability
 * (loss/duplicate/ordering + SLO). Extra synthetic events inject duplicates/disorder/loss for the failure
 * tests. Verdict degrades when the workflow fails OR a reliability guarantee is breached. Dual export.
 */

const WF = require("./workflow-engine");
const SR = require("./integration-stream-reliability");

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }

/** runWorkflowStreamReliability(input) -> report. input: { process?, ctx?, extraEvents?, expectedUnique?, slo? }. */
function runWorkflowStreamReliability(input: any): any {
  const i = isObj(input) ? input : {};
  const proc = isObj(i.process) ? i.process : { id: "emit", steps: [{ id: "s1" }, { id: "s2", deps: ["s1"] }, { id: "s3", deps: ["s2"] }] };
  // --- P15: run the governed workflow ---
  const run = WF.runProcess(proc, isObj(i.ctx) ? i.ctx : {});
  // events emitted by COMPLETED steps (ordered), + synthetic anomalies for failure tests
  const emitted = run.history.filter((h: any) => h.status === "DONE").map((h: any, idx: number) => ({ type: "step.done", key: proc.id, payload: { order: idx + 1, step: h.step } }));
  const events = emitted.concat(arr(i.extraEvents));
  // --- P12 → P7: reliability over the emitted stream ---
  const rel = SR.runStreamReliability(events, { expectedUnique: typeof i.expectedUnique === "number" ? i.expectedUnique : emitted.length, dataSchema: {}, slo: isObj(i.slo) ? i.slo : {} });
  const verdict = (run.status === "COMPLETED" && rel.verdict === "RELIABLE") ? "RELIABLE" : "DEGRADED";
  return Object.freeze({
    verdict,
    p15: Object.freeze({ status: run.status, emitted: emitted.length }),
    p12: rel.p12,
    p7: rel.p7,
    sloVerdict: rel.sloVerdict,
  });
}

const PARCOURS_C_CONTRACT = Object.freeze({
  id: "WI-INT-27-PARCOURS-C-P15-P12-P7",
  source: "Inter-métier C: P15 workflow-engine → P12 event-stream-engine → P7 reliability (by contract)",
  notAuthority: "pure composition over an in-memory engine (not a distributed broker); reuses shipped capabilities",
  invariants: Object.freeze([
    "pure/deterministic: process+ctx in → reliability report out",
    "P15 emits one event per completed step; P12 publishes/dedups/replays; P7 measures loss/duplicate/ordering + SLO",
    "fail-closed: workflow failure OR an SLO/reliability breach ⇒ verdict DEGRADED",
    "honest: in-memory engine, not a distributed broker",
  ]),
});

module.exports = { PARCOURS_C_CONTRACT, runWorkflowStreamReliability };

if (require.main === module) { process.stdout.write(JSON.stringify(PARCOURS_C_CONTRACT, null, 2) + "\n"); }

export {};
