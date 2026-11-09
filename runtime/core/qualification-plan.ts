#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V10 §9–§10 — INTEGRATED QUALIFICATION PLAN. PURE, deterministic. Gives ODG a SINGLE canonical, ordered
 * qualification over its OWN existing canonical gates (it RE-COMPOSES them — it builds no new verifier and runs nothing
 * itself; the thin runner `deploy/odg-qualify.sh` executes each step's real command and feeds the result here). The point
 * is an honest, fail-CLOSED aggregate verdict that CANNOT be faked by a monolith that masks errors:
 *   - a QUALIFIED verdict requires EVERY critical step to carry an explicit PASS result;
 *   - a critical step that is MISSING (never run) or whose result is anything but PASS ⇒ NOT_QUALIFIED (never a silent
 *     pass — an un-run critical gate is treated as a failure, closing the "forgot to run it ⇒ looked green" hole);
 *   - the plan is ORDERED and the reducer STOPS at the first critical failure (no wasted downstream work, errors visible);
 *   - each step declares its CATEGORY so the proof is category-appropriate (a documentary capability is not proven like an
 *     executor): COMPILE/TYPES/CONTRACT/UNIT/INTEGRATION/EXECUTOR/SECURITY/DEPLOY/RECOVERY.
 * It decides nothing about missions and grants no authority — it only aggregates gate results into one honest verdict.
 * Dual export.
 */

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }

// The canonical ordered qualification steps — each maps to ONE existing canonical command (run by the thin runner).
// critical=true ⇒ it MUST pass for a QUALIFIED verdict; critical=false ⇒ reported, advisory (e.g. heavy on-demand e2e).
const QUALIFICATION_STEPS = Object.freeze([
  Object.freeze({ id: "compile", category: "COMPILE", critical: true, command: "npm run build:runtime", proves: "runtime compiles (dist built)" }),
  Object.freeze({ id: "types", category: "TYPES", critical: true, command: "npx tsc --noEmit -p tsconfig.json", proves: "no type errors (whole runtime)" }),
  Object.freeze({ id: "types-strict-leaves", category: "TYPES", critical: true, command: "npx tsc --noEmit -p tsconfig.runtime-leaves-strict.json", proves: "strict leaves (execution-planner/knowledge-engine/…) type-clean" }),
  Object.freeze({ id: "contracts", category: "CONTRACT", critical: true, command: "./runtime/bin/odg verify", proves: "generated contracts valid (verify gate health fields)" }),
  Object.freeze({ id: "unit-gate", category: "UNIT", critical: true, command: "npm run test:report", proves: "the 400-suite unit/integration gate all PASS (no FAIL/BLOCKED/NOT_RUN)" }),
  Object.freeze({ id: "campaign-controller", category: "INTEGRATION", critical: true, command: "npx tsx runtime/core/campaign-controller.test.ts", proves: "register coherence + no stale acceptances (36/36)" }),
  Object.freeze({ id: "capability-ladder", category: "INTEGRATION", critical: true, command: "npx tsx runtime/core/capability-map.test.ts", proves: "capability graph: real caps (ACCEPTED+evidence), 0 cycles, 0 dangling deps" }),
  Object.freeze({ id: "metier-parity", category: "INTEGRATION", critical: true, command: "npx tsx runtime/core/metier-baseline.test.ts", proves: "15/15 métier parity (not paper: composition proven)" }),
  Object.freeze({ id: "local-model-router", category: "UNIT", critical: true, command: "npx tsx runtime/core/model-router.test.ts", proves: "3B/7B routing; incorrect model never a default; independent test is the arbiter" }),
  Object.freeze({ id: "runner-e2e", category: "EXECUTOR", critical: false, command: "node_modules/.bin/tsx runtime/__bench__/odg-schedule-tick.e2e.test.ts", proves: "real runner on main: authorized mission EXECUTED + dedup + refusals (heavy on-demand)" }),
  Object.freeze({ id: "security-ports", category: "SECURITY", critical: true, command: "deploy/odg-port-audit.sh", proves: "only SSH:22 public (key-only); edg-core/ollama/dashboard loopback; no public port added" }),
  Object.freeze({ id: "private-deploy-health", category: "DEPLOY", critical: true, command: "./runtime/bin/odg health", proves: "Runtime/Foundation/Pipeline/Brain READY on the private VPS" }),
  Object.freeze({ id: "recovery-rollback", category: "RECOVERY", critical: false, command: "deploy/odg-rollback.sh --dry-run", proves: "rollback mechanism present + git-based, non-destructive (dry-run)" }),
]);

const PASS = "PASS", FAIL = "FAIL", MISSING = "MISSING";

/** stepIds() -> the canonical ordered ids (for the runner to iterate). */
function stepIds(): string[] { return QUALIFICATION_STEPS.map((s) => s.id); }
function stepById(id: any): any { return QUALIFICATION_STEPS.find((s) => s.id === String(id)) || null; }

/**
 * normalizeResult(raw) -> "PASS" | "FAIL". Fail-closed: only an EXPLICIT pass (result==="PASS" OR ok===true OR exit===0)
 * is a pass; anything else (ok:false, non-zero exit, unknown shape, null) ⇒ FAIL. An absent step is handled by evaluate
 * (⇒ MISSING), not here.
 */
function normalizeResult(raw: any): string {
  if (raw === PASS) return PASS;
  if (!isObj(raw)) return FAIL;
  if (raw.result === PASS) return PASS;
  if (raw.ok === true) return PASS;
  if (raw.exit === 0 || raw.exitCode === 0 || raw.status === 0) return PASS;
  return FAIL;
}

/**
 * evaluateQualification({ results }) -> { verdict, qualified, steps, firstCriticalFailure, summary }. results is a map
 * stepId -> raw result (from the runner). FAIL-CLOSED: QUALIFIED requires every CRITICAL step present AND PASS; a missing
 * (un-run) critical step ⇒ NOT_QUALIFIED with that step flagged MISSING (never a silent pass). Non-critical steps are
 * reported (PASS/FAIL/MISSING) but never block. Pure: no IO.
 */
function evaluateQualification(input: any): any {
  const o = isObj(input) ? input : {};
  const results = isObj(o.results) ? o.results : {};
  const steps = QUALIFICATION_STEPS.map((s) => {
    const present = Object.prototype.hasOwnProperty.call(results, s.id);
    const state = present ? normalizeResult(results[s.id]) : MISSING;
    return Object.freeze({ id: s.id, category: s.category, critical: s.critical, state, proves: s.proves });
  });
  const criticalBad = steps.filter((s) => s.critical && s.state !== PASS);
  const firstCriticalFailure = criticalBad.length ? criticalBad[0].id : null;
  const qualified = criticalBad.length === 0;
  const counts = steps.reduce((a: any, s) => { a[s.state] = (a[s.state] || 0) + 1; return a; }, {});
  return Object.freeze({
    verdict: qualified ? "QUALIFIED" : "NOT_QUALIFIED",
    qualified,
    steps: Object.freeze(steps),
    firstCriticalFailure,
    summary: Object.freeze({ total: steps.length, critical: steps.filter((s) => s.critical).length, criticalFailing: criticalBad.length, counts: Object.freeze(counts) }),
  });
}

/**
 * nextPendingStep(results) -> the first canonical step id not yet in results, or null when all have been run. Lets the
 * runner drive the ordered sequence and STOP early: if a critical step just FAILED, the runner halts (errors visible)
 * rather than running the rest. Pure.
 */
function nextPendingStep(results: any): string | null {
  const r = isObj(results) ? results : {};
  for (const s of QUALIFICATION_STEPS) if (!Object.prototype.hasOwnProperty.call(r, s.id)) return s.id;
  return null;
}
/** shouldHalt(results) -> true if a CRITICAL step has already failed (the runner must stop, not mask it). Pure. */
function shouldHalt(results: any): boolean {
  const r = isObj(results) ? results : {};
  for (const s of QUALIFICATION_STEPS) {
    if (!s.critical) continue;
    if (Object.prototype.hasOwnProperty.call(r, s.id) && normalizeResult(r[s.id]) !== PASS) return true;
  }
  return false;
}

const QUALIFICATION_PLAN_CONTRACT = Object.freeze({
  id: "V124-QUALIFICATION-PLAN",
  source: "CTO V10 §9–§10 — single integrated qualification over existing canonical gates",
  reuses: Object.freeze(["build:runtime", "tsc (full + runtime-leaves-strict)", "odg verify", "test:report (400-suite gate)", "campaign-controller", "capability-map", "metier-baseline", "model-router", "odg-schedule-tick e2e", "odg health", "odg-rollback"]),
  notAuthority: "re-composes existing gate results into ONE honest verdict; runs nothing itself; decides no mission; grants no authority",
  invariants: Object.freeze([
    "QUALIFIED requires EVERY critical step present AND PASS — a MISSING (un-run) critical step ⇒ NOT_QUALIFIED (an un-run gate is a failure, not a silent pass)",
    "fail-closed normalization: only an explicit PASS/ok/exit-0 is a pass; unknown/null/non-zero ⇒ FAIL",
    "the plan is ordered; shouldHalt stops at the first critical failure (errors visible, no masking monolith)",
    "each step declares a CATEGORY so proof is category-appropriate (documentary ≠ executor ≠ service)",
    "pure/deterministic: results map in → verdict out; no IO, builds no new verifier",
  ]),
});

module.exports = { QUALIFICATION_STEPS, stepIds, stepById, normalizeResult, evaluateQualification, nextPendingStep, shouldHalt, QUALIFICATION_PLAN_CONTRACT };

if (require.main === module) {
  // demo: a run missing the unit-gate ⇒ NOT_QUALIFIED (the hole an error-masking monolith would hide).
  const partial = evaluateQualification({ results: { compile: { ok: true }, types: { exit: 0 }, "types-strict-leaves": PASS } });
  process.stdout.write(JSON.stringify({ ...QUALIFICATION_PLAN_CONTRACT, demo: { verdict: partial.verdict, firstCriticalFailure: partial.firstCriticalFailure, missingCriticalProvesNoSilentPass: partial.verdict === "NOT_QUALIFIED" } }, null, 2) + "\n");
}

export {};
