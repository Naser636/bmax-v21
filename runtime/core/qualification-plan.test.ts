#!/usr/bin/env node
"use strict";

const Q = require("./qualification-plan");

let failures = 0;
function check(c: any, label: any): void { if (!c) { failures++; process.stderr.write("FAIL: " + label + "\n"); } }

// all critical steps PASS ⇒ QUALIFIED.
const allResults: any = {};
for (const id of Q.stepIds()) allResults[id] = { ok: true };
const full = Q.evaluateQualification({ results: allResults });
check(full.verdict === "QUALIFIED" && full.qualified === true, "every step PASS ⇒ QUALIFIED");
check(full.firstCriticalFailure === null, "no critical failure when all PASS");

// FAIL-CLOSED: a MISSING critical step (un-run) ⇒ NOT_QUALIFIED (the error-masking hole is closed).
const missingUnit = { ...allResults }; delete missingUnit["unit-gate"];
const r1 = Q.evaluateQualification({ results: missingUnit });
check(r1.verdict === "NOT_QUALIFIED", "a MISSING critical step (un-run gate) ⇒ NOT_QUALIFIED (no silent pass)");
check(r1.firstCriticalFailure === "unit-gate", "firstCriticalFailure flags the un-run gate");
check(r1.steps.find((s: any) => s.id === "unit-gate").state === "MISSING", "un-run step state is MISSING, not PASS");

// a critical step explicitly FAILING ⇒ NOT_QUALIFIED.
const failTypes = { ...allResults, types: { ok: false } };
const r2 = Q.evaluateQualification({ results: failTypes });
check(r2.verdict === "NOT_QUALIFIED" && r2.firstCriticalFailure === "types", "a failing critical step ⇒ NOT_QUALIFIED");

// a non-critical step missing/failing does NOT block (advisory).
const noE2e = { ...allResults }; delete noE2e["runner-e2e"]; delete noE2e["recovery-rollback"];
const r3 = Q.evaluateQualification({ results: noE2e });
check(r3.verdict === "QUALIFIED", "missing NON-critical steps (heavy on-demand e2e / rollback dry-run) do not block");

// fail-closed normalization: unknown/null/non-zero ⇒ FAIL (only explicit PASS/ok/exit-0 passes).
check(Q.normalizeResult("PASS") === "PASS" && Q.normalizeResult({ ok: true }) === "PASS" && Q.normalizeResult({ exit: 0 }) === "PASS", "explicit PASS/ok/exit-0 ⇒ PASS");
check(Q.normalizeResult(null) === "FAIL" && Q.normalizeResult({ ok: false }) === "FAIL" && Q.normalizeResult({ exit: 1 }) === "FAIL" && Q.normalizeResult("whatever") === "FAIL", "unknown/null/non-zero ⇒ FAIL (fail-closed)");

// ordered driving: nextPendingStep returns the first not-yet-run; shouldHalt stops at a critical failure.
check(Q.nextPendingStep({}) === Q.stepIds()[0], "nextPendingStep: first step when nothing run");
check(Q.nextPendingStep(allResults) === null, "nextPendingStep: null when all run");
check(Q.shouldHalt({ types: { ok: false } }) === true, "shouldHalt true after a critical failure");
check(Q.shouldHalt({ "runner-e2e": { ok: false } }) === false, "shouldHalt false on a non-critical failure (advisory)");
check(Q.shouldHalt({ compile: { ok: true } }) === false, "shouldHalt false while critical steps still pass");

// every step declares a category + at least the core canonical gates are present.
const ids = Q.stepIds();
for (const must of ["compile", "types", "unit-gate", "campaign-controller", "security-ports", "private-deploy-health"]) check(ids.includes(must), "plan includes canonical step: " + must);
check(Q.QUALIFICATION_STEPS.every((s: any) => typeof s.category === "string" && s.category.length > 0), "every step declares a category (category-appropriate proof)");

// contract invariants present.
check(/un-run critical step ⇒ NOT_QUALIFIED|un-run gate is a failure/i.test(JSON.stringify(Q.QUALIFICATION_PLAN_CONTRACT.invariants)), "contract: un-run critical ⇒ NOT_QUALIFIED");
check(/re-composes existing gate results|runs nothing itself/i.test(JSON.stringify(Q.QUALIFICATION_PLAN_CONTRACT)), "contract: re-composes, runs nothing itself, no authority");

if (failures === 0) process.stdout.write("ALL PASS — V12.4 QUALIFICATION PLAN\n");
process.exit(failures === 0 ? 0 : 1);

export {};
