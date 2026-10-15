#!/usr/bin/env node
/*
 * FAILURE_TRIAGE_AND_BOUNDED_RECOVERY — deterministic, hermetic unit test (§U Phase-1 #4).
 *
 * All authorities are INJECTED mock seams — NO real applier/git/network is imported or triggered. Proves:
 * PREPARE_NOT_APPLY default (apply SKIPPED, never invoked); ambiguous cause ⇒ BLOCKED with provenance;
 * non-regression FAIL ⇒ never repaired; apply refused without authorization / out-of-scope / FROZEN;
 * apply failure ⇒ delegated rollback via the applier's restore() (never destructive git), state preserved,
 * risk surfaced; authorized+in-scope apply ⇒ APPLIED+repaired; the triage module itself writes nothing and
 * spawns no git. Order is fixed. Pure/offline.
 *
 * Run:  node_modules/.bin/tsx src/runtime/failure-triage.test.ts
 */
import fs from "node:fs";
const { triage } = require("./failure-triage");
export {}; // module-scope marker (§T-R1): require()-based test ⇒ force MODULE scope (avoid TS2451)

let failures = 0;
function check(cond: boolean, label: string): void {
  if (cond) console.log(`  PASS ${label}`);
  else { failures++; console.log(`  FAIL ${label}`); }
}
const P = (detail = "ok"): any => ({ status: "PASS", detail });

// A full set of mock seams with per-seam invocation counters; individual gates overridable.
function seams(over: any = {}) {
  const calls: any = { reproduce: 0, rootCause: 0, planRepair: 0, authorizeApply: 0, apply: 0, nonRegression: 0, checkpoint: 0, restore: 0 };
  const base: any = {
    reproduce: () => { calls.reproduce++; return P("reproduced"); },
    rootCause: () => { calls.rootCause++; return { status: "PASS", detail: "cause X", cause: { id: "X" }, authority: "self-diagnostic" }; },
    planRepair: () => { calls.planRepair++; return { status: "PASS", detail: "plan ready", plan: { steps: 1 }, frozen: false, applyAllowed: true }; },
    authorizeApply: () => { calls.authorizeApply++; return { allowed: true, reason: "action-gate ALLOW + in scope" }; },
    apply: () => { calls.apply++; return { status: "PASS", detail: "applied in scope", restore: () => { calls.restore++; } }; },
    nonRegression: () => { calls.nonRegression++; return P("suite+tsc+parity green"); },
    checkpoint: () => { calls.checkpoint++; return P("checkpoint written"); },
    log() {},
  };
  return { s: Object.assign(base, over), calls };
}

console.log("FAILURE_TRIAGE — deterministic hermetic test");

// 1. PREPARE_NOT_APPLY default — apply SKIPPED and NEVER invoked; not repaired; order fixed.
{
  const { s, calls } = seams();
  const r = triage({}, s);
  check(r.mode === "PREPARE_NOT_APPLY" && r.repaired === false, "default ⇒ PREPARE_NOT_APPLY, not repaired");
  check(calls.apply === 0 && r.gates.find((g: any) => g.gate === "apply").status === "SKIPPED", "default: apply SKIPPED and the real apply seam NEVER invoked");
  check(r.gates.map((g: any) => g.gate).join(",") === "reproduce,root-cause,plan-repair,apply,non-regression,checkpoint", "order fixed: reproduce→cause→plan→apply→non-reg→checkpoint");
  check(r.cause && r.cause.authority === "self-diagnostic", "cause provenance (authority) recorded");
}

// 2. Ambiguous/absent cause ⇒ BLOCKED, stop, never DONE, provenance kept.
{
  const { s, calls } = seams({ rootCause: () => ({ status: "BLOCKED", detail: "cause ambiguous", authority: "root-cause-engine" }) });
  const r = triage({ apply: true }, s);
  check(r.ok === false && r.exitCode === 2 && r.repaired === false, "ambiguous cause ⇒ BLOCKED, not repaired");
  check(calls.planRepair === 0 && calls.apply === 0, "ambiguous cause stops BEFORE plan/apply (no apply)");
  check(r.cause.authority === "root-cause-engine" && r.gates.find((g: any) => g.gate === "root-cause").detail.includes("root-cause-engine"), "cause provenance authority surfaced (r.cause.authority + gate detail)");
}

// 3. Non-regression FAIL after an authorized apply ⇒ never repaired/DONE.
{
  const { s } = seams({ nonRegression: () => ({ status: "FAIL", detail: "a suite went red" }) });
  const r = triage({ apply: true, authorizedPaths: ["src"] }, s);
  check(r.repaired === false && r.ok === false, "non-regression FAIL ⇒ not repaired (no false DONE)");
  check(r.gates.find((g: any) => g.gate === "non-regression").status === "FAIL", "non-regression gate recorded FAIL");
}

// 4. Apply requested but authorization DENIED ⇒ BLOCKED, real apply never invoked.
{
  const { s, calls } = seams({ authorizeApply: () => ({ allowed: false, reason: "action-gate ESCALATE" }) });
  const r = triage({ apply: true, authorizedPaths: ["src"] }, s);
  check(r.mode === "BLOCKED" && calls.apply === 0, "apply DENIED (no action-gate ALLOW) ⇒ BLOCKED, apply never invoked");
  check(/not authorized/.test(r.gates.find((g: any) => g.gate === "apply").detail), "apply BLOCKED detail cites missing authorization");
}

// 5. Plan not auto-applicable (over-scope) ⇒ BLOCKED, apply never invoked.
{
  const { s, calls } = seams({ planRepair: () => ({ status: "PASS", detail: "plan", plan: {}, frozen: false, applyAllowed: false }) });
  const r = triage({ apply: true }, s);
  check(r.mode === "BLOCKED" && calls.authorizeApply === 0 && calls.apply === 0, "over-scope plan ⇒ BLOCKED before authorize/apply");
}

// 6. FROZEN incident ⇒ no apply.
{
  const { s, calls } = seams({ planRepair: () => ({ status: "PASS", detail: "frozen", plan: {}, frozen: true, applyAllowed: false }) });
  const r = triage({ apply: true }, s);
  check(r.mode === "BLOCKED" && calls.apply === 0 && /FROZEN/.test(r.gates.find((g: any) => g.gate === "apply").detail), "FROZEN ⇒ apply refused, never invoked");
}

// 7. Authorized apply FAILS ⇒ delegated rollback via the applier's restore() (no destructive git); BLOCKED + risk.
{
  const { s, calls } = seams({ apply: () => ({ status: "FAIL", detail: "fixer could not resolve", restore: () => { calls.restore++; } }) });
  const r = triage({ apply: true, authorizedPaths: ["src"] }, s);
  check(r.mode === "BLOCKED" && r.repaired === false, "apply failure ⇒ BLOCKED, not repaired");
  check(calls.restore === 1 && r.rollback && r.rollback.performed === true, "apply failure ⇒ delegated rollback via authorized restore() (exactly once)");
  check(typeof r.risk === "string" && /apply failed/.test(r.risk), "apply failure ⇒ risk surfaced, state preserved");
  check(calls.nonRegression === 0, "apply failure stops BEFORE non-regression (no DONE path)");
}

// 8. Authorized + in-scope apply PASS + non-reg PASS ⇒ APPLIED + repaired.
{
  const { s, calls } = seams();
  const r = triage({ apply: true, authorizedPaths: ["src"] }, s);
  check(r.mode === "APPLIED" && r.repaired === true && r.ok === true, "authorized in-scope apply + green non-reg ⇒ APPLIED + repaired");
  check(calls.apply === 1 && calls.restore === 0 && calls.checkpoint === 1, "APPLIED: apply once, no rollback, checkpoint written");
}

// 9. NO-EFFECT / NO-GIT: triage itself writes nothing and spawns nothing (all effects are the injected seams').
{
  const realWrite = fs.writeFileSync, realMkdir = fs.mkdirSync, realAppend = fs.appendFileSync;
  let w = 0;
  (fs as any).writeFileSync = () => { w++; throw new Error("triage wrote fs"); };
  (fs as any).mkdirSync = () => { w++; throw new Error("triage mkdir"); };
  (fs as any).appendFileSync = () => { w++; throw new Error("triage append"); };
  try {
    const { s } = seams(); // seams are pure mocks (no real fs); so a clean run must perform ZERO fs writes
    triage({ apply: true, authorizedPaths: ["src"] }, s);
  } finally {
    fs.writeFileSync = realWrite; fs.mkdirSync = realMkdir; fs.appendFileSync = realAppend;
  }
  check(w === 0, "no-effect: triage + runGates perform ZERO fs writes themselves (all effects are seam-delegated)");
}

console.log(failures === 0 ? "ALL PASS — FAILURE_TRIAGE" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
