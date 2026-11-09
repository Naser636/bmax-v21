#!/usr/bin/env node
"use strict";
const B = require("./l4-engineering-benchmark");
let failures = 0; function check(c: any, l: any): void { if (!c) { failures++; process.stderr.write("FAIL: " + l + "\n"); } }
const r = B.runBenchmark();
// mandatory per-case verdicts.
const v = (id: string) => (r.results.find((x: any) => x.id === id) || {}).verdict;
check(v("simple-correct") === "ACCEPT" && v("complex-with-deps") === "ACCEPT", "correct fixes ACCEPTED (independent test + write-set)");
check(v("regression-bad-fix") === "REJECT", "a regression-causing fix is REJECTED by the independent test");
check(v("partial-fix") === "REJECT", "a partial fix not satisfying the contract is REJECTED");
check(v("out-of-write-set") === "REJECT" && r.measures.writeSetViolationsBlocked >= 1, "an out-of-write-set edit is REJECTED (real write-set guard)");
check(v("passes-initial-fails-independent") === "REJECT", "a fix passing the initial check but failing the independent test is REJECTED (false success caught)");
check(v("unresolved-recognized") === "UNRESOLVED", "an unresolvable defect is recognized (not a false success)");
// the load-bearing measure: NO bad fix was accepted.
check(r.measures.falseSuccessSurvived === 0, "false-success-survived MUST be 0 — the governance caught every bad fix");
check(r.measures.verdictAccuracy === 1 && r.excluded === 1, "verdict accuracy 1.0 with the unresolved case excluded from the accept denominator");
check(/false success caught|false-success-survived MUST be 0/i.test(JSON.stringify(B.L4_ENGINEERING_BENCHMARK_CONTRACT.invariants)), "contract: false success caught");
if (failures === 0) process.stdout.write("ALL PASS — V12.4 L4 ENGINEERING BENCHMARK\n");
process.exit(failures === 0 ? 0 : 1);
export {};
