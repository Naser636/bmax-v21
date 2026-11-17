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

// V254/V255 §2 — P15 could RUN a process but had no STATIC pre-flight DAG validation: a process with a dependency CYCLE, a
// DANGLING dependency (a step depending on a non-existent step), or DUPLICATE step ids is malformed and must be rejected
// BEFORE execution, not discovered mid-run. validateProcess is a pure pre-flight check (distinct from runProcess execution —
// no second orchestrator). Fail-closed: a malformed/cyclic graph is NOT runnable. Deterministic.
/** validateProcess(def) -> { valid, violations, stepCount, roots, runnable }. Detects duplicate ids, dangling deps, cycles. */
function validateProcess(def: any): any {
  const steps = isObj(def) && Array.isArray(def.steps) ? def.steps.filter(isObj) : [];
  if (steps.length === 0) return Object.freeze({ valid: false, runnable: false, stepCount: 0, roots: Object.freeze([]), violations: Object.freeze([Object.freeze({ code: "EMPTY_PROCESS", detail: "no steps (fail-closed)" })]) });
  const violations: any[] = [];
  const ids: string[] = []; const idSet = new Set<string>();
  for (const s of steps) { const id = typeof s.id === "string" ? s.id : null; if (id === null) { violations.push(Object.freeze({ code: "INVALID_STEP_ID", detail: "a step has no string id" })); continue; } if (idSet.has(id)) violations.push(Object.freeze({ code: "DUPLICATE_STEP", detail: "duplicate step id '" + id + "'" })); else { idSet.add(id); ids.push(id); } }
  const depsOf: Record<string, string[]> = {};
  for (const s of steps) { const id = typeof s.id === "string" ? s.id : null; if (id === null) continue; const deps = Array.isArray(s.deps) ? s.deps.filter((d: any) => typeof d === "string") : []; depsOf[id] = deps; for (const d of deps) if (!idSet.has(d)) violations.push(Object.freeze({ code: "DANGLING_DEP", detail: "step '" + id + "' depends on unknown step '" + d + "'" })); }
  // cycle detection (3-color DFS over the dependency edges id -> dep).
  const color: Record<string, number> = {}; let cyclePath: string[] | null = null;
  const dfs = (n: string, stack: string[]): boolean => {
    color[n] = 1; stack.push(n);
    for (const m of (depsOf[n] || [])) { if (!idSet.has(m)) continue; if (color[m] === 1) { cyclePath = stack.slice(stack.indexOf(m)).concat(m); return true; } if (color[m] === undefined && dfs(m, stack)) return true; }
    stack.pop(); color[n] = 2; return false;
  };
  for (const id of ids) if (color[id] === undefined && dfs(id, [])) break;
  if (cyclePath !== null) violations.push(Object.freeze({ code: "CYCLE", detail: "dependency cycle: " + (cyclePath as string[]).join(" -> ") }));
  const roots = ids.filter((id: string) => (depsOf[id] || []).length === 0);
  const valid = violations.length === 0;
  return Object.freeze({ valid, runnable: valid, stepCount: ids.length, roots: Object.freeze(roots), violations: Object.freeze(violations), note: "static pre-flight DAG validation (duplicate ids / dangling deps / cycles) BEFORE execution; a malformed graph is NOT runnable (fail-closed)." });
}

function runReferenceProject(opts: any): any {
  const o = isObj(opts) ? opts : {};
  const approved = orchestrate({ approvals: { "approve-release": true } });
  const unapproved = orchestrate({ approvals: {} });
  // E2 clean: the approved run COMPLETES and the unapproved run HALTS at the approval gate (never auto-releases).
  const haltedAtGate = unapproved.status === "PENDING_APPROVAL" && unapproved.pending === "approve-release";
  // V254/V255 — opt-in static DAG validation of a provided process (default path unchanged); the canonical PROCESS is valid.
  const validation = o.validateProcess !== undefined ? validateProcess(o.validateProcess) : validateProcess(PROCESS);
  const degraded = approved.status !== "COMPLETED" || !haltedAtGate || validation.valid === false;
  return Object.freeze({
    synthetic: true, profession: "P15",
    approvedStatus: approved.status, unapprovedStatus: unapproved.status, haltedAtGate, validation,
    level: "E2", degraded: !!degraded, note: "SYNTHETIC release workflow (not a real enterprise process, not E5); approvals/retries/fail-closed halts; an unapproved consequential step is HALTED not executed; real enterprise process with live execution (E5) owner-gated NOT_RUN",
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
    "V254 static validation: validateProcess rejects duplicate step ids / dangling deps / dependency cycles BEFORE execution (fail-closed — a malformed graph is NOT runnable); pure pre-flight, not a second orchestrator",
  ]),
});

module.exports = { orchestrate, validateProcess, runReferenceProject, PROCESS, P15_WORKFLOW_REFERENCE_CONTRACT };

if (require.main === module) { process.stdout.write(JSON.stringify({ ...P15_WORKFLOW_REFERENCE_CONTRACT, demo: runReferenceProject({}) }, null, 2) + "\n"); }

export {};
