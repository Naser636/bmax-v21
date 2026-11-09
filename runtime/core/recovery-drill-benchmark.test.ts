#!/usr/bin/env node
"use strict";
const R = require("./recovery-drill-benchmark");
let failures = 0; function check(c: any, l: any): void { if (!c) { failures++; process.stderr.write("FAIL: " + l + "\n"); } }
const s = R.runDrillSuite();
check(s.measures.corruptDetected === true, "a corrupt checkpoint is DETECTED ⇒ recovery refused");
check(s.measures.resumeIdempotentAll === true, "resume is idempotent");
check(s.measures.rollbackIdempotentAll === true, "rollback is idempotent");
check(s.measures.restoredMatchesReference === true, "restored state matches the INDEPENDENT reference (not a self-report)");
check(s.measures.refusesWhenNotRecoverable === true, "refuses safely when not recoverable (no checkpoint / corrupt)");
check(s.measures.silentLosses === 0, "no silent loss");
// falsification: a tampered checkpoint must fail verification.
const cp = R.checkpoint({ value: 1 }); const bad = JSON.parse(JSON.stringify(cp)); bad.state.value = 999;
check(R.verifyCheckpoint(bad).ok === false && R.resume(bad).ok === false, "tampered checkpoint ⇒ verify fails ⇒ resume REFUSES (fail-closed)");
check(R.resume(null).ok === false, "no checkpoint ⇒ resume REFUSES");
if (failures === 0) process.stdout.write("ALL PASS — V12.4 RECOVERY DRILL\n");
process.exit(failures === 0 ? 0 : 1);
export {};
