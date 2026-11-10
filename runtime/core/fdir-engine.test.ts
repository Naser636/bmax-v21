#!/usr/bin/env node
"use strict";
const F = require("./fdir-engine");
let failures = 0; function check(c: any, l: any): void { if (!c) { failures++; process.stderr.write("FAIL: " + l + "\n"); } }
const allow = { canRecover: true }; const okRecover = () => ({ ok: true, stateRef: "s" }); const okVerify = () => ({ ok: true });

// (1) nominal ⇒ no fault.
check(F.runFdir({ nominal: true }).status === "NOMINAL", "nominal signal ⇒ NOMINAL");
// (2) UNKNOWN fault ⇒ never benign ⇒ SAFE_MODE, not operational (invariant 2).
{
  const r = F.runFdir({ type: "WEIRD" }, { permissions: allow, recover: okRecover, verify: okVerify });
  check(r.status === "SAFE_MODE" && r.operational === false, "UNKNOWN fault ⇒ SAFE_MODE, NOT operational (never benign)");
}
// (3) a garbled/null signal ⇒ treated as a fault (never 'no fault').
check(F.detectFault(null).detected === true && F.detectFault(null).type === "UNKNOWN", "null signal ⇒ a fault (UNKNOWN), never dropped");
// (4) data corruption / incoherent state WITHOUT a verified reference ⇒ SAFE_MODE (no rollback without reference, invariant 4).
{
  const r = F.runFdir({ type: "DATA_CORRUPTION" }, { permissions: allow, ctx: { hasVerifiedReference: false }, recover: okRecover, verify: okVerify });
  check(r.status === "SAFE_MODE" && r.operational === false, "corruption without a verified reference ⇒ SAFE_MODE (no rollback without reference)");
}
// (5) incoherent state WITH a verified reference ⇒ VERIFIED_ROLLBACK, and PASS only on independent verify.
{
  const r = F.runFdir({ type: "STATE_INCOHERENCE" }, { permissions: allow, ctx: { hasVerifiedReference: true }, recover: () => ({ ok: true, stateRef: "ref" }), verify: okVerify });
  check(r.status === "RECOVERED" && r.verified === true && r.operational === true, "incoherent + verified reference + independent verify ⇒ RECOVERED/operational");
}
// (6) CRITICAL severity ⇒ ESCALATE regardless (RPN alone never decides, invariant).
{
  const r = F.runFdir({ type: "CONTRACT_ERROR", severity: 9 }, { permissions: allow, recover: okRecover, verify: okVerify });
  check(r.status === "ESCALATE" && r.operational === false, "CRITICAL severity ⇒ ESCALATE (not auto-recovered)");
}
// (7) recovery WITHOUT permission ⇒ ESCALATED, not operational (invariant 6/7).
{
  const r = F.runFdir({ type: "TIMEOUT" }, { permissions: { canRecover: false }, recover: okRecover, verify: okVerify });
  check(r.status === "ESCALATED" && r.operational === false, "recovery without permission ⇒ ESCALATED, NOT operational");
}
// (8) THE KEY FALSIFICATION — a recovery that executes but FAILS independent verify ⇒ NOT operational (no false success).
{
  const r = F.runFdir({ type: "TIMEOUT" }, { permissions: allow, recover: okRecover, verify: () => ({ ok: false }) });
  check(r.status === "UNVERIFIED" && r.recovered === false && r.operational === false, "recovery not independently verified ⇒ UNVERIFIED, NOT operational (0 false success)");
}
// (9) transient ⇒ BOUNDED retry (never unbounded).
check(F.decideRecovery({ class: "TRANSIENT", severity: 4 }, { maxRetries: 100 }).maxRetries <= 5, "retry is BOUNDED (clamped), never unbounded");
// (10) a persistent / repeated failure ⇒ circuit-break (stop retrying).
check(F.decideRecovery({ class: "PERSISTENT", severity: 5 }).action === "CIRCUIT_BREAK", "persistent failure ⇒ CIRCUIT_BREAK");
// (11) every run is traceable (a trail with the cycle steps).
{
  const r = F.runFdir({ type: "TIMEOUT" }, { permissions: allow, recover: okRecover, verify: okVerify });
  check(r.trail.some((t: any) => t.step === "DETECT") && r.trail.some((t: any) => t.step === "VERIFY"), "the FDIR cycle is fully traceable");
}
// (12) MEASURES over the mandatory scenario set: 0 silent loss (every fault produced an outcome), 0 false success.
{
  const scenarios = [{ type: "SERVICE_DOWN" }, { type: "TIMEOUT" }, { type: "DATA_CORRUPTION" }, { type: "STATE_INCOHERENCE" }, { type: "REPEATED_FAILURE" }, { type: "CONTRACT_ERROR", severity: 9 }, { type: "RESOURCE_ANOMALY" }, { type: "WEIRD" }, null];
  const outcomes = scenarios.map((s) => F.runFdir(s, { permissions: allow, ctx: {}, recover: okRecover, verify: okVerify }));
  const silentLoss = outcomes.filter((o: any) => o.status === undefined).length;
  const falseSuccess = outcomes.filter((o: any) => o.operational === true && o.verified !== true).length;   // operational without verify = false success
  check(silentLoss === 0, "0 silent loss — every injected fault produced a traceable outcome");
  check(falseSuccess === 0, "0 false success — no outcome is operational without independent verification");
}
check(/UNKNOWN fault is NEVER classified benign/i.test(JSON.stringify(F.FDIR_ENGINE_CONTRACT.invariants)), "contract: UNKNOWN never benign");
if (failures === 0) process.stdout.write("ALL PASS — V12.4 FDIR ENGINE\n");
process.exit(failures === 0 ? 0 : 1);
export {};
