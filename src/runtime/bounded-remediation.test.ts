#!/usr/bin/env node
/*
 * BOUNDED REMEDIATION (V63 Capability B) — hermetic unit tests. Injected authority seams (no real action-gate
 * / patch-executor). Proves: only a DIAGNOSED+substantiated assessment is remediable; PROPOSE-ONLY (applier
 * NEVER invoked); write-set confinement; action-gate is the sole authority (confidence never authorizes);
 * pre-check / test refusals; rollback carried; zero real effect; recurrence-avoidance never asserted locally.
 *
 * Run:  node_modules/.bin/tsx src/runtime/bounded-remediation.test.ts
 */
import { propose } from "./bounded-remediation";

let failures = 0;
function check(cond: boolean, label: string): void {
  if (cond) console.log(`  PASS ${label}`);
  else { failures++; console.log(`  FAIL ${label}`); }
}

console.log("BOUNDED REMEDIATION — tests");

const DIAGNOSED = { incidentId: "INC-1", verdict: "DIAGNOSED", evidenceRefs: ["runtime/generated/x.json"], confidence: 0.99 };
const inputOK = { writeSet: ["runtime/core/foo.js"], authorizedPaths: ["runtime/core/"], plan: ["edit foo"], proposedDiff: "--- a\n+++ b\n", rollback: "git checkout -- runtime/core/foo.js", successCriteria: ["tests green"] };
const allow = () => ({ decision: "ALLOW", reason: "granted" });
let applierCalls = 0;
const applierSpy = () => { applierCalls += 1; return { applied: true }; };

// Happy path ⇒ PROPOSED, propose-only, applier NEVER called.
{
  applierCalls = 0;
  const p = propose(DIAGNOSED, inputOK, { authorize: allow, checkInitialState: () => ({ clean: true, preexistingFailures: [], missingDeps: [] }), runTests: () => ({ pass: true, results: "3/3" }), applier: applierSpy });
  check(p.decision === "PROPOSED" && p.applied === false && p.mode === "PROPOSE_ONLY", "DIAGNOSED + ALLOW + clean + tests pass ⇒ PROPOSED, applied:false, PROPOSE_ONLY");
  check(applierCalls === 0, "PROPOSE-ONLY: the patch-executor applier is NEVER invoked");
  check(p.recurrenceAvoided === null, "recurrence-avoidance is NEVER asserted from local tests");
  check(p.rollback === inputOK.rollback && p.diff === inputOK.proposedDiff, "rollback + proposed diff carried into the proposal");
  check(!!(p.authorization && p.authorization.decision === "ALLOW"), "authorization provenance recorded (action gate ALLOW)");
}

// Inconclusive / unsubstantiated assessment ⇒ BLOCKED (never remediate an unproven cause).
{
  const p1 = propose({ incidentId: "INC-2", verdict: "INCONCLUSIVE", evidenceRefs: ["r"] }, inputOK, { authorize: allow });
  check(p1.decision === "BLOCKED" && /not DIAGNOSED/.test(p1.reason), "INCONCLUSIVE assessment ⇒ BLOCKED");
  const p2 = propose({ incidentId: "INC-3", verdict: "DIAGNOSED", evidenceRefs: [] }, inputOK, { authorize: allow });
  check(p2.decision === "BLOCKED" && /evidenceRefs/.test(p2.reason), "no evidenceRefs ⇒ BLOCKED (insufficiently substantiated)");
}

// Write-set exceeds authorized scope ⇒ REFUSED.
{
  const p = propose(DIAGNOSED, { ...inputOK, writeSet: ["runtime/core/foo.js", "runtime/governance/ROADMAP.json"], authorizedPaths: ["runtime/core/"] }, { authorize: allow });
  check(p.decision === "REFUSED" && p.outOfScope.includes("runtime/governance/ROADMAP.json"), "write-set outside authorized scope ⇒ REFUSED (scope is not authority)");
}

// Action gate DENY ⇒ REFUSED; ESCALATE ⇒ BLOCKED. Confidence does NOT override.
{
  const deny = propose(DIAGNOSED, inputOK, { authorize: () => ({ decision: "DENY", reason: "policy" }) });
  check(deny.decision === "REFUSED" && deny.applied === false, "action gate DENY ⇒ REFUSED (confidence 0.99 does NOT authorize)");
  const esc = propose(DIAGNOSED, inputOK, { authorize: () => ({ decision: "ESCALATE", reason: "human" }) });
  check(esc.decision === "BLOCKED", "action gate ESCALATE ⇒ BLOCKED (awaits higher authority)");
}

// Initial-state pre-check failure ⇒ REFUSED.
{
  const dirty = propose(DIAGNOSED, inputOK, { authorize: allow, checkInitialState: () => ({ clean: false }) });
  check(dirty.decision === "REFUSED" && /pre-check/.test(dirty.reason), "dirty initial state ⇒ REFUSED");
  const preexist = propose(DIAGNOSED, inputOK, { authorize: allow, checkInitialState: () => ({ clean: true, preexistingFailures: ["T1"] }) });
  check(preexist.decision === "REFUSED", "pre-existing failures ⇒ REFUSED");
}

// Reproducible tests fail ⇒ REFUSED.
{
  const p = propose(DIAGNOSED, inputOK, { authorize: allow, checkInitialState: () => ({ clean: true }), runTests: () => ({ pass: false, results: "1/3" }) });
  check(p.decision === "REFUSED" && /tests/.test(p.reason), "failing reproducible tests ⇒ REFUSED (never propose over red tests)");
}

// Empty write-set ⇒ BLOCKED.
{
  const p = propose(DIAGNOSED, { ...inputOK, writeSet: [] }, { authorize: allow });
  check(p.decision === "BLOCKED" && /empty write-set/.test(p.reason), "empty write-set ⇒ BLOCKED");
}

// ── RACCORDEMENT RÉEL: the REAL action-gate is the authority; propose-only holds (no apply, no effect) ──
{
  const ag: any = require("../../runtime/core/action-gate.js");
  let realApplier = 0;
  const p = propose(DIAGNOSED, inputOK, {
    authorize: (action: any, ctx: any) => ag.evaluateAction(action, ctx),   // the REAL deny-by-default gate
    checkInitialState: () => ({ clean: true }),
    runTests: () => ({ pass: true }),
    applier: () => { realApplier += 1; return { applied: true }; },
  });
  check(["PROPOSED", "BLOCKED", "REFUSED"].includes(p.decision) && p.applied === false, "RÉEL: real action-gate composes via the seam ⇒ a valid decision, applied:false");
  check(realApplier === 0, "RÉEL: PROPOSE-ONLY holds against the real gate — applier never invoked (zero real effect)");
  check(p.authorization !== null && typeof p.authorization.decision === "string", "RÉEL: the gate verdict is the recorded authority (not model confidence)");
}

console.log(failures === 0 ? "ALL PASS — BOUNDED REMEDIATION" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
