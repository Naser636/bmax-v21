#!/usr/bin/env node
"use strict";
/* V139 — fault-injection REGRESSION. Re-derives the whole matrix from the REAL fdir-engine via the runner's runScenarios()
 * (not a stored flag) and locks that every one of the 10 named fault scenarios + the unpermitted/unverified cases holds its
 * SAFETY INVARIANT, AND that recovery evidence is tamper-evident. A regression in fdir-engine's fail-closed logic (e.g. a
 * failed restore wrongly declared operational, or a lost permission/verify gate) flips a scenario and fails this suite. */
const RUN = require("../bin/odg-v139-fault-injection-run.ts");
let failures = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) failures++; }

function main() {
  const { results, evidenceIntegrity, summary } = RUN.runScenarios();

  check("all 12 fault scenarios present", results.length === 12 && summary.scenarios === 12);
  check("EVERY scenario holds its SAFETY INVARIANT (allSafe)", summary.safetyHeld === 12 && summary.allSafe === true);

  const by = Object.fromEntries(results.map((r: any) => [r.id, r]));
  // the load-bearing FAIL-CLOSED properties, checked individually (these are the ones a regression would silently break):
  check("failed-backup-restoration ⇒ RECOVERY_FAILED and NOT operational (critical: a failed restore is never operational)", by["failed-backup-restoration"].status === "RECOVERY_FAILED" && by["failed-backup-restoration"].operational === false);
  check("repeated-recovery-failure ⇒ RECOVERY_FAILED, NOT operational (no unbounded recovery loop)", by["repeated-recovery-failure"].status === "RECOVERY_FAILED" && by["repeated-recovery-failure"].operational === false);
  check("unpermitted-recovery ⇒ ESCALATED, NOT operational (no self-authorized recovery)", by["unpermitted-recovery"].status === "ESCALATED" && by["unpermitted-recovery"].operational === false);
  check("unverified-recovery ⇒ UNVERIFIED, NOT operational (independent verify is the sole arbiter)", by["unverified-recovery"].status === "UNVERIFIED" && by["unverified-recovery"].operational === false);
  check("partial-execution (no verified reference) ⇒ SAFE_MODE, NOT operational (no blind rollback)", by["partial-execution"].status === "SAFE_MODE" && by["partial-execution"].operational === false);
  check("stale/corrupted evidence ⇒ VERIFIED_ROLLBACK to a verified reference (corrupt data never trusted)", by["stale-corrupted-evidence"].action === "VERIFIED_ROLLBACK" && by["stale-corrupted-evidence"].operational === true);
  check("persistent faults (repeated-failure / restart-storm) ⇒ bounded CIRCUIT_BREAK (never unbounded retry)", by["repeated-recovery-failure"].action === "CIRCUIT_BREAK" && by["restart-storm"].action === "CIRCUIT_BREAK");
  check("recoverable faults RECOVER only after an independent verify (disk/provider/timeout/network operational)", ["disk-exhaustion", "provider-outage", "model-timeout", "network-interruption"].every((id) => by[id].status === "RECOVERED" && by[id].operational === true));

  // evidence integrity — recovery trail sealed in the tamper-evident chain: intact verifies, ANY tamper is detected.
  check("recovery evidence is tamper-evident: intact chain verifies AND a tampered entry is DETECTED", evidenceIntegrity.sealed >= 3 && evidenceIntegrity.intactVerified === true && evidenceIntegrity.tamperDetected === true);

  process.stdout.write("\n" + (failures === 0 ? "ALL PASS — V139 resilience: 12 fault scenarios fail-closed (failed restore / unpermitted / unverified NEVER operational; persistent ⇒ bounded breaker; tamper-evident recovery evidence)" : failures + " FAIL") + "\n");
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
