#!/usr/bin/env node
"use strict";

/*
 * WI-SCN-11 — engineering-chain scenario. Drives the §5 governed chain over a synthetic defect and locks every
 * governed outcome: ACCEPTED (happy path), REFUSED (non-ODG authority), GATED (D4 consequential, boundary
 * simulated), FAILED (provider error), ABSTAINED (timeout), REFUSED (missing/non-independent evidence), NONE
 * (no defect). Also locks: cycle is resumable after a GATE (no lost decisions, §16) and determinism.
 * Run: node_modules/.bin/tsx runtime/core/engineering-chain-scenario.test.ts
 */
const assert = require("assert");
const S = require("./engineering-chain-scenario");

let failures = 0;
function check(c: any, label: any) { if (c) { console.log("  ok -", label); } else { failures++; console.log("  FAIL", label); } assert.ok(c, label); }

console.log("WI-SCN-11 — ENGINEERING-CHAIN SCENARIO");

// A synthetic defect inventory: capX is needed, declared but not implemented ⇒ discovery finds a gap.
const defectInv = [{ id: "capX", need: true, declared: true, implemented: false }];
const okProvider = { name: "prov1", verifier: "odg-verifier", result: "patched", evidence: ["test-green", "diff"] };

// Happy path: ODG authority + independent evidence ⇒ ACCEPTED, full 11-step trace reaching IMPROVE.
{
  const r = S.runScenario({ inventory: defectInv, authority: "ODG", provider: okProvider });
  check(r.verdict === "ACCEPTED", "happy path ⇒ ACCEPTED");
  check(r.steps.find((t: any) => t.step === "decide").status === "ACCEPTED", "decide step = ACCEPTED");
  check(r.cycle.stage === "IMPROVE" && r.cycle.counts.decisions >= 2 && r.cycle.counts.evidence >= 2, "cycle reached IMPROVE with decisions+evidence recorded");
}
// Non-ODG authority ⇒ REFUSED (escalate), stops at authorize, cycle resumable.
{
  const r = S.runScenario({ inventory: defectInv, authority: "claude-code", provider: okProvider });
  check(r.verdict === "REFUSED" && r.steps.find((t: any) => t.step === "authorize").status === "REFUSED", "non-ODG authority ⇒ REFUSED/ESCALATE");
  check(r.resumable === true, "refused run leaves a resumable cycle");
}
// D4 consequential ⇒ GATED (owner boundary simulated, not executed), resumable with decisions preserved.
{
  const r = S.runScenario({ inventory: defectInv, authority: "ODG", consequential: true, provider: okProvider });
  check(r.verdict === "GATED" && r.steps.find((t: any) => t.step === "authorize").status === "GATED", "consequential ⇒ GATED (D4, simulated boundary)");
  check(r.resumable === true && r.cycle.counts.decisions >= 1, "gated run is RESUMABLE with no lost decisions (§16)");
  check(!r.steps.find((t: any) => t.step === "delegate+recover"), "GATED never reaches delegation (not executed)");
}
// Provider error ⇒ FAILED; timeout ⇒ ABSTAINED.
check(S.runScenario({ inventory: defectInv, authority: "ODG", provider: { name: "p", verifier: "v", inject: "error" } }).verdict === "FAILED", "provider error ⇒ FAILED");
check(S.runScenario({ inventory: defectInv, authority: "ODG", provider: { name: "p", verifier: "v", inject: "timeout" } }).verdict === "ABSTAINED", "provider timeout ⇒ ABSTAINED (no false success)");
// Missing evidence ⇒ REFUSED; non-independent verifier (verifier==producer) ⇒ REFUSED (capture).
check(S.runScenario({ inventory: defectInv, authority: "ODG", provider: { name: "p", verifier: "v", result: "x", inject: "missing-evidence" } }).verdict === "REFUSED", "missing evidence ⇒ REFUSED");
{
  const r = S.runScenario({ inventory: defectInv, authority: "ODG", provider: { name: "same", verifier: "same", result: "x", evidence: ["e"] } });
  check(r.verdict === "REFUSED" && r.steps.find((t: any) => t.step === "verify").status === "FAIL", "verifier == producer (capture) ⇒ verify FAIL ⇒ REFUSED");
}
// No defect ⇒ NONE.
check(S.runScenario({ inventory: [{ id: "ok", verified: true }], authority: "ODG" }).verdict === "NONE", "no discovered defect ⇒ NONE");

// Determinism.
check(JSON.stringify(S.runScenario({ inventory: defectInv, authority: "ODG", provider: okProvider })) === JSON.stringify(S.runScenario({ inventory: defectInv, authority: "ODG", provider: okProvider })), "deterministic: identical spec ⇒ identical verdict+trace+cycle");

console.log(failures === 0 ? "ALL PASS — WI-SCN-11 ENGINEERING-CHAIN SCENARIO" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);

// Module-scope marker (TS2451/TS2588 guard).
export {};
