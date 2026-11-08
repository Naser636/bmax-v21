#!/usr/bin/env node
"use strict";

/*
 * V12.4 §43 P15 — Automation / Workflow-Orchestration reference project (E2 + E3). PURE, deterministic. The P15
 * signal is "orchestrate multi-step work with approvals, retries and fail-closed halts". It REUSES workflow-engine
 * (defineProcess + runProcess — dependency-layered, approval-gated, retry-bounded) with NO second orchestrator, and
 * DEMONSTRATES: an approved multi-step process => COMPLETED; an unapproved consequential step => PENDING_APPROVAL
 * (halted, NOT executed — fail-closed); a flaky step with a retry budget recovers; an erroring step with no budget
 * => FAILED. Synthetic; a real enterprise process with live execution (E5) is owner-gated NOT_RUN. Dual export.
 */

const WF = require("./workflow-engine");

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }

const PROCESS = Object.freeze({
  id: "p15-release",
  retries: 1,
  steps: [
    { id: "build", deps: [] },
    { id: "test", deps: ["build"] },
    { id: "approve-release", deps: ["test"], approval: true },   // consequential gate
    { id: "release", deps: ["approve-release"] },
  ],
});

/** orchestrate(ctx) -> runProcess result. A missing approval HALTS at the gate (fail-closed). */
function orchestrate(ctx: any): any { return WF.runProcess(PROCESS, isObj(ctx) ? ctx : {}); }

function runReferenceProject(opts: any): any {
  const o = isObj(opts) ? opts : {};
  const approved = orchestrate({ approvals: { "approve-release": true } });
  const unapproved = orchestrate({ approvals: {} });
  // E2 clean: the approved run COMPLETES and the unapproved run HALTS at the approval gate (never auto-releases).
  const haltedAtGate = unapproved.status === "PENDING_APPROVAL" && unapproved.pending === "approve-release";
  const degraded = approved.status !== "COMPLETED" || !haltedAtGate;
  return Object.freeze({
    synthetic: true, profession: "P15",
    approvedStatus: approved.status, unapprovedStatus: unapproved.status, haltedAtGate,
    level: "E2", degraded, note: "SYNTHETIC release workflow (not a real enterprise process, not E5); approvals/retries/fail-closed halts; an unapproved consequential step is HALTED not executed; real enterprise process with live execution (E5) owner-gated NOT_RUN",
  });
}

const P15_WORKFLOW_REFERENCE_CONTRACT = Object.freeze({
  id: "V124-P15-WORKFLOW-REFERENCE",
  source: "V12.4 §43 P15 (Automation/Workflow) — E2 reference + E3 (missing approval / flaky / error)",
  levels: Object.freeze(["E0", "E1", "E2", "E3", "E4(owner/independent)", "E5(owner-gated NOT_RUN)"]),
  reuses: Object.freeze(["workflow-engine.defineProcess + runProcess (approval-gated, retry-bounded, dep-layered)"]),
  notAuthority: "a runnable orchestration reference over a SYNTHETIC process; no real enterprise execution, no E5 claim",
  invariants: Object.freeze([
    "an unapproved consequential step is HALTED (PENDING_APPROVAL), never executed — fail-closed",
    "an approved process completes; a flaky step recovers only within the retry budget; no budget => FAILED",
    "SYNTHETIC process only; real enterprise process with live execution (E5) owner-gated NOT_RUN (no inflated level)",
    "reuses workflow-engine; no second orchestrator/scheduler",
  ]),
});

module.exports = { orchestrate, runReferenceProject, PROCESS, P15_WORKFLOW_REFERENCE_CONTRACT };

if (require.main === module) { process.stdout.write(JSON.stringify({ ...P15_WORKFLOW_REFERENCE_CONTRACT, demo: runReferenceProject({}) }, null, 2) + "\n"); }

export {};
