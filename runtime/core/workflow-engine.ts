#!/usr/bin/env node
"use strict";

/*
 * WI-P15-28 — WORKFLOW ENGINE (P15 Enterprise Automation & Agentic Workflow — governed process engine). PURE,
 * deterministic. Defines a process (steps + deps + approvals + retries), runs it in DEPENDENCY order (REUSES
 * dep-planner, fail-closed on unknown dep / cycle), with IDEMPOTENT steps (completed steps are skipped on
 * resume), APPROVAL gates (a required approval not granted ⇒ PENDING_APPROVAL halt), RETRIES on transient
 * failure, error/timeout handling, an append-only execution HISTORY (evidence), and RECOVERY (resume from a
 * prior completed-set). Executes nothing external. Dual export.
 */

const DEP = require("./dep-planner");

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function isStr(v: any): boolean { return typeof v === "string" && v.length > 0; }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }

/** defineProcess(def) -> { ok, process } | { ok:false, violations }. Validates structure + dep graph. */
function defineProcess(def: any): any {
  const d = isObj(def) ? def : {};
  const violations: string[] = [];
  if (!isStr(d.id)) violations.push("process id required");
  const steps = arr(d.steps).filter(isObj);
  if (steps.length === 0) violations.push("at least one step required");
  for (const s of steps) if (!isStr(s.id)) violations.push("every step needs an id");
  if (violations.length === 0) {
    try { DEP.planLayers(steps.map((s: any) => ({ id: s.id, deps: arr(s.deps).filter(isStr) }))); }
    catch (e: any) { violations.push("dependency graph invalid: " + String(e && e.message || e)); }
  }
  if (violations.length) return Object.freeze({ ok: false, violations: Object.freeze(violations) });
  return Object.freeze({ ok: true, process: Object.freeze({ id: d.id, steps: Object.freeze(steps), retries: typeof d.retries === "number" ? d.retries : 0 }) });
}

/**
 * runProcess(def, ctx) -> { status, history, completed, evidence, pending? }. ctx: { approvals?:{stepId:true},
 * inject?:{stepId:"error"|"timeout"|"flaky"}, completed?:{stepId:true} (resume checkpoint), maxRetries? }.
 * status: COMPLETED | PENDING_APPROVAL | FAILED | ABSTAINED.
 */
function runProcess(def: any, ctx?: any): any {
  const dp = defineProcess(def);
  if (!dp.ok) return Object.freeze({ status: "FAILED", reason: "invalid process: " + dp.violations.join("; "), history: Object.freeze([]) });
  const c = isObj(ctx) ? ctx : {};
  const approvals = isObj(c.approvals) ? c.approvals : {};
  const inject = isObj(c.inject) ? c.inject : {};
  const completed: any = { ...(isObj(c.completed) ? c.completed : {}) };
  const maxRetries = typeof c.maxRetries === "number" ? c.maxRetries : dp.process.retries;
  const byId: any = {}; for (const s of dp.process.steps) byId[s.id] = s;
  const layers = DEP.planLayers(dp.process.steps.map((s: any) => ({ id: s.id, deps: arr(s.deps).filter(isStr) })));
  const history: any[] = []; const evidence: string[] = [];

  for (const layer of layers) {
    for (const id of layer) {
      const step = byId[id];
      if (completed[id]) { history.push({ step: id, status: "SKIPPED_IDEMPOTENT" }); continue; }
      if (step.approval === true && approvals[id] !== true) { history.push({ step: id, status: "PENDING_APPROVAL" }); return Object.freeze({ status: "PENDING_APPROVAL", pending: id, history: Object.freeze(history), completed: Object.freeze(completed), evidence: Object.freeze(evidence) }); }
      const inj = inject[id];
      if (inj === "timeout") { history.push({ step: id, status: "ABSTAINED", reason: "timeout" }); return Object.freeze({ status: "ABSTAINED", pending: id, history: Object.freeze(history), completed: Object.freeze(completed), evidence: Object.freeze(evidence) }); }
      if (inj === "error") { history.push({ step: id, status: "FAILED", reason: "error (retries exhausted)", attempts: maxRetries + 1 }); return Object.freeze({ status: "FAILED", pending: id, history: Object.freeze(history), completed: Object.freeze(completed), evidence: Object.freeze(evidence) }); }
      if (inj === "flaky") {
        if (maxRetries < 1) { history.push({ step: id, status: "FAILED", reason: "flaky, no retry budget" }); return Object.freeze({ status: "FAILED", pending: id, history: Object.freeze(history), completed: Object.freeze(completed), evidence: Object.freeze(evidence) }); }
        history.push({ step: id, status: "DONE", retriedAttempts: 2, note: "succeeded after retry" });
      } else {
        history.push({ step: id, status: "DONE" });
      }
      completed[id] = true; evidence.push("ev:" + id);
    }
  }
  return Object.freeze({ status: "COMPLETED", history: Object.freeze(history), completed: Object.freeze(completed), evidence: Object.freeze(evidence) });
}

const WORKFLOW_ENGINE_CONTRACT = Object.freeze({
  id: "WI-P15-28-WORKFLOW-ENGINE",
  source: "P15 Enterprise Automation — governed process engine; reuses dep-planner for ordering (fail-closed)",
  notAuthority: "pure governed process engine; executes nothing external; records intent + evidence",
  invariants: Object.freeze([
    "pure/deterministic: process + context in → execution result out; no clock/random",
    "dependency-ordered execution (reuses dep-planner; unknown dep / cycle ⇒ fail-closed)",
    "idempotent: completed steps are skipped on resume (recovery from a checkpoint)",
    "approval gate: a required approval not granted ⇒ PENDING_APPROVAL halt",
    "retries/timeout/error handled; append-only history + evidence; status COMPLETED|PENDING_APPROVAL|FAILED|ABSTAINED",
  ]),
});

module.exports = { WORKFLOW_ENGINE_CONTRACT, defineProcess, runProcess };

if (require.main === module) {
  process.stdout.write(JSON.stringify(WORKFLOW_ENGINE_CONTRACT, null, 2) + "\n");
}

export {};
