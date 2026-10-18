#!/usr/bin/env node
// @ts-nocheck — L5 bulk test migration (runtime/core): runs under tsx unchanged; suppresses tsc
// typechecking (NOT strict typing) — recorded migration debt (type later). See ODG_PROJECT_STATE.md.
"use strict";
/*
 * SCRIPTS DUAL-PORT PARITY (CTO L6, Wave-3 tail) — tsx-run utility scripts: odg-autonomy-benchmark,
 * runtime-identity-check. Unlike the bin CLIs (compiled to dist/bin, run via the odg wrapper), these run
 * via tsx directly, so their dual-port is: TS SOURCE (scripts/X.ts, tsx-run) + JS rollback (scripts/X.js,
 * ODG_RUNTIME=js), no dist step. This suite runs under tsx, so it requires BOTH ports (the .ts via tsx's
 * require hook and the .js rollback) and asserts the exported decision logic is byte-identical. The
 * environment-touching gatherLive (systemctl/proc/curl) is NOT invoked — only the PURE, deterministic
 * exported logic is compared (that is what the migration must preserve).
 */
const assert = require("assert");
const path = require("path");
const REPO = path.resolve(__dirname, "..", "..");
let passed = 0;
function ok(name, cond) { assert.ok(cond, name); console.log("  ok -", name); passed++; }
const load = (rel) => require(path.join(REPO, rel));
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ===== odg-autonomy-benchmark: deterministic benchmark (reuses autonomy-measure) =====
{
  const js = load("scripts/odg-autonomy-benchmark.js"), ts = load("scripts/odg-autonomy-benchmark.ts");
  ok("benchmark: same export API", eq(Object.keys(js).sort(), Object.keys(ts).sort()));
  ok("benchmark: BENCHMARK_VERSION + SCENARIOS identical", js.BENCHMARK_VERSION === ts.BENCHMARK_VERSION && eq(js.SCENARIOS, ts.SCENARIOS));
  ok("benchmark: provenance(SCENARIOS) identical (sha256 of frozen input)", js.provenance(js.SCENARIOS) === ts.provenance(ts.SCENARIOS));
  const rj = js.runBenchmark(), rt = ts.runBenchmark();
  ok("benchmark: runBenchmark() byte-identical (deterministic, offline)", eq(rj, rt));
  ok("benchmark: non-vacuous (measurable, 9 scenarios, numerator/denominator present)",
    rj.scenarioCount === 9 && rj.result && typeof rj.result.autonomyPercent === "number" && rj.result.denominator > 0);
}

// ===== runtime-identity-check: pure drift verdict + exit-code mapping =====
{
  const js = load("scripts/runtime-identity-check.js"), ts = load("scripts/runtime-identity-check.ts");
  ok("identity: same export API", eq(Object.keys(js).sort(), Object.keys(ts).sort()));
  const cases = [
    { onDiskBuildId: "A", standaloneBuildId: "A", runningCwd: "/srv/app", servedBuildId: "A" },           // CONSISTENT
    { onDiskBuildId: "A", standaloneBuildId: "B", runningCwd: "/srv/app", servedBuildId: null },           // DRIFT (on-disk)
    { onDiskBuildId: "A", standaloneBuildId: "A", runningCwd: "/srv/app/.next/standalone (deleted)", servedBuildId: null }, // DRIFT (deleted inode)
    { onDiskBuildId: "A", standaloneBuildId: "A", runningCwd: "/srv/app", servedBuildId: "Z" },            // DRIFT (served != disk)
    { onDiskBuildId: null, standaloneBuildId: null, runningCwd: null, servedBuildId: null },               // UNKNOWN
    { onDiskBuildId: "A", standaloneBuildId: "A", runningCwd: null, servedBuildId: null },                 // UNKNOWN (cwd unobservable)
  ];
  for (const c of cases) {
    const vj = js.identityVerdict(c), vt = ts.identityVerdict(c);
    ok(`identity.identityVerdict parity — ${JSON.stringify(c).slice(0, 40)}…`, eq(vj, vt));
  }
  for (const s of ["CONSISTENT", "DRIFT", "UNKNOWN", "WHATEVER"]) ok(`identity.exitCodeFor parity — ${s}`, js.exitCodeFor(s) === ts.exitCodeFor(s));
  ok("identity non-vacuous (CONSISTENT=0, DRIFT=3, UNKNOWN=2; verdicts distinguish the 3 drift classes)",
    js.exitCodeFor("CONSISTENT") === 0 && js.exitCodeFor("DRIFT") === 3 && js.exitCodeFor("UNKNOWN") === 2 &&
    js.identityVerdict(cases[1]).status === "DRIFT" && js.identityVerdict(cases[0]).status === "CONSISTENT" && js.identityVerdict(cases[4]).status === "UNKNOWN");
}

console.log(`\nscripts dual-port parity — ${passed} assertions passed.`);
