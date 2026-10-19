/*
 * deriveRunAttempt (Phase 3, Lot A) — honest outcome derivation for the odg-run.js autonomy-loop route.
 * RECORDED only on validated SUCCESS; absent report ⇒ UNVERIFIED (no false success); non-zero exit ⇒
 * INTERRUPTED (signal) / VALIDATION_BLOCKED (governed) / FAILED. Pure; no fs/network.
 *
 * Run: node_modules/.bin/tsx src/runtime/derive-run-attempt.test.ts
 */
import { deriveRunAttempt } from "./ledger-record-adapter";

let failures = 0;
function check(c: boolean, label: string): void { if (c) { console.log(`  PASS ${label}`); } else { failures++; console.log(`  FAIL ${label}`); } }

console.log("deriveRunAttempt — honest pipeline outcome");

// clean exit + validated SUCCESS ⇒ RECORDED
let o = deriveRunAttempt(true, { reportValidated: true, reportStatus: "SUCCESS" });
check(o.validated === true && o.status === "SUCCESS", "validated SUCCESS ⇒ RECORDED");

// clean exit but report NOT validated ⇒ not a success (honest status)
o = deriveRunAttempt(true, { reportValidated: false, reportStatus: "BLOCKED" });
check(o.validated === false && o.status === "BLOCKED", "clean exit + BLOCKED report ⇒ not validated, status BLOCKED");

// clean exit but NO report ⇒ UNVERIFIED (never a fabricated success)
o = deriveRunAttempt(true, {});
check(o.validated === false && o.status === "UNVERIFIED", "clean exit + absent report ⇒ UNVERIFIED (no false success)");

// clean exit, validated true but status not SUCCESS ⇒ not validated (both conditions required)
o = deriveRunAttempt(true, { reportValidated: true, reportStatus: "PARTIAL" });
check(o.validated === false && o.status === "PARTIAL", "validated:true but status!=SUCCESS ⇒ not validated");

// non-zero exit + signal ⇒ INTERRUPTED
o = deriveRunAttempt(false, { signal: "SIGTERM" });
check(o.validated === false && o.status === "INTERRUPTED", "signal ⇒ INTERRUPTED");

// non-zero exit + governed validation block ⇒ VALIDATION_BLOCKED
o = deriveRunAttempt(false, { governedBlock: true });
check(o.validated === false && o.status === "VALIDATION_BLOCKED", "governed block ⇒ VALIDATION_BLOCKED");

// non-zero exit, no signal, not governed ⇒ FAILED
o = deriveRunAttempt(false, {});
check(o.validated === false && o.status === "FAILED", "plain non-zero exit ⇒ FAILED");

console.log(failures ? `\n${failures} FAILURE(S)` : "\nALL PASS — deriveRunAttempt");
if (failures) process.exit(1);
